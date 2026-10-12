import pytest

from app.stacks.modelRanking_stack import parse_model_ranking
from app.stacks.stackCatalog_stack import known_stack_ids, load_catalog
from app.stacks.stackRecommendation_stack import recommend_stacks

MAPPING_CASES = [
    ("I want to build a smart contract NFT marketplace", "solidity-foundry"),
    ("A Solana program using Anchor", "solana-anchor"),
    ("An iOS app for iPhone", "swift-ios"),
    ("A native Android app with Jetpack", "kotlin-android"),
    ("A 2D indie game", "csharp-unity"),
    ("Firmware for an embedded microcontroller", "c-embedded"),
    ("A low latency high frequency trading engine", "cpp-lowlatency"),
    ("An enterprise backend for a large bank", "java-spring"),
    ("Train a machine learning model on data", "python-dataml"),
    ("A command line CLI developer tool", "go-backend"),
    ("A realtime chat app with websockets", "elixir-phoenix"),
    ("An SEO marketing landing page", "js-nextjs"),
    ("A dashboard single page web app", "js-react"),
    ("A data pipeline ETL into a warehouse with dbt", "sql-dbt"),
]


@pytest.mark.parametrize(("description", "expected_id"), MAPPING_CASES)
def test_rule_based_mapping_table(description, expected_id):
    ranked_by, recs = recommend_stacks(description)
    assert ranked_by == "rules"
    assert recs[0]["stack"]["id"] == expected_id


def test_recommendation_shape_and_top3():
    ranked_by, recs = recommend_stacks("an iOS app for iPhone")
    assert ranked_by == "rules"
    assert 1 <= len(recs) <= 3
    top = recs[0]
    assert set(top) == {
        "stack",
        "fit_score",
        "why",
        "tradeoffs",
        "vs_runner_up",
        "starter_command",
        "verification_commands",
        "owl_support",
        "experience_note",
    }
    assert top["fit_score"] >= recs[-1]["fit_score"]
    assert top["starter_command"]
    assert top["verification_commands"]


def test_constraint_avoids_language_and_prefers_language():
    _, recs = recommend_stacks(
        "an enterprise backend", constraints={"languages": ["C#"], "avoid": ["Java"]}
    )
    ids = [r["stack"]["id"] for r in recs]
    assert "java-spring" not in ids
    assert recs[0]["stack"]["id"] == "csharp-dotnet"


def test_empty_signal_description_falls_back_to_defaults():
    _, recs = recommend_stacks("zzzz nothing meaningful here")
    assert [r["stack"]["id"] for r in recs] == ["python-fastapi", "js-react", "go-backend"]


def test_experience_note_known_and_new_language():
    _, known = recommend_stacks("a FastAPI service", profile_languages=["Python"])
    assert "Matches your experience with Python" in known[0]["experience_note"]
    _, new = recommend_stacks("an iOS app", profile_languages=["Python"])
    assert "new for you" in new[0]["experience_note"]
    _, blank = recommend_stacks("an iOS app", profile_languages=[])
    assert blank[0]["experience_note"] == ""


def test_model_ranking_accepts_known_ids_in_order():
    allowed = known_stack_ids()
    text = 'Here you go: ["go-backend", "rust-systems"] done.'
    assert parse_model_ranking(text, allowed) == ["go-backend", "rust-systems"]


def test_model_ranking_rejects_unknown_id():
    allowed = known_stack_ids()
    assert parse_model_ranking('["go-backend", "not-a-real-stack"]', allowed) is None


def test_model_ranking_rejects_non_json_and_empty():
    allowed = known_stack_ids()
    assert parse_model_ranking("I recommend Go and Rust.", allowed) is None
    assert parse_model_ranking("[]", allowed) is None
    assert parse_model_ranking('["go-backend", 7]', allowed) is None


def test_model_ranking_drives_order_when_supplied():
    ranked_by, recs = recommend_stacks(
        "a web app", ranking_ids=["rust-systems", "go-backend", "js-react"]
    )
    assert ranked_by == "model"
    assert [r["stack"]["id"] for r in recs] == ["rust-systems", "go-backend", "js-react"]


def test_catalog_covers_core_languages():
    ids = {entry.id for entry in load_catalog()}
    for required in (
        "python-fastapi",
        "go-backend",
        "rust-systems",
        "swift-ios",
        "solidity-foundry",
    ):
        assert required in ids
