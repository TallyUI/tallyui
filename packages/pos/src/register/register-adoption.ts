import { readFresh } from '../rxdb';
import { uuidv7 } from '../pos-order/uuidv7';
import { registerCommandsLogger, type RegisterCommandCollection } from './register-commands';
import type { RegisterSession } from './schemas';
import { isKnownSessionStatus, RegisterSessionRequiredError, RegisterTakeOverError, type RegisterSessionCollection } from './session-store';

const chains = new WeakMap<RegisterCommandCollection, Promise<void>>();

/**
 * Applied opens fill a missing resume id; refused opens make open/counting sessions conflict.
 * Superseded rejections make open/counting/conflict sessions terminal; terminal/unknown states stay untouched.
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
            if (answer.error?.code === 'register_session_superseded') next = { ...next, status: 'superseded' };
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

export async function takeOverSession({ commands, sessions, sessionId, now }: {
  commands: RegisterCommandCollection; sessions: RegisterSessionCollection; sessionId: string; now?: string;
}): Promise<void> {
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

async function finishAbandon({ commands, sessions, sessionId, now }: Parameters<typeof takeOverSession>[0]) {
  const rows = await readFresh(commands, { selector: { 'payload.sessionId': sessionId, syncStatus: 'pending' } });
  for (const row of rows) {
    await (await commands.findOne(row.key).exec(true)).incrementalModify((doc) => doc.syncStatus !== 'pending' ? doc : ({
      ...doc, syncStatus: 'rejected', error: { code: 'register_session_abandoned', message: 'The cashier chose another register.' },
      updatedAt: now ?? new Date().toISOString(),
    }));
  }
  await (await sessions.findOne(sessionId).exec(true)).incrementalModify((doc) => doc.status === 'conflict' ? { ...doc, status: 'abandoned' } : doc);
}

export async function abandonSession(input: Parameters<typeof takeOverSession>[0]): Promise<void> {
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
