/**
 * Seeded dungeon generation + solvability solver for One Run.
 *
 * One floor per day, the same for every player: the layout, enemies and
 * pickups are all derived from the UTC date. Generation is deterministic and
 * shared between client and server (the server regenerates the same dungeon
 * to validate submitted scores).
 *
 * Solvability guarantee: `generateDailyDungeon` retries sub-seeds until
 * `solveDungeon` passes — a least-damage path from spawn to the exit
 * (routing around enemies where a detour exists, collecting hearts on the
 * way) must arrive alive. The secret room is optional and never on the
 * solution path. See dungeon.test.ts, which checks 120 consecutive days.
 */
import { modifierForDay, type DailyModifier } from './modifiers';
import {
  randInt,
  rngFor,
  shuffle,
  type DayKey,
  type Rng,
} from './seed';

export const GRID_W = 13;
export const GRID_H = 9;

/** 0 = wall, 1 = floor, 2 = exit stairs, 3 = cracked wall (secret door). */
export type Tile = 0 | 1 | 2 | 3;

export type Point = { x: number; y: number };

export type EnemyKind = 'slime' | 'bat' | 'skeleton' | 'brute';

export type Enemy = {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dmg: number;
};

export type PickupKind = 'heart' | 'coin' | 'sword';

export type Pickup = { id: string; kind: PickupKind; x: number; y: number };

export type Room = { x: number; y: number; w: number; h: number };

export type SecretRoom = {
  room: Room;
  /** The cracked-wall tile that hides the entrance. */
  crack: Point;
  /** True once the player has bumped the cracked wall open. */
  revealed: boolean;
};

export type Dungeon = {
  dayKey: DayKey;
  /** Sub-seed attempt that produced a solvable dungeon (0 = first try). */
  attempt: number;
  modifierId: string;
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: Room[];
  spawn: Point;
  exit: Point;
  secret: SecretRoom | null;
  enemies: Enemy[];
  pickups: Pickup[];
};

export const ENEMY_STATS: Record<
  EnemyKind,
  { hp: number; dmg: number; label: string }
> = {
  slime: { hp: 2, dmg: 1, label: 'Slime' },
  bat: { hp: 2, dmg: 1, label: 'Bat' },
  skeleton: { hp: 4, dmg: 2, label: 'Skeleton' },
  brute: { hp: 6, dmg: 2, label: 'Brute' },
};

const MAX_ATTEMPTS = 200;

export function tileAt(tiles: Tile[][], x: number, y: number): Tile {
  const row = tiles[y];
  if (!row) return 0;
  return row[x] ?? 0;
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}

/** Is this tile walkable during play (cracked walls are not — until opened)? */
export function isWalkableTile(tile: Tile): boolean {
  return tile === 1 || tile === 2;
}

/**
 * Breadth-first shortest path over walkable tiles. Returns the list of
 * points from `from` to `to` (inclusive), or null if unreachable.
 */
export function bfsPath(
  tiles: Tile[][],
  from: Point,
  to: Point,
  canEnter: (tile: Tile) => boolean = isWalkableTile
): Point[] | null {
  const key = (p: Point): string => `${p.x},${p.y}`;
  const prev = new Map<string, Point | null>();
  const queue: Point[] = [from];
  prev.set(key(from), null);
  while (queue.length > 0) {
    const cur = queue.shift() as Point;
    if (cur.x === to.x && cur.y === to.y) {
      const path: Point[] = [];
      let node: Point | null = cur;
      while (node) {
        path.push(node);
        node = prev.get(key(node)) ?? null;
      }
      return path.reverse();
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      if (!canEnter(tileAt(tiles, nx, ny))) continue;
      const np = { x: nx, y: ny };
      if (prev.has(key(np))) continue;
      prev.set(key(np), cur);
      queue.push(np);
    }
  }
  return null;
}

