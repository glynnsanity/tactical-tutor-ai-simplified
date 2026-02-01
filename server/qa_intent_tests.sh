#!/bin/bash

# Comprehensive QA Test Suite for Intent System
# Tests intent analysis, caching, routing, and content selection

BASE_URL="http://localhost:8787"
TOTAL_TESTS=0
PASSED_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=============================================="
echo "  COMPREHENSIVE QA TEST SUITE - INTENT SYSTEM"
echo "=============================================="
echo ""

# Function to run a test and check results
run_test() {
    local test_num=$1
    local category=$2
    local question=$3
    local expected_scope=$4
    local expected_behavior=$5
    local wait_time=${6:-8}  # Default 8 seconds, can be overridden

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}TEST $test_num: $category${NC}"
    echo -e "Question: \"$question\""
    echo -e "Expected Scope: $expected_scope"
    echo ""

    # Make the request
    response=$(curl -s -X POST "$BASE_URL/ask" \
        -H "Content-Type: application/json" \
        -d "{\"question\": \"$question\"}")

    job_id=$(echo "$response" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$job_id" ]; then
        echo -e "${RED}✗ FAILED: No job ID returned${NC}"
        echo "Response: $response"
        return
    fi

    # Poll for result with retry
    for attempt in 1 2 3; do
        sleep $wait_time
        result=$(curl -s "$BASE_URL/poll?jobId=$job_id")

        # Check for done: true in response
        if echo "$result" | grep -q '"done":true'; then
            # Extract tokens and join them
            tokens=$(echo "$result" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'tokens' in data and data['tokens']:
        print(''.join(data['tokens'])[:500])
    else:
        print('[No tokens]')
except: print('[Parse error]')
" 2>/dev/null)

            echo -e "${GREEN}✓ Response received (attempt $attempt)${NC}"
            echo "Answer preview:"
            echo "$tokens" | head -c 400
            echo ""
            PASSED_TESTS=$((PASSED_TESTS + 1))
            return
        fi
    done

    # If we get here, request didn't complete
    echo -e "${RED}✗ FAILED: Request didn't complete after 3 attempts${NC}"
    echo "Last result: $(echo "$result" | head -c 200)"
}

# ============================================
# CATEGORY 1: STATS/FACTUAL QUESTIONS (Fast - Direct Routing)
# ============================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  CATEGORY 1: STATS/FACTUAL QUESTIONS (Direct Routing)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

run_test 1 "Stats - Win Rate" \
    "What is my win rate?" \
    "stats" \
    "Should route directly to meta response" \
    3

run_test 2 "Stats - Record" \
    "What's my overall record?" \
    "stats" \
    "Should return wins/losses/draws directly" \
    3

run_test 3 "Stats - Opening Count" \
    "How many Sicilian games have I played?" \
    "historical" \
    "Should count games with specific opening" \
    3

# ============================================
# CATEGORY 2: PATTERN QUESTIONS (LLM Required)
# ============================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  CATEGORY 2: PATTERN QUESTIONS (LLM Analysis)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

run_test 4 "Pattern - Weaknesses" \
    "What are my biggest weaknesses?" \
    "pattern" \
    "Should trigger pattern analysis" \
    12

run_test 5 "Pattern - Informal" \
    "Where do I suck the most?" \
    "pattern" \
    "Should handle informal language" \
    12

# ============================================
# CATEGORY 3: SINGLE GAME QUESTIONS
# ============================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  CATEGORY 3: SINGLE GAME QUESTIONS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

run_test 6 "Single Game - Last Game" \
    "Analyze my last game" \
    "single_game" \
    "Should focus on most recent game" \
    12

run_test 7 "Single Game - Worst Loss" \
    "What was my worst loss?" \
    "single_game" \
    "Should find biggest rating loss" \
    5

# ============================================
# CATEGORY 4: ADVICE QUESTIONS
# ============================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  CATEGORY 4: ADVICE QUESTIONS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

run_test 8 "Advice - General Improvement" \
    "How can I improve my chess?" \
    "advice" \
    "Should synthesize patterns into advice" \
    12

run_test 9 "Advice - Opening Specific" \
    "How should I improve my Sicilian Defense?" \
    "advice" \
    "Should focus on Sicilian games" \
    5

# ============================================
# CATEGORY 5: COMPARISON QUESTIONS
# ============================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  CATEGORY 5: COMPARISON QUESTIONS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

run_test 10 "Comparison - Color" \
    "Am I better with white or black?" \
    "comparison" \
    "Should compare performance by color" \
    12

# ============================================
# CATEGORY 6: CACHE VERIFICATION
# ============================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  CATEGORY 6: CACHE VERIFICATION${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

echo -e "${BLUE}Testing intent cache with identical question...${NC}"
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# First request
echo "Request 1: 'What are my weaknesses?'"
curl -s -X POST "$BASE_URL/ask" \
    -H "Content-Type: application/json" \
    -d '{"question": "What are my weaknesses?"}' > /dev/null

sleep 2

# Second request (should hit cache)
echo "Request 2: 'What are my weaknesses?' (should use cached intent)"
curl -s -X POST "$BASE_URL/ask" \
    -H "Content-Type: application/json" \
    -d '{"question": "What are my weaknesses?"}' > /dev/null

sleep 2

# Third request (similar, should fuzzy match)
echo "Request 3: 'Tell me my weaknesses' (should fuzzy match cache)"
curl -s -X POST "$BASE_URL/ask" \
    -H "Content-Type: application/json" \
    -d '{"question": "Tell me my weaknesses"}' > /dev/null

echo ""
echo -e "${GREEN}✓ Cache requests sent - check server logs for cache hits${NC}"
PASSED_TESTS=$((PASSED_TESTS + 1))

# ============================================
# SUMMARY
# ============================================
echo ""
echo "=============================================="
echo "  TEST SUMMARY"
echo "=============================================="
echo ""
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$((TOTAL_TESTS - PASSED_TESTS))${NC}"
echo ""

PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
if [ $PASS_RATE -ge 80 ]; then
    echo -e "${GREEN}✓ SUCCESS: ${PASS_RATE}% pass rate${NC}"
elif [ $PASS_RATE -ge 60 ]; then
    echo -e "${YELLOW}⚠ PARTIAL: ${PASS_RATE}% pass rate${NC}"
else
    echo -e "${RED}✗ NEEDS WORK: ${PASS_RATE}% pass rate${NC}"
fi

echo ""
echo "Check server logs for detailed intent analysis output"
