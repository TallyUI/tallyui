import { COMMANDS_PATH, PROTOCOL_HEADER, PROTOCOL_VERSION, NEEDS_ADMIN_MESSAGE_MAX, isCommandBatchResponse, type AnyCommandEnvelope } from '@tallyui/core';
import type { CommandTransport } from './types';
import { NEEDS_ADMIN_REASON, NEEDS_ADMIN_RETRY_PREFIX } from './needs-admin-reason';

// These HTTP statuses permanently refuse the entire command batch.
const PERMANENT_STATUSES = new Set([400, 403, 413, 415, 422]);

export interface HttpTransportOptions {
  baseUrl: string;
  getHeaders: () => Record<string, string> | Promise<Record<string, string>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createHttpCommandTransport(options: HttpTransportOptions): CommandTransport<AnyCommandEnvelope> {
  const fetch = options.fetch ?? globalThis.fetch;
  let end = options.baseUrl.length;
  while (end > 0 && options.baseUrl[end - 1] === '/') {
    end--;
  }
  const baseUrl = options.baseUrl.slice(0, end);
  return {
    async send(batch) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
      try {
        const response = await fetch(`${baseUrl}${COMMANDS_PATH}`, {
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
          ...(Number.isFinite(seconds) && seconds >= 0 ? { retryAfterMs: seconds * 1000 } : {}),
        });
        if (response.status === 401) return { kind: 'unauthorized' };
        if (PERMANENT_STATUSES.has(response.status)) {
          let reason = `status_${response.status}`;
          try {
            const body = await response.json();
            if (typeof body?.message === 'string') reason = body.message;
            else if (typeof body?.code === 'string') reason = body.code;
          } catch {}
          return { kind: 'refused', status: response.status, reason };
        }
        if (response.status === 409) {
          try {
            const body = await response.json();
            if (typeof body === 'object' && body !== null && body.code === 'needs_admin'
              && typeof body.id === 'string' && batch.some((command) => command.id === body.id)
              && typeof body.reason === 'string' && NEEDS_ADMIN_REASON.test(body.reason)
              && typeof body.message === 'string') {
              return { ...retry(`${NEEDS_ADMIN_RETRY_PREFIX}${body.reason}`), needsAdmin: {
                id: body.id, reason: body.reason, message: body.message.slice(0, NEEDS_ADMIN_MESSAGE_MAX),
              } };
            }
          } catch { /* An unreadable body is a plain 409: retried as before. */ }
          return retry('status_409');
        }
        if (response.status !== 200) return retry(`status_${response.status}`);
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return retry(controller.signal.aborted ? 'timeout' : 'bad_body');
        }
        return isCommandBatchResponse(body) ? { kind: 'results', results: body.results } : retry('bad_body');
      } catch {
        // `timeout`: sent, but no answer within the deadline. `network`: the store could not be reached.
        return { kind: 'retry', reason: controller.signal.aborted ? 'timeout' : 'network' };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
