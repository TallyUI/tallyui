import { useEffect, useRef } from 'react';
import type { DisplayLink } from './display-link';
import { createSaleDisplayPublisher, type SaleDisplayInput, type SaleDisplayOptions, type SaleDisplayPublisher } from './sale-display';

/** Publishes the sale to `link` on every change; a null link publishes nothing. Closes the publisher when the link changes or on unmount. */
export function useSaleDisplay(link: DisplayLink | null, sale: SaleDisplayInput, options?: SaleDisplayOptions): void {
  // Read through a ref, so a new options object each render neither re-creates the publisher nor goes stale.
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const held = useRef<{ link: DisplayLink; publisher: SaleDisplayPublisher } | null>(null);
  useEffect(() => {
    if (!link) return;
    if (held.current?.link !== link) {
      const live: SaleDisplayOptions = {
        get receipt() { return latest.current?.receipt; },
        get methodTitle() { return latest.current?.methodTitle; },
        get declinedMessage() { return latest.current?.declinedMessage; },
      };
      held.current = { link, publisher: createSaleDisplayPublisher(link, live) };
    }
    held.current.publisher.update({ order: sale.order, stage: sale.stage });
  }, [link, sale.order, sale.stage]);
  // Closes the old link's publisher; the hook test pins that the old link gets idle and the new one the sale.
  useEffect(() => () => {
    held.current?.publisher.close();
    held.current = null;
  }, [link]);
}
