import { readFresh } from '../rxdb';
import { registerCommandsLogger, type RegisterCommandCollection } from './register-commands';
import type { RegisterSession } from './schemas';
import { isKnownSessionStatus, type RegisterSessionCollection } from './session-store';

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
