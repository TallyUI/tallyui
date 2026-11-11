import type { VariantOptionGroup, VariantSummary } from '@tallyui/core';

/** Picks so far, group name → value. */
export type OptionPicks = Readonly<Record<string, string>>;

const has = (options: Record<string, string>, name: string) => Object.prototype.hasOwnProperty.call(options, name);

/** A variant fits the picks when, for every picked group, it has no value (an "Any" group) or the same value.
 * A variant with `options` undefined fits only empty picks. */
export function variantFits(variant: VariantSummary, picks: OptionPicks): boolean {
  const { options } = variant;
  if (options === undefined) return Object.keys(picks).length === 0;
  return Object.entries(picks).every(([name, value]) => !has(options, name) || options[name] === value);
}

/**
 * The variant for complete picks (every group in `groups` picked): the first fitting variant in the given
 * order, preferring one whose own value matches over an "Any" one; undefined when none fits or picks are incomplete.
 * The variant with the most groups set to exactly the picked value wins; a tie goes to the first in order.
 */
export function matchVariant(variants: readonly VariantSummary[], groups: readonly VariantOptionGroup[],
  picks: OptionPicks): VariantSummary | undefined {
  if (!groups.every(({ name }) => has(picks, name))) return undefined;
  let best: VariantSummary | undefined;
  let bestScore = -1;
  for (const variant of variants) {
    if (!variantFits(variant, picks)) continue;
    const score = groups.filter(({ name }) => variant.options?.[name] === picks[name]).length;
    if (score > bestScore) { best = variant; bestScore = score; }
  }
  return best;
}

/** Per group, the values no fitting variant allows given the OTHER groups' picks (v2 getDisabledVariationOptions). */
export function disabledOptions(variants: readonly VariantSummary[], groups: readonly VariantOptionGroup[],
  picks: OptionPicks): Record<string, Set<string>> {
  const disabled: Record<string, Set<string>> = {};
  for (const { name, values } of groups) {
    const others = Object.fromEntries(Object.entries(picks).filter(([group]) => group !== name));
    const fitting = variants.filter((variant) => variantFits(variant, others));
    disabled[name] = new Set(values.filter((value) => !fitting.some((variant) => variantFits(variant, { [name]: value }))));
  }
  return disabled;
}
