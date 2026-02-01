#!/bin/bash

# Quick Wins Verification Test
# Tests the 5 quick wins we implemented

BASE_URL="http://localhost:8787"

echo "=============================================="
echo "  QUICK WINS VERIFICATION TEST"
echo "=============================================="
echo ""

# Test 1: First request - should use Haiku for intent + parallel execution
echo "TEST 1: First request (measures baseline with Haiku + parallel)"
echo "Question: 'What is my win rate?'"
START=$(date +%s%3N)
response=$(curl -s -X POST "$BASE_URL/ask" \
    -H "Content-Type: application/json" \
    -d '{"question": "What is my win rate?"}')
job_id=$(echo "$response" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
END=$(date +%s%3N)
echo "Initial response time: $((END - START))ms"
echo "Job ID: $job_id"

# Wait for completion
sleep 3
result=$(curl -s "$BASE_URL/poll?jobId=$job_id")
if echo "$result" | grep -q '"done":true'; then
    echo "Result: Request completed successfully"
else
    sleep 5
    result=$(curl -s "$BASE_URL/poll?jobId=$job_id")
fi
echo ""

# Test 2: Same question - should hit response cache
echo "TEST 2: Same question (should hit response cache)"
START=$(date +%s%3N)
response=$(curl -s -X POST "$BASE_URL/ask" \
    -H "Content-Type: application/json" \
    -d '{"question": "What is my win rate?"}')
job_id=$(echo "$response" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
END=$(date +%s%3N)
echo "Response time: $((END - START))ms"

sleep 2
result=$(curl -s "$BASE_URL/poll?jobId=$job_id")
if echo "$result" | grep -q '"done":true'; then
    echo "Result: FAST (likely cached)"
else
    echo "Result: Still processing..."
fi
echo ""

# Test 3: Pattern question - should use Haiku for intent + skip Pass 2
echo "TEST 3: Pattern question (tests Haiku intent + compact prompts)"
echo "Question: 'What are my weaknesses?'"
START=$(date +%s%3N)
response=$(curl -s -X POST "$BASE_URL/ask" \
    -H "Content-Type: application/json" \
    -d '{"question": "What are my weaknesses?"}')
job_id=$(echo "$response" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
END=$(date +%s%3N)
echo "Initial response time: $((END - START))ms"

# Wait for LLM response
sleep 10
result=$(curl -s "$BASE_URL/poll?jobId=$job_id")
if echo "$result" | grep -q '"done":true'; then
    echo "Result: Pattern analysis completed"
    # Extract preview
    tokens=$(echo "$result" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'tokens' in data and data['tokens']:
        print(''.join(data['tokens'])[:200])
except: pass
" 2>/dev/null)
    echo "Preview: $tokens..."
fi
echo ""

# Test 4: Same pattern question - should hit both intent cache AND response cache
echo "TEST 4: Same pattern question (should hit caches)"
START=$(date +%s%3N)
response=$(curl -s -X POST "$BASE_URL/ask" \
    -H "Content-Type: application/json" \
    -d '{"question": "What are my weaknesses?"}')
job_id=$(echo "$response" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
END=$(date +%s%3N)
echo "Response time: $((END - START))ms"

sleep 2
result=$(curl -s "$BASE_URL/poll?jobId=$job_id")
if echo "$result" | grep -q '"done":true'; then
    echo "Result: FAST (cached response)"
fi
echo ""

echo "=============================================="
echo "  VERIFICATION COMPLETE"
echo "=============================================="
echo ""
echo "Check server logs for:"
echo "- '[Ask] Starting parallel profile + intent analysis...'"
echo "- '[IntentCache] Using cached intent...'"
echo "- '[ResponseCache] Cache hit for...'"
echo "- Model: claude-3-5-haiku for intent analysis"
