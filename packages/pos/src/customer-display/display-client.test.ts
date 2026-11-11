import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SignalPort } from './webrtc';
import {
  COLLECT_POLL_MS, OPEN_SIGNAL_POLL_MS, DISPLAY_SIGNAL_POLL_MS, SNAPSHOT_POLL_MS, createDisplayClient, type DisplayClient,
  type DisplayClientPhase,
} from './display-client';
import { createDisplayLink } from './display-link';
import { initialDisplayState } from './display-state';
import { FakeDisplaySignalling } from './fake-display-signalling.test-helper';
import { line, receiptWith } from './fixture.test-helper';
import { displayCart, makeEnvelope, type DisplayConfig, type DisplayEnvelope } from './protocol';
import { DISPLAY_TEMPLATE, HELLO_RETRY_MS } from './use-customer-display';
import { FakeNetwork } from './webrtc/fake-peer.test-helper';
import { createTillPeerLink } from './webrtc/peer-link';

const context = { baseUrl: 'https://store.test' };
const config: DisplayConfig = {
  contract: '1.0', display: { id: 'd1', name: 'Counter' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
};
const tea = receiptWith([line('Tea')]);
tea.header.customer = 'Ada Lovelace';
const teaCart = makeEnvelope('cart.updated', displayCart(tea));
const coffeeCart = makeEnvelope('cart.updated', displayCart(receiptWith([line('Coffee')])));
const idle = makeEnvelope('display.idle', { reason: 'no_cart' });
const body = (seq: number, event: DisplayEnvelope, cfg: unknown = config) => ({ v: 1, seq, config: cfg, event });
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function memoryTokens(initial: string | null) {
  let value = initial;
  return {
    load: vi.fn(async () => value),
    save: vi.fn(async (next: string) => void (value = next)),
    clear: vi.fn(async () => void (value = null)),
  };
}

function setup({ token = 'tok-1' as string | null, snapshot = false } = {}) {
  const fake = new FakeDisplaySignalling();
  const network = new FakeNetwork();
  const tokens = memoryTokens(token);
  const errors: unknown[] = [];
  const phases: DisplayClientPhase[] = [];
  const client = createDisplayClient({
    signalling: fake, context, tokens, advertisement: { iceServers: [], snapshot }, createPeer: network.createPeer,
    onError: (error) => errors.push(error),
  });
  client.onChange(() => phases.push(client.phase));
  return { fake, network, tokens, errors, phases, client };
}
type Setup = ReturnType<typeof setup>;

function paired(client: DisplayClient) {
  const { phase } = client;
  if (phase.phase !== 'paired') throw new Error(`expected paired, got ${phase.phase}`);
  return phase;
}

/** A till peer link through the fake. With `answer`, U4's display link answers each hello with the config. */
function till(s: Setup, { answer = true, signal = s.fake.tillPort as SignalPort } = {}) {
  const link = createTillPeerLink({ signal, iceServers: [], createPeer: s.network.createPeer });
  const heard: DisplayEnvelope[] = [];
  link.onMessage((envelope) => heard.push(envelope));
  return { link, heard, display: answer ? createDisplayLink(link, { config }) : null };
}

/** A paired client with an open link: the next inbox poll is then exactly `OPEN_SIGNAL_POLL_MS` away. */
async function linkedUp(options: { snapshot?: boolean; answer?: boolean } = {}) {
  const s = setup(options);
  await advance(0);
  const t = till(s, options);
  await advance(DISPLAY_SIGNAL_POLL_MS);
  await advance(DISPLAY_SIGNAL_POLL_MS);
  expect(paired(s.client).link).toBe('open');
  return { ...s, t };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDisplayClient: pairing', () => {
  it('starts at enter-code with no token, and paired with one', async () => {
    const fresh = setup({ token: null });
    expect(fresh.client.phase).toEqual({ phase: 'starting' });
    await advance(0);
    expect(fresh.client.phase).toEqual({ phase: 'enter-code' });
    const known = setup();
    await advance(0);
    expect(known.client.phase).toEqual({ phase: 'paired', link: 'none', source: 'none', online: true });
    expect(known.fake.calls[0]).toEqual({ method: 'displayReceiveSignals', args: ['tok-1'] });
    fresh.client.close();
    known.client.close();
  });

  it('claims, waits with the check code, then saves the token and pairs; a claim passes the stored token', async () => {
    const s = setup({ token: null });
    await advance(0);
    const claimed = s.client.claim('123456', 'Counter');
    expect(s.client.phase).toEqual({ phase: 'claiming' });
    await claimed;
    expect(s.client.phase).toEqual({ phase: 'waiting', checkCode: '4321' });
    expect(s.fake.calls[0]).toEqual({ method: 'claim', args: [{ code: '123456', displayName: 'Counter' }] });
    await s.client.claim('999999', 'Other');
    expect(s.fake.count('claim')).toBe(1);
    s.fake.checkCode = '8765';
    await advance(COLLECT_POLL_MS);
    expect(s.client.phase).toEqual({ phase: 'waiting', checkCode: '8765' });
    expect(s.fake.calls[1]).toEqual({ method: 'collect', args: ['secret-1'] });
    s.fake.collects.push({ status: 'paired', displayId: 'd1', token: 'tok-2' });
    await advance(COLLECT_POLL_MS);
    expect(s.tokens.save).toHaveBeenCalledWith('tok-2');
    expect(paired(s.client).link).toBe('none');
    await s.client.claim('654321', 'Counter');
    expect(s.fake.calls.filter((call) => call.method === 'claim').at(-1)?.args)
      .toEqual([{ code: '654321', displayName: 'Counter', token: 'tok-2' }]);
    s.client.close();
  });

  it('keeps waiting through a network refusal from collect, then pairs', async () => {
    const s = setup({ token: null });
    await advance(0);
    await s.client.claim('123456', 'Counter');
    s.fake.collects.push('network', { status: 'paired', displayId: 'd1', token: 'tok-2' });
    await advance(COLLECT_POLL_MS);
    expect(s.fake.count('collect')).toBe(1);
    expect(s.client.phase).toEqual({ phase: 'waiting', checkCode: '4321' });
    await advance(COLLECT_POLL_MS);
    expect(s.tokens.save).toHaveBeenCalledWith('tok-2');
    expect(paired(s.client).link).toBe('none');
    expect(s.phases.map((phase) => phase.phase)).toEqual(['enter-code', 'claiming', 'waiting', 'paired']);
    s.client.close();
  });

  it('gives each refusal its error, and cancel goes back with none', async () => {
    const s = setup({ token: null });
    await advance(0);
    s.fake.refuse('claim', 'claim_refused');
    await s.client.claim('111111', 'Counter');
    expect(s.client.phase).toEqual({ phase: 'enter-code', error: 'claim_refused' });
    s.fake.refuse('claim', 'network');
    await s.client.claim('111111', 'Counter');
    expect(s.client.phase).toEqual({ phase: 'enter-code', error: 'network' });
    s.fake.refuse('claim', 'server');
    await s.client.claim('111111', 'Counter');
    expect(s.client.phase).toEqual({ phase: 'enter-code', error: 'server' });
    await s.client.claim('111111', 'Counter');
    s.fake.collects.push('collect_refused');
    await advance(COLLECT_POLL_MS);
    expect(s.client.phase).toEqual({ phase: 'enter-code', error: 'collect_refused' });
    await s.client.claim('111111', 'Counter');
    s.client.cancel();
    expect(s.client.phase).toEqual({ phase: 'enter-code' });
    await advance(COLLECT_POLL_MS * 3);
    expect(s.fake.count('collect')).toBe(1);
    expect(s.errors).toEqual([]);
    s.client.close();
  });
});

