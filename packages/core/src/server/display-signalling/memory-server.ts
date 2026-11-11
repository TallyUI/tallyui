// The in-memory reference server for the display signalling seam (ADR-085 U2). It uses Web Crypto only
// (globalThis.crypto.getRandomValues and crypto.subtle.digest) and no `node:` import, so U6 can run it in a browser.
import type { SyncContext } from '../../types/connector';
import {
  DISPLAY_PAIR_CAPABILITY, DisplaySignallingError,
  type DisplaySignalling, type DisplaySignallingContext, type DisplaySignallingErrorCode, type SignalMessage,
} from '../../types/display-signalling';
import { rateLimitSource } from '../../customer-display/rate-limit-source';

/** What the contract suite drives; each plugin's U7 implements it for its own routes. */
export interface DisplaySignallingHarness {
  signalling: DisplaySignalling;
  /** A cashier session on the server, with or without `customer_display.pair`. */
  till(cashier: { cashierId: string; canPair: boolean }): SyncContext | Promise<SyncContext>;
  /** A display-side context whose requests come from `source`, an IPv4 or IPv6 address. */
  display(source: string): DisplaySignallingContext;
  /** Moves the server's clock. */
  advance(ms: number): Promise<void>;
  /** Everything the server persists, serialised. */
  storedText(): Promise<string>;
  storedCounts(): Promise<{ codes: number; pending: number; displays: number; snapshots: number }>;
}

const MINUTE = 60_000;
const CODE_TTL = 10 * MINUTE, MAX_UNSPENT = 5, SNAPSHOT_TTL = MINUTE, SNAPSHOT_MAX_BYTES = 204_800;
const SOURCE_WINDOW = MINUTE, SOURCE_MAX = 10, STORE_WINDOW = 10 * MINUTE, STORE_MAX = 100;
/** `CONNECTED_MS` is the reference server's rule for `connected`; a plugin may be stricter. */
const CONNECTED_MS = 30_000, ROW_TTL = 30 * 24 * 60 * MINUTE;
const SESSION_HEADER = 'x-memory-display-session', BASE_URL = 'memory://display-signalling';

