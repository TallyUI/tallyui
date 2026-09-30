import type { RegisterCommandEnvelope } from '@tallyui/core';
import { useEffect, useRef, useState } from 'react';
import type { RegisterCommandCollection } from '../register/register-commands';
import { createRegisterOutbox, type RegisterOutboxOptions } from './register-outbox';
import type { CommandTransport, OutboxState } from './types';

const idle: OutboxState = { pending: 0, sending: false };

export interface UseRegisterOutboxOptions {
  /** `register_commands` (see `registerCommandCollection()`); `null` while it opens or when there's no store. A new collection (a store switch) restarts the outbox. */
  commands: RegisterCommandCollection | null;
  /** Builds the transport; read once per collection. */
  transport(): CommandTransport<RegisterCommandEnvelope>;
  /** The device id sent on every command. A change restarts the outbox. */
  deviceId: string;
  /** Passed through to createRegisterOutbox (same meaning). Read when the outbox is created. */
  isEnabled?: () => boolean;
  onResult?: RegisterOutboxOptions['onResult'];
  backendNotFound?: RegisterOutboxOptions['backendNotFound'];
}
export interface UseRegisterOutboxResult {
  /** The outbox state, or idle ({ pending: 0, sending: false }) while there is no collection. */
  state: OutboxState;
  /** Sends pending till updates; does nothing while there is no collection. */
  flush(): Promise<void>;
}

export function useRegisterOutbox(options: UseRegisterOutboxOptions): UseRegisterOutboxResult {
  const { commands, deviceId } = options;
  const latest = useRef(options);
  latest.current = options;
  const current = useRef<{ commands: RegisterCommandCollection; deviceId: string; outbox: ReturnType<typeof createRegisterOutbox> } | null>(null);
  const [state, setState] = useState<OutboxState>(idle);

  useEffect(() => {
    setState(idle);
    if (!commands) return;
    const outbox = createRegisterOutbox({ collection: commands, deviceId, transport: latest.current.transport(),
      isEnabled: latest.current.isEnabled ? () => latest.current.isEnabled?.() ?? true : undefined,
      onResult: latest.current.onResult ? async (command, result) => { await latest.current.onResult?.(command, result); } : undefined,
      backendNotFound: latest.current.backendNotFound });
    current.current = { commands, deviceId, outbox };
    const status = outbox.state$.subscribe(setState);
    outbox.start();
    return () => { outbox.stop(); status.unsubscribe(); current.current = null; setState(idle); };
  }, [commands, deviceId]);

  const opened = current.current;
  return { state: opened?.commands === commands && opened.deviceId === deviceId ? state : idle,
    async flush() {
      const active = current.current;
      if (active?.commands === commands && active.deviceId === deviceId) await active.outbox.flush();
    } };
}
