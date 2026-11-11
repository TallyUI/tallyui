import { describe, it, expect, vi } from 'vitest';
import type { IceServer, SignalMessage } from '@tallyui/core';
import { line, receiptWith } from '../fixture.test-helper';
import { makeEnvelope, type DisplayEnvelope } from '../protocol';
import { DISPLAY_CHANNEL } from '../transport';
import { createFakePair, FakeNetwork } from './fake-peer.test-helper';
import { createDisplayPeerLink, createTillPeerLink, type PeerLink, type PeerLinkState } from './peer-link';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Waits a bounded number of tasks for the in-memory handshake to get somewhere. */
async function until(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) await tick();
  return done();
}
const cart = makeEnvelope('cart.updated', { receipt: receiptWith([line('Tea')]), linesTruncated: false }, 'c1');
const hello = makeEnvelope('display.hello', { template: { id: 'default', version: 1 } }, 'h1');

function setup(iceServers: IceServer[] = []) {
  const { till: tillPort, display: displayPort, network } = createFakePair();
  const display = createDisplayPeerLink({ signal: displayPort, iceServers, createPeer: network.createPeer });
  const till = createTillPeerLink({ signal: tillPort, iceServers, createPeer: network.createPeer });
  const [displayPeer, tillPeer] = network.peers;
  const bothOpen = () => till.state === 'open' && display.state === 'open';
  return { till, display, tillPort, displayPort, tillPeer, displayPeer, bothOpen };
}

function record(link: PeerLink) {
  const states: PeerLinkState[] = [];
  const heard: DisplayEnvelope[] = [];
  link.onStateChange((state) => states.push(state));
  link.onMessage((envelope) => heard.push(envelope));
  return { states, heard };
}

describe('the fake peer', () => {
  it('refuses what Chromium refuses, with the same error name', async () => {
    const peer = new FakeNetwork().createPeer({ iceServers: [] });
    const invalidState = { name: 'InvalidStateError' };
    await expect(peer.addIceCandidate({ candidate: 'candidate:x', sdpMid: '0' })).rejects.toMatchObject(invalidState);
    await expect(peer.setRemoteDescription({ type: 'answer', sdp: 'fake:9' })).rejects.toMatchObject(invalidState);
    const channel = peer.createDataChannel('x', { ordered: true });
    expect(() => channel.send('x')).toThrow(expect.objectContaining(invalidState));
    peer.close();
    await expect(peer.createOffer()).rejects.toMatchObject(invalidState);
    expect(() => peer.createDataChannel('y', { ordered: true })).toThrow(expect.objectContaining(invalidState));
  });
});

