/**
 * The relay's storage: the Cloudflare bindings it uses, and how a room and slot become a KV key.
 *
 * The binding types are written by hand with only the members the relay calls (their shapes are
 * those of @cloudflare/workers-types, which is not a dependency: its global types clash with
 * Node's, design R1). The relay never stores a room id: a key holds the slot and a hash (C113).
 */
import type { RelaySlot } from '@diet/core/relay';

/** Workers KV, as far as the relay uses it. */
export interface KvSubset {
  getWithMetadata(
    key: string,
    options: { type: 'text'; cacheTtl: number },
  ): Promise<{ value: string | null; metadata: unknown }>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number; metadata: { expiresAt: number } },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/** A Workers Rate Limiting binding (C80). */
export interface RateLimiterSubset {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * How long a KV location may reuse what it read: KV's minimum (also miniflare's), below its
 * default of 60 s, so a stale "nothing waiting" clears sooner (C79).
 */
export const KV_READ_CACHE_TTL_SECONDS = 30;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url (unpadded) SHA-256 of `relay-room-v1|` and the room id: always 43 characters. */
export async function roomHash(roomId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`relay-room-v1|${roomId}`));
  return base64url(new Uint8Array(digest));
}

/** `list:<hash>` or `ack:<hash>`: at most 47 bytes, far under KV's 512. */
export function slotKey(slot: RelaySlot, hash: string): string {
  return `${slot}:${hash}`;
}
