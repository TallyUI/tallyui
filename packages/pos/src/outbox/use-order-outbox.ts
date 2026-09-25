import { useEffect, useRef, useState } from 'react';
import type { RxCollection } from 'rxdb';
import type { PosOrder } from '../pos-order';
import { createOrderOutbox } from './order-outbox';
import type { CommandTransport, OutboxState } from './types';

const idle: OutboxState = { pending: 0, sending: false };

export interface UseOrderOutboxOptions {
  /** Which order store to use (medusapos: the backend's base URL); `null` means no store. A change reopens. */
  storeKey: string | null;
  /** Opens the order store for `storeKey`; `close()` is called when the key or device id changes, or on unmount. */
  open(storeKey: string): Promise<{ orders: RxCollection<PosOrder>; close(): Promise<void> }>;
  /** Builds the command transport for `storeKey` (the app's HTTP transport and auth headers). Read once per open. */
  transport(storeKey: string): CommandTransport;
  /** The device id sent on every command (see `getDeviceId`). A change reopens. */
  deviceId: string;
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
  /** Stores a finalized order, then flushes. Throws the opening error, or "Orders are not ready.", before the store is ready. */
  record(posOrder: PosOrder): Promise<void>;
  /** Sends pending orders; does nothing before the current store is ready. */
  flush(): Promise<void>;
  /** Moves rejected orders back to pending (see `OrderOutbox.requeue`); resolves to 0 before the current store is ready. */
  requeue(orderIds?: string[]): Promise<number>;
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
  const [orders, setOrders] = useState<RxCollection<PosOrder> | null>(null);
  const [state, setState] = useState<OutboxState>(idle);
  const [recent, setRecent] = useState<PosOrder[]>([]);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    openingError.current = null;
    setOrders(null); setState(idle); setRecent([]);
    if (!storeKey) return;
    void latest.current.open(storeKey).then(async (store) => {
      if (!active) { await store.close(); return; }
      const outbox = createOrderOutbox({ collection: store.orders, deviceId, transport: latest.current.transport(storeKey) });
      current.current = { storeKey, orders: store.orders, outbox };
      const status = outbox.state$.subscribe(setState);
      const history = store.orders.find({ sort: [{ createdAt: 'desc' }], limit: 50 }).$.subscribe((docs) => {
        setRecent(docs.map((doc) => doc.toMutableJSON()));
      });
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
    async record(posOrder) {
      const opened = current.current;
      if (!opened || opened.storeKey !== storeKey) throw openingError.current ?? new Error('Orders are not ready.');
      await opened.orders.insert(posOrder);
      if (current.current === opened) void opened.outbox.flush();
    },
  };
}
