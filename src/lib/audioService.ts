/**
 * RAFD Audio Service — the single source of truth for UI feedback sounds.
 *
 * Root cause this fixes (P0 stabilization):
 *   The previous helpers (in posSettings.ts) created a BRAND-NEW AudioContext on
 *   every call and never called .resume(). Modern browsers start a freshly
 *   created AudioContext in the "suspended" state unless it is created/resumed
 *   inside a user gesture. Success sounds fired AFTER an `await` (e.g. the POS
 *   "sale completed" chime) or from non-gesture sources (camera/keyboard-wedge
 *   scans) were therefore silent. The "add product" flow also never played any
 *   sound at all.
 *
 *   This service keeps ONE shared AudioContext, unlocks it on the first user
 *   gesture, and resumes it before every play — so sounds play reliably from
 *   any call site. All important operations should import from here.
 */

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let unlockAttached = false;

function getCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext || w.webkitAudioContext || null;
}

/** Lazily create the shared context and resume it if the browser suspended it. */
function getContext(): AudioContext | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Attach one-time gesture listeners that create + resume the context, so the
 * very first tap/click/keypress "unlocks" audio for everything that follows
 * (including sounds triggered later from async callbacks or scanners).
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined' || unlockAttached) return;
  unlockAttached = true;
  const unlock = () => {
    getContext();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('touchend', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('touchend', unlock, true);
}

// Auto-unlock as soon as this module is imported in the browser.
unlockAudio();

function tone(
  freq: number,
  durationMs: number,
  opts: { type?: OscillatorType; gain?: number; rampTo?: number; delayMs?: number } = {}
): void {
  const ac = getContext();
  if (!ac) return;
  try {
    const { type = 'sine', gain = 0.05, rampTo, delayMs = 0 } = opts;
    const startAt = ac.currentTime + delayMs / 1000;
    const stopAt = startAt + durationMs / 1000;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (rampTo) osc.frequency.setValueAtTime(rampTo, stopAt - 0.02);
    g.gain.setValueAtTime(gain, startAt);
    // Short fade-out avoids audible clicks.
    g.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(startAt);
    osc.stop(stopAt + 0.02);
  } catch {
    /* audio is best-effort; never throw into callers */
  }
}

/** Short high beep for scan / add-to-cart feedback. */
export function playScanBeep(): void {
  tone(1800, 70, { type: 'square', gain: 0.04 });
}

/** Two-note ascending chime for a successful operation (save, sale, scan). */
export function playSuccessChime(): void {
  tone(880, 90, { type: 'sine', gain: 0.05 });
  tone(1175, 110, { type: 'sine', gain: 0.05, delayMs: 90 });
}

/** Low buzz for errors / rejected operations. */
export function playErrorSound(): void {
  tone(220, 160, { type: 'sawtooth', gain: 0.04 });
}

export const audioService = {
  unlock: unlockAudio,
  scanBeep: playScanBeep,
  success: playSuccessChime,
  error: playErrorSound,
};
