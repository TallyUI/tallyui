/**
 * The Reports screen's Sales room: filters, hero and cards over one `SalesFigures` result.
 * Port of the WCPOS v2 Sales room layout (`screens/main/reports/`, `LEDGER.md`). It takes the
 * figures and the filter state as props; the screen works the figures out and owns the state.
 */
import type { JSX } from 'react';
import { View } from 'react-native';
import type { SalesFigures } from '@tallyui/pos';
import { SalesCards, type SalesCardId } from './cards';
import { SalesFiltersBar, type SalesFiltersBarProps } from './filters-bar';
import { SalesHero } from './hero';

export interface SalesRoomProps extends SalesFiltersBarProps {
  figures: SalesFigures;
  currency: string;
  /** Opens a card's panel. */
  onOpenCard?: (card: SalesCardId) => void;
}

export function SalesRoom({ figures, filters, onFiltersChange, currency, onOpenCard, ...bar }: SalesRoomProps): JSX.Element {
  return (
    <View testID="sales-room" className="gap-4">
      <SalesFiltersBar filters={filters} onFiltersChange={onFiltersChange} {...bar} />
      <SalesHero figures={figures} filters={filters} onFiltersChange={onFiltersChange} currency={currency} />
      <SalesCards figures={figures} currency={currency} onOpenCard={onOpenCard} />
    </View>
  );
}
