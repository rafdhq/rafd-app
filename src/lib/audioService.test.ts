// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Proves the Issue #3 root-cause fix: feedback sounds must play reliably even
 * when triggered after an `await` or from a scanner. The old helpers created a
 * fresh, never-resumed AudioContext (silent under the browser autoplay policy).
 * The Audio Service keeps ONE shared context and resumes it before every play.
 */

interface FakeCtx {
  state: string;
  resume: () => Promise<void>;
  resumeCalls: number;
  oscCount: number;
}

function installFakeAudioContext() {
  const instances: FakeCtx[] = [];
  class FakeAudioContext {
    state = 'suspended';
    resumeCalls = 0;
    oscCount = 0;
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      this.resumeCalls += 1;
      this.state = 'running';
    });
    createOscillator() {
      this.oscCount += 1;
      return {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
    }
    constructor() {
      instances.push(this as unknown as FakeCtx);
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  return instances;
}

let instances: FakeCtx[] = [];

beforeEach(() => {
  vi.resetModules();
  instances = installFakeAudioContext();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('audioService — reliable playback (Issue #3)', () => {
  it('resumes a suspended context before playing (the silent-sound root cause)', async () => {
    const mod = await import('./audioService');
    mod.playSuccessChime();
    expect(instances.length).toBe(1);
    expect(instances[0].resumeCalls).toBeGreaterThan(0);
    expect(instances[0].state).toBe('running');
    expect(instances[0].oscCount).toBeGreaterThan(0);
  });

  it('reuses ONE shared context across many calls (no fresh context per play)', async () => {
    const mod = await import('./audioService');
    mod.playScanBeep();
    mod.playSuccessChime();
    mod.playErrorSound();
    mod.playScanBeep();
    expect(instances.length).toBe(1);
  });

  it('unlocks audio on the first user gesture', async () => {
    await import('./audioService'); // auto-attaches gesture listeners
    expect(instances.length).toBe(0); // not created until a gesture/play
    window.dispatchEvent(new Event('pointerdown'));
    expect(instances.length).toBe(1);
    expect(instances[0].resumeCalls).toBeGreaterThan(0);
  });
});
