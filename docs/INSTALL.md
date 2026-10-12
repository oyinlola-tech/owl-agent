# Installing OWL

OWL is a desktop app for Windows, macOS and Linux. Each installer contains the
app window and the OWL agent service. The service starts with the app, listens
only on `127.0.0.1:8000`, and stops when you quit.

Releases are published at
<https://github.com/oyinlola-tech/owl-agent/releases>.

> **Read this first: the builds are not signed.**
> Code signing (Windows Authenticode) and Apple notarization are **not set up**.
> Windows SmartScreen and macOS Gatekeeper will warn you the first time you
> open OWL. Only bypass the warning for a file whose SHA-256 checksum matches
> `SHA256SUMS.txt` from the same release (see [Check a download](#check-a-download)).

## Contents

1. [Download page](#1-download-page)
2. [One-line installers](#2-one-line-installers)
3. [GitHub CLI](#3-github-cli)
4. [Manual install](#4-manual-install)
5. [Check a download](#check-a-download)
6. [Opening OWL from links (`owl://`)](#opening-owl-from-links-owl)
7. [Where OWL keeps its data](#where-owl-keeps-its-data)
8. [Build from source](#build-from-source)
9. [What has not been verified](#what-has-not-been-verified)

## 1. Download page

The website's `/download` page links to the newest release files for your
system. It uses the same release files as every method below.

## 2. One-line installers

The installers find the newest release (or the one you name), download the
right file into a temporary folder, check its SHA-256 against `SHA256SUMS.txt`
from the same release, install it, and delete the temporary files. They stop
without installing anything if the checksum file is missing or does not match.

### macOS and Linux

```sh
curl -fsSL https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.sh | sh
```

To read the script before running it:

```sh
curl -fsSLO https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.sh
less owl.install.sh
sh owl.install.sh --help
sh owl.install.sh --dry-run
sh owl.install.sh
```

What it installs:

| System | File used | Where it goes |
| --- | --- | --- |
| macOS Apple silicon | `OWL_<version>_aarch64.dmg` | `/Applications/OWL.app` (or `~/Applications` if `/Applications` is not writable) |
| macOS Intel | `OWL_<version>_x64.dmg` | same as above |
| Linux x64 (default) | `OWL_<version>_amd64.AppImage` | `~/.local/bin/owl`, plus a menu entry in `~/.local/share/applications/owl.desktop` and an icon |
| Linux x64, `OWL_INSTALL_FORMAT=deb` | `OWL_<version>_amd64.deb` | system-wide through `sudo dpkg -i` |
| Linux x64, `OWL_INSTALL_FORMAT=rpm` | `OWL-<version>-1.x86_64.rpm` | system-wide through `sudo rpm -i` |

Options (environment variables):

- `OWL_VERSION=v0.1.0` installs that release instead of the newest one.
- `OWL_INSTALL_FORMAT=deb` or `rpm` (Linux) picks a package instead of the AppImage.
- `OWL_SKIP_CHECKSUM=1` installs even when the checksum is missing or wrong. It
  prints a warning. Do not use it unless you know why the check failed.

Example:

```sh
curl -fsSL https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.sh | OWL_INSTALL_FORMAT=deb sh
```

Before it runs `sudo`, the script prints the exact command.

The AppImage needs FUSE 2 on some distributions (`sudo apt install libfuse2`
on Ubuntu 22.04 and later).

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.ps1 | iex
```

It downloads `OWL_<version>_x64-setup.exe`, checks it with `Get-FileHash`,
and starts the installer. To use the MSI instead:

```powershell
$env:OWL_INSTALL_FORMAT = "msi"
irm https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.ps1 | iex
```

`$env:OWL_VERSION`, `$env:OWL_SKIP_CHECKSUM` and `$env:OWL_DRY_RUN = "1"`
work like the options above.

## 3. GitHub CLI

```sh
gh release download --repo oyinlola-tech/owl-agent --pattern 'SHA256SUMS.txt' --pattern 'OWL_*_amd64.AppImage'
sha256sum --check --ignore-missing SHA256SUMS.txt
```

Change the second `--pattern` for your system: `'OWL_*_aarch64.dmg'`,
`'OWL_*_x64.dmg'`, `'OWL_*_amd64.deb'`, `'OWL-*.x86_64.rpm'`,
`'OWL_*_x64-setup.exe'` or `'OWL_*_x64_*.msi'`. Add a tag (for example
`gh release download v0.1.0 ...`) to pick a version.

## 4. Manual install

Download the file for your system and `SHA256SUMS.txt` from the release page,
[check the download](#check-a-download), then:

### Windows

Run `OWL_<version>_x64-setup.exe` (installs for your user only) or
`OWL_<version>_x64_en-US.msi` (installs for all users, needs admin rights).

Because the installer is not signed, SmartScreen may show
"Windows protected your PC". Click **More info**, then **Run anyway**.

### macOS

Open the `.dmg` and drag **OWL** into **Applications**.

Because the app is not notarized, macOS may say it "cannot be opened because
the developer cannot be verified" or that it "is damaged". To open it:

1. In Finder, open **Applications**, Control-click **OWL** and choose **Open**,
   then click **Open** again; or
2. Open **System Settings > Privacy & Security**, scroll to **Security** and
   click **Open Anyway** next to the OWL message.

If macOS still says the app is damaged, you can remove the quarantine flag
yourself. Only do this for a file whose checksum matched:

```sh
xattr -dr com.apple.quarantine /Applications/OWL.app
```

The install script never does this for you.

### Linux

- AppImage: `chmod +x OWL_<version>_amd64.AppImage` and run it.
- Debian / Ubuntu: `sudo apt install ./OWL_<version>_amd64.deb`
- Fedora / openSUSE: `sudo rpm -i OWL-<version>-1.x86_64.rpm`

## Check a download

Every release has `SHA256SUMS.txt`, one `<sha256>  <file name>` line per file.

- Linux: `sha256sum --check --ignore-missing SHA256SUMS.txt`
- macOS: `shasum -a 256 --check --ignore-missing SHA256SUMS.txt`
- Windows (PowerShell):

  ```powershell
  (Get-FileHash .\OWL_0.1.0_x64-setup.exe -Algorithm SHA256).Hash.ToLower()
  Select-String "OWL_0.1.0_x64-setup.exe" .\SHA256SUMS.txt
  ```

  The two hashes must be the same.

A matching checksum shows the file is the one the release workflow built. It
does not replace code signing: anyone who can change the release can change
both files.

## Opening OWL from links (`owl://`)

Installed OWL handles `owl://` links, so the website can open the app:

- `owl://app` brings the OWL window to the front.
- `owl://app/<screen>` opens a screen, where `<screen>` is one of
  `welcome`, `workspace`, `tasks`, `task`, `btask`, `browser`, `projects`,
  `memory`, `settings`, `inbox`, `history`, `models`, `tools`, `playbooks`,
  `help`. Example: `owl://app/inbox`.

Any other `owl://` link only brings the window to the front. If OWL is already
running, the link goes to the open window; a second copy (and a second
service) is never started.

How the link handler is registered:

- Windows (MSI or setup.exe), macOS (`OWL.app` in Applications), `.deb` and
  `.rpm`: registered when you install.
- AppImage: registered the first time you start OWL. The one-line installer
  also adds a menu entry that claims `owl://`.

## Where OWL keeps its data

The service stores its SQLite database and screenshots in the app data folder:

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\com.oyinlola.owl-agent` |
| macOS | `~/Library/Application Support/com.oyinlola.owl-agent` |
| Linux | `~/.local/share/com.oyinlola.owl-agent` (or `$XDG_DATA_HOME/com.oyinlola.owl-agent`) |

To configure the service (for example `NVIDIA_API_KEY` or `OWL_WORKSPACES`),
put a `.env` file in that folder. The settings are listed in
`services/agent/README.md`. Uninstalling OWL may leave this folder in place; delete it yourself to remove all data.

If another program already uses port 8000 when OWL starts, OWL does not start
its own service. If that program is an OWL service (for example one you started
from source), the app uses it. Otherwise the app runs with sample data and the
status bar shows "Service offline".

## Build from source

You need: Git, Node.js 24, Python 3.14 (3.11 or newer works for the service),
Rust (stable, via <https://rustup.rs>), and the Tauri system libraries
(<https://tauri.app/start/prerequisites/>; on Ubuntu:
`sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`).

```sh
git clone https://github.com/oyinlola-tech/owl-agent.git
cd owl-agent

cd services/agent
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]" "pyinstaller==6.16.0"
.venv/bin/python packaging/buildServiceBinary_packaging.py
cd ../..

cd apps/desktop
npm ci
npx tauri build
```

`buildServiceBinary_packaging.py` writes
`apps/desktop/src-tauri/binaries/owl-service-<rust target triple>` (with `.exe`
on Windows), which Tauri bundles as a sidecar. `tauri build` (and `tauri dev`)
fail if that file is missing, so build it first. The installers end up in
`apps/desktop/src-tauri/target/release/bundle/`.

To build only some formats: `npx tauri build --bundles deb,appimage`.

On Windows use `.venv\Scripts\python.exe` in place of `.venv/bin/python`.

### Run the service binary alone

```sh
apps/desktop/src-tauri/binaries/owl-service-x86_64-unknown-linux-gnu --port 8000 --data-dir /tmp/owl-data
curl http://127.0.0.1:8000/health
```

`--exit-when-stdin-closes` (used by the app) makes the service stop when its
parent process goes away.

### Releases

`.github/workflows/desktop-release.yml` runs on a `v*` tag push, or by hand
from the Actions tab. It builds the sidecar and the installers on Windows,
macOS (Apple silicon and Intel) and Linux, attaches them to a draft GitHub
release, then adds `SHA256SUMS.txt`. Publish the draft when you have checked
it. The one-line installers only see published releases.

## What has not been verified

- **Code signing and notarization are not configured.** Windows installers have
  no Authenticode signature; macOS builds are not signed with a Developer ID or
  notarized. Expect SmartScreen and Gatekeeper warnings.
- The Tauri shell (Rust code, sidecar start/stop, `owl://` links, single
  instance) has not been compiled or run by the author of this setup; the
  first real check is the release workflow.
- The installers have only been built by the release workflow, not tested on
  real Windows, macOS or Linux machines.
- The macOS Intel build uses the `macos-15-intel` GitHub runner; if GitHub
  retires that runner, remove that row from the workflow.
- The browser tools (Playwright) are not included in the bundled service, so
  the agent's browser actions are unavailable in the installed app.
- Linux ARM and Windows ARM installers are not built.
