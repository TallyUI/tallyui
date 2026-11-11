import {
  DisplaySignallingError, type DisplayRecord, type DisplaySignalling, type DisplaySignallingErrorCode, type SignalMessage,
} from '@tallyui/core';
import type { PendingPairing } from '@tallyui/core';
import type { SignalPort } from './webrtc';

type TillMethod = 'list' | 'sendSignal' | 'receiveSignals' | 'postSnapshot';
export interface FakeCall { method: TillMethod; displayId?: string; body?: unknown }

const notUsed = () => {
  throw new Error('not used');
};

export function record(displayId: string, extra: Partial<DisplayRecord> = {}): DisplayRecord {
  return { displayId, name: `Display ${displayId}`, cashierId: 'c1', lastSeenAt: null, connected: true, ...extra };
}

/**
 * A fake `DisplaySignalling`. The till side records every call, keeps an inbox per side, and fails a method with a
 * given code while told to; the display side is a `SignalPort` per display, for a `createDisplayPeerLink`.
 */
export class FakeSignalling implements DisplaySignalling {
  displays: DisplayRecord[] = [];
  readonly calls: FakeCall[] = [];
  readonly tillInbox: Array<SignalMessage & { displayId: string }> = [];
  readonly displayInbox = new Map<string, SignalMessage[]>();
  private readonly failures = new Map<TillMethod, { code: DisplaySignallingErrorCode; displayId?: string }>();
  private readonly displayListeners = new Map<string, Set<(message: SignalMessage) => void>>();

  /** Fails `method` (for one display only, when given) with `code` until `heal`. */
  fail(method: TillMethod, code: DisplaySignallingErrorCode, displayId?: string) {
    this.failures.set(method, { code, displayId });
  }
  heal(method: TillMethod) {
    this.failures.delete(method);
  }
  called(method: TillMethod) {
    return this.calls.filter((call) => call.method === method);
  }
  snapshots(displayId: string) {
    return this.called('postSnapshot').filter((call) => call.displayId === displayId).map((call) => call.body as {
      seq: number; config: { display: { id: string } }; event: { action: string };
    });
  }

  private async enter(call: FakeCall) {
    this.calls.push(call);
    const failure = this.failures.get(call.method);
    if (failure && (failure.displayId === undefined || failure.displayId === call.displayId)) {
      throw new DisplaySignallingError(failure.code);
    }
  }

  async list() {
    await this.enter({ method: 'list' });
    return this.displays.map((display) => ({ ...display }));
  }
  async sendSignal(_ctx: unknown, _deviceId: string, displayId: string, message: SignalMessage) {
    await this.enter({ method: 'sendSignal', displayId });
    const inbox = this.displayInbox.get(displayId) ?? [];
    inbox.push(message);
    this.displayInbox.set(displayId, inbox);
    setTimeout(() => this.drainDisplay(displayId), 0);
  }
  async receiveSignals() {
    await this.enter({ method: 'receiveSignals' });
    return this.tillInbox.splice(0);
  }
  async postSnapshot(_ctx: unknown, _deviceId: string, displayId: string, body: unknown) {
    await this.enter({ method: 'postSnapshot', displayId, body });
  }

  /** A display's side of its mailbox: its sends reach the till's inbox, and the till's reach its listener. */
  displayPort(displayId: string): SignalPort {
    const listeners = this.displayListeners.get(displayId) ?? new Set();
    this.displayListeners.set(displayId, listeners);
    return {
      send: (message) => void this.tillInbox.push({ ...message, displayId }),
      onSignal: (listener) => {
        listeners.add(listener);
        setTimeout(() => this.drainDisplay(displayId), 0);
        return () => void listeners.delete(listener);
      },
    };
  }
  private drainDisplay(displayId: string) {
    const listeners = this.displayListeners.get(displayId);
    if (!listeners?.size) return;
    for (const message of this.displayInbox.get(displayId)?.splice(0) ?? []) listeners.forEach((listener) => listener(message));
  }

  mint = notUsed;
  pending = notUsed;
  confirm = notUsed;
  decline = notUsed;
  forget = notUsed;
  claim = notUsed;
  collect = notUsed;
  displaySendSignal = notUsed;
  displayReceiveSignals = notUsed;
  readSnapshot = notUsed;
}

type PairingMethod = 'mint' | 'pending' | 'confirm' | 'decline' | 'forget';
export interface PairingCall { method: PairingMethod; id?: string }

export function pendingClaim(claimId: string, checkCode: string): PendingPairing {
  return { claimId, displayName: `Display ${claimId}`, checkCode, expiresAt: '2026-11-11T10:10:00.000Z' };
}

/**
 * A fake `DisplaySignalling` for the till's pairing flow: it mints numbered codes that expire at `expiresAt`, lists
 * `claims`, drops a claim on its confirm or decline, records every call, and fails a method with a code while told to.
 */
export class FakePairingSignalling implements DisplaySignalling {
  claims: PendingPairing[] = [];
  expiresAt = '2026-11-11T10:10:00.000Z';
  readonly calls: PairingCall[] = [];
  private readonly failures = new Map<PairingMethod, DisplaySignallingErrorCode>();
  private readonly holds = new Map<PairingMethod, Promise<void>>();

  /** Holds the next call of `method`, after it is recorded, until the returned release. */
  hold(method: PairingMethod): () => void {
    let release = () => {};
    this.holds.set(method, new Promise<void>((resolve) => { release = resolve; }));
    return release;
  }
  fail(method: PairingMethod, code: DisplaySignallingErrorCode) {
    this.failures.set(method, code);
  }
  heal(method: PairingMethod) {
    this.failures.delete(method);
  }
  called(method: PairingMethod) {
    return this.calls.filter((call) => call.method === method);
  }
  private async enter(method: PairingMethod, id?: string) {
    this.calls.push(id === undefined ? { method } : { method, id });
    const held = this.holds.get(method);
    this.holds.delete(method);
    await held;
    const code = this.failures.get(method);
    if (code) throw new DisplaySignallingError(code);
  }

  async mint() {
    await this.enter('mint');
    return { code: String(100_000 + this.called('mint').length), expiresAt: this.expiresAt };
  }
  async pending() {
    await this.enter('pending');
    return this.claims.map((claim) => ({ ...claim }));
  }
  async confirm(_ctx: unknown, _deviceId: string, claimId: string) {
    await this.enter('confirm', claimId);
    this.claims = this.claims.filter((claim) => claim.claimId !== claimId);
  }
  async decline(_ctx: unknown, _deviceId: string, claimId: string) {
    await this.enter('decline', claimId);
    this.claims = this.claims.filter((claim) => claim.claimId !== claimId);
  }
  async forget(_ctx: unknown, _deviceId: string, displayId: string) {
    await this.enter('forget', displayId);
  }

  list = notUsed;
  sendSignal = notUsed;
  receiveSignals = notUsed;
  postSnapshot = notUsed;
  claim = notUsed;
  collect = notUsed;
  displaySendSignal = notUsed;
  displayReceiveSignals = notUsed;
  readSnapshot = notUsed;
}
