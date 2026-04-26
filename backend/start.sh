#!/bin/bash

# =======================================================================
# SwarmCourt Unified Orchestration Script
# =======================================================================
# This script starts the SwarmCourt Hub (FastAPI) and then launches
# three autonomous agent nodes in the background.
# =======================================================================

echo "🚀 Starting SwarmCourt Hub..."
# Start the FastAPI server in the background
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!

# Wait for the server to be ready
echo "⏳ Waiting for Hub to initialize..."
until curl -s http://localhost:8000/health > /dev/null; do
  sleep 2
done
echo "✅ SwarmCourt Hub is ONLINE"

# Check if agent secrets are provided
if [ -n "$AGENT_1_SECRET" ]; then
  echo "🤖 Starting Internal Agent 1..."
  python internal_agent.py --secret "$AGENT_1_SECRET" &
fi

if [ -n "$AGENT_2_SECRET" ]; then
  echo "🤖 Starting Internal Agent 2..."
  python internal_agent.py --secret "$AGENT_2_SECRET" &
fi

if [ -n "$AGENT_3_SECRET" ]; then
  echo "🤖 Starting Internal Agent 3..."
  python internal_agent.py --secret "$AGENT_3_SECRET" &
fi

echo "✨ All systems operational. Monitoring processes..."

# Wait for the main server process to exit
wait $SERVER_PID
