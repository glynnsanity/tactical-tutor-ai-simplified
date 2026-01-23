import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createJob, appendTokens, markDone } from '../jobs/registry';
import { streamAnswer } from '../services/llm';
import { loadSummaries, upsertSummaries } from '../summaries/store';
import { listArchives, fetchArchive } from '../ingest/chesscom';
import { pgnToSummary } from '../ingest/pgnToSummary';
import { selectContent, computeMetaResponse, formatMetaResponse, type SelectedContent, type DataAvailability } from '../selection/contentSelector';
import { validateResponse, getValidationSummary } from '../validation/responseValidator';
import { getGroundedResponse } from '../services/structuredLLM';
import { promises as fs } from 'fs';
import * as path from 'path';

const AskBody = z.object({
  question: z.string().min(1).max(2000),
  userId: z.string().optional(),
});

/**
 * Build a grounded prompt for the LLM with strict anti-hallucination rules
 */
function buildSimplePrompt(question: string, content: SelectedContent): string {
  return `You are a friendly, encouraging chess coach for club players (900-1600 rating).

Your task: Write 2-4 sentences of helpful coaching advice based ONLY on the context below.

═══════════════════════════════════════════════════════════════════════════════
CRITICAL GROUNDING RULES - YOU MUST FOLLOW THESE:
═══════════════════════════════════════════════════════════════════════════════

1. ONLY reference games, opponents, and positions that appear in the CONTEXT below
2. If the user asks about something NOT in the context, say "I don't have data on that"
3. NEVER invent or fabricate game details, positions, opponents, or statistics
4. NEVER claim the user played an opening if it's not listed in SELECTED GAMES
5. When referencing a game, use the EXACT opponent name and date from the context
6. When discussing a position, only describe what is explicitly stated in the context
7. Do NOT make assumptions about games, moves, or outcomes you haven't seen

FORMATTING RULES:
- Do NOT include FEN strings, JSON, or any special formatting
- Do NOT use [BOARD:...] tags - boards will be added automatically
- Just write natural, conversational text
- Give ONE actionable improvement tip
- Keep it encouraging but honest

═══════════════════════════════════════════════════════════════════════════════
CONTEXT (This is your ONLY source of truth):
═══════════════════════════════════════════════════════════════════════════════

${content.coachingContext}

═══════════════════════════════════════════════════════════════════════════════
USER'S QUESTION: ${question}
═══════════════════════════════════════════════════════════════════════════════

Write your coaching response now (2-4 sentences only). Remember: ONLY reference data from the CONTEXT above.`;
}

/**
 * Assemble the final response by combining LLM text with pre-selected boards
 */
function assembleResponse(
  llmText: string,
  content: SelectedContent
): { text: string; boards: string[] } {
  // Clean up LLM text - remove any accidental formatting
  const cleanText = llmText
    .replace(/\[BOARD:[^\]]+\]/g, '') // Remove any board tags
    .replace(/\[RESPONSE\]/gi, '')    // Remove block markers
    .replace(/\[GROUNDING\]/gi, '')
    .replace(/```[\s\S]*?```/g, '')   // Remove code blocks
    .trim();

  // Get board FENs from pre-selected positions
  const boards = content.positions.map(p => p.fen);

  return { text: cleanText, boards };
}

/**
 * Build an honest response when no matching games are found
 * This prevents hallucination by NOT calling the LLM at all
 */
function buildNoDataResponse(
  content: SelectedContent
): string {
  const { questionType, dataAvailability } = content;

  let response = '';

  // Main message based on question type
  if (questionType.kind === 'opening') {
    response = `I don't have any ${questionType.opening} games in your history to analyze. `;
    response += `I've looked through ${dataAvailability.totalGamesAnalyzed} of your games, `;
    response += `but none of them feature this opening.`;
  } else if (questionType.kind === 'result') {
    const resultType = questionType.result;
    response = `I couldn't find any ${resultType === 'win' ? 'wins' : resultType === 'loss' ? 'losses' : 'draws'} `;
    response += `in your ${dataAvailability.totalGamesAnalyzed} analyzed games.`;
  } else if (questionType.kind === 'time_control') {
    response = `I don't have any ${questionType.timeControl} games in your history. `;
    response += `I've analyzed ${dataAvailability.totalGamesAnalyzed} games but none match this time control.`;
  } else if (questionType.kind === 'blunders') {
    response = `Good news! I couldn't find any games with significant mistakes in your history. `;
    response += `That's actually impressive!`;
  } else {
    response = `I couldn't find games matching your request in the ${dataAvailability.totalGamesAnalyzed} games I've analyzed.`;
  }

  return response;
}

