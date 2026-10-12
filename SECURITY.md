# Security policy

OWL is a local-first desktop AI coding agent, released as open source under the GPL-3.0
(see [LICENSE](LICENSE)). It reads your project files and runs commands for you, so we take
security reports seriously and welcome them.

Maintainer: **Oluwayemi Oyinlola** ([portfolio.oyinlola.site](https://portfolio.oyinlola.site/))

## Supported versions

OWL is pre-1.0. Only the **latest published release** gets security fixes. Older releases
and unreleased branches don't. Fixes ship in a new release, not as patches to old ones.

| Version | Supported |
| --- | --- |
| Latest release (currently 0.1.x) | Yes |
| Anything older | No, please upgrade |

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub:

1. Go to the repository's **Security** tab:
   <https://github.com/oyinlola-tech/owl-agent/security>
2. Click **Report a vulnerability**. This opens a private advisory that only you and the
   maintainer can see.

This uses GitHub's private vulnerability reporting, which the repository owner has to turn on
(Settings → Code security → Private vulnerability reporting). If you don't see the button,
open a public issue that only asks for a private contact channel. Don't include any details.

A useful report has:

- the OWL version (release tag or commit) and your OS
- what an attacker controls (a website, repository content, model output, a local process…)
- steps to reproduce, ideally against the security lab (see below)
- the impact you saw and any fix you'd suggest

## What to expect

These are goals, not guarantees. OWL is maintained by one person in their own time.

| Step | Goal |
| --- | --- |
| Acknowledge your report | within 7 days |
| First assessment (accepted / need more info / out of scope) | within 14 days |
| Fix or mitigation for high or critical issues | within 90 days, sooner when we can |
| Public advisory | when the fix is released, crediting you unless you'd rather not be named |

We'll keep you updated in the private advisory and agree a disclosure date with you. Please
give us a reasonable chance to ship a fix before you disclose publicly.

## Scope

In scope:

- **Desktop app**: the React/Tauri shell in `apps/desktop`, including the webview, Tauri
  commands and capabilities, and how the service token is handled.
- **Local service**: the Python agent service in `services/agent`, including its HTTP API,
  token and Host checks, workspace path guard, command sandbox, approval flow, git and
  browser tools, and secret redaction.
- **Installers and install scripts**: the bundled installers and anything in
  `scripts/install`.
- **Release workflow**: `.github/workflows/desktop-release.yml` and the release artifacts and
  checksums it produces.

Out of scope:

- Third-party model providers (for example NVIDIA's API) and their own security. Report those
  to the provider. How OWL *handles* provider responses is in scope.
- Problems that need a malicious local administrator or root user, or malware already running
  as your user with full access to your files. See the residual risks in the threat model.
- Problems that only exist with `OWL_SANDBOX=off` or other settings that are documented as
  removing a protection.
- Missing hardening that has no exploitable impact, scanner output with no proof of impact,
  and social engineering.
- Denial of service against your own local machine that needs you to approve the action.

## Safe harbour

You're welcome to test OWL on **your own install, your own machines and your own accounts**.
If you act in good faith under this policy, we won't pursue or support legal action against
you for that research, and we'll treat it as authorised.

Good faith means you:

- only test systems and data you own or have permission to test
- don't access, change or keep other people's data
- don't degrade services other people rely on (for example a model provider's API)
- report what you find privately and give us time to fix it before disclosure

The isolated Docker lab in `security/lab` lets you attack a disposable OWL service without
touching your real projects or keys. It's the easiest way to stay within these rules.

## More information

- Threat model: [docs/security/threatModel.doc.md](docs/security/threatModel.doc.md)
- How to run the scanners, fuzz tests and lab:
  [docs/security/testingGuide.doc.md](docs/security/testingGuide.doc.md)
- Reviewed scanner findings: [security/accepted-findings.md](security/accepted-findings.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
