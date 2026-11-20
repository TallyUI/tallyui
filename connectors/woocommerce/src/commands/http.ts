import type { WooTransportOutcome } from './transport';

export type Answer = { status: number; body?: Awaited<ReturnType<Response['json']>>; retryAfter?: string | null; aborted: boolean };

/** One JSON request to the store, and the retry outcome for an answer: shared by the order and register transports. */
export function createWooCall(options: {
  baseUrl: string;
  getHeaders: () => Record<string, string> | Promise<Record<string, string>>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): { call(path: string, init: { method: string; body?: unknown }): Promise<Answer>; retry(answer: Answer, reason: string): WooTransportOutcome } {
  const fetch = options.fetch ?? globalThis.fetch;
  let baseUrl = options.baseUrl;
  while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  const call = async (path: string, init: { method: string; body?: unknown }): Promise<Answer> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
    try {
      const response = await fetch(`${baseUrl}/${path}`, { method: init.method,
        headers: { ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...await options.getHeaders() },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }), signal: controller.signal });
      let body;
      try { body = await response.json(); } catch { /* not JSON: body stays undefined */ }
      return { status: response.status, body, retryAfter: response.headers.get('Retry-After'), aborted: controller.signal.aborted };
    } catch {
      return { status: 0, aborted: controller.signal.aborted };
    } finally {
      clearTimeout(timeout);
    }
  };
  const retry = (answer: Answer, reason: string): WooTransportOutcome => {
    if (answer.status === 0) return { kind: 'retry', reason: answer.aborted ? 'timeout' : 'network' };
    const seconds = answer.retryAfter == null ? NaN : Number(answer.retryAfter);
    return { kind: 'retry', reason, ...(Number.isFinite(seconds) && seconds >= 0 ? { retryAfterMs: seconds * 1000 } : {}) };
  };
  return { call, retry };
}
