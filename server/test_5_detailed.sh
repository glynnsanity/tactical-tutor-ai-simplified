#!/bin/bash

BASE_URL="http://localhost:8787"

run_test() {
    local num=$1
    local question=$2

    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "TEST $num"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "QUESTION: $question"
    echo ""

    response=$(curl -s -X POST "$BASE_URL/ask" \
        -H "Content-Type: application/json" \
        -d "{\"question\": \"$question\"}")
    job_id=$(echo "$response" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

    # Wait for completion
    for i in 1 2 3 4; do
        sleep 5
        result=$(curl -s "$BASE_URL/poll?jobId=$job_id")
        if echo "$result" | grep -q '"done":true'; then
            break
        fi
    done

    echo "RESPONSE:"
    echo "────────────────────────────────────────────────────────────────"
    echo "$result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('tokens'):
    text = ''.join(data['tokens'])
    # Clean up the response for display
    text = text.replace('[BOARD:', '\n[BOARD:')
    print(text)
"
    echo ""
}

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          5 DETAILED TESTS WITH RESPONSES                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"

run_test 1 "What opening should I focus on improving?"
run_test 2 "Show me my biggest blunder"
run_test 3 "Am I better at bullet or blitz?"
run_test 4 "What should I study next?"
run_test 5 "Analyze my tactical patterns"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "TESTS COMPLETE"
echo "════════════════════════════════════════════════════════════════"
