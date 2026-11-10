import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { makeEnvelope, type DisplayConfig, type DisplayEnvelope } from './protocol';
import type { DisplayTransport } from './transport';
import { DISPLAY_TEMPLATE, HELLO_RETRY_MS, useCustomerDisplay } from './use-customer-display';
import { line, receiptWith } from './fixture.test-helper';

const config: DisplayConfig = {
  contract: '1.0', display: { id: 'd1', name: 'Counter' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
};
const cart = makeEnvelope('cart.updated', { receipt: receiptWith([line('Tea')]), linesTruncated: false });

function fakeTransport() {
  const sent: DisplayEnvelope[] = [];
  const listeners = new Set<(envelope: DisplayEnvelope) => void>();
  const transport: DisplayTransport = {
    send: (envelope) => (sent.push(envelope), true),
    onMessage: (listener) => (listeners.add(listener), () => { listeners.delete(listener); }),
    close: () => {},
  };
  const deliver = (envelope: DisplayEnvelope) => act(() => listeners.forEach((listener) => listener(envelope)));
  return { transport, sent, deliver, listeners };
}

afterEach(() => vi.useRealTimers());

describe('useCustomerDisplay', () => {
  it('says hello, takes only the config that answers it, then shows the cart', () => {
    const { transport, sent, deliver } = fakeTransport();
    const { result } = renderHook(() => useCustomerDisplay(transport));
    expect(sent).toEqual([expect.objectContaining({ action: 'display.hello', payload: { template: DISPLAY_TEMPLATE } })]);
    deliver(cart);
    deliver(makeEnvelope('display.config', config, 'someone-else'));
    expect(result.current.config).toBeNull();
    expect(result.current.view.screen).toBe('idle');
    deliver(makeEnvelope('display.config', config, sent[0].id));
    deliver(cart);
    expect(result.current).toEqual({ config, view: { screen: 'cart', cart: cart.payload } });
  });

  it('re-sends the same hello until a config answers it, and unsubscribes on unmount', () => {
    vi.useFakeTimers();
    const { transport, sent, deliver, listeners } = fakeTransport();
    const { unmount } = renderHook(() => useCustomerDisplay(transport));
    act(() => { vi.advanceTimersByTime(HELLO_RETRY_MS * 2); });
    expect(sent.map(({ id }) => id)).toEqual([sent[0].id, sent[0].id, sent[0].id]);
    deliver(makeEnvelope('display.config', config, sent[0].id));
    act(() => { vi.advanceTimersByTime(HELLO_RETRY_MS * 2); });
    expect(sent).toHaveLength(3);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
