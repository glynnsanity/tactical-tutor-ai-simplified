#!/bin/bash

# Test the optimized full game analysis with 5 games
# This tests:
# - 8 Stockfish engines
# - Depth 12 analysis
# - 20s timeouts
# - Full move analysis
# - Parallel batching

echo "🧪 Testing optimized full game analysis..."
echo "Configuration:"
echo "  - Stockfish engines: 8"
echo "  - Analysis depth: 12"
echo "  - Timeout: 20s"
echo "  - Batch size: 20 positions"
echo "  - Test games: 5"
echo ""

# Clear previous test data
echo "🧹 Clearing previous test data..."
rm -rf data/test-user-optimized

# Run ingestion with 5 games (no quick start, full analysis)
echo "⏱️  Starting full analysis (this will take 2-3 minutes)..."
START_TIME=$(date +%s)

curl -s "http://localhost:8787/ingest/chesscom?username=midnightcontender&userId=test-user-optimized&limitGames=5&limitMonths=12" | jq .

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "✅ Analysis complete!"
echo "⏱️  Time taken: ${DURATION} seconds"
echo ""
echo "📊 Checking results..."

# Check how many positions were analyzed
POSITIONS=$(cat data/test-user-optimized/summaries.json 2>/dev/null | jq '[.[].keyPositions | length] | add')
GAMES=$(cat data/test-user-optimized/summaries.json 2>/dev/null | jq 'length')

echo "  - Games analyzed: ${GAMES}"
echo "  - Total positions: ${POSITIONS}"
echo "  - Avg positions per game: $((POSITIONS / GAMES))"
echo ""
echo "🎯 Expected: ~25 positions per game (all moves analyzed)"
echo ""

# Test a query
echo "💬 Testing coach query..."
cd "$(dirname "$0")"
./ask-coach.sh "What's my biggest weakness?" test-user-optimized 2>&1 | head -50

