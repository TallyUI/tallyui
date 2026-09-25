/**
 * Corrections layered onto a closure's recorded figures (ADR-032): late sales, late cash
 * movements and recounts, applied in order and deduplicated by id. Port provenance (ADR-032
 * amendment 1): WCPOS `next` `3b5331b5c` `settled-figures.ts`. Money is TallyUI's integer
 * minor-units convention: WCPOS's four-decimal-string arithmetic becomes direct integer
 * arithmetic on a2's `*_minor` fields and tender maps.
 */
import type { Closure } from './schemas';

export type Correction = {
  id: number;
  type: 'late_sale' | 'late_movement' | 'recount';
  created_at: string;
  actor: { id: string; name: string };
  approver: { id: string; name: string } | null;
  reason: string;
  figures: {
    expected_delta?: Record<string, number>;
    cash_delta?: number;
    sales_delta?: number;
    refunds_delta?: number;
    counted?: Record<string, number>;
    variance?: Record<string, number>;
  };
};

export type RecordedFigures = Pick<
  Closure,
  | 'expected'
  | 'counted'
  | 'variance'
  | 'period_sales_total_minor'
  | 'period_refunds_total_minor'
  | 'perpetual_sales_total_minor'
  | 'perpetual_refunds_total_minor'
>;

/**
 * Folds `corrections` onto `recorded`, ordered by `created_at` then `id`, deduplicated by `id`.
 * A `recount` replaces the supplied tenders in `counted`; a `late_movement` adds its signed
 * `cash_delta` to expected cash; a `late_sale` adds its `expected_delta` tenders to expected and
 * its `sales_delta`/`refunds_delta` to both the period and perpetual totals. Variance is
 * recomputed for every tender named by expected or counted, once any correction applies.
 * `touched` names every field, or `field.tender`, whose settled value differs from `recorded`.
 */
export function deriveSettled(recorded: RecordedFigures, corrections: readonly Correction[]) {
  const settled = {
    ...recorded,
    expected: { ...recorded.expected },
    counted: { ...recorded.counted },
    variance: { ...recorded.variance },
  };
  const seen = new Set<number>();
  for (const correction of [...corrections].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
  )) {
    if (seen.has(correction.id)) continue;
    seen.add(correction.id);
    const f = correction.figures;
    if (correction.type === 'recount' && f.counted) Object.assign(settled.counted, f.counted);
    const deltas: Record<string, number> =
      correction.type === 'late_movement'
        ? { cash: f.cash_delta ?? 0 }
        : correction.type === 'late_sale'
          ? (f.expected_delta ?? {})
          : {};
    for (const [tender, delta] of Object.entries(deltas))
      settled.expected[tender] = (settled.expected[tender] ?? 0) + delta;
    if (correction.type === 'late_sale') {
      settled.period_sales_total_minor += f.sales_delta ?? 0;
      settled.perpetual_sales_total_minor += f.sales_delta ?? 0;
      settled.period_refunds_total_minor += f.refunds_delta ?? 0;
      settled.perpetual_refunds_total_minor += f.refunds_delta ?? 0;
    }
  }
  if (corrections.length)
    for (const tender of new Set([...Object.keys(settled.expected), ...Object.keys(settled.counted)]))
      settled.variance[tender] = (settled.counted[tender] ?? 0) - (settled.expected[tender] ?? 0);
  const touched = new Set<string>();
  for (const field of [
    'expected',
    'counted',
    'variance',
    'period_sales_total_minor',
    'period_refunds_total_minor',
    'perpetual_sales_total_minor',
    'perpetual_refunds_total_minor',
  ] as const) {
    const value = settled[field];
    if (typeof value === 'number') {
      if (value !== (recorded[field] as number)) touched.add(field);
    } else
      for (const [tender, amount] of Object.entries(value))
        if (amount !== ((recorded[field] as Record<string, number>)[tender] ?? 0))
          touched.add(`${field}.${tender}`);
  }
  return { settled, touched };
}
