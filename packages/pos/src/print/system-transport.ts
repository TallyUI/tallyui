/**
 * Prints rendered HTML through the platform print dialog. Ported from WCPOS v2 (monorepo main)
 * `packages/printer/src/transport/system-print-adapter.web.ts` (hidden iframe, `print()`, `afterprint`) and
 * `system-print-adapter.ts` (native, `expo-print`). On native the app injects `printHtml` (for example
 * `(html) => Print.printAsync({ html })`), so this package takes no native dependency.
 */
import { PrintError, type PrintJob, type PrintTransport } from './types';

/** v2's waits: let the frame render, give images 5 s, and settle after 60 s if `afterprint` never fires. */
export const SYSTEM_PRINT_TIMING = { renderDelayMs: 500, imageTimeoutMs: 5_000, afterPrintTimeoutMs: 60_000, removeDelayMs: 1_000 };
type SystemPrintTiming = typeof SYSTEM_PRINT_TIMING;

const FRAME_ID = 'tallyui-print-frame';

export interface SystemPrintTransportOptions {
  /** Native: prints HTML through the OS dialog. When given, the iframe path is not used. */
  printHtml?: (html: string) => Promise<void>;
  /** Web: the document to print from; defaults to `globalThis.document`. */
  document?: Document;
  timing?: Partial<SystemPrintTiming>;
}

function imagesSettled(doc: Document, timeoutMs: number): Promise<void> {
  const pending = Array.from(doc.images).filter((image) => !image.complete);
  if (pending.length === 0) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.all(pending.map((image) => new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    }))).then(() => undefined),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

function printInFrame(doc: Document, html: string, timing: SystemPrintTiming): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    doc.getElementById(FRAME_ID)?.remove();
    const iframe = doc.createElement('iframe');
    iframe.id = FRAME_ID;
    Object.assign(iframe.style, { position: 'absolute', top: '-10000px', left: '-10000px', width: '0', height: '0' });
    doc.body.appendChild(iframe);
    const frameDoc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!frameDoc || !win) {
      iframe.remove();
      reject(new PrintError('unavailable', 'The print frame has no document'));
      return;
    }
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      void imagesSettled(frameDoc, timing.imageTimeoutMs).then(() => {
        let settled = false;
        const settle = (error?: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(fallback);
          win.removeEventListener('afterprint', onAfterPrint);
          // Removed later so the browser can finish spooling; the captured ref never removes a newer job's frame.
          setTimeout(() => iframe.remove(), timing.removeDelayMs);
          if (error === undefined) resolve();
          else reject(new PrintError('failed', error instanceof Error ? error.message : String(error), { cause: error }));
        };
        const onAfterPrint = () => settle();
        const fallback = setTimeout(onAfterPrint, timing.afterPrintTimeoutMs);
        win.addEventListener('afterprint', onAfterPrint, { once: true });
        try {
          win.focus();
          win.print();
        } catch (error) {
          settle(error);
        }
      });
    }, timing.renderDelayMs);
  });
}

export function createSystemPrintTransport(options: SystemPrintTransportOptions = {}): PrintTransport {
  const timing = { ...SYSTEM_PRINT_TIMING, ...options.timing };
  const { printHtml } = options;
  return {
    name: printHtml ? 'system-print-native' : 'system-print-web',
    async print(job: PrintJob) {
      if (job.html === undefined) throw new PrintError('unsupported', `The system dialog prints HTML; job ${job.id} has none`);
      if (printHtml) {
        try {
          await printHtml(job.html);
        } catch (error) {
          throw new PrintError('failed', error instanceof Error ? error.message : String(error), { cause: error });
        }
        return;
      }
      const doc = options.document ?? globalThis.document;
      if (!doc?.body) throw new PrintError('unavailable', 'No document to print from');
      await printInFrame(doc, job.html, timing);
    },
  };
}
