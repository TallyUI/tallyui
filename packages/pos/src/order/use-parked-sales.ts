import { useEffect, useState } from 'react';
import type { RxCollection } from 'rxdb';
import { parkedOrderSummaries$, type ParkedOrderSummary } from './order-drafts';

/** The parked sales in `drafts`, newest first, live; and a discard that removes one. */
export function useParkedSales(drafts: RxCollection | undefined): {
  parked: ParkedOrderSummary[];
  discard: (id: string) => Promise<void>;
} {
  const [parked, setParked] = useState<ParkedOrderSummary[]>([]);
  useEffect(() => {
    if (!drafts) { setParked([]); return; }
    const subscription = parkedOrderSummaries$(drafts).subscribe((summaries) => {
      setParked([...summaries].sort((a, b) => b.parkedAt.localeCompare(a.parkedAt)));
    });
    return () => subscription.unsubscribe();
  }, [drafts]);

  const discard = async (id: string): Promise<void> => {
    if (!drafts) throw new Error('useParkedSales: discard() needs the drafts collection');
    await (await drafts.findOne(id).exec())?.remove();
  };
  return { parked, discard };
}
