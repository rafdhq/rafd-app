// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BarcodeScanner from './BarcodeScanner';
import { playSuccessChime } from '../../lib/audioService';

/**
 * Proves the Issue #2 fix: on the first valid CAMERA decode the scanner plays a
 * success sound, emits exactly once, closes the camera and ignores any further
 * frames (no repeated reads). Also verifies the `silent` and
 * `singleShotCamera={false}` escape hatches.
 */

// Shared state the html5-qrcode mock writes into (hoisted so the mock factory
// can reference it safely).
const h = vi.hoisted(() => ({
  decodeCb: null as null | ((text: string) => void),
  startCount: 0,
  stopCount: 0,
  clearCount: 0,
}));

vi.mock('../../lib/audioService', () => ({ playSuccessChime: vi.fn() }));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    async start(_cam: unknown, _opts: unknown, onSuccess: (text: string) => void) {
      h.decodeCb = onSuccess;
      h.startCount += 1;
    }
    async stop() {
      h.stopCount += 1;
    }
    async clear() {
      h.clearCount += 1;
    }
  },
}));

beforeEach(() => {
  h.decodeCb = null;
  h.startCount = 0;
  h.stopCount = 0;
  h.clearCount = 0;
  vi.mocked(playSuccessChime).mockClear();
});

afterEach(() => cleanup());

async function openCamera() {
  await act(async () => {
    fireEvent.click(screen.getByText('كاميرا الباركود'));
  });
  await waitFor(() => expect(h.decodeCb).not.toBeNull());
}

describe('BarcodeScanner — camera single-shot (Issue #2)', () => {
  it('first valid decode: success sound + emit once + close camera + ignore repeats', async () => {
    const onScan = vi.fn();
    render(<BarcodeScanner onScan={onScan} />);
    await openCamera();
    expect(h.startCount).toBe(1);

    // Same code twice, then a different code — only the FIRST frame emits.
    await act(async () => h.decodeCb?.('6200000000000'));
    await act(async () => h.decodeCb?.('6200000000000'));
    await act(async () => h.decodeCb?.('9999999999999'));

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('6200000000000');
    expect(playSuccessChime).toHaveBeenCalledTimes(1);
    // Camera closed → the [cameraOn] cleanup stopped the scanner.
    await waitFor(() => expect(h.stopCount).toBeGreaterThan(0));
  });

  it('reopening the camera resets the latch and allows a new single scan', async () => {
    const onScan = vi.fn();
    render(<BarcodeScanner onScan={onScan} />);

    await openCamera();
    await act(async () => h.decodeCb?.('111'));
    expect(onScan).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.stopCount).toBeGreaterThan(0));

    h.decodeCb = null;
    await act(async () => {
      fireEvent.click(screen.getByText('كاميرا الباركود'));
    });
    await waitFor(() => expect(h.decodeCb).not.toBeNull());
    await act(async () => h.decodeCb?.('222'));

    expect(onScan).toHaveBeenCalledTimes(2);
    expect(onScan).toHaveBeenLastCalledWith('222');
  });

  it('silent prop suppresses the scanner sound (caller provides its own beep)', async () => {
    const onScan = vi.fn();
    render(<BarcodeScanner onScan={onScan} silent />);
    await openCamera();
    await act(async () => h.decodeCb?.('123'));
    expect(onScan).toHaveBeenCalledWith('123');
    expect(playSuccessChime).not.toHaveBeenCalled();
  });

  it('singleShotCamera={false} keeps the camera open for continuous scanning', async () => {
    const onScan = vi.fn();
    render(<BarcodeScanner onScan={onScan} singleShotCamera={false} />);
    await openCamera();
    await act(async () => h.decodeCb?.('abc'));
    await act(async () => h.decodeCb?.('def'));
    expect(onScan).toHaveBeenCalledTimes(2);
    expect(h.stopCount).toBe(0);
  });
});
