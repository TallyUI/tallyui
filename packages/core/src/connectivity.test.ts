import { describe, expect, it } from 'vitest';
import { CustomerServiceError, classifyFailure, neutralFailureClass, noResponse, type FailureClass } from '@tallyui/core';

const named = (name: string) => Object.assign(new Error(name), { name });
const caught = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('did not throw');
};
// Node's fetch rejection for a refused connection, as seen run (Node 26): no code of its own, the socket's on `cause`.
const nodeFetchFailed = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });

describe('noResponse', () => {
  it('tags a fetch rejection as a network failure, keeping the original as its cause', () => {
    const original = new TypeError('Failed to fetch');
    expect(caught(() => noResponse(original))).toMatchObject({ name: 'NoResponseError', code: 'network', cause: original });
  });

  it('rethrows an abort or a timeout unchanged', () => {
    const abort = named('AbortError');
    expect(caught(() => noResponse(abort))).toBe(abort);
  });
});

describe('neutralFailureClass', () => {
  it('is offline when no response arrived', () => {
    expect(neutralFailureClass(caught(() => noResponse(new TypeError('Failed to fetch'))))).toBe('offline');
    expect(neutralFailureClass(nodeFetchFailed())).toBe('offline');
    expect(neutralFailureClass(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toBe('offline');
    expect(neutralFailureClass(new CustomerServiceError('network', 'no answer'))).toBe('offline');
  });

  it('is null for a TypeError our own code threw', () => {
    expect(neutralFailureClass(new TypeError("Cannot read properties of undefined (reading 'json')"))).toBeNull();
    // Untagged, a fetch's own TypeError cannot be told from ours: the call site tags it with noResponse.
    expect(neutralFailureClass(new TypeError('Failed to fetch'))).toBeNull();
  });

  it('is degraded for a timeout or a 5xx', () => {
    expect(neutralFailureClass(named('AbortError'))).toBe('degraded');
    expect(neutralFailureClass(named('TimeoutError'))).toBe('degraded');
    expect(neutralFailureClass({ code: 'timeout' })).toBe('degraded');
    expect(neutralFailureClass(new CustomerServiceError('server', 'down', { status: 503 }))).toBe('degraded');
  });

  it('is null for anything else', () => {
    expect(neutralFailureClass(new CustomerServiceError('invalid', 'nope', { status: 404 }))).toBeNull();
    expect(neutralFailureClass(new Error('WooCommerce API error: 503'))).toBeNull();
    expect(neutralFailureClass('boom')).toBeNull();
    expect(neutralFailureClass(null)).toBeNull();
  });
});

describe('classifyFailure', () => {
  const refusal: FailureClass = { updateRequired: { reason: 'till_update_required', fixedBy: 'till', status: 426 } };

  it("uses the connector's own answer when it has one", () => {
    const connector = { classifyFailure: () => refusal };
    expect(classifyFailure(connector, new TypeError('x'))).toBe(refusal);
    expect(classifyFailure({ classifyFailure: () => null }, nodeFetchFailed())).toBeNull();
  });

  it('falls back to the neutral rule without one', () => {
    expect(classifyFailure({}, nodeFetchFailed())).toBe('offline');
    expect(classifyFailure(undefined, named('AbortError'))).toBe('degraded');
  });

  it('is null when the connector method throws', () => {
    expect(classifyFailure({ classifyFailure: () => { throw new Error('bug'); } }, nodeFetchFailed())).toBeNull();
  });
});
