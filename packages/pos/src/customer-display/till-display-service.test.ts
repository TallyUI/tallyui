import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { DisplayRecord, SyncContext } from '@tallyui/core';
import { createOrderBuilder } from '../order';
import { FakeSignalling, record } from './fake-signalling.test-helper';
import { line, receiptWith } from './fixture.test-helper';
import { makeEnvelope, type DisplayConfig, type DisplayEnvelope } from './protocol';
import { createSaleDisplayPublisher } from './sale-display';
import { SNAPSHOT_MIN_INTERVAL_MS } from './snapshot-fallback';
import {
  CONNECT_TIMEOUT_MS, LIST_POLL_MS, SIGNAL_POLL_MS, createTillDisplayService, type TillDisplayService,
} from './till-display-service';
import { FakeNetwork } from './webrtc/fake-peer.test-helper';
import { createDisplayPeerLink, type PeerLink } from './webrtc';

const base: DisplayConfig = {
  contract: '1.0', display: { id: '', name: '' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
};
const ctx: SyncContext = { connectorId: 'woo', baseUrl: 'https://shop.test', headers: {} };
const receipt = receiptWith([line('Tea')]);
const hello = (id: string) => makeEnvelope('display.hello', { template: { id: 'default', version: 1 } }, id);
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
/** Long enough for the offer, the answer at the next inbox poll, and the channel to open. */
const OPEN_MS = SIGNAL_POLL_MS * 2;

let services: TillDisplayService[] = [];
function setup(options: { displays?: DisplayRecord[]; snapshot?: boolean; context?: SyncContext | null; sides?: string[] } = {}) {
  const { displays = [record('d1'), record('d2')], snapshot = false, sides = displays.map((d) => d.displayId) } = options;
  const signalling = new FakeSignalling();
  signalling.displays = displays;
  const network = new FakeNetwork();
  let context = options.context === undefined ? ctx : options.context;
  const errors: unknown[] = [];
  /** A display device: its peer link over the fake's display mailbox, and everything it heard. */
  const side = (id: string) => {
    const link: PeerLink = createDisplayPeerLink({ signal: signalling.displayPort(id), iceServers: [], createPeer: network.createPeer });
    const heard: DisplayEnvelope[] = [];
    link.onMessage((envelope) => heard.push(envelope));
    return { link, heard, actions: () => heard.map((envelope) => envelope.action) };
  };
  const sideOf = Object.fromEntries(sides.map((id) => [id, side(id)]));
  const service = createTillDisplayService({
    signalling, deviceId: 'till-1', context: () => context, advertisement: { iceServers: [], snapshot },
    configFor: (r) => ({ ...base, display: { id: r.displayId, name: r.name } }),
    createPeer: network.createPeer, onError: (error) => errors.push(error),
  });
  services.push(service);
  const linkOf = (id: string) => service.displays.find((entry) => entry.display.displayId === id)?.link;
  return { signalling, network, service, errors, side, sideOf, linkOf, setContext: (next: SyncContext | null) => { context = next; } };
}

describe('createTillDisplayService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    services = [];
  });
  afterEach(() => {
    services.forEach((service) => service.close());
    vi.useRealTimers();
  });

  it('1: opens a link to each owned display and fans one showCart out to both (d9)', async () => {
    const s = setup();
    await wait(OPEN_MS);
    expect(s.service.displays.map((entry) => entry.link)).toEqual(['open', 'open']);
    s.service.showCart(receipt);
    await wait(10);
    expect(s.sideOf.d1.actions()).toEqual(['cart.updated']);
    expect(s.sideOf.d2.actions()).toEqual(['cart.updated']);
    expect(s.service.status).toBe('online');
  });

  it("2: answers each display's hello with its own config, and only that display", async () => {
    const s = setup();
    await wait(OPEN_MS);
    s.sideOf.d2.link.send(hello('h2'));
    s.sideOf.d1.link.send(hello('h1'));
    await wait(10);
    expect(s.sideOf.d1.heard).toEqual([expect.objectContaining({ id: 'h1', action: 'display.config', payload: expect.objectContaining({ display: { id: 'd1', name: 'Display d1' } }) })]);
    expect(s.sideOf.d2.heard).toEqual([expect.objectContaining({ id: 'h2', action: 'display.config', payload: expect.objectContaining({ display: { id: 'd2', name: 'Display d2' } }) })]);
  });

  it('3: a display listed mid-sale gets the current sale after its hello', async () => {
    const s = setup({ displays: [record('d1')] });
    await wait(OPEN_MS);
    s.service.showCart(receipt);
    s.signalling.displays.push(record('d2'));
    const late = s.side('d2');
    await s.service.refresh();
    await wait(OPEN_MS);
    expect(s.linkOf('d2')).toBe('open');
    late.link.send(hello('h2'));
    await wait(10);
    expect(late.actions()).toEqual(['display.config', 'cart.updated']);
    expect(late.heard[1].payload).toMatchObject({ receipt: { lineItems: [{ name: 'Tea' }] } });
  });

  it('4: replaces a dropped link at the next list with seq 2, and a link stuck connecting past 30 s', async () => {
    const s = setup({ displays: [record('d1')], snapshot: true, sides: [] });
    s.service.showCart(receipt);
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.signalling.snapshots('d1').map((body) => body.seq)).toEqual([1]);
    s.network.peers[0].setConnectionState('failed');
    expect(s.linkOf('d1')).toBe('closed');
    await wait(LIST_POLL_MS);
    expect(s.network.peers).toHaveLength(2);
    expect(s.linkOf('d1')).toBe('connecting');
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.signalling.snapshots('d1').at(-1)?.seq).toBe(2);
    await wait(CONNECT_TIMEOUT_MS + LIST_POLL_MS);
    expect(s.network.peers).toHaveLength(3);
    expect(s.network.peers[1].connectionState).toBe('closed');
    expect(s.linkOf('d1')).toBe('connecting');
  });

  it('5: a record gone from the list closes its link, and no more sends reach it', async () => {
    const s = setup();
    await wait(OPEN_MS);
    s.signalling.displays = [record('d1')];
    await s.service.refresh();
    await wait(10);
    expect(s.sideOf.d2.link.state).toBe('closed');
    expect(s.service.displays.map((entry) => entry.display.displayId)).toEqual(['d1']);
    const before = s.signalling.calls.length;
    s.service.showCart(receipt);
    await wait(LIST_POLL_MS * 3);
    expect(s.sideOf.d2.heard).toEqual([]);
    expect(s.sideOf.d1.actions()).toEqual(['cart.updated']);
    expect(s.signalling.calls.slice(before).filter((call) => call.displayId === 'd2')).toEqual([]);
  });

  it('6: posts the cart snapshot while the link connects, and stops once it opens', async () => {
    const s = setup({ displays: [record('d1')], snapshot: true, sides: [] });
    s.service.showCart(receipt);
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.signalling.snapshots('d1')).toEqual([
      expect.objectContaining({ seq: 1, config: expect.objectContaining({ display: { id: 'd1', name: 'Display d1' } }), event: expect.objectContaining({ action: 'cart.updated' }) }),
    ]);
    s.side('d1');
    await wait(OPEN_MS);
    expect(s.linkOf('d1')).toBe('open');
    const posted = s.signalling.snapshots('d1').length;
    await wait(LIST_POLL_MS * 6);
    expect(s.signalling.snapshots('d1')).toHaveLength(posted);
  });

  it('6: never posts with snapshot: false, nor for a display with connected: false', async () => {
    const off = setup({ displays: [record('d1')], snapshot: false, sides: [] });
    const unseen = setup({ displays: [record('d1', { connected: false })], snapshot: true, sides: [] });
    off.service.showCart(receipt);
    unseen.service.showCart(receipt);
    await wait(LIST_POLL_MS * 3);
    expect(off.signalling.called('postSnapshot')).toEqual([]);
    expect(unseen.signalling.called('postSnapshot')).toEqual([]);
    expect(unseen.linkOf('d1')).toBe('connecting');
  });

  it('7: an idle sale after a cart snapshot posts an idle snapshot, even with the link open', async () => {
    const s = setup({ displays: [record('d1')], snapshot: true, sides: [] });
    s.service.showCart(receipt);
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    s.side('d1');
    await wait(OPEN_MS);
    expect(s.linkOf('d1')).toBe('open');
    s.service.showCart(null);
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.signalling.snapshots('d1').map((body) => body.event.action)).toEqual(['cart.updated', 'display.idle']);
  });

  it('8: offline keeps open links, makes no new link or snapshot, and reconnects when a list succeeds (d11)', async () => {
    const s = setup({ snapshot: true });
    await wait(OPEN_MS);
    s.signalling.fail('list', 'network');
    await wait(LIST_POLL_MS);
    expect(s.service.status).toBe('offline');
    expect(s.errors).toContainEqual(expect.objectContaining({ code: 'network' }));
    s.service.showCart(receipt);
    await wait(10);
    expect(s.sideOf.d1.actions()).toEqual(['cart.updated']);
    const peers = s.network.peers.length;
    const snapshots = s.signalling.called('postSnapshot').length;
    s.sideOf.d2.link.close();
    await wait(10);
    expect(s.linkOf('d2')).toBe('closed');
    await wait(LIST_POLL_MS * 3);
    expect(s.network.peers).toHaveLength(peers);
    expect(s.signalling.called('postSnapshot')).toHaveLength(snapshots);
    s.signalling.heal('list');
    await wait(LIST_POLL_MS);
    expect(s.service.status).toBe('online');
    expect(s.network.peers).toHaveLength(peers + 1);
    expect(s.linkOf('d2')).toBe('connecting');
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.signalling.snapshots('d2').at(-1)).toMatchObject({ seq: 2, event: { action: 'cart.updated' } });
  });

  it('9: forbidden pauses every call until refresh(), and a null context makes no call', async () => {
    const s = setup({ displays: [record('d1')], snapshot: true, sides: [] });
    s.signalling.fail('list', 'forbidden');
    await wait(LIST_POLL_MS);
    expect(s.service.status).toBe('paused');
    const calls = s.signalling.calls.length;
    s.service.showCart(receipt);
    await wait(LIST_POLL_MS * 6);
    expect(s.signalling.calls).toHaveLength(calls);
    s.signalling.heal('list');
    await s.service.refresh();
    expect(s.service.status).toBe('online');
    expect(s.signalling.calls.length).toBeGreaterThan(calls);

    const none = setup({ context: null });
    await wait(LIST_POLL_MS * 3);
    expect(none.service.status).toBe('paused');
    expect(none.signalling.calls).toEqual([]);
    none.setContext(ctx);
    await wait(LIST_POLL_MS);
    expect(none.service.status).toBe('online');
    expect(none.service.displays).toHaveLength(2);
  });

  it('10: not_found from postSnapshot tears that display down', async () => {
    const s = setup({ displays: [record('d1'), record('d2')], snapshot: true, sides: [] });
    s.signalling.fail('postSnapshot', 'not_found', 'd1');
    s.service.showCart(receipt);
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    await wait(10);
    expect(s.service.displays.map((entry) => entry.display.displayId)).toEqual(['d2']);
    expect(s.network.peers[0].connectionState).toBe('closed');
    expect(s.errors).toEqual([expect.objectContaining({ code: 'not_found' })]);
    const before = s.signalling.calls.length;
    s.signalling.displays = [record('d2')];
    await wait(LIST_POLL_MS * 2);
    expect(s.signalling.calls.slice(before).filter((call) => call.displayId === 'd1')).toEqual([]);
  });

  it('11: close() closes every link, and nothing is called after it', async () => {
    const s = setup({ snapshot: true });
    await wait(OPEN_MS);
    s.service.close();
    await wait(10);
    expect(s.service.status).toBe('closed');
    expect([s.sideOf.d1.link.state, s.sideOf.d2.link.state]).toEqual(['closed', 'closed']);
    const calls = s.signalling.calls.length;
    s.service.showCart(receipt);
    await s.service.refresh();
    await wait(LIST_POLL_MS * 6);
    expect(s.signalling.calls).toHaveLength(calls);
    expect(s.sideOf.d1.heard).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('12: createSaleDisplayPublisher drives the service end to end', async () => {
    const s = setup({ displays: [record('d1')] });
    await wait(OPEN_MS);
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'tea', name: 'Tea', unitPrice: { amount: 1000, currency: 'USD' } });
    const publisher = createSaleDisplayPublisher(s.service);
    publisher.update({ order: builder.getSnapshot(), stage: { kind: 'cart' } });
    publisher.close();
    await wait(10);
    expect(s.sideOf.d1.actions()).toEqual(['cart.updated', 'display.idle']);
    expect(s.sideOf.d1.heard[0].payload).toMatchObject({ receipt: { lineItems: [{ name: 'Tea' }] } });
  });
});
