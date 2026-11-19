import { cn } from '@tallyui/theme';

/**
 * Port of WCPOS v2 `packages/components/src/lib/current-row.ts`.
 * The one mark for the current row (component-consistency decision 11): `true` paints the row
 * `bg-muted` with a 2 pt primary bar on its left edge; `false` keeps the bar's room transparent,
 * so a list's content lines up either way; unset draws no bar. Padding is the caller's: a row that
 * pads its content takes the bar's 2 back from its left padding.
 */
export function currentRowMark(selected: boolean | undefined): string | undefined {
  if (selected === undefined) return undefined;
  return cn('border-l-2', selected ? 'border-l-primary bg-muted' : 'border-l-transparent');
}
