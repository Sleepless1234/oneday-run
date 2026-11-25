/**
 * Headless playthrough tests for the One Run engine.
 *
 * A simple bot plays full games across many days: it proves the game is
 * winnable by reasonable play (not just by the solver), that state stays
 * consistent, and that the one-life rule holds (no moves after the run
 * ends).
 */
import { describe, expect, it } from 'vitest';
import { bfsPath, generateDailyDungeon } from '../../shared/dungeon';
import { modifierForDay } from '../../shared/modifiers';
import { addDays } from '../../shared/seed';
import {
  createGame,
  tryMove,
  lanternBlast,
  waitTurn,
  type GameState,
} from './engine';

/** A reasonable-but-not-optimal bot: avoids enemies, grabs hearts, blasts. */
function playBot(state: GameState): GameState {
  let s = state;
  for (let guard = 0; guard < 300 && s.phase === 'playing'; guard++) {
    const adjacent = s.enemies.filter(
      (e) => Math.abs(e.x - s.player.x) + Math.abs(e.y - s.player.y) === 1
    );
    // Blast when cornered by 2+ enemies and hurt.
    if (adjacent.length >= 2 && s.player.blasts > 0 && s.player.hp <= 5) {
      s = lanternBlast(s);
      continue;
    }
    // Attack the weakest adjacent enemy.
    if (adjacent.length > 0) {
      const target = [...adjacent].sort((a, b) => a.hp - b.hp)[0];
      if (target) {
        s = tryMove(s, target.x - s.player.x, target.y - s.player.y);
        continue;
      }
    }
    // Grab a heart when hurt and one is adjacent.
    const heart = s.pickups.find(
      (p) =>
        p.kind === 'heart' &&
        Math.abs(p.x - s.player.x) + Math.abs(p.y - s.player.y) === 1
    );
    if (heart && s.player.hp < s.player.maxHp) {
      s = tryMove(s, heart.x - s.player.x, heart.y - s.player.y);
      continue;
    }
    // Move toward the exit, preferring tiles without enemies.
    const path = bfsPath(
      s.tiles,
      { x: s.player.x, y: s.player.y },
      s.dungeon.exit
    );
    if (!path || path.length < 2) {
      s = waitTurn(s);
      continue;
    }
    const next = path[1];
    if (!next) {
      s = waitTurn(s);
      continue;
    }
    const enemyThere = s.enemies.some((e) => e.x === next.x && e.y === next.y);
    if (enemyThere) {
      // Try a sidestep that doesn't increase distance to the exit.
      const sidesteps = [
        { x: s.player.x + 1, y: s.player.y },
        { x: s.player.x - 1, y: s.player.y },
        { x: s.player.x, y: s.player.y + 1 },
        { x: s.player.x, y: s.player.y - 1 },
      ].filter(
        (p) =>
          !s.enemies.some((e) => e.x === p.x && e.y === p.y) &&
          (s.tiles[p.y]?.[p.x] === 1 || s.tiles[p.y]?.[p.x] === 2)
      );
      const alt = sidesteps.find((p) => {
        const altPath = bfsPath(s.tiles, p, s.dungeon.exit);
        return altPath && altPath.length <= path.length;
      });
      if (alt) {
        s = tryMove(s, alt.x - s.player.x, alt.y - s.player.y);
        continue;
      }
    }
    s = tryMove(s, next.x - s.player.x, next.y - s.player.y);
  }
  return s;
}

function assertConsistent(s: GameState): void {
  const sum =
    s.breakdown.kills +
    s.breakdown.coins +
    s.breakdown.combo +
    s.breakdown.escape +
    s.breakdown.hp +
    s.breakdown.turns;
  expect(s.score, 'score must equal the breakdown sum').toBe(sum);
  expect(s.player.hp).toBeGreaterThanOrEqual(0);
  expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
  if (s.phase === 'dead') expect(s.player.hp).toBe(0);
  if (s.phase === 'won') {
    expect(s.player.x).toBe(s.dungeon.exit.x);
    expect(s.player.y).toBe(s.dungeon.exit.y);
  }
  for (const e of s.enemies) expect(e.hp).toBeGreaterThan(0);
}

