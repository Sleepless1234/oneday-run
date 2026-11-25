/**
 * Scoring rules for One Run — shared between client and server.
 *
 * The score rewards skill, not luck: everyone plays the same dungeon, so
 * the leaderboard reflects routing, combat choices and efficiency.
 *  - Kills: by enemy kind (modified by the daily modifier).
 *  - Coins: flat value (modified by the daily modifier).
 *  - Combo: kills chained within 3 turns pay a growing bonus.
 *  - Escape: flat bonus for reaching the stairs.
 *  - HP bonus: remaining HP × 10 on escape.
 *  - Turn bonus: faster runs score more (max(0, 100 - turns)).
 *
 * `maxScoreFor` computes a loose upper bound used by the server to reject
 * impossible submissions.
 */
import type { Dungeon, EnemyKind } from './dungeon';
import type { DailyModifier } from './modifiers';

export const BASE_KILL_SCORES: Record<EnemyKind, number> = {
  slime: 20,
  bat: 30,
  skeleton: 50,
  brute: 100,
};

export const BASE_COIN_VALUE = 50;
export const ESCAPE_BONUS = 200;
export const HEART_HEAL = 3;
export const BLAST_DAMAGE = 3;
/** Kills within this many turns of the previous kill extend the combo. */
export const COMBO_WINDOW_TURNS = 3;
/** Bonus per combo link beyond the first kill in the chain. */
export const COMBO_STEP = 10;

export function killScore(kind: EnemyKind, modifier: DailyModifier): number {
  let base = BASE_KILL_SCORES[kind];
  if (kind === 'slime') base = modifier.slimeValue;
  if (kind === 'bat') base = modifier.batValue;
  return base * modifier.killMultiplier;
}

export function coinScore(modifier: DailyModifier): number {
  return modifier.coinValue;
}

export function hpBonus(hpRemaining: number): number {
  return Math.max(0, hpRemaining) * 10;
}

export function turnBonus(turns: number): number {
  return Math.max(0, 100 - turns);
}

/** Combo bonus for a kill that extends a chain of `chain` kills. */
export function comboBonusForKill(chain: number): number {
  if (chain <= 1) return 0;
  return (chain - 1) * COMBO_STEP;
}

export type ScoreBreakdown = {
  kills: number;
  coins: number;
  combo: number;
  escape: number;
  hp: number;
  turns: number;
  total: number;
};

export function totalScore(breakdown: Omit<ScoreBreakdown, 'total'>): number {
  return (
    breakdown.kills +
    breakdown.coins +
    breakdown.combo +
    breakdown.escape +
    breakdown.hp +
    breakdown.turns
  );
}

/**
 * Loose upper bound for a run on this dungeon: every kill at full value,
 * every coin collected, maximum combo, escape + full HP + full turn bonus.
 * The server rejects any submitted score above this.
 */
export function maxScoreFor(dungeon: Dungeon, modifier: DailyModifier): number {
  let kills = 0;
  for (const enemy of dungeon.enemies) {
    kills += killScore(enemy.kind, modifier);
  }
  const coins = dungeon.pickups.filter((p) => p.kind === 'coin').length;
  // Max combo: if all kills chained perfectly, sum of (i * COMBO_STEP).
  const n = dungeon.enemies.length;
  const maxCombo = (n * (n - 1)) / 2 * COMBO_STEP;
  return (
    kills +
    coins * coinScore(modifier) +
    maxCombo +
    ESCAPE_BONUS +
    modifier.playerHp * 10 +
    100
  );
}
