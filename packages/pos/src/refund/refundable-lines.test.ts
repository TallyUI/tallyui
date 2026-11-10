import { describe, expect, it } from 'vitest';
import { refundableLines, priceRefund } from './refundable-lines';

const A = { id: 'line-a', quantity: 3, totalMinor: 1000, taxMinor: 200 };
const requestA = { orderLineId: 'line-a', quantity: 1, restock: true };

describe('refundable lines and refund pricing', () => {
  it('full refund', () => {
    const result = priceRefund([A], [], [{ ...requestA, quantity: 3 }]);
    expect(result).toStrictEqual({
      lines: [{ orderLineId: 'line-a', quantity: 3, restock: true }],
      priced: [{ orderLineId: 'line-a', quantity: 3, netMinor: 1000, taxMinor: 200, totalMinor: 1200 }],
      clamped: [], netMinor: 1000, taxMinor: 200, totalMinor: 1200,
    });
  });

  it('partial quantity', () => {
    expect(priceRefund([A], [], [requestA])).toMatchObject({ netMinor: 333, taxMinor: 67, totalMinor: 400 });
    expect(refundableLines([A], [])).toStrictEqual([
      { orderLineId: 'line-a', refundedQuantity: 0, refundableQuantity: 3, netMinor: 1000, taxMinor: 200 },
    ]);
  });

  it('second refund after a first', () => {
    const refunds = [{ lines: [{ orderLineId: 'line-a', quantity: -1 }] }];
    expect(refundableLines([A], refunds)).toStrictEqual([
      { orderLineId: 'line-a', refundedQuantity: 1, refundableQuantity: 2, netMinor: 667, taxMinor: 133 },
    ]);
    expect(priceRefund([A], refunds, [requestA])).toMatchObject({ netMinor: 334, taxMinor: 66, totalMinor: 400 });
  });

  it('rounds half up on an odd split', () => {
    const line = { id: 'line-b', quantity: 2, totalMinor: 1001, taxMinor: 201 };
    const request = [{ orderLineId: 'line-b', quantity: 1, restock: true }];
    expect(priceRefund([line], [], request)).toMatchObject({ netMinor: 501, taxMinor: 101 });
    expect(priceRefund([line], [{ lines: request }], request)).toMatchObject({ netMinor: 500, taxMinor: 100 });
  });

  it('cumulative shares add up to the line total', () => {
    const line = { id: 'line-c', quantity: 3, totalMinor: 1249, taxMinor: 0 };
    const request = [{ orderLineId: 'line-c', quantity: 1, restock: true }];
    const amounts = [0, 1, 2].map((quantity) => priceRefund(
      [line], [{ lines: [{ orderLineId: 'line-c', quantity }] }], request,
    ).netMinor);
    expect(amounts).toStrictEqual([416, 417, 416]);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(1249);
  });

  it('line already fully refunded', () => {
    const refunds = [
      { lines: [{ orderLineId: 'line-a', quantity: 1 }] },
      { lines: [{ orderLineId: 'line-a', quantity: 2 }] },
    ];
    expect(refundableLines([A], refunds)).toStrictEqual([
      { orderLineId: 'line-a', refundedQuantity: 3, refundableQuantity: 0, netMinor: 0, taxMinor: 0 },
    ]);
    expect(priceRefund([A], refunds, [requestA])).toStrictEqual({
      lines: [], priced: [], netMinor: 0, taxMinor: 0, totalMinor: 0,
      clamped: [{ orderLineId: 'line-a', requestedQuantity: 1, quantity: 0 }],
    });
  });

  it('over-request clamped', () => {
    const result = priceRefund([A], [{ lines: [requestA] }], [{ ...requestA, quantity: 5, restock: false }]);
    expect(result).toStrictEqual({
      lines: [{ orderLineId: 'line-a', quantity: 2, restock: false }],
      priced: [{ orderLineId: 'line-a', quantity: 2, netMinor: 667, taxMinor: 133, totalMinor: 800 }],
      clamped: [{ orderLineId: 'line-a', requestedQuantity: 5, quantity: 2 }],
      netMinor: 667, taxMinor: 133, totalMinor: 800,
    });
  });

  it('unknown line and zero quantity', () => {
    expect(priceRefund([A], [], [
      { orderLineId: 'nope', quantity: 1, restock: true }, { ...requestA, quantity: 0 },
    ])).toStrictEqual({
      lines: [], priced: [], netMinor: 0, taxMinor: 0, totalMinor: 0,
      clamped: [{ orderLineId: 'nope', requestedQuantity: 1, quantity: 0 }],
    });
  });

  it('rejects bad input', () => {
    expect(() => priceRefund([A], [], [requestA, requestA])).toThrow(RangeError);
    expect(() => priceRefund([A], [], [{ ...requestA, quantity: 1.5 }])).toThrow(RangeError);
    expect(() => priceRefund([A], [], [{ ...requestA, quantity: -1 }])).toThrow(RangeError);
    expect(() => refundableLines([{ ...A, totalMinor: 10.5 }], [])).toThrow(RangeError);
    expect(() => refundableLines([{ ...A, quantity: -1 }], [])).toThrow(RangeError);
  });

  it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects non-safe integer values: %s', (value) => {
    for (const field of ['quantity', 'totalMinor', 'taxMinor']) {
      expect(() => refundableLines([{ ...A, [field]: value }], [])).toThrow(RangeError);
    }
    expect(() => refundableLines([], [{ lines: [{ orderLineId: 'unknown', quantity: value }] }])).toThrow(RangeError);
    expect(() => priceRefund([A], [], [{ ...requestA, quantity: value }])).toThrow(RangeError);
  });

  it('caps earlier quantities and gives zero amounts for zero-quantity lines', () => {
    const zero = { id: 'zero', quantity: 0, totalMinor: 100, taxMinor: 20 };
    const refunds = [{ lines: [
      { orderLineId: 'line-a', quantity: Number.MAX_SAFE_INTEGER },
      { orderLineId: 'line-a', quantity: -Number.MAX_SAFE_INTEGER },
    ] }];
    expect(refundableLines([A, zero], refunds)).toStrictEqual([
      { orderLineId: 'line-a', refundedQuantity: 3, refundableQuantity: 0, netMinor: 0, taxMinor: 0 },
      { orderLineId: 'zero', refundedQuantity: 0, refundableQuantity: 0, netMinor: 0, taxMinor: 0 },
    ]);
    expect(priceRefund([zero], [], [{ orderLineId: 'zero', quantity: 1, restock: true }])).toStrictEqual({
      lines: [], priced: [], netMinor: 0, taxMinor: 0, totalMinor: 0,
      clamped: [{ orderLineId: 'zero', requestedQuantity: 1, quantity: 0 }],
    });
  });

  it('preserves input order and inputs, ignores unknown earlier lines, and sums selected amounts', () => {
    const lines = [A, { id: 'line-b', quantity: 2, totalMinor: 1001, taxMinor: 201 }];
    const refunds = [{ lines: [{ orderLineId: 'unknown', quantity: -5 }] }];
    const request = [{ orderLineId: 'line-b', quantity: 1, restock: false }, requestA];
    const before = structuredClone({ lines, refunds, request });
    expect(refundableLines(lines, refunds)).toStrictEqual([
      { orderLineId: 'line-a', refundedQuantity: 0, refundableQuantity: 3, netMinor: 1000, taxMinor: 200 },
      { orderLineId: 'line-b', refundedQuantity: 0, refundableQuantity: 2, netMinor: 1001, taxMinor: 201 },
    ]);
    expect(priceRefund(lines, refunds, request)).toStrictEqual({
      lines: [
        { orderLineId: 'line-b', quantity: 1, restock: false },
        { orderLineId: 'line-a', quantity: 1, restock: true },
      ],
      priced: [
        { orderLineId: 'line-b', quantity: 1, netMinor: 501, taxMinor: 101, totalMinor: 602 },
        { orderLineId: 'line-a', quantity: 1, netMinor: 333, taxMinor: 67, totalMinor: 400 },
      ],
      clamped: [], netMinor: 834, taxMinor: 168, totalMinor: 1002,
    });
    expect({ lines, refunds, request }).toStrictEqual(before);
  });

  it('uses exact products beyond safe integer range', () => {
    const line = { ...A, totalMinor: Number.MAX_SAFE_INTEGER, taxMinor: 0 };
    expect(priceRefund([line], [{ lines: [requestA] }], [requestA])).toMatchObject({
      netMinor: 3002399751580331, taxMinor: 0, totalMinor: 3002399751580331,
    });
  });
});
