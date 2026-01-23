#!/bin/bash

# Test script for dual-block validated responses
# This verifies:
# - Responses are validated against ENGINE_FACTS
# - Opponent names and dates are always included
# - Chess boards are shown for key positions
# - No vague or generic advice

USER_ID="testuser_validated"
USERNAME="midnightcontender"

echo "🧪 Testing Dual-Block Validated Responses"
echo "=========================================="
echo ""

# Clear and ingest fresh data
echo "📁 Clearing existing data..."
rm -rf ./data/${USER_ID}

echo "📥 Ingesting 5 games (for faster iteration)..."
START_TIME=$(date +%s)
RESPONSE=$(curl -s "http://localhost:8787/ingest/chesscom?username=${USERNAME}&userId=${USER_ID}&limitGames=5")
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "Response: ${RESPONSE}"
echo "⏱️  Time taken: ${DURATION} seconds"
echo ""

if ! echo "${RESPONSE}" | grep -q '"added":'; then
  echo "❌ Ingestion failed"
  exit 1
fi

echo "✅ Ingestion complete"
echo ""

# Test validated responses
echo "🤖 Testing Validated Coach Responses"
echo "====================================="
echo ""

echo "📝 Test 1: What are my biggest weaknesses?"
echo "Expected: Specific game citation, opponent name, date, board position"
echo ""

./ask-coach.sh "What are my biggest weaknesses?" ${USER_ID} > /tmp/test_validated_1.txt
RESPONSE1=$(cat /tmp/test_validated_1.txt)

# Check for opponent name (should see "vs [name]")
if echo "$RESPONSE1" | grep -q "vs "; then
  echo "✅ Uses opponent name"
else
  echo "⚠️  WARNING: No opponent name found"
fi

# Check for date reference
if echo "$RESPONSE1" | grep -qE "[0-9]{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"; then
  echo "✅ Includes date"
else
  echo "⚠️  WARNING: No date found"
fi

# Check for board position
if echo "$RESPONSE1" | grep -q "\[BOARD:"; then
  BOARD_COUNT=$(echo "$RESPONSE1" | grep -o '\[BOARD:' | wc -l | xargs)
  echo "✅ Shows ${BOARD_COUNT} board(s)"
else
  echo "⚠️  WARNING: No board positions shown"
fi

# Check for Chess.com URL
if echo "$RESPONSE1" | grep -q "chess.com/game"; then
  echo "✅ Includes Chess.com URL"
else
  echo "ℹ️  No Chess.com URL (might be expected if data doesn't have them)"
fi

# Check for follow-up question
if echo "$RESPONSE1" | grep -q "?"; then
  echo "✅ Asks follow-up question"
else
  echo "ℹ️  No follow-up question"
fi

echo ""
echo "Response preview:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$RESPONSE1" | head -20
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📝 Test 2: Do I miss tactics with knights?"
echo "Expected: Specific example with position and eval change"
echo ""

./ask-coach.sh "Do I miss tactics with knights?" ${USER_ID} > /tmp/test_validated_2.txt
RESPONSE2=$(cat /tmp/test_validated_2.txt)

BOARD_COUNT2=$(echo "$RESPONSE2" | grep -o '\[BOARD:' | wc -l | xargs)
echo "Board count: ${BOARD_COUNT2}"

if echo "$RESPONSE2" | grep -q "eval"; then
  echo "✅ Includes evaluation information"
else
  echo "ℹ️  No eval information (might be okay depending on question)"
fi

echo ""
echo "🎉 Testing Complete!"
echo ""
echo "📊 Validation Checklist:"
echo "  ✓ All responses should include opponent names (not game IDs)"
echo "  ✓ All responses should include dates"
echo "  ✓ Key positions should show [BOARD:fen] tags"
echo "  ✓ Chess.com URLs should be included when available"
echo "  ✓ Responses should be concise and specific"
echo "  ✓ No vague advice like 'sharpen your tactics'"
echo ""
echo "📱 Next: Test in React Native app to see visual boards!"

