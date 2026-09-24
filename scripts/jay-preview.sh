#!/usr/bin/env bash
# JAY development preview — runs Hermes WebUI + the JAY extension in an
# isolated, loopback-only sandbox. It never reads or writes ~/.hermes, never
# inherits provider/gateway credentials from your shell, and never binds a
# public interface.
#
# Usage:
#   scripts/jay-preview.sh setup        # create .venv with runtime deps (once)
#   scripts/jay-preview.sh start        # foreground; Ctrl+C stops it
#   scripts/jay-preview.sh start --bg   # background; logs to $JAY_PREVIEW_HOME/preview.log
#   scripts/jay-preview.sh stop         # stop a background preview
#   scripts/jay-preview.sh status
#   scripts/jay-preview.sh reset        # wipe the isolated preview server state
#
# Environment (all optional):
#   JAY_PREVIEW_PORT      default 8789
#   JAY_PREVIEW_HOME      default ~/.jay-preview (must not be inside ~/.hermes)
#   JAY_PREVIEW_PASSWORD  enable Hermes WebUI password auth for the preview
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${JAY_PREVIEW_PORT:-8789}"
HOST="127.0.0.1"
PREVIEW_HOME="${JAY_PREVIEW_HOME:-$HOME/.jay-preview}"
PID_FILE="$PREVIEW_HOME/preview.pid"
LOG_FILE="$PREVIEW_HOME/preview.log"
EXT_DIR="$REPO_ROOT/jay/extension"

die() { echo "[jay-preview] $*" >&2; exit 1; }
say() { echo "[jay-preview] $*"; }

# ── Safety: the preview home must never be (or sit inside) a real Hermes home.
resolve() { python3 -c 'import os,sys; print(os.path.realpath(os.path.expanduser(sys.argv[1])))' "$1"; }
PREVIEW_HOME_REAL="$(resolve "$PREVIEW_HOME")"
PROD_HOME_REAL="$(resolve "$HOME/.hermes")"
case "$PREVIEW_HOME_REAL/" in
  "$PROD_HOME_REAL/"*) die "JAY_PREVIEW_HOME ($PREVIEW_HOME_REAL) is inside $PROD_HOME_REAL. Refusing." ;;
esac
[[ "$PORT" =~ ^[0-9]+$ ]] || die "JAY_PREVIEW_PORT must be a number."

pick_python() {
  if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then echo "$REPO_ROOT/.venv/bin/python"; return; fi
  command -v python3 || die "python3 not found."
}

# PATH without any directory that ships a `hermes` CLI, so WebUI actions such
# as "Restart Service" cannot reach the production gateway from the preview.
safe_path() {
  local out="" dir
  IFS=':' read -r -a dirs <<< "${PATH:-/usr/bin:/bin}"
  for dir in "${dirs[@]}"; do
    [[ -z "$dir" || -x "$dir/hermes" ]] && continue
    out="${out:+$out:}$dir"
  done
  echo "${out:-/usr/bin:/bin}"
}

running_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid; pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && { echo "$pid"; return 0; }
  return 1
}

cmd_setup() {
  if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
    say ".venv already exists — installing/updating runtime requirements."
  else
    python3 -m venv "$REPO_ROOT/.venv" || die "python3 -m venv failed (install python3-venv)."
  fi
  "$REPO_ROOT/.venv/bin/python" -m pip install --quiet -r "$REPO_ROOT/requirements.txt"
  say "Ready. Next: scripts/jay-preview.sh start"
}