/** BFS distances from a start point over walkable tiles. */
export function bfsDistances(tiles: Tile[][], from: Point): Map<string, number> {
  const key = (p: Point): string => `${p.x},${p.y}`;
  const dist = new Map<string, number>();
  const queue: Point[] = [from];
  dist.set(key(from), 0);
  while (queue.length > 0) {
    const cur = queue.shift() as Point;
    const d = dist.get(key(cur)) as number;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      if (!isWalkableTile(tileAt(tiles, nx, ny))) continue;
      const np = { x: nx, y: ny };
      if (dist.has(key(np))) continue;
      dist.set(key(np), d + 1);
      queue.push(np);
    }
  }
  return dist;
}

function roomsOverlap(a: Room, b: Room, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

function roomCenter(room: Room): Point {
  return {
    x: room.x + Math.floor(room.w / 2),
    y: room.y + Math.floor(room.h / 2),
  };
}

function carveRoom(tiles: Tile[][], room: Room): void {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const row = tiles[y];
      if (row) row[x] = 1;
    }
  }
}

function corridorPath(from: Point, to: Point, rng: Rng): Point[] {
  // L-shaped corridor, horizontal-first or vertical-first at random.
  const horizontalFirst = rng() < 0.5;
  const path: Point[] = [];
  const pushH = (x0: number, x1: number, y: number): void => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (x > 0 && x < GRID_W - 1) path.push({ x, y });
    }
  };
  const pushV = (y0: number, y1: number, x: number): void => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      if (y > 0 && y < GRID_H - 1) path.push({ x, y });
    }
  };
  if (horizontalFirst) {
    pushH(from.x, to.x, from.y);
    pushV(from.y, to.y, to.x);
  } else {
    pushV(from.y, to.y, from.x);
    pushH(from.x, to.x, to.y);
  }
  return path;
}

function carveCorridor(tiles: Tile[][], path: Point[]): void {
  for (const p of path) {
    const row = tiles[p.y];
    if (row) row[p.x] = 1;
  }
}

function placeRooms(rng: Rng, count: number): Room[] {
  const rooms: Room[] = [];
  let attempts = 0;
  while (rooms.length < count && attempts < 300) {
    attempts++;
    const w = randInt(rng, 3, 4);
    const h = randInt(rng, 2, 3);
    const x = randInt(rng, 1, GRID_W - w - 1);
    const y = randInt(rng, 1, GRID_H - h - 1);
    const candidate: Room = { x, y, w, h };
    if (rooms.some((r) => roomsOverlap(r, candidate, 0))) continue;
    rooms.push(candidate);
  }
  return rooms;
}

/**
 * Find a 2x2 spot for the secret room that touches neither the main rooms
 * nor any corridor tile (so no corridor can accidentally connect it).
 */
function findSecretSpot(
  rng: Rng,
  rooms: Room[],
  corridorTiles: Set<string>
): Room | null {
  for (let tries = 0; tries < 200; tries++) {
    const x = randInt(rng, 1, GRID_W - 3);
    const y = randInt(rng, 1, GRID_H - 3);
    const candidate: Room = { x, y, w: 2, h: 2 };
    if (rooms.some((r) => roomsOverlap(r, candidate, 0))) continue;
    let hitsCorridor = false;
    for (let cy = y; cy < y + 2 && !hitsCorridor; cy++) {
      for (let cx = x; cx < x + 2; cx++) {
        if (corridorTiles.has(`${cx},${cy}`)) {
          hitsCorridor = true;
          break;
        }
      }
    }
    if (hitsCorridor) continue;
    return candidate;
  }
  return null;
}

