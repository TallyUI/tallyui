import type { SyncContext } from './connector';

/** The capability a cashier session needs for every till-side signalling call (ADR-085 d4, d5); each platform maps it onto its own roles. */
export const DISPLAY_PAIR_CAPABILITY = 'customer_display.pair';

/** One ICE server, in the shape `RTCPeerConnection` takes (ADR-085 d7). */
export interface IceServer { urls: string | string[]; username?: string; credential?: string }

/** The store's display advertisement from `GET /tally/v1/info` (`customerDisplay`, ADR-085 d7, d8). */
export interface DisplayAdvertisement {
  /** The ICE servers both peers use; `[]` is LAN-only. */
  iceServers: IceServer[];
  /** Whether the till posts the snapshot fallback while a display's data channel is not open. */
  snapshot: boolean;
}

export type DisplaySignallingErrorCode =
  /** Till side: no session, or the session lacks `customer_display.pair`. */
  | 'forbidden'
  /** Mint: this device already holds 5 unspent codes. */
  | 'limit'
  /** Every claim refusal: unknown, expired or spent code, rate-limited or paused. One code, so a guesser learns nothing (ADR-085 d4). */
  | 'claim_refused'
  /** Collect with an unknown, declined or expired secret, or a token already collected; it does not say which (#705). */
  | 'collect_refused'
  /** Till side: an id this device does not own, or one that is unknown or expired. */
  | 'not_found'
  /** Display side: a token that is unknown, forgotten or pruned. */
  | 'token_refused'
  /** A snapshot whose JSON is over 200 KiB. */
  | 'too_large'
  /** Transport failure: no answer from the server (connectors). */
  | 'network'
  /** Transport failure: the server answered with an error the seam does not name (connectors). */
  | 'server';

/** Every refusal of a `DisplaySignalling` method. Branch on `code`. */
export class DisplaySignallingError extends Error {
  readonly code: DisplaySignallingErrorCode;
  constructor(code: DisplaySignallingErrorCode, message: string = code) {
    super(message);
    this.name = 'DisplaySignallingError';
    this.code = code;
  }
}

/** The display side's context: a display has no login, only the store's address. */
export interface DisplaySignallingContext { baseUrl: string; fetch?: typeof globalThis.fetch }

/** A claim waiting for the minting till's cashier. */
export interface PendingPairing {
  claimId: string;
  displayName: string;
  /** 4 digits, shown on the display and on the till, so the cashier can see which display asks (#705). */
  checkCode: string;
  /** ISO 8601: the code's expiry, when an unconfirmed claim is deleted. */
  expiresAt: string;
}

/** A paired display in the server's registry (ADR-085 d6). */
export interface DisplayRecord {
  displayId: string;
  name: string;
  /** The cashier who confirmed the pairing. */
  cashierId: string;
  /** ISO 8601 of the last successful display-side token call, or `null` when never seen. */
  lastSeenAt: string | null;
  /** Whether the display was seen recently (the reference server: within the last 30 s). */
  connected: boolean;
}

/** One WebRTC signalling message; `payload` is opaque to the server. */
export interface SignalMessage { type: 'offer' | 'answer' | 'ice'; payload: string }

/**
 * The platform-neutral signalling seam for a second-device customer display (ADR-085 d2). Each backend's plugin
 * implements the routes its own way; every implementation meets this floor (d4–d6, d8, #705), which
 * `displaySignallingContract` in `@tallyui/core/server` tests. A plugin may be stricter.
 * Till side: every call takes a cashier session and the till's device id; a session without `customer_display.pair`
 * gets `forbidden`, and an id this device does not own gets `not_found`. Display side: no login; calls are gated by the
 * display's token (`token_refused`), and each successful token call updates `lastSeenAt`. Every refusal is a
 * `DisplaySignallingError`.
 */
export interface DisplaySignalling {
  /** A pairing code: 6+ digits from `crypto.getRandomValues`, single use, live at most 10 minutes; a 6th unspent code per device gives `limit`. */
  mint(ctx: SyncContext, deviceId: string): Promise<{ code: string; expiresAt: string }>;
  /** The live claims on codes this device minted, each with its check code. */
  pending(ctx: SyncContext, deviceId: string): Promise<PendingPairing[]>;
  /**
   * Confirms a claim on a code this device minted, recording the display as owned by this device and cashier. The
   * display then collects its token: 128 bits, base64url, stored only as SHA-256 hex. A claim that carried a valid
   * token moves that display: its old row, token and snapshot go in the same step, and this device owns the same id.
   */
  confirm(ctx: SyncContext, deviceId: string, claimId: string): Promise<void>;
  /** Declines a claim on a code this device minted: the pending pairing is deleted, and nothing is issued. */
  decline(ctx: SyncContext, deviceId: string, claimId: string): Promise<void>;
  /** The displays this device owns. A display unseen for 30 days is pruned with its token and snapshot. */
  list(ctx: SyncContext, deviceId: string): Promise<DisplayRecord[]>;
  /** Deletes the display's row, token hash and snapshot at once; the token is refused on its next call. */
  forget(ctx: SyncContext, deviceId: string, displayId: string): Promise<void>;
  /** Queues a message in an owned display's inbox. */
  sendSignal(ctx: SyncContext, deviceId: string, displayId: string, message: SignalMessage): Promise<void>;
  /** Drains this device's inbox: each message once, in send order, only from displays it owns. */
  receiveSignals(ctx: SyncContext, deviceId: string): Promise<Array<SignalMessage & { displayId: string }>>;
  /** Keeps `body` as the display's only snapshot for at most 60 s; over 204 800 UTF-8 bytes of JSON gives `too_large` and keeps the old one. */
  postSnapshot(ctx: SyncContext, deviceId: string, displayId: string, body: unknown): Promise<void>;
  /**
   * Claims a live code: the first claim spends it and records a pending pairing with `displayName` and a fresh 4-digit
   * check code, unique among live pending pairings, and returns a claim secret (128 bits, base64url, stored only as a
   * hash); no token. `token` is the display's current token, if any, so a confirm moves it. A claim naming no live code
   * fails and spends nothing. Failed claims are limited per source (10 a minute, IPv6 by /64 via `rateLimitSource`) and
   * store-wide (100 per 10 minutes); over either, every claim is refused and spends nothing. Every refusal is `claim_refused`.
   */
  claim(dctx: DisplaySignallingContext, request: { code: string; displayName: string; token?: string }): Promise<{ claimSecret: string; checkCode: string }>;
  /** Pending: `pending` with the check code. After the confirm the first collect gives `paired` with the token; later, declined, expired or unknown gives `collect_refused`. */
  collect(dctx: DisplaySignallingContext, claimSecret: string): Promise<{ status: 'pending'; checkCode: string } | { status: 'paired'; displayId: string; token: string }>;
  /** Queues a message in the owning till's inbox. */
  displaySendSignal(dctx: DisplaySignallingContext, token: string, message: SignalMessage): Promise<void>;
  /** Drains this display's own inbox: each message once, in send order. */
  displayReceiveSignals(dctx: DisplaySignallingContext, token: string): Promise<SignalMessage[]>;
  /** The display's latest snapshot, or `null` when none is held. */
  readSnapshot(dctx: DisplaySignallingContext, token: string): Promise<unknown | null>;
}