describe('createDisplayClient: the peer link', () => {
  it('answers an offer, says hello until the matching config, and ignores what comes before it', async () => {
    const s = await linkedUp({ answer: false });
    const hellos = () => s.t.heard.filter((envelope) => envelope.action === 'display.hello');
    expect(hellos()[0].payload).toEqual({ template: DISPLAY_TEMPLATE });
    expect(s.fake.tillHeard.map((message) => message.type)).toContain('answer');
    s.t.link.send(teaCart);
    s.t.link.send(makeEnvelope('display.config', config, 'someone-else'));
    await advance(HELLO_RETRY_MS);
    expect(s.client.state).toBe(initialDisplayState);
    expect(paired(s.client).source).toBe('none');
    const sent = hellos().length;
    expect(sent).toBeGreaterThan(1);
    expect(new Set(hellos().map((hello) => hello.id)).size).toBe(1);
    s.t.link.send(makeEnvelope('display.config', config, hellos()[0].id));
    s.t.link.send(teaCart);
    await advance(HELLO_RETRY_MS * 2);
    expect(s.client.state).toEqual({ config, view: { screen: 'cart', cart: teaCart.payload } });
    expect(paired(s.client).source).toBe('peer');
    expect(hellos()).toHaveLength(sent);
    s.client.close();
  });

  it("gives the display's peer the till's candidates from the inbox", async () => {
    const s = await linkedUp();
    // The till's peer is the network's first, so its two host candidates are `candidate:1-1` and `candidate:1-2`.
    const tillCandidates = [1, 2].map((n) => ({ candidate: `candidate:1-${n}`, sdpMid: '0' }));
    expect(s.fake.displayInbox).toEqual([]);
    expect(s.network.peers[1].added).toEqual(tillCandidates);
    s.client.close();
  });

  it('replaces the link when a second offer arrives', async () => {
    const s = await linkedUp();
    const t2 = till(s);
    await advance(OPEN_SIGNAL_POLL_MS);
    await advance(DISPLAY_SIGNAL_POLL_MS);
    expect(s.network.peers).toHaveLength(4);
    expect(s.network.peers[1].connectionState).toBe('closed');
    expect(s.t.link.state).toBe('closed');
    expect(paired(s.client).link).toBe('open');
    t2.display?.showCart(tea);
    await advance(10);
    expect(s.client.state.view).toEqual({ screen: 'cart', cart: teaCart.payload });
    s.client.close();
  });

  it('goes to closed, then none, when the link closes', async () => {
    const s = await linkedUp();
    s.t.link.close();
    await advance(10);
    const links = s.phases.map((phase) => (phase.phase === 'paired' ? phase.link : null));
    expect(links.slice(-2)).toEqual(['closed', 'none']);
    s.client.close();
  });

  it('keeps an open link when a poll fails with network, and is online again after the next success', async () => {
    const s = await linkedUp();
    s.fake.refuse('displayReceiveSignals', 'network');
    await advance(OPEN_SIGNAL_POLL_MS);
    expect(paired(s.client)).toMatchObject({ link: 'open', online: false });
    s.t.display?.showCart(tea);
    await advance(10);
    expect(s.client.state.view).toEqual({ screen: 'cart', cart: teaCart.payload });
    await advance(OPEN_SIGNAL_POLL_MS);
    expect(paired(s.client)).toMatchObject({ link: 'open', online: true });
    s.client.close();
  });
});

