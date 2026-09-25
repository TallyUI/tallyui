import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
