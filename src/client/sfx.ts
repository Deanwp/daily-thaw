let ctx: AudioContext | undefined
let master: GainNode | undefined
let muted = false

/** Bumps fire constantly on slick ice; without a floor they machine-gun. */
let lastBump = 0
const BUMP_GAP_MS = 55

// The rail mechanism. One oscillator that never stops; only its gain moves.
// Starting and stopping an oscillator per frame would click, and cost more.
let railOsc: OscillatorNode | undefined
let railGain: GainNode | undefined
const RAIL_MAX = 0.045   // deliberately faint: this is texture under the game, not an event

export function isMuted(): boolean {
  return muted
}

/**
 * Must be called from inside a real user gesture (the START tap/click).
 * Browsers refuse to start an AudioContext otherwise, and Devvit asks the same.
 */
export function unlock(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  try {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.35
    master.connect(ctx.destination)
    startRail()
  } catch {
    ctx = undefined // no audio available; every play() below becomes a no-op
  }
}

export function toggleMute(): boolean {
  muted = !muted
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.35, ctx.currentTime, 0.01)
  return muted
}

/** Scrolled away, tabbed out, post collapsed — go quiet immediately. */
export function bindVisibility(): void {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) void ctx.suspend()
    else if (!muted) void ctx.resume()
  })
}

/**
 * The rails hum while the bar moves. It sits at 180-300Hz, in the gap between the
 * bump clicks (90-160) and the sink chime (523/784), so it never masks anything
 * that carries information.
 */
function startRail(): void {
  if (!ctx || !master || railOsc) return
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 620
  lp.Q.value = 0.7

  railGain = ctx.createGain()
  railGain.gain.value = 0

  railOsc = ctx.createOscillator()
  railOsc.type = 'sawtooth'
  railOsc.frequency.value = 180

  railOsc.connect(lp)
  lp.connect(railGain)
  railGain.connect(master)
  railOsc.start()
}

/**
 * @param speed 0..1 — how far the bar ACTUALLY moved this step, not how hard the
 * stick is pushed. A bar pinned against the top rail is silent, which is right:
 * the mechanism isn't doing anything.
 */
export function sfxRail(speed: number): void {
  if (!ctx || !railGain || !railOsc) return
  const s = Math.min(1, Math.max(0, speed))
  const t = ctx.currentTime
  // setTargetAtTime, not setValueAtTime — instant gain jumps click audibly.
  railGain.gain.setTargetAtTime(s * RAIL_MAX, t, 0.04)
  railOsc.frequency.setTargetAtTime(180 + s * 120, t, 0.06)
}

/** Run ended or reset — let the mechanism settle. */
export function sfxRailStop(): void {
  if (!ctx || !railGain) return
  railGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
}

type Wave = OscillatorType

/** One shaped tone. Everything else is built from this. */
function tone(
  freq: number,
  dur: number,
  wave: Wave,
  gain: number,
  slideTo?: number,
): void {
  if (!ctx || !master || muted) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const env = ctx.createGain()

  osc.type = wave
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur)

  // Fast attack, exponential decay — a struck object, not a synth pad.
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + 0.004)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  osc.connect(env)
  env.connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/**
 * Ball hits a rail. Pitched by impact strength so a hard bounce reads harder —
 * the one piece of feedback the original cabinet gave you through the cabinet itself.
 */
export function sfxBump(strength: number): void {
  const now = performance.now()
  if (now - lastBump < BUMP_GAP_MS) return
  lastBump = now
  const s = Math.min(1, Math.max(0, strength))
  tone(90 + s * 70, 0.05, 'square', 0.10 + s * 0.10, 60)
}

/** Target sunk. Two rising notes — the only genuinely happy sound in the game. */
export function sfxSink(): void {
  tone(523, 0.09, 'triangle', 0.22)          // C5
  window.setTimeout(() => tone(784, 0.16, 'triangle', 0.20), 70)   // G5
}

/** Fire vent. Harsh, falling, over quickly — punishment, not a jingle. */
export function sfxVent(): void {
  tone(220, 0.20, 'sawtooth', 0.20, 70)
  tone(150, 0.22, 'square', 0.10, 55)
}

/** Run over. Descending, resigned. */
export function sfxDone(): void {
  tone(392, 0.14, 'triangle', 0.18)          // G4
  window.setTimeout(() => tone(311, 0.14, 'triangle', 0.16), 120)  // Eb4
  window.setTimeout(() => tone(262, 0.30, 'triangle', 0.16), 240)  // C4
}

/** Last ten seconds. Deliberately thin — it should nag, not alarm. */
export function sfxTick(): void {
  tone(1200, 0.03, 'square', 0.05)
}