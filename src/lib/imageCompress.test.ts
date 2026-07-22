import { describe, expect, it } from 'vitest';
import { fileToBase64 } from './imageCompress';

describe('imageCompress helpers', () => {
  it('encodes blob to base64', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/octet-stream' });
    const b64 = await fileToBase64(blob);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
    // decode roundtrip length
    const bin = atob(b64);
    expect(bin.length).toBe(4);
  });
});
