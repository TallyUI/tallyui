import type { OrderCreateEnvelope } from '@tallyui/core';
import { useEffect, useRef, useState } from 'react';
import type { RxCollection, RxError } from 'rxdb';
import { outboxLogger } from './logger';
import { OrderContentMismatchError, sameSale, type PosOrder } from '../pos-order';
import { watchFresh } from '../rxdb';
import { createOrderOutbox } from './order-outbox';
import type { CommandTransport, OutboxState } from './types';

const idle: OutboxState = { pending: 0, sending: false };
const noneStuck: readonly string[] = [];
export { outboxLogger } from './logger';

export interface UseOrderOutboxOptions {
  /** Which order store to use (medusapos: the backend's base URL); `null` means no store. A change reopens. */
  storeKey: string | null;
  /** Opens the order store for `storeKey`; `close()` is called when the key or device id changes, or on unmount. */
  open(storeKey: string): Promise<{ orders: RxCollection<PosOrder>; close(): Promise<void> }>;
  /** Builds the command transport for `storeKey` (the app's HTTP transport and auth headers). Read once per open. */
  transport(storeKey: string): CommandTransport<OrderCreateEnvelope>;
  /** The device id sent on every command (see `getDeviceId`). A change reopens. */
  deviceId: string;
  /** Presence is fixed when the store opens; calls use the latest function. Reopen to add or remove. */
  getMaxOrderCreateVersion?: () => number | undefined | Promise<number | undefined>;
  /** Presence is fixed when the store opens; calls use the latest function. Reopen to add or remove. */
  refreshCapabilities?: () => Promise<void>;
  /** Called with `state.sending`, and with `false` on cleanup (medusapos: live-tab's `markBusy('outbox', …)`). */
  onBusy?(busy: boolean): void;
  /** Called when `open` rejects, even if the key has changed since (medusapos: reports storage worker failures). */
  onOpenError?(error: unknown): void;
}

export interface UseOrderOutboxResult {
  /** The open orders collection, or `null` until the current store is ready. */
  orders: RxCollection<PosOrder> | null;
  /** The outbox state, or idle until the current store is ready. */
  state: OutboxState;
  /** The newest 50 orders, newest first; empty until the current store is ready. */
  recent: PosOrder[];
  /**
   * Stores a finalized order, then flushes. Throws the opening error, or "Orders are not ready.", before the store is ready.
   * Recording an order whose `id` is already stored, not deleted, with the same money-bearing content (`sameSale`;
   * a retried `complete()`) counts as stored, never overwrites it, and still flushes, whatever the stored `commandId`
   * (a requeue mints a new one; the difference is logged at warn). Other content rejects with `OrderContentMismatchError`.
   */
  record(posOrder: PosOrder): Promise<void>;
  /**
   * Whether the current store holds this order `id`, not deleted, with the same money-bearing content (`sameSale`),
   * whatever its `commandId`. A primary-key read on the storage instance, past RxDB's query cache. False before the
   * store is ready; a content mismatch is false and logged at error.
   */
  isStored(order: PosOrder): Promise<boolean>;
  /** Sends pending orders; does nothing before the current store is ready. */
  flush(): Promise<void>;
  /** Moves rejected orders back to pending (see `OrderOutbox.requeue`); resolves to 0 before the current store is ready. */
  requeue(orderIds?: string[]): Promise<number>;
  /**
   * The count of `record()` calls not yet settled (resolved or rejected). An app holds sign-out
   * (closing the store) while this is above 0, because a close that lands under a write stuck in
   * storage can wait forever, and TallyUI deliberately doesn't bound that close (#155).
   */
  savesInFlight: number;
  /** The command ids in `state.stuck`: pending orders the store keeps failing. Pass them to `needsAttention` and
   * `OrdersList`. Empty when none, and before the current store is ready. */
  stuckCommandIds: readonly string[];
}

