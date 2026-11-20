// Woo 23: register commands against WCPOS 2.0.4's routes (API/V2/Sessions_Controller.php:38-56, Closures_Controller.php:215-241).
import { minorUnitDigits, type CommandResult, type RegisterClosureSubmitPayload, type RegisterCommandEnvelope, type RegisterCommandResult,
  type RegisterMovementRecordPayload, type RegisterMovementVoidPayload, type RegisterSessionOpenPayload,
  type RegisterSessionTransitionPayload, type SyncContext } from '@tallyui/core';
import { wooThresholdMinor } from '../store-settings';
import { throwIfUnauthorized } from '../unauthorized';
import { createWooCall, type Answer } from './http';
import { wooMinorFromDecimal, type WooCommandTransportOptions, type WooTransportOutcome } from './transport';

export interface WooRegisterTransportOptions extends Pick<WooCommandTransportOptions, 'baseUrl' | 'getHeaders' | 'fetch' | 'timeoutMs'> {
  /** The store currency, read once per `send`. */
  currency: string | (() => string | Promise<string>);
}

/** A manager's WordPress sign-in for one approval; never logged or stored. */
export interface ApproverCredentials { username: string; password: string }

// Closure_Store::tenders (v2.0.4 Services/Closure_Store.php:537-551).
const TENDER_KEY = /^[a-zA-Z0-9_-]{1,191}$/;

/** A whole minor amount as a decimal string at `digits`, by string slicing (no float maths). */
function wooDecimal(minor: number, digits: number): string {
  const text = String(Math.abs(minor)).padStart(digits + 1, '0');
  return `${minor < 0 ? '-' : ''}${digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text}`;
}

/** A store decimal, with an optional leading `-`, as minor. */
function wooSignedMinor(value: unknown, currency: string): number | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text.startsWith('-')) return wooMinorFromDecimal(text, currency);
  const minor = wooMinorFromDecimal(text.slice(1), currency);
  return minor === undefined ? undefined : 0 - minor;
}

/** A tender map as decimals; the store needs `cash`, so a map without it gets cash at zero. */
function wooTenders(map: Record<string, number>, digits: number): Record<string, string> {
  return Object.fromEntries(Object.entries({ cash: 0, ...map }).map(([key, minor]) => [key, wooDecimal(minor, digits)]));
}

function rejected(id: string, code: string, message: unknown, data?: Record<string, unknown>): CommandResult {
  return { id, status: 'rejected', error: { code, message: typeof message === 'string' && message ? message : code, ...(data ? { data } : {}) } };
}

function storeCode(answer: Answer): Record<string, unknown> | undefined {
  return typeof answer.body?.code === 'string' ? { storeCode: answer.body.code } : undefined;
}

function sessionResult(id: unknown, status: unknown): RegisterCommandResult {
  const known = status === 'open' || status === 'counting' || status === 'closed';
  return { session: { id: String(id), ...(known ? { status } : {}) } as NonNullable<RegisterCommandResult['session']> };
}

