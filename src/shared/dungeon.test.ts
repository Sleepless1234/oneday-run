/**
 * Solvability + determinism tests for the daily dungeon generator.
 *
 * The key guarantee: EVERY day's dungeon is completable. We check 120
 * consecutive days (the same discipline Pixel Daily used for its puzzles).
 */
import { describe, expect, it } from 'vitest';
import {
  bfsPath,
  generateDailyDungeon,
  manhattan,
  solveDungeon,
  tileAt,
  type Dungeon,
} from './dungeon';
import { modifierForDay } from './modifiers';
import { addDays } from './seed';
import { maxScoreFor } from './scoring';

const START_DAY = '2026-11-21';
const DAYS = 120;

function dayKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < DAYS; i++) keys.push(addDays(START_DAY, i));
  return keys;
}

function isInSecretRoom(d: Dungeon, x: number, y: number): boolean {
  if (!d.secret) return false;
  const r = d.secret.room;
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

describe('generateDailyDungeon', () => {
  it('is deterministic: the same day always yields the same dungeon', () => {
    const a = generateDailyDungeon('2026-11-21');
    const b = generateDailyDungeon('2026-11-21');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('varies by day: different days yield different layouts', () => {
    const a = generateDailyDungeon('2026-11-21');
    const b = generateDailyDungeon('2026-11-22');
    expect(JSON.stringify(a.tiles)).not.toBe(JSON.stringify(b.tiles));
  });

  it('produces a solvable, well-formed dungeon for 120 consecutive days', () => {
    let maxAttempt = 0;
    let secretDays = 0;
    for (const key of dayKeys()) {
      const d = generateDailyDungeon(key);
      maxAttempt = Math.max(maxAttempt, d.attempt);

      // Solver passes: a naive shortest-path playthrough survives.
      const solved = solveDungeon(d);
      expect(solved.solvable, `${key} should be solvable`).toBe(true);
      expect(solved.pathLength).toBeGreaterThan(5);

      // Exit reachable.
      expect(bfsPath(d.tiles, d.spawn, d.exit)).not.toBeNull();

      // Every pickup outside the secret room is reachable.
      for (const p of d.pickups) {
        if (isInSecretRoom(d, p.x, p.y)) continue;
        expect(
          bfsPath(d.tiles, d.spawn, { x: p.x, y: p.y }),
          `${key}: pickup ${p.id} should be reachable`
        ).not.toBeNull();
      }

      // No two entities share a tile; nothing on the spawn or exit.
      const occupied = new Set<string>([
        `${d.spawn.x},${d.spawn.y}`,
        `${d.exit.x},${d.exit.y}`,
      ]);
      for (const e of [...d.enemies, ...d.pickups]) {
        const k = `${e.x},${e.y}`;
        expect(occupied.has(k), `${key}: tile ${k} double-booked`).toBe(false);
        occupied.add(k);
        // Entities stand on floor (or inside the secret room).
        const tile = tileAt(d.tiles, e.x, e.y);
        expect(tile === 1 || isInSecretRoom(d, e.x, e.y)).toBe(true);
      }

      // Teaching guarantees: a coin near spawn, no enemy near spawn.
      const nearCoin = d.pickups.some(
        (p) => p.kind === 'coin' && manhattan(p, d.spawn) <= 2
      );
      expect(nearCoin, `${key}: needs a coin near spawn`).toBe(true);
      for (const e of d.enemies) {
        expect(
          manhattan(e, d.spawn),
          `${key}: enemy too close to spawn`
        ).toBeGreaterThanOrEqual(4);
      }
      const teachingSlime = d.enemies.some(
        (e) =>
          e.kind === 'slime' &&
          manhattan(e, d.spawn) >= 4 &&
          manhattan(e, d.spawn) <= 6
      );
      expect(teachingSlime, `${key}: needs a slime 4-6 from spawn`).toBe(true);

      // Secret room: present almost always, and never reachable without
      // opening the cracked wall.
      if (d.secret) {
        secretDays++;
        const secretCenter = {
          x: d.secret.room.x,
          y: d.secret.room.y,
        };
        expect(bfsPath(d.tiles, d.spawn, secretCenter)).toBeNull();
        expect(tileAt(d.tiles, d.secret.crack.x, d.secret.crack.y)).toBe(3);
      }

      // Score bound is sane.
      const max = maxScoreFor(d, modifierForDay(key));
      expect(max).toBeGreaterThan(200);
      expect(Number.isFinite(max)).toBe(true);
    }
    expect(maxAttempt, 'generation should rarely retry').toBeLessThan(50);
    expect(secretDays / DAYS, 'secret room should be near-universal').toBeGreaterThan(0.95);
  });

  it('fails the solver when the exit is walled off (negative control)', () => {
    const d = generateDailyDungeon('2026-11-21');
    const blocked: Dungeon = {
      ...d,
      tiles: d.tiles.map((row) => [...row]),
    };
    const row = blocked.tiles[d.exit.y];
    if (row) row[d.exit.x] = 0;
    expect(solveDungeon(blocked).solvable).toBe(false);
  });
});

describe('daily modifiers', () => {
  it('rotates through all 7 modifiers across a week', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 7; i++) {
      ids.add(modifierForDay(addDays('2026-11-23', i)).id);
    }
    expect(ids.size).toBe(7);
  });

  it('repeats the same modifier on the same weekday next week', () => {
    expect(modifierForDay('2026-11-23').id).toBe(
      modifierForDay('2026-11-30').id
    );
  });
});
