import { describe, it, expect, vi } from 'vitest';
import { parseInfoCapabilities, parseTaxRounding, parseLineTax, resolveCapabilities } from './connector';

describe('resolveCapabilities (ADR-062)', () => {
  it.each([true, false])('accepts multiplePayments %s', (multiplePayments) => {
    expect(resolveCapabilities({ orderCreate: 3, multiplePayments }, undefined))
      .toEqual({ orderCreate: 3, multiplePayments });
  });

  it('gives the fresh value when there is no stored value', () => {
    expect(resolveCapabilities({ orderCreate: 2 }, undefined)).toEqual({ orderCreate: 2 });
  });

  it('keeps the stored value when the fresh read was inconclusive', () => {
    expect(resolveCapabilities(undefined, { orderCreate: 2 })).toEqual({ orderCreate: 2 });
  });

  it('lets a definitive fresh read win, even a downgrade', () => {
    expect(resolveCapabilities({ orderCreate: 1 }, { orderCreate: 2 })).toEqual({ orderCreate: 1 });
  });

  it('gives undefined when neither is known', () => {
    expect(resolveCapabilities(undefined, undefined)).toBeUndefined();
  });
});

describe('parseTaxRounding (#287)', () => {
  it.each([true, false])('keeps WooCommerce roundAtSubtotal %s and strips extra keys', (roundAtSubtotal) => {
    const warn = vi.fn();
    expect(parseTaxRounding({ granularity: 'woocommerce', roundAtSubtotal, x: 1 }, warn))
      .toStrictEqual({ granularity: 'woocommerce', roundAtSubtotal });
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects a string WooCommerce roundAtSubtotal with a warning', () => {
    const warn = vi.fn();
    expect(parseTaxRounding({ granularity: 'woocommerce', roundAtSubtotal: 'true' }, warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('malformed taxRounding'));
  });

  it.each(['per_order', 'per_line_items', 'per_rate_group_items'] as const)('keeps %s with each mode', (granularity) => {
    for (const mode of ['half_away_from_zero', 'half_up'] as const) {
      const warn = vi.fn();
      expect(parseTaxRounding({ granularity, mode }, warn)).toStrictEqual({ granularity, mode });
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it('keeps custom, and drops a mode on it', () => {
    const warn = vi.fn();
    expect(parseTaxRounding({ granularity: 'custom' }, warn)).toStrictEqual({ granularity: 'custom' });
    expect(parseTaxRounding({ granularity: 'custom', mode: 'half_up' }, warn)).toStrictEqual({ granularity: 'custom' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('gives undefined, without a warning, when absent', () => {
    const warn = vi.fn();
    expect(parseTaxRounding(undefined, warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('strips extra keys', () => {
    expect(parseTaxRounding({ granularity: 'per_line_items', mode: 'half_up', extra: 1 })).toStrictEqual({ granularity: 'per_line_items', mode: 'half_up' });
    expect(parseTaxRounding({ granularity: 'custom', extra: 1 })).toStrictEqual({ granularity: 'custom' });
  });

  it.each([
    ['an unknown granularity', { granularity: 'per_invoice', mode: 'half_up' }],
    ['a missing mode', { granularity: 'per_order' }],
    ['an unknown mode', { granularity: 'per_order', mode: 'banker' }],
    ['a missing granularity', { mode: 'half_up' }],
    ['a string', 'per_order'],
    ['null', null],
    ['an array', [{ granularity: 'custom' }]],
  ])('gives undefined and warns once for %s', (_name, value) => {
    const warn = vi.fn();
    expect(parseTaxRounding(value, warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('malformed taxRounding');
  });
});

describe('parseLineTax (ADR-075)', () => {
  it.each([
    { none: false, classes: false },
    { none: true, classes: true },
    { none: false, classes: true },
    { none: true, classes: false },
  ])('keeps boolean capabilities %j', (value) => {
    const warn = vi.fn();
    expect(parseLineTax(value, warn)).toStrictEqual(value);
    expect(warn).not.toHaveBeenCalled();
  });

  it('strips extra keys', () => {
    expect(parseLineTax({ none: true, classes: true, extra: 1 })).toStrictEqual({ none: true, classes: true });
  });

  it('gives undefined without warning when absent', () => {
    const warn = vi.fn();
    expect(parseLineTax(undefined, warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([{ none: 'yes', classes: true }, null, [], true])('rejects malformed lineTax %j with one warning', (value) => {
    const warn = vi.fn();
    expect(parseLineTax(value, warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^ignoring a malformed lineTax/));
  });
});

describe('parseInfoCapabilities (ADR-062, #287)', () => {
  it('reads the order.refund capability (ADR-080)', () => {
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1], 'order.refund': [1] } }))
      .toStrictEqual({ orderCreate: 1, orderRefund: 1 });
  });

  it.each([undefined, null, [], [0, -1, 1.5, '1'], 1, {}])('omits missing or malformed order.refund %j', (refund) => {
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1], 'order.refund': refund } }))
      .toStrictEqual({ orderCreate: 1 });
  });

  it.each([
    { none: false, classes: false },
    { none: true, classes: true },
  ])('reads top-level lineTax %j beside contracts', (lineTax) => {
    const warn = vi.fn();
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1, 2, 3, 4, 5] }, lineTax }, warn))
      .toStrictEqual({ orderCreate: 5, lineTax });
    expect(warn).not.toHaveBeenCalled();
  });

  it('strips extra keys from lineTax', () => {
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1, 2, 3, 4, 5] }, lineTax: { none: true, classes: true, extra: 1 } }))
      .toStrictEqual({ orderCreate: 5, lineTax: { none: true, classes: true } });
  });

  it('omits absent lineTax without warning', () => {
    const warn = vi.fn();
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1, 2, 3, 4, 5] } }, warn)).toStrictEqual({ orderCreate: 5 });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([{ none: 'yes', classes: true }, null, [], true])('keeps other capabilities for malformed lineTax %j', (lineTax) => {
    const warn = vi.fn();
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1, 2, 3, 4, 5], register: [1] }, taxRounding: { granularity: 'custom' }, lineTax }, warn))
      .toStrictEqual({ orderCreate: 5, register: 1, taxRounding: { granularity: 'custom' } });
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('malformed lineTax'));
  });

  it('reads contracts without taxRounding', () => {
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1, 2, 3], register: [1] } })).toStrictEqual({ orderCreate: 3, register: 1 });
  });

  it('reads the top-level taxRounding beside contracts', () => {
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1, 2, 3] }, taxRounding: { granularity: 'per_rate_group_items', mode: 'half_up' } }))
      .toStrictEqual({ orderCreate: 3, taxRounding: { granularity: 'per_rate_group_items', mode: 'half_up' } });
  });

  it('gives undefined for a present malformed taxRounding and warns that settings wait', () => {
    const warn = vi.fn();
    expect(parseInfoCapabilities({ contracts: { 'order.create': [1, 2] }, taxRounding: { granularity: 'bogus' } }, warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('settings wait');
  });

  it('gives orderCreate 1 for missing or malformed contracts without taxRounding', () => {
    expect(parseInfoCapabilities({ contracts: { 'order.create': ['2', -1] } })).toStrictEqual({ orderCreate: 1 });
  });

  it.each([null, [], 42, 'x'])('gives unknown for a non-object body (%s)', (body) => {
    const warn = vi.fn();
    expect(parseInfoCapabilities(body, warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
