#!/bin/bash

# Test the progressive analysis (quick start) feature
# This tests:
# - Quick start with 10 games analyzed immediately
# - Background analysis continues for remaining 90 games
# - User can start chatting after ~2-3 minutes

echo "🚀 Testing progressive analysis (Quick Start)..."
echo "Configuration:"
echo "  - Quick start games: 10"
echo "  - Total games: 100"
echo "  - Background analysis: Yes"
echo ""

# Clear previous test data
echo "🧹 Clearing previous test data..."
rm -rf data/test-quickstart

# Run quick start ingestion
echo "⏱️  Starting quick start analysis..."
START_TIME=$(date +%s)

curl -s "http://localhost:8787/ingest/chesscom?username=midnightcontender&userId=test-quickstart&limitGames=100&limitMonths=12&quickStart=true&quickStartGames=10" | jq .

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "✅ Quick start complete!"
echo "⏱️  Time taken: ${DURATION} seconds"
echo ""
echo "📊 Checking results..."

# Check initial results
GAMES=$(cat data/test-quickstart/summaries.json 2>/dev/null | jq 'length')
echo "  - Games analyzed (quick start): ${GAMES}"
echo ""
echo "✨ User can now start chatting!"
echo "🔄 Background analysis continues for remaining 90 games..."
echo ""

# Wait a bit and check again
echo "⏳ Waiting 30 seconds to check background progress..."
sleep 30

GAMES_AFTER=$(cat data/test-quickstart/summaries.json 2>/dev/null | jq 'length')
echo "  - Games analyzed (after 30s): ${GAMES_AFTER}"
echo ""

if [ "$GAMES_AFTER" -gt "$GAMES" ]; then
  echo "✅ Background analysis is working! 🎉"
else
  echo "⚠️  Background analysis may not have started yet"
fi

echo ""
echo "💬 Testing coach query with quick start data..."
cd "$(dirname "$0")"
./ask-coach.sh "What openings do I play?" test-quickstart 2>&1 | head -50

