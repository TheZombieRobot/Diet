/**
 * The paste code (item 31 design 2.5; the item-30/31 transfer contract, section 8; C12, TR-07,
 * TR-08): the same sealed body the relay would carry, for the owner to take to the laptop
 * themselves when the relay cannot be used.
 *
 *   code = "dl1." + body without "rl1." + "." + 8 lowercase hex characters of CRC-32(UTF-8(body))
 *
 * Reading strips the spaces, line breaks, no-break and zero-width characters that email and chat
 * apps insert, and names what is wrong in plain terms (the laptop's paste input, item 33, shows
 * them). Vector V6 pins the format. No message carries the input.
 */
import { isRelayBody, MAX_RELAY_BODY_BYTES, RELAY_BODY_PREFIX, utf8Encode } from '@diet/core';
import { crc32 } from './crc32';
import type { SealedRelayBody } from './envelope';

export const PASTE_CODE_PREFIX = 'dl1.';
/** Lowercase hex of the CRC-32. */
export const PASTE_CODE_CHECK_CHARS = 8;
/** The relay's cap, written as a code: 65,545 characters. */
export const MAX_PASTE_CODE_CHARS =
  MAX_RELAY_BODY_BYTES -
  RELAY_BODY_PREFIX.length +
  PASTE_CODE_PREFIX.length +
  1 +
  PASTE_CODE_CHECK_CHARS;

export type PasteCodeProblem = 'empty' | 'not-a-code' | 'too-long' | 'incomplete' | 'damaged';
export type PasteCodeResult =
  // Not a SealedRelayBody: only opening it proves anything.
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly problem: PasteCodeProblem };

/** Whitespace, no-break and zero-width characters (U+00A0, U+200B–U+200D, U+2060, U+FEFF). */
const INSERTED = /[\s\u00a0\u200b-\u200d\u2060\ufeff]/g;
const CHECK = /^[0-9a-f]{8}$/;

const checkOf = (body: string): string => crc32(utf8Encode(body)).toString(16).padStart(8, '0');

/** The paste code of a sealed list body. Throws RangeError('paste code') for anything else. */
export function pasteCodeFromBody(body: SealedRelayBody): string {
  if (!isRelayBody(body, 'list')) throw new RangeError('paste code');
  return `${PASTE_CODE_PREFIX}${body.slice(RELAY_BODY_PREFIX.length)}.${checkOf(body)}`;
}

/** The body inside a pasted code, or what is wrong with it. Never throws. */
export function bodyFromPasteCode(text: string): PasteCodeResult {
  const code = typeof text === 'string' ? text.replace(INSERTED, '') : '';
  if (code === '') return { ok: false, problem: 'empty' };
  if (code.length > MAX_PASTE_CODE_CHARS) return { ok: false, problem: 'too-long' };
  if (!code.startsWith(PASTE_CODE_PREFIX)) return { ok: false, problem: 'not-a-code' };
  const parts = code.slice(PASTE_CODE_PREFIX.length).split('.');
  const [middle = '', check = ''] = parts;
  if (parts.length !== 2 || middle === '' || !CHECK.test(check)) {
    return { ok: false, problem: 'incomplete' };
  }
  const body = RELAY_BODY_PREFIX + middle;
  if (checkOf(body) !== check || !isRelayBody(body, 'list')) {
    return { ok: false, problem: 'damaged' };
  }
  return { ok: true, body };
}
