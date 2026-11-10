import { describe, expectTypeOf, it } from 'vitest';
import type { ConnectivityState, FailureClass, TallyConnector, UpdateRequired } from '@tallyui/core';

describe('Connectivity types', () => {
  it('makes the connector classifyFailure optional', () => {
    expectTypeOf<TallyConnector['classifyFailure']>().toEqualTypeOf<((error: unknown) => FailureClass) | undefined>();
  });

  it('names the three states', () => {
    expectTypeOf<ConnectivityState>().toEqualTypeOf<'online' | 'offline' | 'degraded'>();
  });

  it('shapes a failure class', () => {
    expectTypeOf<FailureClass>().toEqualTypeOf<'offline' | 'degraded' | { updateRequired: UpdateRequired } | null>();
    expectTypeOf<UpdateRequired['fixedBy']>().toEqualTypeOf<'till' | 'store'>();
  });

  it('a connector without classifyFailure still compiles', () => {
    const value: Pick<TallyConnector, 'classifyFailure'> = {};
    expectTypeOf(value.classifyFailure).toEqualTypeOf<((error: unknown) => FailureClass) | undefined>();
  });
});
