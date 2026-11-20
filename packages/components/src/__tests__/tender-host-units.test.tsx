import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { initTenderState } from '@tallyui/pos';
import { Tender } from '../sale/tender';
import { blue, SaleHarness, sale, traits } from './sale-harness';

vi.mock('@tallyui/pos', async (importOriginal) => {
  const original = await importOriginal<typeof import('@tallyui/pos')>();
  return { ...original, initTenderState: vi.fn(original.initTenderState) };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('P2-U6: the host passes the order payments to initTenderState on a remount during tender', () => {
  const { rerender } = render(<SaleHarness>{() => null}</SaleHarness>);
  act(() => sale.add(blue, traits));
  const lineId = sale.order.lineItems[0].id;
  act(() => sale.setQuantity(lineId, 3));
  act(() => sale.startTender('cash'));
  rerender(<SaleHarness>{(sale) => <Tender key={0} sale={sale} />}</SaleHarness>);
  act(() => { sale.addTender({ method: 'cash', amountMinor: 300, units: { [lineId]: 2 } }); });
  const payment = sale.order.payments[0];
  expect(payment.units).toEqual({ [lineId]: 2 });
  rerender(<SaleHarness>{(sale) => <Tender key={1} sale={sale} />}</SaleHarness>);
  expect(sale.stage.kind).toBe('tender');
  expect(sale.order.payments).toEqual([payment]);
  expect(initTenderState).toHaveBeenLastCalledWith(expect.objectContaining({ payments: [payment] }));
});
