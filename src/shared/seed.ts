/**
 * Date keys, deterministic seeding and RNG for One Run.
 *
 * Every player on a given UTC day plays the exact same dungeon: the seed is
 * derived only from the UTC date (plus a small attempt counter used by the
 * generator's solvability retry loop). This module is shared between the
 * client (which generates the dungeon to play) and the server (which
 * regenerates the same dungeon to validate submitted scores).
 */

/** A UTC calendar day, formatted `YYYY-MM-DD`. */
export type DayKey = string;

/** Anchor day for the public "Day #N" counter (hackathon submission start). */
const ANCHOR_MS = Date.UTC(2026, 10, 11); // 11 Nov 2026

export function utcDayKey(date: Date): DayKey {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(now: Date = new Date()): DayKey {
  return utcDayKey(now);
}

export function parseDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1));
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = parseDayKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDayKey(date);
}

/** Public day number shown in the UI ("Day #12"). */
export function dayNumber(key: DayKey): number {
  const ms = parseDayKey(key).getTime();
  return Math.floor((ms - ANCHOR_MS) / 86_400_000) + 1;
}

/** UTC weekday, 0 = Sunday … 6 = Saturday. */
export function weekday(key: DayKey): number {
  return parseDayKey(key).getUTCDay();
}

/** FNV-1a 32-bit hash — small, fast, deterministic. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG with good distribution. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Deterministic RNG for one purpose within one day. */
export function rngFor(dayKey: DayKey, purpose: string, attempt = 0): Rng {
  return mulberry32(hashString(`one-run:${dayKey}:${purpose}:${attempt}`));
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
