// The customer display signalling client for the medusapos plugin's `/tally/v1` display routes (ADR-085 Medusa U7,
// #1219). Stateless: one request per seam call, no retry. A refusal is only ever `new DisplaySignallingError(code)`:
// no server text, status, URL, header, body or cause reaches it, so no key, token, secret or code can leak through it.
import {
  DisplaySignallingError,
  type DisplayRecord, type DisplaySignalling, type DisplaySignallingContext, type DisplaySignallingErrorCode,
  type PendingPairing, type SignalMessage, type SyncContext, type TillDevice,
} from '@tallyui/core';

const PREFIX = '/tally/v1';

/** #1219: a body `code` counts only at its own status; any other code, or a code at another status, is `server`. */
const CODES_BY_STATUS: Record<number, readonly DisplaySignallingErrorCode[]> = {
  403: ['forbidden', 'claim_refused', 'collect_refused', 'device_refused', 'token_refused'],
  404: ['not_found'],
  429: ['limit'],
};

type Side =
  | { till: true; ctx: SyncContext; device?: TillDevice }
  | { till: false; dctx: DisplaySignallingContext; token?: string };

const refuse = (code: DisplaySignallingErrorCode): DisplaySignallingError => new DisplaySignallingError(code);

/** The string `code` of a JSON object body, or undefined when the body is not JSON, not an object, or has none. */
async function bodyCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    const code = body !== null && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

/** Maps a non-2xx answer to the seam's code, by the ordered rules of #1219. */
async function refusalCode(res: Response, till: boolean): Promise<DisplaySignallingErrorCode> {
  // M2: a body refused with 400 or 413 is not re-sent (docs/DECISIONS.md:6142). pos re-sends `server`
  // (packages/pos/src/customer-display/snapshot-fallback.ts:45-46) but not `too_large`, so both read by status alone.
  if (res.status === 400 || res.status === 413) return 'too_large';
  const code = await bodyCode(res);
  // M5: a till-side 401 with no code is Medusa's own refusal of a missing or expired session; the plugin never answers 401.
  if (res.status === 401 && till && code === undefined) return 'forbidden';
  // Any other 401 is in no row of the table, so it is `server` like every unnamed answer.
  return CODES_BY_STATUS[res.status]?.find((known) => known === code) ?? 'server';
}

/** Sends one request and gives the 2xx response; every failure is a `DisplaySignallingError`. */
async function request(side: Side, method: string, path: string, body?: unknown): Promise<Response> {
  const base = side.till ? side.ctx : side.dctx;
  // The display side never reads ctx headers: a display holds no store credential.
  const headers = side.till ? new Headers(side.ctx.headers) : new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  // Set last, so no ctx header in any case overrides them.
  if (side.till && side.device) {
    headers.set('X-Tally-Device-Id', side.device.deviceId);
    headers.set('X-Tally-Device-Key', side.device.deviceKey);
  }
  if (!side.till && side.token !== undefined) headers.set('X-Tally-Display-Token', side.token);
  const doFetch = base.fetch ?? globalThis.fetch;
  let res: Response;
  try {
    // Joined like capabilities.ts: the base URL as given, then the path.
    res = await doFetch(new URL(`${base.baseUrl}${PREFIX}${path}`), {
      method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(side.till ? { signal: side.ctx.signal } : { credentials: 'omit' as const }),
    });
  } catch {
    // M7: any rejection, an abort included.
    throw refuse('network');
  }
  if (!res.ok) throw refuse(await refusalCode(res, side.till));
  return res;
}

