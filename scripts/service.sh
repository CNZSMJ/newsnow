#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT_DIR/.run"
PID_FILE="$PID_DIR/newsnow.pid"
LOG_FILE="$ROOT_DIR/newsnow.log"
APP_ENTRY="dist/output/server/index.mjs"
PORT="${PORT:-3000}"

mkdir -p "$PID_DIR"

pid_cwd() {
  local pid="$1"
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
}

pid_command() {
  local pid="$1"
  ps -o command= -p "$pid" 2>/dev/null || true
}

is_managed_server_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ "$(pid_cwd "$pid")" == "$ROOT_DIR" ]] || return 1
  [[ "$(pid_command "$pid")" == *"$APP_ENTRY"* ]]
}

is_managed_wrapper_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ "$(pid_cwd "$pid")" == "$ROOT_DIR" ]] || return 1
  [[ "$(pid_command "$pid")" == *"pnpm start"* ]]
}

find_managed_server_pids() {
  local pid
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    if is_managed_server_pid "$pid"; then
      echo "$pid"
    fi
  done < <(pgrep -f "$APP_ENTRY" 2>/dev/null || true)
}

find_managed_wrapper_pids() {
  local pid
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    if is_managed_wrapper_pid "$pid"; then
      echo "$pid"
    fi
  done < <(pgrep -f "pnpm start" 2>/dev/null || true)
}

find_listener_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
}

current_service_pid() {
  local pid=""

  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if is_managed_server_pid "$pid"; then
      echo "$pid"
      return 0
    fi
  fi

  pid="$(find_listener_pid)"
  if is_managed_server_pid "$pid"; then
    echo "$pid"
    return 0
  fi

  pid="$(find_managed_server_pids | head -n 1)"
  if is_managed_server_pid "$pid"; then
    echo "$pid"
    return 0
  fi

  return 1
}

is_running() {
  local pid=""
  if pid="$(current_service_pid)"; then
    echo "$pid" > "$PID_FILE"
    return 0
  fi

  rm -f "$PID_FILE"
  return 1
}

port_in_use_by_foreign_process() {
  local pid=""
  pid="$(find_listener_pid)"
  [[ -n "$pid" ]] || return 1
  is_managed_server_pid "$pid" && return 1
  return 0
}

kill_pid_list() {
  local signal="$1"
  shift
  local pid
  for pid in "$@"; do
    [[ -n "$pid" ]] || continue
    kill "$signal" "$pid" 2>/dev/null || true
  done
}

start_service() {
  local pid=""
  if is_running; then
    echo "newsnow is already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  if port_in_use_by_foreign_process; then
    echo "Port $PORT is already in use by a non-newsnow process (pid $(find_listener_pid))." >&2
    return 1
  fi

  echo "Starting newsnow..."
  (
    cd "$ROOT_DIR"
    nohup node --env-file .env.server "$APP_ENTRY" </dev/null > "$LOG_FILE" 2>&1 &
    local child_pid=$!
    disown "$child_pid" 2>/dev/null || true
    echo "$child_pid" > "$PID_FILE"
  )

  pid="$(cat "$PID_FILE")"
  for _ in {1..20}; do
    if is_managed_server_pid "$pid" && [[ "$(find_listener_pid)" == "$pid" ]]; then
      echo "newsnow started (pid $pid)."
      echo "Log: $LOG_FILE"
      return 0
    fi

    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  echo "Failed to start newsnow. Check log: $LOG_FILE" >&2
  rm -f "$PID_FILE"
  return 1
}

stop_service() {
  local pids=()
  local pid=""
  local wrapper_pid=""

  pid="$(current_service_pid 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    pids+=("$pid")
  fi

  while read -r pid; do
    [[ -n "$pid" ]] || continue
    pids+=("$pid")
  done < <(find_managed_server_pids)

  while read -r wrapper_pid; do
    [[ -n "$wrapper_pid" ]] || continue
    pids+=("$wrapper_pid")
  done < <(find_managed_wrapper_pids)

  if [[ ${#pids[@]} -eq 0 ]]; then
    rm -f "$PID_FILE"
    echo "newsnow is not running."
    return 0
  fi

  mapfile -t pids < <(printf '%s\n' "${pids[@]}" | awk 'NF && !seen[$0]++')
  echo "Stopping newsnow (pid(s): ${pids[*]})..."
  kill_pid_list -TERM "${pids[@]}"

  for _ in {1..10}; do
    local alive=0
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
        break
      fi
    done
    if [[ "$alive" -eq 0 ]]; then
      rm -f "$PID_FILE"
      echo "newsnow stopped."
      return 0
    fi
    sleep 1
  done

  echo "Force killing newsnow (pid(s): ${pids[*]})..."
  kill_pid_list -KILL "${pids[@]}"
  rm -f "$PID_FILE"
  echo "newsnow stopped."
}

status_service() {
  if is_running; then
    echo "newsnow is running (pid $(cat "$PID_FILE"))."
  else
    echo "newsnow is not running."
  fi
}

logs_service() {
  local lines="${1:-120}"
  if [[ -f "$LOG_FILE" ]]; then
    tail -n "$lines" "$LOG_FILE"
  else
    echo "Log file not found: $LOG_FILE"
  fi
}

build_start_service() {
  stop_service
  cd "$ROOT_DIR"
  echo "Building newsnow..."
  pnpm build
  start_service
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/service.sh start
  bash scripts/service.sh stop
  bash scripts/service.sh restart
  bash scripts/service.sh status
  bash scripts/service.sh logs [lines]
  bash scripts/service.sh build-start
EOF
}

cmd="${1:-}"
case "$cmd" in
  start)
    start_service
    ;;
  stop)
    stop_service
    ;;
  restart)
    stop_service
    start_service
    ;;
  status)
    status_service
    ;;
  logs)
    logs_service "${2:-120}"
    ;;
  build-start)
    build_start_service
    ;;
  *)
    usage
    exit 1
    ;;
esac
