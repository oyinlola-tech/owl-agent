from __future__ import annotations

from .stackCatalog_stack import StackEntry

MappingRule = tuple[tuple[str, ...], tuple[str, ...], str]

# Security: none of these rules execute anything; they only map words in the user's description
# to catalog ids. The starter command is run later, and only through an explicit approval.
RULE_TABLE: tuple[MappingRule, ...] = (
    (
        ("solana", "anchor", "spl token"),
        ("solana-anchor", "solidity-foundry"),
        "Solana programs are written in Rust with the Anchor framework",
    ),
    (
        (
            "smart contract",
            "smartcontract",
            "web3",
            "dapp",
            "defi",
            "nft",
            "on-chain",
            "erc20",
            "erc-20",
            "ethereum",
            "evm",
            "blockchain",
            "crypto token",
        ),
        ("solidity-foundry", "solana-anchor"),
        "smart-contract work targets the EVM, where Solidity with Foundry is the standard",
    ),
    (
        ("ios", "iphone", "ipad", "apple app", "swiftui", "app store"),
        ("swift-ios", "dart-flutter", "js-react-native"),
        "a native iOS app is best built in Swift with SwiftUI",
    ),
    (
        ("android app", "android", "jetpack", "google play"),
        ("kotlin-android", "dart-flutter", "js-react-native"),
        "a native Android app is best built in Kotlin with Jetpack Compose",
    ),
    (
        (
            "cross-platform mobile",
            "both ios and android",
            "ios and android",
            "mobile app",
            "cross platform app",
        ),
        ("dart-flutter", "js-react-native", "kotlin-kmp"),
        "one codebase for both app stores favors Flutter or React Native",
    ),
    (
        ("aaa game", "high-fidelity", "3d game", "unreal"),
        ("cpp-unreal", "csharp-unity", "gdscript-godot"),
        "high-fidelity 3D games are Unreal Engine's territory",
    ),
    (
        ("game", "2d game", "mobile game", "indie game", "ar", "vr", "unity", "godot"),
        ("csharp-unity", "gdscript-godot", "cpp-unreal"),
        "Unity and Godot cover most 2D/3D and indie game needs",
    ),
    (
        ("embedded", "firmware", "microcontroller", "iot", "bare metal", "rtos"),
        ("c-embedded", "rust-systems", "zig-systems"),
        "embedded and firmware work lives closest to C, with Rust as a safer modern option",
    ),
    (
        (
            "low latency",
            "low-latency",
            "high frequency",
            "high-frequency",
            "trading engine",
            "real-time systems",
            "nanosecond",
            "microsecond",
        ),
        ("cpp-lowlatency", "rust-systems"),
        "latency-critical systems point to C++ or Rust for deterministic performance",
    ),
    (
        (
            "enterprise",
            "corporate",
            "large organization",
            "regulated",
            "banking backend",
            "insurance",
        ),
        ("java-spring", "csharp-dotnet"),
        "enterprise backends standardize on Java/Spring or C#/.NET",
    ),
    (
        (
            "machine learning",
            "deep learning",
            "data science",
            "ml model",
            "train a model",
            "neural network",
            "ai model",
            "pandas",
            "numpy",
            "pytorch",
            "llm",
        ),
        ("python-dataml",),
        "data and ML work runs on Python's scientific ecosystem",
    ),
    (
        (
            "data pipeline",
            "etl",
            "elt",
            "data warehouse",
            "analytics engineering",
            "dbt",
            "transform data",
            "warehouse models",
        ),
        ("sql-dbt", "python-dataml"),
        "warehouse transforms are best version-controlled with SQL and dbt",
    ),
    (
        ("cli", "command line", "command-line", "terminal tool", "developer tool"),
        ("go-backend", "rust-systems"),
        "CLIs compile to a single fast binary in Go or Rust",
    ),
    (
        ("desktop app", "cross-platform desktop", "native desktop", "gui app"),
        ("rust-tauri", "js-electron", "cpp-qt", "csharp-maui"),
        "desktop apps range from lightweight Tauri to battle-tested Electron",
    ),
    (
        (
            "realtime",
            "real-time",
            "websocket",
            "websockets",
            "chat app",
            "live updates",
            "presence",
            "multiplayer backend",
        ),
        ("elixir-phoenix", "js-node-express"),
        "realtime, high-concurrency backends shine on Elixir/Phoenix",
    ),
    (
        ("ssr", "seo", "marketing site", "landing page", "content site", "blog"),
        ("js-nextjs", "js-svelte"),
        "SEO-sensitive, server-rendered sites fit Next.js",
    ),
    (
        ("mvp", "startup", "prototype fast", "full stack", "fullstack", "web platform"),
        ("js-nextjs", "ruby-rails", "python-django"),
        "fast full-stack delivery favors Next.js, Rails, or Django",
    ),
    (
        ("dashboard", "spa", "single page", "admin panel", "web app", "frontend"),
        ("js-react", "js-vue", "js-svelte"),
        "interactive web UIs are the React/Vue/Svelte sweet spot",
    ),
    (
        ("rest api", "backend api", "json api", "microservice", "microservices", "web service"),
        ("python-fastapi", "go-backend", "js-node-express", "java-spring"),
        "typed, fast HTTP APIs are quick to build in FastAPI or Go",
    ),
    (
        ("statistics", "statistical", "research", "scientific computing", "bioinformatics"),
        ("python-dataml", "r-julia"),
        "statistical and research work is at home in Python or R/Julia",
    ),
    (
        ("automation script", "shell script", "devops script", "bash", "glue script", "ci script"),
        ("shell-bats", "go-backend"),
        "automation glue is quickest as tested shell scripts",
    ),
    (
        ("functional programming", "type safety", "provable", "correctness", "pure functions"),
        ("haskell-backend", "scala-backend"),
        "correctness-first, functional work leans on Haskell or Scala",
    ),
)

