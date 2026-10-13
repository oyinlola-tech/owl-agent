# Using OWL

OWL is a desktop AI coding agent. You describe a task, it writes a plan, and
every file edit, command, and git action waits for your approval. When it says
it is finished, OWL runs your project's own checks itself before marking the
work verified.

This guide covers the whole app. Installing is in [INSTALL.md](INSTALL.md);
the architecture, configuration reference, and data model are in the
[README](../README.md).

## Contents

1. [First launch and onboarding](#1-first-launch-and-onboarding)
2. [Connecting a model](#2-connecting-a-model)
3. [Adding a project](#3-adding-a-project)
4. [Running a task](#4-running-a-task)
5. [Approvals](#5-approvals)
6. [Reviewing changes](#6-reviewing-changes)
7. [Verification](#7-verification)
8. [Terminal](#8-terminal)
9. [Files, Git, and Browser Studio](#9-files-git-and-browser-studio)
10. [Memory](#10-memory)
11. [Models, tools, playbooks, and history](#11-models-tools-playbooks-and-history)
12. [Settings tour](#12-settings-tour)
13. [Keyboard shortcuts and owl:// links](#13-keyboard-shortcuts-and-owllinks)
14. [Your data and privacy](#14-your-data-and-privacy)
15. [Troubleshooting](#15-troubleshooting)
16. [FAQ](#16-faq)

## 1. First launch and onboarding

Open OWL after installing. The status bar shows whether the bundled agent
service is online: the app starts the service itself and stops it on quit. If
port 8000 is already taken by another OWL service (for example one you started
from source), the app uses that one instead. If no service answers, the app
says so plainly and offers a retry — it never invents data.

On first run you get a full-window setup flow (re-runnable later from
Settings → Profile → "Run setup again"):

1. **Welcome** — what OWL promises: it runs on your machine, every change is a
   diff you approve, and it checks its own work.
2. **About you** — name, role, experience, languages and frameworks, code style,
   test framework. This feeds the agent's prompts and greetings; everything is
   optional and editable later.
3. **Connect a model** — pick a provider, paste a key, test it, pick a model
   (details in [section 2](#2-connecting-a-model)). Skippable: chat then shows
   a "Connect a model" call to action instead of failing silently.
4. **Your first project** — choose a folder with the native picker, or start a
   new project with the stack advisor. OWL shows the stack it detected and the
   checks it can run for that folder.
5. **Safety check** — live service status in plain language: sandbox on or off
   and which backend, network policy, approvals required, and where data and
   keys are stored. On Windows (no OS sandbox) it says so instead of hiding it.
6. **Done** — a summary of your choices; opening the project focuses the
   composer with a suggested first prompt based on the detected stack.

## 2. Connecting a model

Go to **Settings → AI providers**. Providers are grouped into **Cloud models**
(Claude, OpenAI, Gemini, Grok, Groq, NVIDIA, OpenRouter, Together AI, Custom)
and **Local models** (Ollama, LM Studio, llama.cpp / vLLM). Exactly one
provider is active at a time; inside it, the router picks models per request
unless you pin one.

For any provider card, **Set up** opens a sheet:

- **API key** — a password field. The key is sent once, stored in your OS
  keyring (Windows Credential Manager, macOS Keychain, Linux Secret Service)
  under the service `owl-agent`, and never shown again — only a hint like
  `…abcd`. If no keyring exists, OWL uses a `0600` file in its data folder and
  says so. Each card links to where you get a key on that provider's site.
- **Test connection** — calls the provider's live `/models` with your key and
  reports latency plus how many models your key can use, or the exact
  plain-language error (wrong key, no network, provider down). A successful
  test refreshes the stored model list, so testing before saving keeps the
  list fresh.
- **Model** — a picker listing the live models plus **Auto** (recommended:
  OWL routes each task to a fitting model and tells you why). **Refresh
  models** reloads the list from the provider at any time.
- **Use this provider** — makes it active with your chosen model.

Notes:

- Keys set via environment (`NVIDIA_API_KEY`) still work and show as
  read-only "from environment".
- Local runners are auto-detected (`Detect local models` probes Ollama on
  `127.0.0.1:11434`, LM Studio on `:1234`, llama.cpp/vLLM on `:8080`) with
  setup instructions when one is not running.
- Custom endpoints must be `https` unless loopback; URLs with credentials,
  non-http(s) schemes, or link-local/metadata hosts are refused, and the URL
  is re-checked on every request.
- With no provider configured, chat and tasks answer "Connect a model first"
  and the app shows the setup instead. There is no demo mode.

## 3. Adding a project

Use **Projects → Add a project** (or the onboarding step). A native folder
picker asks for a folder; OWL validates it, detects its stack with the same
detectors that drive verification, and authorizes it as a workspace root. The
agent can only read, write, run, and version-control inside folders you added.

- Protected locations are refused with an explanation: your home root, `/`,
  system folders, `~/.ssh`, and similar credential stores.
- Name is optional and defaults to the folder name. Forgetting a project
  removes it from OWL's list; your files are never touched.
- The stack advisor (**Home** when you have no projects, or onboarding's
  "Start a new project") asks what you are building and recommends three
  stacks with fit score, trade-offs, starter command, and verification
  commands. Picking one feeds your first task's plan; the starter command only
  runs through an approval.

## 4. Running a task

Describe the task on **Home** or in the workspace composer and send. The
workspace chat is backed by real tasks: sending creates (or continues) a task
for the open project and streams its events live. The model selector chip
shows **Auto model** or your pinned model.

A task runs in a loop you can watch:

1. OWL indexes the project and writes a **plan** (steps with states).
2. It works step by step: read-only actions run immediately; writes, commands,
   and git actions stop at [approvals](#5-approvals).
3. Each applied change is journaled with before/after text plus a checkpoint,
   so tasks pause and resume safely.
4. **Pause** freezes the loop (budgets carry over across resume); **Stop**
   cancels it. Hitting a loop budget (25 steps, 40 model calls, 30 minutes by
   default) pauses with a note instead of spinning forever.

Task statuses: `running`, `awaiting_approval` (something needs you),
`paused`, `cancelled`, `failed` (verification budget used up — resume resets
it and tries again), `verified_completed` (OWL ran your checks, all green),
`completed_unverified` (finished but nothing could prove it, with the reason
stored). The **Tasks** board groups tasks by status; opening one shows its
plan, activity, diffs, verification, and context (including which memories the
agent used).

## 5. Approvals

Nothing is written, run, or pushed until you approve that exact action. Every
approval is bound server-side to a SHA-256 of the tool plus its arguments:
single-use, expiring (30 minutes by default), and enforced by the service, not
the UI. Approvals appear in the workspace and in **Inbox** with risk level,
affected files, and the exact command.

- **Approve once / for the task / reject.** Low-risk repeats can be approved
  for the whole task; anything else needs a fresh approval each time.
- **Network access** is off by default. A command that needs the network shows
  it; approving "with network access" grants it for that run only. Verification
  runs never get network unless you set `OWL_VERIFY_NETWORK=1`.
- **High-risk commands** (recursive deletes, installs, `curl` pipelines and
  friends) are flagged and need an explicit confirm; `sudo`, `su`, `doas`,
  and `runas` are always refused.
- Secrets in tool output are scrubbed before display, and environment
  variables that look like keys never reach commands.

## 6. Reviewing changes

The **Changes** tab shows each proposed file as a diff with conflict
detection (if you edited the file meanwhile, OWL says so). Accept or reject
per file, undo the last decision, and later revert any applied change from
**Change history**, which keeps the before/after text of everything the agent
wrote. Your own edits in the code editor are journaled too (marked as yours,
not gated by approvals — they are already your decision).

## 7. Verification

A model can claim the work is done; only OWL can prove it. After the last
change, OWL detects your project's real checks without executing anything to
do so — `package.json` scripts (manager picked from the lockfile), pytest /
mypy / ruff, `go test`, `cargo test`, Maven/Gradle wrappers, `dotnet test`,
`flutter test`, CMake + ctest, `make test`, and more — asks you to approve
that exact command list, runs it through the same guarded executor, and
records every run in the **Verification** tab (source, exit code, duration,
full output).

- **`verified_completed`** — every required check ran after the last change
  and exited 0.
- **`completed_unverified`** — finished but unprovable: no change was made, no
  reliable check found, the toolchain is missing, or no workspace was
  authorized. The reason is stored and shown.
- **Failure** — the real output goes back to the model as untrusted input, a
  fix step is added, and OWL verifies again, up to 3 rounds by default, then
  the task is `failed`. Resume resets the budget.

If the task changed a file that defines what a check does (for example
`scripts` in `package.json`), the check is marked tainted and the approval
card says so. Commands the model suggests are never added to the check list.

## 8. Terminal

The terminal panel runs commands you type in the open project through the
same sandboxed executor as the agent: commands are parsed (no shell),
risk-assessed, and confirmed like approvals. It is non-interactive (editors,
prompts, and long-lived processes will not work there — it says so in the
panel), streams output live, records exit codes, and keeps history per
project.

## 9. Files, Git, and Browser Studio

- **Files** — one level at a time, `.gitignore`-aware, with sensitive files
  hidden and refused. Search is bounded and fast; the code editor saves
  through the journal.
- **Git** — branch, ahead/behind, and changed files per project, plus branch
  create/checkout, AI commit messages, and commits through the sandboxed git
  runner (repository hooks are disabled, so a hostile repo cannot execute code
  on your machine). Push, merge, and force-push need approval; force-push uses
  `--force-with-lease`.
- **Browser Studio** — previews local builds at desktop, laptop, tablet, and
  phone widths. **Browser capture** fetches a page in isolated Chromium with
  SSRF guards (loopback, private, link-local, and cloud-metadata addresses are
  refused on every redirect hop) and hands the text back as untrusted
  reference data — never instructions.

## 10. Memory

The **Memory** page shows everything OWL remembers, grouped by scope: global
(preferences about you), project (per-project facts), task, and knowledge
(saved research). You can edit, disable, or delete any entry; anything that
looks like a secret is refused at save time.

Memory is actually used: the agent sees a bounded "what OWL knows" block
(profile summary plus the most relevant enabled memories) in its prompts, and
each task's Context tab lists which memories were used. After a task, OWL may
propose new memories from your approvals, rejections, and verification
results — you confirm, edit, or delete them. Your profile (name, role,
experience, stacks, styles) lives in **Settings → Profile** and replaces
every hard-coded name in greetings.

## 11. Models, tools, playbooks, and history

- **Models & usage** — the model registry (refresh, validate), token usage
  per task, and context-budget/compression history.
- **Agent tools** — the tool registry with each tool's schema, permission,
  risk, and approval policy.
- **Playbooks** — recipes (plan OWL follows, tools it uses, how often it
  stops for approval). Fill in the fields, then copy the prompt, start a
  backend task, or run it in the workspace.
- **Tasks / Inbox / Change history** — the board, the approval queue, and the
  revertable journal described above.
- **Help** — diagnostics and where to get support.

## 12. Settings tour

- **General** — theme, layout, and interface preferences.
- **Profile** — the "about you" record plus "Run setup again".
- **AI providers** — [section 2](#2-connecting-a-model).
- **AI** — provider verification, default model (Auto or pinned), context and
  step-limit information.
- **Permissions** — what the agent may do without asking.
- **Workspaces** — the authorized project roots.
- **Security** — the live `/security/status` report: token state, sandbox
  backend and mode, network policy, browser settings.
- **Git** — identity and safety defaults for git actions.
- **Data** — storage status, manual backup, export (a zip without keys),
  import (validates and backs up first), and reset (typed confirmation, backs
  up first). Backups also run automatically: at most daily, before every
  migration, keeping 7 daily + 4 weekly.
- **Notifications / Keyboard / Advanced / About** — alerts, shortcut
  reference, power options, and version info.

## 13. Keyboard shortcuts and owl:// links

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + K` | Ask OWL from anywhere |
| `Ctrl/Cmd + Shift + P` | Command palette |
| `Ctrl/Cmd + J` | Show or hide the terminal |
| `Ctrl/Cmd + B` | Show or hide the file panel |
| `Ctrl/Cmd + Shift + E` | Review pending changes |
| `?` | Keyboard shortcuts |
| `Esc` | Close the palette or Ask OWL |

`owl://app/<screen>` links open a screen directly (`welcome`, `workspace`,
`tasks`, `task`, `btask`, `browser`, `projects`, `memory`, `settings`,
`inbox`, `history`, `models`, `tools`, `playbooks`, `help`) — for example
`owl://app/inbox`.

## 14. Your data and privacy

- **Local-first.** The service binds to loopback only; state lives in your
  app-data folder (`%APPDATA%\com.oyinlola.owl-agent` on Windows,
  `~/Library/Application Support/com.oyinlola.owl-agent` on macOS,
  `~/.local/share/com.oyinlola.owl-agent` on Linux — override with
  `OWL_DATA_DIR`). Uninstalling may leave this folder; delete it to remove
  everything.
- **Keys** live in your OS keyring (or a `0600` file where no keyring
  exists), are never logged, never returned by the API, and are scrubbed from
  provider error text. Only a `…abcd` hint ever reaches the UI.
- **Files.** Data folders are `0700`; database, token, and key files are
  `0600`. Logs rotate (5 × 2 MB) with secrets scrubbed. Exports exclude keys;
  backups are full copies for restore — treat backup files as sensitive.
- **Network.** Model traffic goes to the provider you configured, with the
  key attached server-side. Sandboxed commands and verification runs have no
  network unless explicitly granted per run. Browser capture blocks internal
  addresses.
- The only knobs that send data anywhere are the ones you approve: provider
  calls, network-granted commands, and page captures.
- The onlyknobs that send data anywhere are the ones you approve: provider
  calls, network-granted commands, and page captures.

## 15. Troubleshooting

- **"OWL's local service isn't running"** — start OWL properly (it manages the
  service itself) or, from source, run the service on port 8000 and Retry. If
  port 8000 is taken by a non-OWL program, free it or point the app at your
  dev service.
- **"Can't authenticate with the local OWL service" (401)** — the app's token
  does not match the service's. When running from source, start the service
  with `OWL_DEV_TOKEN=<value>` and the frontend with
  `VITE_OWL_DEV_TOKEN=<value>` using the same 16+ character value.
- **"Connect a model first"** — no provider is configured. Settings → AI
  providers, add a key, Test, Use this provider.
- **Test connection fails** — read the exact error: wrong key (401/403),
  no network or proxy blocking the provider, provider outage (5xx, retry),
  rate limit (429, wait). For local runners, the how-to under the card covers
  starting Ollama / LM Studio / llama-server.
- **Task stuck in `awaiting_approval`** — something needs you in Inbox or the
  workspace approval card. Approve, reject, or cancel the task.
- **Task `paused` after budget** — resume from Tasks; iterations and calls
  persist, elapsed time accumulates, verification attempts reset on failed
  resume.
- **Verification failed** — open the Verification tab, read the real command
  output, fix the code (or the command), and approve the re-run. After 3
  failed rounds the task is `failed`; resume tries again.
- **`completed_unverified`** — the stored reason tells you which: no changes,
  no detectable checks, missing toolchain (install it), or no authorized
  workspace.
- **Commands refuse to run** — `sudo`/privilege escalation is always refused;
  destructive or installer commands need explicit confirmation; check the
  sandbox line in Settings → Security (on Windows there is no OS sandbox).
- **Something looks wrong after an update** — Change history reverts applied
  files; checkpoints let tasks resume; `POST /data/backup` snapshots the
  database from Settings → Data.

## 16. FAQ

- **Does OWL work offline?** The app and service run locally, but model calls
  need a provider: a cloud key needs internet, while Ollama/LM Studio work
  fully offline.
- **Which models work?** Any provider preset plus any OpenAI-compatible
  endpoint, and Claude via the official SDK. Model lists always come from the
  provider — nothing is hard-coded.
- **What does it cost?** Whatever your provider charges. Models & usage shows
  tokens per task; usage is measured from the provider response when
  available, estimated otherwise (and marked as such).
- **Can it push to GitHub / deploy / send messages?** Push, merge, deploys,
  and anything external stop at approvals first. Multi-step external flows
  (jobs, grants, forms) stop before any irreversible, legal, payment, or OTP
  step.
- **Is there a demo mode?** No. Empty states and setup prompts replace the
  old sample data everywhere in the installed app.
- **How do I report a bug or vulnerability?** Bugs: open a GitHub issue with
  what you did, what you expected, and the service logs (Settings → Data
  tells you where they are; secrets are scrubbed). Security: see
  [SECURITY.md](../SECURITY.md) for private reporting — please do not file
  vulnerabilities as public issues.
