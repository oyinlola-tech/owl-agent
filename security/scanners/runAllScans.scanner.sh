#!/usr/bin/env bash
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
scanner_dir="${repo_root}/security/scanners"
agent_dir="${repo_root}/services/agent"
desktop_dir="${repo_root}/apps/desktop"
results=()
failed=0

print_usage() {
  cat <<'USAGE'
Usage: security/scanners/runAllScans.scanner.sh [scanner ...]

Runs the same scanners as .github/workflows/security-scans.yml against your checkout and
prints a summary. With no arguments every scanner runs; otherwise only the named ones:
  bandit semgrep pip-audit npm-audit cargo-audit gitleaks trivy
Scanners that are not installed are reported as SKIPPED, never as passed.
USAGE
}

record_result() {
  local name="$1" outcome="$2"
  results+=("$(printf '%-12s %s' "${name}" "${outcome}")")
  if [[ "${outcome}" == FAILED* ]]; then
    failed=1
  fi
}

run_scanner() {
  local name="$1" tool="$2"
  shift 2
  if ! command -v "${tool}" >/dev/null 2>&1; then
    record_result "${name}" "SKIPPED (${tool} not installed)"
    return
  fi
  printf '\n===== %s =====\n' "${name}"
  if "$@"; then
    record_result "${name}" "passed"
  else
    record_result "${name}" "FAILED (exit $?)"
  fi
}

scan_with_bandit() {
  bandit -r "${agent_dir}/app" -c "${scanner_dir}/banditConfig.scanner.yaml" --exit-zero -q \
    && bandit -r "${agent_dir}/app" -c "${scanner_dir}/banditConfig.scanner.yaml" -q \
      --severity-level high --confidence-level medium
}

scan_with_semgrep() {
  SEMGREP_SEND_METRICS=off semgrep scan --metrics off --no-git-ignore --error --severity ERROR \
    --config p/python --config p/typescript --config p/react --config p/secrets \
    --config "${scanner_dir}/owlRules.scanner.yml" \
    --exclude node_modules --exclude target --exclude .venv --exclude dist --exclude __pycache__ \
    "${repo_root}/services" "${desktop_dir}/src" "${desktop_dir}/src-tauri/src" "${repo_root}/scripts"
}

scan_with_pip_audit() {
  local python="${agent_dir}/.venv/bin/python"
  if [[ ! -x "${python}" ]]; then
    echo "services/agent/.venv not found; create it first (see docs/security/testingGuide.doc.md)"
    return 1
  fi
  PIPAPI_PYTHON_LOCATION="${python}" pip-audit --progress-spinner off
}

scan_with_npm_audit() {
  (cd "${desktop_dir}" && npm audit --package-lock-only --audit-level=high)
}

scan_with_cargo_audit() {
  (cd "${desktop_dir}/src-tauri" && cargo audit)
}

scan_with_gitleaks() {
  local config="${scanner_dir}/gitleaksConfig.scanner.toml"
  (cd "${repo_root}" \
    && gitleaks git --no-banner --redact --config "${config}" . \
    && gitleaks dir --no-banner --redact --config "${config}" .)
}

scan_with_trivy() {
  trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL --exit-code 1 \
    --skip-dirs "${desktop_dir}/node_modules" --skip-dirs "${desktop_dir}/src-tauri/target" \
    --skip-dirs "${agent_dir}/.venv" "${repo_root}"
}

has_cargo_audit() {
  command -v cargo >/dev/null 2>&1 && cargo audit --version >/dev/null 2>&1
}

main() {
  local selected=("$@")
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    print_usage
    return 0
  fi
  if (( ${#selected[@]} == 0 )); then
    selected=(bandit semgrep pip-audit npm-audit cargo-audit gitleaks trivy)
  fi
  for name in "${selected[@]}"; do
    case "${name}" in
      bandit) run_scanner bandit bandit scan_with_bandit ;;
      semgrep) run_scanner semgrep semgrep scan_with_semgrep ;;
      pip-audit) run_scanner pip-audit pip-audit scan_with_pip_audit ;;
      npm-audit) run_scanner npm-audit npm scan_with_npm_audit ;;
      cargo-audit)
        if has_cargo_audit; then
          run_scanner cargo-audit cargo scan_with_cargo_audit
        else
          record_result cargo-audit "SKIPPED (cargo-audit not installed)"
        fi
        ;;
      gitleaks) run_scanner gitleaks gitleaks scan_with_gitleaks ;;
      trivy) run_scanner trivy trivy scan_with_trivy ;;
      *) print_usage >&2; return 2 ;;
    esac
  done
  printf '\n===== summary =====\n'
  printf '%s\n' "${results[@]}"
  return "${failed}"
}

main "$@"
