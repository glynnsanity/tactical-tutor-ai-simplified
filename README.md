# Tactical Tutor AI - Chess Coach

A professional-grade React Native chess coaching app featuring an AI chatbot with **full game analysis** powered by Stockfish and Lichess API.

> **⚡ Key Innovation**: Progressive analysis lets users start chatting in **2-3 minutes** while full analysis (100 games, 2,500+ positions) completes in background (~30 minutes total). Analyzes **ALL moves** (not just key positions) for professional-level insights.

## 🎯 What's Included

### Frontend (React Native)
- **AI Chatbot**: Ask your coach advanced questions about your games
- **Progressive Onboarding**: Link Chess.com account and start chatting in 2-3 minutes
- **Personalized Analysis**: Coach learns from ALL your games (not just key positions)
- **Advanced Insights**: Pattern recognition, phase-based analysis, tactical themes

### Backend (Node.js + Fastify)
- **Hybrid Analysis Engine**: Lichess Cloud API (70% hit rate) + Local Stockfish (depth 12)
- **8 Parallel Stockfish Engines**: 4x faster analysis
- **Progressive Analysis**: Quick start with 10 games, background processing for remaining 90
- **Full Game Analysis**: Every move analyzed (~25-50 positions per game)
- **RAG System**: Retrieves relevant games for contextual coaching

## ✨ What Makes This Special

| Feature | Traditional Chess Apps | This App |
|---------|----------------------|----------|
| **Analysis Speed** | Wait 60+ minutes | Start chatting in **2-3 minutes** ⚡ |
| **Data Analyzed** | 3-5 key positions/game | **ALL moves** (25-50/game) 🎯 |
| **Question Depth** | Basic ("work on endgame") | **Advanced** ("where do I miss knight forks?") |
| **Cost** | $10-20/month subscription | **Local analysis = $0** 💰 |
| **Privacy** | Data on their servers | **Your data stays local** 🔒 |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- **Stockfish** installed (`brew install stockfish` on macOS)
- iOS Simulator or Android Emulator

### Installation

```bash
# Install dependencies
npm install
cd server && npm install && cd ..

# Configure server environment (optional)
cd server
cp .env.example .env
# Edit .env to add OPENAI_API_KEY if desired
# If not set, server uses mock streaming for testing

# Start the backend server
npm run dev
# Server runs on http://localhost:8787

# In a new terminal, start the mobile app
cd ..
npm start

# For iOS
npm run ios
```

### Environment Variables

**Backend (`server/.env`):**
```bash
PORT=8787                          # Server port (default: 8787)
OPENAI_API_KEY=sk-...             # OpenAI API key (falls back to mock if not set)
MODEL_NAME=gpt-4o-mini            # Model to use (default: gpt-4o-mini)
STOCKFISH_PATH=/usr/bin/stockfish # Stockfish binary path (auto-detected)
```

## 📁 Project Structure

```
src/                                # React Native Frontend
├── components/
│   ├── chess/
│   │   └── Board.tsx              # Chess board display
│   ├── MarkdownMessage.tsx         # Formatted chat messages
│   └── ui/
│       └── Button.tsx              # Reusable components
├── screens/
│   ├── AskCoach.tsx               # Main chatbot screen
│   ├── OnboardingIntro.tsx         # Feature intro
│   ├── ChessComUsername.tsx        # Username linking
│   └── OnboardingDone.tsx          # Onboarding completion
└── lib/
    ├── api.ts                      # Backend API calls
    └── theme.ts                    # Styling constants

server/                             # Node.js Backend
├── src/
│   ├── routes/
│   │   ├── ask.ts                 # Chat endpoint (streaming)
│   │   └── ingest.ts              # Game ingestion (progressive)
│   ├── services/
│   │   ├── stockfish.ts           # 8-engine pool management
│   │   ├── lichess.ts             # Lichess Cloud API client
│   │   └── positionAnalyzer.ts    # Hybrid analysis (Lichess + Stockfish)
│   ├── ingest/
│   │   ├── chesscom.ts            # Chess.com API integration
│   │   └── pgnToSummary.ts        # Full game analysis
│   ├── summaries/
│   │   ├── schemas.ts             # Game data schemas
│   │   └── store.ts               # File-based storage
│   └── retrieval/
│       └── gameRetriever.ts       # RAG for LLM prompts
├── test-quickstart.sh             # Test progressive analysis
└── test-optimizations.sh          # Test full analysis
```

## 🔄 User Flow

### Progressive Onboarding (2-3 Minutes)
1. **Intro Screen** - Explain the coaching concept
2. **Username Screen** - Link Chess.com account
3. **Quick Analysis** - Analyze 10 games (2-3 minutes)
4. **Chat Screen** - Start asking questions immediately!
5. **Background** - Remaining 90 games analyzed in 20-30 minutes

### After Onboarding
- User chats with coach using data from 10 games initially
- Coach gets progressively smarter as more games are analyzed
- Full analysis completes in background (~30 minutes total)
- User receives notification when complete

## 🎯 Full Game Analysis Engine

### Architecture Overview

