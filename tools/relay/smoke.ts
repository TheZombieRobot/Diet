/**
 * The owner's check of a deployed relay (checklist item 29; design section 1.12, checks M2 to M4).
 * Run by the owner after a deploy, never in CI and never imported (tools/scans/relay.test.ts):
 *
 *   pnpm relay:smoke <relay address> [--expiry <seconds> | --limits]
 *
 * It sends only synthetic data: fresh random room ids, and bodies of random bytes or the letter A.
 * Each check prints one line, `ok: ...` or `FAILED: ...: <what was seen>`, and never a room id or a
 * body. Needs Node 22.18 or newer (type stripping), which `pnpm install` already insists on.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import {
  APP_ORIGIN,
  isRelayOrigin,
  MAX_RELAY_ACK_BODY_BYTES,
  MAX_RELAY_BODY_BYTES,
  RELAY_MIN_POLL_INTERVAL_MS,
  RELAY_ROOM_HEADER,
  relayEndpoint,
  type RelaySlot,
} from '../../packages/core/src/relay/protocol.ts';

const USAGE = 'Usage: pnpm relay:smoke <relay address> [--expiry <seconds> | --limits]';
/** How long a list may take to arrive (C79: about a minute across Cloudflare locations). */
const PICKUP_WAIT_MS = 90_000;
/** KV's read cache, plus a margin, on top of the expiry (C79). */
const EXPIRY_MARGIN_SECONDS = 40;

const say = (line: string) => process.stdout.write(`${line}\n`);
let failed = 0;
function check(name: string, passed: boolean, seen: string): void {
  if (passed) {
    say(`ok: ${name}`);
  } else {
    failed += 1;
    say(`FAILED: ${name}: ${seen}`);
  }
}

const randomText = (bytes: number) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
/** 16 random bytes: the same kind of room id the app makes. */
const freshRoom = () => randomText(16);
const freshBody = () => `rl1.${randomText(64)}`;
/** Refused for its size before its format is looked at. */
const oversize = (length: number) => `rl1.${'A'.repeat(length - 4)}`;

interface Answer {
  status: number | null;
  allowOrigin: string | null;
  text: string;
}

