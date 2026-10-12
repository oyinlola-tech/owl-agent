#!/bin/sh
set -eu

REPO="oyinlola-tech/owl-agent"
API_URL="https://api.github.com/repos/${REPO}/releases"
CHECKSUM_FILE="SHA256SUMS.txt"
APP_NAME="OWL"
WORK_DIR=""
MOUNT_DIR=""
DRY_RUN=0

print_help() {
  cat <<'EOF'
Install the OWL desktop app on macOS or Linux from GitHub Releases.

Usage:
  curl -fsSL https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.sh | sh
  sh owl.install.sh [--dry-run] [--help]

Options:
  --dry-run   Show which release file would be installed, then stop.
  --help      Show this help.

Environment variables:
  OWL_VERSION=vX.Y.Z        Install this release tag instead of the latest one.
  OWL_INSTALL_FORMAT=FORMAT Linux only: appimage (default), deb, or rpm.
  OWL_SKIP_CHECKSUM=1       Install even when SHA256SUMS.txt is missing or does not match.
                            Not recommended.
  OWL_RELEASE_JSON=FILE     Read release details from FILE instead of the GitHub API
                            (for testing).

What it does:
  1. Finds the release on github.com/oyinlola-tech/owl-agent.
  2. Downloads the installer for your system to a temporary folder.
  3. Checks its SHA-256 against SHA256SUMS.txt from the same release.
  4. Installs it:
     macOS     copies OWL.app to /Applications (or ~/Applications).
     AppImage  copies it to ~/.local/bin/owl and adds a menu entry.
     deb/rpm   runs sudo dpkg -i / sudo rpm -i.
EOF
}

say() {
  printf '%s\n' "owl-install: $*"
}

fail() {
  printf '%s\n' "owl-install: error: $*" >&2
  exit 1
}

clean_up_temp_files() {
  if [ -n "$MOUNT_DIR" ] && [ -d "$MOUNT_DIR" ]; then
    hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
  fi
  if [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "'$1' is required but was not found"
}

download_file() {
  curl -fSL --proto '=https' --tlsv1.2 --retry 3 -o "$2" "$1"
}

detect_operating_system() {
  system_name="${OWL_OS:-$(uname -s)}"
  case "$system_name" in
    Darwin) echo "macos" ;;
    Linux) echo "linux" ;;
    *) fail "unsupported system '$system_name'. On Windows use owl.install.ps1." ;;
  esac
}

detect_architecture() {
  machine_name="${OWL_ARCH:-$(uname -m)}"
  case "$machine_name" in
    x86_64 | amd64) echo "x64" ;;
    arm64 | aarch64) echo "arm64" ;;
    *) fail "unsupported processor '$machine_name'" ;;
  esac
}

asset_name_pattern() {
  case "$1:$2:$3" in
    macos:arm64:*) echo '_aarch64\.dmg$' ;;
    macos:x64:*) echo '_x64\.dmg$' ;;
    linux:x64:appimage) echo '_amd64\.AppImage$' ;;
    linux:arm64:appimage) echo '_aarch64\.AppImage$' ;;
    linux:x64:deb) echo '_amd64\.deb$' ;;
    linux:arm64:deb) echo '_arm64\.deb$' ;;
    linux:x64:rpm) echo '\.x86_64\.rpm$' ;;
    linux:arm64:rpm) echo '\.aarch64\.rpm$' ;;
    *) fail "unknown install format '$3' (use appimage, deb, or rpm)" ;;
  esac
}

read_release_json() {
  if [ -n "${OWL_RELEASE_JSON:-}" ]; then
    cat "$OWL_RELEASE_JSON"
  elif [ -n "${OWL_VERSION:-}" ]; then
    curl -fsSL "${API_URL}/tags/${OWL_VERSION}" || fail "release ${OWL_VERSION} was not found"
  else
    curl -fsSL "${API_URL}/latest" || fail "could not read the latest release (none published yet?)"
  fi
}

list_download_urls() {
  printf '%s\n' "$1" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*"' |
    sed 's/.*"\(https:[^"]*\)"$/\1/'
}

read_tag_name() {
  printf '%s\n' "$1" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 |
    sed 's/.*"\([^"]*\)"$/\1/'
}

pick_url() {
  list_download_urls "$1" | grep -E "$2" | head -n 1 || true
}

sha256_of_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

verify_checksum() {
  file_path="$1"
  file_name="$2"
  sums_url="$3"
  if [ -z "$sums_url" ]; then
    if [ "${OWL_SKIP_CHECKSUM:-0}" = "1" ]; then
      say "WARNING: this release has no ${CHECKSUM_FILE}; installing WITHOUT checking the download."
      return 0
    fi
    fail "this release has no ${CHECKSUM_FILE}, so the download cannot be checked. Set OWL_SKIP_CHECKSUM=1 to install anyway (not recommended)."
  fi
  download_file "$sums_url" "$WORK_DIR/$CHECKSUM_FILE"
  expected=$(awk -v name="$file_name" '$2 == name || $2 == "*" name { print $1; exit }' "$WORK_DIR/$CHECKSUM_FILE")
  actual=$(sha256_of_file "$file_path")
  if [ -n "$expected" ] && [ "$expected" = "$actual" ]; then
    say "checksum OK ($actual)"
    return 0
  fi
  if [ "${OWL_SKIP_CHECKSUM:-0}" = "1" ]; then
    say "WARNING: checksum check FAILED for $file_name (expected '${expected:-none}', got '$actual')."
    say "WARNING: installing anyway because OWL_SKIP_CHECKSUM=1."
    return 0
  fi
  fail "checksum mismatch for $file_name (expected '${expected:-none}', got '$actual'). Nothing was installed."
}