cmd_start() {
  local bg="${1:-}"
  [[ -f "$EXT_DIR/extensions.json" ]] || die "JAY extension not found at $EXT_DIR."
  if pid="$(running_pid)"; then die "Already running (pid $pid) on http://$HOST:$PORT"; fi
  if curl -fsS -o /dev/null --max-time 1 "http://$HOST:$PORT/health" 2>/dev/null; then
    die "Something is already listening on $HOST:$PORT. Set JAY_PREVIEW_PORT to another port."
  fi
  local py; py="$(pick_python)"
  "$py" -c 'import yaml, cryptography' 2>/dev/null || die "Missing runtime deps for $py. Run: scripts/jay-preview.sh setup"

  mkdir -p "$PREVIEW_HOME/hermes-home" "$PREVIEW_HOME/webui-state" "$PREVIEW_HOME/workspace" "$PREVIEW_HOME/empty"
  local -a envv=(
    "PATH=$(safe_path)" "HOME=$HOME" "LANG=${LANG:-C.UTF-8}" "TERM=${TERM:-dumb}" "USER=${USER:-jay}"
    "HERMES_HOME=$PREVIEW_HOME/hermes-home"
    "HERMES_BASE_HOME=$PREVIEW_HOME/hermes-home"
    "HERMES_CONFIG_PATH=$PREVIEW_HOME/hermes-home/config.yaml"
    "HERMES_WEBUI_STATE_DIR=$PREVIEW_HOME/webui-state"
    "HERMES_WEBUI_DEFAULT_WORKSPACE=$PREVIEW_HOME/workspace"
    "HERMES_WEBUI_HOST=$HOST"
    "HERMES_WEBUI_PORT=$PORT"
    "HERMES_WEBUI_SKIP_ONBOARDING=1"
    "HERMES_WEBUI_EXTENSION_DIR=$EXT_DIR"
    "HERMES_WEBUI_EXTENSION_MANIFEST=extensions.json"
    "HERMES_WEBUI_CLAUDE_PROJECTS_DIR=$PREVIEW_HOME/empty"
    "CODEX_HOME=$PREVIEW_HOME/empty"
    "HERMES_WEBUI_PASSWORD=${JAY_PREVIEW_PASSWORD:-}"
  )

  say "JAY preview on http://$HOST:$PORT  (isolated state: $PREVIEW_HOME)"
  say "Remote: ssh -N -L $PORT:127.0.0.1:$PORT <user>@<server>  then open http://localhost:$PORT"
  cd "$REPO_ROOT"
  if [[ "$bg" == "--bg" ]]; then
    nohup env -i "${envv[@]}" "$py" "$REPO_ROOT/server.py" >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
    for _ in $(seq 1 30); do
      curl -fsS -o /dev/null --max-time 1 "http://$HOST:$PORT/health" 2>/dev/null && { say "Started (pid $(cat "$PID_FILE")). Logs: $LOG_FILE"; return 0; }
      sleep 0.5
    done
    die "Server did not become healthy. See $LOG_FILE"
  fi
  exec env -i "${envv[@]}" "$py" "$REPO_ROOT/server.py"
}

cmd_stop() {
  if pid="$(running_pid)"; then
    kill "$pid" && rm -f "$PID_FILE" && say "Stopped (pid $pid)."
  else
    rm -f "$PID_FILE"; say "No background preview running. (A foreground preview stops with Ctrl+C.)"
  fi
}

cmd_status() {
  if pid="$(running_pid)"; then say "Running (pid $pid) on http://$HOST:$PORT"; else say "Not running (background)."; fi
  if curl -fsS -o /dev/null --max-time 1 "http://$HOST:$PORT/health" 2>/dev/null; then say "Health: ok on $HOST:$PORT"; fi
}

cmd_reset() {
  if running_pid >/dev/null; then die "Stop the preview first: scripts/jay-preview.sh stop"; fi
  [[ -d "$PREVIEW_HOME" ]] || { say "Nothing to reset."; return 0; }
  rm -rf -- "$PREVIEW_HOME_REAL/hermes-home" "$PREVIEW_HOME_REAL/webui-state" "$PREVIEW_HOME_REAL/workspace" "$PREVIEW_HOME_REAL/empty" "$PREVIEW_HOME_REAL/preview.log"
  say "Preview server state wiped ($PREVIEW_HOME_REAL). Browser demo data resets from System → Reset demo data."
}

case "${1:-start}" in
  setup) cmd_setup ;;
  start) cmd_start "${2:-}" ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  reset) cmd_reset ;;
  -h|--help|help) sed -n '2,20p' "$0" ;;
  *) die "Unknown command: $1 (try: setup | start [--bg] | stop | status | reset)" ;;
esac
