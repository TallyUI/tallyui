import { describe, expectTypeOf, it } from 'vitest';
import type { ReceiptTemplate, ReceiptTemplateKind, SyncContext, TallyConnector } from '@tallyui/core';

describe('ReceiptTemplate types', () => {
  it('makes connector receipt templates optional', () => {
    expectTypeOf<Pick<TallyConnector, 'receiptTemplates'>>().toEqualTypeOf<{
      receiptTemplates?: (context: SyncContext, kind?: ReceiptTemplateKind) => Promise<ReceiptTemplate[]>;
    }>();
  });

  it('names the two renderable engines', () => {
    expectTypeOf<ReceiptTemplate['engine']>().toEqualTypeOf<'html' | 'thermal'>();
  });

  it('keeps the paper optional', () => {
    expectTypeOf<ReceiptTemplate['paper']>().toEqualTypeOf<'58mm' | '80mm' | undefined>();
  });
});
