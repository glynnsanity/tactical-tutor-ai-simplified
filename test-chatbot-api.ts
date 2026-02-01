/**
 * API-based Chatbot Quality Test
 *
 * Tests chatbot responses directly via API without UI overhead.
 * Run: npx tsx test-chatbot-api.ts
 */

const API_BASE = 'http://localhost:8787';
const USER_ID = 'chesscom-midnightcontender';

const TEST_QUESTIONS = [
  {
    id: 'weaknesses',
    question: 'What are my biggest weaknesses based on my recent games?',
    expectedElements: ['opponent name', 'move number', 'specific advice'],
  },
  {
    id: 'endgame',
    question: 'How can I improve my endgame?',
    expectedElements: ['late-game position (move 30+)', 'specific endgame type', 'practice recommendation'],
  },
  {
    id: 'openings',
    question: 'What openings would you recommend for my skill level?',
    expectedElements: ['opening name', 'win/loss context', 'why this opening suits them'],
  },
  {
    id: 'last_game',
    question: 'Can you analyze my last game?',
    expectedElements: ['specific game reference', 'move-by-move insights', 'key turning points'],
  },
  {
    id: 'blind_spot',
    question: "What's my biggest blind spot that I might not notice myself?",
    expectedElements: ['pattern identification', 'quantified occurrence', 'specific fix'],
  },
];

