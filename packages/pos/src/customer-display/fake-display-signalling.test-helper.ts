import {
  DisplaySignallingError, type DisplaySignalling, type DisplaySignallingContext, type DisplaySignallingErrorCode,
  type SignalMessage,
} from '@tallyui/core';
import type { SignalPort } from './webrtc';

type DisplayMethod = 'claim' | 'collect' | 'displaySendSignal' | 'displayReceiveSignals' | 'readSnapshot';
type CollectResult = Awaited<ReturnType<DisplaySignalling['collect']>>;

const tillOnly = () => Promise.reject(new Error('fake display signalling: this till-side call is not faked'));

/**
 * A fake `DisplaySignalling` whose display-side methods are real over in-memory inboxes, and whose claim, collect and
 * refusals a test scripts. The till side is only a `SignalPort` that puts its sends in the display's inbox and hears
 * what the display sends.
 */
export class FakeDisplaySignalling implements DisplaySignalling {
  /** The one token the fake accepts; `null` once the display is forgotten. */
  token: string | null = 'tok-1';
  checkCode = '4321';
  snapshot: unknown | null = null;
  readonly displayInbox: SignalMessage[] = [];
  readonly tillHeard: SignalMessage[] = [];
  /** Each display-side call, in order, with its arguments after the context. */
  readonly calls: Array<{ method: DisplayMethod; args: unknown[] }> = [];
  /** What the next collects answer, in order; when empty, `pending` with `checkCode`. */
  readonly collects: Array<CollectResult | DisplaySignallingErrorCode> = [];
  private readonly refusals: Array<{ method: DisplayMethod; code: DisplaySignallingErrorCode }> = [];
  private readonly tillListeners = new Set<(message: SignalMessage) => void>();

  /** The till's port: a send lands in the display's inbox, and every display send reaches its listeners. */
  readonly tillPort: SignalPort = {
    send: (message) => void this.displayInbox.push(message),
    onSignal: (listener) => {
      this.tillListeners.add(listener);
      return () => void this.tillListeners.delete(listener);
    },
  };

  /** The next call to `method` is refused with `code`; scripting it twice refuses two calls. */
  refuse(method: DisplayMethod, code: DisplaySignallingErrorCode) {
    this.refusals.push({ method, code });
  }
  count(method: DisplayMethod) {
    return this.calls.filter((call) => call.method === method).length;
  }

  private enter(method: DisplayMethod, args: unknown[], token?: string) {
    this.calls.push({ method, args });
    const index = this.refusals.findIndex((refusal) => refusal.method === method);
    if (index >= 0) throw new DisplaySignallingError(this.refusals.splice(index, 1)[0].code);
    if (token !== undefined && token !== this.token) throw new DisplaySignallingError('token_refused');
  }

  async claim(_dctx: DisplaySignallingContext, request: { code: string; displayName: string; token?: string }) {
    this.enter('claim', [request]);
    return { claimSecret: 'secret-1', checkCode: this.checkCode };
  }
  async collect(_dctx: DisplaySignallingContext, claimSecret: string): Promise<CollectResult> {
    this.enter('collect', [claimSecret]);
    const next = this.collects.shift();
    if (typeof next === 'string') throw new DisplaySignallingError(next);
    if (next?.status === 'paired') this.token = next.token;
    return next ?? { status: 'pending', checkCode: this.checkCode };
  }
  async displaySendSignal(_dctx: DisplaySignallingContext, token: string, message: SignalMessage) {
    this.enter('displaySendSignal', [token, message], token);
    this.tillHeard.push(message);
    this.tillListeners.forEach((listener) => listener(message));
  }
  async displayReceiveSignals(_dctx: DisplaySignallingContext, token: string) {
    this.enter('displayReceiveSignals', [token], token);
    return this.displayInbox.splice(0);
  }
  async readSnapshot(_dctx: DisplaySignallingContext, token: string) {
    this.enter('readSnapshot', [token], token);
    return this.snapshot;
  }

  mint = tillOnly;
  pending = tillOnly;
  confirm = tillOnly;
  decline = tillOnly;
  list = tillOnly;
  forget = tillOnly;
  sendSignal = tillOnly;
  receiveSignals = tillOnly;
  postSnapshot = tillOnly;
}
