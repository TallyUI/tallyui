import type { RxCollection, RxError, RxJsonSchema } from 'rxdb';
import type {
  CommandError, RegisterCommandType, RegisterCommandResult, RegisterSessionOpenPayload, RegisterSessionTransitionPayload,
  RegisterMovementRecordPayload, RegisterMovementVoidPayload, RegisterClosureSubmitPayload,
} from '@tallyui/core';
import { createLogger } from '../logging';
import { uuidv7 } from '../pos-order/uuidv7';
import { readFresh } from '../rxdb';
import { markCommandsSince, type RegisterHost } from './register-document';
import type { CashMovement, Closure, RegisterSession } from './schemas';
import type { CashMovementCollection, ClosureCollection, RegisterSessionCollection } from './session-store';

export const registerCommandsLogger = createLogger('register-commands');

export interface RegisterCommand {
  key: string; registerId: string; seq: number; commandId: string; type: RegisterCommandType; version: number;
  payload: Record<string, unknown>; createdAt: string; syncStatus: 'pending' | 'applied' | 'rejected';
  error?: CommandError; result?: RegisterCommandResult; updatedAt: string;
}
export type RegisterCommandCollection = RxCollection<RegisterCommand>;

export const registerCommandSchema: RxJsonSchema<RegisterCommand> = {
  title: 'Register commands', version: 0, primaryKey: 'key', type: 'object', additionalProperties: false,
  properties: {
    key: { type: 'string', maxLength: 100 }, registerId: { type: 'string', maxLength: 36 },
    seq: { type: 'integer', minimum: 0, maximum: 1e15, multipleOf: 1 },
    commandId: { type: 'string' }, type: { type: 'string' }, version: { type: 'integer' },
    payload: { type: 'object', additionalProperties: true },
    createdAt: { type: 'string' }, updatedAt: { type: 'string' },
    syncStatus: { type: 'string', enum: ['pending', 'applied', 'rejected'], maxLength: 10 },
    error: { type: 'object', properties: {
      code: { type: 'string' }, message: { type: 'string' }, data: { type: 'object', additionalProperties: true },
    }, required: ['code', 'message'], additionalProperties: false },
    result: { type: 'object', additionalProperties: true },
  },
  required: ['key', 'registerId', 'seq', 'commandId', 'type', 'version', 'payload', 'createdAt', 'syncStatus', 'updatedAt'],
  indexes: [['registerId', 'seq'], ['syncStatus', 'registerId', 'seq']],
};
export const registerCommandCollection = () => ({ schema: registerCommandSchema });

type BuiltCommand = Pick<RegisterCommand, 'key' | 'type' | 'payload'> & { version: 1 };

export function sessionOpenCommand(s: RegisterSession): BuiltCommand {
  return { key: `session.open:${s.id}`, type: 'register.session.open', version: 1, payload: {
    sessionId: s.id, registerId: s.register_id, openedAt: s.opened_at_gmt, countedFloatMinor: s.counted_float_minor,
    ...(s.store_key == null ? {} : { storeKey: s.store_key }),
    ...(s.business_day == null ? {} : { businessDay: s.business_day }),
    ...(s.opened_by == null ? {} : { openedBy: s.opened_by }),
    ...(s.expected_float_minor == null ? {} : { expectedFloatMinor: s.expected_float_minor }),
    ...(s.opening_variance_minor == null ? {} : { openingVarianceMinor: s.opening_variance_minor }),
  } satisfies RegisterSessionOpenPayload };
}

export function sessionTransitionCommand(s: RegisterSession & { status: RegisterSessionTransitionPayload['status']; status_at: string }): BuiltCommand {
  return { key: `session.transition:${s.id}:${s.status}:${s.status_at}`, type: 'register.session.transition', version: 1, payload: {
    sessionId: s.id, status: s.status, at: s.status_at,
    ...(s.status !== 'closed' || s.counted == null ? {} : { counted: s.counted }),
    ...(s.status !== 'closed' || s.closed_by == null ? {} : { closedBy: s.closed_by }),
    ...(s.status !== 'closed' || s.approved_by == null ? {} : { approvedBy: s.approved_by }),
  } satisfies RegisterSessionTransitionPayload };
}

export function movementCommand(m: CashMovement): BuiltCommand {
  const common = { movementId: m.id, sessionId: m.session_id, createdAt: m.created_at_gmt,
    ...(m.created_by == null ? {} : { createdBy: m.created_by }) };
  return m.type === 'void'
    ? { key: `movement.void:${m.id}`, type: 'register.movement.void', version: 1,
        payload: { ...common, voids: m.voids! } satisfies RegisterMovementVoidPayload }
    : { key: `movement.record:${m.id}`, type: 'register.movement.record', version: 1,
        payload: { ...common, type: m.type, amountMinor: m.amountMinor, reason: m.reason } satisfies RegisterMovementRecordPayload };
}

