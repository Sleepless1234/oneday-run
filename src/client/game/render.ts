/**
 * Canvas renderer for the One Run dungeon — all art is drawn procedurally
 * (no image assets), in a warm lantern-lit palette: deep charcoal-brown
 * stone, amber gold, soft cream. Calm and crafted, never generic.
 */
import { tileAt, type Tile } from '../../shared/dungeon';
import type { GameState } from './engine';

export type Floater = {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
};

export type RenderOptions = {
  state: GameState;
  /** Pixel size of one tile. */
  tile: number;
  /** Milliseconds since the page started (for the lantern pulse). */
  time: number;
  floaters: Floater[];
  /** Timestamp of the last player-hurt event (red flash), or 0. */
  flashAt: number;
  /** Last attack lunge: direction + timestamp, or null. */
  lunge: { dx: number; dy: number; at: number } | null;
  /** Tile currently hovered (tap target highlight), or null. */
  hover: { x: number; y: number } | null;
};

const PALETTE = {
  floorA: '#2b211a',
  floorB: '#2e241c',
  floorSpeckle: '#241b13',
  wall: '#4a3826',
  wallTop: '#5d4630',
  wallDark: '#332517',
  crack: '#1c130c',
  exitGlow: '#f5b942',
  gold: '#f2c14e',
  goldDark: '#c99327',
  heart: '#e5484d',
  heartDark: '#b32d32',
  blade: '#d7dde3',
  grip: '#7a5230',
  playerCloak: '#d97b2f',
  playerCloakDark: '#b25c1d',
  playerHood: '#f4e3c8',
  slime: '#7fb069',
  slimeDark: '#5d8a4d',
  bat: '#9b8ec4',
  batDark: '#6f6394',
  bone: '#e8e0cc',
  boneDark: '#b8ad8d',
  brute: '#b5502e',
  bruteDark: '#8a3a20',
} as const;

/** Deterministic per-tile hash in [0, 1) for stable speckles. */
function hash2(x: number, y: number, salt: number): number {
  let h = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number
): void {
  const px = x * t;
  const py = y * t;
  ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
  ctx.fillRect(px, py, t, t);
  // Two stable speckles per tile for a stone texture.
  ctx.fillStyle = PALETTE.floorSpeckle;
  const s1x = px + t * (0.2 + hash2(x, y, 1) * 0.5);
  const s1y = py + t * (0.2 + hash2(x, y, 2) * 0.5);
  ctx.beginPath();
  ctx.arc(s1x, s1y, Math.max(1, t * 0.03), 0, Math.PI * 2);
  ctx.fill();
  const s2x = px + t * (0.25 + hash2(x, y, 3) * 0.45);
  const s2y = py + t * (0.25 + hash2(x, y, 4) * 0.45);
  ctx.beginPath();
  ctx.arc(s2x, s2y, Math.max(1, t * 0.02), 0, Math.PI * 2);
  ctx.fill();
}

function drawWallTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  cracked: boolean
): void {
  const px = x * t;
  const py = y * t;
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(px, py, t, t);
  // Top highlight + bottom shade for a raised-block feel.
  ctx.fillStyle = PALETTE.wallTop;
  ctx.fillRect(px, py, t, Math.max(2, t * 0.12));
  ctx.fillStyle = PALETTE.wallDark;
  ctx.fillRect(px, py + t - Math.max(2, t * 0.12), t, Math.max(2, t * 0.12));
  // Brick seam.
  ctx.fillStyle = PALETTE.wallDark;
  ctx.fillRect(px, py + t * 0.55, t, Math.max(1, t * 0.04));
  if (cracked) {
    // Jagged crack lines + a faint amber glint (the tell).
    ctx.strokeStyle = PALETTE.crack;
    ctx.lineWidth = Math.max(1.5, t * 0.05);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(px + t * 0.5, py + t * 0.08);
    ctx.lineTo(px + t * 0.42, py + t * 0.35);
    ctx.lineTo(px + t * 0.58, py + t * 0.55);
    ctx.lineTo(px + t * 0.45, py + t * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + t * 0.42, py + t * 0.35);
    ctx.lineTo(px + t * 0.2, py + t * 0.45);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 185, 66, 0.85)';
    ctx.beginPath();
    ctx.arc(px + t * 0.58, py + t * 0.55, Math.max(1.5, t * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawExit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  time: number
): void {
  const cx = x * t + t / 2;
  const cy = y * t + t / 2;
  const pulse = 0.75 + Math.sin(time / 350) * 0.25;
  ctx.save();
  ctx.shadowColor = PALETTE.exitGlow;
  ctx.shadowBlur = t * 0.45 * pulse;
  ctx.fillStyle = PALETTE.exitGlow;
  // Golden stairs: three receding steps.
  for (let i = 0; i < 3; i++) {
    const w = t * (0.62 - i * 0.14);
    const h = t * 0.14;
    const sx = cx - w / 2;
    const sy = cy + t * 0.28 - i * t * 0.2;
    ctx.globalAlpha = 0.55 + i * 0.2;
    roundRect(ctx, sx, sy, w, h, t * 0.05);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const cx = x * t + t / 2;
  const cy = y * t + t / 2;
  const r = t * 0.26;
  ctx.fillStyle = PALETTE.goldDark;
  ctx.beginPath();
  ctx.arc(cx, cy + t * 0.03, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.lineWidth = Math.max(1, t * 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const cx = x * t + t / 2;
  const cy = y * t + t / 2;
  const s = t * 0.3;
  ctx.fillStyle = PALETTE.heartDark;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.95);
  ctx.bezierCurveTo(cx - s * 1.25, cy + s * 0.1, cx - s * 0.7, cy - s * 0.9, cx, cy - s * 0.25);
  ctx.bezierCurveTo(cx + s * 0.7, cy - s * 0.9, cx + s * 1.25, cy + s * 0.1, cx, cy + s * 0.95);
  ctx.fill();
  ctx.fillStyle = PALETTE.heart;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.8);
  ctx.bezierCurveTo(cx - s * 1.1, cy, cx - s * 0.6, cy - s * 0.85, cx, cy - s * 0.2);
  ctx.bezierCurveTo(cx + s * 0.6, cy - s * 0.85, cx + s * 1.1, cy, cx, cy + s * 0.8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.arc(cx - s * 0.35, cy - s * 0.3, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function drawSword(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const cx = x * t + t / 2;
  const cy = y * t + t / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = PALETTE.blade;
  roundRect(ctx, -t * 0.06, -t * 0.34, t * 0.12, t * 0.52, t * 0.04);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-t * 0.06, -t * 0.34);
  ctx.lineTo(0, -t * 0.44);
  ctx.lineTo(t * 0.06, -t * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.goldDark;
  ctx.fillRect(-t * 0.16, t * 0.16, t * 0.32, t * 0.07);
  ctx.fillStyle = PALETTE.grip;
  roundRect(ctx, -t * 0.05, t * 0.23, t * 0.1, t * 0.2, t * 0.03);
  ctx.fill();
  ctx.restore();
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  gap: number,
  r: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx - gap, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + gap, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  hp: number,
  maxHp: number
): void {
  if (hp >= maxHp) return;
  const w = t * 0.6;
  const h = Math.max(3, t * 0.07);
  const px = x * t + (t - w) / 2;
  const py = y * t + t * 0.06;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, px, py, w, h, h / 2);
  ctx.fill();
  const frac = hp / maxHp;
  ctx.fillStyle = frac > 0.5 ? '#7fb069' : frac > 0.25 ? '#f2c14e' : '#e5484d';
  roundRect(ctx, px, py, w * frac, h, h / 2);
  ctx.fill();
}

function drawSlime(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  time: number
): void {
  const cx = x * t + t / 2;
  const wobble = Math.sin(time / 300 + x * 2 + y) * t * 0.02;
  const cy = y * t + t * 0.62 + wobble;
  ctx.fillStyle = PALETTE.slimeDark;
  ctx.beginPath();
  ctx.ellipse(cx, cy + t * 0.05, t * 0.34, t * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.slime;
  ctx.beginPath();
  ctx.ellipse(cx, cy, t * 0.32, t * 0.24, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy, t * 0.32, t * 0.22, 0, 0, Math.PI);
  ctx.fill();
  drawEyes(ctx, cx, cy - t * 0.06, t * 0.11, t * 0.05, '#1d2b16');
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(cx - t * 0.14, cy - t * 0.12, t * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

function drawBat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  time: number
): void {
  const cx = x * t + t / 2;
  const flap = Math.sin(time / 160 + x + y * 3) * t * 0.1;
  const cy = y * t + t * 0.45 + Math.sin(time / 400 + x) * t * 0.03;
  ctx.fillStyle = PALETTE.batDark;
  ctx.beginPath();
  ctx.moveTo(cx - t * 0.08, cy);
  ctx.lineTo(cx - t * 0.42, cy - t * 0.18 - flap);
  ctx.lineTo(cx - t * 0.3, cy + t * 0.1);
  ctx.lineTo(cx - t * 0.42, cy + t * 0.22);
  ctx.lineTo(cx - t * 0.05, cy + t * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + t * 0.08, cy);
  ctx.lineTo(cx + t * 0.42, cy - t * 0.18 - flap);
  ctx.lineTo(cx + t * 0.3, cy + t * 0.1);
  ctx.lineTo(cx + t * 0.42, cy + t * 0.22);
  ctx.lineTo(cx + t * 0.05, cy + t * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.bat;
  ctx.beginPath();
  ctx.arc(cx, cy + t * 0.04, t * 0.16, 0, Math.PI * 2);
  ctx.fill();
  // Ears.
  ctx.beginPath();
  ctx.moveTo(cx - t * 0.12, cy - t * 0.05);
  ctx.lineTo(cx - t * 0.16, cy - t * 0.18);
  ctx.lineTo(cx - t * 0.05, cy - t * 0.1);
  ctx.closePath();
  ctx.moveTo(cx + t * 0.12, cy - t * 0.05);
  ctx.lineTo(cx + t * 0.16, cy - t * 0.18);
  ctx.lineTo(cx + t * 0.05, cy - t * 0.1);
  ctx.closePath();
  ctx.fill();
  drawEyes(ctx, cx, cy + t * 0.02, t * 0.06, t * 0.03, '#f5b942');
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number
): void {
  const cx = x * t + t / 2;
  const cy = y * t + t / 2;
  ctx.fillStyle = PALETTE.bone;
  ctx.beginPath();
  ctx.arc(cx, cy - t * 0.12, t * 0.22, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, cx - t * 0.1, cy + t * 0.06, t * 0.2, t * 0.22, t * 0.04);
  ctx.fill();
  ctx.fillStyle = PALETTE.boneDark;
  ctx.beginPath();
  ctx.arc(cx - t * 0.09, cy - t * 0.14, t * 0.055, 0, Math.PI * 2);
  ctx.arc(cx + t * 0.09, cy - t * 0.14, t * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.boneDark;
  ctx.lineWidth = Math.max(1, t * 0.03);
  for (let i = 0; i < 3; i++) {
    const ry = cy + t * (0.1 + i * 0.07);
    ctx.beginPath();
    ctx.moveTo(cx - t * 0.1, ry);
    ctx.lineTo(cx + t * 0.1, ry);
    ctx.stroke();
  }
}

function drawBrute(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number
): void {
  const cx = x * t + t / 2;
  const cy = y * t + t / 2;
  ctx.fillStyle = PALETTE.bruteDark;
  roundRect(ctx, cx - t * 0.3, cy - t * 0.3, t * 0.6, t * 0.66, t * 0.14);
  ctx.fill();
  ctx.fillStyle = PALETTE.brute;
  roundRect(ctx, cx - t * 0.28, cy - t * 0.32, t * 0.56, t * 0.6, t * 0.14);
  ctx.fill();
  // Horns.
  ctx.beginPath();
  ctx.moveTo(cx - t * 0.2, cy - t * 0.28);
  ctx.lineTo(cx - t * 0.32, cy - t * 0.44);
  ctx.lineTo(cx - t * 0.12, cy - t * 0.34);
  ctx.closePath();
  ctx.moveTo(cx + t * 0.2, cy - t * 0.28);
  ctx.lineTo(cx + t * 0.32, cy - t * 0.44);
  ctx.lineTo(cx + t * 0.12, cy - t * 0.34);
  ctx.closePath();
  ctx.fillStyle = PALETTE.bone;
  ctx.fill();
  drawEyes(ctx, cx, cy - t * 0.12, t * 0.1, t * 0.045, '#ffd9a0');
  // Belt.
  ctx.fillStyle = PALETTE.bruteDark;
  ctx.fillRect(cx - t * 0.28, cy + t * 0.12, t * 0.56, t * 0.07);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  time: number,
  lunge: { dx: number; dy: number; at: number } | null
): void {
  let ox = 0;
  let oy = 0;
  if (lunge) {
    const age = time - lunge.at;
    if (age < 160) {
      const k = Math.sin((age / 160) * Math.PI) * 0.28;
      ox = lunge.dx * t * k;
      oy = lunge.dy * t * k;
    }
  }
  const cx = x * t + t / 2 + ox;
  const cy = y * t + t / 2 + oy;
  const bob = Math.sin(time / 500) * t * 0.015;
  // Soft ring under the player.
  ctx.fillStyle = 'rgba(245, 185, 66, 0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, y * t + t * 0.82, t * 0.32, t * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cloak.
  ctx.fillStyle = PALETTE.playerCloakDark;
  ctx.beginPath();
  ctx.moveTo(cx - t * 0.3, cy + t * 0.34);
  ctx.lineTo(cx, cy - t * 0.26 + bob);
  ctx.lineTo(cx + t * 0.3, cy + t * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.playerCloak;
  ctx.beginPath();
  ctx.moveTo(cx - t * 0.26, cy + t * 0.32);
  ctx.lineTo(cx, cy - t * 0.24 + bob);
  ctx.lineTo(cx + t * 0.26, cy + t * 0.32);
  ctx.closePath();
  ctx.fill();
  // Hood + face.
  ctx.fillStyle = PALETTE.playerHood;
  ctx.beginPath();
  ctx.arc(cx, cy - t * 0.16 + bob, t * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b211a';
  ctx.beginPath();
  ctx.arc(cx, cy - t * 0.14 + bob, t * 0.11, 0, Math.PI * 2);
  ctx.fill();
  drawEyes(ctx, cx, cy - t * 0.15 + bob, t * 0.045, t * 0.022, '#ffd9a0');
  // Lantern glow.
  const pulse = 0.8 + Math.sin(time / 450) * 0.2;
  const glow = ctx.createRadialGradient(
    cx + t * 0.3,
    cy + t * 0.1,
    0,
    cx + t * 0.3,
    cy + t * 0.1,
    t * 0.55 * pulse
  );
  glow.addColorStop(0, 'rgba(255, 190, 90, 0.5)');
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx + t * 0.3, cy + t * 0.1, t * 0.55 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe9b8';
  ctx.beginPath();
  ctx.arc(cx + t * 0.3, cy + t * 0.1, t * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  opts: RenderOptions
): void {
  const { state, tile: t, time, floaters, flashAt, lunge, hover } = opts;
  const w = state.dungeon.width * t;
  const h = state.dungeon.height * t;
  ctx.clearRect(0, 0, w, h);

  // Tiles.
  for (let y = 0; y < state.dungeon.height; y++) {
    for (let x = 0; x < state.dungeon.width; x++) {
      const tile: Tile = tileAt(state.tiles, x, y);
      if (tile === 0) drawWallTile(ctx, x, y, t, false);
      else if (tile === 3) drawWallTile(ctx, x, y, t, true);
      else {
        drawFloorTile(ctx, x, y, t);
        if (tile === 2) drawExit(ctx, x, y, t, time);
      }
    }
  }

  // Hover highlight on a tile adjacent to the player.
  if (hover && state.phase === 'playing') {
    const d = Math.abs(hover.x - state.player.x) + Math.abs(hover.y - state.player.y);
    if (d === 1) {
      ctx.fillStyle = 'rgba(245, 185, 66, 0.22)';
      ctx.fillRect(hover.x * t, hover.y * t, t, t);
      ctx.strokeStyle = 'rgba(245, 185, 66, 0.6)';
      ctx.lineWidth = Math.max(1, t * 0.04);
      ctx.strokeRect(hover.x * t, hover.y * t, t, t);
    }
  }

  // Pickups (under entities).
  for (const p of state.pickups) {
    if (p.kind === 'coin') drawCoin(ctx, p.x, p.y, t);
    else if (p.kind === 'heart') drawHeart(ctx, p.x, p.y, t);
    else drawSword(ctx, p.x, p.y, t);
  }

  // Enemies.
  for (const e of state.enemies) {
    if (e.kind === 'slime') drawSlime(ctx, e.x, e.y, t, time);
    else if (e.kind === 'bat') drawBat(ctx, e.x, e.y, t, time);
    else if (e.kind === 'skeleton') drawSkeleton(ctx, e.x, e.y, t);
    else drawBrute(ctx, e.x, e.y, t);
    drawHpBar(ctx, e.x, e.y, t, e.hp, e.maxHp);
  }

  // Player (hidden once dead — the dungeon claims them).
  if (state.phase !== 'dead') {
    drawPlayer(ctx, state.player.x, state.player.y, t, time, lunge);
  }

  // Lantern light: a soft radial light around the player, gentle vignette.
  const px = (state.player.x + 0.5) * t;
  const py = (state.player.y + 0.5) * t;
  const light = ctx.createRadialGradient(px, py, t * 1.2, px, py, t * 7);
  light.addColorStop(0, 'rgba(0,0,0,0)');
  light.addColorStop(1, 'rgba(10,6,3,0.28)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);

  // Damage flash.
  if (flashAt > 0) {
    const age = time - flashAt;
    if (age < 350) {
      const alpha = 0.28 * (1 - age / 350);
      ctx.fillStyle = `rgba(229, 72, 77, ${alpha})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Floating score texts.
  for (const f of floaters) {
    const age = time - f.born;
    if (age < 0 || age > 950) continue;
    const rise = (age / 950) * t * 0.9;
    const alpha = age < 650 ? 1 : 1 - (age - 650) / 300;
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${Math.max(11, t * 0.34)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(2, t * 0.07);
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.9)';
    const fx = f.x * t + t / 2;
    const fy = f.y * t + t * 0.3 - rise;
    ctx.strokeText(f.text, fx, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx, fy);
    ctx.globalAlpha = 1;
  }
}
