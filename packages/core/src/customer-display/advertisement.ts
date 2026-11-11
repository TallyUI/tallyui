import type { DisplayAdvertisement, IceServer } from '../types/display-signalling';

/**
 * v2's default ICE list: two operators' public STUN servers, so one outage does not cost the candidate (ADR-085 d7).
 */
export const DEFAULT_ICE_SERVERS: readonly IceServer[] = Object.freeze([
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
]);

const SCHEMES = ['stun:', 'stuns:', 'turn:', 'turns:'];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const defaults = (): IceServer[] => DEFAULT_ICE_SERVERS.map((server) => ({ ...server }));

/** One entry, keeping only `urls`, `username` and `credential`; `undefined` refuses the whole list. */
function parseIceServer(entry: unknown): IceServer | undefined {
  if (!isPlainObject(entry)) return undefined;
  const { urls, username, credential } = entry;
  const list = typeof urls === 'string' ? [urls] : urls;
  if (!Array.isArray(list) || list.length === 0 || !list.every(nonEmpty)) return undefined;
  if (!list.every((url) => SCHEMES.some((scheme) => url.startsWith(scheme)))) return undefined;
  const turn = list.some((url) => url.startsWith('turn:') || url.startsWith('turns:'));
  if (turn && !(nonEmpty(username) && nonEmpty(credential))) return undefined;
  return {
    urls: typeof urls === 'string' ? urls : [...list],
    ...(typeof username === 'string' ? { username } : {}),
    ...(typeof credential === 'string' ? { credential } : {}),
  };
}

/**
 * Reads `customerDisplay` of `GET /tally/v1/info` (ADR-085 d7, d8). Absent gives `undefined`: no second-device
 * display. Not a plain object, or `v` other than 1, gives `undefined` and one `warn`. `iceServers` absent gives
 * `DEFAULT_ICE_SERVERS`, `[]` is kept (LAN-only), and a refused list (a non-array, or an entry with a URL that is not
 * `stun:`, `stuns:`, `turn:` or `turns:`, or a TURN URL without both username and credential) gives the default and
 * one `warn`. `snapshot` is true only for `snapshot: 1`.
 */
export function parseDisplayAdvertisement(value: unknown, warn?: (reason: string) => void): DisplayAdvertisement | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value) || value.v !== 1) {
    warn?.('ignoring a malformed customerDisplay: no second-device display');
    return undefined;
  }
  const snapshot = value.snapshot === 1;
  if (value.iceServers === undefined) return { iceServers: defaults(), snapshot };
  const parsed = Array.isArray(value.iceServers) ? value.iceServers.map(parseIceServer) : [undefined];
  if (parsed.some((server) => server === undefined)) {
    warn?.('refused customerDisplay.iceServers, so the default STUN servers apply');
    return { iceServers: defaults(), snapshot };
  }
  return { iceServers: parsed as IceServer[], snapshot };
}
