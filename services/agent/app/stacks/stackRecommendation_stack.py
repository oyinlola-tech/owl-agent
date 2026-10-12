from __future__ import annotations

from .recommendationRules_stack import (
    DEFAULT_PICKS,
    OWL_SUPPORT_RANK,
    apply_constraints,
    collect_terms,
    score_by_catalog_keywords,
    score_by_rules,
)
from .stackCatalog_stack import StackEntry, catalog_by_id, load_catalog


def experience_note_for(entry: StackEntry, profile_languages: list[str]) -> str:
    if not profile_languages:
        return ""
    known = {lang.lower() for lang in profile_languages}
    shared = sorted(lang for lang in entry.languages if lang.lower() in known)
    if shared:
        return f"Matches your experience with {', '.join(shared)}."
    return (
        f"This stack uses {', '.join(entry.languages)}, which would be new for you based on"
        " your profile."
    )


def compare_phrase(chosen: StackEntry, runner: StackEntry) -> str:
    chosen_rank = OWL_SUPPORT_RANK.get(chosen.owl_support, 3)
    runner_rank = OWL_SUPPORT_RANK.get(runner.owl_support, 3)
    if chosen_rank < runner_rank:
        return f"OWL supports it more deeply ({chosen.owl_support} vs {runner.owl_support})."
    if chosen.strengths:
        return chosen.strengths[0] + "."
    return "a closer fit to the description."


def compose_why(entry: StackEntry, reasons: list[str]) -> str:
    lead = reasons[0] if reasons else f"{entry.name} is a versatile, well-supported choice"
    extra = f" It brings {entry.strengths[0].lower()}." if entry.strengths else ""
    secondary = f" It also {reasons[1]}." if len(reasons) > 1 else ""
    return f"{lead[0].upper()}{lead[1:]}.{secondary}{extra}".strip()


def fit_from_score(score: float) -> int:
    return max(1, min(99, round(40 + score * 5)))


def fit_from_position(position: int) -> int:
    return max(50, min(96, 96 - position * 7))


def build_recommendation(
    entry: StackEntry,
    fit_score: int,
    reasons: list[str],
    runner_up: StackEntry | None,
    profile_languages: list[str],
) -> dict:
    return {
        "stack": entry.to_dict(),
        "fit_score": fit_score,
        "why": compose_why(entry, reasons),
        "tradeoffs": list(entry.tradeoffs),
        "vs_runner_up": (
            f"Preferred over {runner_up.name}: {compare_phrase(entry, runner_up)}"
            if runner_up
            else "Top overall fit for the description."
        ),
        "starter_command": entry.starter_command,
        "verification_commands": list(entry.verification_commands),
        "owl_support": entry.owl_support,
        "experience_note": experience_note_for(entry, profile_languages),
    }


def score_catalog(
    description: str, constraints: dict | None
) -> tuple[list[str], dict[str, float], dict[str, list[str]]]:
    catalog = load_catalog()
    catalog_map = {entry.id: entry for entry in catalog}
    text = collect_terms(description, constraints)
    scores, reasons = score_by_rules(text)
    for stack_id, extra in score_by_catalog_keywords(text, catalog).items():
        scores[stack_id] = scores.get(stack_id, 0.0) + extra
    apply_constraints(scores, reasons, constraints, catalog_map)
    positive = {sid: value for sid, value in scores.items() if value > 0}
    if not positive:
        default = {sid: 2.0 for sid in DEFAULT_PICKS}
        return list(DEFAULT_PICKS), default, reasons
    ordered = sorted(
        positive,
        key=lambda sid: (
            -positive[sid],
            OWL_SUPPORT_RANK.get(catalog_map[sid].owl_support, 3),
            sid,
        ),
    )
    return ordered, positive, reasons


def rank_ids_by_rules(description: str, constraints: dict | None) -> list[str]:
    ordered, _, _ = score_catalog(description, constraints)
    return ordered


def recommend_stacks(
    description: str,
    constraints: dict | None = None,
    profile_languages: list[str] | None = None,
    ranking_ids: list[str] | None = None,
) -> tuple[str, list[dict]]:
    profile_languages = profile_languages or []
    catalog_map = catalog_by_id()
    ordered, scores, reasons = score_catalog(description, constraints)

    if ranking_ids:
        ranked_by = "model"
        chosen_ids = [sid for sid in ranking_ids if sid in catalog_map][:3]
        fit_for = {sid: fit_from_position(i) for i, sid in enumerate(chosen_ids)}
    else:
        ranked_by = "rules"
        chosen_ids = ordered[:3]
        fit_for = {sid: fit_from_score(scores.get(sid, 2.0)) for sid in chosen_ids}

    recommendations: list[dict] = []
    for position, stack_id in enumerate(chosen_ids):
        entry = catalog_map[stack_id]
        runner = catalog_map[chosen_ids[position + 1]] if position + 1 < len(chosen_ids) else None
        recommendations.append(
            build_recommendation(
                entry, fit_for[stack_id], reasons.get(stack_id, []), runner, profile_languages
            )
        )
    return ranked_by, recommendations
