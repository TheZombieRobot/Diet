/**
 * The pairing code (checklist item 30; DECISIONS Q1; DOC_REVIEW C83, C113, C115): what the laptop's
 * QR code holds, and what the phone reads from it.
 *
 *   diet-pair:1:<room id>:<key>:<relay address, or nothing>
 *
 * A format name and version, a 128-bit room id and a 256-bit AES-GCM key in unpadded base64url,
 * and the relay address the laptop was built with. It is never a web address, so a camera app
 * cannot open it as a link. Parsing is strict and never trims; it never throws and no error says
 * what it refused.
 */
import { isRelayOrigin, randomBytes, RELAY_ORIGIN, sha256Hex } from '@diet/core';
import { base64UrlToBytes, bytesToBase64Url } from './base64url';

export const PAIRING_CODE_PREFIX = 'diet-pair:';
export const PAIRING_CODE_VERSION = 1;
/**
 * The address a pairing stores when the laptop had no relay address (RFC 6761: .invalid never
 * resolves). It passes the version-1 relayUrl rule, so the schema stays at version 1; it is
 * compared, never contacted (item 30 P4).
 */
export const NO_RELAY_URL = 'https://relay.invalid';
/**
 * Sixteen consonants: no vowel, no Y, no digit, no L, Q, W or X. A pairing check can never spell
 * a word, a help number or a unit (tools/scans/pairingCheck.test.ts walks all 65,536).
 */
export const PAIRING_CHECK_LETTERS = 'BCDFGHJKMNPRSTVZ';

const ROOM_BYTES = 16;
const KEY_BYTES = 32;
const ROOM_CHARS = 22;
const CODE = /^diet-pair:1:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43}):(.*)$/;
const VERSION = /^diet-pair:(\d{1,6}):/;

/** What the laptop makes for each Pair and Pair again (C115). */
export interface PairingMaterial {
  readonly roomId: string;
  readonly keyBytes: Uint8Array;
}

/** A parsed code. The caller zeroes `keyBytes` once the key is imported. */
export interface PairingCode {
  readonly roomId: string;
  readonly keyBytes: Uint8Array;
  readonly relayOrigin: string | null;
}

export type PairingCodeResult =
  | { readonly ok: true; readonly code: PairingCode }
  | { readonly ok: false; readonly reason: 'not-pairing-code' | 'newer-version' | 'damaged' };

/**
 * What a stored pairing's relay address means for this build: 'ready' when it is the configured
 * relay, 'not-configured' when this build has none, 'pair-again' otherwise (R19). The paste code
 * needs only a stored pairing, whatever this says.
 */
export type PairingRelayStatus = 'ready' | 'not-configured' | 'pair-again';

/** A new room id and key from getRandomValues (the laptop, and tests). */
export function createPairingMaterial(): PairingMaterial {
  return { roomId: bytesToBase64Url(randomBytes(ROOM_BYTES)), keyBytes: randomBytes(KEY_BYTES) };
}

/** The decoded bytes when `text` is canonical base64url of exactly `length` bytes. */
function decodedOf(text: string, length: number): Uint8Array | null {
  try {
    const bytes = base64UrlToBytes(text);
    return bytes.length === length ? bytes : null;
  } catch {
    return null;
  }
}

const isCodeRelay = (origin: string): boolean => isRelayOrigin(origin) && origin !== NO_RELAY_URL;

/** The QR text. Throws RangeError('pairing code') for a part that does not follow the format. */
export function formatPairingCode(code: PairingCode): string {
  const relayOk = code.relayOrigin === null || isCodeRelay(code.relayOrigin);
  if (
    code.roomId.length !== ROOM_CHARS ||
    decodedOf(code.roomId, ROOM_BYTES) === null ||
    code.keyBytes.length !== KEY_BYTES ||
    !relayOk
  ) {
    throw new RangeError('pairing code');
  }
  const key = bytesToBase64Url(code.keyBytes);
  return `${PAIRING_CODE_PREFIX}${PAIRING_CODE_VERSION}:${code.roomId}:${key}:${code.relayOrigin ?? ''}`;
}

const DAMAGED: PairingCodeResult = Object.freeze({ ok: false, reason: 'damaged' });

/**
 * Reads a QR text. Not starting with `diet-pair:` is 'not-pairing-code' (a code from another
 * app), except that leading white space before it is 'damaged'; a later version is
 * 'newer-version'; anything else that does not follow the format exactly is 'damaged'.
 */
export function parsePairingCode(text: unknown): PairingCodeResult {
  if (typeof text !== 'string') return { ok: false, reason: 'not-pairing-code' };
  if (!text.startsWith(PAIRING_CODE_PREFIX)) {
    return /^\s+diet-pair:/.test(text) ? DAMAGED : { ok: false, reason: 'not-pairing-code' };
  }
  const version = VERSION.exec(text)?.[1];
  if (version === undefined || version.startsWith('0')) return DAMAGED;
  if (version !== String(PAIRING_CODE_VERSION)) return { ok: false, reason: 'newer-version' };
  const parts = CODE.exec(text);
  const [roomId, keyText, relay] = [parts?.[1], parts?.[2], parts?.[3]];
  if (roomId === undefined || keyText === undefined || relay === undefined) return DAMAGED;
  if (decodedOf(roomId, ROOM_BYTES) === null) return DAMAGED;
  if (relay !== '' && !isCodeRelay(relay)) return DAMAGED;
  const keyBytes = decodedOf(keyText, KEY_BYTES);
  if (keyBytes === null) return DAMAGED;
  return { ok: true, code: { roomId, keyBytes, relayOrigin: relay === '' ? null : relay } };
}

/** The relay address a pairing stores: the code's, or NO_RELAY_URL when it had none. */
export function storedRelayUrl(relayOrigin: string | null): string {
  return relayOrigin ?? NO_RELAY_URL;
}

export function pairingRelayStatus(
  storedRelayUrl: string,
  configured: string | null = RELAY_ORIGIN,
): PairingRelayStatus {
  if (configured === null) return 'not-configured';
  return storedRelayUrl === configured ? 'ready' : 'pair-again';
}

/** Four letters of PAIRING_CHECK_LETTERS for a 16-bit number, most significant 4 bits first. */
export function pairingCheckOfBits(bits: number): string {
  if (!Number.isInteger(bits) || bits < 0 || bits > 0xffff) throw new RangeError('pairing check');
  return [12, 8, 4, 0].map((shift) => PAIRING_CHECK_LETTERS.charAt((bits >> shift) & 15)).join('');
}

/**
 * The four letters both devices show (P18): the first 16 bits of SHA-256 of
 * "diet-pairing-check|<room id>". It reveals nothing about the key.
 */
export async function pairingCheck(roomId: string): Promise<string> {
  const digest = await sha256Hex(`diet-pairing-check|${roomId}`);
  return pairingCheckOfBits(Number.parseInt(digest.slice(0, 4), 16));
}