export function createWooRegisterTransport(options: WooRegisterTransportOptions): {
  send(batch: RegisterCommandEnvelope[]): Promise<WooTransportOutcome>;
} {
  const { call, retry } = createWooCall(options);
  const post = (path: string, body: Record<string, unknown>) => call(path, { method: 'POST', body });

  // The answers every request shares; undefined leaves the status to its command.
  const shared = (answer: Answer, id: string): CommandResult | WooTransportOutcome | undefined => {
    const { status, body } = answer;
    if (status === 0) return retry(answer, 'network');
    if (status === 401 || (status === 403 && body?.code === 'rest_forbidden')) return { kind: 'unauthorized' };
    if (status === 426) return { kind: 'refused', status, reason: typeof body?.code === 'string' ? body.code : 'update_required' };
    if (status === 400) return rejected(id, 'invalid_payload', body?.message, storeCode(answer));
    return undefined;
  };

  const sendOne = async (envelope: RegisterCommandEnvelope, currency: string): Promise<CommandResult | WooTransportOutcome> => {
    const id = envelope.id, digits = minorUnitDigits(currency);
    const decimal = (minor: number) => wooDecimal(minor, digits);
    const answered = (answer: Answer, own: (answer: Answer) => CommandResult | undefined) =>
      shared(answer, id) ?? own(answer) ?? retry(answer, `status_${answer.status}`);

    switch (envelope.type) {
      case 'register.session.open': {
        const p = envelope.payload as unknown as RegisterSessionOpenPayload;
        return answered(await post('sessions', {
          id: p.sessionId, register_id: p.registerId, opened_at: p.openedAt, counted_float: decimal(p.countedFloatMinor),
          ...(typeof p.expectedFloatMinor === 'number' ? { expected_float: decimal(p.expectedFloatMinor) } : {}),
          ...(typeof p.businessDay === 'string' && p.businessDay ? { business_day: p.businessDay } : {}),
        }), (answer) => {
          const { status, body } = answer;
          if (status === 201 || status === 200) return { id, status: 'applied', register: sessionResult(body?.id, body?.status) };
          if (status === 409 && body?.code === 'wcpos_session_already_open') {
            return rejected(id, 'register_session_already_open', body?.message,
              { sessionId: typeof body?.data?.session_id === 'string' ? body.data.session_id : p.sessionId });
          }
          if (status === 409) return rejected(id, 'register_session_open_refused', body?.message, storeCode(answer));
          return undefined;
        });
      }
      case 'register.session.transition': {
        const p = envelope.payload as unknown as RegisterSessionTransitionPayload;
        // The store closes a session only through its closure (`register.closure.submit`).
        if (p.status === 'closed') return { id, status: 'applied' };
        return answered(await post(`sessions/${p.sessionId}/status`, { status: p.status, at: p.at }), (answer) => {
          if (answer.status === 200) return { id, status: 'applied', register: sessionResult(answer.body?.id, answer.body?.status) };
          if (answer.status === 409) return rejected(id, 'register_session_transition_refused', answer.body?.message, storeCode(answer));
          if (answer.status === 404) return rejected(id, 'register_session_unknown', answer.body?.message);
          return undefined;
        });
      }
      case 'register.movement.record':
      case 'register.movement.void': {
        let body: Record<string, unknown>;
        if (envelope.type === 'register.movement.record') {
          const p = envelope.payload as unknown as RegisterMovementRecordPayload;
          if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor < 0) {
            return rejected(id, 'invalid_payload', 'A cash movement amount must be a whole number of minor units, 0 or more.');
          }
          body = { id: p.movementId, session_id: p.sessionId, type: p.type, amount: decimal(p.amountMinor), reason: p.reason, created_at: p.createdAt };
        } else {
          const p = envelope.payload as unknown as RegisterMovementVoidPayload;
          body = { id: p.movementId, session_id: p.sessionId, type: 'void', amount: '0', reason: '', voids: p.voids, created_at: p.createdAt };
        }
        return answered(await post('movements', body), (answer) => {
          if (answer.status === 201 || answer.status === 200) return { id, status: 'applied' };
          if (answer.status === 409) return rejected(id, 'register_movement_refused', answer.body?.message, storeCode(answer));
          return undefined;
        });
      }
      case 'register.closure.submit': {
        const p = envelope.payload as unknown as RegisterClosureSubmitPayload;
        const keys = [...Object.keys(p.tillExpected), ...Object.keys(p.counted)];
        if (keys.some((key) => !TENDER_KEY.test(key)) || Object.values(p.counted).some((minor) => minor < 0)) {
          return rejected(id, 'invalid_payload', 'A closure tender must be named with letters, digits, _ or -, and counted at 0 or more.');
        }
        const counting = await post(`sessions/${p.sessionId}/status`, { status: 'counting', at: p.closedAt });
        if (counting.status !== 200 && counting.status !== 409) {
          return answered(counting, (answer) => answer.status === 404 ? rejected(id, 'register_session_unknown', answer.body?.message) : undefined);
        }
        return answered(await post('closures', {
          id: p.closureId, session_id: p.sessionId, number: p.number, opened_at: p.openedAt, closed_at: p.closedAt,
          ...(typeof p.businessDay === 'string' && p.businessDay ? { business_day: p.businessDay } : {}),
          software_version: p.softwareVersion, breakdowns: {},
          till_expected: wooTenders(p.tillExpected, digits), counted: wooTenders(p.counted, digits),
          period_sales_total: decimal(p.periodSalesTotalMinor), period_refunds_total: decimal(p.periodRefundsTotalMinor),
          perpetual_sales_total: decimal(p.perpetualSalesTotalMinor), perpetual_refunds_total: decimal(p.perpetualRefundsTotalMinor),
          unsynced_total: decimal(p.unsyncedTotalMinor), unsynced_count: p.unsyncedCount,
        }), (answer) => {
          const { status, body } = answer;
          // The store may renumber the closure (Closure_Store.php:724-760), so its number is the one carried.
          if (status === 201 || status === 200) {
            return { id, status: 'applied', register: { session: { id: p.sessionId, status: 'closed' },
              closure: { serverClosureId: String(body?.id), number: body?.number } } };
          }
          if (status === 404) return rejected(id, 'register_session_unknown', body?.message, storeCode(answer));
          if (status === 403 && body?.code === 'wcpos_override_refused') {
            const variance = wooSignedMinor(body?.data?.variance, currency);
            const thresholdMinor = wooThresholdMinor(body?.data?.threshold, currency);
            return variance === undefined || typeof body?.data?.variance !== 'string'
              ? rejected(id, 'register_approval_invalid', body?.message, { reason: 'unknown' })
              : rejected(id, 'register_approval_required', body?.message, { sessionId: p.sessionId, thresholdMinor, variance: { cash: variance } });
          }
          if (status === 409 && body?.code === 'wcpos_closure_exists') return rejected(id, 'register_closure_exists', body?.message);
          if (status === 409 && body?.code === 'wcpos_closure_number_invalid') return rejected(id, 'register_closure_number_invalid', body?.message);
          if (status === 409) return rejected(id, 'register_closure_refused', body?.message, storeCode(answer));
          return undefined;
        });
      }
      default:
        return rejected(id, 'invalid_payload', `unsupported register command ${String(envelope.type)}`);
    }
  };

  return {
    async send(batch) {
      if (batch.length === 0) return { kind: 'results', results: [] };
      const currency = typeof options.currency === 'function' ? await options.currency() : options.currency;
      const results: CommandResult[] = [];
      for (const envelope of batch) {
        const outcome = await sendOne(envelope, currency);
        if ('kind' in outcome) return results.length ? { kind: 'results', results } : outcome;
        results.push(outcome);
      }
      return { kind: 'results', results };
    },
  };
}

