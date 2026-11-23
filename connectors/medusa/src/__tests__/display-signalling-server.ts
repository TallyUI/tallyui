// A fake medusapos plugin for the display signalling routes (#1219, ADR-085 Medusa U7): HTTP in front of core's memory
// server, answering as the plugin's spec says. Every request is recorded, so tests can read what the client sent.
import { DisplaySignallingError, type DisplaySignallingContext, type SignalMessage, type SyncContext, type TillDevice } from '@tallyui/core';
import { createMemoryDisplaySignalling, type DisplaySignallingHarness } from '@tallyui/core/server';
import { medusaDisplaySignalling } from '../display-signalling';

export interface RecordedRequest { url: string; method: string; headers: Record<string, string>; credentials: RequestCredentials; body: string }

const BASE_URL = 'http://medusa.test';
const PREFIX = '/tally/v1';
/** The plugin's status for each refusal. */
const STATUS: Record<string, number> = {
  forbidden: 403, claim_refused: 403, collect_refused: 403, device_refused: 403, token_refused: 403, not_found: 404, limit: 429, too_large: 413,
};

/** A malformed body or an unknown route. */
class BadRequest extends Error {}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const asObject = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new BadRequest();
  return value as Record<string, unknown>;
};
const asString = (value: unknown): string => {
  if (typeof value !== 'string') throw new BadRequest();
  return value;
};
const asSignal = (value: unknown): SignalMessage => {
  const body = asObject(value);
  const type = asString(body.type);
  if (type !== 'offer' && type !== 'answer' && type !== 'ice') throw new BadRequest();
  return { type, payload: asString(body.payload) };
};

