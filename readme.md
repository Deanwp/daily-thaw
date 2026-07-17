# Daily Thaw

A once-a-day ice-balancing puzzle for Reddit. Everyone gets the same slippery board
each day and competes on one shared leaderboard.

**Play it:** [r/DailyThaw](https://www.reddit.com/r/DailyThaw/)

---

## What it is

Tilt a bar of ice to roll a frozen penguin up a cave wall and drop it into a glowing
hollow before the clock melts. Five targets, bottom to top. Miss and you land in a
fire vent, lose five seconds, and start the climb again.

The board is generated from the date, so every player on a given day gets the same
holes and the same ice. Your 4/5 and someone else's 4/5 are the same 4/5 — that's
the whole point.

It's a rebuild of *Ice Cold Beer*, a mechanical Taito cabinet from 1983: no screen,
just a wooden playfield, two joysticks, and a ball bearing on a tilting bar.

## How to play

1. Open the post and press **START**.
2. **Tilt the bar** toward the glowing ice cave.
   - **Desktop:** `W` / `S` move the left end, `↑` / `↓` move the right end.
   - **Mobile:** hold either side of the screen. Each thumb is an analog stick — the
     point you touch becomes the pivot, and how far you drag from it sets the speed.
     Small drag for fine placement, full drag for speed. Lift to stop.
3. **Sink the penguin in the lit cave** to clear it and climb to the next of five.
4. **Avoid the fire vents.** Falling in drops you to the bottom and costs 5 seconds.
   The run continues.
5. **Leftover time is banked** and breaks ties.

**Scoring is two keys:** penguins rescued first, banked time second. 3/5 always beats
2/5, however fast the 2/5 was. Your best run of the day is what counts.

## The daily twist

The bar is ice, and the ice changes every day. Five tiers, seeded from the date:
**STIFF, FIRM, GLASSY, SLICK, GREASED**. On a stiff day you can place the penguin.
On a greased day it slides off if you breathe on it. Same holes, different game.

Time scales with the challenge — more seconds on slicker ice and as you climb higher,
from **30 seconds** at the bottom of a stiff day to **70** at the top of a greased one.

## Features

- **Deterministic daily board.** Seeded from the UTC date. A 7×7 stratified hole grid
  with five targets, checked over 60 simulated days for closed edge lanes.
- **Daily leaderboard.** Top five plus your own rank, on a Redis sorted set.
- **Countdown** to tomorrow's board.
- **Share card.** Copies your result as text.
- **Result comments**, capped at one per player per day. Replaying with a better score
  edits your existing comment instead of adding another.
- **Two-thumb analog controls** on mobile, keyboard on desktop.

## How it works

No game engine — hand-written canvas 2D with a fixed-timestep physics loop. That's
deliberate. A shared daily leaderboard only means something if the simulation is
identical everywhere, and a fixed timestep is how you get that.

The board generator and scoring live in one plain TypeScript module that both the
client and the server import. The client draws the board; the server re-derives it to
check submissions. There is exactly one definition of each, so they cannot drift apart.

**What the server decides for itself, and never accepts from the client:**

- **Which day it is.** `today()` reads the server clock. Scores are always filed under
  the server's day.
- **Today's ice tier.** Re-derived with `buildBoard(day)`. This matters: the tier sets
  the ceiling on how much time a run could legitimately have banked, so a client that
  could claim a slicker day would be handing itself a bigger allowance.

**What the server checks on every submission:**

- Scores inside the possible range.
- Banked time no greater than the cleared targets could have yielded, on that day's
  actual ice tier.
- Run duration long enough to be physically possible.
- Rate limit: 60 submissions per player per day.

**Leaderboard.** Both score keys are packed into one number
(`rescues × 10,000,000 + bankedMs`), so "most rescues, fastest as the tiebreak" comes
out of a single Redis range query.

**Canvas.** Locked to a 2:3 aspect and capped at 440px wide. Physics constants are in
pixels while the bar length follows the canvas, so a stretched or oversized canvas
would quietly change how far the ball travels. The lock and the cap keep that from
happening.

## Installing

1. Install the app on your subreddit.
2. As a moderator, open the subreddit menu (**...**) → **"[daily-thaw] New Post"**.
3. Done. There is nothing to configure — the board comes from the date.

**Permissions:**
- `redis` — leaderboards, best scores, rate limiting, comment tracking.
- `reddit` (`SUBMIT_POST`, `SUBMIT_COMMENT` as user) — creating the post, and letting
  players post their own result comment.

## Things worth knowing

- **Day rollover is UTC midnight.** The in-game countdown reflects it. Leaderboard data
  is kept for 14 days.
- **Every post shows the current day's puzzle**, not the day it was created. A post from
  last week still plays today's board and feeds today's leaderboard, so posts never go
  stale — but they also aren't archives.
- **Comment attribution** follows Devvit's rules: result comments post on the player's
  behalf once the app version is approved. Before then they attribute to the app owner.

## Changelog

### 0.0.5 — 2026-07-15
- **Leaderboard scores capped at 150s.** `db.ts` held a second copy of the scoring
  constants. When round timing became tier-aware, that copy kept the old ceiling — so
  validation accepted a 255s run and storage silently clamped it to 150s, and a player's
  score could never improve after their first run of the day. Scoring is now defined once
  and imported.
- **A submitted run of zero seconds scored a perfect game.** The minimum-duration check
  subtracted banked time from itself, which made the minimum always zero. It's now a flat
  floor per cleared target.
- **The one-per-day comment couldn't be updated.** The client held its post state across
  replays, so a better score never reached the upsert the server already supported.
- **The canvas sized itself after the board request resolved**, so the first frames drew
  at the wrong dimensions. It now sizes before the first frame, with a loading state.
- **The canvas could be stretched off 2:3** on short viewports, lengthening the bar
  relative to the playfield and changing how far the ball rolled. Aspect is now locked.
- Control hints now describe the analog sticks instead of the old drag scheme.

### 0.0.x — initial build
Daily deterministic board generator · fixed-timestep physics · five targets with
fire-vent decoys and time penalties · tiered timing · two-key scoring on a Redis sorted
set · daily leaderboard, rank, and countdown · share card · one-per-day result comments ·
server-side validation and rate limiting · analog thumb-sticks and keyboard controls.

## Built with

Devvit Web · TypeScript · Canvas 2D · Redis · a hand-written fixed-timestep physics loop