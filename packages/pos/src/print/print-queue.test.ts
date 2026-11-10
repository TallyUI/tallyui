// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPrintQueue, PrintError, type PrintJob, type PrintQueueState, type PrintTransport } from '../index';

const job = (id: string): PrintJob => ({ id, kind: 'receipt', html: `<p>${id}</p>` });

/** A transport whose jobs finish only when the test says so. */
function heldTransport(log: string[]) {
  const release = new Map<string, (error?: Error) => void>();
  const transport: PrintTransport = {
    name: 'held',
    print: (printed) => new Promise<void>((resolve, reject) => {
      log.push(`start ${printed.id}`);
      release.set(printed.id, (error) => { log.push(`end ${printed.id}`); if (error) reject(error); else resolve(); });
    }),
  };
  const finish = async (id: string, error?: Error) => {
    await waitFor(() => release.has(id));
    release.get(id)!(error);
  };
  return { transport, finish };
}

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(check()).toBe(true);
}

describe('createPrintQueue', () => {
  it('prints one job at a time, in order, per printer', async () => {
    const log: string[] = [];
    const { transport, finish } = heldTransport(log);
    const queue = createPrintQueue({ transportFor: () => transport });
    const done = ['a', 'b', 'c'].map((id) => queue.print('p1', job(id)));
    expect(queue.state('p1')).toEqual({ printerId: 'p1', running: null, queued: ['a', 'b', 'c'] });
    await waitFor(() => queue.state('p1').running === 'a');
    expect(queue.state('p1').queued).toEqual(['b', 'c']);
    await finish('a');
    await finish('b');
    await finish('c');
    await Promise.all(done);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    expect(queue.state('p1')).toEqual({ printerId: 'p1', running: null, queued: [] });
  });

  it('rejects a failed job with a PrintError and still prints the next one', async () => {
    const log: string[] = [];
    const { transport, finish } = heldTransport(log);
    const queue = createPrintQueue({ transportFor: () => transport });
    const first = queue.print('p1', job('a'));
    const second = queue.print('p1', job('b'));
    await finish('a', new Error('paper out'));
    await expect(first).rejects.toMatchObject({ name: 'PrintError', code: 'failed', message: 'paper out' });
    await expect(first).rejects.toBeInstanceOf(PrintError);
    await finish('b');
    await expect(second).resolves.toBeUndefined();
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('keeps a PrintError code from the transport and survives a throwing transportFor', async () => {
    let calls = 0;
    const queue = createPrintQueue({
      transportFor: () => {
        calls += 1;
        if (calls === 1) throw new Error('no such printer');
        return { name: 'x', print: () => Promise.reject(new PrintError('unsupported', 'no html')) };
      },
    });
    await expect(queue.print('p1', job('a'))).rejects.toMatchObject({ code: 'failed', message: 'no such printer' });
    await expect(queue.print('p1', job('b'))).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('keeps printers apart: a stalled printer does not delay another', async () => {
    const log: string[] = [];
    const stalled = heldTransport(log);
    const quick: PrintTransport = { name: 'quick', print: async (printed) => { log.push(`quick ${printed.id}`); } };
    const queue = createPrintQueue({ transportFor: (id) => (id === 'stalled' ? stalled.transport : quick) });
    const seen: PrintQueueState[] = [];
    const unsubscribe = queue.subscribe((state) => seen.push(state));
    const held = queue.print('stalled', job('a'));
    await queue.print('quick', job('b'));
    await queue.print('quick', job('c'));
    expect(log).toEqual(['start a', 'quick b', 'quick c']);
    expect(queue.state('stalled').running).toBe('a');
    expect(queue.state('quick')).toEqual({ printerId: 'quick', running: null, queued: [] });
    expect(seen.some((state) => state.printerId === 'quick' && state.running === 'c')).toBe(true);
    unsubscribe();
    await stalled.finish('a');
    await held;
    expect(seen.at(-1)).toEqual({ printerId: 'quick', running: null, queued: [] });
  });
});
