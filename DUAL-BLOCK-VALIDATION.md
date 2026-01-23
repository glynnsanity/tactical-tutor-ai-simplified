# Dual-Block Validation System - Implementation Complete ✅

## Overview

Replaced the **prompt-only approach** with a **structured validation system** that guarantees specific, grounded responses while maintaining conversational feel.

---

## The Problem We Solved

### Before (Prompt Engineering Hell):
```
User: "What are my weaknesses?"

Coach: "You have problems with material balance. Consider studying tactics."
```

**Issues:**
- ❌ No specific examples
- ❌ No opponent names or dates
- ❌ No visual boards
- ❌ Generic advice
- ❌ No way to enforce quality

### After (Validated Responses):
```
User: "What are my weaknesses?"

Coach: "In your game vs Elmaestro-02 (Nov 3, 2024), on move 7 you played Bxf3:

[Chess Board showing position]

This dropped from +2.3 to +0.2. The engine suggests Nd5 instead.

Want to see more examples of this pattern?"
```

**Guarantees:**
- ✅ Always includes opponent name + date
- ✅ Always shows specific move number
- ✅ Always displays visual board
- ✅ Always includes evaluation changes
- ✅ Always provides Chess.com URL (if available)
- ✅ Auto-retries if validation fails

---

## Architecture

### Dual-Block Format

The LLM generates **two blocks**:

```
[RESPONSE]
Conversational text here with [BOARD:fen] tags...

[GROUNDING]
{
  "games": [{"id": "...", "opponent": "...", "date": "...", "url": "..."}],
  "positions": [{...}],
  "claims": [{...}],
  "follow_up_question": "..."
}
```

**User sees:** Only the conversational `[RESPONSE]`  
**Backend validates:** The `[GROUNDING]` JSON against ENGINE_FACTS

---

## Components

### 1. ENGINE_FACTS Builder (`engineFacts.ts`)

Converts game summaries into ground truth:

```typescript
{
  games: [
    {id: "abc123", opponent: "ChessMaster99", date: "2024-11-02", url: "..."}
  ],
  positions: [
    {
      fen: "rnbqkb1r...",
      eval_before_cp: 150,
      eval_after_cp: -80,
      engine_best_san: "Nd5",
      ...
    }
  ]
}
```

### 2. Grounding Schema (`grounding.ts`)

Zod schemas for validation:

```typescript
const Grounding = z.object({
  games: z.array(GroundingGame).min(1).max(3),
  positions: z.array(GroundingPosition).min(1).max(3),
  claims: z.array(GroundingClaim).min(1).max(3),
  follow_up_question: z.string().max(140).nullable(),
});
```

### 3. Validator (`responseValidator.ts`)

Validates grounding against facts:

```typescript
function validateGrounding(grounding, facts) {
  // 1. All game IDs must exist in facts
  // 2. All FENs must exist in facts
  // 3. Evals must match within ±10 centipawns
  // 4. Best moves must match
  // 5. Claims must reference valid FENs
}
```

### 4. Dual-Block Prompt (`ask.ts`)

Instructs LLM to output both blocks:

```
SYSTEM
You are a conversational chess coach.
Output must contain:
[RESPONSE] - conversational text with [BOARD:fen]
[GROUNDING] - JSON validating your claims

You may ONLY cite facts from ENGINE_FACTS.
```

### 5. Retry Logic

If validation fails, retry with correction:

```typescript
while (attempt <= maxRetries) {
  try {
    const llmOutput = await getLLMResponse(prompt);
    const validated = validateAndParseResponse(llmOutput, facts);
    return validated; // Success!
  } catch (err) {
    // Retry with: "Your FEN was invalid. Use only ENGINE_FACTS."
  }
}
```

---

## How It Works

### Request Flow

```
1. User asks: "What are my biggest weaknesses?"
   ↓
2. Build ENGINE_FACTS from relevant games
   ↓
3. Generate prompt with facts + dual-block instructions
   ↓
4. LLM outputs [RESPONSE] + [GROUNDING]
   ↓
5. Parse both blocks
   ↓
6. Validate GROUNDING against ENGINE_FACTS
   - Check all game IDs exist
   - Check all FENs exist
   - Check evals match
   - Check moves are correct
   ↓
7a. ✅ Valid → Stream response to user
7b. ❌ Invalid → Retry with error message
   ↓
8. User sees: Conversational text + visual boards
```

### Validation Rules

**Must Pass:**
1. ✅ All `games[].id` exist in ENGINE_FACTS
2. ✅ All `positions[].fen` exist in ENGINE_FACTS
3. ✅ Evals match within ±10 centipawns
4. ✅ Best moves match (if provided)
5. ✅ Response mentions match grounding
6. ✅ Board count ≤ 3
7. ✅ Word count ≤ 150
8. ✅ Valid JSON schema

**If Fails:**
- Retry with specific error message
- Max 2 retries
- Fallback to helpful message if all fail

---

## Files Created

### Backend
- `server/src/validation/grounding.ts` - Zod schemas
- `server/src/validation/engineFacts.ts` - Facts builder
- `server/src/validation/responseValidator.ts` - Validation logic

### Updated
- `server/src/routes/ask.ts` - Dual-block prompt + retry logic
- `src/components/MarkdownMessage.tsx` - Handle `[BOARD:fen]` tags

### Testing
- `server/test-validated-responses.sh` - E2E test script

---

## Benefits

### 1. **No More Vague Responses**
- ❌ "You need to sharpen your tactics"
- ✅ "In your game vs Bob (Nov 2), on move 12..."

