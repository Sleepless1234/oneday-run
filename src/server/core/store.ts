/**
 * Redis storage for One Run.
 *
 * Keys:
 *  - `onerun:lb:{date}`        sorted set username -> score (today's board)
 *  - `onerun:run:{date}:{user}` JSON RunSummary (one per user per day)
 *  - `onerun:streak:{user}`    JSON { count, lastDate }
 *
 * Daily keys expire after 7 days; streaks after 30 days of inactivity.
 * All dates are UTC `YYYY-MM-DD` day keys.
 */
import { redis } from '@devvit/web/server';
import type { DayKey } from '../../shared/seed';
import type { LeaderboardEntry, RunSummary } from '../../shared/api';

const DAY_TTL_SECONDS = 7 * 24 * 60 * 60;
const STREAK_TTL_SECONDS = 30 * 24 * 60 * 60;

const lbKey = (date: DayKey): string => `onerun:lb:${date}`;
const runKey = (date: DayKey, username: string): string =>
  `onerun:run:${date}:${username}`;
const streakKey = (username: string): string => `onerun:streak:${username}`;

/** Type guard for JSON-decoded objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validate a stored run record instead of trusting its shape. */
function parseRunSummary(raw: string): RunSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const r = parsed;
  if (
    typeof r.score !== 'number' ||
    typeof r.kills !== 'number' ||
    typeof r.coins !== 'number' ||
    typeof r.escaped !== 'boolean' ||
    (r.diedTo !== null && typeof r.diedTo !== 'string') ||
    typeof r.turns !== 'number' ||
    typeof r.foundSecret !== 'boolean' ||
    typeof r.maxCombo !== 'number'
  ) {
    return null;
  }
  return {
    score: r.score,
    kills: r.kills,
    coins: r.coins,
    escaped: r.escaped,
    diedTo: r.diedTo,
    turns: r.turns,
    foundSecret: r.foundSecret,
    maxCombo: r.maxCombo,
  };
}

export type StreakRecord = {
  count: number;
  lastDate: string | null;
};

export async function getLeaderboard(
  date: DayKey,
  limit = 10
): Promise<{ entries: LeaderboardEntry[]; totalPlayers: number }> {
  const [members, totalPlayers] = await Promise.all([
    redis.zRange(lbKey(date), 0, limit - 1, { reverse: true, by: 'rank' }),
    redis.zCard(lbKey(date)),
  ]);
  // The escaped/fell badge comes from each player's run record.
  const runJsons =
    members.length > 0
      ? await redis.mGet(members.map((m) => runKey(date, m.member)))
      : [];
  const entries: LeaderboardEntry[] = members.map((m, i) => {
    let escaped = false;
    const raw = runJsons[i];
    if (raw) {
      const parsed = parseRunSummary(raw);
      escaped = parsed?.escaped === true;
    }
    return { rank: i + 1, username: m.member, score: m.score, escaped };
  });
  return { entries, totalPlayers };
}

/** 1-based rank (1 = top), or null if the user is not on the board. */
export async function getRank(date: DayKey, username: string): Promise<number | null> {
  const [ascendingRank, total] = await Promise.all([
    redis.zRank(lbKey(date), username),
    redis.zCard(lbKey(date)),
  ]);
  if (ascendingRank === undefined) return null;
  return total - ascendingRank;
}

export async function getScore(date: DayKey, username: string): Promise<number | null> {
  const score = await redis.zScore(lbKey(date), username);
  return score ?? null;
}

/** Score of the player at a 0-based position from the top (0 = leader). */
export async function getScoreAtPosition(
  date: DayKey,
  positionFromTop: number
): Promise<number | null> {
  const members = await redis.zRange(lbKey(date), positionFromTop, positionFromTop, {
    reverse: true,
    by: 'rank',
  });
  const first = members[0];
  return first ? first.score : null;
}

export async function hasPlayed(date: DayKey, username: string): Promise<boolean> {
  return (await redis.get(runKey(date, username))) !== undefined;
}

export async function getRun(date: DayKey, username: string): Promise<RunSummary | null> {
  const raw = await redis.get(runKey(date, username));
  if (!raw) return null;
  return parseRunSummary(raw);
}

export async function recordRun(
  date: DayKey,
  username: string,
  summary: RunSummary
): Promise<void> {
  await redis.zAdd(lbKey(date), { score: summary.score, member: username });
  await redis.set(runKey(date, username), JSON.stringify(summary));
  await redis.expire(lbKey(date), DAY_TTL_SECONDS);
  await redis.expire(runKey(date, username), DAY_TTL_SECONDS);
}

export async function getStreak(username: string): Promise<StreakRecord> {
  const raw = await redis.get(streakKey(username));
  if (!raw) return { count: 0, lastDate: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { count: 0, lastDate: null };
  }
  if (!isRecord(parsed)) return { count: 0, lastDate: null };
  const r = parsed;
  if (typeof r.count !== 'number') return { count: 0, lastDate: null };
  return {
    count: r.count,
    lastDate: typeof r.lastDate === 'string' ? r.lastDate : null,
  };
}

/**
 * Advance the streak for a run submitted on `date`. Consecutive days
 * extend it; a gap resets it to 1; a second submit the same day is a no-op.
 * Returns the new streak count.
 */
export async function updateStreak(
  username: string,
  date: DayKey,
  yesterday: DayKey
): Promise<number> {
  const current = await getStreak(username);
  let count: number;
  if (current.lastDate === date) {
    count = current.count;
  } else if (current.lastDate === yesterday) {
    count = current.count + 1;
  } else {
    count = 1;
  }
  await redis.set(streakKey(username), JSON.stringify({ count, lastDate: date }));
  await redis.expire(streakKey(username), STREAK_TTL_SECONDS);
  return count;
}

export async function getPlayerCount(date: DayKey): Promise<number> {
  return redis.zCard(lbKey(date));
}
