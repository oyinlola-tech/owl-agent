# Phase 5.2 plan: providers + API keys, local data, personalization, stack advisor

Rules in `docs/plans/codebase.plan.md` apply. The local service token, Host check and JSON
content-type rules from `docs/plans/security.plan.md` are already implemented; build on them.

# Part A: providers and API keys from the app

- Users add API keys and choose providers in Settings → AI providers, or use a local LLM.
  No key ever reaches the frontend after saving.
- Exactly one active provider; the router picks models within it. The mock provider stays the
  default when nothing is configured (tests rely on it). `NVIDIA_API_KEY` env still works and
  shows as "from environment" (read-only in the UI).
- URL rules: `https://` required unless the host is loopback; reject credentials in URLs,
  non-http(s) schemes, link-local/metadata hosts; re-check at request time.
- Local discovery `GET /providers/local`: probes Ollama (http://127.0.0.1:11434/v1, also
  `/api/tags`), LM Studio (http://127.0.0.1:1234/v1), llama.cpp/vLLM (default
  http://127.0.0.1:8080/v1) with short timeouts; returns status and model lists.
- Secret storage: `keyring` (Windows Credential Manager, macOS Keychain, Linux Secret Service),
  service `owl-agent`, username = provider id. No backend → a 0600 file in the data dir, and the
  UI says so plainly. `PUT /providers/{id}/key` (write-only), `DELETE /providers/{id}/key`;
  responses expose only `{has_key, key_hint: "…abcd", key_source: keyring|file|env}`. Never log
  or echo key material; scrub it from provider error bodies. Tests grep responses/logs/events.
- Frontend: provider cards (cloud / local), status chips (Connected / Key missing / Not
  running / Error), active badge; add/edit sheet with password field (never re-displayed),
  base URL for custom/local, Test connection (latency + model count or exact error), Save,
  Remove key, Use this provider; model picker per provider plus "Auto"; "Detect local models"
  with a how-to when not running. Clear copy about where keys live.

# Part B: local data storage (automatic on first run)

- `platformdirs` (pinned), app name "OWL": Windows `%APPDATA%\OWL`, macOS
  `~/Library/Application Support/OWL`, Linux `$XDG_DATA_HOME/owl` (+ cache dirs);
  `OWL_DATA_DIR` overrides. Migrate `~/.local/share/owl-agent/owl.db` automatically if the new
  location is empty (SQLite backup API, keep the old file, log it). The packaged launcher
  currently passes its own data dir: make both agree on one location.
- Bootstrap every start (idempotent): `data/`, `screenshots/`, `backups/`, `logs/`, `exports/`;
  dirs 0700, db/token 0600.
- `schema_migrations` table with numbered migrations (fold the current column-adds in),
  applied in a transaction. SQLite: WAL, `foreign_keys=ON`, `busy_timeout`,
  `integrity_check` at start (on failure keep the file, restore the newest good backup, tell
  the user).
- Backups via the SQLite backup API at most daily and before every migration; keep 7 daily +
  4 weekly.
- `GET /data/status`, `POST /data/backup`, `GET /data/export` (zip without API keys),
  `POST /data/import` (validates, backs up first), `POST /data/reset` (typed confirmation,
  backs up first). Rotating logs (5 × 2 MB), secrets scrubbed.

# Part C: personalization the agent actually uses

- Today memories are saved but never read back into prompts, and the UI hard-codes the
  owner's name. Fix both.
- `user_profile` (single row): display name, role, experience, languages/frameworks,
  package managers, code style, test framework, commit style, tone, projects folder.
  `GET/PUT /profile`. Skippable 3-step onboarding when empty; editable in Settings → Profile.
  Replace every hard-coded name with the profile name (fallback: no name).
- Project profiles built automatically (reuse verification detectors): stack, package
  manager, test/build commands, conventions; stored as project memories with source
  `project-scan:<project>`, refreshed when manifests change.
- Feed memory INTO plan/next-action prompts: a bounded "What OWL knows about you and this
  project" block (profile summary + top-k enabled memories ranked by search + recency,
  confirmed first) as its own context-budget category, marked as preferences that never
  override safety rules. Show used memories in the task's Context tab.
- After a task, propose unconfirmed memories from approvals/rejections/verification; the
  user confirms/edits/deletes them. Never store secrets.

# Part D: stack advisor

- Stack catalog (data modules split by domain, each ≤350 lines): languages, frameworks,
  domains, strengths, trade-offs, performance, learning curve, ecosystem, hosting, licensing,
  starter command, verification commands, OWL support level. Cover TS/JS (React, Next.js,
  Vue, Svelte, Node/Express/Nest, React Native, Electron), Python (FastAPI, Django, Flask,
  data/ML), Go, Rust (Axum, Tauri, embedded), Java (Spring Boot, Android), Kotlin (Ktor,
  Compose, KMP), C (embedded/systems), C++ (Qt, Unreal, low latency, CMake), C# (.NET, Unity,
  MAUI/WPF), Swift, Dart/Flutter, PHP (Laravel), Ruby (Rails), Elixir (Phoenix), Scala,
  Haskell, Zig, Solidity (Foundry/Hardhat), Rust/Anchor (Solana), Shell (bats + shellcheck),
  SQL/dbt, Lua, R/Julia.
