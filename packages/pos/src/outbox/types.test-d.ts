import { describe, expectTypeOf, it } from 'vitest';
import type { CommandEnvelope, OrderCreateEnvelope } from '@tallyui/core';
import type { CommandTransport } from './types';

describe('CommandTransport', () => {
  it('defaults to order.create envelopes', () => {
    expectTypeOf<Parameters<CommandTransport['send']>[0]>().toEqualTypeOf<OrderCreateEnvelope[]>();
  });

  it('the wide transport is accepted where the order outbox wants the order transport', () => {
    expectTypeOf<CommandTransport<CommandEnvelope<unknown>>>().toMatchTypeOf<CommandTransport<OrderCreateEnvelope>>();
  });
});
