import os
import tempfile

from supports.authorizedClient_support import open_authorized_client

from app import create_app
from app.settings.serviceSettings_setting import Settings


class StubProvider:
    name = "stub"

    def __init__(self, reply="stub reply", fail_with=None):
        self._reply = reply
        self._fail = fail_with
        self.seen = []

    async def complete(self, messages, model=None):
        self.seen = messages
        if self._fail:
            raise self._fail
        return self._reply

    async def complete_stream(self, messages, model=None):
        self.seen = messages
        if self._fail:
            raise self._fail
        yield self._reply

    async def list_models(self):
        if self._fail:
            raise self._fail
        return ["stub-1"]

    def describe(self):
        return {"name": self.name, "configured": True, "model": "stub-model"}


def build_client_with_provider(stub):
    db_folder = tempfile.mkdtemp(prefix="owl-chat-test-")
    settings = Settings(
        step_delay=0.01, db_path=os.path.join(db_folder, "t.db"), _env_file=None, nvidia_api_key=""
    )
    app = create_app(settings)
    app.state.provider = stub
    return open_authorized_client(app)


def test_verify_ok_with_working_provider():
    with build_client_with_provider(StubProvider()) as client:
        res = client.post("/provider/verify")
        assert res.status_code == 200
        body = res.json()
        assert body == {
            "ok": True,
            "provider": "stub",
            "model": "stub-model",
            "error": "",
            "code": "",
        }


def test_verify_reports_unconfigured(tmp_path):
    from app import create_app as fresh
    from app.settings.serviceSettings_setting import Settings

    settings = Settings(
        step_delay=0.01, db_path=str(tmp_path / "t.db"), _env_file=None, nvidia_api_key=""
    )
    with open_authorized_client(fresh(settings)) as client:
        res = client.post("/provider/verify")
        assert res.json()["ok"] is True
        assert res.json()["provider"] == "mock"


def test_verify_reports_failing_provider():
    from app.llms.providers.providerError_provider import ProviderNetworkError

    with build_client_with_provider(StubProvider(fail_with=ProviderNetworkError("down"))) as client:
        res = client.post("/provider/verify")
        assert res.json()["ok"] is False
        assert res.json()["code"] == "unavailable"


def test_chat_sends_history_and_returns_reply():
    stub = StubProvider(reply="hello there")
    with build_client_with_provider(stub) as client:
        res = client.post(
            "/chat",
            json={
                "messages": [
                    {"role": "user", "content": "first"},
                    {"role": "assistant", "content": "second"},
                    {"role": "user", "content": "third"},
                ]
            },
        )
        assert res.status_code == 200
        body = res.json()
        assert body["reply"] == "hello there"
        assert body["model"] == "nvidia/llama-3.1-nemotron-70b-instruct"
        assert body["routing"]
        assert body["usage"]["estimated"] is True
        assert [m["content"] for m in stub.seen] == ["first", "second", "third"]


def test_chat_validation():
    with build_client_with_provider(StubProvider()) as client:
        assert client.post("/chat", json={"messages": []}).status_code == 422
        big = [{"role": "user", "content": "x"} for _ in range(21)]
        assert client.post("/chat", json={"messages": big}).status_code == 422
        assert (
            client.post("/chat", json={"messages": [{"role": "user", "content": ""}]}).status_code
            == 422
        )


def test_chat_stream_emits_deltas_and_done():
    stub = StubProvider(reply="streamed text")
    with build_client_with_provider(stub) as client:
        with client.stream(
            "POST", "/chat/stream", json={"messages": [{"role": "user", "content": "hi"}]}
        ) as stream:
            assert stream.status_code == 200
            body = stream.read().decode()
    assert "event: chat.delta" in body
    assert "event: chat.done" in body
    assert "streamed text" in body


def test_chat_stream_error_event_on_failure():
    from app.llms.providers.providerError_provider import ProviderTimeoutError

    stub = StubProvider(fail_with=ProviderTimeoutError("slow"))
    with build_client_with_provider(stub) as client:
        with client.stream(
            "POST", "/chat/stream", json={"messages": [{"role": "user", "content": "hi"}]}
        ) as stream:
            body = stream.read().decode()
    assert "event: chat.error" in body
