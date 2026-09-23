import { COMMANDS_PATH, PROTOCOL_HEADER, PROTOCOL_VERSION, isCommandBatchResponse } from '@tallyui/core';
import type { CommandTransport } from './types';

export interface HttpTransportOptions {
  baseUrl: string;
  getHeaders: () => Record<string, string> | Promise<Record<string, string>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createHttpCommandTransport(options: HttpTransportOptions): CommandTransport {
  const fetch = options.fetch ?? globalThis.fetch;
  return {
    async send(batch) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
      try {
        const response = await fetch(`${options.baseUrl}${COMMANDS_PATH}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
            ...await options.getHeaders(),
          },
          body: JSON.stringify({ commands: batch }),
          signal: controller.signal,
        });
        const retryAfter = response.headers.get('Retry-After');
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const retry = (reason: string) => ({ kind: 'retry' as const, reason,
          ...(Number.isFinite(seconds) ? { retryAfterMs: seconds * 1000 } : {}),
        });
        if (response.status !== 200) return retry(`status_${response.status}`);
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return retry(controller.signal.aborted ? 'network' : 'bad_body');
        }
        return isCommandBatchResponse(body) ? { kind: 'results', results: body.results } : retry('bad_body');
      } catch {
        return { kind: 'retry', reason: 'network' };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
