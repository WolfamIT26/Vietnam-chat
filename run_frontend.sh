#!/usr/bin/env bash
# Start React Frontend on port 3000 (uses project-relative path so it works in different clones)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"

echo "🚀 Starting React Frontend..."
echo "� Client dir: $CLIENT_DIR"
echo "�📍 Port: 3000"
echo "🌐 URL: http://localhost:3000"
echo ""

cd "$CLIENT_DIR"

# Allow overriding the API/socket URLs via env vars if needed
REACT_APP_API_URL=${REACT_APP_API_URL:-http://localhost:5000} \
REACT_APP_SOCKET_URL=${REACT_APP_SOCKET_URL:-http://localhost:5000} \
npm start
