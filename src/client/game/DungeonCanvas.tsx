/**
 * The dungeon board: a canvas with a requestAnimationFrame loop, plus all
 * game input — keyboard (arrows/WASD, Space to wait, F for Lantern Blast),
 * tap-to-move on an adjacent tile, and swipe-to-move.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameState } from './engine';
import { drawBoard, type Floater } from './render';

type Props = {
  state: GameState;
  interactive: boolean;
  onMove: (dx: number, dy: number) => void;
  onWait: () => void;
  onBlast: () => void;
};

export function DungeonCanvas({ state, interactive, onMove, onWait, onBlast }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  const stateRef = useRef(state);
  const hoverRef = useRef(hover);
  const interactiveRef = useRef(interactive);
  const callbacksRef = useRef({ onMove, onWait, onBlast });

  // Keep the refs pointing at the latest values (after render, not during).
  useEffect(() => {
    stateRef.current = state;
    hoverRef.current = hover;
    interactiveRef.current = interactive;
    callbacksRef.current = { onMove, onWait, onBlast };
  });
  const floatersRef = useRef<Floater[]>([]);
  const flashAtRef = useRef(0);
  const lungeRef = useRef<{ dx: number; dy: number; at: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Turn the latest game events into floating texts / flashes / lunges.
  useEffect(() => {
    const now = performance.now();
    for (const event of state.events) {
      if (event.amount !== undefined && event.amount > 0 && event.x !== undefined && event.y !== undefined) {
        floatersRef.current.push({
          x: event.x,
          y: event.y,
          text: `+${event.amount}`,
          color: event.kind === 'kill' ? '#f5b942' : '#ffd98a',
          born: now,
        });
      }
      if (event.kind === 'hurt') flashAtRef.current = now;
      if (
        (event.kind === 'attack' || event.kind === 'kill') &&
        event.x !== undefined &&
        event.y !== undefined
      ) {
        lungeRef.current = {
          dx: event.x - state.player.x,
          dy: event.y - state.player.y,
          at: now,
        };
      }
      if (event.kind === 'secret' && event.x !== undefined && event.y !== undefined) {
        floatersRef.current.push({
          x: event.x,
          y: event.y,
          text: 'Secret!',
          color: '#f5b942',
          born: now,
        });
      }
    }
  }, [state]);

  // Measure the container width (the board scales to fit).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setCssWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = stateRef.current;
    const tile = cssWidth / s.dungeon.width;
    const cssHeight = tile * s.dungeon.height;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      floatersRef.current = floatersRef.current.filter((f) => now - f.born < 1000);
      drawBoard(ctx, {
        state: stateRef.current,
        tile,
        time: now,
        floaters: floatersRef.current,
        flashAt: flashAtRef.current,
        lunge: lungeRef.current,
        hover: hoverRef.current,
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cssWidth]);

  // Keyboard input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!interactiveRef.current) return;
      const { onMove: move, onWait: wait, onBlast: blast } = callbacksRef.current;
      const key = e.key.toLowerCase();
      if (key === 'arrowup' || key === 'w') {
        e.preventDefault();
        move(0, -1);
      } else if (key === 'arrowdown' || key === 's') {
        e.preventDefault();
        move(0, 1);
      } else if (key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        move(-1, 0);
      } else if (key === 'arrowright' || key === 'd') {
        e.preventDefault();
        move(1, 0);
      } else if (key === ' ') {
        e.preventDefault();
        wait();
      } else if (key === 'f') {
        e.preventDefault();
        blast();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const tileFromEvent = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const s = stateRef.current;
    const tile = rect.width / s.dungeon.width;
    const x = Math.floor((e.clientX - rect.left) / tile);
    const y = Math.floor((e.clientY - rect.top) / tile);
    if (x < 0 || y < 0 || x >= s.dungeon.width || y >= s.dungeon.height) return null;
    return { x, y };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || !interactiveRef.current) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);
    const { onMove: move } = callbacksRef.current;
    if (dist >= 24) {
      // Swipe: move in the dominant direction.
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
      else move(0, dy > 0 ? 1 : -1);
      return;
    }
    if (dist < 12) {
      // Tap: move to an adjacent tile.
      const tile = tileFromEvent(e);
      if (!tile) return;
      const s = stateRef.current;
      const stepX = tile.x - s.player.x;
      const stepY = tile.y - s.player.y;
      if (Math.abs(stepX) + Math.abs(stepY) === 1) move(stepX, stepY);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse') return;
    setHover(tileFromEvent(e));
  };

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="block w-full rounded-xl"
        style={{
          touchAction: 'none',
          aspectRatio: `${state.dungeon.width} / ${state.dungeon.height}`,
          background: '#17120e',
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
        aria-label="One Run dungeon board"
      />
    </div>
  );
}
