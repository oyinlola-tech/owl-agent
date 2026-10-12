#!/usr/bin/env bash
set -euo pipefail

lab_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${lab_dir}/compose.lab.yml"
state_dir="${XDG_STATE_HOME:-${HOME}/.local/state}/owl-lab"

print_usage() {
  cat <<'USAGE'
Usage: security/lab/stopLab.lab.sh [--purge]

Stops the OWL security lab and deletes its disposable workspace volume and network.

  --purge   also delete the lab images and the saved lab token
USAGE
}

main() {
  local purge=0
  for arg in "$@"; do
    case "${arg}" in
      --purge) purge=1 ;;
      -h|--help) print_usage; return 0 ;;
      *) print_usage >&2; return 2 ;;
    esac
  done
  export OWL_LAB_TOKEN="${OWL_LAB_TOKEN:-stopping}"
  if (( purge == 1 )); then
    docker compose -f "${compose_file}" down --volumes --remove-orphans --rmi local
    rm -f "${state_dir}/service.token"
  else
    docker compose -f "${compose_file}" down --volumes --remove-orphans
  fi
  if docker ps -a --filter "label=com.docker.compose.project=owl-lab" --format '{{.Names}}' | grep -q .; then
    echo "Some lab containers are still present." >&2
    return 1
  fi
  echo "Lab stopped; workspace volume and lab network removed."
}

main "$@"
