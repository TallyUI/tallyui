// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS_PATH, PROTOCOL_HEADER, PROTOCOL_VERSION, type CommandEnvelope, type OrderCreatePayload } from '@tallyui/core';
import { createHttpCommandTransport } from './http-transport';

const commands: CommandEnvelope<OrderCreatePayload>[] = [{
  id: 'command-1', type: 'order.create', version: 1, deviceId: 'device-1', attempt: 1,
  createdAt: '2026-09-23T12:00:00.000Z',
  payload: { clientOrderId: 'order-1', createdAt: '2026-09-23T12:00:00.000Z', currency: 'EUR',
    pricesIncludeTax: false, lines: [], payments: [], subtotalMinor: 0, taxMinor: 0, totalMinor: 0 },
}];

afterEach(() => vi.useRealTimers());

describe('HTTP command transport', () => {
  it('posts commands with protocol and fresh asynchronous authentication headers', async () => {
    const results = [{ id: 'command-1', status: 'applied', serverRefs: { orderId: 'server-1', totalMinor: 0 } }];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json({ results }));
    const getHeaders = vi.fn().mockResolvedValueOnce({ Authorization: 'Bearer first' })
      .mockResolvedValueOnce({ Authorization: 'Bearer second' });
    const transport = createHttpCommandTransport({ baseUrl: 'https://shop.example', getHeaders, fetch });
    expect(await transport.send(commands)).toEqual({ kind: 'results', results });
    await transport.send(commands);
    expect(fetch).toHaveBeenNthCalledWith(1, `https://shop.example${COMMANDS_PATH}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
        Authorization: 'Bearer first' }, body: JSON.stringify({ commands }), signal: expect.any(AbortSignal),
    });
    expect(fetch.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer second' });
  });

  it.each([500, 409, 401, 429, 400])('retries status %i', async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ code: 'in_progress' }, { status }));
    const transport = createHttpCommandTransport({ baseUrl: '', getHeaders: () => ({}), fetch });
    expect(await transport.send(commands)).toEqual({ kind: 'retry', reason: `status_${status}` });
  });

  it('retries a thrown fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('offline'));
    const transport = createHttpCommandTransport({ baseUrl: '', getHeaders: () => ({}), fetch });
    expect(await transport.send(commands)).toEqual({ kind: 'retry', reason: 'network' });
  });

  it.each(['{}', 'not json'])('retries a bad 200 body: %s', async (body) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(body));
    const transport = createHttpCommandTransport({ baseUrl: '', getHeaders: () => ({}), fetch });
    expect(await transport.send(commands)).toEqual({ kind: 'retry', reason: 'bad_body' });
  });

  it('reads Retry-After seconds', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '3' } }));
    const transport = createHttpCommandTransport({ baseUrl: '', getHeaders: () => ({}), fetch });
    expect(await transport.send(commands)).toEqual({ kind: 'retry', reason: 'status_429', retryAfterMs: 3000 });
  });

  it.each([undefined, 25])('aborts after the configured timeout (%s)', async (timeoutMs) => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const transport = createHttpCommandTransport({ baseUrl: '', getHeaders: () => ({}), fetch, timeoutMs });
    const outcome = transport.send(commands);
    await vi.advanceTimersByTimeAsync(timeoutMs ?? 30000);
    expect(await outcome).toEqual({ kind: 'retry', reason: 'network' });
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
