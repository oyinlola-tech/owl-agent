import httpx
import pytest

from app.llms.connections.localDiscovery_connection import (
    discover_local_runners,
    probe_local_runner,
)


def build_transport(running_ports):
    def handler(request):
        if request.url.port not in running_ports:
            raise httpx.ConnectError("refused", request=request)
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "llama3:8b"}]})
        return httpx.Response(200, json={"data": [{"id": "qwen2.5-coder"}]})

    return httpx.MockTransport(handler)


@pytest.mark.anyio
async def test_discovery_reports_running_and_stopped_runners():
    runners = await discover_local_runners({}, build_transport({11434}))
    by_id = {r["id"]: r for r in runners}
    assert set(by_id) == {"ollama", "lmstudio", "llamacpp"}
    assert by_id["ollama"]["running"] is True
    assert by_id["ollama"]["models"] == ["llama3:8b", "qwen2.5-coder"]
    assert by_id["lmstudio"]["running"] is False
    assert "isn't running" in by_id["lmstudio"]["error"]
    assert by_id["lmstudio"]["how_to"]


@pytest.mark.anyio
async def test_discovery_never_probes_remote_hosts():
    def handler(request):
        raise AssertionError("remote host probed")

    result = await probe_local_runner(
        "llamacpp", "https://example.com/v1", httpx.MockTransport(handler)
    )
    assert result["running"] is False
    assert "this computer" in result["error"]