/** Opens the order store for `storeKey`, runs its outbox and watches the recent orders (lifted from medusapos/app, ADR-052). */
export function useOrderOutbox(options: UseOrderOutboxOptions): UseOrderOutboxResult {
  const { storeKey, deviceId } = options;
  const latest = useRef(options);
  latest.current = options;
  const current = useRef<{
    storeKey: string; orders: RxCollection<PosOrder>; outbox: ReturnType<typeof createOrderOutbox>;
  } | null>(null);
  const openingError = useRef<unknown>(null);
  // Order ids already logged for a content mismatch (see `isStored`), for the hook's lifetime: a hung
  // save's poll re-asks isStored every few seconds, and a mismatch shouldn't get a fresh error each time.
  const loggedMismatches = useRef(new Set<string>());
  const [orders, setOrders] = useState<RxCollection<PosOrder> | null>(null);
  const [state, setState] = useState<OutboxState>(idle);
  const [recent, setRecent] = useState<PosOrder[]>([]);
  const savesInFlight = useRef(0);
  const [savesInFlightCount, setSavesInFlightCount] = useState(0);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    openingError.current = null;
    setOrders(null); setState(idle); setRecent([]);
    if (!storeKey) return;
    void latest.current.open(storeKey).then(async (store) => {
      if (!active) { await store.close(); return; }
      const outbox = createOrderOutbox({ collection: store.orders, deviceId, transport: latest.current.transport(storeKey),
        getMaxOrderCreateVersion: latest.current.getMaxOrderCreateVersion ? () => latest.current.getMaxOrderCreateVersion?.() : undefined,
        refreshCapabilities: latest.current.refreshCapabilities ? async () => { await latest.current.refreshCapabilities?.(); } : undefined });
      current.current = { storeKey, orders: store.orders, outbox };
      const status = outbox.state$.subscribe(setState);
      // watchFresh: find().$ can leave this stale forever, hiding a new order (RxDB 16.21.1 bug 4).
      const history = watchFresh(store.orders, { sort: [{ createdAt: 'desc' }], limit: 50 }).subscribe(setRecent);
      dispose = () => {
        outbox.stop(); status.unsubscribe(); history.unsubscribe();
        void store.close();
      };
      setOrders(store.orders);
      outbox.start();
    }).catch((error: unknown) => {
      if (active) openingError.current = error;
      latest.current.onOpenError?.(error);
    });
    return () => { active = false; current.current = null; dispose?.(); };
  }, [storeKey, deviceId]);

  useEffect(() => {
    latest.current.onBusy?.(state.sending);
    return () => latest.current.onBusy?.(false);
  }, [state.sending]);

  const ready = current.current?.storeKey === storeKey && !!storeKey;
  return { orders: ready ? orders : null, state: ready ? state : idle, recent: ready ? recent : [],
    async flush() {
      const opened = current.current;
      if (opened && opened.storeKey === storeKey) await opened.outbox.flush();
    },
    async requeue(orderIds) {
      const opened = current.current;
      return opened && opened.storeKey === storeKey ? opened.outbox.requeue(orderIds) : 0;
    },
    savesInFlight: savesInFlightCount,
    stuckCommandIds: (ready && state.stuck?.commandIds) || noneStuck,
    async record(posOrder) {
      savesInFlight.current++;
      setSavesInFlightCount(savesInFlight.current);
      try {
        const opened = current.current;
        if (!opened || opened.storeKey !== storeKey) throw openingError.current ?? new Error('Orders are not ready.');
        try {
          await opened.orders.insert(posOrder);
        } catch (error) {
          // useSale's retry hands over the order a failed save already stored (complete() is idempotent,
          // ADR-052). RxDB 16's insert throws RxError code 'CONFLICT' for an existing primary key, with the
          // stored document in `parameters.writeError.documentInDb`. The same id and content means it is stored, even
          // under another commandId: a requeue mints one, and requiring it stuck the tender on Retry (medusapos #79).
          const stored = (error as RxError)?.code === 'CONFLICT' ? (error as RxError).parameters.writeError : undefined;
          const inDb = stored?.status === 409 ? stored.documentInDb : undefined;
          if (!inDb || inDb._deleted) throw error;
          if (!sameSale(inDb, posOrder)) throw new OrderContentMismatchError(posOrder.id);
          if (inDb.commandId !== posOrder.commandId) {
            outboxLogger.warn('Recorded an order stored under another commandId', { orderId: posOrder.id,
              storedCommandId: inDb.commandId, recordedCommandId: posOrder.commandId });
          }
        }
        if (current.current === opened) void opened.outbox.flush();
      } finally {
        savesInFlight.current--;
        setSavesInFlightCount(savesInFlight.current);
      }
    },
    async isStored(order) {
      const opened = current.current;
      if (!opened || opened.storeKey !== storeKey) return false;
      const [stored] = await opened.orders.storageInstance.findDocumentsById([order.id], false);
      if (!stored || stored._deleted) return false;
      if (sameSale(stored, order)) return true;
      if (!loggedMismatches.current.has(order.id)) {
        loggedMismatches.current.add(order.id);
        outboxLogger.error('A stored order has this id with different content', { orderId: order.id });
      }
      return false;
    },
  };
}
