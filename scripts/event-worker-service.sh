#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$ROOT_DIR/newsnow-event-worker.log"
ENV_FILE="$ROOT_DIR/.env.server"
APP_ENTRY_ABS="$ROOT_DIR/dist/output/server/index.mjs"
LAUNCHD_LABEL="${LAUNCHD_LABEL:-com.huangjiahao.newsnow-event-worker}"
LAUNCHD_DOMAIN="gui/$(id -u)"
LAUNCHD_SERVICE_TARGET="$LAUNCHD_DOMAIN/$LAUNCHD_LABEL"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PLIST="$LAUNCHD_DIR/$LAUNCHD_LABEL.plist"
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"
EVENT_WORKER_PORT="${EVENT_WORKER_PORT:-3001}"
EVENT_BUS_INTERVAL_MS="${EVENT_BUS_INTERVAL_MS:-30000}"
EVENT_BUS_START_DELAY_MS="${EVENT_BUS_START_DELAY_MS:-1000}"
EVENT_BUS_SOURCE_IDS="${EVENT_BUS_SOURCE_IDS:-mktnews-flash,wallstreetcn-quick,wallstreetcn-news,wallstreetcn-hot,cls-depth,cls-hot,xueqiu-hotstock,gelonghui,fastbull-express,fastbull-news,eastmoney-7x24,sina-7x24,jin10}"
EVENT_BUS_MAX_SOURCES_PER_TICK="${EVENT_BUS_MAX_SOURCES_PER_TICK:-1}"
EVENT_BUS_ITEMS_PER_SOURCE="${EVENT_BUS_ITEMS_PER_SOURCE:-1}"

is_macos() {
  [[ "$(uname -s)" == "Darwin" ]]
}

launchd_loaded() {
  launchctl print "$LAUNCHD_SERVICE_TARGET" >/dev/null 2>&1
}

launchd_pid() {
  launchctl print "$LAUNCHD_SERVICE_TARGET" 2>/dev/null | awk -F'= ' '/pid = / {print $2; exit}'
}

launchd_state() {
  launchctl print "$LAUNCHD_SERVICE_TARGET" 2>/dev/null | awk -F'= ' '/state = / {print $2; exit}'
}

write_launchd_plist() {
  if [[ -z "$NODE_BIN" ]]; then
    echo "Unable to find node in PATH. Set NODE_BIN and retry." >&2
    return 1
  fi
  if [[ ! -f "$APP_ENTRY_ABS" ]]; then
    echo "Server build not found: $APP_ENTRY_ABS" >&2
    echo "Run './scripts/service.sh build-start' before starting the event worker." >&2
    return 1
  fi

  local path_dir="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  path_dir="$(dirname "$NODE_BIN"):$path_dir"

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
    <string>$EVENT_WORKER_PORT</string>
    <key>EVENT_BUS_WORKER</key>
    <string>true</string>
    <key>EVENT_BUS_INTERVAL_MS</key>
    <string>$EVENT_BUS_INTERVAL_MS</string>
    <key>EVENT_BUS_START_DELAY_MS</key>
    <string>$EVENT_BUS_START_DELAY_MS</string>
    <key>EVENT_BUS_SOURCE_IDS</key>
    <string>$EVENT_BUS_SOURCE_IDS</string>
    <key>EVENT_BUS_MAX_SOURCES_PER_TICK</key>
    <string>$EVENT_BUS_MAX_SOURCES_PER_TICK</string>
    <key>EVENT_BUS_ITEMS_PER_SOURCE</key>
    <string>$EVENT_BUS_ITEMS_PER_SOURCE</string>
    <key>EVENT_ENGINE_CAUSAL_HYPOTHESIS_WORKER</key>
    <string>false</string>
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

start_service() {
  if ! is_macos; then
    echo "launchd mode is only supported on macOS." >&2
    return 1
  fi
  if [[ ! -f "$LAUNCHD_PLIST" ]]; then
    write_launchd_plist
  fi
  if launchd_loaded; then
    launchctl kickstart -k "$LAUNCHD_SERVICE_TARGET"
  else
    launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST"
  fi
  status_service
}

stop_service() {
  if launchd_loaded; then
    launchctl bootout "$LAUNCHD_SERVICE_TARGET" >/dev/null 2>&1 || launchctl bootout "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST" >/dev/null 2>&1 || true
  fi
  echo "newsnow event worker stopped."
}

status_service() {
  if launchd_loaded; then
    local pid=""
    local state=""
    pid="$(launchd_pid)"
    state="$(launchd_state)"
    if [[ -n "$pid" ]]; then
      echo "newsnow event worker is running via launchd (pid $pid)."
    else
      echo "newsnow event worker launchd job is loaded${state:+ ($state)}, but no active pid was detected."
    fi
  else
    echo "newsnow event worker is not running."
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

install_service() {
  write_launchd_plist
  if launchd_loaded; then
    launchctl bootout "$LAUNCHD_SERVICE_TARGET" >/dev/null 2>&1 || true
  fi
  launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST"
  status_service
  echo "Installed launchd service: $LAUNCHD_PLIST"
}

uninstall_service() {
  stop_service >/dev/null 2>&1 || true
  rm -f "$LAUNCHD_PLIST"
  echo "Removed launchd service: $LAUNCHD_PLIST"
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/event-worker-service.sh start
  bash scripts/event-worker-service.sh stop
  bash scripts/event-worker-service.sh restart
  bash scripts/event-worker-service.sh status
  bash scripts/event-worker-service.sh logs [lines]
  bash scripts/event-worker-service.sh launchd-install
  bash scripts/event-worker-service.sh launchd-uninstall
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
  launchd-install)
    install_service
    ;;
  launchd-uninstall)
    uninstall_service
    ;;
  *)
    usage
    exit 1
    ;;
esac