/**
 * Format alternative suggestions as a bulleted list
 */
function formatSuggestions(suggestions: string[]): string {
  if (suggestions.length === 0) return '';

  let result = '\n\n**What I can help you with:**\n';
  for (const suggestion of suggestions) {
    result += `• ${suggestion}\n`;
  }
  return result;
}

/**
 * Auto-ingest games if user has none
 */
async function autoIngestIfEmpty(
  userId: string,
  limitMonths = 12,
  timeoutMs = 8000,
  limitGames = 50
): Promise<number> {
  const metaPath = path.join(process.cwd(), 'data', userId, '.autoingest.json');

  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw) as { lastIngestAt: number };
    if (meta?.lastIngestAt && Date.now() - meta.lastIngestAt < 6 * 60 * 60 * 1000) {
      return 0;
    }
  } catch {}

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const archives = (await listArchives(userId)).slice(0, Math.max(1, limitMonths));
    const toSave: any[] = [];

    archiveLoop: for (const url of archives) {
      const raw = await fetchArchive(url);
      const games = raw.split(/\n\n(?=\[Event )/).filter(Boolean);

      for (const pgn of games) {
        if (toSave.length >= limitGames) break archiveLoop;

        const s = await pgnToSummary(pgn, userId);
        if (s) toSave.push(s);
        if (controller.signal.aborted) break archiveLoop;
      }
      if (controller.signal.aborted) break;
    }

    if (toSave.length > 0) {
      await upsertSummaries(userId, toSave);
      await fs.mkdir(path.dirname(metaPath), { recursive: true });
      await fs.writeFile(metaPath, JSON.stringify({ lastIngestAt: Date.now() }), 'utf8');
    }
    return toSave.length;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get LLM response (non-streaming, collect full response)
 */
async function getLLMResponse(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullResponse = '';

    streamAnswer({
      system: prompt,
      user: '',
      onToken: (token: string) => {
        fullResponse += token;
      },
      onDone: () => {
        resolve(fullResponse);
      },
    }).catch(reject);
  });
}

