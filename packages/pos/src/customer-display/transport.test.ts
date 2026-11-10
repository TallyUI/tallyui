import { describe, it, expect, vi } from 'vitest';
import { makeEnvelope } from './protocol';
import { encode } from './snapshot';
import { createBroadcastDisplayTransport, type BroadcastChannelLike } from './transport';

/** A BroadcastChannel that refuses what the browser refuses: a post after close, and an uncloneable value. */
class FakeChannel implements BroadcastChannelLike {
  static open: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  private closed = false;
  constructor(readonly name: string) {
    FakeChannel.open.push(this);
  }
  postMessage(message: unknown) {
    if (this.closed) throw new DOMException('BroadcastChannel is closed.', 'InvalidStateError');
    const data = structuredClone(message);
    // Delivered as a later task to every other open channel of the name, never to the sender.
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) setTimeout(() => other.onmessage?.(new MessageEvent('message', { data })), 0);
    }
  }
  close() {
    this.closed = true;
    FakeChannel.open = FakeChannel.open.filter((channel) => channel !== this);
  }
}

const open = (name: string) => new FakeChannel(name);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const idle = makeEnvelope('display.idle', { reason: 'no_cart' }, 'i1');

describe('the fake channel', () => {
  it('refuses as the browser does', () => {
    const channel = open('x');
    expect(() => channel.postMessage(() => 1)).toThrow(expect.objectContaining({ name: 'DataCloneError' }));
    channel.close();
    expect(() => channel.postMessage('hi')).toThrow(expect.objectContaining({ name: 'InvalidStateError' }));
  });
});

describe('createBroadcastDisplayTransport', () => {
  it('carries encoded envelopes to the other window, not back to the sender', async () => {
    const till = createBroadcastDisplayTransport('t1', open);
    const display = createBroadcastDisplayTransport('t1', open);
    const heardByTill = vi.fn();
    const heardByDisplay = vi.fn();
    till.onMessage(heardByTill);
    display.onMessage(heardByDisplay);
    expect(till.send(idle)).toBe(true);
    await tick();
    expect(heardByDisplay).toHaveBeenCalledWith(idle);
    expect(heardByTill).not.toHaveBeenCalled();
    till.close();
    display.close();
  });

  it('drops what it cannot decode and never throws on it', async () => {
    const display = createBroadcastDisplayTransport('t2', open);
    const stranger = open('t2');
    const heard = vi.fn();
    display.onMessage(heard);
    for (const data of [42, 'not json', { tally: 1 }, JSON.stringify({ wcpos: 1, id: 'x', action: 'display.idle', payload: {} })]) {
      stranger.postMessage(data);
    }
    stranger.postMessage(encode(idle));
    await tick();
    expect(heard.mock.calls).toEqual([[idle]]);
    display.close();
    stranger.close();
  });

  it('stops listening on unsubscribe, and refuses to send once closed', async () => {
    const till = createBroadcastDisplayTransport('t3', open);
    const display = createBroadcastDisplayTransport('t3', open);
    const heard = vi.fn();
    display.onMessage(heard)();
    till.send(idle);
    await tick();
    expect(heard).not.toHaveBeenCalled();
    till.close();
    expect(till.send(idle)).toBe(false);
    display.close();
  });
});
