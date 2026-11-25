/**
 * In-game HUD: HP hearts, score, coins, kills, combo, turn count and
 * Lantern Blast charges. Compact two-row layout, mobile-first.
 */
import type { GameState } from './engine';

function HeartPip({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21 C5 15.5 2.5 11.5 2.5 8.2 C2.5 5.2 4.8 3 7.6 3 C9.3 3 11 3.9 12 5.4 C13 3.9 14.7 3 16.4 3 C19.2 3 21.5 5.2 21.5 8.2 C21.5 11.5 19 15.5 12 21 Z"
        fill={filled ? '#e5484d' : 'none'}
        stroke={filled ? '#e5484d' : '#5d4630'}
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LanternIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 3 h6 M12 3 v2 M8 7 h8 l1 4 -1 8 H8 l-1 -8 Z"
        fill="none"
        stroke="#f5b942"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="2.4" fill="#f5b942" />
    </svg>
  );
}

export function Hud({ state }: { state: GameState }) {
  const { player, score, coins, kills, combo, turns } = state;
  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex gap-1" aria-label={`${player.hp} of ${player.maxHp} health`}>
            {Array.from({ length: player.maxHp }, (_, i) => (
              <HeartPip key={i} filled={i < player.hp} />
            ))}
          </div>
          <div className="mt-1.5 text-[11px] font-semibold tracking-wide text-[#c9b18c]">
            ATK {player.attack}
            <span className="mx-2 text-[#5d4630]">|</span>
            <span className="inline-flex items-center gap-1 align-middle">
              <LanternIcon /> ×{player.blasts}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold tracking-widest text-[#c9b18c]">SCORE</div>
          <div className="text-3xl font-extrabold leading-none text-[#f4e3c8] tabular-nums">
            {score}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[12px] font-medium text-[#c9b18c]">
        <span>
          <span className="text-[#f2c14e]">●</span> {coins} coins
        </span>
        <span>{kills} slain</span>
        <span>Turn {turns}</span>
        {combo >= 2 && (
          <span className="ml-auto rounded-full bg-[#f5b942] px-2.5 py-0.5 text-[11px] font-extrabold text-[#17120e]">
            COMBO ×{combo}
          </span>
        )}
      </div>
    </div>
  );
}