interface TestResult {
  questionId: string;
  question: string;
  response: string;
  responseTimeMs: number;
  score: number;
  analysis: string;
  issues: string[];
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function askQuestion(question: string): Promise<{ response: string; timeMs: number }> {
  const startTime = Date.now();

  // Start the ask job
  const askRes = await fetch(`${API_BASE}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, userId: USER_ID }),
  });

  if (!askRes.ok) {
    throw new Error(`Ask failed: ${askRes.status}`);
  }

  const { jobId } = await askRes.json() as { jobId: string };

  // Poll for response
  let response = '';
  let cursor = 0;
  let done = false;

  while (!done) {
    const pollRes = await fetch(`${API_BASE}/poll?jobId=${jobId}&cursor=${cursor}`);
    const data = await pollRes.json() as { tokens: string[]; done: boolean };

    if (data.tokens && data.tokens.length > 0) {
      response += data.tokens.join('');
      cursor += data.tokens.length;
    }

    done = data.done;

    if (!done) {
      await sleep(200);
    }
  }

  return {
    response: response.trim(),
    timeMs: Date.now() - startTime,
  };
}

function scoreResponse(response: string, questionId: string): { score: number; analysis: string; issues: string[] } {
  const issues: string[] = [];
  let score = 5; // Start at max, deduct for issues

  // Check for error responses
  if (response.includes('error') || response.includes('Error') || response.includes('sorry')) {
    issues.push('Response contains error message');
    score -= 3;
  }

  // Check for "no data" responses
  if (response.includes("don't have enough") || response.includes("don't have data")) {
    issues.push('Response indicates missing data');
    score -= 2;
  }

  // Check for generic responses
  const genericPhrases = [
    'study tactics',
    'play more games',
    'practice regularly',
    'focus on fundamentals',
  ];
  for (const phrase of genericPhrases) {
    if (response.toLowerCase().includes(phrase)) {
      issues.push(`Generic phrase detected: "${phrase}"`);
      score -= 0.5;
    }
  }

  // Check for specificity markers (positive)
  const specificityMarkers = {
    hasOpponent: /(?:against|vs\.?|versus)\s+\w+/i.test(response),
    hasMoveNumber: /move\s+\d+/i.test(response),
    hasOpeningName: /(?:sicilian|french|italian|spanish|king'?s?\s+(?:pawn|indian)|queen'?s?\s+gambit|caro|london|uncommon)/i.test(response),
    hasEval: /(?:\+|-)\d+\.?\d*|pawns?|eval/i.test(response),
    hasActionItem: /(?:practice|try|focus on|work on|study|lichess|chess\.com)/i.test(response),
  };

  const specificityCount = Object.values(specificityMarkers).filter(Boolean).length;

  if (specificityCount < 2) {
    issues.push('Lacks specificity (fewer than 2 concrete references)');
    score -= 1;
  }

  if (specificityCount >= 4) {
    // Bonus for highly specific response
    score = Math.min(5, score + 0.5);
  }

  // Check for hallucination markers
  if (/\d{3,}\.?\d*\s*pawns?/i.test(response)) {
    issues.push('Possible hallucinated eval (unrealistic pawn value)');
    score -= 1;
  }

  // Length check
  if (response.length < 100) {
    issues.push('Response too short (< 100 chars)');
    score -= 1;
  }

  // Build analysis
  const analysis = [
    `Specificity: ${specificityCount}/5 markers`,
    specificityMarkers.hasOpponent ? '✓ Has opponent' : '✗ Missing opponent',
    specificityMarkers.hasMoveNumber ? '✓ Has move number' : '✗ Missing move number',
    specificityMarkers.hasOpeningName ? '✓ Has opening name' : '✗ Missing opening name',
    specificityMarkers.hasActionItem ? '✓ Has action item' : '✗ Missing action item',
  ].join(', ');

  return {
    score: Math.max(1, Math.min(5, score)),
    analysis,
    issues,
  };
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           CHATBOT API QUALITY TEST                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check server health
  try {
    const health = await fetch(`${API_BASE}/health`);
    if (!health.ok) throw new Error('Server not healthy');
    console.log('✓ Server is running\n');
  } catch (err) {
    console.error('✗ Server not running. Start with: cd server && npm run dev');
    process.exit(1);
  }

  const results: TestResult[] = [];

  for (const test of TEST_QUESTIONS) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Q: "${test.question}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const { response, timeMs } = await askQuestion(test.question);
      const { score, analysis, issues } = scoreResponse(response, test.id);

      // Extract text only (remove board tags)
      const textOnly = response.replace(/\[BOARD:[^\]]+\]/g, '').trim();

      results.push({
        questionId: test.id,
        question: test.question,
        response: textOnly,
        responseTimeMs: timeMs,
        score,
        analysis,
        issues,
      });

      // Display results
      const scoreEmoji = score >= 4 ? '✅' : score >= 3 ? '⚠️' : '❌';
      console.log(`\nResponse (${timeMs}ms):`);
      console.log(`"${textOnly.substring(0, 300)}${textOnly.length > 300 ? '...' : ''}"\n`);
      console.log(`Score: ${scoreEmoji} ${score.toFixed(1)}/5`);
      console.log(`Analysis: ${analysis}`);
      if (issues.length > 0) {
        console.log(`Issues: ${issues.join('; ')}`);
      }
      console.log('');

    } catch (err) {
      console.error(`Error: ${err}`);
      results.push({
        questionId: test.id,
        question: test.question,
        response: `ERROR: ${err}`,
        responseTimeMs: 0,
        score: 1,
        analysis: 'Failed to get response',
        issues: [`Error: ${err}`],
      });
    }
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                       SUMMARY                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const passing = results.filter(r => r.score >= 4).length;
  const failing = results.filter(r => r.score < 4).length;

  console.log('┌──────────────────┬───────┬──────────┐');
  console.log('│ Question         │ Score │ Status   │');
  console.log('├──────────────────┼───────┼──────────┤');
  for (const r of results) {
    const status = r.score >= 4 ? 'PASS' : r.score >= 3 ? 'MARGINAL' : 'FAIL';
    const paddedId = r.questionId.padEnd(16);
    const paddedScore = r.score.toFixed(1).padStart(5);
    const paddedStatus = status.padEnd(8);
    console.log(`│ ${paddedId} │ ${paddedScore} │ ${paddedStatus} │`);
  }
  console.log('└──────────────────┴───────┴──────────┘');

  console.log(`\nAverage Score: ${avgScore.toFixed(2)}/5`);
  console.log(`Passing (≥4): ${passing}/${results.length}`);
  console.log(`Failing (<4): ${failing}/${results.length}`);

  if (failing > 0) {
    console.log('\n⚠️  Some responses need improvement. See issues above.');
  } else {
    console.log('\n✅ All responses meet quality threshold!');
  }

  // Return exit code based on results
  process.exit(failing > 0 ? 1 : 0);
}

runTests().catch(console.error);
