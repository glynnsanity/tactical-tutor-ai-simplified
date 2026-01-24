import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createJob, appendTokens, markDone } from '../jobs/registry';
import { streamAnswer } from '../services/llm';
import { loadSummaries, upsertSummaries } from '../summaries/store';
import { listArchives, fetchArchive } from '../ingest/chesscom';
import { pgnToSummary } from '../ingest/pgnToSummary';
import { selectContent, computeMetaResponse, formatMetaResponse, detectComplexAnalysisRequest, type SelectedContent, type DataAvailability } from '../selection/contentSelector';
import { validateResponse, getValidationSummary } from '../validation/responseValidator';
import { getGroundedResponse } from '../services/structuredLLM';
import { getOrGenerateProfile } from '../profile/store';
import { getOrGenerateHistoricalStats, queryOpeningHistory, formatOpeningHistorySummary } from '../profile/historicalStore';
import {
  estimateScope,
  formatScopePrompt,
  performAnalysis,
  formatAnalysisResult,
  type AnalysisDepth,
  type AnalysisRequest,
} from '../analysis/interactiveAnalysis';
import { getCachedAnalysis, setCachedAnalysis } from '../analysis/analysisCache';
import { analyzeIntent, type IntentAnalysis } from '../services/intentAnalyzer';
import { getCachedIntent, cacheIntent } from '../services/intentCache';
import { getCachedResponse, cacheResponse } from '../services/responseCache';
import { loadProfile } from '../profile/store';
import { getProgress, isAnalyzing } from '../analysis/sessionManager';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Analysis confidence levels based on games analyzed
 */
interface AnalysisConfidence {
  level: 'limited' | 'partial' | 'good' | 'full';
  gamesAnalyzed: number;
  totalGames: number | null;
  percentComplete: number;
  isAnalyzing: boolean;
  message: string;
}

/**
 * Determine confidence level based on analysis progress
 */
function getAnalysisConfidence(userId: string, summariesCount: number): AnalysisConfidence {
  const progress = getProgress(userId);
  const analyzing = isAnalyzing(userId);

  if (progress && analyzing) {
    // Analysis in progress
    const percent = progress.percentComplete;
    let level: AnalysisConfidence['level'];
    let message: string;

    if (percent < 20) {
      level = 'limited';
      message = `I'm still analyzing your games (${percent}% complete). My answers will improve as I process more data.`;
    } else if (percent < 50) {
      level = 'partial';
      message = `Analysis ${percent}% complete. I have enough data for general insights, but patterns may still emerge.`;
    } else if (percent < 90) {
      level = 'good';
      message = `Analysis ${percent}% complete. I have solid data to work with.`;
    } else {
      level = 'full';
      message = `Analysis nearly complete (${percent}%).`;
    }

    return {
      level,
      gamesAnalyzed: progress.gamesAnalyzed,
      totalGames: progress.totalGames,
      percentComplete: percent,
      isAnalyzing: true,
      message,
    };
  }

  // No active analysis - use summaries count
  let level: AnalysisConfidence['level'];
  let message: string;

  if (summariesCount < 20) {
    level = 'limited';
    message = `I only have ${summariesCount} games to analyze. More games would help me give better advice.`;
  } else if (summariesCount < 100) {
    level = 'partial';
    message = `Based on ${summariesCount} games analyzed.`;
  } else if (summariesCount < 300) {
    level = 'good';
    message = `Based on ${summariesCount} games - solid sample size.`;
  } else {
    level = 'full';
    message = `Based on comprehensive analysis of ${summariesCount} games.`;
  }

  return {
    level,
    gamesAnalyzed: summariesCount,
    totalGames: null,
    percentComplete: 100,
    isAnalyzing: false,
    message,
  };
}

/**
 * Format confidence indicator for display
 */
function formatConfidenceIndicator(confidence: AnalysisConfidence): string {
  const icons: Record<AnalysisConfidence['level'], string> = {
    limited: '[Limited Data]',
    partial: '[Partial Analysis]',
    good: '[Good Coverage]',
    full: '[Full Analysis]',
  };

  if (confidence.isAnalyzing) {
    return `${icons[confidence.level]} ${confidence.gamesAnalyzed}/${confidence.totalGames} games analyzed`;
  }

  return icons[confidence.level];
}

