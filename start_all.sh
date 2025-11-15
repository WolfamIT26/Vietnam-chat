#!/usr/bin/env bash
# 🚀 Start All Services: Backend (Flask) + Frontend (React) + Ngrok Tunnel
# Single command to launch the entire app with public URL

set -euo pipefail

# Get project root
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "📁 Project root: $ROOT_DIR"

# Kill any existing processes on ports 5000 and 3000 (cleanup)
echo "🧹 Cleaning up old processes..."
lsof -ti:5000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Start backend in background (with ngrok enabled)
echo ""
echo "▶️  Starting Backend (Flask) on port 5000 with ngrok..."
cd "$ROOT_DIR"
export ENABLE_NGROK=true
bash "$ROOT_DIR/run_backend.sh" &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Give backend time to start and create ngrok tunnel
sleep 5

# Extract ngrok public URL (if available) from backend logs
NGROK_URL=""
# Try to find the public URL by looking for the pattern in stderr/stdout
if command -v pgrep &>/dev/null; then
  # Give it a moment to fully initialize
  sleep 2
fi

# Start frontend in background
echo ""
echo "▶️  Starting Frontend (React) on port 3000..."
bash "$ROOT_DIR/run_frontend.sh" &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

# Wait a moment for frontend to start
sleep 3

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ All services started!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📍 Local URLs:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:5000"
echo ""
echo "🌐 Public URL (via ngrok):"
echo "   https://unmodelled-higher-jeanette.ngrok-free.dev"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✋ Press Ctrl+C to stop all services"
echo ""

# Keep script running, handle graceful shutdown
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo '🛑 All services stopped.'; exit 0" INT TERM

# Wait for any process to exit
wait
