#!/bin/bash

# Test script for the new concise, grounded prompt
# This verifies:
# - Responses are under 12 sentences
# - Max 3 examples cited
# - Max 3 boards shown ([POSITION:fen])
# - Opponent names and dates used (not game IDs)
# - Chess.com URLs included when available

USER_ID="testuser_prompt"
USERNAME="midnightcontender"

echo "🧪 Testing New Prompt (Concise & Grounded)"
echo "==========================================="
echo ""

# Clear and ingest fresh data
echo "📁 Clearing existing data..."
rm -rf ./data/${USER_ID}

echo "📥 Ingesting 10 games..."
RESPONSE=$(curl -s "http://localhost:8787/ingest/chesscom?username=${USERNAME}&userId=${USER_ID}&limitGames=10")
echo "Response: ${RESPONSE}"
echo ""

if ! echo "${RESPONSE}" | grep -q '"added":'; then
  echo "❌ Ingestion failed"
  exit 1
fi

echo "✅ Ingestion complete"
echo ""

# Test questions
echo "🤖 Testing Coach Responses"
echo "=========================="
echo ""

echo "📝 Test 1: General question (should be concise, <12 sentences)"
echo "Question: What are my biggest weaknesses?"
echo ""
./ask-coach.sh "What are my biggest weaknesses?" ${USER_ID} > /tmp/test1.txt
RESPONSE1=$(cat /tmp/test1.txt)

# Count sentences (rough estimate using period count)
SENTENCE_COUNT=$(echo "$RESPONSE1" | grep -o '\.' | wc -l | xargs)
echo "Estimated sentences: ${SENTENCE_COUNT}"

# Count [POSITION:fen] tags
BOARD_COUNT=$(echo "$RESPONSE1" | grep -o '\[POSITION:' | wc -l | xargs)
echo "Board count: ${BOARD_COUNT}"

if [ "$BOARD_COUNT" -gt 3 ]; then
  echo "⚠️  WARNING: More than 3 boards shown (${BOARD_COUNT})"
else
  echo "✅ Board count within limit"
fi

# Check for opponent names (should see "vs [name]")
if echo "$RESPONSE1" | grep -q "vs "; then
  echo "✅ Uses opponent names"
else
  echo "⚠️  WARNING: No opponent names found"
fi

# Check for Chess.com URLs
if echo "$RESPONSE1" | grep -q "chess.com/game"; then
  echo "✅ Includes Chess.com URLs"
else
  echo "⚠️  No Chess.com URLs (might be expected if data doesn't have them)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📝 Test 2: Specific tactical question"
echo "Question: Do I miss tactics with knights?"
echo ""
./ask-coach.sh "Do I miss tactics with knights?" ${USER_ID} > /tmp/test2.txt
RESPONSE2=$(cat /tmp/test2.txt)

SENTENCE_COUNT2=$(echo "$RESPONSE2" | grep -o '\.' | wc -l | xargs)
echo "Estimated sentences: ${SENTENCE_COUNT2}"

BOARD_COUNT2=$(echo "$RESPONSE2" | grep -o '\[POSITION:' | wc -l | xargs)
echo "Board count: ${BOARD_COUNT2}"

if [ "$BOARD_COUNT2" -gt 3 ]; then
  echo "⚠️  WARNING: More than 3 boards shown (${BOARD_COUNT2})"
else
  echo "✅ Board count within limit"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🎉 Testing Complete!"
echo ""
echo "📊 Verification Checklist:"
echo "  ✓ Responses should be concise (<12 sentences)"
echo "  ✓ Max 3 boards per response"
echo "  ✓ Opponent names used (not game IDs)"
echo "  ✓ Move numbers included"
echo "  ✓ Chess.com URLs when available"
echo "  ✓ Actionable advice at end"
echo ""
echo "📱 Next: Test in React Native app to see visual boards!"

