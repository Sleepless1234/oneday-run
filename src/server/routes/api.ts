/**
 * One Run API.
 *
 *  GET  /api/init        — today's date, modifier, streak, played state.
 *  GET  /api/leaderboard — today's top 10 + the caller's rank/score.
 *  POST /api/submit      — record one scored run per user per day.
 *
 * Submission validation (anti-cheat-lite): the server regenerates the
 * day's dungeon from the seed and rejects scores above the theoretical
 * maximum, kills/coins above the dungeon's totals, contradictory fields,
 * wrong dates, and duplicate submissions. One life means one submission.
 */
import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  ErrorResponse,
  InitResponse,
  LeaderboardResponse,
  RunSummary,
  SubmitRequest,
  SubmitResponse,
} from '../../shared/api';
import { generateDailyDungeon } from '../../shared/dungeon';
import { modifierForDay, modifierForTomorrow } from '../../shared/modifiers';
import { maxScoreFor } from '../../shared/scoring';
import { addDays, dayNumber, todayKey } from '../../shared/seed';
import {
  getLeaderboard,
  getPlayerCount,
  getRank,
  getRun,
  getScore,
  getScoreAtPosition,
  getStreak,
  hasPlayed,
  recordRun,
  updateStreak,
} from '../core/store';

export const api = new Hono();

function postUrl(postId: string): string {
  const subreddit = context.subredditName;
  if (!subreddit) return '';
  return `https://www.reddit.com/r/${subreddit}/comments/${postId}`;
}

api.get('/init', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required but missing from context' },
      400
    );
  }
  try {
    const date = todayKey();
    const modifier = modifierForDay(date);
    const tomorrow = modifierForTomorrow(date);
    const username = (await reddit.getCurrentUsername()) ?? null;
    const [todayPlayers, playedToday, streak, myRun, myRank] = await Promise.all([
      getPlayerCount(date),
      username ? hasPlayed(date, username) : Promise.resolve(false),
      username ? getStreak(username) : Promise.resolve({ count: 0, lastDate: null }),
      username ? getRun(date, username) : Promise.resolve(null),
      username ? getRank(date, username) : Promise.resolve(null),
    ]);
    return c.json<InitResponse>({
      type: 'init',
      postId,
      postUrl: postUrl(postId),
      username,
      date,
      dayNumber: dayNumber(date),
      modifierId: modifier.id,
      modifierName: modifier.name,
      modifierTagline: modifier.tagline,
      tomorrowModifierName: tomorrow.name,
      tomorrowModifierTagline: tomorrow.tagline,
      playedToday,
      streak: streak.count,
      todayPlayers,
      myRun,
      myRank,
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Initialization failed' },
      400
    );
  }
});

api.get('/leaderboard', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required but missing from context' },
      400
    );
  }
  try {
    const date = todayKey();
    const username = (await reddit.getCurrentUsername()) ?? null;
    const [{ entries, totalPlayers }, myRank, myScore] = await Promise.all([
      getLeaderboard(date, 10),
      username ? getRank(date, username) : Promise.resolve(null),
      username ? getScore(date, username) : Promise.resolve(null),
    ]);
    return c.json<LeaderboardResponse>({
      type: 'leaderboard',
      date,
      entries,
      totalPlayers,
      myRank,
      myScore,
    });
  } catch (error) {
    console.error(`API Leaderboard Error for post ${postId}:`, error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Failed to load the leaderboard' },
      400
    );
  }
});

/** Type guard for JSON-decoded objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validate the shape of a submitted run before trusting any field. */
function parseSubmitBody(body: unknown): SubmitRequest | null {
  if (!isRecord(body)) return null;
  const b = body;
  if (
    typeof b.date !== 'string' ||
    typeof b.score !== 'number' ||
    typeof b.kills !== 'number' ||
    typeof b.coins !== 'number' ||
    typeof b.escaped !== 'boolean' ||
    (b.diedTo !== null && typeof b.diedTo !== 'string') ||
    typeof b.turns !== 'number' ||
    typeof b.durationMs !== 'number' ||
    typeof b.foundSecret !== 'boolean' ||
    typeof b.maxCombo !== 'number'
  ) {
    return null;
  }
  return {
    date: b.date,
    score: b.score,
    kills: b.kills,
    coins: b.coins,
    escaped: b.escaped,
    diedTo: b.diedTo,
    turns: b.turns,
    durationMs: b.durationMs,
    foundSecret: b.foundSecret,
    maxCombo: b.maxCombo,
  };
}

