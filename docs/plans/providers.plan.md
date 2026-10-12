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

# Part F: no mock data in the app (owner request)

The installed app must never show invented data. Today 36 files under
apps/desktop/src/desktop use sample/mock data (workspace chat replay, terminal, file tree,
projects, home, inbox, tasks, memory, models, palette, project switcher...), and the backend
silently falls back to a mock model when no provider is configured.

Rules:
- The desktop app talks only to the real local service. If the service isn't reachable, show
  a clear "OWL's local service isn't running" state with Retry and what to do — never sample
  data. Empty data shows a designed empty state with the next action ("Open your first
  project"), never fake rows.
- The mock model provider exists only for tests (selected explicitly by test settings / an
  `OWL_PROVIDER=mock` env var). With no provider configured, the service reports
  `provider: none`, chat/tasks return a clear "Connect a model first" error, and the app shows
  the provider setup instead.
- Static product content is fine (playbook recipes, the stack catalog, keyboard shortcuts):
  it's real content, not fake activity. The marketing website may keep its illustrative demo.
- Delete apps/desktop/src/desktop/services/samples/*, mockAgent.service.ts, seed data
  (ZudoMart/ProofLens/Scriptune), terminalSample.data.ts, and every `loadWithSampleFallback`.

New backend capabilities (all under the service token, JSON, workspace guard + sandbox):
- Projects: `GET/POST /projects` (add an existing folder: validates it, authorizes it as a
  workspace root persisted in the DB alongside OWL_WORKSPACES, detects stack with the
  verification detectors), `DELETE /projects/{id}` (forgets it, never deletes files),
  `PATCH /projects/{id}` (rename, last opened). The folder comes from the Tauri dialog
  plugin's folder picker (add `@tauri-apps/plugin-dialog`, capability scoped to the main
  window). Protected locations (home root, /, system dirs, ~/.ssh...) are refused.
- Files: `GET /projects/{id}/tree?path=` (one level, gitignore-aware, sensitive files
  hidden), `GET /projects/{id}/file?path=` (text only, size-capped, sensitive refused),
  `PUT /projects/{id}/file` for the USER's own edits from the code editor (journaled with
  source "user", not via agent approvals), `GET /projects/{id}/search?q=` (bounded).
- Git: `GET /projects/{id}/git` (branch, ahead/behind, changed files) via the existing
  sandboxed git executor.
- Commands for the user: `POST /projects/{id}/commands` runs a user-typed command through the
  sandboxed executor (argv parsed with shlex; same risk assessment: refused stays refused,
  high-risk needs a confirm flag from the UI), streamed via SSE; history persisted. This is
  the Terminal panel (non-interactive; say so). Agent command output shows real tool calls.
- Chat in the workspace = real tasks: sending a message creates/continues a task for the
  open project (`POST /tasks`, `POST /tasks/{id}/messages`) and renders the SSE events.

Frontend:
- Data layer: one hook per resource over the real API (loading / empty / error / offline /
  unauthorized states), no sample fallback.
- QA: the Playwright suite runs against a real service started per run (temp data dir, temp
  workspace with a small real project, mock provider via `OWL_PROVIDER=mock` for
  deterministic agent replies — tests only). Keep every current flow covered.

# Part G: onboarding (first run), designed properly

Shown when the profile is empty or no provider/project exists. Full-window flow, not a modal:
left progress rail (step names, current/done states, OWL mark), right content panel (max
~640px), sticky footer with Back / Continue (Continue disabled until the step is valid;
"Set up later" where skipping is safe). Keyboard accessible (Enter continues, focus moves to
the step heading), screen-reader announcements, light/dark, works from 960px wide, reduced
motion respected, uses the existing tokens/typography (serif display headings).

Steps:
1. Welcome — owl mark, one-sentence promise ("An AI engineer that shows its work and waits
   for your approval"), three short trust points (runs on your machine, every change is a
   diff you approve, OWL checks its own work), "Get started".
2. About you — name (used in greetings), role, experience, languages/frameworks as chips,
   code style + test framework (optional). Saved to `PUT /profile`.
3. Connect a model — cards for Claude, OpenAI, Gemini, Grok, Groq, NVIDIA, OpenRouter, and
   Local (Ollama / LM Studio, detected live with status). Selecting one opens the key field
   (password, paste, "where do I get a key" link), Test connection (shows latency + model
   count, or the exact plain-language error), pick a model. "Set up later" allowed: then chat
   shows a clear "Connect a model" call to action.
4. Your first project — "Choose a folder" (native picker) → shows the detected stack and the
   checks OWL can run (verification detectors), or "Start a new project" (stack advisor,
   Part D). Refused locations explain why.
5. Safety check — live `/security/status`: sandbox on/off and backend, network policy,
   approvals required, where data and keys are stored; on Windows/no-sandbox explain plainly.
6. Done — summary of choices, "Open <project>" lands in the workspace with the composer
   focused and a suggested first prompt based on the detected stack.
Re-runnable from Settings ("Run setup again"). Persist progress so a restart resumes the step.
Tests: unit tests per step validation; QA walks the whole flow against the real service.
