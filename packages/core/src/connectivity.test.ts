import { describe, expect, it } from 'vitest';
import { CustomerServiceError, classifyFailure, neutralFailureClass, type FailureClass } from '@tallyui/core';

const named = (name: string) => Object.assign(new Error(name), { name });

describe('neutralFailureClass', () => {
  it('is offline when no response arrived', () => {
    expect(neutralFailureClass(new TypeError('Failed to fetch'))).toBe('offline');
    expect(neutralFailureClass(new CustomerServiceError('network', 'no answer'))).toBe('offline');
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
    expect(classifyFailure({ classifyFailure: () => null }, new TypeError('x'))).toBeNull();
  });

  it('falls back to the neutral rule without one', () => {
    expect(classifyFailure({}, new TypeError('x'))).toBe('offline');
    expect(classifyFailure(undefined, named('AbortError'))).toBe('degraded');
  });

  it('is null when the connector method throws', () => {
    expect(classifyFailure({ classifyFailure: () => { throw new Error('bug'); } }, new TypeError('x'))).toBeNull();
  });
});