```
User links Chess.com account
  ↓
[Quick Start: 2-3 minutes]
Fetch 10 recent games → Analyze ALL moves (~250 positions)
  ↓
User can START CHATTING ✅
  ↓
[Background: 20-30 minutes]
Analyze remaining 90 games → ALL moves (~2,250 more positions)
  ↓
Coach fully trained with 2,500+ analyzed positions
```

### Hybrid Analysis System

For each position:
1. **Try Lichess Cloud API first** (70% hit rate, depth 20-65, instant)
2. **Fallback to local Stockfish** (30% miss rate, depth 12, 5-10s)
3. **8 engines process 20 positions in parallel**
4. **Smart timeouts** (20s, fail fast on complex positions)

### Performance Metrics

| Metric | Value |
|--------|-------|
| **Quick start time** | 2-3 minutes (10 games) |
| **Full analysis time** | 20-30 minutes (100 games) |
| **Positions per game** | 25-50 (ALL moves) |
| **Total positions** | 2,500-5,000 |
| **Lichess hit rate** | ~70% |
| **Stockfish engines** | 8 parallel |
| **Analysis depth** | 12 (sweet spot for speed/quality) |
| **Timeout rate** | ~5% (vs 30% at depth 15) |

## 🛠️ Key Features

### Advanced Question Answering

The coach can now answer sophisticated questions like:

**Opening-Specific Analysis:**
- "In the Italian Game Two Knights Defense, where do I go wrong?"
- "What's my win rate with the London System vs higher-rated players?"
- "Show me all games where I played the Sicilian Dragon"

**Pattern Recognition:**
- "Do I miss knight forks more often than average?"
- "In what positions do I consistently overestimate my attacking chances?"
- "How often do I hang pieces under time pressure?"

**Phase-Based Analysis:**
- "Do I play worse in the endgame compared to opening/middlegame?"
- "What's my accuracy in moves 20-30 vs moves 30-40?"
- "In which phase do I make the most blunders?"

**Tactical Themes:**
- "Show me games where I missed a backward move"
- "Find positions where I had a winning tactic but didn't see it"
- "What percentage of my mistakes are tactical vs positional?"

### Backend Features

- **Streaming Responses**: Token-by-token streaming for smooth UX
- **RAG System**: Retrieves relevant games for context
- **Progressive Ingestion**: Quick start + background processing
- **Mistake Detection**: Auto-categorizes blunders, mistakes, inaccuracies
- **Opening Database**: ECO code mapping and opening names
- **Enhanced Coach Responses**: Visual boards, opponent names, specific move citations, Chess.com links

### Coach Response Quality

The coach provides **specific, actionable responses** with:
- ✅ **Opponent names** - "In your game vs ChessMaster99 (Nov 2, 2024)..."
- ✅ **Specific move numbers** - "On move 18, you played Rxe5..."
- ✅ **Visual chess boards** - Key positions displayed inline
- ✅ **Chess.com links** - Clickable links to review full games
- ✅ **Concise format** - <12 sentences, mobile-friendly
- ✅ **Grounded in data** - No hallucinations, all claims backed by your games

**LLM Prompt Design:**
- Hard limits: Max 3 examples, max 3 boards per response
- Anti-hallucination: Explicit "Do NOT invent" rules
- Clear structure: Headline → Findings → Pattern → Action
- Actionable: Always ends with clear next step

## 📦 Dependencies

### Core
- `react` - React framework
- `react-native` - Mobile framework
- `expo` - Managed React Native platform

### Navigation
- `@react-navigation/native` - Navigation library
- `@react-navigation/native-stack` - Stack navigator

### UI/Display
- `lucide-react-native` - Icons
- `react-native-markdown-display` - Markdown rendering
- `react-native-svg` - SVG rendering (chess pieces)

### Storage
- `@react-native-async-storage/async-storage` - Local data persistence

### Other
- `react-native-gesture-handler` - Gesture handling
- `react-native-reanimated` - Animation library
- `react-native-screens` - Screen management
- `react-native-safe-area-context` - Safe area handling

## 🧪 Testing

### Test 1: Progressive Analysis (RECOMMENDED)
```bash
cd server
./test-quickstart.sh
```

**What it does:**
- Analyzes 10 games with full move analysis (2-3 minutes)
- Starts background analysis for remaining 90 games
- Lets you test the coach immediately
- Shows real-time progress updates

**Expected result:**
```
✅ Quick start complete!
⏱️  Time taken: 150 seconds
📊 Games analyzed (quick start): 10
✨ User can now start chatting!
🔄 Background analysis continues...
```

### Test 2: Full Analysis (5 Games)
```bash
cd server
./test-optimizations.sh
```

**What it tests:**
- 8 Stockfish engines working in parallel
- Depth 12 analysis
- 20s smart timeouts
- Full move analysis (~25 positions per game)
- Parallel batching (20 positions at a time)

**Expected time:** 2-3 minutes for 5 games  
**Expected result:** ~125 positions analyzed

### Test 3: Ask the Coach
```bash
cd server
./ask-coach.sh "What are my most common mistakes?" YOUR_USER_ID
./ask-coach.sh "How do I perform in the Italian Game?" YOUR_USER_ID
```

