#!/usr/bin/env bash
set -euo pipefail
slowview_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/workspace/slow-view-tv-browser}
cd "$slowview_repo"
slowview_action=${1:-start}
if [[ $# -gt 0 ]]; then shift; fi
case "$slowview_action" in
  start) slowview_entry=scripts/runpod-start.mjs ;;
  gpu-check) slowview_entry=scripts/runpod-gpu-check.mjs ;;
  *) printf '%s\n' 'Uso: bash scripts/runpod-start.sh [start|gpu-check]' >&2; exit 1 ;;
esac
if [[ $(id -u) == 0 ]]; then
  id slowview >/dev/null 2>&1 || { printf '%s\n' 'Execute scripts/runpod-setup.sh primeiro.' >&2; exit 1; }
  # runuser retains the injected application environment, without a password
  # appearing in arguments, files, generated commands, or logs.
  exec runuser -u slowview -- node "$slowview_entry" "$@"
fi
exec node "$slowview_entry" "$@"
