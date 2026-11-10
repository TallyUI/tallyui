import type { PosOrder } from './types';

export type NoteDelivery = 'none' | 'pending' | 'sent' | 'not_sent';

/**
 * ADR-083 condition 2: a note goes only at order.create 7, and the outbox stores the version every attempt goes out at
 * (`sentVersion`, lowered on a downgrade), so a sale whose stored version is below 7 went without its note.
 */
export function noteDelivery(order: Pick<PosOrder, 'note' | 'sentVersion'>): NoteDelivery {
  if (!order.note) return 'none';
  if (order.sentVersion === undefined) return 'pending';
  return order.sentVersion >= 7 ? 'sent' : 'not_sent';
}
