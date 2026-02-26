import { describe, it, expect } from 'vitest';
import { calculateTax, extractTax, addTax } from './calculate';

describe('addTax', () => {
  it('adds 10% tax to $10.00', () => {
    expect(addTax(10, 0.1)).toBeCloseTo(11);
  });

  it('adds 0% tax', () => {
    expect(addTax(10, 0)).toBe(10);
  });

  it('adds 20% tax to $25.00', () => {
    expect(addTax(25, 0.2)).toBeCloseTo(30);
  });
});

describe('extractTax', () => {
  it('extracts 10% tax from $11.00 inclusive', () => {
    expect(extractTax(11, 0.1)).toBeCloseTo(1);
  });

  it('extracts 0% tax', () => {
    expect(extractTax(10, 0)).toBe(0);
  });

  it('extracts 20% tax from $30.00 inclusive', () => {
    expect(extractTax(30, 0.2)).toBeCloseTo(5);
  });
});

describe('calculateTax', () => {
  it('calculates from tax-exclusive price', () => {
    const result = calculateTax(10, 0.1, false);
    expect(result.priceExclTax).toBeCloseTo(10);
    expect(result.taxAmount).toBeCloseTo(1);
    expect(result.priceInclTax).toBeCloseTo(11);
  });

  it('calculates from tax-inclusive price', () => {
    const result = calculateTax(11, 0.1, true);
    expect(result.priceInclTax).toBeCloseTo(11);
    expect(result.taxAmount).toBeCloseTo(1);
    expect(result.priceExclTax).toBeCloseTo(10);
  });

  it('handles zero rate', () => {
    const result = calculateTax(10, 0, false);
    expect(result.priceExclTax).toBe(10);
    expect(result.taxAmount).toBe(0);
    expect(result.priceInclTax).toBe(10);
  });

  it('rounds to 2 decimal places', () => {
    const result = calculateTax(10.33, 0.075, false);
    expect(result.taxAmount).toBeCloseTo(0.77, 2);
    expect(result.priceInclTax).toBeCloseTo(11.10, 2);
  });
});
