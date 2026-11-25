/**
 * Today's leaderboard: rank, name, escaped/fell badge, score. The current
 * player's row is highlighted.
 */
import type { LeaderboardEntry } from '../../shared/api';

type Props = {
  entries: LeaderboardEntry[];
  username: string | null;
  limit?: number;
};

const RANK_COLORS = ['#f5b942', '#d7dde3', '#d97b2f'];

export function Leaderboard({ entries, username, limit }: Props) {
  const shown = limit !== undefined ? entries.slice(0, limit) : entries;
  if (shown.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[#c9b18c]">
        No runs yet today — be the first into the dungeon.
      </p>
    );
  }
  return (
    <ol className="w-full divide-y divide-[#3a2b1c]">
      {shown.map((entry) => {
        const isYou = username !== null && entry.username === username;
        const rankColor = RANK_COLORS[entry.rank - 1] ?? '#c9b18c';
        return (
          <li
            key={entry.username}
            className={`flex items-center gap-3 px-2 py-2 ${
              isYou ? 'rounded-lg bg-[#3a2b1c]' : ''
            }`}
          >
            <span
              className="w-6 shrink-0 text-center text-sm font-extrabold tabular-nums"
              style={{ color: rankColor }}
            >
              {entry.rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#f4e3c8]">
              {entry.username}
              {isYou && <span className="ml-1.5 text-[#f5b942]">(you)</span>}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                entry.escaped
                  ? 'bg-[#2e4a2a] text-[#a8dba0]'
                  : 'bg-[#4a2a2a] text-[#e8a0a0]'
              }`}
            >
              {entry.escaped ? 'ESCAPED' : 'FELL'}
            </span>
            <span className="w-14 shrink-0 text-right text-sm font-extrabold text-[#f4e3c8] tabular-nums">
              {entry.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
