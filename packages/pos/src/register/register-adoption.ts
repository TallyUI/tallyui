import type { ServerCapabilities } from '@tallyui/core';
import { CLOSURE_HOLDING_REJECTIONS } from '../outbox/register-outbox';
import { readFresh } from '../rxdb';
import { uuidv7 } from '../pos-order/uuidv7';
import { countVariance, overThreshold } from './register-count.helpers';
import { registerCommandsLogger, type RegisterCommand, type RegisterCommandCollection } from './register-commands';
import type { Closure, RegisterSession } from './schemas';
import { isKnownSessionStatus, RegisterSessionRequiredError, RegisterTakeOverError, type RegisterSessionCollection } from './session-store';

const chains = new WeakMap<RegisterCommandCollection, Promise<void>>();
type SessionTarget = { commands: RegisterCommandCollection; sessions: RegisterSessionCollection; sessionId: string; now?: string };

/**
 * Applied opens fill a missing resume id; refused opens make open/counting sessions conflict.
 * Superseded rejections make open/counting sessions terminal; a conflict session leaves only by an applied open or abandon (ADR-078 decision 9); terminal/unknown states stay untouched.
 * Applied conflict opens restore the latest transition's counting state, otherwise open; pending rows do nothing.
 * Answers are walked in seq/key order; adoption is idempotent and safe to run at any time.
 */
export async function adoptRegisterResults({ commands, sessions, registerId }: {
  commands: RegisterCommandCollection; sessions: RegisterSessionCollection; registerId: string;
}): Promise<void> {
  const run = (chains.get(commands) ?? Promise.resolve()).then(async () => {
    const [answers, transitions, rows] = await Promise.all([
      readFresh(commands, { selector: { registerId, syncStatus: { $in: ['applied', 'rejected'] } }, sort: [{ seq: 'asc' }, { key: 'asc' }] }),
      readFresh(commands, { selector: { registerId, type: 'register.session.transition' }, sort: [{ seq: 'desc' }, { key: 'desc' }] }),
      readFresh(sessions, { selector: { register_id: registerId } }),
    ]);
    for (const session of rows) {
      if (session.status === 'conflict' && answers.some((answer) => answer.payload.sessionId === session.id
        && answer.syncStatus === 'rejected' && answer.error?.code === 'register_session_abandoned')) {
        await finishAbandon({ commands, sessions, sessionId: session.id });
        continue;
      }
      const latest = transitions.find(({ payload }) => payload.sessionId === session.id);
      const modify = (doc: RegisterSession): RegisterSession => {
        let next = doc;
        for (const answer of answers) {
          if (!isKnownSessionStatus(next.status) || next.status === 'closed' || next.status === 'superseded' || next.status === 'abandoned') break;
          if (answer.payload.sessionId !== doc.id) continue;
          if (answer.syncStatus === 'rejected') {
            if (answer.error?.code === 'register_session_superseded'
              && (next.status === 'open' || next.status === 'counting')) next = { ...next, status: 'superseded' };
            else if (answer.type === 'register.session.open' && answer.error?.code === 'register_session_already_open'
              && (next.status === 'open' || next.status === 'counting')) next = { ...next, status: 'conflict' };
          } else if (answer.type === 'register.session.open') {
            const resumed = answer.result?.resumed?.fromSessionId;
            if (typeof resumed === 'string' && next.server_session_id == null) next = { ...next, server_session_id: resumed };
            if (next.status === 'conflict') next = { ...next, status: latest?.payload.status === 'counting' ? 'counting' : 'open' };
          }
        }
        return next;
      };
      if (modify(session) === session) continue;
      const row = await sessions.findOne(session.id).exec();
      if (row) await row.incrementalModify(modify);
    }
  }).catch((error: unknown) => {
    registerCommandsLogger.error('Register result adoption failed', { context: { registerId, error: String(error) } });
  });
  chains.set(commands, run.then(() => undefined, () => undefined));
  return run;
}

export async function takeOverSession({ commands, sessions, sessionId, now, registerContract }: SessionTarget & {
  /** The store's register contract (`capabilities.register`); take over needs 2, and a missing value counts as below 2. */
  registerContract?: number;
}): Promise<void> {
  if ((registerContract ?? 0) < 2) throw new RegisterTakeOverError('REGISTER_TAKEOVER_UNSUPPORTED');
  const run = (chains.get(commands) ?? Promise.resolve()).then(async () => {
    const [session] = await readFresh(sessions, { selector: { id: sessionId } });
    const row = await commands.findOne(`session.open:${sessionId}`).exec();
    if (session?.status !== 'conflict' || !row) throw new RegisterSessionRequiredError();
    await row.incrementalModify((doc) => {
      if (doc.syncStatus !== 'rejected' || doc.error?.code !== 'register_session_already_open'
        || typeof doc.error.data?.sessionId !== 'string') throw new RegisterSessionRequiredError();
      const { error, ...rest } = doc;
      return { ...rest, commandId: uuidv7(), version: 2, syncStatus: 'pending',
        payload: { ...doc.payload, supersedes: error.data!.sessionId }, updatedAt: now ?? new Date().toISOString() };
    });
  });
  chains.set(commands, run.then(() => undefined, () => undefined));
  return run;
}

async function finishAbandon({ commands, sessions, sessionId, now }: SessionTarget) {
  const rows = await readFresh(commands, { selector: { 'payload.sessionId': sessionId, syncStatus: 'pending' } });
  for (const row of rows) {
    await (await commands.findOne(row.key).exec(true)).incrementalModify((doc) => doc.syncStatus !== 'pending' ? doc : ({
      ...doc, syncStatus: 'rejected', error: { code: 'register_session_abandoned', message: 'The cashier chose another register.' },
      updatedAt: now ?? new Date().toISOString(),
    }));
  }
  await (await sessions.findOne(sessionId).exec(true)).incrementalModify((doc) => doc.status === 'conflict' ? { ...doc, status: 'abandoned' } : doc);
}

