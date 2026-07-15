/**
 * ⚠️  BOARD GENERATOR — LOCKED FOR SUBMISSION (2026-07-13)
 *
 * Every constant below determines the daily board. Changing ANY of them
 * regenerates all past and future boards, which breaks daily consistency and
 * makes historical leaderboard scores incomparable.
 *
 * DO NOT EDIT after launch. If a change is truly required pre-launch, bump a
 * version and reset all `lb:*` / `u:*` Redis keys so no stale scores remain.
 *
 * Locked values, verified over 60 simulated days:
 *   ICE_TIERS  friction per tier (tier 5 = 7.4x slick)
 *   COLS/ROWS  7x7 stratified grid  (edge lanes closed, ~52 holes)
 *   MIN_D      0.064  (targets never smothered)
 *   ROUND_TIME 30s base + 5s/tier + 5s/target
 */
/**
 * Shared board generator — the single source of truth for what a given day looks like.
 * Imported by BOTH the client (to draw) and the server (to validate).
 * Pure: no DOM, no Devvit, no Date.now(). The day string is always passed in.
 */

export const ROUNDS = 5;
export const ROUND_TIME = 30;          // base seconds for target 1 on the roughest ice
export const TIER_BONUS = 5;           // +5s of base per ice tier (slicker ice = more time)
export const TARGET_BONUS = 5;         // +5s per target as you climb (option A)

/**
 * Seconds allowed for a given target on a given ice tier.
 * @param targetIdx 0-based (target 1 = 0)
 * @param iceLvl    1..5
 * Targets are always cleared bottom-to-top in sequence, so holesSunk=N always
 * means targets 0..N-1 were the ones completed — which keeps anti-cheat exact.
 */
export function roundTime(targetIdx: number, iceLvl: number): number {
  return ROUND_TIME + TIER_BONUS * (iceLvl - 1) + TARGET_BONUS * targetIdx;
}

/** Max seconds a run could legitimately bank: sum of the cleared targets' budgets. */
export function maxBankedSec(holesSunk: number, iceLvl: number): number {
  let s = 0;
  for (let t = 0; t < holesSunk; t++) s += roundTime(t, iceLvl);
  return s;
}
export const PENALTY = 5;              // seconds docked per fire vent
export const ICE_TIERS = [2.55, 2.35, 2.20, 2.00, 1.85]; // tier 1..5; tier 5 eased from 0.70 (10x) to 0.95 (7.4x)

// Geometry is expressed in normalised units so it is resolution-independent.
export const SXA = 0.06, SXB = 0.94;   // decoy band — some hug the rails
export const TXA = 0.25, TXB = 0.75;   // target band (kept off the rails)
export const TGT_Y = [0.7, 0.55, 0.41, 0.27, 0.11];
const COLS = 7, ROWS = 7;              // stratified grid -> no empty regions
const HYA = 0.05, HYB = 0.83;

export type Hole = { sx: number; hyN: number | any; kind: 'target' | 'decoy'; ord?: number };
export type Board = {
  day: string;
  iceLvl: number;      // 1..5
  barFric: number | any; // 1.65..2.35
  holes: Hole[];
  targetSeq: number[]; // indices into holes, ascending height
};

/** Deterministic PRNG. Same seed -> same stream, on any device. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of the day string, so "2026-07-09" always yields the same board. */
export function seedFromDay(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Normalised distance check. Uses the same aspect ratio the client renders with
 * (playfield 0.66W x 1.0H) so "min distance" means the same thing everywhere.
 */
const AR_X = 0.66, AR_Y = 1.0;
const MIN_D = 0.064; // ≈ 2.3 * ball radius — wider so denser grid never smothers a target

function tooClose(a: Hole, b: Hole): boolean {
  const dx = (a.sx - b.sx) * AR_X;
  const dy = (a.hyN - b.hyN) * AR_Y;
  return Math.hypot(dx, dy) < MIN_D;
}

export function buildBoard(day: string): Board {
  const rng = mulberry32(seedFromDay(day));
  const iceLvl = 1 + Math.floor(rng() * ICE_TIERS.length);
  const barFric = ICE_TIERS[iceLvl - 1];

  const holes: Hole[] = [];
  for (let r = 0; r < TGT_Y.length; r++) {
    holes.push({ sx: TXA + rng() * (TXB - TXA), hyN: TGT_Y[r], kind: 'target', ord: r });
  }
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      for (let tries = 0; tries < 12; tries++) {
        const c: Hole = {
          sx: SXA + (SXB - SXA) * ((cx + rng()) / COLS),
          hyN: HYA + (HYB - HYA) * ((cy + rng()) / ROWS),
          kind: 'decoy',
        };
        if (!holes.some((h) => tooClose(c, h))) { holes.push(c); break; }
      }
    }
  }

  const targetSeq: number[] = [];
  for (let r = 0; r < TGT_Y.length; r++) {
    targetSeq.push(holes.findIndex((h) => h.kind === 'target' && h.ord === r));
  }
  return { day, iceLvl, barFric, holes, targetSeq };
}

/** UTC day rollover, Wordle-style. Never trust the client's clock for this. */
export function dayString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Puzzle number, for display ("DAILY THAW #023"). */
export const EPOCH = Date.UTC(2026, 6, 1); // 2026-07-01
export function puzzleNumber(day: string): number {
  return Math.floor((Date.parse(day + 'T00:00:00Z') - EPOCH) / 86400000) + 1;
}