function findSecretCrack(
  tiles: Tile[][],
  secretRoom: Room
): { crack: Point; stub: Point[] } | null {
  // Preferred: a wall tile directly between a connected floor tile and a
  // secret-room floor tile.
  for (let y = secretRoom.y - 1; y <= secretRoom.y + secretRoom.h; y++) {
    for (let x = secretRoom.x - 1; x <= secretRoom.x + secretRoom.w; x++) {
      if (!inBounds(x, y) || tileAt(tiles, x, y) !== 0) continue;
      const touchesSecret = (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const
      ).some(
        ([dx, dy]) =>
          x + dx >= secretRoom.x &&
          x + dx < secretRoom.x + secretRoom.w &&
          y + dy >= secretRoom.y &&
          y + dy < secretRoom.y + secretRoom.h
      );
      const touchesFloor = (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const
      ).some(([dx, dy]) => tileAt(tiles, x + dx, y + dy) === 1);
      if (touchesSecret && touchesFloor) {
        return { crack: { x, y }, stub: [] };
      }
    }
  }
  // Fallback: carve a short stub corridor from the nearest floor tile to the
  // secret room; the tile just outside the secret room becomes the crack.
  let best: { from: Point; to: Point; d: number } | null = null;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (tileAt(tiles, x, y) !== 1) continue;
      const center = roomCenter(secretRoom);
      const d = Math.abs(x - center.x) + Math.abs(y - center.y);
      if (!best || d < best.d) best = { from: { x, y }, to: center, d };
    }
  }
  if (!best) return null;
  // Walk from `from` toward the secret room center; stop one tile short.
  const path: Point[] = [];
  let cx = best.from.x;
  let cy = best.from.y;
  const tx = best.to.x;
  const ty = best.to.y;
  while (cx !== tx || cy !== ty) {
    const nextX = cx < tx ? cx + 1 : cx > tx ? cx - 1 : cx;
    const nextY = cx === tx ? (cy < ty ? cy + 1 : cy - 1) : cy;
    const insideSecret =
      nextX >= secretRoom.x &&
      nextX < secretRoom.x + secretRoom.w &&
      nextY >= secretRoom.y &&
      nextY < secretRoom.y + secretRoom.h;
    if (insideSecret) break;
    path.push({ x: nextX, y: nextY });
    cx = nextX;
    cy = nextY;
  }
  if (path.length === 0) return null;
  const crack = path[path.length - 1] as Point;
  return { crack, stub: path.slice(0, -1) };
}

type GenContext = {
  rng: Rng;
  tiles: Tile[][];
  taken: Set<string>;
  spawn: Point;
  exit: Point;
  modifier: DailyModifier;
  /** Secret-room tiles are reserved for the treasure — never place here. */
  secretRoom: Room | null;
};

function takeTile(ctx: GenContext, x: number, y: number): boolean {
  const k = `${x},${y}`;
  if (ctx.taken.has(k)) return false;
  if (tileAt(ctx.tiles, x, y) !== 1) return false;
  ctx.taken.add(k);
  return true;
}

function freeFloorTiles(
  ctx: GenContext,
  minDistFromSpawn: number,
  maxDistFromSpawn?: number
): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (tileAt(ctx.tiles, x, y) !== 1) continue;
      if (ctx.taken.has(`${x},${y}`)) continue;
      if (ctx.secretRoom) {
        const s = ctx.secretRoom;
        if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) continue;
      }
      const d = manhattan({ x, y }, ctx.spawn);
      if (d < minDistFromSpawn) continue;
      if (maxDistFromSpawn !== undefined && d > maxDistFromSpawn) continue;
      out.push({ x, y });
    }
  }
  return shuffle(ctx.rng, out);
}

/** Weekday difficulty: Thu +1 skeleton, Sat/Sun +1 more. 0 = Sunday. */
function skeletonCount(dayKey: DayKey): number {
  const day = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  let count = 1;
  if (day >= 4) count += 1; // Thu, Fri
  if (day === 0 || day === 6) count += 1; // weekend
  return count;
}