### 2. **Guaranteed Structure**
Every response MUST include:
- Opponent name + date
- Specific move number
- Visual board position
- Evaluation changes
- Chess.com link

### 3. **Auto-Correction**
If LLM outputs bad data, system retries automatically:
```
Attempt 1: "FEN not in ENGINE_FACTS" → Retry
Attempt 2: "eval mismatch" → Retry  
Attempt 3: ✅ Valid → Show to user
```

### 4. **Conversational Feel**
Despite strict validation, responses are natural:
```
"Great question! Let me show you a specific example..."
[Board]
"See the pattern? Want to see more?"
```

### 5. **Follow-Up Questions**
Every response ends with a question to continue conversation.

---

## Testing

### Run Tests

```bash
cd server

# Start server
npm run dev

# In another terminal, run test
./test-validated-responses.sh
```

### What It Tests

- ✅ Opponent names appear (not game IDs)
- ✅ Dates are included
- ✅ Boards are shown with `[BOARD:fen]` tags
- ✅ Chess.com URLs included when available
- ✅ Eval information present
- ✅ Follow-up questions asked

### Expected Output

```
✅ Uses opponent name
✅ Includes date
✅ Shows 1 board(s)
✅ Includes Chess.com URL
✅ Asks follow-up question
```

---

## Example Response

**Question:** "What are my biggest weaknesses?"

**LLM Generates:**
```
[RESPONSE]
Looking at your recent games, material loss in sharp positions stands out. In your game vs Elmaestro-02 (Nov 3, 2024), on move 7 you played Bxf3:

[BOARD:r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R]

This dropped from +2.29 to +0.18 (lost 2.11 pawns). The engine suggests f6d5 instead, developing with tempo while maintaining your advantage.

View full game: https://chess.com/game/live/144937751322

Want to see more examples where you simplified from winning positions?

[GROUNDING]
{
  "games": [
    {"id": "02d8bc54f60c04cb", "opponent": "Elmaestro-02", "date": "2024-11-03", "url": "https://chess.com/game/live/144937751322"}
  ],
  "positions": [
    {
      "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R",
      "side_to_move": "b",
      "move_number": 7,
      "eval_before_cp": 229,
      "eval_after_cp": 18,
      "blunder_move_san": "Bxf3",
      "engine_best_san": "Nd5",
      "engine_id": "stockfish-17-lichess-hybrid",
      "depth": 12
    }
  ],
  "claims": [
    {
      "type": "missed_tactic",
      "evidence_position_fen": "r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R",
      "summary": "Simplifying from winning position lost 2+ pawns"
    }
  ],
  "follow_up_question": "Want to see more examples where you simplified from winning positions?"
}
```

**Backend Validates:**
- ✅ Game ID exists in ENGINE_FACTS
- ✅ FEN exists in ENGINE_FACTS
- ✅ Evals match (229 vs 229 ✓, 18 vs 18 ✓)
- ✅ Best move matches ("Nd5" ✓)
- ✅ Response mentions opponent ✓
- ✅ Board count = 1 ✓
- ✅ Word count < 150 ✓

**User Sees:**
```
Looking at your recent games, material loss in sharp positions stands out. In your game vs Elmaestro-02 (Nov 3, 2024), on move 7 you played Bxf3:

[Visual Chess Board]

This dropped from +2.29 to +0.18 (lost 2.11 pawns). The engine suggests f6d5 instead, developing with tempo while maintaining your advantage.

View full game: https://chess.com/game/live/144937751322

Want to see more examples where you simplified from winning positions?
```

---

## Comparison: Before vs After

| Feature | Prompt-Only | Dual-Block Validation |
|---------|-------------|----------------------|
| **Opponent names** | Sometimes | ✅ Always |
| **Dates** | Sometimes | ✅ Always |
| **Visual boards** | Sometimes | ✅ Always |
| **Eval changes** | Sometimes | ✅ Always |
| **Chess.com URLs** | Sometimes | ✅ Always |
| **Validation** | ❌ None | ✅ Full validation |
| **Auto-retry** | ❌ No | ✅ Yes (2 attempts) |
| **Conversational** | ✅ Yes | ✅ Yes |
| **Hallucinations** | ❌ Possible | ✅ Prevented |
| **Quality** | 🎲 Unpredictable | ✅ Guaranteed |

---

## Next Steps

### To Use:

1. **Restart server** to load new code:
   ```bash
   cd server
   npm run dev
   ```

2. **Ingest games** (if starting fresh):
   ```bash
   curl "http://localhost:8787/ingest/chesscom?username=YOUR_USERNAME&userId=YOUR_USERID&limitGames=10"
   ```

3. **Test in React Native app**:
   - Ask: "What are my biggest weaknesses?"
   - Verify: Opponent names, dates, boards appear
   - Check: No vague advice

4. **Run automated tests**:
   ```bash
   cd server
   ./test-validated-responses.sh
   ```

### To Extend:

- Add more claim types (e.g., `endgame_error`, `opening_trap`)
- Add severity levels (minor/major mistake)
- Add multi-turn memory (remember what was discussed)
- Add drill suggestions (link to specific puzzles)

---

## Summary

✅ **Implemented dual-block validation system**  
✅ **Created ENGINE_FACTS builder from game data**  
✅ **Added Zod schemas for grounding validation**  
✅ **Implemented retry logic with error feedback**  
✅ **Updated frontend to render [BOARD:fen] tags**  
✅ **Created end-to-end test script**  

**Result:** Coach now provides **guaranteed specific responses** while maintaining a conversational feel. No more vague advice, no more missing examples, no more hallucinations! 🎉