describe('createDisplayClient: the snapshot fallback', () => {
  it('applies a snapshot while the link is connecting, and the same body twice changes nothing', async () => {
    const s = setup({ snapshot: true });
    await advance(0);
    // A till that never hears the answer, so the display's link stays connecting.
    till(s, { answer: false, signal: { send: (message) => void s.fake.displayInbox.push(message), onSignal: () => () => {} } });
    await advance(DISPLAY_SIGNAL_POLL_MS);
    expect(paired(s.client).link).toBe('connecting');
    s.fake.snapshot = body(1, teaCart);
    await advance(SNAPSHOT_POLL_MS);
    expect(s.client.state).toEqual({ config, view: { screen: 'cart', cart: teaCart.payload } });
    expect(paired(s.client)).toMatchObject({ link: 'connecting', source: 'snapshot' });
    const before = s.client.state;
    await advance(SNAPSHOT_POLL_MS);
    expect(s.client.state).toBe(before);
    s.client.close();
  });

  it('does not read the snapshot while the link is open', async () => {
    const s = await linkedUp({ snapshot: true });
    const reads = s.fake.count('readSnapshot');
    s.fake.snapshot = body(9, coffeeCart);
    await advance(SNAPSHOT_POLL_MS * 5);
    expect(s.fake.count('readSnapshot')).toBe(reads);
    expect(s.client.state.view.screen).toBe('idle');
    s.client.close();
  });

  it('ignores a lower seq and a malformed body', async () => {
    const s = setup({ snapshot: true });
    s.fake.snapshot = body(2, teaCart);
    await advance(0);
    s.fake.snapshot = body(1, coffeeCart);
    await advance(SNAPSHOT_POLL_MS);
    expect(s.client.state.view).toEqual({ screen: 'cart', cart: teaCart.payload });
    expect(s.errors).toEqual([]);
    for (const bad of [{ ...body(3, coffeeCart), v: 2 }, body(3, coffeeCart, { contract: '2.0' }), body(3, makeEnvelope('display.hello', { template: DISPLAY_TEMPLATE })), 'text']) {
      s.fake.snapshot = bad;
      await advance(SNAPSHOT_POLL_MS);
    }
    expect(s.client.state.view).toEqual({ screen: 'cart', cart: teaCart.payload });
    expect(s.errors).toHaveLength(4);
    s.client.close();
  });

  it('never reads when the advertisement has no snapshot', async () => {
    const s = setup();
    s.fake.snapshot = body(1, teaCart);
    await advance(SNAPSHOT_POLL_MS * 5);
    expect(s.fake.count('readSnapshot')).toBe(0);
    expect(s.client.state).toBe(initialDisplayState);
    s.client.close();
  });

  it('clears the cart and the customer when a snapshot says idle', async () => {
    const s = setup({ snapshot: true });
    s.fake.snapshot = body(1, teaCart);
    await advance(0);
    expect(JSON.stringify(s.client.state)).toContain('Ada Lovelace');
    s.fake.snapshot = body(1, idle);
    await advance(SNAPSHOT_POLL_MS);
    expect(s.client.state).toEqual({ config, view: { screen: 'idle', reason: 'no_cart' } });
    expect(JSON.stringify(s.client.state)).not.toMatch(/Ada Lovelace|Tea/);
    s.client.close();
  });
});

