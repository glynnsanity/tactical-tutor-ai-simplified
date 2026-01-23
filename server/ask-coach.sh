#!/bin/bash

# Ask Coach Helper Script
# Usage: ./ask-coach.sh "Your question here" [userId]

QUESTION="$1"
USER_ID="${2:-midnightcontender}"
SERVER="http://localhost:8787"

if [ -z "$QUESTION" ]; then
  echo "Usage: ./ask-coach.sh \"Your question\" [userId]"
  echo "Example: ./ask-coach.sh \"Why do I lose in the Italian Game?\" midnightcontender"
  exit 1
fi

echo "🤔 Asking: $QUESTION"
echo "👤 User: $USER_ID"
echo ""

# Step 1: Ask the question
RESPONSE=$(curl -s -X POST "$SERVER/ask" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"$QUESTION\",\"userId\":\"$USER_ID\"}")

JOB_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
  echo "❌ Error: Failed to get job ID"
  echo "$RESPONSE"
  exit 1
fi

echo "📝 Job ID: $JOB_ID"
echo "⏳ Waiting for response..."
echo ""

# Step 2: Poll for the answer
FROM=0
DONE=false

while [ "$DONE" = "false" ]; do
  sleep 0.5  # Wait 500ms between polls
  
  POLL_RESPONSE=$(curl -s "$SERVER/poll?jobId=$JOB_ID&from=$FROM")
  
  # Extract tokens
  TOKENS=$(echo "$POLL_RESPONSE" | grep -o '"tokens":\[[^]]*\]' | sed 's/"tokens":\[//;s/\]$//')
  
  # Check if done
  if echo "$POLL_RESPONSE" | grep -q '"done":true'; then
    DONE=true
  fi
  
  # Print tokens (without quotes and commas)
  if [ ! -z "$TOKENS" ]; then
    echo "$TOKENS" | sed 's/","/\n/g; s/"//g' | tr '\n' ' '
    
    # Count tokens for next poll
    TOKEN_COUNT=$(echo "$TOKENS" | grep -o ',' | wc -l)
    FROM=$((FROM + TOKEN_COUNT + 1))
  fi
done

echo ""
echo ""
echo "✅ Done!"

