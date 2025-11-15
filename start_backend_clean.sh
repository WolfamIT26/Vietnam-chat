#!/usr/bin/env bash
# Compact backend starter + concise runtime info for sharing
# Usage: ./start_backend_clean.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$ROOT_DIR/backend.log"
PID_FILE="$ROOT_DIR/backend.pid"

echo "Starting backend (concise mode). Logs -> $LOG_FILE"

# Kill previous background process if pidfile exists
if [ -f "$PID_FILE" ]; then
  OLDPID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$OLDPID" ] && ps -p "$OLDPID" > /dev/null 2>&1; then
    echo "Stopping previous backend pid=$OLDPID"
    kill "$OLDPID" || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# Start backend with ngrok enabled and capture output
export ENABLE_NGROK=true
bash "$ROOT_DIR/run_backend.sh" > "$LOG_FILE" 2>&1 &
BGPID=$!
echo "$BGPID" > "$PID_FILE"
echo "Backend PID: $BGPID"

echo "Waiting for startup info..."

# Tail log and print concise lines
tail -n +1 -F "$LOG_FILE" | while IFS= read -r line; do
  # print ngrok public URL when seen
  if [[ "$line" =~ https://[a-zA-Z0-9.-]+\.ngrok(-free)?\.dev || "$line" =~ https://[a-zA-Z0-9._-]+\.ngrok(io|\.app|\.dev)? ]]; then
    # extract first https://... substring
    url=$(echo "$line" | grep -oE 'https://[A-Za-z0-9./:_-]*' | head -n1)
    if [[ -n "$url" ]]; then
      # determine protocols
      if [[ "$url" == https:* ]]; then
        proto_http="HTTPS"
        proto_ws="WSS"
      else
        proto_http="HTTP"
        proto_ws="WS"
      fi
      echo "[PUBLIC] $url  — protocols: $proto_http, $proto_ws"
    fi
    continue
  fi

  # Werkzeug running lines (local URLs)
  if [[ "$line" =~ "Running on" && "$line" =~ http ]]; then
    # e.g. * Running on http://127.0.0.1:5000
    url=$(echo "$line" | grep -oE 'http://[0-9.]+:[0-9]+' | head -n1)
    if [[ -n "$url" ]]; then
      echo "[LOCAL]  $url  — protocol: HTTP"
    fi
    continue
  fi

  # Socket connect messages from our app
  if [[ "$line" =~ "[SOCKET] Connected" || "$line" =~ "✅ [SOCKET] Connected" ]]; then
    echo "[SOCKET] Connected -> see full log for details"
    continue
  fi

  # Print any chat-tagged lines (clear [CHAT] prefixes for concise terminal)
  if [[ "$line" =~ "[CHAT]" || "$line" =~ "[CHAT][NHẬN]" || "$line" =~ "[CHAT][GỬI]" ]]; then
    # print the whole line (already concise in handlers)
    echo "$line"
    continue
  fi

  # Show register/login success concise lines
  if [[ "$line" =~ "POST /register" ]]; then
    echo "[API] POST /register -> $(echo "$line" | awk '{print $9,$10}')"
    continue
  fi

  if [[ "$line" =~ "POST /login" ]]; then
    echo "[API] POST /login -> $(echo "$line" | awk '{print $9,$10}')"
    continue
  fi

  # Print any warnings or errors explicitly
  if [[ "$line" =~ "ERROR" || "$line" =~ "WARNING" || "$line" =~ "Traceback" ]]; then
    echo "[WARN] $line"
    continue
  fi

  # Keep other lines quiet
done
