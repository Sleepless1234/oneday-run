/**
 * One Run game engine — pure turn-based logic, no rendering.
 *
 * Rules (learnable in under a minute):
 *  - Move with arrows / WASD / swipe / D-pad / tap an adjacent tile.
 *  - Bump into an enemy to attack it. Enemies act after you.
 *  - Grab coins (+score), hearts (+3 HP) and the sword (+1 attack).
 *  - Reach the golden stairs to escape. One life — death ends the run.
 *  - Lantern Blast (F / button): one charge per run, hits all adjacent
 *    enemies for 3 damage. Spend it wisely.
 *  - Cracked walls hide a secret room. Bump one to break it open.
 *
 * Scoring rewards skill: kills, coins, kill-combos (kills chained within
 * 3 turns), escape bonus, remaining HP and speed (turn bonus).
 */
import {
  bfsPath,
  isWalkableTile,
  manhattan,
  tileAt,
  ENEMY_STATS,
  type Dungeon,
  type Enemy,
  type EnemyKind,
  type Pickup,
  type Point,
  type Tile,
} from '../../shared/dungeon';
import type { DailyModifier } from '../../shared/modifiers';
import {
  BLAST_DAMAGE,
  COMBO_WINDOW_TURNS,
  comboBonusForKill,
  coinScore,
  ESCAPE_BONUS,
  HEART_HEAL,
  hpBonus,
  killScore,
  turnBonus,
} from '../../shared/scoring';

export type GamePhase = 'playing' | 'won' | 'dead';

export type GameEvent = {
  kind:
    | 'attack'
    | 'kill'
    | 'hurt'
    | 'pickup'
    | 'blast'
    | 'secret'
    | 'win'
    | 'die'
    | 'blocked'
    | 'wait';
  text: string;
  /** Tile position for floating score text. */
  x?: number;
  y?: number;
  /** Score gained (for floating text). */
  amount?: number;
};

export type ScoreBreakdown = {
  kills: number;
  coins: number;
  combo: number;
  escape: number;
  hp: number;
  turns: number;
};

export type GameState = {
  dungeon: Dungeon;
  modifier: DailyModifier;
  tiles: Tile[][];
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    attack: number;
    blasts: number;
  };
  enemies: Enemy[];
  pickups: Pickup[];
  secretRevealed: boolean;
  score: number;
  breakdown: ScoreBreakdown;
  kills: number;
  coins: number;
  combo: number;
  maxCombo: number;
  lastKillTurn: number;
  turns: number;
  phase: GamePhase;
  diedTo: string | null;
  /** Events produced by the most recent action (log line + floaters). */
  events: GameEvent[];
  startedAt: number;
};

export function createGame(dungeon: Dungeon, modifier: DailyModifier): GameState {
  return {
    dungeon,
    modifier,
    tiles: dungeon.tiles.map((row) => [...row]),
    player: {
      x: dungeon.spawn.x,
      y: dungeon.spawn.y,
      hp: modifier.playerHp,
      maxHp: modifier.playerHp,
      attack: modifier.playerAttack,
      blasts: modifier.blasts,
    },
    enemies: dungeon.enemies.map((e) => ({ ...e })),
    pickups: dungeon.pickups.map((p) => ({ ...p })),
    secretRevealed: false,
    score: 0,
    breakdown: { kills: 0, coins: 0, combo: 0, escape: 0, hp: 0, turns: 0 },
    kills: 0,
    coins: 0,
    combo: 0,
    maxCombo: 0,
    lastKillTurn: -100,
    turns: 0,
    phase: 'playing',
    diedTo: null,
    events: [],
    startedAt: Date.now(),
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    tiles: state.tiles.map((row) => [...row]),
    player: { ...state.player },
    enemies: state.enemies.map((e) => ({ ...e })),
    pickups: state.pickups.map((p) => ({ ...p })),
    breakdown: { ...state.breakdown },
    events: [],
  };
}

function enemyAt(state: GameState, x: number, y: number): Enemy | undefined {
  return state.enemies.find((e) => e.x === x && e.y === y);
}

function pickupAt(state: GameState, x: number, y: number): Pickup | undefined {
  return state.pickups.find((p) => p.x === x && p.y === y);
}

function addScore(state: GameState, amount: number, bucket: keyof ScoreBreakdown): void {
  state.score += amount;
  state.breakdown[bucket] += amount;
}

function registerKill(state: GameState, enemy: Enemy, events: GameEvent[]): void {
  state.kills += 1;
  const chained = state.turns - state.lastKillTurn <= COMBO_WINDOW_TURNS;
  state.combo = chained ? state.combo + 1 : 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.lastKillTurn = state.turns;
  const killPoints = killScore(enemy.kind, state.modifier);
  const comboPoints = comboBonusForKill(state.combo);
  addScore(state, killPoints, 'kills');
  if (comboPoints > 0) addScore(state, comboPoints, 'combo');
  state.enemies = state.enemies.filter((e) => e.id !== enemy.id);
  const label = ENEMY_STATS[enemy.kind].label;
  events.push({
    kind: 'kill',
    text:
      state.combo > 1
        ? `${label} slain! Combo x${state.combo}`
        : `${label} slain!`,
    x: enemy.x,
    y: enemy.y,
    amount: killPoints + comboPoints,
  });
}

