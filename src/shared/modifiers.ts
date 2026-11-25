/**
 * Daily modifiers — the "what's today?" curiosity hook.
 *
 * One modifier per weekday, rotating on a fixed weekly cycle so every player
 * gets the same twist on the same day, and tomorrow's twist can be teased on
 * the result card. Modifiers only retune the existing systems (enemy counts,
 * pickup counts, player stats, score values) — no new mechanics.
 */
import { addDays, weekday, type DayKey } from './seed';

export type ModifierId =
  | 'gold-rush'
  | 'slime-tide'
  | 'glass-heart'
  | 'second-wind'
  | 'greed'
  | 'bat-swarm'
  | 'iron-will';

export type DailyModifier = {
  id: ModifierId;
  name: string;
  /** One-line teaser shown on the start screen and in the post title. */
  tagline: string;
  /** Full description shown on the start screen. */
  description: string;
  /** Extra coins placed in the dungeon. */
  extraCoins: number;
  /** Extra slimes placed in the dungeon. */
  extraSlimes: number;
  /** Extra bats placed in the dungeon. */
  extraBats: number;
  /** Hearts placed in the dungeon (0 = none spawn). */
  hearts: number;
  /** Whether the sword pickup spawns. */
  sword: boolean;
  /** Player starting max HP. */
  playerHp: number;
  /** Player starting attack. */
  playerAttack: number;
  /** Lantern Blast charges. */
  blasts: number;
  /** Score value of one coin. */
  coinValue: number;
  /** Multiplier applied to all kill scores. */
  killMultiplier: number;
  /** Score value of one slime kill (before multiplier). */
  slimeValue: number;
  /** Score value of one bat kill (before multiplier). */
  batValue: number;
};

const BASE: Omit<DailyModifier, 'id' | 'name' | 'tagline' | 'description'> = {
  extraCoins: 0,
  extraSlimes: 0,
  extraBats: 0,
  hearts: 2,
  sword: true,
  playerHp: 10,
  playerAttack: 2,
  blasts: 1,
  coinValue: 50,
  killMultiplier: 1,
  slimeValue: 20,
  batValue: 30,
};

/** Index 0 = Monday … 6 = Sunday (rotated from JS weekday). */
export const WEEKLY_MODIFIERS: readonly DailyModifier[] = [
  {
    ...BASE,
    id: 'gold-rush',
    name: 'Gold Rush',
    tagline: 'Coins everywhere — and worth more.',
    description:
      'Four extra coins hide in the dungeon, and every coin is worth 75 instead of 50. Greedy runs pay off today.',
    extraCoins: 4,
    coinValue: 75,
  },
  {
    ...BASE,
    id: 'slime-tide',
    name: 'Slime Tide',
    tagline: 'The dungeon is oozing. Slimes pay double.',
    description:
      'Three extra slimes have oozed in, and every slime is worth 40 points. Easy prey — if you can reach it.',
    extraSlimes: 3,
    slimeValue: 40,
  },
  {
    ...BASE,
    id: 'glass-heart',
    name: 'Glass Heart',
    tagline: 'You start with 6 HP — but every kill pays double.',
    description:
      'Fragile start, huge rewards: you begin with only 6 HP, but all kill scores are doubled. Play sharp.',
    playerHp: 6,
    killMultiplier: 2,
  },
  {
    ...BASE,
    id: 'second-wind',
    name: 'Second Wind',
    tagline: 'Two Lantern Blasts instead of one.',
    description:
      'Your lantern is overcharged today: two blasts to clear a room or escape a corner. Spend them wisely.',
    blasts: 2,
  },
  {
    ...BASE,
    id: 'greed',
    name: 'Greed',
    tagline: 'Coins worth 100. No hearts anywhere.',
    description:
      'Every coin is worth 100 points — but no hearts spawn at all. How much will you risk for the gold?',
    coinValue: 100,
    hearts: 0,
  },
  {
    ...BASE,
    id: 'bat-swarm',
    name: 'Bat Swarm',
    tagline: 'The dark is full of wings. Bats pay more.',
    description:
      'Three extra bats flutter through the dungeon, each worth 40 points. They move fast — corner them.',
    extraBats: 3,
    batValue: 40,
  },
  {
    ...BASE,
    id: 'iron-will',
    name: 'Iron Will',
    tagline: 'You hit harder from the first step. No sword to find.',
    description:
      'You start with 3 attack instead of 2 — but no sword spawns. Strong from the start, no upgrades to chase.',
    playerAttack: 3,
    sword: false,
  },
];

/** Monday = index 0. JS weekday: 0 = Sunday. */
export function modifierForDay(dayKey: DayKey): DailyModifier {
  const day = weekday(dayKey); // 0 Sun … 6 Sat
  const index = (day + 6) % 7; // 0 Mon … 6 Sun
  return WEEKLY_MODIFIERS[index] as DailyModifier;
}

export function modifierForTomorrow(dayKey: DayKey): DailyModifier {
  return modifierForDay(addDays(dayKey, 1));
}
