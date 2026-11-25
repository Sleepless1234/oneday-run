/**
 * Inline splash — the feed view. It must do no network I/O and stay light:
 * everything here is computed from the local UTC date (the daily twist is
 * a pure function of the day). Tapping expands into the game.
 */
import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { modifierForDay } from '../shared/modifiers';
import { dayNumber, todayKey } from '../shared/seed';

export const Splash = () => {
  const date = todayKey();
  const modifier = modifierForDay(date);
  const username = context.username;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#17120e] px-6 py-8 text-center text-[#f4e3c8]">
      <div className="text-[11px] font-bold tracking-[0.3em] text-[#f5b942]">
        DAY {dayNumber(date)}
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight">ONE RUN</h1>
      <p className="text-sm text-[#c9b18c]">One dungeon. One life. One run a day.</p>

      <div className="w-full max-w-[340px] rounded-xl border border-[#3a2b1c] bg-[#241b13] px-4 py-3">
        <div className="text-[11px] font-semibold tracking-widest text-[#c9b18c]">
          TODAY&apos;S TWIST
        </div>
        <div className="mt-1 text-lg font-extrabold text-[#f5b942]">{modifier.name}</div>
        <p className="mt-0.5 text-sm text-[#c9b18c]">{modifier.tagline}</p>
      </div>

      <button
        type="button"
        className="w-full max-w-[340px] rounded-xl bg-[#f5b942] py-3.5 text-lg font-extrabold text-[#17120e] shadow-[0_2px_0_#8a6414] transition active:translate-y-px"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        {username ? `Play today's dungeon, ${username}` : "Play today's dungeon"}
      </button>
      <p className="text-xs text-[#8a7355]">
        Same dungeon for everyone today. Beat the board — or fall trying.
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
