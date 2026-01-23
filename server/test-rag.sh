#!/bin/bash

echo "Testing RAG system..."
echo ""

echo "1. Testing opening-specific question (Italian Game):"
curl -s -X POST http://localhost:8787/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Why do I lose in the Italian Game?", "userId": "midnightcontender"}' | jq -r '.jobId'

sleep 2

echo ""
echo "2. Testing recent games question:"
curl -s -X POST http://localhost:8787/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What happened in my recent games?", "userId": "midnightcontender"}' | jq -r '.jobId'

sleep 2

echo ""
echo "3. Testing mistake pattern question:"
curl -s -X POST http://localhost:8787/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What are my common mistakes?", "userId": "midnightcontender"}' | jq -r '.jobId'

echo ""
echo "Test complete! Check the app to see the responses."