async function call(
  relay: string,
  slot: RelaySlot,
  init: { method: string; room?: string; body?: string; origin?: string },
): Promise<Answer> {
  const headers: Record<string, string> = { Origin: init.origin ?? APP_ORIGIN };
  if (init.room !== undefined) headers[RELAY_ROOM_HEADER] = init.room;
  if (init.method === 'OPTIONS') {
    headers['Access-Control-Request-Method'] = 'POST';
    headers['Access-Control-Request-Headers'] = `content-type, ${RELAY_ROOM_HEADER.toLowerCase()}`;
  }
  if (init.body !== undefined) headers['Content-Type'] = 'text/plain;charset=utf-8';
  try {
    const response = await fetch(relayEndpoint(relay, slot), {
      method: init.method,
      headers,
      ...(init.body === undefined ? {} : { body: init.body }),
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    return {
      status: response.status,
      allowOrigin: response.headers.get('Access-Control-Allow-Origin'),
      text: await response.text(),
    };
  } catch (error) {
    return { status: null, allowOrigin: null, text: error instanceof Error ? error.name : '' };
  }
}

/** The relay's error code, if the answer is one; never any other part of a body. */
function errorCode(answer: Answer): string | null {
  try {
    const code = (JSON.parse(answer.text) as { error?: unknown }).error;
    return typeof code === 'string' && /^[a-z-]{1,40}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function seen(answer: Answer): string {
  if (answer.status === null) return `no answer (${answer.text || 'network error'})`;
  const code = errorCode(answer);
  return code === null ? `status ${answer.status}` : `status ${answer.status} ${code}`;
}

/** Polls every 5 s, as the side panel does, until something other than "nothing waiting". */
async function collect(relay: string, slot: RelaySlot, room: string) {
  const started = Date.now();
  for (;;) {
    const answer = await call(relay, slot, { method: 'GET', room });
    const waited = Date.now() - started;
    if (answer.status !== 204 || waited >= PICKUP_WAIT_MS) {
      return { answer, seconds: Math.round(waited / 1000) };
    }
    await sleep(RELAY_MIN_POLL_INTERVAL_MS);
  }
}

async function standardChecks(relay: string): Promise<void> {
  const app = await call(relay, 'list', { method: 'OPTIONS' });
  check(
    'the app may use the relay',
    app.status === 204 && app.allowOrigin === APP_ORIGIN,
    seen(app),
  );
  const other = await call(relay, 'list', { method: 'OPTIONS', origin: 'https://example.com' });
  check('another website may not', other.status === 403 && other.allowOrigin === null, seen(other));

  const room = freshRoom();
  const list = freshBody();
  const posted = await call(relay, 'list', { method: 'POST', room, body: list });
  check('a list is stored', posted.status === 204, seen(posted));
  const first = await collect(relay, 'list', room);
  check(
    `the list arrived after ${first.seconds} seconds, unchanged`,
    first.answer.status === 200 && first.answer.text === list,
    first.answer.status === 200 ? 'a different body came back' : seen(first.answer),
  );
  const again = await call(relay, 'list', { method: 'GET', room });
  if (again.status === 200 && again.text === list) {
    say('ok: a second copy arrived (allowed; the laptop ignores it)');
  } else {
    check('a collected list is gone', again.status === 204, seen(again));
  }

  const plain = await call(relay, 'list', {
    method: 'POST',
    room,
    body: JSON.stringify({ items: [{ text: 'Example item' }] }),
  });
  check('plain text is turned away', plain.status === 400, seen(plain));
  for (const [slot, cap] of [
    ['list', MAX_RELAY_BODY_BYTES],
    ['ack', MAX_RELAY_ACK_BODY_BYTES],
  ] as const) {
    const big = await call(relay, slot, { method: 'POST', room, body: oversize(cap + 2) });
    check(
      `a ${slot} over ${cap} bytes is refused as too large, readably`,
      big.status === 413 && big.allowOrigin === APP_ORIGIN,
      seen(big),
    );
  }

  const ack = freshBody();
  const ackPosted = await call(relay, 'ack', { method: 'POST', room, body: ack });
  check('a received note is stored', ackPosted.status === 204, seen(ackPosted));
  const ackBack = await collect(relay, 'ack', room);
  check(
    `the received note arrived after ${ackBack.seconds} seconds, unchanged`,
    ackBack.answer.status === 200 && ackBack.answer.text === ack,
    ackBack.answer.status === 200 ? 'a different body came back' : seen(ackBack.answer),
  );
}

async function expiryCheck(relay: string, seconds: number): Promise<void> {
  const room = freshRoom();
  const posted = await call(relay, 'list', { method: 'POST', room, body: freshBody() });
  if (posted.status !== 204) {
    check('a list expires', false, seen(posted));
    return;
  }
  const wait = seconds + EXPIRY_MARGIN_SECONDS;
  say(`Waiting ${wait} seconds for a test list to expire.`);
  await sleep(wait * 1000);
  const late = await call(relay, 'list', { method: 'GET', room });
  check(`nothing is handed out ${wait} seconds after sending`, late.status === 204, seen(late));
}

async function limitsCheck(relay: string): Promise<void> {
  say('Waiting a minute so the earlier checks do not count towards the limit.');
  await sleep(65_000);
  const room = freshRoom();
  for (let n = 1; n <= 15; n++) {
    const answer = await call(relay, 'list', { method: 'POST', room, body: freshBody() });
    if (answer.status !== 204) {
      check(
        `rate limit refused POST number ${n}`,
        n >= 11 && answer.status === 429 && errorCode(answer) === 'rate-limited',
        seen(answer),
      );
      return;
    }
    // Over a second apart, so KV's one write a second per key is not what refuses it.
    await sleep(1_100);
  }
  check('rate limit', false, 'none of 15 POSTs in a minute was refused');
}

async function main(args: readonly string[]): Promise<number> {
  const [relay, mode, value, ...rest] = args;
  const expiry = mode === '--expiry' && /^\d{1,4}$/.test(value ?? '') ? Number(value) : null;
  const valid =
    relay !== undefined &&
    rest.length === 0 &&
    (mode === undefined || (mode === '--limits' && value === undefined) || expiry !== null);
  if (!valid) {
    say(USAGE);
    return 1;
  }
  if (!isRelayOrigin(relay)) {
    say('Use the address Wrangler printed, starting https:// with no / at the end.');
    return 1;
  }
  if (mode === '--limits') {
    await limitsCheck(relay);
  } else {
    await standardChecks(relay);
    if (expiry !== null) await expiryCheck(relay, expiry);
  }
  say(failed === 0 ? 'All checks passed' : `${failed} checks failed`);
  return failed === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