install_on_macos() {
  need_command hdiutil
  MOUNT_DIR="$WORK_DIR/mount"
  mkdir -p "$MOUNT_DIR"
  hdiutil attach "$1" -nobrowse -readonly -quiet -mountpoint "$MOUNT_DIR"
  [ -d "$MOUNT_DIR/${APP_NAME}.app" ] || fail "${APP_NAME}.app was not found inside the disk image"
  target_dir="/Applications"
  if [ ! -w "$target_dir" ]; then
    target_dir="$HOME/Applications"
    mkdir -p "$target_dir"
  fi
  say "copying ${APP_NAME}.app to $target_dir"
  rm -rf "${target_dir:?}/${APP_NAME}.app"
  cp -R "$MOUNT_DIR/${APP_NAME}.app" "$target_dir/"
  hdiutil detach "$MOUNT_DIR" -quiet
  MOUNT_DIR=""
  say "installed $target_dir/${APP_NAME}.app"
  cat <<EOF

OWL is not signed or notarized yet, so macOS may refuse to open it the first time.
To open it:
  1. In Finder, open $target_dir, Control-click ${APP_NAME}.app and choose Open, then Open again.
  2. Or: System Settings > Privacy & Security, scroll to Security, click "Open Anyway".
This installer does not remove the macOS quarantine flag for you.
EOF
}

install_appimage_on_linux() {
  bin_dir="$HOME/.local/bin"
  apps_dir="$HOME/.local/share/applications"
  icon_dir="$HOME/.local/share/icons/hicolor/128x128/apps"
  mkdir -p "$bin_dir" "$apps_dir" "$icon_dir"
  cp "$1" "$bin_dir/owl"
  chmod +x "$bin_dir/owl"
  icon_url="https://raw.githubusercontent.com/${REPO}/$2/apps/desktop/src-tauri/icons/128x128.png"
  download_file "$icon_url" "$icon_dir/owl.png" 2>/dev/null || say "could not download the icon (menu entry will use a default icon)"
  cat >"$apps_dir/owl.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=OWL
Comment=Local-first AI coding agent
Exec=$bin_dir/owl %u
Icon=owl
Terminal=false
Categories=Development;
MimeType=x-scheme-handler/owl;
EOF
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$apps_dir" >/dev/null 2>&1 || true
  fi
  say "installed $bin_dir/owl and a menu entry"
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) say "note: $bin_dir is not on your PATH; add it to run 'owl' from a terminal" ;;
  esac
  say "AppImages need FUSE 2 (for example: sudo apt install libfuse2) on some distributions."
}

install_package_on_linux() {
  if [ "$2" = "deb" ]; then
    need_command dpkg
    say "about to run: sudo dpkg -i $1"
    sudo dpkg -i "$1" || fail "dpkg failed. If dependencies are missing run: sudo apt-get install -f"
  else
    need_command rpm
    say "about to run: sudo rpm -i $1"
    sudo rpm -i "$1" || fail "rpm failed (to upgrade an existing install use: sudo rpm -U <file>)"
  fi
  say "installed OWL from the $2 package"
}

main() {
  for argument in "$@"; do
    case "$argument" in
      -h | --help) print_help; exit 0 ;;
      --dry-run) DRY_RUN=1 ;;
      *) fail "unknown option '$argument' (see --help)" ;;
    esac
  done

  need_command curl
  os=$(detect_operating_system)
  arch=$(detect_architecture)
  format="dmg"
  if [ "$os" = "linux" ]; then
    format=$(printf '%s' "${OWL_INSTALL_FORMAT:-appimage}" | tr '[:upper:]' '[:lower:]')
  fi
  pattern=$(asset_name_pattern "$os" "$arch" "$format")

  release_json=$(read_release_json)
  tag=$(read_tag_name "$release_json")
  [ -n "$tag" ] || fail "could not read the release tag from the GitHub response"
  asset_url=$(pick_url "$release_json" "$pattern")
  [ -n "$asset_url" ] || fail "release $tag has no $format installer for $os/$arch"
  asset_name=${asset_url##*/}
  sums_url=$(pick_url "$release_json" "/${CHECKSUM_FILE}\$")

  say "release:  $tag"
  say "system:   $os $arch ($format)"
  say "file:     $asset_name"
  say "checksum: ${sums_url:-MISSING}"
  if [ "$DRY_RUN" = "1" ]; then
    say "dry run: nothing downloaded or installed"
    return 0
  fi
  if [ -z "$sums_url" ] && [ "${OWL_SKIP_CHECKSUM:-0}" != "1" ]; then
    fail "this release has no ${CHECKSUM_FILE}, so the download cannot be checked. Set OWL_SKIP_CHECKSUM=1 to install anyway (not recommended)."
  fi

  WORK_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t owl-install)
  trap clean_up_temp_files EXIT
  trap 'exit 130' INT TERM
  say "downloading $asset_name"
  download_file "$asset_url" "$WORK_DIR/$asset_name"
  verify_checksum "$WORK_DIR/$asset_name" "$asset_name" "$sums_url"

  case "$format" in
    dmg) install_on_macos "$WORK_DIR/$asset_name" ;;
    appimage) install_appimage_on_linux "$WORK_DIR/$asset_name" "$tag" ;;
    *) install_package_on_linux "$WORK_DIR/$asset_name" "$format" ;;
  esac
  say "done"
}

main "$@"
