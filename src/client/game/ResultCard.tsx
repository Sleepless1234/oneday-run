/**
 * The end-of-run result card: score breakdown, rank and leaderboard gaps,
 * streak status, near-miss lines, tomorrow's teaser, and share / discuss
 * actions. This is the hook that pulls players back tomorrow.
 */
import type { DailyModifier } from '../../shared/modifiers';
import type { SubmitResponse } from '../../shared/api';
import { distanceToExit, distanceToSecret, type GameState } from './engine';
import { safeNavigateTo, safeShare } from '../lib/effects';

type Props = {
  state: GameState;
  submit: SubmitResponse | null;
  /** Total players on today's board (from the leaderboard response). */
  totalPlayers: number | null;
  tomorrow: DailyModifier;
  postUrl: string | null;
  shareText: string;
  offline: boolean;
  /** Shown when the run was not submitted and the player is not offline. */
  note: string | null;
};

export function ResultCard({
  state,
  submit,
  totalPlayers,
  tomorrow,
  postUrl,
  shareText,
  offline,
  note,
}: Props) {
  const won = state.phase === 'won';
  const { breakdown } = state;

  const rows: { label: string; value: number }[] = [
    { label: 'Monsters slain', value: breakdown.kills },
    { label: 'Coins', value: breakdown.coins },
    { label: 'Combo bonus', value: breakdown.combo },
    { label: 'Escape bonus', value: breakdown.escape },
    { label: 'Health bonus', value: breakdown.hp },
    { label: 'Speed bonus', value: breakdown.turns },
  ].filter((row) => row.value !== 0);

  const stepsFromExit = won ? null : distanceToExit(state);
  const secretDist = state.secretRevealed ? null : distanceToSecret(state);
  const hasSecret = state.dungeon.secret !== null;

  return (
    <div className="w-full">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-[#f4e3c8]">
          {won ? 'You escaped the dungeon!' : 'The dungeon wins today.'}
        </h2>
        {!won && state.diedTo && (
          <p className="mt-1 text-sm text-[#c9b18c]">Slain by a {state.diedTo.toLowerCase()}.</p>
        )}
        <div className="mt-3 text-[11px] font-semibold tracking-widest text-[#c9b18c]">
          FINAL SCORE
        </div>
        <div className="text-5xl font-extrabold text-[#f5b942] tabular-nums">{state.score}</div>
      </div>

      <div className="mt-4 rounded-xl bg-[#241b13] px-4 py-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between py-1 text-sm text-[#f4e3c8]"
          >
            <span>{row.label}</span>
            <span className="font-bold tabular-nums">+{row.value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-[#3a2b1c] pt-2 text-sm font-bold text-[#f4e3c8]">
          <span>Turns</span>
          <span className="tabular-nums">{state.turns}</span>
        </div>
        {state.maxCombo >= 2 && (
          <div className="flex items-center justify-between pt-1 text-sm text-[#f4e3c8]">
            <span>Best combo</span>
            <span className="font-bold">×{state.maxCombo}</span>
          </div>
        )}
      </div>

      {submit && submit.accepted && submit.rank !== null && (
        <div className="mt-3 rounded-xl bg-[#241b13] px-4 py-3 text-center">
          <div className="text-lg font-extrabold text-[#f4e3c8]">
            #{submit.rank}
            {totalPlayers !== null && ` of ${totalPlayers}`} today
          </div>
          {submit.rank === 1 ? (
            <p className="mt-0.5 text-sm text-[#f5b942]">You lead today&apos;s board.</p>
          ) : (
            <p className="mt-0.5 text-sm text-[#c9b18c]">
              {submit.behindLeader !== null && `${submit.behindLeader} pts behind #1`}
              {submit.behindLeader !== null &&
                submit.behindNext !== null &&
                submit.behindNext > 0 &&
                ` · ${submit.behindNext} pts behind the next player`}
            </p>
          )}
          <p className="mt-1.5 text-sm text-[#f4e3c8]">
            {submit.streak > 1 ? (
              <>
                <span className="font-extrabold text-[#f5b942]">{submit.streak}-day streak.</span>{' '}
                Come back tomorrow to keep it alive.
              </>
            ) : (
              <>
                <span className="font-extrabold text-[#f5b942]">Streak started — day 1.</span>{' '}
                Come back tomorrow to keep it alive.
              </>
            )}
          </p>
        </div>
      )}

      {submit && !submit.accepted && (
        <p className="mt-3 rounded-xl bg-[#241b13] px-4 py-3 text-center text-sm text-[#c9b18c]">
          {submit.message ?? 'This run could not be recorded on the leaderboard.'}
        </p>
      )}

      {offline && (
        <p className="mt-3 rounded-xl bg-[#241b13] px-4 py-3 text-center text-sm text-[#c9b18c]">
          Practice run — open this post on Reddit to join today&apos;s leaderboard.
        </p>
      )}

      {!offline && !submit && note && (
        <p className="mt-3 rounded-xl bg-[#241b13] px-4 py-3 text-center text-sm text-[#c9b18c]">
          {note}
        </p>
      )}

      <div className="mt-3 space-y-1.5 text-center text-sm text-[#c9b18c]">
        {stepsFromExit !== null && (
          <p>
            You fell{' '}
            <span className="font-bold text-[#f4e3c8]">
              {stepsFromExit} step{stepsFromExit === 1 ? '' : 's'}
            </span>{' '}
            from the golden stairs.
          </p>
        )}
        {hasSecret && state.secretRevealed && (
          <p>
            You found the <span className="font-bold text-[#f5b942]">secret room</span>. Well
            explored.
          </p>
        )}
        {hasSecret && !state.secretRevealed && secretDist !== null && (
          <p>
            A secret room hid{' '}
            <span className="font-bold text-[#f4e3c8]">
              {secretDist} step{secretDist === 1 ? '' : 's'}
            </span>{' '}
            away.
          </p>
        )}
        {hasSecret && !state.secretRevealed && secretDist === null && (
          <p>A secret room stayed hidden somewhere in the dark.</p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-[#3a2b1c] bg-[#241b13] px-4 py-3 text-center">
        <div className="text-[11px] font-semibold tracking-widest text-[#c9b18c]">
          TOMORROW&apos;S TWIST
        </div>
        <div className="mt-1 text-base font-extrabold text-[#f5b942]">{tomorrow.name}</div>
        <p className="mt-0.5 text-sm text-[#c9b18c]">{tomorrow.description}</p>
        <p className="mt-2 text-xs text-[#8a7355]">One run per day — a fresh dungeon every morning.</p>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          className="w-full rounded-xl bg-[#f5b942] py-3 text-base font-extrabold text-[#17120e] shadow-[0_2px_0_#8a6414] transition active:translate-y-px"
          onClick={() => void safeShare(shareText)}
        >
          Share my result
        </button>
        {postUrl && (
          <button
            type="button"
            className="w-full rounded-xl bg-[#3a2b1c] py-3 text-base font-bold text-[#f4e3c8] shadow-[0_2px_0_#17120e] transition active:translate-y-px"
            onClick={() => safeNavigateTo(postUrl)}
          >
            Discuss in the comments
          </button>
        )}
      </div>
    </div>
  );
}