function damageEnemy(
  state: GameState,
  enemy: Enemy,
  damage: number,
  events: GameEvent[]
): void {
  enemy.hp -= damage;
  if (enemy.hp <= 0) {
    registerKill(state, enemy, events);
  } else {
    const label = ENEMY_STATS[enemy.kind].label;
    events.push({
      kind: 'attack',
      text: `You hit the ${label.toLowerCase()} for ${damage}.`,
      x: enemy.x,
      y: enemy.y,
      amount: 0,
    });
  }
}

function hurtPlayer(
  state: GameState,
  damage: number,
  source: EnemyKind,
  events: GameEvent[]
): void {
  state.player.hp -= damage;
  const label = ENEMY_STATS[source].label;
  events.push({
    kind: 'hurt',
    text: `The ${label.toLowerCase()} hits you for ${damage}!`,
    x: state.player.x,
    y: state.player.y,
  });
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = 'dead';
    state.diedTo = label;
    events.push({ kind: 'die', text: `Slain by a ${label.toLowerCase()}.` });
  }
}

function collectPickup(state: GameState, pickup: Pickup, events: GameEvent[]): void {
  state.pickups = state.pickups.filter((p) => p.id !== pickup.id);
  if (pickup.kind === 'coin') {
    state.coins += 1;
    const value = coinScore(state.modifier);
    addScore(state, value, 'coins');
    events.push({
      kind: 'pickup',
      text: `Coin! +${value}`,
      x: pickup.x,
      y: pickup.y,
      amount: value,
    });
  } else if (pickup.kind === 'heart') {
    const healed = Math.min(HEART_HEAL, state.player.maxHp - state.player.hp);
    state.player.hp += healed;
    events.push({
      kind: 'pickup',
      text: healed > 0 ? `Heart! +${healed} HP` : 'Heart! Already full.',
      x: pickup.x,
      y: pickup.y,
    });
  } else {
    state.player.attack += 1;
    events.push({
      kind: 'pickup',
      text: 'Sword! Attack up.',
      x: pickup.x,
      y: pickup.y,
    });
  }
}

function finishEscape(state: GameState, events: GameEvent[]): void {
  state.phase = 'won';
  addScore(state, ESCAPE_BONUS, 'escape');
  addScore(state, hpBonus(state.player.hp), 'hp');
  addScore(state, turnBonus(state.turns), 'turns');
  events.push({
    kind: 'win',
    text: `You escaped the dungeon! +${ESCAPE_BONUS} escape bonus.`,
  });
}

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Can an enemy step onto this tile? */
function enemyCanEnter(state: GameState, x: number, y: number): boolean {
  const tile = tileAt(state.tiles, x, y);
  if (tile !== 1) return false; // no walls, no exit, no cracked walls
  if (state.player.x === x && state.player.y === y) return false;
  return !enemyAt(state, x, y);
}

/** One enemy takes its turn: attack if adjacent, else move by kind. */
function enemyAct(state: GameState, enemy: Enemy, events: GameEvent[]): void {
  if (state.phase !== 'playing') return;
  const dist = manhattan(enemy, state.player);
  if (dist === 1) {
    hurtPlayer(state, enemy.dmg, enemy.kind, events);
    return;
  }

  const stepTowardPlayer = (): Point | null => {
    const path = bfsPath(
      state.tiles,
      { x: enemy.x, y: enemy.y },
      { x: state.player.x, y: state.player.y },
      (tile) => tile === 1 || tile === 2
    );
    // path[0] is the enemy tile; path[1] is the next step. The final tile
    // is the player tile, which the enemy cannot enter — stop before it.
    if (!path || path.length < 3) return null;
    const step = path[1];
    if (!step) return null;
    return step;
  };

  const randomStep = (): Point | null => {
    const options = DIRS.map(([dx, dy]) => ({
      x: enemy.x + dx,
      y: enemy.y + dy,
    })).filter((p) => enemyCanEnter(state, p.x, p.y));
    if (options.length === 0) return null;
    const choice = options[Math.floor(Math.random() * options.length)];
    return choice ?? null;
  };

  const moveTo = (p: Point | null): void => {
    if (!p || !enemyCanEnter(state, p.x, p.y)) return;
    enemy.x = p.x;
    enemy.y = p.y;
  };

  if (enemy.kind === 'skeleton') {
    if (dist <= 6) {
      moveTo(stepTowardPlayer());
    } else {
      moveTo(randomStep());
    }
  } else if (enemy.kind === 'brute') {
    if (dist <= 5) {
      moveTo(stepTowardPlayer());
    }
    // Otherwise the brute holds its ground.
  } else if (enemy.kind === 'bat') {
    moveTo(randomStep());
    if (state.phase === 'playing') moveTo(randomStep());
  } else {
    // Slime: one random step.
    moveTo(randomStep());
  }
  // After moving, an enemy adjacent to the player does NOT attack until
  // its next turn — the player always gets a chance to respond.
}

