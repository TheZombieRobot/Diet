/**
 * The sealed relay body (item 30 design 1.8; the item-30/31 transfer contract, section 4):
 *
 *   body  = "rl1." + base64url(bytes)
 *   bytes = 0x01 ‖ iv (12 fresh random bytes) ‖ AES-GCM-256(key, iv, aad, deflate-raw(plaintext))
 *   aad   = UTF-8 of ["diet-transfer",1,"<slot>"]
 *
 * The additional data binds the format name, the envelope version and the slot, so a body moved to
 * the other slot, or with its version byte changed, does not open. Compression happens before
 * encryption, and inflation only after the tag has verified, up to a cap. Opening never throws.
 * Only sealForRelay makes a SealedRelayBody (scan rule sealed-body-cast): a string that was never
 * sealed is a type error wherever a sealed body is required.
 */
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  isRelayBody,
  randomBytes,
  RELAY_BODY_PREFIX,
  type RelaySlot,
  utf8Encode,
} from '@diet/core';
import { base64UrlToBytes, bytesToBase64Url } from './base64url';
import { type ChunkReader, compressionStreams } from './globals';
import type { PairingKey } from './pairingKey';

/** The first byte of every body. A new layout or additional data is version 2 (a DECISIONS row). */
export const TRANSFER_FORMAT_VERSION = 1;
export const TRANSFER_AAD_LABEL = 'diet-transfer';
/** Its own constant, so a change to the backup format can never move it. */
export const TRANSFER_IV_BYTES = 12;
/** The inflate cap. The largest valid list payload is 862,194 bytes, so no valid list reaches it. */
export const MAX_TRANSFER_PLAINTEXT_BYTES = 1_048_576;

declare const sealedBrand: unique symbol;
/** A body made by sealForRelay, and only by it. */
export type SealedRelayBody = string & { readonly [sealedBrand]: true };

export type OpenFailure = 'not-a-body' | 'unsupported-version' | 'cannot-open' | 'damaged';
export type OpenBodyResult =
  | { readonly ok: true; readonly plaintext: Uint8Array }
  | { readonly ok: false; readonly reason: OpenFailure };

export function transferAdditionalData(slot: RelaySlot): Uint8Array {
  return utf8Encode(JSON.stringify([TRANSFER_AAD_LABEL, TRANSFER_FORMAT_VERSION, slot]));
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Reads every chunk, or stops and returns null once more than `cap` bytes have come out. */
async function readAll(reader: ChunkReader, cap: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return concat(chunks, total);
    if (value === undefined) continue;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
}

/** deflate-raw with the browser's CompressionStream. */
export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new (compressionStreams().CompressionStream)('deflate-raw');
  const writer = stream.writable.getWriter();
  const written = Promise.all([writer.write(bytes), writer.close()]);
  const [out] = await Promise.all([readAll(stream.readable.getReader(), Infinity), written]);
  if (out === null) throw new Error('deflate failed');
  return out;
}

/** One pass of DecompressionStream; null when it throws or more than `cap` bytes come out. */
async function inflateOnce(bytes: Uint8Array, cap: number): Promise<Uint8Array | null> {
  try {
    const stream = new (compressionStreams().DecompressionStream)('deflate-raw');
    const writer = stream.writable.getWriter();
    // Caught at once, so a cancel never becomes an unhandled rejection.
    writer.write(bytes).catch(() => undefined);
    writer.close().catch(() => undefined);
    return await readAll(stream.readable.getReader(), cap);
  } catch {
    return null;
  }
}

/**
 * Inflates deflate-raw, or returns null when the bytes are not one whole deflate stream (not
 * deflate, cut short, or with bytes after its end) or inflate to more than `cap` bytes (reading
 * stops at once, so a deflate bomb costs at most the cap and one chunk).
 *
 * Bytes after the end: Chrome's DecompressionStream refuses them but Node 22's ignores them, so
 * this checks them itself, the same in every runtime. Every runtime refuses a stream cut short,
 * and a stream's last byte always holds its end, so a stream that still inflates without its last
 * byte had bytes after its end.
 */
export async function inflateRaw(
  bytes: Uint8Array,
  cap = MAX_TRANSFER_PLAINTEXT_BYTES,
): Promise<Uint8Array | null> {
  const plaintext = await inflateOnce(bytes, cap);
  if (plaintext === null) return null;
  return (await inflateOnce(bytes.subarray(0, -1), cap)) === null ? plaintext : null;
}

/**
 * Deflates, then seals with a fresh IV for every call. Two calls with the same input give
 * different bodies. It does not check the relay's size cap: the caller does, with relayBodyFits.
 */
export async function sealForRelay(
  key: PairingKey,
  slot: RelaySlot,
  plaintext: Uint8Array,
): Promise<SealedRelayBody> {
  const deflated = await deflateRaw(plaintext);
  const iv = randomBytes(TRANSFER_IV_BYTES);
  const sealed = await aesGcmEncrypt(key, iv, transferAdditionalData(slot), deflated);
  const bytes = concat(
    [Uint8Array.of(TRANSFER_FORMAT_VERSION), iv, sealed],
    1 + iv.length + sealed.length,
  );
  return (RELAY_BODY_PREFIX + bytesToBase64Url(bytes)) as SealedRelayBody;
}

/** Opens a body, or says plainly why not. Never throws, and no reason carries the input. */
export async function openRelayBody(
  key: PairingKey,
  slot: RelaySlot,
  body: unknown,
): Promise<OpenBodyResult> {
  if (!isRelayBody(body, slot)) return { ok: false, reason: 'not-a-body' };
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(body.slice(RELAY_BODY_PREFIX.length));
  } catch {
    return { ok: false, reason: 'not-a-body' };
  }
  if (bytes[0] !== TRANSFER_FORMAT_VERSION) return { ok: false, reason: 'unsupported-version' };
  let deflated: Uint8Array;
  try {
    const iv = bytes.subarray(1, 1 + TRANSFER_IV_BYTES);
    const sealed = bytes.subarray(1 + TRANSFER_IV_BYTES);
    deflated = await aesGcmDecrypt(key, iv, transferAdditionalData(slot), sealed);
  } catch {
    return { ok: false, reason: 'cannot-open' };
  }
  const plaintext = await inflateRaw(deflated);
  return plaintext === null ? { ok: false, reason: 'damaged' } : { ok: true, plaintext };
}

/** openRelayBody with every failure as null (item 31). */
export async function openFromRelay(
  key: PairingKey,
  slot: RelaySlot,
  body: unknown,
): Promise<Uint8Array | null> {
  const result = await openRelayBody(key, slot, body);
  return result.ok ? result.plaintext : null;
}
