#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || "${1:-}" == "help" ]]; then
  cat <<'EOF'
Usage:
  ./service.sh start
  ./service.sh stop
  ./service.sh restart
  ./service.sh status
  ./service.sh logs [lines]
  ./service.sh build-start
  ./service.sh --help
EOF
  exit 0
fi

exec bash "$ROOT_DIR/scripts/service.sh" "$@"
