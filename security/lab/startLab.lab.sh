#!/usr/bin/env bash
set -euo pipefail

lab_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${lab_dir}/compose.lab.yml"
state_dir="${XDG_STATE_HOME:-${HOME}/.local/state}/owl-lab"
token_file="${state_dir}/service.token"
failures=0

print_usage() {
  cat <<'USAGE'
Usage: security/lab/startLab.lab.sh [--no-verify]

Builds and starts the OWL security lab: the OWL service and an attacker container on an
internal-only Docker network with no internet access and no published ports. Then proves
the service answers from the attacker container and that the lab cannot reach the internet.

  --no-verify   start the lab without running the isolation checks
USAGE
}

create_or_read_lab_token() {
  mkdir -p "${state_dir}"
  chmod 0700 "${state_dir}"
  if [[ ! -s "${token_file}" ]]; then
    (umask 077 && od -An -tx1 -N32 /dev/urandom | tr -d ' \n' > "${token_file}")
  fi
  OWL_LAB_TOKEN="$(cat "${token_file}")"
  export OWL_LAB_TOKEN
}

run_compose() {
  docker compose -f "${compose_file}" "$@"
}

report_check() {
  local outcome="$1" description="$2"
  if [[ "${outcome}" == "pass" ]]; then
    printf 'PASS  %s\n' "${description}"
  else
    printf 'FAIL  %s\n' "${description}"
    failures=$((failures + 1))
  fi
}

check_health_from_attacker() {
  local body
  if body="$(run_compose exec -T attacker curl -sS -m 5 -f http://owl-service:8000/health)"; then
    printf '      /health -> %s\n' "${body}"
    report_check pass "attacker container reaches the OWL service /health"
  else
    report_check fail "attacker container reaches the OWL service /health"
  fi
}

check_token_required_from_attacker() {
  local status
  status="$(run_compose exec -T attacker curl -s -m 5 -o /dev/null -w '%{http_code}' http://owl-service:8000/tasks || true)"
  printf '      GET /tasks without token -> %s\n' "${status}"
  if [[ "${status}" == "401" ]]; then
    report_check pass "requests without the service token are rejected"
  else
    report_check fail "requests without the service token are rejected"
  fi
  status="$(printf 'header = "Authorization: Bearer %s"\n' "${OWL_LAB_TOKEN}" \
    | run_compose exec -T attacker curl -s -m 5 --config - -o /dev/null -w '%{http_code}' \
      http://owl-service:8000/tasks || true)"
  printf '      GET /tasks with token -> %s\n' "${status}"
  if [[ "${status}" == "200" ]]; then
    report_check pass "requests with the lab token are accepted"
  else
    report_check fail "requests with the lab token are accepted"
  fi
}

check_no_internet_from_attacker() {
  if run_compose exec -T attacker curl -sS -m 5 -o /dev/null https://example.com 2>/dev/null; then
    report_check fail "attacker container has no internet access (https://example.com)"
  else
    report_check pass "attacker container has no internet access (https://example.com)"
  fi
  if run_compose exec -T attacker curl -sS -m 5 -o /dev/null http://1.1.1.1 2>/dev/null; then
    report_check fail "attacker container cannot reach a public IP (1.1.1.1)"
  else
    report_check pass "attacker container cannot reach a public IP (1.1.1.1)"
  fi
}

check_no_internet_from_service() {
  local probe='import socket,sys
try:
    socket.create_connection(("1.1.1.1", 443), timeout=4)
except OSError:
    sys.exit(0)
sys.exit(1)'
  if run_compose exec -T owl-service python -c "${probe}"; then
    report_check pass "OWL service container cannot reach the internet (1.1.1.1:443)"
  else
    report_check fail "OWL service container cannot reach the internet (1.1.1.1:443)"
  fi
}

check_nothing_published() {
  local published
  published="$(docker ps --filter "label=com.docker.compose.project=owl-lab" --format '{{.Names}} {{.Ports}}' | grep -E '0\.0\.0\.0|:::|->' || true)"
  if [[ -z "${published}" ]]; then
    report_check pass "no lab port is published on the host"
  else
    printf '      %s\n' "${published}"
    report_check fail "no lab port is published on the host"
  fi
}

check_service_hardening() {
  local inspect
  inspect="$(docker inspect --format '{{.Config.User}} ro={{.HostConfig.ReadonlyRootfs}} caps={{.HostConfig.CapDrop}} sec={{.HostConfig.SecurityOpt}} mem={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}}' "$(run_compose ps -q owl-service)")"
  printf '      %s\n' "${inspect}"
  if [[ "${inspect}" == 10001:10001\ ro=true\ caps=\[ALL\]* && "${inspect}" == *no-new-privileges* ]]; then
    report_check pass "service runs as non-root with a read-only root fs, no capabilities, no-new-privileges"
  else
    report_check fail "service runs as non-root with a read-only root fs, no capabilities, no-new-privileges"
  fi
}

verify_lab_isolation() {
  printf '\nVerifying the lab:\n'
  check_service_hardening
  check_health_from_attacker
  check_token_required_from_attacker
  check_no_internet_from_attacker
  check_no_internet_from_service
  check_nothing_published
  if (( failures > 0 )); then
    printf '\n%d check(s) failed. Stop the lab with security/lab/stopLab.lab.sh.\n' "${failures}"
    exit 1
  fi
  printf '\nAll lab checks passed.\n'
}

print_next_steps() {
  cat <<NEXT

Lab is running (project "owl-lab", network "owl-lab_lab", internal only).
  Service token file: ${token_file}
  Shell in the attacker:  docker compose -f ${compose_file} exec attacker sh
  Kali tools on the lab:  docker run --rm -it --network owl-lab_lab kalilinux/kali-rolling
  Target URL inside lab:  http://owl-service:8000   (send Host: owl-service)
  Stop and wipe:          ${lab_dir}/stopLab.lab.sh
NEXT
}

main() {
  local verify=1
  for arg in "$@"; do
    case "${arg}" in
      --no-verify) verify=0 ;;
      -h|--help) print_usage; return 0 ;;
      *) print_usage >&2; return 2 ;;
    esac
  done
  command -v docker >/dev/null || { echo "docker is required" >&2; return 1; }
  create_or_read_lab_token
  run_compose up --detach --build --wait --wait-timeout 180
  if (( verify == 1 )); then
    verify_lab_isolation
  fi
  print_next_steps
}

main "$@"
