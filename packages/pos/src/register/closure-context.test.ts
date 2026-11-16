import { expect, it } from 'vitest';
import { buildClosureDocument, createClosureContext } from './closure-document';
import { ENGLISH_CLOSURE_LABELS, labelKeys } from './document-labels';
import { formatDecimalMoney } from './money';
import closureLocalRow from './__fixtures__/closure-local-row.json';
import type { Closure } from './schemas';

it('provides non-empty English defaults for exactly the closure label keys', () => {
  expect(Object.keys(ENGLISH_CLOSURE_LABELS)).toEqual(Object.keys(labelKeys));
  for (const label of Object.values(ENGLISH_CLOSURE_LABELS)) {
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  }
});

it('formats decimal money at the specified currency exponent', () => {
  const options = { currency: 'USD', exponent: 2, locale: 'en-US' };
  expect(formatDecimalMoney('12.5', options)).toBe('$12.50');
  expect(formatDecimalMoney('-3', options)).toBe('-$3.00');
  expect(formatDecimalMoney('1200', { currency: 'JPY', exponent: 0, locale: 'en-US' })).toBe('¥1,200');
  expect(formatDecimalMoney('', options)).toBe('');
  expect(formatDecimalMoney('abc', options)).toBe('abc');
  expect(formatDecimalMoney('12.5', { ...options, currency: 'XXX' })).toBe('12.5');
});

it('creates a context with normalized currency and merged labels', () => {
  const context = createClosureContext({
    currency: 'usd', store: { name: 'S' }, locale: 'en-US', timezone: 'UTC',
    printedAt: '2026-01-02T03:04:05Z', labels: { over: 'Surplus', register_name: 'Front' },
  });
  expect(context.currency).toBe('USD');
  expect(context.exponent).toBe(2);
  expect(context.formatMoney('7')).toBe('$7.00');
  expect(context.i18n.over).toBe('Surplus');
  expect(context.i18n.short).toBe('Short');
  expect(context.i18n.register_name).toBe('Front');
  expect(context).not.toHaveProperty('expected');
  expect(context).not.toHaveProperty('breakdowns');
});

it('builds the local closure fixture without invalid display strings', () => {
  const local = closureLocalRow as unknown as Closure;
  const context = createClosureContext({ currency: 'USD', store: { name: 'S' }, locale: 'en-US' });
  const doc = buildClosureDocument(local, context);
  const walk = (value: unknown) => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith('_display') && typeof child === 'string') {
        expect(child).not.toMatch(/NaN|undefined/);
      }
      walk(child);
    }
  };
  walk(doc);
});
