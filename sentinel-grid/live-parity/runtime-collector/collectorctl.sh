#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$ROOT/config.json"
PID_FILE="$ROOT/collector.pid"
LOG_FILE="$ROOT/collector.log"
SERVER="$ROOT/server.mjs"

read_config() {
  node - "$CONFIG" "$1" <<'NODE'
const fs=require('node:fs');
const [file,key]=process.argv.slice(2);
const value=key.split('.').reduce((v,k)=>v?.[k],JSON.parse(fs.readFileSync(file,'utf8')));
if(value===undefined) process.exit(2);
process.stdout.write(String(value));
NODE
}

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  kill -0 "$pid" 2>/dev/null
}

case "${1:-status}" in
  start)
    if is_running; then echo "Collector already running: pid=$(cat "$PID_FILE")"; exit 0; fi
    : > "$LOG_FILE"
    nohup node "$SERVER" "$CONFIG" >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    for _ in {1..40}; do
      if curl -fsS "http://$(read_config host):$(read_config port)/v1/status" >/dev/null 2>&1; then
        echo "Collector started: pid=$(cat "$PID_FILE")"
        curl -fsS "http://$(read_config host):$(read_config port)/v1/status"
        exit 0
      fi
      sleep 0.1
    done
    echo "Collector failed to start. Log:" >&2
    cat "$LOG_FILE" >&2
    exit 1
    ;;
  stop)
    if ! is_running; then rm -f "$PID_FILE"; echo "Collector is not running"; exit 0; fi
    pid="$(cat "$PID_FILE")"
    kill "$pid"
    for _ in {1..30}; do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
    rm -f "$PID_FILE"
    echo "Collector stopped"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    if is_running; then
      echo "Collector process: RUNNING pid=$(cat "$PID_FILE")"
      curl -fsS "http://$(read_config host):$(read_config port)/v1/status"
    else
      echo "Collector process: STOPPED"
      exit 1
    fi
    ;;
  logs)
    tail -n "${2:-100}" "$LOG_FILE"
    ;;
  self-test)
    node "$ROOT/tests/self-test.mjs" "$(read_config kernelPath)"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs [lines]|self-test}" >&2
    exit 2
    ;;
esac
