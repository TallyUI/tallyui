import { describe, expect, it } from 'vitest';
import type { CommandWarning } from '@tallyui/core';
import { moneyDivergence } from './money-divergence';

const figures: CommandWarning = { code: 'figures_mismatch', fields: [
  { field: 'taxMinor', tillMinor: 210, serverMinor: 200 }, { field: 'subtotalMinor', tillMinor: 1050, serverMinor: 1000 },
] };
const lineFigures: CommandWarning = { code: 'line_figures_mismatch', lines: [
  { lineId: 'l2', field: 'taxMinor', tillMinor: 100, serverMinor: 99 },
  { lineId: 'l1', field: 'totalMinor', tillMinor: 1000, serverMinor: 990 },
  { lineId: 'l2', field: 'totalMinor', tillMinor: 500, serverMinor: 499 },
] };

describe('moneyDivergence', () => {
  it('is null with no warnings, or only total_mismatch and insufficient_stock (D1)', () => {
    expect(moneyDivergence({})).toBeNull();
    expect(moneyDivergence({ warnings: [] })).toBeNull();
    expect(moneyDivergence({ warnings: [
      { code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1000 },
      { code: 'insufficient_stock', variantId: 'blue', quantity: 1 },
    ] })).toBeNull();
  });

  it('gives the order figures of a figures_mismatch (D2)', () => {
    expect(moneyDivergence({ warnings: [figures] })).toEqual({ orderFields: ['taxMinor', 'subtotalMinor'], lineIds: [] });
  });

  it('gives the distinct line ids of a line_figures_mismatch in first-seen order (D3)', () => {
    expect(moneyDivergence({ warnings: [lineFigures] })).toEqual({ orderFields: [], lineIds: ['l2', 'l1'] });
  });

  it('gives both lists when both codes are present (D4)', () => {
    expect(moneyDivergence({ warnings: [figures, lineFigures] })).toEqual({ orderFields: ['taxMinor', 'subtotalMinor'], lineIds: ['l2', 'l1'] });
  });

  it('is null for a line_figures_mismatch knownWarnings drops (D5)', () => {
    const dropped = { code: 'line_figures_mismatch', lines: [{ lineId: '', field: 'taxMinor', tillMinor: 100, serverMinor: 99 }] } as CommandWarning;
    expect(moneyDivergence({ warnings: [dropped] })).toBeNull();
  });
});
