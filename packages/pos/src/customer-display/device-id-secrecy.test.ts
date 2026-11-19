// TallyUI#753 (ADR-085): on the Woo backend the till's device id is a bearer secret until #754's server-issued key.
// These tests run the till-display flows with logging on and prove the id reaches nothing but the `deviceId`
// argument of the seam's own calls: no console output, no reported error, no exposed state, no other seam argument,
// and nothing the display receives.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  DisplaySignallingError, type DisplaySignalling, type DisplaySignallingErrorCode, type SyncContext,
} from '@tallyui/core';
import { createMemoryDisplaySignalling } from '@tallyui/core/server';
import { COLLECT_POLL_MS, DISPLAY_SIGNAL_POLL_MS, createDisplayClient } from './display-client';
import { FakePairingSignalling, FakeSignalling, pendingClaim, record } from './fake-signalling.test-helper';
import { line, receiptWith } from './fixture.test-helper';
import type { DisplayConfig, DisplayEnvelope } from './protocol';
import { SNAPSHOT_MIN_INTERVAL_MS } from './snapshot-fallback';
import { LIST_POLL_MS, SIGNAL_POLL_MS, createTillDisplayService } from './till-display-service';
import { PENDING_POLL_MS, createTillPairing } from './till-pairing';
import { FakeNetwork } from './webrtc/fake-peer.test-helper';
import { createDisplayPeerLink } from './webrtc';