function tryGenerate(
  dayKey: DayKey,
  attempt: number
): Dungeon | { error: string } {
  const rng = rngFor(dayKey, 'dungeon', attempt);
  const modifier = modifierForDay(dayKey);
  const tiles: Tile[][] = Array.from({ length: GRID_H }, () =>
    Array<Tile>(GRID_W).fill(0)
  );

  // Four main rooms + one 2x2 secret room (five rooms total).
  const rooms = placeRooms(rng, 4);
  if (rooms.length < 4) return { error: 'rooms' };

  // Corridor paths are computed BEFORE carving so the secret room can be
  // placed clear of them.
  const centers = rooms.map(roomCenter);
  const corridorSets: Point[][] = [];
  const corridorTiles = new Set<string>();
  for (let i = 1; i < centers.length; i++) {
    const path = corridorPath(centers[i - 1] as Point, centers[i] as Point, rng);
    corridorSets.push(path);
    for (const p of path) corridorTiles.add(`${p.x},${p.y}`);
  }
  const secretRoom = findSecretSpot(rng, rooms, corridorTiles);
  if (!secretRoom) return { error: 'secret-room' };

  for (const room of rooms) carveRoom(tiles, room);
  carveRoom(tiles, secretRoom);
  for (const path of corridorSets) carveCorridor(tiles, path);

  const spawn = roomCenter(rooms[0] as Room);
  // Exit goes in the room farthest from the spawn room.
  let exitRoom = rooms[0] as Room;
  let bestDist = -1;
  for (const room of rooms) {
    const d = manhattan(roomCenter(room), spawn);
    if (d > bestDist) {
      bestDist = d;
      exitRoom = room;
    }
  }
  const exit = roomCenter(exitRoom);
  const exitRow = tiles[exit.y];
  if (exitRow) exitRow[exit.x] = 2;

  // Secret room entrance: cracked wall (plus a short stub if needed).
  const secretLink = findSecretCrack(tiles, secretRoom);
  let secret: SecretRoom | null = null;
  if (secretLink) {
    for (const p of secretLink.stub) {
      const row = tiles[p.y];
      if (row) row[p.x] = 1;
    }
    const crackRow = tiles[secretLink.crack.y];
    if (crackRow) crackRow[secretLink.crack.x] = 3;
    secret = { room: secretRoom, crack: secretLink.crack, revealed: false };
    // Invariant: the secret room must NOT be reachable without opening the
    // cracked wall (a corridor must never accidentally connect it).
    const secretCenter = roomCenter(secretRoom);
    if (bfsPath(tiles, spawn, secretCenter) !== null) {
      return { error: 'secret-reachable' };
    }
  }

  const ctx: GenContext = {
    rng,
    tiles,
    taken: new Set<string>([`${spawn.x},${spawn.y}`, `${exit.x},${exit.y}`]),
    spawn,
    exit,
    modifier,
    secretRoom: secret ? secretRoom : null,
  };

  // --- Enemies: tougher the deeper you go (distance from spawn). ---
  const enemies: Enemy[] = [];
  let enemyId = 0;
  const placeEnemy = (
    kind: EnemyKind,
    minDist: number,
    maxDist?: number
  ): boolean => {
    const spots = freeFloorTiles(ctx, minDist, maxDist);
    const spot = spots[0];
    if (!spot) return false;
    if (!takeTile(ctx, spot.x, spot.y)) return false;
    const stats = ENEMY_STATS[kind];
    enemies.push({
      id: `e${enemyId++}`,
      kind,
      x: spot.x,
      y: spot.y,
      hp: stats.hp,
      maxHp: stats.hp,
      dmg: stats.dmg,
    });
    return true;
  };

  // First slime close by (teaches combat), the rest spread out. The
  // teaching placements are hard requirements: if they fail, retry.
  const slimeTotal = 3 + modifier.extraSlimes;
  if (!placeEnemy('slime', 4, 6)) return { error: 'teaching-slime' };
  for (let i = 1; i < slimeTotal; i++) placeEnemy('slime', 4);
  const batTotal = 1 + modifier.extraBats;
  for (let i = 0; i < batTotal; i++) placeEnemy('bat', 6);
  const skelTotal = skeletonCount(dayKey);
  for (let i = 0; i < skelTotal; i++) placeEnemy('skeleton', 8);
  // The brute guards the exit room (but never inside the spawn safe zone).
  const bruteSpots = freeFloorTiles(ctx, 4).filter(
    (p) =>
      p.x >= exitRoom.x &&
      p.x < exitRoom.x + exitRoom.w &&
      p.y >= exitRoom.y &&
      p.y < exitRoom.y + exitRoom.h
  );
  const bruteSpot = bruteSpots[0];
  if (bruteSpot && takeTile(ctx, bruteSpot.x, bruteSpot.y)) {
    const stats = ENEMY_STATS.brute;
    enemies.push({
      id: `e${enemyId++}`,
      kind: 'brute',
      x: bruteSpot.x,
      y: bruteSpot.y,
      hp: stats.hp,
      maxHp: stats.hp,
      dmg: stats.dmg,
    });
  }

  // --- Pickups. ---
  const pickups: Pickup[] = [];
  let pickupId = 0;
  const placePickup = (
    kind: PickupKind,
    minDist: number,
    maxDist?: number
  ): boolean => {
    const spots = freeFloorTiles(ctx, minDist, maxDist);
    const spot = spots[0];
    if (!spot) return false;
    if (!takeTile(ctx, spot.x, spot.y)) return false;
    pickups.push({ id: `p${pickupId++}`, kind, x: spot.x, y: spot.y });
    return true;
  };

  // One coin right next to spawn (teaches pickup), the rest spread out.
  if (!placePickup('coin', 1, 2)) return { error: 'teaching-coin' };
  const coinTotal = 5 + modifier.extraCoins;
  for (let i = 1; i < coinTotal; i++) placePickup('coin', 2);
  for (let i = 0; i < modifier.hearts; i++) placePickup('heart', 4);
  if (modifier.sword) placePickup('sword', 6, 14);

  // Secret-room treasure: 3 coins + 1 heart (heart skipped for Greed).
  if (secret) {
    const secretTiles: Point[] = [];
    for (let y = secretRoom.y; y < secretRoom.y + secretRoom.h; y++) {
      for (let x = secretRoom.x; x < secretRoom.x + secretRoom.w; x++) {
        secretTiles.push({ x, y });
      }
    }
    const shuffled = shuffle(rng, secretTiles);
    const treasure: PickupKind[] = ['coin', 'coin', 'coin'];
    if (modifier.hearts > 0) treasure.push('heart');
    treasure.forEach((kind, i) => {
      const spot = shuffled[i];
      if (!spot) return;
      pickups.push({ id: `p${pickupId++}`, kind, x: spot.x, y: spot.y });
      ctx.taken.add(`${spot.x},${spot.y}`);
    });
  }

  return {
    dayKey,
    attempt,
    modifierId: modifier.id,
    width: GRID_W,
    height: GRID_H,
    tiles,
    rooms,
    spawn,
    exit,
    secret,
    enemies,
    pickups,
  };
}

