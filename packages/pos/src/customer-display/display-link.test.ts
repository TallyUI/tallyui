import { describe, it, expect } from 'vitest';
import { createDisplayLink, type DisplayClock } from './display-link';
import { makeEnvelope, type DisplayConfig, type DisplayEnvelope } from './protocol';
import type { DisplayTransport } from './transport';
import { line, receiptWith } from './fixture.test-helper';

const config: DisplayConfig = {
  contract: '1.0', display: { id: 'd1', name: 'Counter' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
};
const receipt = receiptWith([line('Tea')]);
const empty = receiptWith([]);

function setup() {
  const sent: DisplayEnvelope[] = [];
  let deliver: (envelope: DisplayEnvelope) => void = () => {};
  const transport: DisplayTransport = {
    send: (envelope) => (sent.push(envelope), true),
    onMessage: (listener) => ((deliver = listener), () => { deliver = () => {}; }),
    close: () => {},
  };
  const timers: { run: () => void; ms: number; live: boolean }[] = [];
  const clock: DisplayClock = {
    setTimeout: (run, ms) => { const timer = { run, ms, live: true }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { (timer as { live: boolean }).live = false; },
  };
  const link = createDisplayLink(transport, { config, clock });
  const fire = () => timers.filter((timer) => timer.live).forEach((timer) => { timer.live = false; timer.run(); });
  const actions = () => sent.map(({ action }) => action);
  return { link, sent, hello: (envelope: DisplayEnvelope) => deliver(envelope), timers, fire, actions };
}

describe('createDisplayLink', () => {
  it('answers a hello with the config under its id, then the current state', () => {
    const { link, sent, hello } = setup();
    link.showCart(receipt);
    hello(makeEnvelope('display.hello', { template: { id: 'default', version: 1 } }, 'h1'));
    expect(sent.slice(1)).toEqual([
      { tally: 1, id: 'h1', action: 'display.config', payload: { ...config, template: { id: 'default', version: 1 } } },
      sent[0],
    ]);
    expect(sent[0]).toMatchObject({ action: 'cart.updated', payload: { receipt, linesTruncated: false } });
  });

  it('ignores anything but a hello, and sends the same state once', () => {
    const { link, sent, hello, actions } = setup();
    hello(makeEnvelope('cart.updated', { receipt, linesTruncated: false }));
    link.showCart(receipt);
    link.showCart(receipt);
    link.showCart(null);
    link.showCart(empty);
    expect(actions()).toEqual(['cart.updated', 'display.idle']);
    expect(sent[1].payload).toEqual({ reason: 'no_cart' });
  });

  it('goes idle afterCompleteMs after a completed payment, holding an empty cart until then', () => {
    const { link, timers, fire, actions } = setup();
    link.showPayment(receipt, { state: 'started' });
    expect(timers).toHaveLength(0);
    link.showPayment(receipt, { state: 'complete', leg: { method: 'Cash', amountMinor: 100 } });
    link.showCart(null);
    expect(actions()).toEqual(['payment.state', 'payment.state']);
    expect(timers[0].ms).toBe(8000);
    fire();
    expect(actions()).toEqual(['payment.state', 'payment.state', 'display.idle']);
  });

  it('cancels the idle when the next sale starts, and on close', () => {
    const { link, timers, fire, actions } = setup();
    link.showPayment(receipt, { state: 'complete' });
    link.showCart(receipt);
    fire();
    expect(actions()).toEqual(['payment.state', 'cart.updated']);
    link.showPayment(receipt, { state: 'complete' });
    link.close();
    expect(timers.every((timer) => !timer.live)).toBe(true);
  });
});
