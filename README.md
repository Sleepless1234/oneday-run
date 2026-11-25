# One Run

**One dungeon. One life. One run a day.**

One Run is a daily seeded micro-roguelike for the [Reddit Game of the Day
Hackathon](https://devpost.com/) (Devpost, submissions close 9 Dec 2026).
Every player on Reddit plays the **same tiny dungeon** on the same day,
generated from the UTC date. You get one life and one scored run per day:
fight or sneak past the monsters, grab the gold, find the secret room, and
reach the golden stairs. Your score lands on the day's leaderboard, and
playing every day builds a streak.

Built with Devvit Web (React 19 + Tailwind + Hono + Redis). All code and
art are original; the dungeon is drawn procedurally on canvas — no image
assets, no Snoo, no karma jokes.

## How to play

- **Move** with arrow keys / WASD, swipe, tap an adjacent tile, or the
  on-screen D-pad.
- **Bump into an enemy to attack it.** Enemies act after every move.
  Slimes wander, bats dart around, skeletons chase you, and a brute guards
  the exit room.
- **Pick up** coins (+score), hearts (+3 HP), and the sword (+1 attack).
- **Lantern Blast** (F key or button): one charge per run, hits every
  adjacent enemy for 3 damage. Spend it wisely.
- **Cracked walls** hide a secret room — bump one to break it open.
- **Reach the golden stairs to escape.** Death ends the run, and the run
  is spent for the day.

Scoring rewards skill: kills, coins, kill-combos (kills chained within 3
turns), escape bonus, remaining-HP bonus, and a speed bonus. Because
everyone plays the same dungeon, the leaderboard reflects mastery, not luck.

## The daily twist

Each weekday has a fixed modifier, so players always know what today
brings — and the result card teases tomorrow's:

| Day | Twist |
| --- | ----- |
| Monday | **Gold Rush** — extra coins, each worth 75 |
| Tuesday | **Slime Tide** — extra slimes, each worth 40 |
| Wednesday | **Glass Heart** — start with 6 HP, kills pay double |
| Thursday | **Second Wind** — two Lantern Blasts |
| Friday | **Greed** — coins worth 100, but no hearts spawn |
| Saturday | **Bat Swarm** — extra bats, each worth 40 |
| Sunday | **Iron Will** — start with 3 attack, no sword spawns |

## Architecture

```
src/shared/   Dungeon generator + solver, daily modifiers, scoring, API types
              (shared by client and server so the server can re-verify runs)
src/client/   React app: start screen, canvas board, HUD, D-pad, result card
              game.tsx  — expanded view (the game)
              splash.tsx — inline feed view (no network, pure date teaser)
src/server/   Hono server: /api/init, /api/leaderboard, /api/submit,
              menu post-create, on-install trigger, daily-post scheduler
```

**Seed = UTC date.** The client generates the dungeon locally from the
date; the server regenerates the same dungeon to validate submissions.
Every generated dungeon is verified solvable by a least-damage solver
before it can ship (see Tests).

**Redis keys:** `onerun:lb:{date}` (sorted set, the board),
`onerun:run:{date}:{user}` (run summary JSON),
`onerun:streak:{user}` (streak JSON). Daily keys expire after 7 days.

**Submission validation:** the server rejects scores above the
dungeon's theoretical maximum, kills/coins above the dungeon's totals,
contradictory fields (escaped *and* died), wrong dates, and duplicate
submissions. One submission per user per day.

**Daily post:** a scheduler task (`5 0 * * *`, 00:05 UTC) creates the
day's post via `/internal/scheduler/daily-post`. Moderators can also post
manually from the subreddit menu ("Post today's dungeon"), and installing
the app creates the first post.

## Local development

Requires Node ≥ 24.

```bash
npm install
npm run test:unit    # vitest — dungeon, engine, UI smoke tests
npm run test:types   # tsc --build
npm run lint         # eslint
npm run build        # vite build -> dist/client + dist/server
```

**Play it locally (offline practice mode):** the game is fully playable
without a server — `/api/init` fails, and the app falls back to practice
mode (no leaderboard or streaks):

```bash
npm run build
npx vite preview --port 4173   # then open http://localhost:4173/game.html
```

The Hono server cannot run standalone: it needs the Devvit runtime for
`context`, `redis`, and `reddit`. Server behavior is verified by code
review against the installed Devvit SDK types, not by a live run.

## Wiring into Devvit (once, when ready to playtest)

The Reddit account already exists (**u/robbie_2083**). This project is a
complete scaffold — it still needs to be registered as a Devvit app:

1. `npm run login` — sign the CLI in as u/robbie_2083 (interactive
   browser OAuth).
2. In a **separate empty directory**, run `devvit new` and pick the React
   template with app slug `one-run`. **The slug is permanent — choose
   carefully.** This creates the app and (for playtest) a subreddit.
3. Copy this project's files over the scaffolded project (`src/`,
   `devvit.json`, `package.json`, `vite.config.ts`, `tools/`, `tsconfig.json`,
   `vitest.config.ts`), then `npm install`.
4. `npm run dev` (`devvit playtest`) — live development on Reddit.
5. `npm run deploy` — typecheck + lint + `devvit upload`. After every
   upload, click **Update** under My Installations or the old version
   keeps serving.
6. **Do not publish the app.** The hackathon only needs an uploaded,
   playtestable app; keep it private.

For the Devpost submission you need the app listing link
(`developers.reddit.com/apps/oneday-run`) and a demo post in a subreddit
with fewer than 200 members (or a private subreddit with
`dr-admin-approve` installed).

## Tests

- `src/shared/dungeon.test.ts` — every daily dungeon for 120 consecutive
  days is solvable and well-formed (exit reachable, teaching guarantees,
  secret room present); the solver rejects a walled-off exit; the weekly
  modifier rotation is distinct and repeats by weekday.
- `src/client/game/engine.test.ts` — a headless bot plays full games
  across 30 days (wins a majority — the game is winnable by reasonable
  play), score always equals its breakdown, blocked moves cost no turn,
  and the run ends exactly once.
- `src/client/game.smoke.test.tsx` — mounts the real app in jsdom and
  walks start → play with keyboard and button input.

## What's still missing

- **Live playtest on Reddit** (`devvit playtest` + `devvit upload`) —
  needs the interactive CLI login, which requires a human in the browser.
- **Scheduler verification** — confirm the 00:05 UTC daily post actually
  fires after upload (config is schema-valid, but untested live).
- **Current-edition rules check** — verify the live `/rules` page before
  submitting (multiple submissions, one prize per project, port-lane
  wording). The build was designed against the published Feb 2026 rules.
- **Devpost submission** — Devpost account `soundstream1980` exists;
  the submission still needs the app link, demo post, and description.
  A <1 min video is optional.

## License

BSD-3-Clause. Built from the official Devvit React template; all game
code, dungeon generation, and canvas art are original to this project.