/**
 * Solvability check: find the path from spawn to the exit that costs the
 * least HP (Dijkstra — stepping onto an enemy's tile costs the damage taken
 * fighting it; hearts collected along the way heal). If the player arrives
 * alive, the dungeon is completable.
 *
 * This models a careful player who routes around danger when a detour
 * exists. It is still conservative: it ignores the Lantern Blast, the
 * sword pickup, and off-path hearts, all of which make real runs easier.
 */
export function solveDungeon(dungeon: Dungeon): {
  solvable: boolean;
  pathLength: number;
  endHp: number;
} {
  const modifier = modifierForDay(dungeon.dayKey);
  const atk = modifier.playerAttack;
  const enemyByTile = new Map<string, Enemy>();
  for (const e of dungeon.enemies) enemyByTile.set(`${e.x},${e.y}`, e);
  const pickupByTile = new Map<string, Pickup>();
  for (const p of dungeon.pickups) pickupByTile.set(`${p.x},${p.y}`, p);

  // Damage taken fighting this enemy: the player attacks first each turn,
  // so the enemy only hits back on the turns it survives.
  const fightDamage = (enemy: Enemy): number => {
    const turnsToKill = Math.ceil(enemy.hp / atk);
    return (turnsToKill - 1) * enemy.dmg;
  };

  // Dijkstra over walkable tiles, minimizing damage taken. The grid is
  // tiny (13x9), so a simple array-based queue is plenty.
  const key = (p: Point): string => `${p.x},${p.y}`;
  const damage = new Map<string, number>();
  const prev = new Map<string, Point | null>();
  const open: Point[] = [dungeon.spawn];
  damage.set(key(dungeon.spawn), 0);
  prev.set(key(dungeon.spawn), null);
  while (open.length > 0) {
    // Pop the lowest-damage tile.
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      const a = damage.get(key(open[i] as Point)) as number;
      const b = damage.get(key(open[bestIdx] as Point)) as number;
      if (a < b) bestIdx = i;
    }
    const cur = open.splice(bestIdx, 1)[0] as Point;
    if (cur.x === dungeon.exit.x && cur.y === dungeon.exit.y) break;
    const curDamage = damage.get(key(cur)) as number;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      if (!isWalkableTile(tileAt(dungeon.tiles, nx, ny))) continue;
      const np = { x: nx, y: ny };
      const enemy = enemyByTile.get(key(np));
      const stepCost = enemy ? fightDamage(enemy) : 0;
      const total = curDamage + stepCost;
      const prevBest = damage.get(key(np));
      if (prevBest === undefined || total < prevBest) {
        damage.set(key(np), total);
        prev.set(key(np), cur);
        if (!open.some((p) => p.x === nx && p.y === ny)) open.push(np);
      }
    }
  }

  const exitKey = key(dungeon.exit);
  if (!damage.has(exitKey)) {
    return { solvable: false, pathLength: 0, endHp: 0 };
  }
  // Reconstruct the least-damage path and simulate heart collection.
  const path: Point[] = [];
  let node: Point | null = dungeon.exit;
  while (node) {
    path.push(node);
    node = prev.get(key(node)) ?? null;
  }
  path.reverse();

  let hp = modifier.playerHp;
  for (const step of path) {
    const enemy = enemyByTile.get(key(step));
    if (enemy) hp -= fightDamage(enemy);
    const pickup = pickupByTile.get(key(step));
    if (pickup?.kind === 'heart') {
      hp = Math.min(modifier.playerHp, hp + 3);
    }
    if (hp <= 0) {
      return { solvable: false, pathLength: path.length, endHp: hp };
    }
  }
  return { solvable: hp > 0, pathLength: path.length, endHp: hp };
}

/**
 * Generate the day's dungeon, retrying sub-seeds until the solver passes.
 * Deterministic: the same day always yields the same dungeon.
 */
export function generateDailyDungeon(dayKey: DayKey): Dungeon {
  const failures = new Map<string, number>();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = tryGenerate(dayKey, attempt);
    if ('error' in result) {
      failures.set(result.error, (failures.get(result.error) ?? 0) + 1);
      continue;
    }
    const solved = solveDungeon(result);
    if (!solved.solvable) {
      failures.set('unsolvable', (failures.get('unsolvable') ?? 0) + 1);
      continue;
    }
    return result;
  }
  const tally = [...failures.entries()]
    .map(([reason, count]) => `${reason}:${count}`)
    .join(', ');
  throw new Error(
    `Could not generate a solvable dungeon for ${dayKey} after ${MAX_ATTEMPTS} attempts (${tally})`
  );
}

/** Shortest-path distance between two points over walkable tiles. */
export function pathDistance(
  tiles: Tile[][],
  from: Point,
  to: Point
): number | null {
  const path = bfsPath(tiles, from, to);
  return path ? path.length - 1 : null;
}