export function closureCommand(c: Closure): BuiltCommand {
  return { key: `closure.submit:${c.id}`, type: 'register.closure.submit', version: 1, payload: {
    closureId: c.id, sessionId: c.session_id, registerId: c.register_id, number: c.number,
    openedAt: c.opened_at, closedAt: c.closed_at,
    ...(c.business_day == null ? {} : { businessDay: c.business_day }),
    ...(c.closed_by == null ? {} : { closedBy: c.closed_by }),
    ...(typeof c.breakdowns.approved_by === 'string' && c.breakdowns.approved_by ? { approvedBy: c.breakdowns.approved_by } : {}),
    tillExpected: c.till_expected, counted: c.counted,
    periodSalesTotalMinor: c.period_sales_total_minor, periodRefundsTotalMinor: c.period_refunds_total_minor,
    perpetualSalesTotalMinor: c.perpetual_sales_total_minor, perpetualRefundsTotalMinor: c.perpetual_refunds_total_minor,
    unsyncedCount: c.unsynced_count, unsyncedTotalMinor: c.unsynced_total_minor, softwareVersion: c.software_version,
    orderIds: c.order_ids, movementIds: c.movement_ids,
  } satisfies RegisterClosureSubmitPayload };
}

const chains = new WeakMap<RegisterCommandCollection, Map<string, Promise<void>>>();

/** Appends missing facts in dependency order; the bytes of an existing key never change. */
export function reconcileRegisterCommands({ commands, sessions, movements, closures, host, storeKey, registerId, now, observed }: {
  commands: RegisterCommandCollection; sessions: RegisterSessionCollection; movements: CashMovementCollection;
  closures: ClosureCollection; host: RegisterHost; storeKey: string; registerId: string; now?: string; observed?: RegisterSession[];
}): Promise<string[]> {
  // `conflict` and `superseded` are local states derived from the store's answers (ADR-078 decision 9), never sent as a transition.
  const sentStatus = (s: RegisterSession): s is RegisterSession & { status: RegisterSessionTransitionPayload['status'] } => s.status === 'open' || s.status === 'counting' || s.status === 'closed';
  let registers = chains.get(commands);
  if (!registers) chains.set(commands, registers = new Map());
  const run = (registers.get(registerId) ?? Promise.resolve()).then(async () => {
    const since = await markCommandsSince(host, storeKey, registerId, now ?? new Date().toISOString());
    const [highest] = await readFresh(commands, { selector: { registerId }, sort: [{ seq: 'desc' }], limit: 1 });
    let seq = highest?.seq ?? 0;
    const transitioned = new Set((await readFresh(commands, { selector: { registerId, type: 'register.session.transition' } }))
      .map(({ payload }) => payload.sessionId));
    const rows = await readFresh(sessions, { selector: { register_id: registerId } });
    const complete = new Set((await commands.storageInstance.findDocumentsById(rows.flatMap((session) =>
      [`session.open:${session.id}`, ...(session.status === 'closed' && session.closure_id ? [`closure.submit:${session.closure_id}`] : [])]), false)).map(({ key }) => key));
    const facts = await Promise.all(rows.filter((session) =>
      session.status !== 'closed' || ((session.status_at == null || session.status_at >= since || complete.has(`session.open:${session.id}`))
        && !complete.has(`closure.submit:${session.closure_id}`)))
      .map(async (session) => {
      const [entries, closureRows] = await Promise.all([
        readFresh(movements, { selector: { session_id: session.id } }),
        session.closure_id ? closures.storageInstance.findDocumentsById([session.closure_id], false) : Promise.resolve([]),
      ]);
      const events = (observed ?? []).filter((row) => row.id === session.id && !transitioned.has(session.id)
        && row.status !== session.status && row.status !== 'closed')
        .flatMap((row) => row.status_at == null || !sentStatus(row) ? [] : [sessionTransitionCommand({ ...row, status_at: row.status_at })]);
      events.push(...entries.filter((entry) => entry.type !== 'void').map(movementCommand),
        ...entries.filter((entry) => entry.type === 'void').map(movementCommand));
      if (session.status_at != null && sentStatus(session)) events.push(sessionTransitionCommand({ ...session, status_at: session.status_at }));
      return { session, number: closureRows[0]?.number, built: [sessionOpenCommand(session), ...events,
        ...closureRows.map((closure) => closureCommand(closure))] };
    }));
    facts.sort((a, b) => Number(a.session.status !== 'closed') - Number(b.session.status !== 'closed')
      || (a.number ?? Infinity) - (b.number ?? Infinity)
      || a.session.id.localeCompare(b.session.id));
    const existing = new Set((await commands.storageInstance.findDocumentsById(facts.flatMap(({ built }) => built.map(({ key }) => key)), false))
      .map(({ key }) => key));
    const appended: string[] = [];
    for (const { built } of facts) {
      for (const command of built) {
        if (existing.has(command.key)) continue;
        seq++;
        const at = now ?? new Date().toISOString();
        try {
          await commands.insert({ ...command, registerId, seq, commandId: uuidv7(), createdAt: at, updatedAt: at, syncStatus: 'pending' });
          appended.push(command.key);
        } catch (error) {
          if ((error as RxError)?.code !== 'CONFLICT') throw error;
        }
        existing.add(command.key);
      }
    }
    return appended;
  });
  registers.set(registerId, run.then(() => undefined, () => undefined));
  return run;
}
