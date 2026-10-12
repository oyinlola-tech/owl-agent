import os

import pytest
from fastapi.testclient import TestClient

from app import create_app
from app.settings.serviceSettings_setting import Settings

FUZZ_DEV_TOKEN = "fuzz-dev-token-0123456789abcdef"
FUZZ_BASE_URL = "http://127.0.0.1:8000"


@pytest.fixture(scope="session")
def fuzz_token(fuzz_app) -> str:
    return os.environ["OWL_DEV_TOKEN"]


@pytest.fixture(scope="session")
def fuzz_app(tmp_path_factory):
    previous = {k: os.environ.get(k) for k in ("OWL_DEV_TOKEN", "OWL_SERVICE_TOKEN")}
    os.environ["OWL_DEV_TOKEN"] = FUZZ_DEV_TOKEN
    os.environ.pop("OWL_SERVICE_TOKEN", None)
    root = tmp_path_factory.mktemp("fuzz")
    workspace = root / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("fuzz workspace\n")
    settings = Settings(
        _env_file=None,
        db_path=str(root / "fuzz.db"),
        workspaces=str(workspace),
        nvidia_api_key="",
        step_delay=0.01,
        require_token=False,
    )
    app = create_app(settings)
    app.state.browser = None
    try:
        yield app
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


@pytest.fixture(scope="session")
def fuzz_client(fuzz_app):
    with TestClient(fuzz_app, base_url=FUZZ_BASE_URL) as client:
        yield client


@pytest.fixture(scope="session")
def owl_schema(fuzz_app):
    schemathesis = pytest.importorskip("schemathesis")
    schema = schemathesis.openapi.from_dict(fuzz_app.openapi())
    return schema.exclude(path_regex=r".*/events$")
