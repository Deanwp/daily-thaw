import {ROUNDS, ROUND_TIME, PENALTY, roundTime, maxBankedSec} from './board.ts'

export const HOLE_WEIGHT = 10_000_000;
export const MAX_BANKED_MS = maxBankedSec(ROUNDS, 5) * 1000; // tier-5, all rounds = the ceiling

export type Run = {
  day: string;
  holesSunk: number;
  bankedMs: number;
  wrongHoles: number;   // fire vents hit
  elapsedMs: number;    // wall-clock length of the whole run
};

export function composite(holesSunk: number, bankedMs: number): number {
  return holesSunk * HOLE_WEIGHT + Math.min(bankedMs, MAX_BANKED_MS);
}

export function decompose(score: number): { holesSunk: number; bankedMs: number } {
  return {
    holesSunk: Math.floor(score / HOLE_WEIGHT),
    bankedMs: score % HOLE_WEIGHT,
  };
}

export function validateRun(run: Run, today: string, iceLvl: number): { ok: true } | { ok: false; reason: string } {
  if (run.day !== today) return { ok: false, reason: 'stale or future day' };

  if (!Number.isInteger(run.holesSunk) || run.holesSunk < 0 || run.holesSunk > ROUNDS)
    return { ok: false, reason: 'holesSunk out of range' };

  if (!Number.isInteger(run.wrongHoles) || run.wrongHoles < 0 || run.wrongHoles > 500)
    return { ok: false, reason: 'wrongHoles out of range' };

  if (!Number.isFinite(run.bankedMs) || run.bankedMs < 0 || run.bankedMs > MAX_BANKED_MS)
    return { ok: false, reason: 'bankedMs out of range' };

  // You can only bank time on the specific targets you cleared (they run bottom-to-top,
  // so holesSunk=N means targets 0..N-1 — an exact, tier-aware budget).
  if (run.bankedMs > maxBankedSec(run.holesSunk, iceLvl) * 1000)
    return { ok: false, reason: 'banked more time than cleared targets allow' };

  const minElapsedMs = run.holesSunk * 1000;
  if (run.elapsedMs < minElapsedMs)
    return { ok: false, reason: 'elapsed too short for claimed result' };

  // A run cannot outlast its own clock: the fullest possible board + generous slack.
  if (run.elapsedMs > (maxBankedSec(ROUNDS, iceLvl) + 30) * 1000)
    return { ok: false, reason: 'elapsed too long' };

  // Penalties consume the clock; cap vents by the tier's total time budget.
  const maxVents = Math.ceil(maxBankedSec(ROUNDS, iceLvl) / PENALTY);
  if (run.wrongHoles > maxVents + ROUNDS)
    return { ok: false, reason: 'more vents than the clock allows' };

  return { ok: true };
}