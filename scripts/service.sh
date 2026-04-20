#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT_DIR/.run"
PID_FILE="$PID_DIR/newsnow.pid"
LOG_FILE="$ROOT_DIR/newsnow.log"
APP_ENTRY="dist/output/server/index.mjs"
APP_ENTRY_ABS="$ROOT_DIR/$APP_ENTRY"
ENV_FILE="$ROOT_DIR/.env.server"
PORT="${PORT:-3000}"

LAUNCHD_LABEL="${LAUNCHD_LABEL:-com.huangjiahao.newsnow}"
LAUNCHD_DOMAIN="gui/$(id -u)"
LAUNCHD_SERVICE_TARGET="$LAUNCHD_DOMAIN/$LAUNCHD_LABEL"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PLIST="$LAUNCHD_DIR/$LAUNCHD_LABEL.plist"
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"

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

require_build() {
  if [[ -f "$APP_ENTRY_ABS" ]]; then
    return 0
  fi

  echo "Server build not found: $APP_ENTRY_ABS" >&2
  echo "Run './scripts/service.sh build-start' after installing dependencies." >&2
  return 1
}

is_macos() {
  [[ "$(uname -s)" == "Darwin" ]]
}

has_launchd_install() {
  [[ -f "$LAUNCHD_PLIST" ]]
}

launchd_loaded() {
  launchctl print "$LAUNCHD_SERVICE_TARGET" >/dev/null 2>&1
}

launchd_state() {
  launchctl print "$LAUNCHD_SERVICE_TARGET" 2>/dev/null | awk -F'= ' '/state = / {print $2; exit}'
}

launchd_pid() {
  launchctl print "$LAUNCHD_SERVICE_TARGET" 2>/dev/null | awk -F'= ' '/pid = / {print $2; exit}'
}

write_launchd_plist() {
  local path_dir="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  if [[ -n "$NODE_BIN" ]]; then
    path_dir="$(dirname "$NODE_BIN"):$path_dir"
  fi

  mkdir -p "$LAUNCHD_DIR"
  cat > "$LAUNCHD_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LAUNCHD_LABEL</string>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--env-file</string>
    <string>$ENV_FILE</string>
    <string>$APP_ENTRY_ABS</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$path_dir</string>
    <key>PORT</key>
    <string>$PORT</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>
</dict>
</plist>
EOF
}

stop_direct_service() {
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

start_direct_service() {
  local pid=""
  require_build

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
    nohup "$NODE_BIN" --env-file "$ENV_FILE" "$APP_ENTRY_ABS" </dev/null > "$LOG_FILE" 2>&1 &
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

status_direct_service() {
  if is_running; then
    echo "newsnow is running (pid $(cat "$PID_FILE"))."
  else
    echo "newsnow is not running."
  fi
}

start_launchd_service() {
  local pid=""
  require_build

  if ! is_macos; then
    echo "launchd mode is only supported on macOS." >&2
    return 1
  fi

  if ! has_launchd_install; then
    echo "launchd service is not installed. Run './scripts/service.sh launchd-install' first." >&2
    return 1
  fi

  if port_in_use_by_foreign_process; then
    echo "Port $PORT is already in use by a non-newsnow process (pid $(find_listener_pid))." >&2
    return 1
  fi

  if launchd_loaded && pid="$(current_service_pid 2>/dev/null || true)" && [[ -n "$pid" ]]; then
    echo "newsnow is already running via launchd (pid $pid)."
    return 0
  fi

  echo "Starting newsnow via launchd..."
  if launchd_loaded; then
    launchctl kickstart -k "$LAUNCHD_SERVICE_TARGET"
  else
    stop_direct_service >/dev/null 2>&1 || true
    launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST"
  fi

  for _ in {1..20}; do
    pid="$(current_service_pid 2>/dev/null || true)"
    if [[ -n "$pid" ]] && [[ "$(find_listener_pid)" == "$pid" ]]; then
      echo "$pid" > "$PID_FILE"
      echo "newsnow started via launchd (pid $pid)."
      echo "Log: $LOG_FILE"
      return 0
    fi
    sleep 1
  done

  echo "Failed to start newsnow via launchd. Check log: $LOG_FILE" >&2
  return 1
}

stop_launchd_service() {
  if ! has_launchd_install && ! launchd_loaded; then
    echo "launchd service is not installed."
    return 0
  fi

  if ! launchd_loaded; then
    rm -f "$PID_FILE"
    echo "newsnow is not running."
    return 0
  fi

  echo "Stopping newsnow via launchd..."
  launchctl bootout "$LAUNCHD_SERVICE_TARGET" >/dev/null 2>&1 || launchctl bootout "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST" >/dev/null 2>&1 || true

  for _ in {1..20}; do
    if ! launchd_loaded && ! is_running; then
      rm -f "$PID_FILE"
      echo "newsnow stopped."
      return 0
    fi
    sleep 1
  done

  rm -f "$PID_FILE"
  echo "newsnow stop requested via launchd; verify with './scripts/service.sh status' if needed."
}

status_launchd_service() {
  local pid=""
  local state=""

  if launchd_loaded; then
    pid="$(current_service_pid 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      echo "$pid" > "$PID_FILE"
      echo "newsnow is running via launchd (pid $pid)."
      return 0
    fi

    state="$(launchd_state)"
    echo "newsnow launchd job is loaded${state:+ ($state)}, but no active server pid was detected."
    return 0
  fi

  if has_launchd_install; then
    echo "newsnow launchd job is installed but not loaded."
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

launchd_install_service() {
  if ! is_macos; then
    echo "launchd mode is only supported on macOS." >&2
    return 1
  fi

  if [[ -z "$NODE_BIN" ]]; then
    echo "Unable to find a node binary in PATH. Set NODE_BIN and retry." >&2
    return 1
  fi

  require_build
  write_launchd_plist

  if launchd_loaded; then
    launchctl bootout "$LAUNCHD_SERVICE_TARGET" >/dev/null 2>&1 || true
  fi

  stop_direct_service >/dev/null 2>&1 || true
  launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST"
  start_launchd_service

  echo "Installed launchd service: $LAUNCHD_PLIST"
}

launchd_uninstall_service() {
  stop_launchd_service >/dev/null 2>&1 || true
  rm -f "$LAUNCHD_PLIST"
  echo "Removed launchd service: $LAUNCHD_PLIST"
}

using_launchd_mode() {
  has_launchd_install
}

start_service() {
  if using_launchd_mode; then
    start_launchd_service
  else
    start_direct_service
  fi
}

stop_service() {
  if using_launchd_mode || launchd_loaded; then
    stop_launchd_service
  else
    stop_direct_service
  fi
}

status_service() {
  if using_launchd_mode || launchd_loaded; then
    status_launchd_service
  else
    status_direct_service
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
  bash scripts/service.sh launchd-install
  bash scripts/service.sh launchd-uninstall
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
  launchd-install)
    launchd_install_service
    ;;
  launchd-uninstall)
    launchd_uninstall_service
    ;;
  *)
    usage
    exit 1
    ;;
esac