const SECRET = 'till-secret-' + 'x'.repeat(40);
const ctx: SyncContext = { connectorId: 'woo', baseUrl: 'https://shop.test', headers: {} };
const NOW = '2026-11-11T10:00:00.000Z';
const base: DisplayConfig = {
  contract: '1.0', display: { id: '', name: '' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
};
const configFor = (r: { displayId: string; name: string }): DisplayConfig => ({ ...base, display: { id: r.displayId, name: r.name } });
const receipt = receiptWith([line('Tea')]);
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
/**
 * Advances the fake clock in `stepMs` steps, at most 10, until `holds()`. D4's memory server hashes with
 * crypto.subtle.digest, which settles off the fake clock, so one fixed advance can end before a poll's answer lands.
 */
async function waitUntil(what: string, stepMs: number, holds: () => boolean) {
  for (let step = 0; step < 10 && !holds(); step += 1) await wait(stepMs);
  if (!holds()) throw new Error(`waitUntil: ${what} still false after 10 steps of ${stepMs} ms`);
}

const TILL_METHODS = ['mint', 'pending', 'confirm', 'decline', 'list', 'forget', 'sendSignal', 'receiveSignals', 'postSnapshot'] as const;
const DISPLAY_METHODS = ['claim', 'collect', 'displaySendSignal', 'displayReceiveSignals', 'readSnapshot'] as const;
type Method = (typeof TILL_METHODS)[number] | (typeof DISPLAY_METHODS)[number];
const CODES: DisplaySignallingErrorCode[] = [
  'forbidden', 'limit', 'claim_refused', 'collect_refused', 'not_found', 'token_refused', 'too_large', 'network', 'server',
];
type Refusal = DisplaySignallingErrorCode | 'plain';
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;

/** One captured value as text: an error's `String(e)`, `message` and own enumerable props, anything else as JSON. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  const replacer = (_key: string, v: unknown) =>
    v instanceof Error ? { string: String(v), message: v.message, stack: v.stack, own: { ...v } } : v;
  try {
    return `${String(value)}\n${JSON.stringify(value, replacer) ?? ''}`;
  } catch {
    return String(value);
  }
}

/** Every console line, every reported error, every exposed state and every seam argument and answer but `deviceId`. */
let captured: string[] = [];
const capture = (label: string, value: unknown) => void captured.push(`${label}: ${text(value)}`);
const seen = () => captured.join('\n');
const onError = (error: unknown) => capture('onError', error);

/** What the wrapped seam saw: each till-side call's `deviceId`, each call, and each rejection it gave. */
interface Watch {
  signalling: DisplaySignalling;
  deviceIds: string[];
  calls: Method[];
  rejected: Method[];
  /** The refusal the next calls of a method get, while set. */
  refuse: { method: Method; with: Refusal } | null;
}
function watch(seam: DisplaySignalling): Watch {
  const w: Watch = { signalling: {} as DisplaySignalling, deviceIds: [], calls: [], rejected: [], refuse: null };
  const out = w.signalling as unknown as Record<Method, (...args: unknown[]) => Promise<unknown>>;
  for (const name of [...TILL_METHODS, ...DISPLAY_METHODS]) {
    const original = (seam[name] as (...args: unknown[]) => Promise<unknown>).bind(seam);
    const tillSide = (TILL_METHODS as readonly string[]).includes(name);
    out[name] = async (...args: unknown[]) => {
      w.calls.push(name);
      if (tillSide) w.deviceIds.push(args[1] as string);
      capture(`${name} args`, tillSide ? [args[0], ...args.slice(2)] : args);
      if (w.refuse?.method === name) {
        w.rejected.push(name);
        throw w.refuse.with === 'plain' ? new Error(`${name} failed`) : new DisplaySignallingError(w.refuse.with);
      }
      const result = await original(...args);
      capture(`${name} result`, result);
      return result;
    };
  }
  return w;
}

/** The seam got the id as `deviceId` on every till-side call, so a test cannot pass by never calling it. */
function expectSecretOnlyAsDeviceId(w: Watch) {
  expect(w.deviceIds.length).toBeGreaterThan(0);
  expect(new Set(w.deviceIds)).toEqual(new Set([SECRET]));
  expect(seen()).not.toContain(SECRET);
}

function pairingWith(fake: FakePairingSignalling) {
  const w = watch(fake);
  const pairing = createTillPairing({
    signalling: w.signalling, context: () => ctx, deviceId: SECRET, service: { refresh: async () => {} }, onError,
  });
  const look = () => capture('pairing', { phase: pairing.phase, forgetError: pairing.forgetError });
  pairing.onChange(look);
  return { w, pairing, look };
}

function serviceWith(fake: FakeSignalling, network: FakeNetwork, refuse: Watch['refuse'] = null) {
  const w = watch(fake);
  w.refuse = refuse;
  const service = createTillDisplayService({
    signalling: w.signalling, context: () => ctx, deviceId: SECRET, advertisement: { iceServers: [], snapshot: true },
    configFor, createPeer: network.createPeer, onError,
  });
  const look = () => capture('service', { status: service.status, displays: service.displays });
  service.onChange(look);
  return { w, service, look };
}

/** d1 has a display device, so its link opens; d2 has none, so its link stays connecting and it gets snapshots. */
function twoDisplays() {
  const fake = new FakeSignalling();
  fake.displays = [record('d1'), record('d2')];
  const network = new FakeNetwork();
  const side = createDisplayPeerLink({ signal: fake.displayPort('d1'), iceServers: [], createPeer: network.createPeer });
  const heard: DisplayEnvelope[] = [];
  side.onMessage((envelope) => {
    heard.push(envelope);
    capture('display d1 heard', envelope);
  });
  return { fake, network, side, heard };
}

describe('the till device id stays a secret (TallyUI#753)', () => {
  const closers: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    captured = [];
    for (const level of CONSOLE) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => capture(`console.${level}`, args));
  });
  afterEach(() => {
    closers.splice(0).forEach((close) => close());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('D1: pairing: mint, pending poll, confirm, decline and forget never expose the device id', async () => {
    const fake = new FakePairingSignalling();
    fake.claims = [pendingClaim('k1', '4821'), pendingClaim('k2', '0937')];
    const { w, pairing, look } = pairingWith(fake);
    closers.push(() => pairing.close());
    await pairing.start();
    look();
    await wait(PENDING_POLL_MS);
    look();
    await pairing.decline('k2');
    look();
    await pairing.confirm('k1');
    look();
    await pairing.forget('d1');
    look();
    pairing.cancel();
    look();
    expect(new Set(w.calls)).toEqual(new Set(['mint', 'pending', 'confirm', 'decline', 'forget']));
    expectSecretOnlyAsDeviceId(w);
  });

  it('D2: service: list, receive and send signals, and post a snapshot never expose the device id', async () => {
    const { fake, network, side, heard } = twoDisplays();
    const { w, service, look } = serviceWith(fake, network);
    closers.push(() => service.close(), () => side.close());
    service.showCart(receipt);
    look();
    await wait(SIGNAL_POLL_MS * 2);
    look();
    // d1's link is open now, so this new sale state goes to it over the channel; d2 still gets snapshots.
    service.showCart(receiptWith([line('Coffee')]));
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    await wait(LIST_POLL_MS);
    look();
    expect(side.state).toBe('open');
    expect(heard.length).toBeGreaterThan(0);
    expect(fake.snapshots('d2').length).toBeGreaterThan(0);
    expect(new Set(w.calls)).toEqual(new Set(['list', 'sendSignal', 'receiveSignals', 'postSnapshot']));
    expectSecretOnlyAsDeviceId(w);
  });

  describe('D3: refusals: every seam call rejecting with each DisplaySignallingError code (and a plain Error) reports errors that do not contain the device id', () => {
    const refusals: Refusal[] = [...CODES, 'plain'];

    it.each(refusals)('pairing calls refused with %s', async (refusal) => {
      for (const method of ['mint', 'pending', 'confirm', 'decline', 'forget'] as const) {
        const fake = new FakePairingSignalling();
        fake.claims = [pendingClaim('k1', '4821'), pendingClaim('k2', '0937')];
        const { w, pairing, look } = pairingWith(fake);
        closers.push(() => pairing.close());
        w.refuse = { method, with: refusal };
        const errorsBefore = captured.filter((entry) => entry.startsWith('onError')).length;
        await pairing.start();
        await wait(PENDING_POLL_MS);
        await pairing.confirm('k1');
        await pairing.start();
        await wait(PENDING_POLL_MS);
        await pairing.decline('k2');
        await pairing.forget('d1');
        look();
        pairing.close();
        expect(w.rejected, method).toContain(method);
        expect(captured.filter((entry) => entry.startsWith('onError')).length, method).toBeGreaterThan(errorsBefore);
        expectSecretOnlyAsDeviceId(w);
      }
    });

    it.each(refusals)('service calls refused with %s', async (refusal) => {
      for (const method of ['list', 'sendSignal', 'receiveSignals', 'postSnapshot'] as const) {
        const { fake, network, side } = twoDisplays();
        const errorsBefore = captured.filter((entry) => entry.startsWith('onError')).length;
        const { w, service, look } = serviceWith(fake, network, { method, with: refusal });
        service.showCart(receipt);
        await wait(SIGNAL_POLL_MS * 2 + SNAPSHOT_MIN_INTERVAL_MS);
        await service.refresh();
        await wait(SIGNAL_POLL_MS * 2 + SNAPSHOT_MIN_INTERVAL_MS);
        look();
        service.close();
        side.close();
        expect(w.rejected, method).toContain(method);
        expect(captured.filter((entry) => entry.startsWith('onError')).length, method).toBeGreaterThan(errorsBefore);
        expectSecretOnlyAsDeviceId(w);
      }
    });
  });

  it('D4: display side: what the display client receives (signals, snapshot bodies, its own state) never contains the device id', async () => {
    const { signalling, harness } = createMemoryDisplaySignalling();
    const w = watch(signalling);
    const tillCtx = await harness.till({ cashierId: 'c1', canPair: true });
    const network = new FakeNetwork();
    let token: string | null = null;
    const tokens = {
      load: async () => token,
      save: async (next: string) => void (token = next),
      clear: async () => void (token = null),
    };
    const client = createDisplayClient({
      signalling: w.signalling, context: harness.display('203.0.113.7'), tokens,
      advertisement: { iceServers: [], snapshot: true }, createPeer: network.createPeer, onError,
    });
    const lookClient = () => capture('display client', { phase: client.phase, state: client.state });
    client.onChange(lookClient);
    const pairing = createTillPairing({ signalling: w.signalling, context: () => tillCtx, deviceId: SECRET, onError });
    pairing.onChange(() => capture('pairing', { phase: pairing.phase, forgetError: pairing.forgetError }));
    closers.push(() => client.close(), () => pairing.close());

    await wait(0);
    await pairing.start();
    const shown = pairing.phase;
    if (shown.phase !== 'code') throw new Error(`expected a code, got ${shown.phase}`);
    await client.claim(shown.code, 'Counter');
    await wait(PENDING_POLL_MS);
    const claims = pairing.phase.phase === 'code' ? pairing.phase.claims : [];
    expect(claims).toHaveLength(1);
    await pairing.confirm(claims[0].claimId);
    await waitUntil('display paired', COLLECT_POLL_MS, () => client.phase.phase === 'paired');
    expect(client.phase.phase).toBe('paired');

    const service = createTillDisplayService({
      signalling: w.signalling, context: () => tillCtx, deviceId: SECRET, advertisement: { iceServers: [], snapshot: true },
      configFor, createPeer: network.createPeer, onError,
    });
    closers.unshift(() => service.close());
    service.showCart(receipt);
    await wait(SNAPSHOT_MIN_INTERVAL_MS + DISPLAY_SIGNAL_POLL_MS * 4 + SIGNAL_POLL_MS * 4);
    const displayCalls = () => new Set(w.calls.filter((method) => (DISPLAY_METHODS as readonly string[]).includes(method)));
    const heardOffer = () => captured.some((entry) => entry.startsWith('displayReceiveSignals result') && entry.includes('offer'));
    await waitUntil('display linked and showing the cart', DISPLAY_SIGNAL_POLL_MS, () => displayCalls().size === DISPLAY_METHODS.length
      && heardOffer() && client.state.config?.display.name === 'Counter' && client.state.view.screen === 'cart');
    lookClient();

    expect(displayCalls()).toEqual(new Set(DISPLAY_METHODS));
    expect(heardOffer()).toBe(true);
    expect(client.state.config?.display.name).toBe('Counter');
    expect(client.state.view.screen).toBe('cart');
    expectSecretOnlyAsDeviceId(w);
  });
});
