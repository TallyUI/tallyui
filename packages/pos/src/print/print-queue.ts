/**
 * One serial queue per printer id. Ported from WCPOS v2 `packages/printer/src/printer-service.ts` (monorepo
 * main), which keeps a `PQueue({ concurrency: 1 })` per profile because one shared queue let a stalled printer
 * stall the till (its gotcha N44). Here a promise chain per printer id does the same without p-queue.
 */
import { toPrintError, type PrintJob, type PrintTransport } from './types';

/** v2's queue id for the OS print dialog, which is one shared resource on the device. */
export const SYSTEM_PRINTER_ID = 'system';

export interface PrintQueueState {
  printerId: string;
  /** The id of the job printing now, or null. */
  running: string | null;
  /** Ids of the jobs waiting, in the order they will print. */
  queued: string[];
}

export interface PrintQueueOptions {
  transportFor: (printerId: string) => PrintTransport | Promise<PrintTransport>;
}

export interface PrintQueue {
  /** Resolves when this job has printed; rejects with a `PrintError`. A failure never holds up the next job. */
  print(printerId: string, job: PrintJob): Promise<void>;
  state(printerId: string): PrintQueueState;
  subscribe(listener: (state: PrintQueueState) => void): () => void;
}

export function createPrintQueue({ transportFor }: PrintQueueOptions): PrintQueue {
  const tails = new Map<string, Promise<void>>();
  const states = new Map<string, PrintQueueState>();
  const listeners = new Set<(state: PrintQueueState) => void>();

  const state = (printerId: string): PrintQueueState => states.get(printerId) ?? { printerId, running: null, queued: [] };
  const update = (printerId: string, change: (current: PrintQueueState) => PrintQueueState) => {
    const next = change(state(printerId));
    states.set(printerId, next);
    for (const listener of listeners) listener(next);
  };

  const run = async (printerId: string, job: PrintJob) => {
    // Jobs start in enqueue order, so the starting job is the head of `queued`.
    update(printerId, ({ queued }) => ({ printerId, running: job.id, queued: queued.slice(1) }));
    try {
      await (await transportFor(printerId)).print(job);
    } catch (error) {
      throw toPrintError(error);
    } finally {
      update(printerId, (current) => ({ ...current, running: null }));
    }
  };

  return {
    print(printerId, job) {
      update(printerId, (current) => ({ ...current, queued: [...current.queued, job.id] }));
      const result = (tails.get(printerId) ?? Promise.resolve()).then(() => run(printerId, job));
      tails.set(printerId, result.catch(() => undefined));
      return result;
    },
    state: (printerId) => ({ ...state(printerId) }),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
