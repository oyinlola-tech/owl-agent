import json
import logging
from types import SimpleNamespace

import httpx
import keyring.core
from keyring.backend import KeyringBackend

from app import create_app
from app.settings.serviceSettings_setting import Settings

from .authorizedClient_support import open_authorized_client

SECRET_KEY = "sk-test-SECRETKEY-0123456789abcdef"


class MemoryKeyring(KeyringBackend):
    priority = 10

    def __init__(self):
        super().__init__()
        self.store = {}

    def get_password(self, service, username):
        return self.store.get((service, username))

    def set_password(self, service, username, password):
        self.store[(service, username)] = password

    def delete_password(self, service, username):
        self.store.pop((service, username), None)


def install_memory_keyring(monkeypatch) -> MemoryKeyring:
    backend = MemoryKeyring()
    monkeypatch.setattr(keyring.core, "_keyring_backend", backend)
    return backend


class LogCapture(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.lines = []

    def emit(self, record):
        self.lines.append(record.getMessage())

    def __enter__(self):
        logging.getLogger().addHandler(self)
        logging.getLogger("owl").setLevel(logging.DEBUG)
        return self

    def __exit__(self, *exc):
        logging.getLogger().removeHandler(self)


def build_text_message(text="hello", stop_reason="end_turn", category=None, usage=(12, 5)):
    details = SimpleNamespace(type="refusal", category=category) if category else None
    return SimpleNamespace(
        content=[
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text=text),
        ],
        stop_reason=stop_reason,
        stop_details=details,
        usage=SimpleNamespace(input_tokens=usage[0], output_tokens=usage[1]),
    )


class FakeStream:
    def __init__(self, texts, final):
        self.texts = texts
        self.final = final

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def text_stream(self):
        async def generate():
            for text in self.texts:
                yield text

        return generate()

    async def get_final_message(self):
        return self.final


class FakeAnthropicClient:
    def __init__(self, response=None, error=None, stream_texts=("hel", "lo"), models=()):
        self.calls = []
        self.response = response or build_text_message()
        self.error = error
        self.stream_texts = stream_texts
        self.model_ids = list(models) or ["claude-opus-5-5", "claude-sonnet-5-5"]
        self.beta = SimpleNamespace(
            messages=SimpleNamespace(create=self.create, stream=self.stream)
        )
        self.models = SimpleNamespace(list=self.list_models)

    async def create(self, **params):
        self.calls.append(("create", params))
        if self.error:
            raise self.error
        return self.response

    def stream(self, **params):
        self.calls.append(("stream", params))
        if self.error:
            raise self.error
        return FakeStream(self.stream_texts, self.response)

    def list_models(self):
        self.calls.append(("models", {}))
        if self.error:
            raise self.error
        ids = self.model_ids

        async def iterate():
            for model_id in ids:
                yield SimpleNamespace(id=model_id)

        return iterate()


def build_cloud_transport(status=200, seen=None):
    def handler(request):
        if seen is not None:
            seen.append(request)
        if status != 200:
            return httpx.Response(status, json={"error": f"bad key {SECRET_KEY}"})
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "m-b"}, {"id": "m-a"}]})
        reply = {
            "choices": [{"message": {"content": "cloud reply"}}],
            "usage": {"prompt_tokens": 4, "completion_tokens": 2},
        }
        return httpx.Response(200, json=reply)

    return httpx.MockTransport(handler)


def build_provider_client(tmp_path, transport=None, anthropic=None, **overrides):
    params = {
        "step_delay": 0.01,
        "db_path": str(tmp_path / "t.db"),
        "_env_file": None,
        "nvidia_api_key": "",
        "provider": "",
        "secret_store": "file",
    }
    params.update(overrides)
    app = create_app(Settings(**params))
    setup = app.state.provider_setup
    setup.transport = transport or build_cloud_transport()
    fake = anthropic or FakeAnthropicClient()
    setup.anthropic_client_factory = lambda key: fake
    return open_authorized_client(app)


def assert_no_secret(*payloads):
    for payload in payloads:
        text = payload if isinstance(payload, str) else json.dumps(payload)
        assert SECRET_KEY not in text
