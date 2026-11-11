import { describe, expect, it, vi } from 'vitest';
import { parseInfoCapabilities } from '../types/connector';

const body = { contracts: { 'order.create': [1, 2], register: [1] }, coupons: true };

describe('parseInfoCapabilities: customerDisplay (ADR-085)', () => {
  it('includes a valid advertisement', () => {
    const warn = vi.fn();
    const caps = parseInfoCapabilities({ ...body, customerDisplay: { v: 1, iceServers: [], snapshot: 1 } }, warn);
    expect(caps).toEqual({ orderCreate: 2, register: 1, coupons: true, customerDisplay: { iceServers: [], snapshot: true } });
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves a malformed advertisement out and warns, with the other fields unchanged', () => {
    const warn = vi.fn();
    const caps = parseInfoCapabilities({ ...body, customerDisplay: { v: 2 } }, warn);
    expect(caps).toEqual(parseInfoCapabilities(body));
    expect(caps).not.toHaveProperty('customerDisplay');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
