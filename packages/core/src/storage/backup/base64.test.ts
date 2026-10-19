import { describe, expect, it } from 'vitest';
import { BASE64_CHUNK_BYTES, base64ToBytes, bytesToBase64 } from './base64';
import { bytesEqual, utf8Encode } from './crypto';

describe('base64 (section 10.2; section 16 test 12)', () => {
  it('round-trips every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = bytesToBase64(all);
    expect(text).toHaveLength(344);
    expect(base64ToBytes(text)).toEqual(all);
    expect(bytesToBase64(utf8Encode('Example'))).toBe('RXhhbXBsZQ==');
    expect(bytesToBase64(new Uint8Array([0xff]))).toBe('/w==');
    expect(bytesToBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=');
  });

  it('round-trips empty input', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });

  it('round-trips 5 MB across many chunks', () => {
    const big = Uint8Array.from({ length: 5 * 1024 * 1024 }, (_, i) => (i * 31 + (i >> 8)) & 0xff);
    expect(big.length).toBeGreaterThan(100 * BASE64_CHUNK_BYTES);
    const text = bytesToBase64(big);
    expect(text).toHaveLength(Math.ceil(big.length / 3) * 4);
    expect(text.slice(0, -2)).not.toContain('='); // padding only at the very end, never between chunks
    expect(bytesEqual(base64ToBytes(text), big)).toBe(true);
  });

  it('refuses non-canonical input', () => {
    for (const bad of [
      'QQ',
      'QQ=',
      'QR==',
      'Q Q==',
      '====',
      'QQ=a',
      'QQ==QQ==',
      '-_8=',
      'QUJD\n',
      'QUJDRA',
    ]) {
      expect(() => base64ToBytes(bad), bad).toThrow(RangeError);
    }
    expect(base64ToBytes('QQ==')).toEqual(new Uint8Array([0x41]));
  });
});