- `POST /stacks/recommend` {description, constraints} → top 3 with fit score, why (tied to
  the description), trade-offs vs runner-up, starter command, verification commands, OWL
  support, and a "your experience" note from the profile (best fit first, never only what the
  user knows). With a model: rank catalog ids via a strict JSON schema (reject unknown ids,
  fall back). Without: deterministic keyword/constraint rules (tests pin them).
- New verification detectors: Maven/Gradle (prefer the wrapper), Kotlin, CMake + ctest, Make,
  `dotnet test`, `swift test`, Flutter/Dart, Composer/phpunit, Ruby (rspec/rake), `mix test`,
  `sbt test`, stack/cabal, `zig build test`, Foundry/Hardhat, bats + shellcheck. Same safety
  rules (manifest evidence, influences/taint, unsafe scripts); missing toolchain → "isn't
  installed" completed_unverified.
- Frontend: "Describe what you're building" → recommendation cards with Pick / Compare /
  Customize and "Browse all stacks"; picking a stack feeds the first task's plan; the starter
  command runs only through an approval.
- Also fix the refactor findings: Create project ignores template and "Initialise Git";
  Ctrl+B toggles the file panel not the sidebar; workspace search uses 3 hard-coded paths;
  playbook drawer steals focus on re-render; copy buttons include `$ `.


# Part E: provider coverage (owner request): Claude, Groq, OpenAI, Grok (xAI), Gemini

Two adapters behind the existing provider interface (complete, complete_stream, list_models,
describe, pop_usage — test doubles rely on these names):

1. OpenAI-compatible adapter (generalises the NVIDIA one), presets:
   - OpenAI `https://api.openai.com/v1`
   - Groq `https://api.groq.com/openai/v1`
   - xAI Grok `https://api.x.ai/v1`
   - Google Gemini via Google's OpenAI-compatible endpoint
     `https://generativelanguage.googleapis.com/v1beta/openai/`
   - NVIDIA, OpenRouter, Together, custom, and the local runners (Part A)
   Model lists always come from each provider's `/models` (never hard-code model ids), with
   the user's pick saved per provider. Usage from the response `usage` field when present,
   otherwise estimated (and marked estimated, as today).

2. Anthropic (Claude) adapter using the official `anthropic` Python SDK (pin the version) — do
   NOT route Claude through an OpenAI-compatible shim:
   - Client: `anthropic.Anthropic(api_key=<from keyring>)` (or AsyncAnthropic); the key is
     never logged; base URL overridable only via settings for proxies.
   - Default model `claude-opus-5-5` (user can pick any id returned by
     `client.models.list()`); never append date suffixes to model ids.
   - Requests: `client.messages.create(...)` for short calls; for long outputs use
     `client.messages.stream(...)` + `get_final_message()`; `max_tokens` ~16000 non-streaming,
     ~64000 streaming. Map OWL's chat messages to Anthropic format (system prompt goes in the
     top-level `system` parameter, not a message; first message must be `user`; no assistant
     prefill — it returns 400 on current models).
   - Thinking/effort on Claude Opus 5.5: omit `thinking` (adaptive is on and can't be
     disabled — sending `{type: "disabled"}` or `budget_tokens` returns 400) and set
     `output_config={"effort": ...}` explicitly (default is `medium` on this model; use
     `high` for planning/coding steps, `low` for short classification-style calls). Don't
     send temperature/top_p/top_k (rejected on current models) — the NVIDIA-specific
     temperature setting must not leak into this adapter.
   - Don't use forced `tool_choice` (`any`/`tool` returns 400 on Opus 5.5); OWL's agent loop
     uses its own JSON action protocol in text, which is fine.
   - Handle `stop_reason == "refusal"` (read `stop_details.category` only then): surface a
     clear message instead of treating it as empty output. Enable server-side fallbacks by
     default on Claude API requests for Opus 5.5 (`betas=["server-side-fallback-2026-07-01"]`,
     `fallbacks="default"` via `client.beta.messages.*`) and tell the user in the provider
     description; make it a setting they can turn off.
   - Read text by iterating `response.content` and taking `type == "text"` blocks (skip
     thinking blocks). Usage from `response.usage.input_tokens/output_tokens` (measured).
   - Errors: catch the SDK's typed exceptions most-specific-first and map them to OWL's
     existing provider errors: `AuthenticationError`/`PermissionDeniedError` →
     InvalidCredentials, `NotFoundError` → ModelNotAvailable, `RateLimitError` → RateLimited
     (respect retry-after), `APIStatusError` ≥500 / `APIConnectionError` /
     `APITimeoutError` → transient retry, `BadRequestError` → surface the message. Never
     string-match error messages.
   - Verify connection = `client.models.list()` (cheap, no tokens).
   - Before writing the adapter, read the claude-api skill docs for Python
     (python/claude-api/README.md, streaming.md, and shared/error-codes.md in the skill
     directory) — never guess SDK names; run the code and iterate on real errors.

Settings UI groups: "Cloud models" (Claude, OpenAI, Gemini, Grok, Groq, NVIDIA, OpenRouter,
Together, Custom) and "Local models" (Ollama, LM Studio, llama.cpp/vLLM). Each card links to
where to get a key on the provider's site.

Tests: adapter request shapes with mocked HTTP for every preset (base URL, auth header,
model list parsing); Anthropic adapter with a mocked SDK client: system mapping, no
thinking/temperature params sent, effort set, refusal handling, fallback params present and
removable, typed-error mapping, usage capture, key never in logs/responses.
