/**
 * The relay's storage and limits: the Cloudflare bindings it uses, how a room and slot become a KV
 * key, and how a client address becomes a rate-limit key.
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

/** Four numbers of 0-255, without leading zeros, or null. */
function ipv4Bytes(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part))) return null;
  const bytes = parts.map(Number);
  return bytes.every((byte) => byte <= 255) ? bytes : null;
}

/** The eight 16-bit groups of an IPv6 address (`::` and a dotted IPv4 tail allowed), or null. */
function ipv6Groups(text: string): number[] | null {
  let hex = text;
  const dotted = /^(.*:)([^:]*\.[^:]*)$/.exec(text);
  if (dotted !== null) {
    const bytes = ipv4Bytes(dotted[2] ?? '');
    if (bytes === null) return null;
    const [a = 0, b = 0, c = 0, d = 0] = bytes;
    hex = `${dotted[1] ?? ''}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = hex.split('::');
  if (halves.length > 2) return null;
  const groupsOf = (half: string) => (half === '' ? [] : half.split(':'));
  const head = groupsOf(halves[0] ?? '');
  const tail = groupsOf(halves[1] ?? '');
  if (![...head, ...tail].every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  return [...head, ...Array<string>(missing).fill('0'), ...tail].map((g) => parseInt(g, 16));
}

/**
 * The rate-limit key for a client's address (`CF-Connecting-IP`; never stored). An IPv4 address is
 * its own key. An IPv6 address counts by its /64 network, the block one home or phone is usually
 * given, so a client cannot dodge the limit by taking a fresh address from that block for every
 * request. An IPv4-mapped IPv6 address counts as its IPv4 address. A missing or unreadable header
 * is `ip:unknown`, shared by every such request.
 */
export function clientLimitKey(address: string | null): string {
  const text = (address ?? '').trim().toLowerCase();
  const v4 = ipv4Bytes(text);
  if (v4 !== null) return `ip:${v4.join('.')}`;
  const groups = ipv6Groups(text);
  if (groups === null) return 'ip:unknown';
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [hi = 0, lo = 0] = groups.slice(6);
    return `ip:${[hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.')}`;
  }
  return `ip:${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}