export function createFakeDisplayServer({ now }: { now: () => number }): {
  harness: DisplaySignallingHarness; requests: RecordedRequest[]; fail(next: Response | 'reject'): void;
} {
  const mem = createMemoryDisplaySignalling({ now });
  const s = mem.signalling;
  const requests: RecordedRequest[] = [];
  /** Bearer token → the memory server's session context. */
  const sessions = new Map<string, SyncContext>();
  let next: Response | 'reject' | undefined;

  /** Till routes: the bearer first (Medusa's own 401 for a missing or unknown session), then the device headers. */
  const tillRoute = async (req: Request, path: string, parse: () => unknown): Promise<unknown> => {
    const auth = req.headers.get('authorization') ?? '';
    const mctx = auth.startsWith('Bearer ') ? sessions.get(auth.slice('Bearer '.length)) : undefined;
    if (!mctx) return json(401, { message: 'Unauthorized' });
    const device: TillDevice = { deviceId: req.headers.get('x-tally-device-id') ?? '', deviceKey: req.headers.get('x-tally-device-key') ?? '' };
    const route = `${req.method} ${path}`;
    let m: RegExpMatchArray | null;
    if (route === 'POST /display-devices') return s.registerDevice(mctx, asString(asObject(parse()).deviceId));
    if (route === 'POST /display-codes') return s.mint(mctx, device);
    if (route === 'GET /display-pairings') return { pairings: await s.pending(mctx, device) };
    if ((m = route.match(/^POST \/display-pairings\/([^/]+)\/(confirm|decline)$/))) {
      await (m[2] === 'confirm' ? s.confirm : s.decline)(mctx, device, decodeURIComponent(m[1]!));
      return {};
    }
    if (route === 'GET /displays') return { displays: await s.list(mctx, device) };
    if ((m = route.match(/^DELETE \/displays\/([^/]+)$/))) {
      await s.forget(mctx, device, decodeURIComponent(m[1]!));
      return {};
    }
    if ((m = route.match(/^POST \/displays\/([^/]+)\/signals$/))) {
      await s.sendSignal(mctx, device, decodeURIComponent(m[1]!), asSignal(parse()));
      return {};
    }
    if (route === 'POST /display-signals/drain') return { signals: await s.receiveSignals(mctx, device) };
    if ((m = route.match(/^PUT \/displays\/([^/]+)\/snapshot$/))) {
      const body = asObject(parse());
      if (!Object.prototype.hasOwnProperty.call(body, 'snapshot')) throw new BadRequest();
      // The memory server measures the cap on what it is given: the snapshot alone, never the whole request body.
      await s.postSnapshot(mctx, device, decodeURIComponent(m[1]!), body.snapshot);
      return {};
    }
    throw new BadRequest();
  };

  /** Display routes: claim reads its token from the body only; every other route from the header only. */
  const displayRoute = async (req: Request, path: string, parse: () => unknown, dctx: DisplaySignallingContext): Promise<unknown> => {
    const token = req.headers.get('x-tally-display-token') ?? '';
    const route = `${req.method} ${path}`;
    if (route === 'POST /display/claim') {
      const body = asObject(parse());
      const claimToken = body.token === undefined ? undefined : asString(body.token);
      return s.claim(dctx, { code: asString(body.code), displayName: asString(body.displayName), ...(claimToken === undefined ? {} : { token: claimToken }) });
    }
    if (route === 'POST /display/collect') return s.collect(dctx, asString(asObject(parse()).claimSecret));
    if (route === 'POST /display/signals') {
      await s.displaySendSignal(dctx, token, asSignal(parse()));
      return {};
    }
    if (route === 'POST /display/signals/drain') return { signals: await s.displayReceiveSignals(dctx, token) };
    if (route === 'GET /display/snapshot') return { snapshot: await s.readSnapshot(dctx, token) };
    throw new BadRequest();
  };

  /** A fetch: till routes always; display routes only when bound to a display context. */
  const fetchFor = (dctx: DisplaySignallingContext | null): typeof globalThis.fetch => async (input, init) => {
    const req = new Request(input, init);
    const body = await req.text();
    const headers: Record<string, string> = {};
    req.headers.forEach((value, name) => { headers[name] = value; });
    requests.push({ url: req.url, method: req.method, headers, credentials: req.credentials, body });
    if (next !== undefined) {
      const given = next;
      next = undefined;
      if (given === 'reject') throw new TypeError('fetch failed');
      return given;
    }
    const parse = (): unknown => {
      try {
        return JSON.parse(body);
      } catch {
        throw new BadRequest();
      }
    };
    const url = new URL(req.url);
    try {
      if (url.origin !== BASE_URL || !url.pathname.startsWith(`${PREFIX}/`)) throw new BadRequest();
      const path = url.pathname.slice(PREFIX.length);
      const isDisplay = path.startsWith('/display/');
      if (isDisplay && !dctx) throw new BadRequest();
      const result = isDisplay ? await displayRoute(req, path, parse, dctx!) : await tillRoute(req, path, parse);
      return result instanceof Response ? result : json(200, result);
    } catch (error) {
      if (!(error instanceof DisplaySignallingError)) return json(400, { code: 'server', message: 'bad request' });
      // Deliberately carries a secret and differs per request, so tests prove the client drops it.
      const secret = req.headers.get('x-tally-display-token') ?? req.headers.get('x-tally-device-key') ?? '';
      return json(STATUS[error.code] ?? 500, { code: error.code, message: `server says ${error.code} for ${secret}` });
    }
  };

  const tillFetch = fetchFor(null);
  const harness: DisplaySignallingHarness = {
    signalling: medusaDisplaySignalling,
    async till(cashier) {
      const mctx = await mem.harness.till(cashier);
      const bearer = globalThis.crypto.randomUUID();
      sessions.set(bearer, mctx);
      return { connectorId: 'medusa', baseUrl: BASE_URL, headers: { Authorization: `Bearer ${bearer}` }, fetch: tillFetch };
    },
    display: (source) => ({ baseUrl: BASE_URL, fetch: fetchFor(mem.harness.display(source)) }),
    advance: (ms) => mem.harness.advance(ms),
    storedText: () => mem.harness.storedText(),
    storedCounts: () => mem.harness.storedCounts(),
    seedLegacyDevice: (deviceId) => mem.harness.seedLegacyDevice(deviceId),
    adoptionLog: () => mem.harness.adoptionLog(),
  };
  return { harness, requests, fail: (given) => { next = given; } };
}
