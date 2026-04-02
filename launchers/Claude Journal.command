#!/bin/bash
# macOS: Double-click this file to start Claude Journal
# It will open in your browser automatically

cd "$(dirname "$0")/.."

# Check Node.js
if ! command -v node &>/dev/null; then
  osascript -e 'display alert "Node.js Required" message "Please install Node.js from https://nodejs.org" as critical'
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --omit=dev
fi

# Kill any existing instance
PID_FILE="/tmp/claude-journal.pid"
if [ -f "$PID_FILE" ]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null
  rm "$PID_FILE"
fi

# Start and open browser
echo ""
echo "  Starting Claude Journal..."
echo ""
node bin/cli.js --open
