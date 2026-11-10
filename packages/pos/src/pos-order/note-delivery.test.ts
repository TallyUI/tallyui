import { expect, it } from 'vitest';
import { noteDelivery } from './note-delivery';
import type { PosOrder } from './types';

it.each<[string, Pick<PosOrder, 'note' | 'sentVersion' | 'downgradedFrom'>, ReturnType<typeof noteDelivery>]>([
  ['no note', { sentVersion: 6 }, 'none'],
  ['an empty note', { note: '', sentVersion: 6 }, 'none'],
  ['a note not sent yet', { note: 'Deliver after 5' }, 'pending'],
  ['a note sent at 7', { note: 'Deliver after 5', sentVersion: 7 }, 'sent'],
  ['a note capped below 7', { note: 'Deliver after 5', sentVersion: 6 }, 'not_sent'],
  ['a note downgraded from 7', { note: 'Deliver after 5', sentVersion: 6, downgradedFrom: 7 }, 'not_sent'],
  ['a note with no figures', { note: 'Deliver after 5', sentVersion: 1 }, 'not_sent'],
])('%s', (_name, order, expected) => {
  expect(noteDelivery(order)).toBe(expected);
});