## 📡 API Endpoints

### Backend Server (Port 8787)

#### **POST /ask**
Submit a question to the coach

```bash
curl -X POST http://localhost:8787/ask \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "question": "What are my weaknesses?"}'
```

Response:
```json
{
  "jobId": "abc123",
  "message": "Processing your question..."
}
```

#### **GET /poll/{jobId}**
Poll for streamed response tokens

```bash
curl "http://localhost:8787/poll/abc123?from=0"
```

Response:
```json
{
  "tokens": ["Based", " on", " your", " games", "..."],
  "done": false,
  "nextCursor": 5
}
```

#### **GET /ingest/chesscom**
Ingest games from Chess.com

**Progressive Analysis (Quick Start):**
```bash
curl "http://localhost:8787/ingest/chesscom?username=USER&userId=USER&limitGames=100&quickStart=true&quickStartGames=10"
```

**Regular Analysis:**
```bash
curl "http://localhost:8787/ingest/chesscom?username=USER&userId=USER&limitGames=100"
```

Query Parameters:
- `username` - Chess.com username
- `userId` - Internal user ID
- `limitGames` - Number of games to analyze (default: 100, max: 1000)
- `limitMonths` - Months of history to fetch (default: 12, max: 120)
- `quickStart` - Enable progressive analysis (default: false)
- `quickStartGames` - Games to analyze in quick start (default: 10, max: 50)

#### **GET /summaries/{userId}**
Get all analyzed games for a user

```bash
curl "http://localhost:8787/summaries/user123"
```

## 🎨 Customization

### Colors & Styling
Edit `src/theme.ts` to customize:
- Coach primary color
- Background colors
- Text colors
- Border radius
- Spacing values

### API Configuration
Set custom backend URL in `src/lib/api.ts`:
```typescript
setApiBaseUrl('https://your-backend.com');
```

### Analysis Configuration

**Adjust Stockfish engine count:**
```typescript
// server/src/services/stockfish.ts
enginePool = new StockfishPool(8); // Change to 4-12 based on your CPU
```

**Adjust analysis depth:**
```typescript
// server/src/services/positionAnalyzer.ts
stockfishDepth = 12, // Change to 10-15 (lower = faster, higher = better)
```

**Adjust timeout:**
```typescript
// server/src/services/stockfish.ts
setTimeout(() => reject(new Error('Timeout')), 20000); // Change to 10000-30000ms
```

## 🔒 Storage

### Mobile App (AsyncStorage)
- `onboardingComplete` - Flag indicating setup completion
- `chesscom.username` - Chess.com username
- `chesscom.avatar` - User avatar URL

### Backend (File-based)
- `server/data/{userId}/summaries.json` - All analyzed games
- `server/data/{userId}/.autoingest.json` - Auto-ingestion metadata

## 🚀 Deployment

### Mobile App
```bash
# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

### Backend
```bash
# Deploy to Railway/Render/Fly.io
cd server
railway up  # or render deploy, or fly deploy
```

**Environment Variables:**
```bash
OPENAI_API_KEY=sk-...          # Required for chat
LICHESS_CLOUD_EVAL_ENABLED=true # Optional, improves speed
STOCKFISH_PATH=/usr/bin/stockfish # Optional, auto-detected
```

## 🐛 Troubleshooting

### Issue: "Stockfish analysis timeout" (frequent)
**Solution:**
- Reduce depth to 10: `stockfishDepth = 10`
- Increase engine count: `StockfishPool(12)`
- Check CPU isn't overloaded

### Issue: Background analysis not running
**Solution:**
- Check server logs for `[Background]` messages
- Verify server didn't restart
- Background function runs fire-and-forget

### Issue: Taking longer than expected
**Solution:**
- Check Lichess hit rate in logs (should be 60-70%)
- Ensure Stockfish is installed: `which stockfish`
- Monitor CPU usage (should be 100% on 8 cores during analysis)

### Issue: "Cannot find module 'stockfish'"
**Solution:**
- We use system Stockfish, not npm package
- Install: `brew install stockfish` (macOS) or `apt install stockfish` (Linux)

## 📊 Performance Comparison

| Metric | Before Optimizations | After Optimizations | Improvement |
|--------|---------------------|---------------------|-------------|
| **Time to start chatting** | 60+ minutes | **2-3 minutes** | **20-30x faster** ⚡ |
| **Full analysis time** | 60+ minutes | **20-30 minutes** | **2-3x faster** |
| **Positions analyzed per game** | 3 | **25-50** | **8-17x more data** |
| **Total positions (100 games)** | 300 | **2,500-5,000** | **8-17x more data** |
| **Timeout rate** | 30% | **5%** | **6x fewer timeouts** |
| **Stockfish engines** | 2 | **8** | **4x capacity** |
| **Analysis depth** | 15 | **12** | **2-3x faster per position** |
| **Coach quality** | Basic advice | **Professional insights** | **Advanced patterns** 🎯 |

## 📄 License

See LICENSE file for details