export default async function askRoutes(app: FastifyInstance) {
  app.post('/ask', async (req, reply) => {
    const parse = AskBody.safeParse((req as any).body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parse.error.flatten() });
    }

    const { question, userId: providedUserId } = parse.data;
    const userId = (providedUserId && providedUserId.trim()) || 'demo';
    const userQuestion = question.replace(/\s+/g, ' ').trim();

    try {
      const job = createJob();
      const jobId = job.id;

      // Fire-and-forget response generation
      (async () => {
        try {
          app.log.info(`[Ask] Processing question for user ${userId}: "${userQuestion.substring(0, 50)}..."`);

          // Load user's games (auto-ingest if empty)
          let summaries = await loadSummaries(userId);
          if (!summaries || summaries.length === 0) {
            app.log.info('[Ask] No games found, attempting auto-ingest...');
            await autoIngestIfEmpty(userId, 12, 8000, 50);
            summaries = await loadSummaries(userId);
          }

          if (!summaries || summaries.length === 0) {
            app.log.warn('[Ask] No games available after auto-ingest');
            appendTokens(jobId, [
              "I don't have any of your games to analyze yet. ",
              "Please connect your Chess.com account first so I can give you personalized advice!"
            ]);
            markDone(jobId);
            return;
          }

          app.log.info(`[Ask] Found ${summaries.length} games for analysis`);

          // STAGE 1: Deterministic content selection
          const content = selectContent(userQuestion, summaries, 3, 2);
          app.log.info(`[Ask] Selection result: ${content.selectionResult.status}`);

          // STAGE 1A: Handle META questions directly (no LLM needed)
          // These are data-oriented questions that want facts, not coaching
          if (content.questionType.kind === 'meta') {
            app.log.info(`[Ask] Meta question detected: ${content.questionType.metaType}`);

            const metaData = computeMetaResponse(summaries, content.questionType.metaType);
            const metaResponse = formatMetaResponse(metaData);

            // Stream the factual response
            const words = metaResponse.split(' ');
            for (const word of words) {
              appendTokens(jobId, [word + ' ']);
            }

            markDone(jobId);
            app.log.info('[Ask] Meta response completed');
            return;
          }
          app.log.info(`[Ask] Selected ${content.games.length} games, ${content.positions.length} positions`);
          app.log.info(`[Ask] Question type: ${content.questionType.kind}`);

          // STAGE 1.5: Handle "no matching games" case - DO NOT HALLUCINATE
          if (content.selectionResult.status === 'no_matches') {
            app.log.info(`[Ask] No matching games for: ${content.selectionResult.requestedFilter}`);

            // Build honest response without calling LLM
            const noDataText = buildNoDataResponse(content);
            const suggestions = formatSuggestions(content.dataAvailability.alternativeSuggestions);

            // Stream the honest response
            const words = noDataText.split(' ');
            for (const word of words) {
              appendTokens(jobId, [word + ' ']);
            }

            // Add suggestions if available
            if (suggestions) {
              appendTokens(jobId, [suggestions]);
            }

            markDone(jobId);
            app.log.info('[Ask] No-match response completed');
            return;
          }

          // STAGE 2: Two-Pass LLM with Grounding Verification
          app.log.info('[Ask] Starting two-pass grounded response generation...');
          const groundedResult = await getGroundedResponse(userQuestion, content);

          let finalText: string;

          if (groundedResult.success) {
            app.log.info(`[Ask] Two-pass succeeded. Grounding valid: ${groundedResult.groundingValid}`);

            if (groundedResult.groundingIssues.length > 0) {
              app.log.warn(`[Ask] Grounding issues: ${groundedResult.groundingIssues.join(', ')}`);
            }

            finalText = groundedResult.naturalLanguage;

            // Add disclaimer if grounding had issues
            if (!groundedResult.groundingValid) {
              finalText += '\n\n*Note: Some details may need verification.*';
            }

          } else {
            app.log.warn(`[Ask] Two-pass failed: ${groundedResult.error}`);
            app.log.info('[Ask] Falling back to simple LLM generation...');

            // Fallback to simple prompt if two-pass fails
            const prompt = buildSimplePrompt(userQuestion, content);
            const llmText = await getLLMResponse(prompt);

            // Validate the fallback response
            const validation = validateResponse(llmText, content);
            app.log.info(`[Ask] Fallback validation: ${getValidationSummary(validation)}`);

            finalText = validation.isValid ? llmText : validation.sanitizedResponse;

            if (validation.confidence < 0.5) {
              finalText += '\n\n*Note: I had limited context for this response.*';
            }
          }

          // STAGE 3: Assembly
          const response = assembleResponse(finalText, content);

          // Stream the response
          const words = response.text.split(' ');
          for (const word of words) {
            appendTokens(jobId, [word + ' ']);
          }

          // Append boards
          if (response.boards.length > 0) {
            appendTokens(jobId, ['\n\n']);
            for (const fen of response.boards) {
              appendTokens(jobId, [`[BOARD:${fen}]\n\n`]);
            }
          }

          // Add game link if available
          if (content.games.length > 0 && content.games[0].chesscomUrl) {
            appendTokens(jobId, [`\n[View game on Chess.com](${content.games[0].chesscomUrl})`]);
          }

          markDone(jobId);
          app.log.info('[Ask] Response completed successfully');

        } catch (err) {
          app.log.error({ err }, '[Ask] Response generation failed');
          appendTokens(jobId, [
            'Sorry, I encountered an error analyzing your games. ',
            'Please try asking your question again.'
          ]);
          markDone(jobId);
        }
      })();

      return reply.send({ jobId });

    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ error: 'Internal error' });
    }
  });
}