/** The 2xx body as a JSON object; anything else is `server`. */
async function read(res: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw refuse('server');
  }
  return object(body);
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw refuse('server');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw refuse('server');
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw refuse('server');
  return value;
}
function signal(value: unknown): SignalMessage {
  const entry = object(value);
  const type = text(entry.type);
  if (type !== 'offer' && type !== 'answer' && type !== 'ice') throw refuse('server');
  return { type, payload: text(entry.payload) };
}
function pairing(value: unknown): PendingPairing {
  const entry = object(value);
  return { claimId: text(entry.claimId), displayName: text(entry.displayName), checkCode: text(entry.checkCode), expiresAt: text(entry.expiresAt) };
}
function display(value: unknown): DisplayRecord {
  const entry = object(value);
  if (entry.lastSeenAt !== null && typeof entry.lastSeenAt !== 'string') throw refuse('server');
  if (typeof entry.connected !== 'boolean') throw refuse('server');
  return { displayId: text(entry.displayId), name: text(entry.name), cashierId: text(entry.cashierId), lastSeenAt: entry.lastSeenAt, connected: entry.connected };
}

const id = encodeURIComponent;
const till = (ctx: SyncContext, device?: TillDevice): Side => ({ till: true, ctx, device });
const shown = (dctx: DisplaySignallingContext, token?: string): Side => ({ till: false, dctx, token });

/** The medusapos plugin's display signalling (ADR-085 d2): the till side rides the admin user's Bearer session. */
export const medusaDisplaySignalling: DisplaySignalling = {
  async registerDevice(ctx, deviceId) {
    const body = await read(await request(till(ctx), 'POST', '/display-devices', { deviceId }));
    return { deviceKey: text(body.deviceKey) };
  },
  async mint(ctx, device) {
    const body = await read(await request(till(ctx, device), 'POST', '/display-codes'));
    return { code: text(body.code), expiresAt: text(body.expiresAt) };
  },
  async pending(ctx, device) {
    return list((await read(await request(till(ctx, device), 'GET', '/display-pairings'))).pairings).map(pairing);
  },
  async confirm(ctx, device, claimId) {
    await request(till(ctx, device), 'POST', `/display-pairings/${id(claimId)}/confirm`);
  },
  async decline(ctx, device, claimId) {
    await request(till(ctx, device), 'POST', `/display-pairings/${id(claimId)}/decline`);
  },
  async list(ctx, device) {
    return list((await read(await request(till(ctx, device), 'GET', '/displays'))).displays).map(display);
  },
  async forget(ctx, device, displayId) {
    await request(till(ctx, device), 'DELETE', `/displays/${id(displayId)}`);
  },
  async sendSignal(ctx, device, displayId, message) {
    await request(till(ctx, device), 'POST', `/displays/${id(displayId)}/signals`, { type: message.type, payload: message.payload });
  },
  async receiveSignals(ctx, device) {
    const signals = list((await read(await request(till(ctx, device), 'POST', '/display-signals/drain'))).signals);
    return signals.map((value) => ({ ...signal(value), displayId: text(object(value).displayId) }));
  },
  async postSnapshot(ctx, device, displayId, body) {
    // The server measures the 204 800-byte cap on the snapshot alone; the client sends it as given.
    await request(till(ctx, device), 'PUT', `/displays/${id(displayId)}/snapshot`, { snapshot: body });
  },
  async claim(dctx, { code, displayName, token }) {
    // The token travels only in the body here, never in the header.
    const body = await read(await request(shown(dctx), 'POST', '/display/claim', { code, displayName, ...(token === undefined ? {} : { token }) }));
    return { claimSecret: text(body.claimSecret), checkCode: text(body.checkCode) };
  },
  async collect(dctx, claimSecret) {
    const body = await read(await request(shown(dctx), 'POST', '/display/collect', { claimSecret }));
    if (body.status === 'pending') return { status: 'pending', checkCode: text(body.checkCode) };
    if (body.status === 'paired') return { status: 'paired', displayId: text(body.displayId), token: text(body.token) };
    throw refuse('server');
  },
  async displaySendSignal(dctx, token, message) {
    await request(shown(dctx, token), 'POST', '/display/signals', { type: message.type, payload: message.payload });
  },
  async displayReceiveSignals(dctx, token) {
    return list((await read(await request(shown(dctx, token), 'POST', '/display/signals/drain'))).signals).map(signal);
  },
  async readSnapshot(dctx, token) {
    const { snapshot } = await read(await request(shown(dctx, token), 'GET', '/display/snapshot'));
    return snapshot ?? null;
  },
};