const randomBytes = (length: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(length));
const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const newId = (): string => toHex(randomBytes(16));
/** 128 bits, base64url without padding: 22 characters. */
const newSecret = (): string =>
  btoa(String.fromCharCode(...randomBytes(16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** SHA-256 of the UTF-8 text, as lower-case hex. */
export const sha256Hex = async (text: string): Promise<string> =>
  toHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

/** `digits` uniform random decimal digits, by rejection sampling so no value is favoured. */
function randomDigits(digits: number): string {
  const range = 10 ** digits, limit = Math.floor(2 ** 32 / range) * range;
  for (;;) {
    const [value] = globalThis.crypto.getRandomValues(new Uint32Array(1));
    if (value < limit) return String(value % range).padStart(digits, '0');
  }
}

const fail = (code: DisplaySignallingErrorCode): DisplaySignallingError => new DisplaySignallingError(code);
const iso = (ms: number): string => new Date(ms).toISOString();
/** Empties an inbox, giving what it held in send order. */
const drain = <T>(map: Map<string, T[]>, key: string): T[] => {
  const box = map.get(key) ?? [];
  map.delete(key);
  return box;
};

interface Code { deviceId: string; expiresAt: number; spent: boolean }
interface Pending { deviceId: string; secretHash: string; displayName: string; checkCode: string; expiresAt: number; movingDisplayId: string | null }
interface Row { deviceId: string; name: string; cashierId: string; confirmedAt: number; lastSeenAt: number | null; tokenHash: string | null; secretHash: string | null }
interface Window { openedAt: number; failures: number }

/** The ADR-085 U2 reference server: every rule of the seam, in memory, with lazy pruning on every call. */
export function createMemoryDisplaySignalling(options: { now?: () => number } = {}): { signalling: DisplaySignalling; harness: DisplaySignallingHarness } {
  let offset = 0;
  const clock = (): number => (options.now ?? Date.now)() + offset;
  const sessions = new Map<string, { cashierId: string; capabilities: string[] }>();
  const sourceOf = new WeakMap<DisplaySignallingContext, string>();
  const codes = new Map<string, Code>(), pending = new Map<string, Pending>(), displays = new Map<string, Row>();
  const snapshots = new Map<string, { text: string; postedAt: number }>(), sources = new Map<string, Window>();
  const displayInbox = new Map<string, SignalMessage[]>(), tillInbox = new Map<string, Array<SignalMessage & { displayId: string }>>();
  let storeWindow: Window | null = null;
  const dropDisplay = (displayId: string): void => [displays, snapshots, displayInbox].forEach((map) => map.delete(displayId));

  /** Deletes whatever has expired, and gives the time the call runs at. */
  const prune = (): number => {
    const now = clock();
    for (const [code, entry] of codes) if (now >= entry.expiresAt) codes.delete(code);
    for (const [claimId, entry] of pending) if (now >= entry.expiresAt) pending.delete(claimId);
    for (const [displayId, entry] of snapshots) if (now >= entry.postedAt + SNAPSHOT_TTL) snapshots.delete(displayId);
    for (const [displayId, row] of displays) if (now >= (row.lastSeenAt ?? row.confirmedAt) + ROW_TTL) dropDisplay(displayId);
    for (const [key, window] of sources) if (now >= window.openedAt + SOURCE_WINDOW) sources.delete(key);
    if (storeWindow && now >= storeWindow.openedAt + STORE_WINDOW) storeWindow = null;
    return now;
  };

  /** Prunes, then admits a session holding `customer_display.pair`: the call's time and its cashier. */
  const admit = (ctx: SyncContext): { now: number; cashierId: string } => {
    const now = prune();
    const session = sessions.get(ctx.headers?.[SESSION_HEADER] ?? '');
    if (!session || !session.capabilities.includes(DISPLAY_PAIR_CAPABILITY)) throw fail('forbidden');
    return { now, cashierId: session.cashierId };
  };
  /** The entry under `id` when `deviceId` owns it; `not_found` otherwise. */
  const ownedIn = <T extends { deviceId: string }>(map: Map<string, T>, deviceId: string, id: string): T => {
    const entry = map.get(id);
    if (!entry || entry.deviceId !== deviceId) throw fail('not_found');
    return entry;
  };
  const findByTokenHash = (tokenHash: string): [string, Row] | undefined => [...displays].find(([, row]) => row.tokenHash === tokenHash);
  /** The display a token names; a successful call marks it seen. */
  const byToken = async (token: string): Promise<[string, Row]> => {
    const tokenHash = await sha256Hex(token);
    const now = prune();
    const found = findByTokenHash(tokenHash);
    if (!found) throw fail('token_refused');
    found[1].lastSeenAt = now;
    return found;
  };
  /** Counts a failed claim in its source's window and the store-wide one, each opened by its first failure; gives the refusal. */
  const failedClaim = (key: string, now: number): DisplaySignallingError => {
    const window = sources.get(key);
    sources.set(key, { openedAt: window?.openedAt ?? now, failures: (window?.failures ?? 0) + 1 });
    storeWindow = { openedAt: storeWindow?.openedAt ?? now, failures: (storeWindow?.failures ?? 0) + 1 };
    return fail('claim_refused');
  };

  const signalling: DisplaySignalling = {
    async mint(ctx, deviceId) {
      const { now } = admit(ctx);
      const unspent = [...codes.values()].filter((entry) => entry.deviceId === deviceId && !entry.spent).length;
      if (unspent >= MAX_UNSPENT) throw fail('limit');
      let code: string;
      do code = randomDigits(6); while (codes.has(code));
      codes.set(code, { deviceId, expiresAt: now + CODE_TTL, spent: false });
      return { code, expiresAt: iso(now + CODE_TTL) };
    },
    async pending(ctx, deviceId) {
      admit(ctx);
      return [...pending].filter(([, entry]) => entry.deviceId === deviceId)
        .map(([claimId, entry]) => ({ claimId, displayName: entry.displayName, checkCode: entry.checkCode, expiresAt: iso(entry.expiresAt) }));
    },
    async confirm(ctx, deviceId, claimId) {
      const { now, cashierId } = admit(ctx);
      const entry = ownedIn(pending, deviceId, claimId);
      pending.delete(claimId);
      // A moving display: its old row, token and snapshot go in this same step, and its id carries over.
      const moving = entry.movingDisplayId !== null && displays.has(entry.movingDisplayId) ? entry.movingDisplayId : null;
      if (moving !== null) dropDisplay(moving);
      // The token itself is made at the first collect, so only its hash is ever stored; the claim secret's hash waits here.
      const row: Row = { deviceId, name: entry.displayName, cashierId, confirmedAt: now, lastSeenAt: null, tokenHash: null, secretHash: entry.secretHash };
      displays.set(moving ?? newId(), row);
    },
    async decline(ctx, deviceId, claimId) {
      admit(ctx);
      ownedIn(pending, deviceId, claimId);
      pending.delete(claimId);
    },
    async list(ctx, deviceId) {
      const { now } = admit(ctx);
      return [...displays].filter(([, row]) => row.deviceId === deviceId).map(([displayId, row]) => ({
        displayId, name: row.name, cashierId: row.cashierId,
        lastSeenAt: row.lastSeenAt === null ? null : iso(row.lastSeenAt),
        connected: row.lastSeenAt !== null && now - row.lastSeenAt <= CONNECTED_MS,
      }));
    },
    async forget(ctx, deviceId, displayId) {
      admit(ctx);
      ownedIn(displays, deviceId, displayId);
      dropDisplay(displayId);
    },
    async sendSignal(ctx, deviceId, displayId, message) {
      admit(ctx);
      ownedIn(displays, deviceId, displayId);
      displayInbox.set(displayId, [...(displayInbox.get(displayId) ?? []), { type: message.type, payload: message.payload }]);
    },
    async receiveSignals(ctx, deviceId) {
      admit(ctx);
      return drain(tillInbox, deviceId).filter((message) => displays.get(message.displayId)?.deviceId === deviceId);
    },
    async postSnapshot(ctx, deviceId, displayId, body) {
      const { now } = admit(ctx);
      ownedIn(displays, deviceId, displayId);
      const text = JSON.stringify(body) ?? 'null';
      if (new TextEncoder().encode(text).length > SNAPSHOT_MAX_BYTES) throw fail('too_large');
      snapshots.set(displayId, { text, postedAt: now });
    },
    async claim(dctx, { code, displayName, token }) {
      // Hash first, so the check and the spend below run with no await between them.
      const claimSecret = newSecret();
      const secretHash = await sha256Hex(claimSecret);
      const tokenHash = token ? await sha256Hex(token) : null;
      const now = prune();
      const key = rateLimitSource(sourceOf.get(dctx) ?? '');
      if ((storeWindow?.failures ?? 0) >= STORE_MAX || (sources.get(key)?.failures ?? 0) >= SOURCE_MAX) throw fail('claim_refused');
      const entry = codes.get(code);
      if (!entry || entry.spent) throw failedClaim(key, now);
      entry.spent = true;
      let checkCode: string;
      do checkCode = randomDigits(4); while ([...pending.values()].some((other) => other.checkCode === checkCode));
      const movingDisplayId = tokenHash === null ? null : (findByTokenHash(tokenHash)?.[0] ?? null);
      pending.set(newId(), { deviceId: entry.deviceId, secretHash, displayName, checkCode, expiresAt: entry.expiresAt, movingDisplayId });
      return { claimSecret, checkCode };
    },
    async collect(_dctx, claimSecret) {
      const secretHash = await sha256Hex(claimSecret);
      const token = newSecret();
      const tokenHash = await sha256Hex(token);
      prune();
      const waiting = [...pending.values()].find((entry) => entry.secretHash === secretHash);
      if (waiting) return { status: 'pending', checkCode: waiting.checkCode };
      const found = [...displays].find(([, row]) => row.secretHash === secretHash && row.tokenHash === null);
      if (!found) throw fail('collect_refused');
      found[1].secretHash = null;
      found[1].tokenHash = tokenHash;
      return { status: 'paired', displayId: found[0], token };
    },
    async displaySendSignal(_dctx, token, message) {
      const [displayId, row] = await byToken(token);
      tillInbox.set(row.deviceId, [...(tillInbox.get(row.deviceId) ?? []), { type: message.type, payload: message.payload, displayId }]);
    },
    async displayReceiveSignals(_dctx, token) {
      const [displayId] = await byToken(token);
      return drain(displayInbox, displayId);
    },
    async readSnapshot(_dctx, token) {
      const [displayId] = await byToken(token);
      const held = snapshots.get(displayId);
      return held ? (JSON.parse(held.text) as unknown) : null;
    },
  };

  const harness: DisplaySignallingHarness = {
    signalling,
    till({ cashierId, canPair }) {
      const sessionId = newId();
      sessions.set(sessionId, { cashierId, capabilities: canPair ? [DISPLAY_PAIR_CAPABILITY] : [] });
      return { connectorId: 'memory-display-signalling', baseUrl: BASE_URL, headers: { [SESSION_HEADER]: sessionId } };
    },
    display(source) {
      const dctx: DisplaySignallingContext = { baseUrl: BASE_URL };
      sourceOf.set(dctx, source);
      return dctx;
    },
    advance: async (ms) => { offset += ms; },
    async storedText() {
      prune();
      return JSON.stringify({
        sessions: [...sessions], codes: [...codes], pending: [...pending], displays: [...displays], snapshots: [...snapshots], displayInbox: [...displayInbox], tillInbox: [...tillInbox], sources: [...sources], storeWindow,
      });
    },
    async storedCounts() {
      prune();
      return { codes: codes.size, pending: pending.size, displays: displays.size, snapshots: snapshots.size };
    },
  };
  return { signalling, harness };
}