function enemiesAct(state: GameState, events: GameEvent[]): void {
  for (const enemy of [...state.enemies]) {
    if (state.phase !== 'playing') break;
    // The enemy may have died earlier this round (blast).
    if (!state.enemies.some((e) => e.id === enemy.id)) continue;
    enemyAct(state, enemy, events);
  }
}

/**
 * Attempt to move the player by (dx, dy). Bumping an enemy attacks it;
 * bumping a cracked wall opens the secret room. Blocked moves (walls)
 * cost no turn.
 */
export function tryMove(state: GameState, dx: number, dy: number): GameState {
  if (state.phase !== 'playing') return state;
  const next = cloneState(state);
  const events: GameEvent[] = [];
  const tx = next.player.x + dx;
  const ty = next.player.y + dy;
  const tile = tileAt(next.tiles, tx, ty);

  const target = enemyAt(next, tx, ty);
  if (target) {
    next.turns += 1;
    damageEnemy(next, target, next.player.attack, events);
    if (next.phase === 'playing') enemiesAct(next, events);
    next.events = events;
    return next;
  }

  if (tile === 0) {
    events.push({ kind: 'blocked', text: 'A solid wall. Find another way.' });
    next.events = events;
    return next;
  }

  if (tile === 3) {
    // Cracked wall — break it open and reveal the secret room.
    next.turns += 1;
    const row = next.tiles[ty];
    if (row) row[tx] = 1;
    next.secretRevealed = true;
    events.push({
      kind: 'secret',
      text: 'The wall crumbles — a secret room!',
      x: tx,
      y: ty,
    });
    if (next.phase === 'playing') enemiesAct(next, events);
    next.events = events;
    return next;
  }

  if (!isWalkableTile(tile)) {
    events.push({ kind: 'blocked', text: 'You cannot go that way.' });
    next.events = events;
    return next;
  }

  next.turns += 1;
  next.player.x = tx;
  next.player.y = ty;
  const pickup = pickupAt(next, tx, ty);
  if (pickup) collectPickup(next, pickup, events);
  if (tile === 2) {
    finishEscape(next, events);
    next.events = events;
    return next;
  }
  if (next.phase === 'playing') enemiesAct(next, events);
  next.events = events;
  return next;
}

/** Pass a turn (let enemies come to you). */
export function waitTurn(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const next = cloneState(state);
  const events: GameEvent[] = [{ kind: 'wait', text: 'You wait and listen…' }];
  next.turns += 1;
  enemiesAct(next, events);
  next.events = events;
  return next;
}

/** Lantern Blast: damage all adjacent enemies. Costs a turn. */
export function lanternBlast(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  if (state.player.blasts <= 0) {
    const next = cloneState(state);
    next.events = [{ kind: 'blocked', text: 'No Lantern Blasts left.' }];
    return next;
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  next.turns += 1;
  next.player.blasts -= 1;
  const adjacent = next.enemies.filter(
    (e) => manhattan(e, next.player) === 1
  );
  if (adjacent.length === 0) {
    events.push({
      kind: 'blast',
      text: 'The lantern flares — but nothing is close enough.',
    });
  } else {
    events.push({
      kind: 'blast',
      text: `Lantern Blast! ${adjacent.length} enem${adjacent.length === 1 ? 'y' : 'ies'} seared.`,
      x: next.player.x,
      y: next.player.y,
    });
    for (const enemy of [...adjacent]) {
      damageEnemy(next, enemy, BLAST_DAMAGE, events);
    }
  }
  if (next.phase === 'playing') enemiesAct(next, events);
  next.events = events;
  return next;
}

/** BFS distance from the player to the exit (near-miss stat). */
export function distanceToExit(state: GameState): number | null {
  const path = bfsPath(
    state.tiles,
    { x: state.player.x, y: state.player.y },
    state.dungeon.exit
  );
  return path ? path.length - 1 : null;
}

/** BFS distance from the player to the secret room's cracked wall. */
export function distanceToSecret(state: GameState): number | null {
  const secret = state.dungeon.secret;
  if (!secret) return null;
  const path = bfsPath(
    state.tiles,
    { x: state.player.x, y: state.player.y },
    secret.crack,
    (tile) => tile === 1 || tile === 2 || tile === 3
  );
  return path ? path.length - 1 : null;
}
