import { describe, expectTypeOf, it } from 'vitest';
import type { AnyCommandEnvelope, CommandEnvelope, OrderCreateEnvelope, OrderCreatePayload, RegisterCommandEnvelope } from '@tallyui/core';
import type { CommandTransport } from './types';
import { sendOrderRefund } from '../refund';

describe('CommandTransport', () => {
  it('defaults to order.create envelopes', () => {
    expectTypeOf<Parameters<CommandTransport['send']>[0]>().toEqualTypeOf<CommandEnvelope<OrderCreatePayload>[]>();
    const transport: CommandTransport = { send: async () => ({ kind: 'results', results: [] }) };
    const batch: CommandEnvelope<OrderCreatePayload>[] = [];
    transport.send(batch);
  });

  it('the wide transport is accepted where the order outbox wants the order transport', () => {
    expectTypeOf<CommandTransport<AnyCommandEnvelope>>().toMatchTypeOf<CommandTransport<OrderCreateEnvelope>>();
  });

  it('the wide transport is accepted where sendOrderRefund wants the refund transport', () => {
    expectTypeOf<CommandTransport<AnyCommandEnvelope>>().toMatchTypeOf<Parameters<typeof sendOrderRefund>[0]>();
  });

  it('the wide transport accepts register command envelopes', () => {
    const transport: CommandTransport<AnyCommandEnvelope> = { send: async () => ({ kind: 'results', results: [] }) };
    const batch: RegisterCommandEnvelope[] = [];
    transport.send(batch);
  });
});
