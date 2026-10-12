from app.llms.providers.baseProvider_provider import ModelProvider


class FakeRankingProvider(ModelProvider):
    name = "fake"

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.calls = 0

    async def complete(self, messages, model=None):
        self.calls += 1
        return self.reply

    def describe(self):
        return {"name": self.name, "configured": True, "model": "fake-1"}


def test_browse_stacks_returns_catalog(client):
    res = client.get("/stacks")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == len(body["stacks"]) > 20
    entry = body["stacks"][0]
    for field in (
        "id",
        "languages",
        "frameworks",
        "domains",
        "strengths",
        "tradeoffs",
        "performance",
        "learning_curve",
        "ecosystem",
        "hosting",
        "licensing",
        "starter_command",
        "verification_commands",
        "owl_support",
    ):
        assert field in entry
    assert "keywords" not in entry


def test_recommend_shape_with_mock_provider_is_rule_based(client):
    res = client.post("/stacks/recommend", json={"description": "a native iOS app for iPhone"})
    assert res.status_code == 200
    body = res.json()
    assert body["ranked_by"] == "rules"
    assert body["recommendations"][0]["stack"]["id"] == "swift-ios"
    assert 1 <= len(body["recommendations"]) <= 3


def test_recommend_rejects_empty_description(client):
    assert client.post("/stacks/recommend", json={"description": ""}).status_code == 422


def test_recommend_requires_token(client):
    res = client.post(
        "/stacks/recommend",
        json={"description": "x"},
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert res.status_code == 401


def test_recommend_uses_valid_model_ranking(client):
    client.app.state.provider = FakeRankingProvider('["go-backend", "rust-systems", "js-react"]')
    res = client.post("/stacks/recommend", json={"description": "a backend service"})
    body = res.json()
    assert body["ranked_by"] == "model"
    assert [r["stack"]["id"] for r in body["recommendations"]] == [
        "go-backend",
        "rust-systems",
        "js-react",
    ]


def test_recommend_falls_back_when_model_returns_unknown_id(client):
    provider = FakeRankingProvider('["go-backend", "totally-made-up"]')
    client.app.state.provider = provider
    res = client.post("/stacks/recommend", json={"description": "a native iOS app for iPhone"})
    body = res.json()
    assert provider.calls == 1
    assert body["ranked_by"] == "rules"
    assert body["recommendations"][0]["stack"]["id"] == "swift-ios"
