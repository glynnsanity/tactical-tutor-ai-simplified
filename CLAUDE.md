# Chess Coach AI

## Project Overview
A chess coaching chatbot that analyzes users' Chess.com games and provides personalized improvement advice.

## Architecture
- **Frontend**: Next.js web app (`/web`) on port 3000
- **Backend**: Fastify server (`/server`) on port 8787
- **Analysis**: Stockfish for position evaluation, Lichess cloud API as fallback
- **LLM**: OpenAI API for response generation

## Getting Started

### Prerequisites
- Node.js 18+
- Stockfish (`brew install stockfish` on macOS)
- OpenAI API key

### Environment Setup
```bash
# /server/.env
PORT=8787
OPENAI_API_KEY=your-key-here
MODEL_NAME=gpt-4o-mini
```

### Running Locally
```bash
# Terminal 1: Start server
cd server && npm install && npm run dev

# Terminal 2: Start web
cd web && npm install && npm run dev
```

## Testing

### Test User
- Username: `midnightcontender` (real Chess.com account)
- Cached data: `/server/data/chesscom-midnightcontender/`

### Pre-analyze Games (once)
```bash
curl "http://localhost:8787/ingest/chesscom?username=midnightcontender&userId=chesscom-midnightcontender&quickStart=true&quickStartGames=10"
```

### API-based Chatbot Test (recommended for iteration)
Fast, no browser overhead. Tests response quality directly via API.
```bash
npx tsx test-chatbot-api.ts
```

### UI E2E Test (for UI-specific testing)
Uses Playwright to test full user flow with screenshots.
```bash
npx tsx e2e-chatbot-test.ts
```

## Related Documentation
- [QA_PROMPT.md](./QA_PROMPT.md) - Chatbot response evaluation rubric

## Known Issues

### Resolved
1. Missing `ecoDatabase.ts` - Created with ECO codes and opening families
2. Stockfish not installed - Requires `brew install stockfish`
3. Invalid model name in `.env` - Use `gpt-4o-mini` not `gpt-5.2-2025-12-11`
4. Malformed "no data" response - Fixed in `/server/src/schemas/coachResponse.ts`

### Fixed (this session)
- Endgame questions now score 5/5 - Added endgame question type detection and position scoring
- All questions now score 4-5/5 - Enhanced LLM prompts for specificity
