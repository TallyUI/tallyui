import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { useSale } from '@tallyui/pos';
import { Tender } from '../sale/tender';
import { blue, click, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

describe('Tender', () => {
  it('renders nothing outside the tender stage', () => {
    const { container } = render(<SaleHarness>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    expect(container.textContent).toBe('');
  });

  describe('cash', () => {
    it('shows the change, the balance due, and disables Complete while money is still due', () => {
      render(<SaleHarness>{(sale) => <Tender sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      act(() => sale.startTender('cash'));
      const total = sale.order.totalMinor;
      act(() => sale.setTender({ method: 'cash', amountMinor: 1000 }));
      expect(screen.getByText(/^Balance due: /)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Complete sale' }).getAttribute('aria-disabled')).toBe('true');
      act(() => sale.setTender({ method: 'cash', amountMinor: total + 500 }));
      expect(screen.queryByText(/^Balance due: /)).toBeNull();
      expect(screen.getByRole('button', { name: 'Complete sale' }).getAttribute('aria-disabled')).not.toBe('true');
      expect(screen.getByText('Change Due')).toBeTruthy();
    });
  });

  describe('card', () => {
    it('shows the reference field and lets the cashier record an approval', async () => {
      render(<SaleHarness>{(sale) => <Tender sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      act(() => sale.startTender('external'));
      expect(screen.getByText(/^Card terminal: /)).toBeTruthy();
      fireEvent.change(screen.getByRole('textbox', { name: 'Terminal reference' }), { target: { value: 'A1B2' } });
      expect(sale.order.payments[0]).toMatchObject({ method: 'external', reference: 'A1B2' });
      await act(async () => { click('Payment approved on terminal'); });
      expect(sale.stage.kind).toBe('receipt');
    });

    it('caps the reference field at 255 characters, so a typed reference is never dropped', () => {
      render(<SaleHarness>{(sale) => <Tender sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      act(() => sale.startTender('external'));
      expect(screen.getByRole('textbox', { name: 'Terminal reference' }).getAttribute('maxlength')).toBe('255');
    });
  });

  describe('Continue after a failed save (the Front desk, 2026-09-27)', () => {
    const stub = (canContinue: boolean) => ({
      stage: { kind: 'tender', method: 'external' }, error: 'The sale could not be saved: flush failed', canContinue,
      order: { currency: 'EUR', totalMinor: 1250, payments: [] },
      complete: vi.fn(), continueSale: vi.fn(), setTender: vi.fn(), cancelTender: vi.fn(),
    }) as unknown as ReturnType<typeof useSale>;
    const message = 'This sale is stored and will be sent. Continue to the next sale.';

    it('renders no Continue while canContinue is false', () => {
      render(<Tender sale={stub(false)} />);
      expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
      expect(screen.queryByText(message)).toBeNull();
      expect(screen.getByRole('button', { name: 'Payment approved on terminal' })).toBeTruthy();
    });

    it('renders Continue, with its message, when canContinue is true; pressing it calls continueSale once', () => {
      const sale = stub(true);
      render(<Tender sale={sale} />);
      expect(screen.getByText(message)).toBeTruthy();
      click('Continue');
      expect(sale.continueSale).toHaveBeenCalledTimes(1);
      expect(sale.complete).not.toHaveBeenCalled();
    });
  });

  it("shows sale.error as an alert after an underpaid complete(), and Back cancels the tender", async () => {
    render(<SaleHarness>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.startTender('cash'));
    act(() => sale.setTender({ method: 'cash', amountMinor: 1 }));
    await act(async () => { await sale.complete(); });
    expect(screen.getByRole('alert').textContent).toBe('finalize: underpaid');
    click('Back');
    expect(sale.stage.kind).toBe('cart');
  });
});
