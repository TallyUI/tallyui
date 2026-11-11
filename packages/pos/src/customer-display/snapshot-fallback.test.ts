import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { DisplaySignallingError, type DisplaySignallingErrorCode } from '@tallyui/core';
import { line, receiptWith } from './fixture.test-helper';
import { displayCart, makeEnvelope, type DisplayConfig, type DisplayEnvelope } from './protocol';
import { MAX_MESSAGE_BYTES, messageBytes } from './snapshot';
import {
  createSnapshotSender, SNAPSHOT_LIFETIME_MS, SNAPSHOT_MIN_INTERVAL_MS, SNAPSHOT_RESEND_MS, type ServiceClock, type SnapshotBody,
} from './snapshot-fallback';

const config: DisplayConfig = {
  contract: '1.0', display: { id: 'd1', name: 'Counter' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
};
const cart = (name: string, note?: string) => makeEnvelope('cart.updated', displayCart(receiptWith([line(name)], note)), `c-${name}`);
const idle = makeEnvelope('display.idle', { reason: 'no_cart' }, 'idle');
const clock: ServiceClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function setup() {
  const posts: SnapshotBody[] = [];
  const errors: unknown[] = [];
  let refuse: DisplaySignallingErrorCode | null = null;
  const post = vi.fn(async (body: SnapshotBody) => {
    posts.push(body);
    if (refuse) throw new DisplaySignallingError(refuse);
  });
  const sender = createSnapshotSender({ post, clock, onError: (error) => errors.push(error) });
  const show = (event: DisplayEnvelope | null, active = true, seq = 1) => sender.update({ active, seq, config, event });
  const names = () => posts.map((body) => body.event.action === 'cart.updated' ? body.event.payload.receipt.lineItems[0].name : body.event.action);
  return { sender, posts, errors, show, names, refuseWith: (code: DisplaySignallingErrorCode | null) => { refuse = code; } };
}
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('createSnapshotSender', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('1: posts { v: 1, seq, config, event }, with a note over 1 KiB trimmed by encode', async () => {
    const s = setup();
    const note = 'n'.repeat(MAX_MESSAGE_BYTES + 10);
    s.show(cart('Tea', note), true, 3);
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.posts).toHaveLength(1);
    const [body] = s.posts;
    expect(body).toMatchObject({ v: 1, seq: 3, config, event: { action: 'cart.updated', id: 'c-Tea' } });
    const posted = body.event.action === 'cart.updated' ? body.event.payload.receipt.footer.note! : '';
    expect(messageBytes(posted)).toBe(1024);
    expect(messageBytes(JSON.stringify(body))).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    s.sender.stop();
  });

  it('1: a body still over the cap after trimming is not posted, is reported once as too_large, and a changed body posts', async () => {
    const s = setup();
    const huge = makeEnvelope('display.idle', { reason: 'x'.repeat(MAX_MESSAGE_BYTES) }, 'big');
    s.show(huge);
    s.show(huge);
    await wait(SNAPSHOT_RESEND_MS);
    expect(s.posts).toHaveLength(0);
    expect(s.errors).toEqual([expect.objectContaining({ code: 'too_large' })]);
    s.show(cart('Tea'));
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.names()).toEqual(['Tea']);
    s.show(null);
    await wait(SNAPSHOT_RESEND_MS);
    expect(s.posts).toHaveLength(1);
    s.sender.stop();
  });

  it('2: five updates inside one second give one POST, of the last body (trailing edge)', async () => {
    const s = setup();
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      s.show(cart(name));
      await wait(150);
    }
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.names()).toEqual(['E']);
    s.sender.stop();
  });

  it('2: one POST in flight; an update during it waits for it to settle', async () => {
    const s = setup();
    let settle: () => void = () => {};
    const post = vi.fn((body: SnapshotBody) => {
      s.posts.push(body);
      return new Promise<void>((resolve) => { settle = resolve; });
    });
    const sender = createSnapshotSender({ post, clock });
    sender.update({ active: true, seq: 1, config, event: cart('A') });
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    sender.update({ active: true, seq: 1, config, event: cart('B') });
    await wait(SNAPSHOT_MIN_INTERVAL_MS * 3);
    expect(s.names()).toEqual(['A']);
    settle();
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.names()).toEqual(['A', 'B']);
    sender.stop();
  });

  it('3: re-sends the identical body 20 s after its last successful POST, while active', async () => {
    const s = setup();
    s.show(cart('Tea'));
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    await wait(SNAPSHOT_RESEND_MS - 1);
    expect(s.posts).toHaveLength(1);
    await wait(1);
    expect(s.posts).toHaveLength(2);
    expect(s.posts[1]).toEqual(s.posts[0]);
    s.sender.stop();
  });

  it('4: a body refused with too_large is never re-sent; a changed body posts', async () => {
    const s = setup();
    s.refuseWith('too_large');
    s.show(cart('Tea'));
    await wait(SNAPSHOT_MIN_INTERVAL_MS + SNAPSHOT_RESEND_MS * 3);
    expect(s.posts).toHaveLength(1);
    expect(s.errors).toEqual([expect.objectContaining({ code: 'too_large' })]);
    s.refuseWith(null);
    s.show(cart('Cake'));
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.names()).toEqual(['Tea', 'Cake']);
    s.sender.stop();
  });

  it('4: a network failure is retried at the next re-send, and reported', async () => {
    const s = setup();
    s.refuseWith('network');
    s.show(cart('Tea'));
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    s.refuseWith(null);
    await wait(SNAPSHOT_RESEND_MS - 1);
    expect(s.posts).toHaveLength(1);
    await wait(1);
    expect(s.posts).toHaveLength(2);
    expect(s.errors).toEqual([expect.objectContaining({ code: 'network' })]);
    s.sender.stop();
  });

  it('5: inactive posts nothing and clears the timers; active again posts the current body under the rate rule', async () => {
    const s = setup();
    s.show(cart('Tea'), false);
    await wait(SNAPSHOT_RESEND_MS * 2);
    expect(s.posts).toHaveLength(0);
    s.show(cart('Tea'));
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.names()).toEqual(['Tea']);
    s.show(cart('Tea'), false);
    expect(vi.getTimerCount()).toBe(0);
    await wait(SNAPSHOT_RESEND_MS * 2);
    expect(s.posts).toHaveLength(1);
    s.sender.stop();
  });

  it('6: idle clears a recent cart even when inactive, and is not re-sent', async () => {
    const s = setup();
    s.show(cart('Tea'));
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    s.show(cart('Tea'), false);
    s.show(idle, false);
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    expect(s.names()).toEqual(['Tea', 'display.idle']);
    await wait(SNAPSHOT_RESEND_MS * 2);
    expect(s.posts).toHaveLength(2);
    s.sender.stop();
  });

  it('6: no idle clear while inactive once the cart post is older than 60 s', async () => {
    const s = setup();
    s.show(cart('Tea'));
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    s.show(cart('Tea'), false);
    await wait(SNAPSHOT_LIFETIME_MS);
    s.show(idle, false);
    await wait(SNAPSHOT_RESEND_MS);
    expect(s.names()).toEqual(['Tea']);
    s.sender.stop();
  });

  it('7: stop clears every timer, and nothing follows a POST in flight', async () => {
    const s = setup();
    let settle: () => void = () => {};
    const post = vi.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
    const sender = createSnapshotSender({ post, clock });
    sender.update({ active: true, seq: 1, config, event: cart('A') });
    await wait(SNAPSHOT_MIN_INTERVAL_MS);
    sender.update({ active: true, seq: 1, config, event: cart('B') });
    sender.stop();
    settle();
    await wait(SNAPSHOT_RESEND_MS * 2);
    expect(post).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    s.show(cart('C'));
    s.sender.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