function rejected(message: string, streak = 0): SubmitResponse {
  return {
    type: 'submit',
    accepted: false,
    rank: null,
    streak,
    behindLeader: null,
    behindNext: null,
    message,
  };
}

api.post('/submit', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required but missing from context' },
      400
    );
  }
  const username = (await reddit.getCurrentUsername()) ?? null;
  if (!username) {
    return c.json<SubmitResponse>(
      rejected('Sign in to Reddit to join the leaderboard.'),
      200
    );
  }
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Request body must be JSON' },
      400
    );
  }
  const body = parseSubmitBody(rawBody);
  if (!body) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Malformed submission' },
      400
    );
  }

  const date = todayKey();
  const streak = (await getStreak(username)).count;

  // 1. The run must be for today.
  if (body.date !== date) {
    return c.json<SubmitResponse>(rejected('This run is for a different day.', streak), 200);
  }
  // 2. One scored run per day.
  if (await hasPlayed(date, username)) {
    return c.json<SubmitResponse>(
      rejected("You've already used today's run.", streak),
      200
    );
  }
  // 3. Basic numeric sanity.
  if (
    !Number.isInteger(body.score) ||
    body.score < 0 ||
    !Number.isInteger(body.kills) ||
    body.kills < 0 ||
    !Number.isInteger(body.coins) ||
    body.coins < 0 ||
    !Number.isInteger(body.turns) ||
    body.turns < 0 ||
    body.turns > 1000 ||
    !Number.isFinite(body.durationMs) ||
    body.durationMs < 0 ||
    !Number.isInteger(body.maxCombo) ||
    body.maxCombo < 0 ||
    body.maxCombo > body.kills
  ) {
    return c.json<SubmitResponse>(rejected("This run doesn't check out.", streak), 200);
  }
  // 4. A run ends by escaping or by dying — never both, never neither.
  if (body.escaped === (body.diedTo !== null)) {
    return c.json<SubmitResponse>(rejected("This run doesn't check out.", streak), 200);
  }

  // 5. Regenerate the day's dungeon and check the claims against it.
  let dungeon;
  try {
    dungeon = generateDailyDungeon(date);
  } catch (error) {
    console.error(`Dungeon generation failed for ${date}:`, error);
    return c.json<SubmitResponse>(
      rejected("Today's dungeon could not be verified. Try again later.", streak),
      200
    );
  }
  const modifier = modifierForDay(date);
  const totalCoins = dungeon.pickups.filter((p) => p.kind === 'coin').length;
  if (
    body.kills > dungeon.enemies.length ||
    body.coins > totalCoins ||
    body.score > maxScoreFor(dungeon, modifier) ||
    (body.foundSecret && dungeon.secret === null)
  ) {
    return c.json<SubmitResponse>(rejected("This run doesn't check out.", streak), 200);
  }

  // All checks passed — record the run.
  const summary: RunSummary = {
    score: body.score,
    kills: body.kills,
    coins: body.coins,
    escaped: body.escaped,
    diedTo: body.diedTo,
    turns: body.turns,
    foundSecret: body.foundSecret,
    maxCombo: body.maxCombo,
  };
  await recordRun(date, username, summary);
  const newStreak = await updateStreak(username, date, addDays(date, -1));

  const rank = await getRank(date, username);
  let behindLeader: number | null = null;
  let behindNext: number | null = null;
  if (rank !== null) {
    const leaderScore = await getScoreAtPosition(date, 0);
    if (leaderScore !== null) behindLeader = leaderScore - body.score;
    if (rank > 1) {
      const aboveScore = await getScoreAtPosition(date, rank - 2);
      if (aboveScore !== null) behindNext = aboveScore - body.score;
    } else {
      behindNext = null;
    }
  }

  return c.json<SubmitResponse>({
    type: 'submit',
    accepted: true,
    rank,
    streak: newStreak,
    behindLeader,
    behindNext,
  });
});