DEFAULT_PICKS: tuple[str, ...] = ("python-fastapi", "js-react", "go-backend")
HIGH_PERFORMANCE_IDS = frozenset(
    {"rust-systems", "rust-axum", "go-backend", "cpp-lowlatency", "c-embedded", "zig-systems"}
)
OWL_SUPPORT_RANK = {"full": 0, "strong": 1, "basic": 2, "experimental": 3}


def collect_terms(description: str, constraints: dict | None) -> str:
    parts = [description or ""]
    if constraints:
        for key in ("performance", "hosting", "team_experience"):
            value = constraints.get(key)
            if value:
                parts.append(str(value))
    return " ".join(parts).lower()


def matched_keywords(text: str, keywords: tuple[str, ...]) -> list[str]:
    return [kw for kw in keywords if kw in text]


def score_by_rules(text: str) -> tuple[dict[str, float], dict[str, list[str]]]:
    scores: dict[str, float] = {}
    reasons: dict[str, list[str]] = {}
    for keywords, candidates, phrase in RULE_TABLE:
        hits = matched_keywords(text, keywords)
        if not hits:
            continue
        for position, stack_id in enumerate(candidates):
            scores[stack_id] = scores.get(stack_id, 0.0) + max(10.0 - position * 2.0, 2.0)
            reasons.setdefault(stack_id, [])
            if phrase not in reasons[stack_id]:
                reasons[stack_id].append(phrase)
    return scores, reasons


def score_by_catalog_keywords(text: str, catalog: list[StackEntry]) -> dict[str, float]:
    scores: dict[str, float] = {}
    for entry in catalog:
        hits = matched_keywords(text, entry.keywords)
        if hits:
            scores[entry.id] = scores.get(entry.id, 0.0) + min(len(hits) * 1.5, 6.0)
    return scores


def apply_constraints(
    scores: dict[str, float],
    reasons: dict[str, list[str]],
    constraints: dict | None,
    catalog: dict[str, StackEntry],
) -> None:
    if not constraints:
        return
    preferred = {str(lang).lower() for lang in constraints.get("languages", []) if lang}
    avoid = {str(lang).lower() for lang in constraints.get("avoid", []) if lang}
    wants_performance = any(
        token in str(constraints.get("performance", "")).lower()
        for token in ("high", "fast", "low latency", "low-latency", "realtime", "real-time")
    )
    for stack_id, entry in catalog.items():
        langs = {lang.lower() for lang in entry.languages}
        if avoid and (langs & avoid):
            scores[stack_id] = scores.get(stack_id, 0.0) - 100.0
            continue
        if preferred and (langs & preferred):
            scores[stack_id] = scores.get(stack_id, 0.0) + 6.0
            reasons.setdefault(stack_id, []).append(
                "matches your preferred language " + ", ".join(sorted(langs & preferred))
            )
        if wants_performance and stack_id in HIGH_PERFORMANCE_IDS:
            scores[stack_id] = scores.get(stack_id, 0.0) + 4.0
            reasons.setdefault(stack_id, []).append("fits the performance constraint")
