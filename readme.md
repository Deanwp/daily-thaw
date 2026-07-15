# Daily Thaw

A once-a-day ice-balancing puzzle for Reddit communities. Everyone gets the same
slippery board each day and competes on one shared leaderboard.

## What it does

Daily Thaw is a precision puzzle game built on Reddit's Developer Platform. Each
day, a new board is generated from the date — the same holes, the same ice, for
everyone. Your job is to carry a frozen penguin up the playfield and drop it into
a glowing ice cave before the clock runs out.

It's inspired by *Ice Cold Beer*, a mechanical arcade cabinet Taito built in 1983:
no screen, just a wooden playfield, two joysticks, and a ball bearing rolling on a
tilting bar. Daily Thaw rebuilds that mechanic for Reddit, with a penguin sealed
in a ball of ice instead of a steel bearing.

**Who it's for:** anyone who likes a short daily challenge with a shared
scoreboard — the Wordle loop, but with physics. One board a day, everyone solving
the same puzzle, results posted to the comments.

## How to play

1. Open the post and press **START**.
2. **Tilt the bar** to roll the penguin toward the glowing ice cave (the lit target).
   - **Desktop:** `W` / `S` move the left end, `↑` / `↓` move the right end.
   - **Mobile:** touch and hold either half of the screen. Each thumb is an analog
     stick — drag up or down from where you touched. A small drag moves the bar
     slowly (for fine placement); a bigger drag moves it faster.
3. **Sink the penguin in the glowing cave** to clear the target. You climb to the
   next of five, each higher and harder than the last.
4. **Avoid the fire vents** (the dark holes). Falling in drops the penguin back to
   the bottom and costs you 5 seconds — but the run continues.
5. **Leftover time is banked.** Clearing targets fast builds your tiebreak score.
6. When the clock runs out, the run ends. Your best score of the day is kept.

**Scoring:** penguins rescued comes first; banked time breaks ties. So 3/5 always
beats 2/5, no matter how fast the 2/5 was.

## The daily twist

The bar is ice, and every day the ice has a different **slipperiness tier (1–5)**,
seeded from the date. A "stiff" day lets you place the penguin precisely. A
"greased" day sends it sliding across the bar with almost no grip. Same holes,
completely different feel.

Time scales to match: each target gets more seconds on slicker ice and as you
climb higher (30 seconds up to 70), so a brutal board stays fair.

## Features

- **Daily deterministic board** — seeded from the UTC date, identical for everyone.
- **Daily leaderboard** — top 5 plus your own rank, stored in Redis.
- **Countdown** to the next day's board.
- **Share card** — copies your result as text for sharing anywhere.
- **Post to comments** — posts your result as a comment, capped at **one per day**
  per player. Replaying edits your existing comment instead of adding a new one.
- **Cross-platform controls** — keyboard on desktop, analog thumb-sticks on mobile.

## Operational notes

- **The server owns the clock and the ice tier.** Boards are re-derived
  server-side, so a modified client can't change the puzzle or claim extra time.
- **Scores are validated server-side** against sanity limits (impossible scores,
  impossible banked time, impossible run length are rejected). Rate limited to 60
  submissions per player per day.
- **Best score per day is kept** — replaying can only improve your entry, never
  lower it.
- **Day rollover is UTC midnight.** The countdown in-game reflects this.
- **Comment attribution:** posting a result comment runs on behalf of the player.
  On unapproved/playtest versions this attributes to the app owner instead — this
  is documented Devvit behavior and resolves once the app version is approved.

## How to install and configure

1. Install the app on your subreddit from the app directory.
2. As a moderator, open the subreddit menu (**...**) and choose
   **"[daily-thaw] New Post"** to create a game post.
3. That's it — no settings to configure. The board generates itself from the date.

Each post is a live window to the current day's puzzle. Everyone who plays on the
same day gets the same board and shares the same leaderboard.

**Permissions used:**
- `redis` — leaderboards, best scores, rate limiting, comment tracking.
- `reddit` (`SUBMIT_POST`, `SUBMIT_COMMENT` as user) — creating the game post, and
  letting players post their daily result as their own comment.

## Changelog

### 0.1.0 — initial submission
- Daily deterministic board generator (7×7 stratified hole grid, 5 ice tiers).
- Fixed-timestep physics, no game engine — identical simulation on every device.
- Five targets per run, bottom-to-top, with fire-vent decoys and time penalties.
- Tiered timing: 30s base, +5s per ice tier, +5s per target.
- Two-key scoring (rescues first, banked time as tiebreak) on a Redis sorted set.
- Daily leaderboard with player rank and countdown to the next board.
- Share card and one-per-day result comments with upsert on replay.
- Server-authoritative validation and rate limiting.
- Analog thumb-stick controls for mobile, keyboard for desktop.

## Known limitations

Stated up front rather than hidden:
- **Anti-cheat is sanity-check tier**, not full server-side replay. It rejects
  impossible runs but a determined cheater with a modified client could submit a
  plausible-but-false score. Deterministic physics makes full replay validation a
  natural next step.
- **Board solvability is verified by a corridor check**, not a full pathfind.
  Across 60 simulated days it never produced an unsolvable board, but we haven't
  formally proven every possible seed is solvable.

## Built with

Devvit Web · TypeScript · Canvas 2D · Redis · custom fixed-timestep physics