const AskBody = z.object({
  question: z.string().min(1).max(2000),
  userId: z.string().optional(),
});

/**
 * Build a grounded prompt for the LLM with strict anti-hallucination rules
 * Quick Win #5: Trimmed decorations to reduce token usage by ~15%
 */
function buildSimplePrompt(question: string, content: SelectedContent): string {
  // Determine if this is a pattern-level question or a specific-game question
  const q = question.toLowerCase();
  const isPatternQuestion =
    q.includes('weakness') || q.includes('strength') ||
    q.includes('pattern') || q.includes('improve') ||
    q.includes('biggest') || q.includes('main') ||
    q.includes('common') || q.includes('recurring') ||
    q.includes('tend to') || q.includes('usually') ||
    q.includes('overall') || q.includes('in general');

  // Add question-specific guidance (compact format)
  let modeHint = '';
  if (isPatternQuestion && content.profile) {
    modeHint = '\nMODE: Pattern analysis. Synthesize across MULTIPLE games. Cite stats. Don\'t focus on one game.';
  } else if (content.questionType.kind === 'endgame') {
    modeHint = '\nMODE: Endgame focus. Cite late-game positions (move 30+), eval changes, piece coordination.';
  } else if (content.questionType.kind === 'opening') {
    modeHint = '\nMODE: Opening focus. Cite opening name, ECO code, win/loss record, early positions.';
  } else if (content.questionType.kind === 'blunders') {
    modeHint = '\nMODE: Mistake focus. Cite large eval swings (2+ pawns), move numbers, suggest puzzles.';
  }

  return `You are a data-driven chess coach. Write 2-4 sentences based ONLY on context below.
${modeHint}
## GOOD ADVICE
- SPECIFIC: "In game vs Smith, move 34 Rxe4 lost 2.5 pawns"
- QUANTIFIED: "Struggled in 3 of 5 rook endgames"
- ACTIONABLE: "Practice Lucena positions on Lichess"

## RULES
1. ONLY reference games/positions from CONTEXT
2. Use EXACT opponent names, dates, move numbers
3. Cite eval changes (e.g., "+1.5 to -2.0")
4. If no data, say "I don't have enough data"
5. NEVER invent details

## FORMAT
Natural text, no FEN/JSON. End with ONE practice recommendation.

## CONTEXT
${content.coachingContext}

## QUESTION: ${question}

Response (2-4 sentences):`;
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
  } else if (questionType.kind === 'endgame') {
    response = `I don't have enough endgame positions to analyze from your games. `;
    response += `Most of your ${dataAvailability.totalGamesAnalyzed} games ended before reaching a typical endgame. `;
    response += `Try playing some longer games that reach move 30+ so I can analyze your endgame technique!`;
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

          // Check analysis confidence level
          const confidence = getAnalysisConfidence(userId, summaries.length);
          app.log.info(`[Ask] Confidence: ${confidence.level} (${confidence.gamesAnalyzed} games, analyzing: ${confidence.isAnalyzing})`);

          // If analysis is in progress with very limited data, inform user
          if (confidence.isAnalyzing && confidence.level === 'limited') {
            appendTokens(jobId, [
              `*${formatConfidenceIndicator(confidence)}*\n\n`,
              `${confidence.message}\n\n`,
            ]);
          }

          // STAGE 0: Check for complex analysis requests that need scope prompting
          const complexRequest = detectComplexAnalysisRequest(userQuestion);
          if (complexRequest.isComplex) {
            app.log.info(`[Ask] Complex analysis request detected`);

            // Estimate scope
            const filter: { opening?: string; timeControl?: string } = {};
            if (complexRequest.opening) filter.opening = complexRequest.opening;
            if (complexRequest.timeControl) filter.timeControl = complexRequest.timeControl;

            const scope = estimateScope(summaries, filter);
            const queryDesc = complexRequest.opening || complexRequest.timeControl || 'your games';

            // If requires confirmation, show scope prompt
            if (scope.requiresAnalysis) {
              const prompt = formatScopePrompt(scope, queryDesc);

              const words = prompt.split(' ');
              for (const word of words) {
                appendTokens(jobId, [word + ' ']);
              }

              markDone(jobId);
              app.log.info('[Ask] Scope prompt shown, waiting for user depth choice');
              return;
            }

            // Small sample - just do standard analysis directly
            app.log.info('[Ask] Small sample, proceeding with standard analysis');

            // Check cache first
            let result = await getCachedAnalysis(userId, filter, 'standard', summaries.length);

            if (result) {
              app.log.info('[Ask] Using cached analysis result');
            } else {
              result = await performAnalysis(summaries, filter, 'standard');
              await setCachedAnalysis(userId, filter, 'standard', result, summaries.length);
            }

            const response = formatAnalysisResult(result, queryDesc);

            const words = response.split(' ');
            for (const word of words) {
              appendTokens(jobId, [word + ' ']);
            }

            markDone(jobId);
            return;
          }

          // Quick Win #1: PARALLEL EXECUTION
          // Run profile loading and intent analysis concurrently to reduce latency by ~40%
          app.log.info('[Ask] Starting parallel profile + intent analysis...');

          // Extract data needed for intent analysis (fast, synchronous)
          const openingsPlayed = [...new Set(summaries.map(s => s.opening?.name).filter(Boolean))] as string[];
          const timeControls = [...new Set(summaries.map(s => s.timeControl?.type).filter(Boolean))] as string[];

          // Check intent cache first (synchronous)
          const cachedIntent = getCachedIntent(userQuestion);

          // Run in parallel: profile generation + intent analysis (if not cached)
          const [profile, intent] = await Promise.all([
            // Task 1: Load or generate profile
            getOrGenerateProfile(userId, summaries),

            // Task 2: Analyze intent (skip if cached)
            (async (): Promise<IntentAnalysis | undefined> => {
              if (cachedIntent) {
                app.log.info(`[Ask] Using cached intent: scope=${cachedIntent.scope}`);
                return cachedIntent;
              }

              try {
                const analyzed = await analyzeIntent(userQuestion, {
                  totalGames: summaries.length,
                  hasProfile: true, // Assume profile will be available
                  hasHistoricalStats: true,
                  openingsPlayed,
                  timeControls,
                });
                app.log.info(`[Ask] Intent analysis: scope=${analyzed.scope}, patterns=${analyzed.requiresPatternAnalysis}, factual=${analyzed.isFactualOnly}`);
                cacheIntent(userQuestion, analyzed);
                return analyzed;
              } catch (intentError) {
                app.log.warn(`[Ask] Intent analysis failed, using fallback: ${intentError}`);
                return undefined;
              }
            })(),
          ]);

          app.log.info(`[Ask] Parallel load complete: profile=${profile.weaknesses.length} weaknesses, intent=${intent?.scope || 'fallback'}`);

          // Quick Win #4: Check response cache before LLM
          const cachedResponse = getCachedResponse(userQuestion, summaries.length);
          if (cachedResponse) {
            app.log.info('[Ask] Using cached LLM response');
            const words = cachedResponse.split(' ');
            for (const word of words) {
              appendTokens(jobId, [word + ' ']);
            }
            markDone(jobId);
            return;
          }

          // STAGE 0.6: Intent-based routing (bypass LLM for certain question types)
          if (intent) {
            // Route stats questions directly to meta response
            if (intent.scope === 'stats' && intent.isFactualOnly) {
              app.log.info('[Ask] Intent routing: stats question -> meta response');
              const metaData = computeMetaResponse(summaries, 'stats');
              const metaResponse = formatMetaResponse(metaData);

              const words = metaResponse.split(' ');
              for (const word of words) {
                appendTokens(jobId, [word + ' ']);
              }
              markDone(jobId);
              return;
            }

            // Route historical questions directly
            if (intent.scope === 'historical' && intent.isFactualOnly) {
              app.log.info('[Ask] Intent routing: historical question -> historical stats');
              const historicalStats = await getOrGenerateHistoricalStats(userId, summaries);

              let response: string;
              if (intent.filters.opening) {
                const openingHistory = queryOpeningHistory(historicalStats, intent.filters.opening);
                if (openingHistory) {
                  response = formatOpeningHistorySummary(openingHistory);
                } else {
                  response = `I don't have any ${intent.filters.opening} games in your history. `;
                  response += `You've played ${historicalStats.lifetime.totalGames} total games.`;
                }
              } else {
                response = `## Your Chess History\n\n`;
                response += `**Lifetime:** ${historicalStats.lifetime.totalGames} games\n`;
                response += `**Record:** ${historicalStats.lifetime.wins}W - ${historicalStats.lifetime.losses}L - ${historicalStats.lifetime.draws}D\n`;
              }

              const words = response.split(' ');
              for (const word of words) {
                appendTokens(jobId, [word + ' ']);
              }
              markDone(jobId);
              return;
            }
          }

          // STAGE 1: Deterministic content selection (now with intent-driven classification)
          const content = selectContent(userQuestion, summaries, 3, 2, profile, intent);
          app.log.info(`[Ask] Selection result: ${content.selectionResult.status}, questionType: ${content.questionType.kind}`);

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

          // STAGE 1B: Handle ANALYSIS REQUESTS with specified depth
          // User has chosen a depth after seeing scope prompt
          if (content.questionType.kind === 'analysis_request') {
            const { depth, opening, timeControl } = content.questionType;
            app.log.info(`[Ask] Analysis request: depth=${depth}, opening=${opening}, tc=${timeControl}`);

            // Build filter
            const filter: { opening?: string; timeControl?: string } = {};
            if (opening) filter.opening = opening;
            if (timeControl) filter.timeControl = timeControl;

            // Check cache first
            const cachedResult = await getCachedAnalysis(
              userId,
              filter,
              depth,
              summaries.length
            );

            let result;
            if (cachedResult) {
              app.log.info('[Ask] Using cached analysis result');
              appendTokens(jobId, ['*Using cached results...*\n']);
              result = cachedResult;
            } else {
              // Perform analysis with progress updates
              let lastProgressMessage = '';
              result = await performAnalysis(
                summaries,
                filter,
                depth,
                (progress) => {
                  // Stream progress updates
                  if (progress.message !== lastProgressMessage) {
                    appendTokens(jobId, [`*${progress.message}*\n`]);
                    lastProgressMessage = progress.message;
                  }
                }
              );

              // Cache the result
              await setCachedAnalysis(userId, filter, depth, result, summaries.length);
              app.log.info('[Ask] Analysis result cached');
            }

            // Format and stream result
            const queryDesc = opening || timeControl || 'your games';
            const response = formatAnalysisResult(result, queryDesc);

            const words = response.split(' ');
            for (const word of words) {
              appendTokens(jobId, [word + ' ']);
            }

            markDone(jobId);
            app.log.info('[Ask] Analysis request completed');
            return;
          }

          // STAGE 1C: Handle HISTORICAL questions using aggregated stats
          // These need all-time data that's pre-computed
          if (content.questionType.kind === 'historical') {
            app.log.info(`[Ask] Historical question detected: opening=${content.questionType.opening}, tc=${content.questionType.timeControl}`);

            // Load or generate historical stats
            const historicalStats = await getOrGenerateHistoricalStats(userId, summaries);
            app.log.info(`[Ask] Historical stats loaded: ${historicalStats.openings.length} openings tracked`);

            let response: string;

            if (content.questionType.opening) {
              // Query specific opening history
              const openingHistory = queryOpeningHistory(historicalStats, content.questionType.opening);

              if (openingHistory) {
                response = formatOpeningHistorySummary(openingHistory);
              } else {
                response = `I don't have any ${content.questionType.opening} games in your history. `;
                response += `You've played ${historicalStats.lifetime.totalGames} total games across ${historicalStats.openings.length} different openings.`;

                // Suggest similar openings
                if (historicalStats.openings.length > 0) {
                  response += `\n\n**Your most played openings:**\n`;
                  for (const op of historicalStats.openings.slice(0, 5)) {
                    response += `- ${op.name}: ${op.allTime.gamesPlayed} games (${op.allTime.winRate}% win rate)\n`;
                  }
                }
              }
            } else if (content.questionType.timeControl) {
              // Query time control history
              const tcHistory = historicalStats.timeControls.find(
                tc => tc.type === content.questionType.timeControl
              );

              if (tcHistory) {
                response = `## ${content.questionType.timeControl.charAt(0).toUpperCase() + content.questionType.timeControl.slice(1)} Performance\n\n`;
                response += `**All-time:** ${tcHistory.allTime.gamesPlayed} games\n`;
                response += `**Record:** ${tcHistory.allTime.wins}W - ${tcHistory.allTime.losses}L - ${tcHistory.allTime.draws}D (${tcHistory.allTime.winRate}% win rate)\n`;
                response += `**Trend:** ${tcHistory.trend}\n`;

                if (tcHistory.byPeriod.length > 0) {
                  response += `\n**By Quarter:**\n`;
                  for (const period of tcHistory.byPeriod.slice(-6)) {
                    response += `- ${period.period}: ${period.gamesPlayed} games, ${period.winRate}% win rate\n`;
                  }
                }
              } else {
                response = `I don't have any ${content.questionType.timeControl} games in your history.`;
              }
            } else {
              // General historical overview
              response = `## Your Chess History\n\n`;
              response += `**Lifetime:** ${historicalStats.lifetime.totalGames} games\n`;
              response += `**Record:** ${historicalStats.lifetime.wins}W - ${historicalStats.lifetime.losses}L - ${historicalStats.lifetime.draws}D (${historicalStats.lifetime.winRate}% win rate)\n`;

              if (historicalStats.lifetime.firstGame && historicalStats.lifetime.latestGame) {
                const first = new Date(historicalStats.lifetime.firstGame).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                const last = new Date(historicalStats.lifetime.latestGame).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                response += `**Active:** ${first} – ${last}\n`;
              }

              response += `\n**Top Openings:**\n`;
              for (const op of historicalStats.openings.slice(0, 5)) {
                response += `- ${op.name}: ${op.allTime.gamesPlayed} games (${op.allTime.winRate}% win rate)\n`;
              }
            }

            // Stream the response
            const words = response.split(' ');
            for (const word of words) {
              appendTokens(jobId, [word + ' ']);
            }

            markDone(jobId);
            app.log.info('[Ask] Historical response completed');
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

          // STAGE 1.6: Handle zero-game edge case for 'general' questions
          // The 'general' question type doesn't return 'no_matches' even with 0 games
          if (content.games.length === 0 && content.positions.length === 0) {
            app.log.info('[Ask] Zero games/positions available - providing honest response');

            const noDataResponse = summaries.length === 0
              ? "I don't have any games to analyze yet. Please make sure your Chess.com username is correct, or try playing a few games first!"
              : "I couldn't find specific games relevant to your question. Try asking about your openings, recent opponents, or overall performance.";

            const words = noDataResponse.split(' ');
            for (const word of words) {
              appendTokens(jobId, [word + ' ']);
            }

            markDone(jobId);
            app.log.info('[Ask] Zero-data response completed');
            return;
          }

          // STAGE 2: Two-Pass LLM with Grounding Verification
          // Now passes intent analysis for smarter prompt construction
          app.log.info('[Ask] Starting two-pass grounded response generation...');
          const groundedResult = await getGroundedResponse(userQuestion, content, intent);

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

          // Quick Win #4: Cache successful LLM responses
          // Build full response text for caching (includes boards and links)
          let fullResponseText = response.text;
          if (response.boards.length > 0) {
            fullResponseText += '\n\n' + response.boards.map(fen => `[BOARD:${fen}]`).join('\n\n');
          }
          if (content.games.length > 0 && content.games[0].chesscomUrl) {
            fullResponseText += `\n[View game on Chess.com](${content.games[0].chesscomUrl})`;
          }
          cacheResponse(userQuestion, summaries.length, fullResponseText);

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

          // Add confidence indicator if analysis is in progress or limited
          if (confidence.isAnalyzing || confidence.level === 'limited' || confidence.level === 'partial') {
            appendTokens(jobId, [`\n\n---\n*${formatConfidenceIndicator(confidence)}* - ${confidence.message}`]);
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
