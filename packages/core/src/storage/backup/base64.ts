/**
 * Standard base64 with padding, on btoa and atob with chunking (storage spec section 10.2; no
 * dependency). Decoding is canonical: the input must re-encode to exactly the same string, so
 * there is one encoding for every byte string and a doctored header cannot hide extra bits.
 */

interface Base64Globals {
  btoa(data: string): string;
  atob(data: string): string;
}

/** btoa and atob from globalThis (Node 22 and every browser); core's lib does not declare them. */
function globals(): Base64Globals {
  const g: Partial<Base64Globals> = globalThis;
  if (typeof g.btoa !== 'function' || typeof g.atob !== 'function') {
    throw new Error('btoa and atob are not available');
  }
  return g as Base64Globals;
}

/** Bytes per btoa call: a multiple of 3, so the chunks join without padding in between. */
export const BASE64_CHUNK_BYTES = 3 * 8192;

function isBase64Char(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || // A–Z
    (code >= 97 && code <= 122) || // a–z
    (code >= 48 && code <= 57) || // 0–9
    code === 43 || // +
    code === 47 // /
  );
}

/**
 * Standard alphabet, length a multiple of 4, padding only at the end. A linear scan rather than a
 * regular expression, which would overflow the stack on a multi-megabyte ciphertext.
 */
function hasBase64Shape(text: string): boolean {
  if (text.length % 4 !== 0) return false;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  for (let i = 0; i < text.length - padding; i++) {
    if (!isBase64Char(text.charCodeAt(i))) return false;
  }
  return true;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES) {
    const chunk = bytes.subarray(start, start + BASE64_CHUNK_BYTES);
    parts.push(globals().btoa(String.fromCharCode(...chunk)));
  }
  return parts.join('');
}

/** Decodes canonical base64, or throws a RangeError (no part of the input is in the message). */
export function base64ToBytes(text: string): Uint8Array {
  if (!hasBase64Shape(text)) throw new RangeError('Not canonical base64');
  const binary = globals().atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytesToBase64(bytes) !== text) throw new RangeError('Not canonical base64');
  return bytes;
}
