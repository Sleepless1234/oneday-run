/**
 * API contract between the One Run client and server.
 * All dates are UTC `YYYY-MM-DD` day keys.
 */

export type RunSummary = {
  score: number;
  kills: number;
  coins: number;
  escaped: boolean;
  /** Label of the enemy that killed the player, or null if escaped. */
  diedTo: string | null;
  turns: number;
  foundSecret: boolean;
  /** Best combo chain in the run. */
  maxCombo: number;
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
  escaped: boolean;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  postUrl: string;
  username: string | null;
  /** Today's UTC day key. */
  date: string;
  dayNumber: number;
  modifierId: string;
  modifierName: string;
  modifierTagline: string;
  /** Tomorrow's modifier (teaser for the result card). */
  tomorrowModifierName: string;
  tomorrowModifierTagline: string;
  playedToday: boolean;
  streak: number;
  todayPlayers: number;
  myRun: RunSummary | null;
  myRank: number | null;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  date: string;
  entries: LeaderboardEntry[];
  totalPlayers: number;
  myRank: number | null;
  myScore: number | null;
};

export type SubmitRequest = {
  date: string;
  score: number;
  kills: number;
  coins: number;
  escaped: boolean;
  diedTo: string | null;
  turns: number;
  durationMs: number;
  foundSecret: boolean;
  maxCombo: number;
};

export type SubmitResponse = {
  type: 'submit';
  accepted: boolean;
  /** 1-based rank, or null if not on the board. */
  rank: number | null;
  streak: number;
  /** Points behind the #1 player (0 if the player is #1). */
  behindLeader: number | null;
  /** Points behind the player directly above (null if #1 or unranked). */
  behindNext: number | null;
  message?: string;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
