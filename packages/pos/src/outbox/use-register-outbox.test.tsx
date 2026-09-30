import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { RegisterCommandEnvelope } from '@tallyui/core';
import { uuidv7 } from '../pos-order';
import { registerCommandCollection, type RegisterCommand, type RegisterCommandCollection } from '../register/register-commands';
import type { CommandTransport } from './types';
import { useRegisterOutbox, type UseRegisterOutboxOptions } from './use-register-outbox';

const databases: RxDatabase[] = [];
async function collection(): Promise<RegisterCommandCollection> {
  const db = await createRxDatabase({ name: `registeroutbox${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  databases.push(db);
  const { register_commands } = await db.addCollections({ register_commands: registerCommandCollection() });
  return register_commands;
}
function command(seq: number): RegisterCommand {
  return { key: `session.open:register-${seq}`, registerId: 'register-1', seq, commandId: uuidv7(),
    type: 'register.session.open', version: 1, payload: { sessionId: `session-${seq}`, registerId: 'register-1', countedFloatMinor: 0 },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: 'pending' };
}
const send = vi.fn<CommandTransport<RegisterCommandEnvelope>['send']>();
const transport = vi.fn(() => ({ send }));
function options(commands: RegisterCommandCollection | null): UseRegisterOutboxOptions {
  return { commands, deviceId: 'device-1', transport };
}
afterEach(async () => {
  cleanup();
  for (const db of databases.splice(0)) await db.close();
  send.mockReset(); transport.mockClear();
});

describe('useRegisterOutbox', () => {
  it('resends a refused command when reopened over the same collection', async () => {
    const commands = await collection();
    const pending = command(1);
    await commands.insert(pending);
    send.mockResolvedValueOnce({ kind: 'refused', status: 403, reason: 'status_403' })
      .mockImplementation(async (batch) => ({ kind: 'results', results: batch.map(({ id }) => ({ id, status: 'applied' })) }));
    const first = renderHook(() => useRegisterOutbox(options(commands)));
    await waitFor(() => expect(first.result.current.state.refused).toEqual({ status: 403, reason: 'status_403' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect((await commands.findOne(pending.key).exec())?.syncStatus).toBe('pending');
    first.unmount();

    const reopened = renderHook(() => useRegisterOutbox(options(commands)));
    await waitFor(() => expect(reopened.result.current.state.pending).toBe(0));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([batch]) => batch[0].id)).toEqual([pending.commandId, pending.commandId]);
    expect((await commands.findOne(pending.key).exec())?.syncStatus).toBe('applied');
  });

  it('stays idle without commands, then stops the old collection and starts a new one', async () => {
    const first = await collection();
    const second = await collection();
    const pending = command(2);
    await second.insert(pending);
    send.mockImplementation(async (batch) => ({ kind: 'results', results: batch.map(({ id }) => ({ id, status: 'applied' })) }));
    const view = renderHook((props: UseRegisterOutboxOptions) => useRegisterOutbox(props), { initialProps: options(null) });
    expect(view.result.current.state).toEqual({ pending: 0, sending: false });
    expect(transport).not.toHaveBeenCalled();

    view.rerender(options(first));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    view.rerender(options(second));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0][0].id).toBe(pending.commandId);
    await act(async () => { await second.insert(command(4)); });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    await act(async () => { await first.insert(command(1)); });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(send).toHaveBeenCalledTimes(2);
    view.unmount();
    await second.insert(command(3));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a new device id restarts the outbox and sends with it', async () => {
    const commands = await collection();
    send.mockImplementation(async (batch) => ({ kind: 'results', results: batch.map(({ id }) => ({ id, status: 'applied' })) }));
    const view = renderHook((props: UseRegisterOutboxOptions) => useRegisterOutbox(props), { initialProps: options(commands) });
    const first = command(1);
    await act(async () => { await commands.insert(first); });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0][0]).toMatchObject({ id: first.commandId, deviceId: 'device-1' });
    await waitFor(() => expect(view.result.current.state.pending).toBe(0));

    view.rerender({ ...options(commands), deviceId: 'device-2' });
    const second = command(2);
    await act(async () => { await commands.insert(second); });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0][0]).toMatchObject({ id: second.commandId, deviceId: 'device-2' });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('the latest isEnabled and onResult are used without a restart', async () => {
    const commands = await collection();
    const pending = command(1);
    await commands.insert(pending);
    const first = vi.fn();
    const second = vi.fn();
    send.mockImplementation(async (batch) => ({ kind: 'results', results: batch.map(({ id }) => ({ id, status: 'applied' })) }));
    const view = renderHook((props: UseRegisterOutboxOptions) => useRegisterOutbox(props), {
      initialProps: { ...options(commands), isEnabled: () => false, onResult: first },
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(send).not.toHaveBeenCalled();

    view.rerender({ ...options(commands), isEnabled: () => true, onResult: second });
    await act(() => view.result.current.flush());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ commandId: pending.commandId }),
      { id: pending.commandId, status: 'applied' });
    expect(first).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('flushes without a collection as a no-op', async () => {
    const view = renderHook(() => useRegisterOutbox(options(null)));
    await act(async () => { await view.result.current.flush(); });
    expect(view.result.current.state).toEqual({ pending: 0, sending: false });
    expect(transport).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
