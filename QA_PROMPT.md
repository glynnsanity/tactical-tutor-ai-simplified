# Chatbot Response Evaluation Rubric

This document defines how to evaluate the quality of Chess Coach AI responses.

## Quality Criteria

### What Makes a GOOD Response (Score 4-5)
- **References specific data**: Cites actual games, positions, or patterns from the user's Chess.com history
- **Provides actionable advice**: Specific recommendations like "Practice these 3 endgame patterns" not just "Your endgame is weak"
- **Personalized**: Tailored to this player's rating, playing style, and history — not generic tips
- **Prioritizes impact**: Focuses on the highest-impact improvements based on data

### What Makes a BAD Response (Score 1-2)
- Gives generic advice like "Study tactics and play more games"
- Makes vague observations without actionable next steps
- Doesn't reference any actual data from the user's games
- Could be copy-pasted for any chess player

---

## Critical Test Questions

| Question | Good Response Includes |
|----------|------------------------|
| "What are my biggest weaknesses based on my recent games?" | Specific patterns like "You lose 40% of games when you reach a rook endgame" |
| "How can I improve my endgame?" | References actual endgame positions from their games, not generic theory |
| "What openings would you recommend for my skill level?" | Considers what they already play and where they're losing |
| "Can you analyze my last game?" | Walks through specific moves and mistakes from an actual game |
| "What's my biggest blind spot?" | Finds patterns the user might not notice themselves |

---

## Acceptable Fallbacks

When data doesn't support a full answer:

| Status | Example |
|--------|---------|
| ✅ Acceptable | "I don't have enough endgame data — try playing 5-10 more games that reach an endgame" |
| ✅ Acceptable | "Based on typical patterns at your rating, X is common — but I'd need to see your specific games to confirm" |
| ✅ Acceptable | "Are you asking about rapid, blitz, or bullet games? Your patterns differ across time controls" |
| ❌ NOT Acceptable | Hallucinating data that doesn't exist |
| ❌ NOT Acceptable | Giving confident advice without data to back it up |

---

## Scoring Scale (1-5)

| Score | Description | Example |
|-------|-------------|---------|
| **5** | Specific, actionable, personalized, references real data | "In your game vs IlCapo3, you missed Nxe5 on move 23 which would have won the exchange. This pattern of missing knight forks appeared in 3 of your last 10 games. Practice knight fork puzzles on Lichess." |
| **4** | Good advice with some personalization, minor gaps | "You tend to struggle in rook endgames based on your recent games. Focus on practicing Lucena and Philidor positions." |
| **3** | Relevant but generic, could apply to many players | "Looking at your games, you should work on your endgame technique and tactical awareness." |
| **2** | Vague or unhelpful, minimal connection to user data | "Your endgame needs work. Try studying endgame principles." |
| **1** | Wrong, hallucinated, or completely generic | "Study tactics and play more games to improve." |

**Minimum passing score: 4**

---

## When to Fix vs Accept

### DO Fix
- Generic responses when personalized data IS available
- Hallucinated information (referencing games/moves that don't exist)
- Failure to use available data in the response
- Poor prompt engineering causing vague outputs

### DON'T Fix (Accept as-is)
- Missing data from Chess.com (not our code's fault)
- Response uses acceptable fallback rules above
- User asked about something genuinely not in their game history

---

## Testing Process

1. Run the 5 critical test questions
2. Screenshot each response
3. Score each response 1-5
4. For any score < 4:
   - Identify root cause (prompt, data fetching, or logic issue)
   - Fix the code
   - Re-test and verify score improves to 4+
