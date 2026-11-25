import { useCallback, useEffect, useRef, useState } from 'react';
import { generateDailyDungeon } from '../shared/dungeon';
import { modifierForDay, modifierForTomorrow } from '../shared/modifiers';
import { dayNumber, todayKey } from '../shared/seed';
import type {
  InitResponse,
  LeaderboardEntry,
  LeaderboardResponse,
  SubmitRequest,
  SubmitResponse,
} from '../shared/api';
import { createGame, tryMove, lanternBlast, waitTurn, type GameState } from './game/engine';
import { DungeonCanvas } from './game/DungeonCanvas';
import { DPad } from './game/DPad';
import { Hud } from './game/Hud';
import { Leaderboard } from './game/Leaderboard';
import { ResultCard } from './game/ResultCard';

type Screen = 'loading' | 'start' | 'playing' | 'result';

export const App = () => {
  const [screen, setScreen] = useState<Screen>('loading');
  const [init, setInit] = useState<InitResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [game, setGame] = useState<GameState | null>(null);
  const [submit, setSubmit] = useState<SubmitResponse | null>(null);
  const submittedRef = useRef(false);

  // The client always knows today's dungeon: the seed is just the UTC date.
  // The server only adds identity, the leaderboard and streaks.
  const date = init?.date ?? todayKey();
  const dayNum = init?.dayNumber ?? dayNumber(date);
  const modifier = modifierForDay(date);
  const tomorrow = modifierForTomorrow(date);

  // Load init + leaderboard. If the server is unreachable (local dev),
  // fall back to offline practice mode: fully playable, no submission.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: InitResponse = await res.json();
        if (data.type !== 'init') throw new Error('Unexpected response');
        if (cancelled) return;
        setInit(data);
        setTotalPlayers(data.todayPlayers);
        setScreen('start');
        try {
          const lbRes = await fetch('/api/leaderboard');
          if (lbRes.ok) {
            const lb: LeaderboardResponse = await lbRes.json();
            if (!cancelled && lb.type === 'leaderboard') {
              setEntries(lb.entries);
              setTotalPlayers(lb.totalPlayers);
            }
          }
        } catch {
          // The leaderboard is optional on the start screen.
        }
      } catch {
        if (cancelled) return;
        setOffline(true);
        setScreen('start');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const startRun = useCallback(() => {
    submittedRef.current = false;
    setSubmit(null);
    setGame(createGame(generateDailyDungeon(date), modifier));
    setScreen('playing');
  }, [date, modifier]);

  const handleMove = useCallback((dx: number, dy: number) => {
    setGame((g) => (g ? tryMove(g, dx, dy) : g));
  }, []);
  const handleWait = useCallback(() => {
    setGame((g) => (g ? waitTurn(g) : g));
  }, []);
  const handleBlast = useCallback(() => {
    setGame((g) => (g ? lanternBlast(g) : g));
  }, []);

  // When the run ends: submit once, refresh the leaderboard, then show
  // the result card after a short beat so the final board is visible.
  useEffect(() => {
    if (!game || game.phase === 'playing' || screen !== 'playing') return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    const submitRun = async () => {
      if (!offline && init?.username) {
        try {
          const body: SubmitRequest = {
            date,
            score: game.score,
            kills: game.kills,
            coins: game.coins,
            escaped: game.phase === 'won',
            diedTo: game.diedTo,
            turns: game.turns,
            durationMs: Date.now() - game.startedAt,
            foundSecret: game.secretRevealed,
            maxCombo: game.maxCombo,
          };
          const res = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (res.ok) {
            const data: SubmitResponse = await res.json();
            setSubmit(data);
          }
        } catch {
          // The result screen still shows, just without a rank.
        }
        try {
          const lbRes = await fetch('/api/leaderboard');
          if (lbRes.ok) {
            const lb: LeaderboardResponse = await lbRes.json();
            if (lb.type === 'leaderboard') {
              setEntries(lb.entries);
              setTotalPlayers(lb.totalPlayers);
            }
          }
        } catch {
          // Ignore — the board below the result card is best-effort.
        }
      }
    };
    void submitRun();
    const timer = window.setTimeout(() => setScreen('result'), 900);
    return () => window.clearTimeout(timer);
  }, [game, screen, offline, init, date]);

  const lastEvent =
    game && game.events.length > 0
      ? (game.events[game.events.length - 1]?.text ?? '')
      : 'Reach the golden stairs. One life — make it count.';

  const shareText = game
    ? `One Run — Day ${dayNum}: I ${game.phase === 'won' ? 'escaped the dungeon' : 'fell in the dungeon'} with ${game.score} pts${submit?.rank ? ` (#${submit.rank} today)` : ''}.${submit && submit.streak > 1 ? ` ${submit.streak}-day streak.` : ''} One run a day — can you beat it?`
    : '';

  const shell = 'min-h-screen bg-[#17120e] text-[#f4e3c8]';
  const wrap = 'mx-auto w-full max-w-[520px] px-4';

  if (screen === 'loading') {
    return (
      <div className={`${shell} flex items-center justify-center`}>
        <p className="animate-pulse text-sm font-semibold tracking-widest text-[#c9b18c]">
          LIGHTING THE LANTERN…
        </p>
      </div>
    );
  }

  if (screen === 'start') {
    const playedToday = init?.playedToday ?? false;
    const myRun = init?.myRun ?? null;
    return (
      <div className={shell}>
        <div className={`${wrap} py-6`}>
          <div className="text-center">
            <div className="text-[11px] font-bold tracking-[0.3em] text-[#f5b942]">
              DAY {dayNum}
            </div>
            <h1 className="mt-1 text-4xl font-extrabold tracking-tight">ONE RUN</h1>
            <p className="mt-1 text-sm text-[#c9b18c]">
              One dungeon. One life. One run a day.
            </p>
          </div>

          <div className="mt-5 rounded-xl border border-[#3a2b1c] bg-[#241b13] px-4 py-3">
            <div className="text-[11px] font-semibold tracking-widest text-[#c9b18c]">
              TODAY&apos;S TWIST
            </div>
            <div className="mt-1 text-lg font-extrabold text-[#f5b942]">{modifier.name}</div>
            <p className="mt-0.5 text-sm text-[#c9b18c]">{modifier.description}</p>
          </div>

          {playedToday && myRun ? (
            <div className="mt-4">
              <div className="rounded-xl bg-[#241b13] px-4 py-4 text-center">
                <div className="text-base font-extrabold">
                  {myRun.escaped ? 'You escaped today.' : 'You fell today.'}
                </div>
                <div className="mt-1 text-3xl font-extrabold text-[#f5b942] tabular-nums">
                  {myRun.score} pts
                </div>
                <p className="mt-1 text-sm text-[#c9b18c]">
                  {init?.myRank !== null && init?.myRank !== undefined
                    ? `#${init.myRank} today`
                    : 'Not on the board'}
                  {init && init.streak > 0 && ` · ${init.streak}-day streak`}
                </p>
                <p className="mt-2 text-xs text-[#8a7355]">
                  Your run is spent — a fresh dungeon arrives tomorrow.
                </p>
              </div>
              <div className="mt-4">
                <h2 className="mb-1 text-sm font-extrabold tracking-widest text-[#c9b18c]">
                  TODAY&apos;S BOARD
                </h2>
                <Leaderboard entries={entries} username={init?.username ?? null} />
              </div>
              <div className="mt-4 rounded-xl border border-[#3a2b1c] bg-[#241b13] px-4 py-3 text-center">
                <div className="text-[11px] font-semibold tracking-widest text-[#c9b18c]">
                  TOMORROW&apos;S TWIST
                </div>
                <div className="mt-1 text-base font-extrabold text-[#f5b942]">
                  {tomorrow.name}
                </div>
                <p className="mt-0.5 text-sm text-[#c9b18c]">{tomorrow.description}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="rounded-xl bg-[#241b13] px-4 py-3 text-sm leading-relaxed text-[#f4e3c8]">
                <p>
                  <span className="font-bold text-[#f5b942]">Move</span> with arrows, WASD,
                  swipe, or tap a tile.
                </p>
                <p className="mt-1">
                  <span className="font-bold text-[#f5b942]">Bump</span> enemies to fight.
                  Grab coins, hearts, and the sword.
                </p>
                <p className="mt-1">
                  <span className="font-bold text-[#f5b942]">Escape</span> down the golden
                  stairs. One life — death ends the run.
                </p>
              </div>
              {init && init.streak > 0 && (
                <p className="mt-3 text-center text-sm text-[#f4e3c8]">
                  <span className="font-extrabold text-[#f5b942]">
                    {init.streak}-day streak.
                  </span>{' '}
                  Play today to keep it alive.
                </p>
              )}
              {offline && (
                <p className="mt-3 rounded-xl bg-[#241b13] px-4 py-2 text-center text-xs text-[#c9b18c]">
                  Practice mode — the leaderboard is unavailable offline.
                </p>
              )}
              <button
                type="button"
                className="mt-4 w-full rounded-xl bg-[#f5b942] py-3.5 text-lg font-extrabold text-[#17120e] shadow-[0_2px_0_#8a6414] transition active:translate-y-px"
                onClick={startRun}
              >
                Enter the dungeon
              </button>
              <div className="mt-5">
                <h2 className="mb-1 flex items-baseline justify-between text-sm font-extrabold tracking-widest text-[#c9b18c]">
                  <span>TODAY&apos;S BOARD</span>
                  {totalPlayers > 0 && (
                    <span className="text-xs font-semibold normal-case tracking-normal">
                      {totalPlayers} {totalPlayers === 1 ? 'player' : 'players'}
                    </span>
                  )}
                </h2>
                <Leaderboard entries={entries} username={init?.username ?? null} limit={5} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'playing' && game) {
    const playing = game.phase === 'playing';
    return (
      <div className={shell}>
        <div className={`${wrap} py-4`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[0.25em] text-[#f5b942]">
              DAY {dayNum}
            </span>
            <span className="rounded-full bg-[#241b13] px-2.5 py-1 text-[11px] font-bold text-[#c9b18c]">
              {modifier.name}
            </span>
          </div>
          <Hud state={game} />
          <div className="mt-3">
            <DungeonCanvas
              state={game}
              interactive={playing}
              onMove={handleMove}
              onWait={handleWait}
              onBlast={handleBlast}
            />
          </div>
          <p className="mt-2 min-h-[1.25rem] text-center text-sm text-[#c9b18c]">{lastEvent}</p>
          <div className="mt-3 flex items-start justify-center gap-4">
            <DPad onMove={handleMove} onWait={handleWait} disabled={!playing} />
            <div className="flex w-[120px] flex-col gap-2 pt-1">
              <button
                type="button"
                className="rounded-xl bg-[#f5b942] px-3 py-3 text-sm font-extrabold text-[#17120e] shadow-[0_2px_0_#8a6414] transition active:translate-y-px disabled:opacity-40 disabled:pointer-events-none"
                disabled={!playing || game.player.blasts <= 0}
                onClick={handleBlast}
              >
                Lantern Blast
                <span className="block text-[11px] font-bold opacity-80">
                  {game.player.blasts > 0
                    ? `${game.player.blasts} left · hits all adjacent`
                    : 'none left'}
                </span>
              </button>
              <p className="text-center text-[11px] leading-snug text-[#8a7355]">
                Cracked walls hide secrets. Listen for the glint.
              </p>
            </div>
          </div>
          <p className="mt-3 hidden text-center text-[11px] text-[#8a7355] sm:block">
            Arrows / WASD move · Space waits · F blasts
          </p>
        </div>
      </div>
    );
  }

  // Result screen.
  if (screen === 'result' && game) {
    const note =
      !offline && !init?.username
        ? 'Sign in to Reddit to record your run on the leaderboard.'
        : null;
    return (
      <div className={shell}>
        <div className={`${wrap} py-6`}>
          <ResultCard
            state={game}
            submit={submit}
            totalPlayers={totalPlayers > 0 ? totalPlayers : null}
            tomorrow={tomorrow}
            postUrl={init?.postUrl ?? null}
            shareText={shareText}
            offline={offline}
            note={note}
          />
          <div className="mt-6">
            <h2 className="mb-1 text-sm font-extrabold tracking-widest text-[#c9b18c]">
              TODAY&apos;S BOARD
            </h2>
            <Leaderboard entries={entries} username={init?.username ?? null} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shell} flex items-center justify-center`}>
      <p className="text-sm font-semibold text-[#c9b18c]">Something went wrong — reload to try again.</p>
    </div>
  );
};
