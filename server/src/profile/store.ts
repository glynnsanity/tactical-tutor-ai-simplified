/**
 * Player Profile Storage
 *
 * Stores pre-computed profiles alongside game summaries.
 * Profile is regenerated when games are updated.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { PlayerProfile, type PlayerProfileT } from './schema';
import { generateProfile } from './generator';
import type { CompactGameSummaryT } from '../summaries/schemas';

const DATA_ROOT = path.join(process.cwd(), 'data');

function profilePath(userId: string): string {
  return path.join(DATA_ROOT, userId, 'profile.json');
}

/**
 * Load a player's profile from disk
 */
export async function loadProfile(userId: string): Promise<PlayerProfileT | null> {
  const file = profilePath(userId);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    return PlayerProfile.parse(data);
  } catch (err: any) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return null;
    console.error('[ProfileStore] Failed to load profile:', err);
    return null;
  }
}

/**
 * Save a player's profile to disk
 */
export async function saveProfile(userId: string, profile: PlayerProfileT): Promise<void> {
  const dir = path.join(DATA_ROOT, userId);
  await fs.mkdir(dir, { recursive: true });

  const validated = PlayerProfile.parse(profile);
  const file = profilePath(userId);
  await fs.writeFile(file, JSON.stringify(validated, null, 2), 'utf8');
}

/**
 * Regenerate profile from game summaries
 * Call this after ingesting new games
 */
export async function regenerateProfile(
  userId: string,
  summaries: CompactGameSummaryT[],
  chesscomUsername?: string | null
): Promise<PlayerProfileT> {
  console.log(`[ProfileStore] Regenerating profile for ${userId} with ${summaries.length} games`);

  const profile = generateProfile(userId, chesscomUsername || null, summaries);
  await saveProfile(userId, profile);

  console.log(`[ProfileStore] Profile saved with ${profile.weaknesses.length} weaknesses, ${profile.strengths.length} strengths`);
  return profile;
}

/**
 * Get or generate profile
 * Returns cached profile if recent, otherwise regenerates
 */
export async function getOrGenerateProfile(
  userId: string,
  summaries: CompactGameSummaryT[],
  maxAgeMs: number = 6 * 60 * 60 * 1000 // 6 hours default
): Promise<PlayerProfileT> {
  const existing = await loadProfile(userId);

  if (existing) {
    const age = Date.now() - new Date(existing.generatedAt).getTime();

    // Use cached if recent AND game count matches
    if (age < maxAgeMs && existing.gamesAnalyzed === summaries.length) {
      console.log(`[ProfileStore] Using cached profile (${Math.round(age / 60000)}min old)`);
      return existing;
    }
  }

  // Regenerate
  return regenerateProfile(userId, summaries);
}

/**
 * Check if profile needs regeneration
 */
export async function profileNeedsUpdate(
  userId: string,
  currentGameCount: number
): Promise<boolean> {
  const existing = await loadProfile(userId);
  if (!existing) return true;
  if (existing.gamesAnalyzed !== currentGameCount) return true;

  // Also regenerate if older than 24 hours
  const age = Date.now() - new Date(existing.generatedAt).getTime();
  return age > 24 * 60 * 60 * 1000;
}
