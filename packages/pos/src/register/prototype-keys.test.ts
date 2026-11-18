// A store's refund `byMethod` is parsed from JSON, so it can carry an own key named like an
// Object.prototype member. `JSON.parse` makes `__proto__` an own key; an object literal would not.
import { afterEach, expect, it } from 'vitest';
import { deriveDrawerTerms, deriveExpected, type RefundRow } from './expected';

const hostile = () => JSON.parse('{"__proto__":100,"constructor":50,"toString":25}') as Record<string, number>;
const refund: RefundRow = {
  id: 'refund', sessionId: 'session', status: 'applied', result: { byMethod: hostile(), totalMinor: 175, refunds: [] },
};
const input = {
  session: { id: 'session', countedFloatMinor: 10000 },
  ledgerRowsBySession: [{ session_id: 'session', kind: 'other', method_id: 'external', status: 'captured', amountMinor: 1000 }],
  movements: [],
  refunds: [refund],
};

afterEach(() => {
  Reflect.deleteProperty(Object.prototype, 'amountMinor');
  Reflect.deleteProperty(Object.prototype, 'count');
  Reflect.deleteProperty(Object, 'amountMinor');
});

it('deriveExpected keeps prototype-named methods as own keys with their refunds', () => {
  const result = deriveExpected(input);
  expect(Object.hasOwn(result, '__proto__')).toBe(true);
  expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe(-100);
  expect(result.constructor).toBe(-50);
  expect(result.toString).toBe(-25);
  expect(result.cash).toBe(10000);
  expect(result.external).toBe(1000);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
});

it('deriveDrawerTerms keeps prototype-named tenders as own keys and never writes Object.prototype', () => {
  const terms = deriveDrawerTerms(input);
  for (const [method, amountMinor] of [['__proto__', -100], ['constructor', -50], ['toString', -25]] as const) {
    expect(Object.hasOwn(terms.otherTenders, method)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(terms.otherTenders, method)?.value).toStrictEqual({ amountMinor, count: 1 });
  }
  expect(terms.sessionSalesMinor).toBe(1000 - 175);
  expect(terms.expected).toStrictEqual(deriveExpected(input));
  expect(Object.hasOwn(Object.prototype, 'amountMinor')).toBe(false);
  expect(Object.hasOwn(Object.prototype, 'count')).toBe(false);
  expect(Object.hasOwn(Object, 'amountMinor')).toBe(false);
});
