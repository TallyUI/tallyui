// The two-device customer display's Playwright page (ADR-085 U6): one bundle, a till or a display by role. The spec
// runs the reference signalling server in Node and bridges it in through `signallingCall` (exposed by the spec).
import type { SyncContext } from '../../../packages/core/src/types/connector';
import {
  DisplaySignallingError, type DisplayAdvertisement, type DisplaySignalling, type DisplaySignallingErrorCode,
} from '../../../packages/core/src/types/display-signalling';
import { createDisplayClient, type DisplayClient, type DisplayClientPhase } from '../../../packages/pos/src/customer-display/display-client';
import { line, receiptWith } from '../../../packages/pos/src/customer-display/fixture.test-helper';
import type { DisplayConfig } from '../../../packages/pos/src/customer-display/protocol';
import { createTillDisplayService, type TillDisplayService } from '../../../packages/pos/src/customer-display/till-display-service';
import { createTillPairing, type TillPairing } from '../../../packages/pos/src/customer-display/till-pairing';
import type { PeerLinkState } from '../../../packages/pos/src/customer-display/webrtc';

type Method = keyof DisplaySignalling;
type BridgeResult = { ok: unknown } | { error: DisplaySignallingErrorCode };

/** Every method on the seam; the record type makes the compiler refuse a missing one. */
const METHODS: Record<Method, true> = {
  mint: true, pending: true, confirm: true, decline: true, list: true, forget: true, sendSignal: true,
  receiveSignals: true, postSnapshot: true, claim: true, collect: true, displaySendSignal: true,
  displayReceiveSignals: true, readSnapshot: true,
};

/** Each call goes to Node without its context (Node holds this page's own); a refusal comes back with its code. */
const signalling = Object.fromEntries(Object.keys(METHODS).map((method) => [method, async (_ctx: unknown, ...args: unknown[]) => {
  const result = await window.signallingCall(method as Method, args);
  if ('error' in result) throw new DisplaySignallingError(result.error);
  return result.ok;
}])) as unknown as DisplaySignalling;

// Placeholder contexts: the controllers only need them non-null; the bridge supplies the real ones.
const tillContext: SyncContext = { connectorId: 'bridge', baseUrl: 'bridge://', headers: {} };
const advertisement: DisplayAdvertisement = { iceServers: [], snapshot: true };
const errors: string[] = [];
const onError = (error: unknown) => void errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
/** Every peer link state each side has reported, so a test can say a link never opened. */
const linkStates: Array<PeerLinkState | 'none'> = [];

let service: TillDisplayService | null = null;
let pairing: TillPairing | null = null;
let client: DisplayClient | null = null;
const started = <T>(value: T | null): T => {
  if (!value) throw new Error('startTill() or startDisplay() first');
  return value;
};

const configFor = (display: { displayId: string; name: string }): DisplayConfig => ({
  contract: '1.0', display: { id: display.displayId, name: display.name },
  store: { id: 's1', name: 'Test store', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
});

function startTill(): void {
  service = createTillDisplayService({
    signalling, context: () => tillContext, deviceId: 'till-1', advertisement, configFor, onError,
  });
  const own = service;
  own.onChange(() => own.displays.forEach((entry) => linkStates.push(entry.link)));
  pairing = createTillPairing({ signalling, context: () => tillContext, deviceId: 'till-1', service, onError });
}

/** Mints a code and resolves it once the pairing shows it. */
async function startPairing(): Promise<string> {
  const flow = started(pairing);
  await flow.start();
  const { phase } = flow;
  if (phase.phase !== 'code') throw new Error(`pairing is ${JSON.stringify(phase)}`);
  return phase.code;
}

const till = {
  startPairing,
  claims: () => {
    const { phase } = started(pairing);
    return phase.phase === 'code' ? phase.claims : [];
  },
  confirm: (claimId: string) => started(pairing).confirm(claimId),
  forget: (displayId: string) => started(pairing).forget(displayId),
  displays: () => started(service).displays.map(({ display, link }) => ({ displayId: display.displayId, name: display.name, link })),
  showCart: (name: string, totalMinor: number) =>
    started(service).showCart(receiptWith([line(name, { unitPriceMinor: totalMinor, lineTotalMinor: totalMinor, displayAmountMinor: totalMinor })])),
  showIdle: () => started(service).showCart(null),
};

function startDisplay(): void {
  let stored: string | null = null;
  client = createDisplayClient({
    signalling, context: { baseUrl: 'bridge://' }, advertisement, onError,
    tokens: {
      load: async () => stored,
      save: async (token) => void (stored = token),
      clear: async () => void (stored = null),
    },
  });
  const own = client;
  own.onChange(() => void (own.phase.phase === 'paired' && linkStates.push(own.phase.link)));
}

const display = {
  claim: (code: string, name: string) => started(client).claim(code, name),
  phase: (): DisplayClientPhase => JSON.parse(JSON.stringify(started(client).phase)),
  lineNames: (): string[] => {
    const { view } = started(client).state;
    return view.screen === 'idle' ? [] : view.cart.receipt.lineItems.map((item) => item.name);
  },
};

declare global {
  interface Window {
    signallingCall: (method: Method, args: unknown[]) => Promise<BridgeResult>;
    displayTest: typeof till & typeof display & {
      startTill: typeof startTill;
      startDisplay: typeof startDisplay;
      errors: string[];
      linkStates: Array<PeerLinkState | 'none'>;
    };
  }
}

window.displayTest = { ...till, ...display, startTill, startDisplay, errors, linkStates };
