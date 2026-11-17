import { describe, expectTypeOf, it } from 'vitest';
import type { PaymentKind } from '@tallyui/core';
import type {
  OrderFilterBarProps,
  PaymentMethod,
  PaymentMethodKind,
  PaymentSelectorMethod,
  PaymentSelectorProps,
} from '../index';

describe('component payment types', () => {
  it('keeps PaymentMethodKind as an alias of core PaymentKind', () => {
    expectTypeOf<PaymentMethodKind>().toEqualTypeOf<PaymentKind>();
  });

  it('keeps PaymentMethod as an alias of PaymentSelectorMethod', () => {
    expectTypeOf<PaymentMethod>().toEqualTypeOf<PaymentSelectorMethod>();
  });

  it('uses PaymentSelectorMethod for selector methods', () => {
    expectTypeOf<PaymentSelectorProps['methods']>().toEqualTypeOf<PaymentSelectorMethod[]>();
  });

  it('uses core PaymentKind for optional filter kinds', () => {
    type PaymentOption = NonNullable<NonNullable<OrderFilterBarProps['options']>['paymentMethod']>[number];
    expectTypeOf<PaymentOption['kind']>().toEqualTypeOf<PaymentKind | undefined>();
  });
});
