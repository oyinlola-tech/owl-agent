# Security testing guide

This guide covers the three ways OWL is tested for security: static scanners, API fuzzing
and property tests, and an isolated Docker lab you can attack by hand. To report what you
find, see [SECURITY.md](../../SECURITY.md). To see what each check protects, see
[threatModel.doc.md](threatModel.doc.md).

## 1. Static scanners

CI runs them in `.github/workflows/security-scans.yml` on every push to `main`, on every pull
request, every Monday at 04:17 UTC, and on demand. A job fails on high severity:

| Scanner | What it checks | Config | Fails on |
| --- | --- | --- | --- |
| Bandit 1.9.4 | Python SAST on `services/agent/app` | `security/scanners/banditConfig.scanner.yaml` | high severity, at least medium confidence |
| Semgrep 1.180.0 | `p/python`, `p/typescript`, `p/react`, `p/secrets` plus OWL rules | `security/scanners/owlRules.scanner.yml` | any ERROR-severity rule |
| pip-audit 2.10.1 | known CVEs in the installed backend dependencies | none | any known vulnerability |
| npm audit | `apps/desktop/package-lock.json` | none | `--audit-level=high` |
| cargo-audit 0.22.2 | `apps/desktop/src-tauri/Cargo.lock` against RustSec | none | any vulnerability (warnings for unmaintained or unsound crates are shown but don't fail) |
| gitleaks 8.30.1 | full git history and the checked-out tree | `security/scanners/gitleaksConfig.scanner.toml` | any leak not allowlisted |
| Trivy 0.70.0 | lockfiles, Dockerfiles and secrets | none | HIGH or CRITICAL |

The OWL Semgrep rules forbid `shell=True`, `asyncio.create_subprocess_shell`, `os.system` /
`os.popen`, `eval` / `exec` / `compile`, `pickle` / `dill` / `shelve` loads, `yaml.load`
without `SafeLoader`, `dangerouslySetInnerHTML`, and `innerHTML` / `outerHTML` /
`insertAdjacentHTML` (warning).

Every action is pinned to a full commit SHA, the gitleaks download is checked against a
pinned SHA-256, and the Trivy image is pinned by digest.

### Running them locally

Install the Python scanners in a throwaway virtualenv so they don't touch the service's
`.venv`:

```bash
python3 -m venv /tmp/owl-scanners
/tmp/owl-scanners/bin/pip install bandit==1.9.4 semgrep==1.180.0 pip-audit==2.10.1 \
  shellcheck-py==0.11.0.1 actionlint-py==1.7.12.25
export PATH=/tmp/owl-scanners/bin:$PATH
```

On Kali, `gitleaks` and `trivy` come from apt. For cargo-audit, run
`cargo install --locked cargo-audit@0.22.2`.

Then, from the repo root:

```bash
security/scanners/runAllScans.scanner.sh            # every scanner
security/scanners/runAllScans.scanner.sh bandit semgrep gitleaks   # just some
```

The script runs the same commands as CI and prints a summary. Scanners that aren't installed
show as `SKIPPED`, never as passed. Two failures are expected on a developer machine and don't
happen in CI:

- **gitleaks** flags `services/agent/.env` when it holds a real key. That's intended. Keep the
  file git-ignored and at mode 0600.
- **pip-audit** flags an old `pip` in `services/agent/.venv`. Upgrade it with
  `services/agent/.venv/bin/python -m pip install -U pip`.

If Trivy can't write to a root-owned cache, add `--cache-dir` with a writable folder.
Lint the workflow and the scripts with:

```bash
actionlint .github/workflows/security-scans.yml
shellcheck security/scanners/*.sh security/lab/*.sh
```

### Triage

Reviewed false positives and accepted risks go in
[security/accepted-findings.md](../../security/accepted-findings.md), with the location and
the reason. Real problems go in the "Open findings" table of the threat model until they're
fixed.

## 2. Fuzz and property tests

They live in `services/agent/tests/fuzzing`:

| File | What it proves |
| --- | --- |
| `apiSchema_test.py` | Schemathesis generates requests for every operation in the service's OpenAPI schema (12 examples per operation; the SSE `/events` stream is excluded). With the token: no 500s, and requests aren't rejected by auth. Without a token or with a wrong one: never a 2xx, and documented methods get 401, 415 or 421. It also checks DNS-rebinding Host (421), form-encoded posts (415), and that `?token=` only works on the event stream. |
| `pathGuardProperty_test.py` | Hypothesis builds random paths from `..`, `~`, absolute prefixes, unicode and symlinks pointing inside and outside the workspace. A resolved path never leaves the workspace, and `.env`, `.ssh` and private keys need `allow_sensitive`. |
| `commandRiskProperty_test.py` | The risk assessor is total and deterministic. Empty executables and `sudo`/`su`/`doas` are always refused, destructive commands are never `ok`, and network commands are always detected. |

Tests marked `xfail(strict=True)` document open findings from the threat model. When the
backend fixes one, that test starts passing, strict mode turns it into a failure, and you
remove the marker.

The fixture sets `OWL_DEV_TOKEN` for a test app (no env or file token), sends it as
`Authorization: Bearer`, uses `Host: 127.0.0.1:8000`, and turns off the browser tool so
fuzzing never launches Chromium.

Run them (they're skipped automatically when Schemathesis or Hypothesis isn't installed):

```bash
cd services/agent
.venv/bin/pip install schemathesis==4.31.0 hypothesis==6.169.0
.venv/bin/python -m pytest tests/fuzzing -q
```

Expected result: `13 passed, 10 xfailed` plus 135 Schemathesis subtests, in about 1–2 minutes.
For a deeper run, raise `FUZZ_EXAMPLES_PER_OPERATION` in `apiSchema_test.py` and
`max_examples` in the property tests locally. Don't commit the higher values.

## 3. The isolated lab

`security/lab` runs the OWL service and an attacker container on a Docker network created
with `internal: true`. It has no route to the internet, no port is published on the host, and
the workspace is a throwaway volume seeded with a sample project (including a `.env` canary
that must never come back from the API).

The service container runs with these limits:

- non-root user `10001`
- read-only root filesystem, with tmpfs for `/tmp`, `/data` (DB and token, mode 0700) and
  `$HOME`
- `no-new-privileges`
- all capabilities dropped
- 512 MB memory, 1 CPU, 128 processes, 1024 open files

The service requires its token (`OWL_REQUIRE_TOKEN=true`), so the dev token is off. The image
copies only `pyproject.toml` and `app/`, so your `.env` and venv never get into it.

```bash
security/lab/startLab.lab.sh      # build, start, and verify isolation
security/lab/stopLab.lab.sh       # stop and delete the workspace volume and network
security/lab/stopLab.lab.sh --purge   # also delete the lab images and the saved token
```

`startLab.lab.sh` refuses to report success unless all of these hold:

- the service runs as `10001`, read-only, with no capabilities and `no-new-privileges`
- the attacker container reaches `http://owl-service:8000/health`
- `GET /tasks` without a token returns 401, and with the lab token returns 200
- neither container can reach `https://example.com`, `1.1.1.1:80` or `1.1.1.1:443`
- no lab port is published on the host

The lab token is random, created once and stored at
`${XDG_STATE_HOME:-~/.local/state}/owl-lab/service.token` (0600).

### Attacking it

```bash
docker compose -f security/lab/compose.lab.yml exec attacker sh
# inside: curl, python3, jq and dig are available
curl -s http://owl-service:8000/health
curl -s -H "Authorization: Bearer $TOKEN" http://owl-service:8000/security/status | jq
```

To use full Kali tooling, attach a Kali container to the same internal network. It has no
internet access either:

```bash
docker run --rm -it --network owl-lab_lab kalilinux/kali-rolling
```

Install tools into a Kali image you built beforehand, because the lab network can't download.
The attacker container drops all capabilities. Tools that need raw sockets (`nmap -sS`) need
`--cap-add NET_RAW` on your own Kali container.

The service only accepts the Host names `owl-service`, `127.0.0.1` and `localhost` with port
8000. Any other Host gets 421, which is the DNS-rebinding guard working.

Inside the lab, `/security/status` reports the sandbox as `none` because the container has no
`bwrap`. Commands run unsandboxed *inside* the container, and the container is the boundary.
To test the bubblewrap sandbox itself, run the service on the host (see
`services/agent/README.md`) or with `OWL_SANDBOX_BACKEND=docker`.

### Ideas to try

- Get a 2xx without the token: header tricks, `?token=` on routes other than `/events`, odd
  methods, path normalisation.
- Read the `.env` canary or anything outside `/workspace/sample` through tool calls.
- Make `POST /browser/capture` reach another container or `169.254.169.254`.
- Exhaust memory or processes. The container limits should contain it.
