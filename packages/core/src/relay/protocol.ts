/**
 * The relay's contract (checklist item 29), shared by the relay Worker (services/relay), the phone
 * (item 31), the laptop side panel (item 33) and the owner's smoke check (tools/relay/smoke.ts).
 *
 * No imports and only erasable TypeScript, so the Worker can bundle this file without the backup
 * locking code, and the smoke check can run it with Node's type stripping. None of these constants
 * is in storage/limits.ts: everything there is part of the storage fingerprint (VALIDATOR_CONSTANTS,
 * STORAGE_DESIGN 9.2), and these are protocol, not storage.
 *
 * The body check below is a format check only. It turns away raw text such as the list as JSON, but
 * it cannot tell a sealed body from encoded plain bytes: the sealing is proven by the client tests
 * (TR-01 at item 30, the end-to-end half of TR-02 at item 31).
 */

/** Protocol version 1 lives under `/v1/`. A rule change a deployed client relies on is version 2. */
export const RELAY_PROTOCOL_VERSION = 1;

/** Two slots per room: the phone's list, and the laptop's "received" note back (C52). */
export const RELAY_SLOTS = Object.freeze(['list', 'ack'] as const);
export type RelaySlot = (typeof RELAY_SLOTS)[number];

/** Bytes of the encoded HTTP request body for a list (C114). Bodies are ASCII: bytes = characters. */
export const MAX_RELAY_BODY_BYTES = 65_536;
/** Bytes of the encoded HTTP request body for an acknowledgement. */
export const MAX_RELAY_ACK_BODY_BYTES = 4_096;

export function maxRelayBodyBytes(slot: RelaySlot): number {
  return slot === 'list' ? MAX_RELAY_BODY_BYTES : MAX_RELAY_ACK_BODY_BYTES;
}

/** The production expiry, 15 minutes (DECISIONS Q1; C52). A test pins it to RELAY_TTL_MS. */
export const RELAY_TTL_SECONDS = 900;
/** The test deployment's expiry, 2 minutes (TEST_PLAN section 2). */
export const RELAY_TEST_TTL_SECONDS = 120;
/** The expiries the Worker accepts. 60 s is KV's shortest expirationTtl. */
export const RELAY_TTL_SECONDS_BOUNDS = Object.freeze({ min: 60, max: 900 });
/** Clients never poll the relay faster than this (C79). */
export const RELAY_MIN_POLL_INTERVAL_MS = 5_000;

/** The room id travels in this header, never in a URL (C113). */
export const RELAY_ROOM_HEADER = 'X-Relay-Room';
/** Every body starts with this, followed by unpadded base64url. */
export const RELAY_BODY_PREFIX = 'rl1.';
/** A 12-byte IV and a 16-byte tag around nothing: the shortest sealed body. */
export const RELAY_BODY_MIN_SEALED_BYTES = 28;

/** The phone app's origin (DECISIONS C34 row). The relay's CORS allowlist holds it. */
export const APP_ORIGIN = 'https://thezombierobot.github.io';
/**
 * The production relay's address. Null until the owner deploys it and confirms that the address
 * says nothing personal (C81); it is then set here once, and recorded in DECISIONS and the README.
 * While it is null the phone offers the paste code and the exports instead (item 31).
 */
export const RELAY_ORIGIN: string | null = null;

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ORIGIN = /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** The longest relay address, the same as transfer_pairings.relayUrl. */
const MAX_ORIGIN_LENGTH = 200;

/** 22 base64url characters: 16 random bytes. The stored transfer_pairings.roomId rule (C113). */
export function isRelayRoomId(value: unknown): value is string {
  return typeof value === 'string' && ROOM_ID.test(value);
}

/** The phone's check before sending (C114): the encoded body is within the slot's cap. */
export function relayBodyFits(body: string, slot: RelaySlot): boolean {
  return body.length <= maxRelayBodyBytes(slot);
}

/**
 * `rl1.` and unpadded base64url of at least 28 bytes, within the slot's cap. A format check: it
 * refuses raw text (JSON, spaces, line breaks), padding, `+` and `/`, and impossible lengths.
 */
export function isRelayBody(value: unknown, slot: RelaySlot): value is string {
  if (typeof value !== 'string' || !relayBodyFits(value, slot)) return false;
  if (!value.startsWith(RELAY_BODY_PREFIX)) return false;
  const rest = value.slice(RELAY_BODY_PREFIX.length);
  return (
    BASE64URL.test(rest) &&
    rest.length % 4 !== 1 &&
    Math.floor((rest.length * 3) / 4) >= RELAY_BODY_MIN_SEALED_BYTES
  );
}

/** A lower-case https origin with a host name: no port, path, trailing slash or IP address. */
export function isRelayOrigin(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ORIGIN_LENGTH && ORIGIN.test(value);
}

/** The address of one slot. The error never repeats the value it refused. */
export function relayEndpoint(origin: string, slot: RelaySlot): string {
  if (!isRelayOrigin(origin)) throw new RangeError('relay origin');
  return `${origin}/v${RELAY_PROTOCOL_VERSION}/${slot}`;
}

export type RelayOutcome =
  'stored' | 'delivered' | 'nothing-waiting' | 'too-large' | 'refused' | 'unavailable';

/**
 * How the phone and the side panel read a relay answer, so both classify alike. `status` is null
 * when there was no answer (offline, DNS, CORS or a timeout). 400 and 415 come only from a client
 * fault, so `refused` never offers the paste code, which is built from the same envelope (C12).
 * Everything else, 429 and 503 included, is `unavailable` (C80).
 */
export function relayOutcome(method: 'GET' | 'POST', status: number | null): RelayOutcome {
  if (method === 'POST' && status === 204) return 'stored';
  if (method === 'GET' && status === 200) return 'delivered';
  if (method === 'GET' && status === 204) return 'nothing-waiting';
  if (status === 413) return 'too-large';
  if (status === 400 || status === 415) return 'refused';
  return 'unavailable';
}
