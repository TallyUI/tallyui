// @vitest-environment jsdom
// What jsdom cannot prove: that a real browser opens its print dialog from the hidden frame, fires `afterprint`
// when it closes, lays the receipt out on the roll, or waits for real images. Those need a browser run.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSystemPrintTransport, type PrintJob } from '../index';

const receipt: PrintJob = { id: 'r1', kind: 'receipt', html: '<!doctype html><html><body><p>Total 9.50</p></body></html>' };
const fast = { renderDelayMs: 0, imageTimeoutMs: 0, afterPrintTimeoutMs: 1_000, removeDelayMs: 0 };

/** Stubs `print()` on each print frame as it is appended; `onPrint` runs with the frame's window. */
function stubFramePrint(onPrint: (win: Window) => void) {
  const append = document.body.appendChild.bind(document.body);
  return vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    const appended = append(node);
    if (node instanceof HTMLIFrameElement) {
      const win = node.contentWindow!;
      win.focus = vi.fn();
      win.print = vi.fn(() => onPrint(win));
    }
    return appended;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('createSystemPrintTransport', () => {
  it('on native, hands the HTML to the injected printHtml', async () => {
    const printHtml = vi.fn(async () => {});
    const transport = createSystemPrintTransport({ printHtml });
    expect(transport.name).toBe('system-print-native');
    await transport.print(receipt);
    expect(printHtml).toHaveBeenCalledWith(receipt.html);
    expect(document.getElementById('tallyui-print-frame')).toBeNull();
  });

  it('rejects a native failure as a failed PrintError', async () => {
    const transport = createSystemPrintTransport({ printHtml: () => Promise.reject(new Error('cancelled by OS')) });
    await expect(transport.print(receipt)).rejects.toMatchObject({ name: 'PrintError', code: 'failed', message: 'cancelled by OS' });
  });

  it('rejects a job with no HTML as unsupported', async () => {
    const printHtml = vi.fn(async () => {});
    await expect(createSystemPrintTransport({ printHtml }).print({ id: 'raw', kind: 'test', bytes: new Uint8Array([0x1b]) }))
      .rejects.toMatchObject({ code: 'unsupported' });
    expect(printHtml).not.toHaveBeenCalled();
  });

  it('on web, writes the HTML into a hidden frame, prints it and resolves on afterprint', async () => {
    let printedText: string | undefined;
    const append = stubFramePrint((win) => {
      printedText = win.document.body.textContent ?? undefined;
      win.dispatchEvent(new Event('afterprint'));
    });
    const transport = createSystemPrintTransport({ timing: fast });
    expect(transport.name).toBe('system-print-web');
    await transport.print(receipt);
    expect(append).toHaveBeenCalledTimes(1);
    expect(printedText).toBe('Total 9.50');
    const frame = append.mock.calls[0][0] as HTMLIFrameElement;
    expect(frame.id).toBe('tallyui-print-frame');
    expect(frame.style.width).toBe('0px');
    await vi.waitFor(() => expect(frame.isConnected).toBe(false));
  });

  it('settles after the fallback timeout when afterprint never fires', async () => {
    vi.useFakeTimers();
    stubFramePrint(() => {});
    const printing = createSystemPrintTransport({ timing: { ...fast, afterPrintTimeoutMs: 60_000 } }).print(receipt);
    let done = false;
    void printing.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(done).toBe(true);
  });

  it('rejects as failed when print() throws', async () => {
    stubFramePrint(() => { throw new Error('blocked'); });
    await expect(createSystemPrintTransport({ timing: fast }).print(receipt))
      .rejects.toMatchObject({ code: 'failed', message: 'blocked' });
  });
});
