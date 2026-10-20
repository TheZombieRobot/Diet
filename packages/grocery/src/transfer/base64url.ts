/**
 * Unpadded base64url (RFC 4648 section 5), for the pairing code and the relay body (item 30; C113).
 * Built on core's canonical base64, so decoding is canonical too: the text must re-encode to
 * exactly itself, so every byte string has one form and a changed code cannot hide extra bits.
 */
import { base64ToBytes, bytesToBase64 } from '@diet/core';

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isBase64UrlChar(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || // A–Z
    (code >= 97 && code <= 122) || // a–z
    (code >= 48 && code <= 57) || // 0–9
    code === 45 || // -
    code === 95 // _
  );
}

/**
 * Decodes canonical unpadded base64url, or throws a RangeError (no part of the input is in the
 * message). A linear scan rather than a regular expression over the whole body.
 */
export function base64UrlToBytes(text: string): Uint8Array {
  if (text.length % 4 === 1) throw new RangeError('Not canonical base64url');
  for (let i = 0; i < text.length; i++) {
    if (!isBase64UrlChar(text.charCodeAt(i))) throw new RangeError('Not canonical base64url');
  }
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(padded);
  } catch {
    throw new RangeError('Not canonical base64url');
  }
  if (bytesToBase64Url(bytes) !== text) throw new RangeError('Not canonical base64url');
  return bytes;
}
