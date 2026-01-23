#!/bin/bash

# Test script for enhanced coach responses with visual boards
# This script will:
# 1. Clear existing data
# 2. Ingest a few games with the new schema (opponent, chesscomUrl)
# 3. Ask a question that should trigger a specific response with board visualization

USER_ID="testuser_enhanced"
USERNAME="midnightcontender" # Replace with a valid Chess.com username

echo "🧪 Testing Enhanced Coach with Visual Boards"
echo "=============================================="
echo ""

# Step 1: Clear existing data
echo "📁 Clearing existing data for ${USER_ID}..."
rm -rf ./data/${USER_ID}
echo "✅ Data cleared"
echo ""

# Step 2: Ingest 10 games to test with
echo "📥 Ingesting 10 games for ${USERNAME}..."
START_TIME=$(date +%s)
RESPONSE=$(curl -s "http://localhost:8787/ingest/chesscom?username=${USERNAME}&userId=${USER_ID}&limitGames=10")
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "Response: ${RESPONSE}"
echo "⏱️  Time taken: ${DURATION} seconds"
echo ""

# Check if ingestion was successful
if echo "${RESPONSE}" | grep -q '"added":'; then
  ADDED=$(echo "${RESPONSE}" | grep -o '"added":[0-9]*' | cut -d':' -f2)
  echo "✅ Successfully ingested ${ADDED} games"
else
  echo "❌ Ingestion failed"
  echo "Please check server logs for errors."
  exit 1
fi

echo ""
echo "🤖 Testing Coach Responses"
echo "=========================="
echo ""

# Test 1: Ask about weaknesses (should reference specific games with opponent names and boards)
echo "📝 Question 1: What are my biggest weaknesses?"
echo "Expected: Specific game references with opponent names, move numbers, and visual boards"
echo ""

cd /Users/glynnjordan/Desktop/chess-project/lovable-chess/tactical-tutor-ai-simplified/server
./ask-coach.sh "What are my biggest weaknesses?" ${USER_ID}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 2: Ask about a specific tactic (forks)
echo "📝 Question 2: Do I find forks with knights?"
echo "Expected: Specific examples with move numbers and visual positions"
echo ""

./ask-coach.sh "Do I find forks with knights?" ${USER_ID}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🎉 Testing Complete!"
echo ""
echo "📊 What to verify:"
echo "  1. Opponent names appear (not just game IDs)"
echo "  2. Move numbers are included (e.g., 'on move 12')"
echo "  3. Chess.com URLs are present and clickable"
echo "  4. [POSITION:fen] tags appear in responses"
echo "  5. Frontend should render these as visual chess boards"
echo ""
echo "🔍 Next step: Open the React Native app and ask the same questions to see visual boards!"

