/**
 * Helpers for the transfer tests only (nothing else imports this file, and the index does not
 * export it). The package's lib has no DOM or Node types, so the WebCrypto calls and the Node
 * modules the tests use are typed here. node:crypto and node:zlib give an opening and a sealing
 * path that shares no code with the module under test (G9, G16).
 */
import type { RelaySlot } from '@diet/core';
import { bytesToBase64Url } from './base64url';
import { transferAdditionalData } from './envelope';

interface TestSubtle {
  generateKey(
    algorithm: { name: 'AES-GCM'; length: 256 },
    extractable: boolean,
    usages: string[],
  ): Promise<object>;
  exportKey(format: 'raw', key: object): Promise<ArrayBuffer>;
}

export interface TestWebCrypto {
  getRandomValues(array: Uint8Array): Uint8Array;
  readonly subtle: TestSubtle;
}

/** globalThis.crypto with the members the tests use. */
export const webCrypto = (): TestWebCrypto =>
  (globalThis as unknown as { crypto: TestWebCrypto }).crypto;

interface NodeCipher {
  setAAD(data: Uint8Array): void;
  setAuthTag(tag: Uint8Array): void;
  getAuthTag(): Uint8Array;
  update(data: Uint8Array): Uint8Array;
  final(): Uint8Array;
}

interface NodeCrypto {
  createCipheriv(algorithm: 'aes-256-gcm', key: Uint8Array, iv: Uint8Array): NodeCipher;
  createDecipheriv(algorithm: 'aes-256-gcm', key: Uint8Array, iv: Uint8Array): NodeCipher;
  createHash(algorithm: 'sha256'): {
    update(data: Uint8Array): { digest(encoding: 'hex'): string };
  };
}

interface NodeZlib {
  deflateRawSync(data: Uint8Array): Uint8Array;
  inflateRawSync(data: Uint8Array): Uint8Array;
}

// Specifiers in variables, so TypeScript does not look for Node's own types.
const NODE_CRYPTO = 'node:crypto';
const NODE_ZLIB = 'node:zlib';

export const nodeCrypto = async (): Promise<NodeCrypto> =>
  (await import(/* @vite-ignore */ NODE_CRYPTO)) as NodeCrypto;
export const nodeZlib = async (): Promise<NodeZlib> =>
  (await import(/* @vite-ignore */ NODE_ZLIB)) as NodeZlib;

export function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16),
  );
}

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const ascii = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));

/** The raw bytes of a body, without "rl1." (base64url, decoded by Node). */
export function bodyBytes(body: string): Uint8Array {
  const text = body.slice(4).replace(/-/g, '+').replace(/_/g, '/');
  const binary = (globalThis as unknown as { atob(s: string): string }).atob(
    text + '='.repeat((4 - (text.length % 4)) % 4),
  );
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export const bodyOf = (bytes: Uint8Array): string => `rl1.${bytesToBase64Url(bytes)}`;

/**
 * A body sealed by node:crypto under the raw key bytes, with the right version byte, IV and
 * additional data, over `payload` exactly as given (deflated or not: the caller decides).
 */
export async function nodeSeal(
  keyBytes: Uint8Array,
  slot: RelaySlot,
  payload: Uint8Array,
  iv: Uint8Array = webCrypto().getRandomValues(new Uint8Array(12)),
): Promise<string> {
  const cipher = (await nodeCrypto()).createCipheriv('aes-256-gcm', keyBytes, iv);
  cipher.setAAD(transferAdditionalData(slot));
  const sealed = [cipher.update(payload), cipher.final(), cipher.getAuthTag()];
  const parts = [Uint8Array.of(1), iv, ...sealed];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return bodyOf(out);
}

/** Opens a body with node:crypto and zlib, as the laptop's code could without this module. */
export async function nodeOpen(
  keyBytes: Uint8Array,
  slot: RelaySlot,
  body: string,
): Promise<Uint8Array> {
  const raw = bodyBytes(body);
  const decipher = (await nodeCrypto()).createDecipheriv(
    'aes-256-gcm',
    keyBytes,
    raw.subarray(1, 13),
  );
  decipher.setAAD(transferAdditionalData(slot));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  const deflated = [decipher.update(raw.subarray(13, raw.length - 16)), decipher.final()];
  const joined = new Uint8Array(deflated.reduce((n, p) => n + p.length, 0));
  joined.set(deflated[0] ?? new Uint8Array(0), 0);
  joined.set(deflated[1] ?? new Uint8Array(0), deflated[0]?.length ?? 0);
  return new Uint8Array((await nodeZlib()).inflateRawSync(joined));
}
