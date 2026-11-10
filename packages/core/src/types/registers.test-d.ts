import { describe, expectTypeOf, it } from 'vitest';
import type { RegisterInfo, SyncContext, TallyConnector } from '@tallyui/core';

describe('RegisterInfo types', () => {
  it('makes the connector register directory optional', () => {
    expectTypeOf<TallyConnector['listRegisters']>().toEqualTypeOf<
      ((context: SyncContext) => Promise<RegisterInfo[]>) | undefined
    >();
  });

  it('requires only id and name, with money in minor units', () => {
    expectTypeOf<RegisterInfo>().toEqualTypeOf<{
      id: string;
      name: string;
      defaultFloatMinor?: number;
      varianceThresholdMinor?: number;
      expectedCloseTime?: string;
    }>();
  });
});
