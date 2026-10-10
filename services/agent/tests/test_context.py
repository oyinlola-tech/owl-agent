"""Context budgets and compression. Deterministic, no model calls."""

from app.context import (
    BudgetManager,
    Compressor,
    ContextPart,
    count_tokens,
    validate_summary,
)


def test_estimator_is_labeled():
    n, method = count_tokens("hello world, this is a test")
    assert n > 0
    assert method in ("tiktoken-cl100k", "chars/4-estimate")


def test_budget_report_math():
    mgr = BudgetManager(limit=1000, reserve_fraction=0.25)
    parts = [ContextPart(category="history", text="x" * 400)]
    report = mgr.budget("m", parts)
    assert report.limit == 1000
    assert report.limit_source.startswith("verified")
    assert report.reserved == 250
    assert report.available == 750
    assert report.used == parts[0].tokens
    assert not report.over_budget
    assert not report.should_compress


def test_fallback_limit_is_labeled_estimate():
    mgr = BudgetManager(limit=None)
    report = mgr.budget("m", [ContextPart(category="history", text="hi")])
    assert report.limit == 8192
    assert "fallback" in report.limit_source
    assert "estimate" in report.limit_source


def test_trim_never_drops_safety_or_constraints():
    mgr = BudgetManager(limit=100, reserve_fraction=0.0)
    parts = [
        ContextPart(category="history", text="x" * 400),
        ContextPart(category="safety", text="approvals enforced"),
        ContextPart(category="user_constraints", text="do not delete data"),
    ]
    kept, dropped = mgr.trim_to_budget("m", parts)
    kept_cats = {p.category for p in kept}
    assert {"safety", "user_constraints"} <= kept_cats
    assert "history" in dropped


def test_level1_dedupes_only_redundant_categories():
    comp = Compressor()
    dup = "same output"
    parts = [
        ContextPart(category="tool_outputs", text=dup),
        ContextPart(category="tool_outputs", text=dup),
        ContextPart(category="instructions", text=dup),
        ContextPart(category="instructions", text=dup),
    ]
    kept, saved = comp.level1_dedupe(parts)
    assert len(kept) == 3  # one tool output removed, instructions kept
    assert saved > 0


def test_level2_summary_validates_required_fields():
    comp = Compressor()
    messages = [
        {"role": "user", "text": "Decided to use Postgres in src/auth/service.go"},
        {"role": "assistant", "text": "Done, but saw an error on retry"},
    ]
    summary = comp.level2_summarize(messages)
    assert validate_summary(summary) == []
    assert summary["files"] == ["src/auth/service.go"]


def test_originals_survive_compression():
    originals = [{"role": "user", "text": "exact value 42, do not touch"}]
    comp = Compressor()
    summary = comp.level2_summarize(originals)
    assert validate_summary(summary) == []
    assert originals[0]["text"] == "exact value 42, do not touch"


def test_level4_keeps_safety_and_state():
    comp = Compressor()
    parts = [
        ContextPart(category="safety", text="s"),
        ContextPart(category="history", text="h" * 100),
        ContextPart(category="task_state", text="t"),
        ContextPart(category="tool_outputs", text="o" * 100),
    ]
    summary = {
        "objectives": ["x"],
        "decisions": [],
        "files": ["a.py"],
        "completed": [],
        "remaining": ["y"],
        "risks": [],
    }
    kept = comp.level4_compact(parts, summary)
    cats = {p.category for p in kept}
    assert {"safety", "task_state", "history"} <= cats
    assert "tool_outputs" not in cats


def test_budget_endpoint_reports(client):
    res = client.post(
        "/context/budget",
        json={
            "model": "",
            "parts": [
                {"category": "history", "text": "hello world"},
                {"category": "safety", "text": "approvals enforced"},
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["used"] > 0
    assert "fallback" in body["limit_source"]
    assert body["parts"][0]["category"] == "history"
