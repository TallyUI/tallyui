// Ported word for word from medusapos/app `388495b1c` `tests/discount.test.tsx`'s `describe('parseDiscount')`
// (ADR-052, TV6a): the decimal comma, the thousands-separator refusal, the exponent limits, and 100% at most.
import { describe, expect, it } from 'vitest';
import { parseDiscount } from '../sale/discount-form';

describe('parseDiscount', () => {
  it.each([
    ['percentage', '', 'EUR', 'Enter a discount.'],
    ['fixed', '  ', 'EUR', 'Enter a discount.'],
    ['percentage', 'ten', 'EUR', 'Enter a number.'],
    ['fixed', '1,50', 'EUR', { type: 'fixed', value: 150 }],
    ['fixed', '1,5', 'EUR', { type: 'fixed', value: 150 }],
    ['fixed', '1,2,3', 'EUR', 'Enter a number.'],
    // A comma or dot with 3 decimals may be a thousands separator: refused in both modes, never read as 1.
    ['percentage', '1,000', 'EUR', 'Use at most 2 decimal places.'],
    ['percentage', '1.000', 'EUR', 'Use at most 2 decimal places.'],
    ['percentage', '10,125', 'EUR', 'Use at most 2 decimal places.'],
    ['fixed', '1,000', 'EUR', 'Use at most 2 decimal places.'],
    ['percentage', '12,5', 'EUR', { type: 'percentage', value: 12.5 }],
    ['percentage', '12,50', 'EUR', { type: 'percentage', value: 12.5 }],
    ['fixed', '12,5', 'EUR', { type: 'fixed', value: 1250 }],
    ['percentage', '0', 'EUR', 'Enter a discount above 0.'],
    ['fixed', '-1', 'EUR', 'Enter a discount above 0.'],
    ['percentage', '100.5', 'EUR', 'A percentage can be at most 100.'],
    ['fixed', '1.234', 'EUR', 'Use at most 2 decimal places.'],
    ['fixed', '5.5', 'JPY', 'Use a whole amount.'],
    ['percentage', '12.5', 'EUR', { type: 'percentage', value: 12.5 }],
    ['percentage', '100', 'EUR', { type: 'percentage', value: 100 }],
    ['fixed', '0.5', 'EUR', { type: 'fixed', value: 50 }],
    ['fixed', '500', 'JPY', { type: 'fixed', value: 500 }],
  ] as const)('%s %j in %s gives %j', (type, text, currency, expected) => {
    expect(parseDiscount(type, text, currency)).toEqual(expected);
  });
});
