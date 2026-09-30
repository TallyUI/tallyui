// The upgraded till (#242): this tree's main thread on RxDB 17.5.0. The worker comes from the page's
// `tally-worker` meta: /v17/ uses this tree's worker, and /mixed/ the 2.0.0 worker, as a browser
// that still has the old worker cached. It opens the database the 2.0.0 page wrote through
// `addPosOrderCollection` (the one sanctioned opener, which runs `openPosOrders`), reads every
// document back, and sends the pending orders through the order outbox with a fake transport.
import { createRxDatabase, RXDB_VERSION, type RxCollection, type RxDatabase } from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope } from '@tallyui/core';
import { readFresh } from '../../../packages/core/src/rxdb/read-fresh';
import { getRxStorageSQLiteWasm, isStorageWorkerStartError } from '../../../packages/storage-sqlite/src/web/index';
import { addPosOrderCollection } from '../../../packages/pos/src/pos-order/open';
import type { PosOrder } from '../../../packages/pos/src/pos-order/types';
import { createOrderOutbox } from '../../../packages/pos/src/outbox/order-outbox';
import { cashMovementSchema, closureSchema, registerSessionCollection } from '../../../packages/pos/src/register/schemas';
import { readRegister } from '../../../packages/pos/src/register/register-document';

const WORKER = document.querySelector<HTMLMetaElement>('meta[name="tally-worker"]')!.content;
// A start that neither resolves nor rejects in this long is a quiet failure, and is reported as one.
const OPEN_DEADLINE_MS = 20_000;
const byId = { sort: [{ id: 'asc' as const }] };

let db: RxDatabase | undefined;
let orders: RxCollection<PosOrder> | undefined;

type OpenResult =
  | { ok: true; rxdbVersion: string; worker: string; ordersSchemaVersion: number }
  | { ok: false; worker: string; hung: boolean; name?: string; message: string; code?: string; isStorageWorkerStartError: boolean; stack?: string };

async function openAll(name: string) {
  // Validated, as the node:sqlite carry-over test opens it.
  const storage = wrappedValidateAjvStorage({ storage: getRxStorageSQLiteWasm({ workerInput: WORKER }) });
  const opened = await createRxDatabase({ name, storage, multiInstance: false });
  db = opened;
  orders = await addPosOrderCollection(opened);
  await opened.addCollections({
    register_sessions: registerSessionCollection(),
    cash_movements: { schema: cashMovementSchema },
    closures: { schema: closureSchema },
  });
}

/** Opens database `name` and every collection; a start failure or a hang comes back as data, never as a throw. */
async function open(name: string): Promise<OpenResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<'hung'>((resolve) => { timer = setTimeout(() => resolve('hung'), OPEN_DEADLINE_MS); });
  try {
    const outcome = await Promise.race([openAll(name).then(() => 'opened' as const), hung]);
    if (outcome === 'hung') {
      return { ok: false, worker: WORKER, hung: true, message: `no answer in ${OPEN_DEADLINE_MS}ms`, isStorageWorkerStartError: false };
    }
    return { ok: true, rxdbVersion: RXDB_VERSION, worker: WORKER, ordersSchemaVersion: need().orders.schema.version };
  } catch (error) {
    const { name: errorName, message, code, stack } = error as { name?: string; message?: string; code?: string; stack?: string };
    return {
      ok: false, worker: WORKER, hung: false, name: errorName, message: message ?? String(error), code,
      isStorageWorkerStartError: isStorageWorkerStartError(error), stack,
    };
  } finally {
    clearTimeout(timer);
  }
}

function need() {
  if (!db || !orders) throw new Error('not open');
  return { db, orders };
}

/** Every document, as plain data without RxDB's metadata. */
async function readAll() {
  const { db: open, orders: collection } = need();
  return {
    orders: await readFresh(collection, { selector: {}, ...byId }),
    register: await readRegister(open.register_sessions),
    sessions: await readFresh(open.register_sessions, { selector: {}, ...byId }),
    movements: await readFresh(open.cash_movements, { selector: {}, ...byId }),
    closures: await readFresh(open.closures, { selector: {}, ...byId }),
  };
}

/**
 * One outbox flush with a fake transport that records every command it is sent and answers each
 * `applied`, as the carry-over test's online case does. Returns every attempt's commands.
 */
async function flush() {
  const { orders: collection } = need();
  const attempts: { id: string; version: number; firstTitle?: string }[][] = [];
  const outbox = createOrderOutbox({
    collection, deviceId: 'upgrade-proof-device', random: () => 0.5,
    transport: {
      send: async (batch: OrderCreateEnvelope[]) => {
        attempts.push(batch.map((command) => ({ id: command.id, version: command.version, firstTitle: command.payload.lines[0]?.title })));
        const results: CommandResult[] = batch.map((command) => ({
          id: command.id, status: 'applied', serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor },
        }));
        return { kind: 'results', results };
      },
    },
  });
  try {
    await outbox.flush();
  } finally {
    outbox.stop();
  }
  return attempts;
}

/** The names at the origin's OPFS root, read-only: where the SAH pool keeps its files. */
async function opfsRoot() {
  const names: string[] = [];
  for await (const name of (await navigator.storage.getDirectory() as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
  return names.sort();
}

async function close() {
  await db?.close();
  db = undefined;
  orders = undefined;
}

declare global {
  interface Window {
    tally: { open: typeof open; readAll: typeof readAll; flush: typeof flush; close: typeof close; opfsRoot: typeof opfsRoot };
  }
}

window.tally = { open, readAll, flush, close, opfsRoot };