describe('engine', () => {
  it('a reasonable bot wins a good share of days (game is winnable)', () => {
    let wins = 0;
    let deaths = 0;
    const days = 30;
    for (let i = 0; i < days; i++) {
      const key = addDays('2026-11-21', i);
      const dungeon = generateDailyDungeon(key);
      const final = playBot(createGame(dungeon, modifierForDay(key)));
      assertConsistent(final);
      if (final.phase === 'won') wins++;
      if (final.phase === 'dead') deaths++;
      expect(final.turns).toBeLessThanOrEqual(300);
    }
    expect(wins + deaths).toBe(days);
    // A decent player should escape more often than not.
    expect(wins / days).toBeGreaterThanOrEqual(0.5);
  });

  it('blocked moves cost no turn; the run ends exactly once', () => {
    const key = '2026-11-21';
    const dungeon = generateDailyDungeon(key);
    let s = createGame(dungeon, modifierForDay(key));
    // Walk west from the spawn (a room center): the room wall is 1-2
    // tiles away, and no enemy is within 4 tiles, so a blocked move is
    // guaranteed without any combat.
    let blockedSeen = false;
    for (let i = 0; i < 5; i++) {
      const before = s.turns;
      const next = tryMove(s, -1, 0);
      if (next.turns === before) {
        blockedSeen = true;
        expect(next.events[0]?.kind).toBe('blocked');
        break;
      }
      s = next;
    }
    expect(blockedSeen).toBe(true);

    // Play to the end, then confirm no further moves are possible.
    const final = playBot(s);
    expect(final.phase === 'won' || final.phase === 'dead').toBe(true);
    const turnsAtEnd = final.turns;
    const afterEnd = tryMove(final, 1, 0);
    expect(afterEnd.turns).toBe(turnsAtEnd);
    expect(afterEnd.phase).toBe(final.phase);
    const blasted = lanternBlast(final);
    expect(blasted.turns).toBe(turnsAtEnd);
  });

  it('the blast damages adjacent enemies and spends a charge', () => {
    const key = '2026-11-21';
    const dungeon = generateDailyDungeon(key);
    let s = createGame(dungeon, modifierForDay(key));
    const blastsBefore = s.player.blasts;
    // Walk toward the nearest enemy until adjacent, then blast.
    for (let guard = 0; guard < 60 && s.phase === 'playing'; guard++) {
      const adjacent = s.enemies.filter(
        (e) => Math.abs(e.x - s.player.x) + Math.abs(e.y - s.player.y) === 1
      );
      if (adjacent.length > 0) break;
      const nearest = [...s.enemies].sort(
        (a, b) =>
          Math.abs(a.x - s.player.x) + Math.abs(a.y - s.player.y) -
          (Math.abs(b.x - s.player.x) + Math.abs(b.y - s.player.y))
      )[0];
      if (!nearest) break;
      const dx = Math.sign(nearest.x - s.player.x);
      const dy = Math.sign(nearest.y - s.player.y);
      s = tryMove(s, dx !== 0 ? dx : 0, dx !== 0 ? 0 : dy);
    }
    const adjacent = s.enemies.filter(
      (e) => Math.abs(e.x - s.player.x) + Math.abs(e.y - s.player.y) === 1
    );
    if (adjacent.length > 0 && s.phase === 'playing') {
      const hpBefore = new Map(adjacent.map((e) => [e.id, e.hp]));
      const after = lanternBlast(s);
      expect(after.player.blasts).toBe(blastsBefore - 1);
      for (const e of adjacent) {
        const survivor = after.enemies.find((x) => x.id === e.id);
        const before = hpBefore.get(e.id);
        expect(before).toBeDefined();
        if (before === undefined) continue;
        if (survivor) {
          expect(survivor.hp).toBe(before - 3);
        } else {
          expect(before).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});
