import type { OrderCreateTaxExemptReason } from '@tallyui/core';

export function normalizeTaxExemptReason(input: { text?: string; certificateId?: string } | null): OrderCreateTaxExemptReason | null | 'needs_text' {
  const text = input?.text?.replaceAll('\u0000', '').trim();
  const certificateId = input?.certificateId?.replaceAll('\u0000', '').trim();
  if (!text) return certificateId ? 'needs_text' : null;
  return { text, ...(certificateId ? { certificateId } : {}) };
}