/** Asks WCPOS 2.0.4 to approve a counted session (Sessions_Controller.php:309-325): the session is moved to counting first. */
export async function wooApproveSession(context: SyncContext, input: {
  sessionId: string; credentials: ApproverCredentials; counted: Record<string, number>; currency: string;
}): Promise<{ approval: string; approvedBy: string } | { refused: 'override_refused' | 'not_counting' }> {
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...context.headers }, body: JSON.stringify(body), signal: context.signal,
    });
    let json;
    try { json = await response.json(); } catch { /* not JSON: body stays undefined */ }
    return { response, body: json };
  };
  const fail = (response: Response): never => {
    throwIfUnauthorized(response, 'approve');
    throw new Error(`WooCommerce approve: HTTP ${response.status}`);
  };
  const counting = await post(`sessions/${input.sessionId}/status`, { status: 'counting', at: new Date().toISOString() });
  if (counting.response.status === 404) return { refused: 'not_counting' };
  if (counting.response.status !== 200 && counting.response.status !== 409) fail(counting.response);
  const counted = wooTenders(input.counted, minorUnitDigits(input.currency));
  const { response, body } = await post(`sessions/${input.sessionId}/approve`,
    { username: input.credentials.username, password: input.credentials.password, counted });
  if (response.status === 403) return { refused: 'override_refused' };
  if (response.status === 404 || response.status === 409) return { refused: 'not_counting' };
  if (response.status !== 200) fail(response);
  const approved = body?.approved_counted, approvedBy = body?.approved_by;
  const expected = { cash: 0, ...input.counted };
  const matches = approved !== null && typeof approved === 'object' && !Array.isArray(approved)
    && Object.keys(approved).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, minor]) => wooSignedMinor(approved[key], input.currency) === minor);
  if (typeof approvedBy !== 'number' || !Number.isInteger(approvedBy) || !matches) return { refused: 'override_refused' };
  return { approval: `wcpos-approve:${input.sessionId}:${approvedBy}`, approvedBy: String(approvedBy) };
}