describe('createTillPeerLink and createDisplayPeerLink', () => {
  it('open one channel through the handshake and carry envelopes both ways, answering only the first offer', async () => {
    const s = setup();
    const till = record(s.till);
    const display = record(s.display);
    expect([s.till.state, s.display.state]).toEqual(['connecting', 'connecting']);
    expect(await until(s.bothOpen)).toBe(true);
    expect([till.states, display.states]).toEqual([['open'], ['open']]);
    expect(s.till.send(cart)).toBe(true);
    await until(() => display.heard.length > 0);
    expect(display.heard).toEqual([cart]);
    expect(s.display.send(hello)).toBe(true);
    await until(() => till.heard.length > 0);
    expect(till.heard).toEqual([hello]);
    // Two candidates each way, and never the end-of-candidates null.
    expect(s.tillPort.sent.map((m) => m.type)).toEqual(['offer', 'ice', 'ice']);
    expect(JSON.parse(s.tillPort.sent[1].payload)).toEqual({ candidate: 'candidate:2-1', sdpMid: '0' });
    s.displayPort.receive(s.tillPort.sent[0]);
    await until(() => false);
    expect(s.displayPort.sent.filter((m) => m.type === 'answer')).toHaveLength(1);
    expect(s.display.state).toBe('open');
    s.till.close();
    s.display.close();
  });

  it('queues candidates that arrive before the description and applies them after it, in order', async () => {
    const { till: tillPort, display: displayPort, network } = createFakePair();
    tillPort.hold = displayPort.hold = true;
    const display = createDisplayPeerLink({ signal: displayPort, iceServers: [], createPeer: network.createPeer });
    const till = createTillPeerLink({ signal: tillPort, iceServers: [], createPeer: network.createPeer });
    const [displayPeer, tillPeer] = network.peers;
    await until(() => tillPort.sent.length === 3);
    const [offer, ...tillIce] = tillPort.sent;
    [...tillIce, offer].forEach((message) => displayPort.receive(message));
    await until(() => displayPort.sent.length === 3);
    const [answer, ...displayIce] = displayPort.sent;
    expect(answer.type).toBe('answer');
    [...displayIce, answer].forEach((message) => tillPort.receive(message));
    expect(await until(() => till.state === 'open' && display.state === 'open')).toBe(true);
    const payloads = (messages: SignalMessage[]) => messages.map((m) => JSON.parse(m.payload));
    expect(displayPeer.added).toEqual(payloads(tillIce));
    expect(tillPeer.added).toEqual(payloads(displayIce));
    till.close();
    display.close();
  });

  it('refuses to send before the channel opens and after close, without throwing', async () => {
    const s = setup();
    await tick();
    const channelSend = vi.spyOn(s.tillPeer.channels[0], 'send');
    expect(s.till.send(cart)).toBe(false);
    expect(s.display.send(hello)).toBe(false);
    expect(channelSend).not.toHaveBeenCalled();
    await until(s.bothOpen);
    s.till.close();
    expect(s.till.send(cart)).toBe(false);
    s.display.close();
  });

  it('ignores a malformed payload and an unexpected type', async () => {
    const s = setup();
    const till = record(s.till);
    const display = record(s.display);
    expect(() => {
      s.displayPort.receive({ type: 'offer', payload: '{' });
      s.displayPort.receive({ type: 'answer', payload: '{"type":"answer","sdp":"fake:2"}' });
      s.tillPort.receive({ type: 'offer', payload: '{"type":"offer","sdp":"fake:1"}' });
      s.tillPort.receive({ type: 'ice', payload: '{' });
      s.tillPort.receive({ type: 'bye', payload: '{}' } as unknown as SignalMessage);
    }).not.toThrow();
    expect([s.till.state, s.display.state]).toEqual(['connecting', 'connecting']);
    expect(await until(s.bothOpen)).toBe(true);
    expect([till.states, display.states]).toEqual([['open'], ['open']]);
    s.till.close();
    s.display.close();
  });

  it('closes on a rejected step, with no unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      const { till: tillPort, display: displayPort, network } = createFakePair();
      const display = createDisplayPeerLink({ signal: displayPort, iceServers: [], createPeer: network.createPeer });
      vi.spyOn(network.peers[0], 'setRemoteDescription').mockRejectedValue(new DOMException('bad sdp', 'OperationError'));
      const states = record(display).states;
      createTillPeerLink({ signal: tillPort, iceServers: [], createPeer: network.createPeer }).close();
      displayPort.receive({ type: 'offer', payload: '{"type":"offer","sdp":"fake:2"}' });
      expect(await until(() => display.state === 'closed')).toBe(true);
      await tick();
      expect(states).toEqual(['closed']);
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

  it('closes on a failed connection, and a late open does not reopen it', async () => {
    const s = setup();
    const till = record(s.till);
    await tick();
    const lateOpen = s.tillPeer.channels[0].onopen;
    s.tillPeer.setConnectionState('failed');
    expect(s.till.state).toBe('closed');
    lateOpen?.({});
    expect(s.till.state).toBe('closed');
    expect(till.states).toEqual(['closed']);
    s.display.close();
  });

  it('unsubscribes from the port on close, and close twice is safe', async () => {
    const s = setup();
    expect(s.displayPort.listeners.size).toBe(1);
    s.display.close();
    expect(s.displayPort.listeners.size).toBe(0);
    const setRemote = vi.spyOn(s.displayPeer, 'setRemoteDescription');
    await until(() => s.tillPort.sent.length > 0);
    s.displayPort.receive(s.tillPort.sent[0]);
    await tick();
    expect(setRemote).not.toHaveBeenCalled();
    expect(() => s.display.close()).not.toThrow();
    s.till.close();
    expect(() => s.till.close()).not.toThrow();
  });

  it('labels the till channel DISPLAY_CHANNEL and makes it ordered', async () => {
    const s = setup();
    await tick();
    expect(s.tillPeer.channels.map((channel) => [channel.label, channel.init])).toEqual([[DISPLAY_CHANNEL, { ordered: true }]]);
    s.till.close();
    s.display.close();
  });

  it('passes iceServers to the factory unchanged', () => {
    const servers: IceServer[] = [{ urls: 'stun:stun.example.test:3478' }, { urls: ['turn:t.example.test'], username: 'u', credential: 'c' }];
    for (const iceServers of [servers, []]) {
      const network = new FakeNetwork();
      const createPeer = vi.fn(network.createPeer);
      createTillPeerLink({ signal: createFakePair().till, iceServers, createPeer }).close();
      expect(createPeer).toHaveBeenCalledWith({ iceServers });
      expect(createPeer.mock.calls[0][0].iceServers).toBe(iceServers);
    }
  });
});