export async function abandonSession(input: SessionTarget): Promise<void> {
  const { commands, sessions, sessionId } = input;
  const run = (chains.get(commands) ?? Promise.resolve()).then(async () => {
    const [session] = await readFresh(sessions, { selector: { id: sessionId } });
    if (session?.status === 'abandoned') return;
    if (session?.status !== 'conflict') throw new RegisterSessionRequiredError();
    const [open] = await readFresh(commands, { selector: { key: `session.open:${sessionId}` } });
    if (open?.syncStatus === 'pending') throw new RegisterTakeOverError('REGISTER_TAKEOVER_PENDING');
    await finishAbandon(input);
  });
  chains.set(commands, run.then(() => undefined, () => undefined));
  return run;
}

/**
 * ADR-082 d4: the store holds this session, so the app's approval route can be used for it. Its open row is applied (a
 * resumed open and an error-free duplicate are recorded applied), and it is not conflict, superseded or abandoned. A
 * closed session still counts: the route accepts it.
 */
export function isLiveAtStore(session: Pick<RegisterSession, 'id' | 'status'> | null | undefined,
  openRow: Pick<RegisterCommand, 'key' | 'syncStatus'> | null | undefined): boolean {
  return !!session && openRow?.key === `session.open:${session.id}` && openRow.syncStatus === 'applied'
    && session.status !== 'conflict' && session.status !== 'superseded' && session.status !== 'abandoned';
}

/** `verified` once the store has applied a version 3 closure carrying a proof; `not_required` for a close the store does not check. */
export type ClosureApprovalStatus = 'verified' | 'unverified' | 'not_required';

/**
 * ADR-082 d9, derived from the closure's `register.closure.submit` row; nothing is stored. A verified approval is
 * needed at register contract 3 with the store's `registerApproval`, over its threshold on cash (the store's rule).
 * Until the store applies a version 3 row with a proof, a recorded approver is `unverified`: no row yet, pending,
 * refused, or a version 1 row the store recorded without checking.
 */
export function closureApprovalStatus(closure: Pick<Closure, 'counted' | 'till_expected'>,
  row: Pick<RegisterCommand, 'syncStatus' | 'version' | 'payload'> | null | undefined,
  capabilities: Pick<ServerCapabilities, 'register' | 'registerApproval'> | undefined): ClosureApprovalStatus {
  const threshold = capabilities?.registerApproval?.thresholdMinor;
  if ((capabilities?.register ?? 0) < 3 || threshold == null
    || !overThreshold(countVariance(closure.counted.cash ?? 0, closure.till_expected.cash ?? 0), threshold)) return 'not_required';
  return row?.syncStatus === 'applied' && row.version >= 3 && typeof row.payload.approval === 'string' && row.payload.approval
    ? 'verified' : 'unverified';
}

/** `reapproveClosure` refused. Its message can be shown to a cashier as it is. */
export class RegisterReapproveError extends Error {
  constructor(readonly code: 'REGISTER_REAPPROVE_UNSUPPORTED' | 'REGISTER_REAPPROVE_NOT_REFUSED' | 'REGISTER_REAPPROVE_PROOF_MISSING') {
    super(code === 'REGISTER_REAPPROVE_UNSUPPORTED' ? 'This store cannot check a manager approval.'
      : code === 'REGISTER_REAPPROVE_NOT_REFUSED' ? 'This closure is not waiting for a manager approval.'
        : 'Manager approval needed. Ask a manager to approve.');
    this.name = 'RegisterReapproveError';
  }
}

/**
 * ADR-082 d7: requeues a closure the store refused with either approval code, in its ledger place (the same key and
 * `seq`), with a new command id (the store replays a stored refusal for the old one), version 3, the new proof and
 * approver, and every other payload field as it was. The local closure, its Z and the session are not rewritten.
 */
export async function reapproveClosure({ commands, closureId, approval, approvedBy, registerContract, now }: {
  commands: RegisterCommandCollection; closureId: string; approval: string; approvedBy: string; registerContract?: number; now?: string;
}): Promise<void> {
  if ((registerContract ?? 0) < 3) throw new RegisterReapproveError('REGISTER_REAPPROVE_UNSUPPORTED');
  if (typeof approval !== 'string' || !approval || typeof approvedBy !== 'string' || !approvedBy) {
    throw new RegisterReapproveError('REGISTER_REAPPROVE_PROOF_MISSING');
  }
  const run = (chains.get(commands) ?? Promise.resolve()).then(async () => {
    const row = await commands.findOne(`closure.submit:${closureId}`).exec();
    if (!row) throw new RegisterReapproveError('REGISTER_REAPPROVE_NOT_REFUSED');
    await row.incrementalModify((doc) => {
      if (doc.syncStatus !== 'rejected' || !CLOSURE_HOLDING_REJECTIONS.has(doc.error?.code ?? '')) throw new RegisterReapproveError('REGISTER_REAPPROVE_NOT_REFUSED');
      const { error: _refusal, ...rest } = doc;
      return { ...rest, commandId: uuidv7(), version: 3, syncStatus: 'pending',
        payload: { ...doc.payload, approval, approvedBy }, updatedAt: now ?? new Date().toISOString() };
    });
  });
  chains.set(commands, run.then(() => undefined, () => undefined));
  return run;
}
