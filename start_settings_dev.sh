#!/bin/bash
# Start Settings Mock Server and Frontend

echo "🚀 Starting Settings Module Development Environment"
echo "=================================================="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Start mock server in background
echo "📡 Starting Mock Server on port 3001..."
cd settings-mock-server
if [ ! -d "node_modules" ]; then
    echo "📦 Installing mock server dependencies..."
    npm install
fi
npm start &
MOCK_PID=$!
echo "✓ Mock Server started (PID: $MOCK_PID)"
echo ""

# Wait for mock server to be ready
sleep 3

# Start frontend
echo "🎨 Starting Frontend on port 3000..."
cd ../client
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
fi

npm start &
FRONTEND_PID=$!
echo "✓ Frontend started (PID: $FRONTEND_PID)"
echo ""

echo "=================================================="
echo "✅ Settings Module is running!"
echo ""
echo "📡 Mock Server: http://localhost:3001"
echo "🎨 Frontend: http://localhost:3000"
echo "⚙️  Settings: http://localhost:3000/settings"
echo ""
echo "To stop:"
echo "  kill $MOCK_PID $FRONTEND_PID"
echo "  or press Ctrl+C"
echo "=================================================="

# Wait for both processes
wait $MOCK_PID $FRONTEND_PID
