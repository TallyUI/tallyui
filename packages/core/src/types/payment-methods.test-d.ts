import { describe, expectTypeOf, it } from 'vitest';
import type {
  TallyConnector, SyncContext, PaymentMethodDescriptor, PaymentMethodKind, CaptureMode, PaymentRounding,
} from '@tallyui/core';
import { paymentMethodOf } from '@tallyui/core';

describe('PaymentMethodDescriptor types', () => {
  it('makes connector payment methods optional', () => {
    expectTypeOf<TallyConnector['paymentMethods']>().toEqualTypeOf<
      ((context: SyncContext) => Promise<PaymentMethodDescriptor[]>) | undefined
    >();
  });

  it('keeps the two wire methods unchanged', () => {
    expectTypeOf<PaymentMethodKind>().toEqualTypeOf<'cash' | 'external'>();
    expectTypeOf<Parameters<typeof paymentMethodOf>[0]>().toEqualTypeOf<PaymentMethodKind>();
  });

  it('defines the capture modes', () => {
    expectTypeOf<CaptureMode>().toEqualTypeOf<'manual' | 'webview' | 'server' | 'device' | 'stored_value' | 'gateway'>();
  });

  it('uses numbers for minor-unit amounts', () => {
    expectTypeOf<NonNullable<PaymentRounding>['incrementMinor']>().toEqualTypeOf<number>();
    expectTypeOf<PaymentMethodDescriptor['capabilities']['amount']['minMinor']>().toEqualTypeOf<number | undefined>();
  });

  it('accepts an unknown capture mode', () => {
    expectTypeOf<'future_mode'>().toExtend<PaymentMethodDescriptor['capture']['mode']>();
  });
});