describe('createDisplayClient: forgotten and closed', () => {
  const expectForgotten = (s: Setup) => {
    expect(s.tokens.clear).toHaveBeenCalledTimes(1);
    expect(s.client.state).toBe(initialDisplayState);
    expect(s.client.phase).toEqual({ phase: 'enter-code', error: 'forgotten' });
  };

  it('forgets on a refused token from the inbox poll: the link closes and every timer stops', async () => {
    const s = await linkedUp();
    s.t.display?.showCart(tea);
    await advance(10);
    expect(s.client.state.view.screen).toBe('cart');
    s.fake.token = null;
    await advance(OPEN_SIGNAL_POLL_MS);
    expectForgotten(s);
    expect(s.network.peers[1].connectionState).toBe('closed');
    const calls = s.fake.calls.length;
    await advance(60_000);
    expect(s.fake.calls).toHaveLength(calls);
  });

  it('forgets on a refused token from readSnapshot', async () => {
    const s = setup({ snapshot: true });
    s.fake.snapshot = body(1, teaCart);
    await advance(0);
    expect(s.client.state.view.screen).toBe('cart');
    s.fake.refuse('readSnapshot', 'token_refused');
    await advance(SNAPSHOT_POLL_MS);
    expectForgotten(s);
    const calls = s.fake.calls.length;
    await advance(60_000);
    expect(s.fake.calls).toHaveLength(calls);
  });

  it('calls nothing after close, even with a claim in flight', async () => {
    const s = await linkedUp({ snapshot: true });
    const heard = vi.fn();
    s.client.onChange(heard);
    s.client.close();
    const calls = s.fake.calls.length;
    await advance(60_000);
    await s.client.claim('123456', 'Counter');
    s.client.cancel();
    expect(s.fake.calls).toHaveLength(calls);
    expect(heard).not.toHaveBeenCalled();
    const pending = setup({ token: null });
    await advance(0);
    const claimed = pending.client.claim('123456', 'Counter');
    pending.client.close();
    await claimed;
    await advance(COLLECT_POLL_MS * 3);
    expect(pending.fake.count('collect')).toBe(0);
    expect(pending.client.phase).toEqual({ phase: 'claiming' });
  });
});
