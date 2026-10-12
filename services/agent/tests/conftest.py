import os
import socket
import subprocess
import sys
import tempfile
import time

import httpx
import pytest
from supports.authorizedClient_support import LIVE_SERVER_TOKEN, open_authorized_client

from app import create_app
from app.settings.serviceSettings_setting import Settings

AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ["GIT_TEMPLATE_DIR"] = tempfile.mkdtemp(prefix="owl-test-git-template-")
# Security: tests never touch the real system keychain; keys go to a temp data dir file.
os.environ["OWL_SECRET_STORE"] = "file"


@pytest.fixture()
def db_file(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture()
def fast_settings(db_file) -> Settings:
    return Settings(
        step_delay=0.01, db_path=db_file, _env_file=None, nvidia_api_key="", provider="mock"
    )


@pytest.fixture()
def client(fast_settings: Settings):
    with open_authorized_client(create_app(fast_settings)) as c:
        yield c


@pytest.fixture()
def slow_settings(db_file) -> Settings:
    return Settings(
        step_delay=5.0, db_path=db_file, _env_file=None, nvidia_api_key="", provider="mock"
    )


@pytest.fixture()
def slow_client(slow_settings: Settings):
    with open_authorized_client(create_app(slow_settings)) as c:
        yield c


@pytest.fixture(scope="module")
def live_server(tmp_path_factory):
    db = str(tmp_path_factory.mktemp("live") / "live.db")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = dict(
        os.environ,
        OWL_STEP_DELAY="0.05",
        OWL_DB_PATH=db,
        NVIDIA_API_KEY="",
        OWL_NVIDIA_API_KEY="",
        OWL_SERVICE_TOKEN=LIVE_SERVER_TOKEN,
        OWL_PROVIDER="mock",
    )
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "--factory", "app:create_app", "--port", str(port)],
        cwd=AGENT_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            try:
                if httpx.get(f"{base}/health", timeout=1.0).status_code == 200:
                    break
            except httpx.ConnectError:
                time.sleep(0.1)
        else:
            raise AssertionError("live server never came up")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)
