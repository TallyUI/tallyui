import { useCallback, useReducer } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney, paymentMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { createOrderBuilder, CUSTOMER_RETAX_REFUSED, initialTenderState, tenderReducer, type TenderAction, type useSale } from '@tallyui/pos';
import { PortalHost } from '@tallyui/primitives';
import { Tender } from '../sale/tender';
import { TenderPane } from '../sale/tender-pane';
import { blue, click, pricing, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
const disabled = (testID: string) => screen.getByTestId(testID).getAttribute('aria-disabled') === 'true';
const leg = (index: number) => sale.order.payments[index].id;
/** The testIDs of the quick row's chips, or null when the row is not drawn. */
const quick = () => screen.queryByTestId('tender-quick') && within(screen.getByTestId('tender-quick')).getAllByRole('button').map((chip) => chip.getAttribute('data-testid'));
/**
 * Presses a keypad key by its label, within the keypad. Not `click()`, whose getByRole checks the accessible name
 * and visibility of every button in the pane on each call: with six keypad presses through it, the keypad test
 * took 3.8 s locally and 8.7 s on a loaded CI runner, past the 5 s test timeout.
 */
const press = (label: string) => fireEvent.click(within(screen.getByTestId('tender-keypad')).getByLabelText(label));
function start(priceMinor: number, method: 'cash' | 'external' = 'cash', methods?: Parameters<typeof Tender>[0]['methods']) {
  render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} methods={methods} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender(method));
}

describe('Tender', () => {
  it('renders nothing outside the tender stage', () => {
    const { container } = render(<SaleHarness>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    expect(container.textContent).toBe('');
  });

  it('lists each leg with its status; the headline counts captured legs only', () => {
    start(5000);
    expect(text('tender-ledger')).toBe('No payments yet');
    expect(text('tender-headline')).toBe(`To paySplit`);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 1500, status: 'pending' }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 500, status: 'authorized' }); });
    expect(text(`tender-leg-${leg(0)}-status`)).toBe('Captured');
    expect(text(`tender-leg-${leg(1)}-status`)).toBe('Pending');
    expect(text(`tender-leg-${leg(2)}-status`)).toBe('Authorized');
    expect(within(screen.getByTestId(`tender-leg-${leg(1)}`)).getByText('Next')).toBeTruthy();
    expect(within(screen.getByTestId(`tender-leg-${leg(2)}`)).queryByText('Next')).toBeNull();
    expect(text('tender-headline')).toBe(`RemainingSplit${money(1000)} of ${money(5000)} paid`);
    expect(disabled('tender-complete')).toBe(true);
  });

  it('offers exact then the next 5, 10 and 50; a chip enters its amount and the leg gives change', async () => {
    start(3451);
    const chips = within(screen.getByTestId('tender-quick')).getAllByRole('button').map((chip) => chip.textContent);
    expect(chips).toEqual([`Exact ${money(3451)}`, money(3500), money(4000), money(5000)]);
    click(money(4000));
    expect(text('tender-entry-amount')).toBe(money(4000));
    expect(text('tender-entry-hint')).toBe(`Change ${money(549)}`);
    click(`Take ${money(3451)} in Cash`);
    expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 4000 }]);
    expect(text('tender-change')).toBe(`Change ${money(549)}`);
    expect(screen.queryByTestId('tender-entry')).toBeNull();
    await act(async () => { click('Complete sale'); });
    expect(sale.stage.kind).toBe('receipt');
  });

  it('types on the keypad, takes a part payment, then pre-types the balance for the next leg', () => {
    start(2250);
    for (const key of ['1', '0', '0', '0', '0']) press(key);
    press('Delete last digit');
    expect(text('tender-entry-amount')).toBe(money(1000));
    expect(text('tender-entry-hint')).toBe(`Part payment · ${money(1250)} left after this`);
    click(`Take ${money(1000)} in Cash`);
    expect(text('tender-entry-amount')).toBe(money(1250));
    click('Card terminal');
    fireEvent.change(screen.getByRole('textbox', { name: 'Terminal reference' }), { target: { value: 'T-9' } });
    click(`Take ${money(1250)} in Card terminal`);
    expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 1000 }, { method: 'external', amountMinor: 1250, reference: 'T-9' }]);
    expect(screen.getByText('Paid in full')).toBeTruthy();
  });

  it('shows Cancel payment only where canVoidLeg allows; voiding strikes the leg and restores the balance', () => {
    const cash = paymentMethodOf('cash');
    start(2000, 'cash', [{ ...cash, capabilities: { ...cash.capabilities, void: false } }, paymentMethodOf('external')]);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 500 }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 700 }); });
    expect(within(screen.getByTestId(`tender-leg-${leg(0)}`)).queryByRole('button', { name: 'Cancel payment' })).toBeNull();
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`));
    expect(text(`tender-leg-${leg(1)}-status`)).toBe('Cancelled');
    expect(screen.queryByTestId(`tender-leg-${leg(1)}-void`)).toBeNull();
    expect(text('tender-headline')).toBe(`RemainingSplit${money(500)} of ${money(2000)} paid`);
    expect(text('tender-entry-amount')).toBe(money(1500));
  });

  it("Tender confirmVoid reaches the pane's ledger", () => {
    render(<><SaleHarness settings={settings}>{(sale) => <Tender sale={sale} confirmVoid />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 2000));
    act(() => sale.startTender('cash'));
    act(() => { sale.addTender({ method: 'external', amountMinor: 700 }); });
    fireEvent.click(within(screen.getByTestId('tender-pane')).getByTestId(`tender-leg-${leg(0)}-void`));
    expect(within(screen.getByTestId('tender-leg-void-dialog')).getByText(`Void ${money(700)} on Card terminal`)).toBeTruthy();
    expect(text(`tender-leg-${leg(0)}-status`)).not.toBe('Cancelled');
    fireEvent.click(screen.getByTestId('tender-leg-void-dialog-confirm'));
    expect(text(`tender-leg-${leg(0)}-status`)).toBe('Cancelled');
  });

  it('completes a zero-balance sale with no leg', async () => {
    start(0);
    expect(screen.queryByTestId('tender-entry')).toBeNull();
    expect(disabled('tender-complete')).toBe(false);
    await act(async () => { click('Complete sale'); });
    expect(sale.stage.kind).toBe('receipt');
  });

  it('edits the reference of the card leg startTender records, capped at 255 characters', async () => {
    start(1500, 'external');
    const field = screen.getByRole('textbox', { name: 'Terminal reference' });
    expect(field.getAttribute('maxlength')).toBe('255');
    fireEvent.change(field, { target: { value: 'A1B2' } });
    expect(sale.order.payments).toMatchObject([{ method: 'external', amountMinor: 1500, reference: 'A1B2' }]);
    expect(screen.getByTestId('tender-pane').getAttribute('data-print')).toBe('hide');
    await act(async () => { click('Complete sale'); });
    expect(sale.stage.kind).toBe('receipt');
  });

  describe('Continue after a failed save (the Front desk, 2026-09-27)', () => {
    const stub = (canContinue: boolean) => ({
      stage: { kind: 'tender', method: 'external' }, error: 'The sale could not be saved: flush failed', canContinue,
      order: { currency: 'EUR', totalMinor: 1250, paidMinor: 1250, balanceDueMinor: 0, changeDueMinor: 0, payments: [] },
      complete: vi.fn(), continueSale: vi.fn(), setTender: vi.fn(), cancelTender: vi.fn(),
    }) as unknown as ReturnType<typeof useSale>;
    const message = 'This sale is stored and will be sent. Continue to the next sale.';

    it('renders no Continue while canContinue is false', () => {
      render(<Tender sale={stub(false)} />);
      expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
      expect(screen.queryByText(message)).toBeNull();
    });

    it('renders Continue, with its message, when canContinue is true; pressing it calls continueSale once', () => {
      const sale = stub(true);
      render(<Tender sale={sale} />);
      expect(screen.getByText(message)).toBeTruthy();
      click('Continue');
      expect(sale.continueSale).toHaveBeenCalledTimes(1);
      expect(sale.complete).not.toHaveBeenCalled();
    });

    // Reuses the stub above (tender stage) with the #722 refusal as its error.
    it('shows the cashier the re-tax refusal', () => {
      render(<Tender sale={{ ...stub(false), error: CUSTOMER_RETAX_REFUSED }} />);
      expect(screen.getByRole('alert').textContent).toBe(CUSTOMER_RETAX_REFUSED);
    });
  });

  it('shows sale.error as an alert, and Back cancels the tender', async () => {
    start(2000);
    act(() => sale.setTender({ method: 'cash', amountMinor: 1 }));
    await act(async () => { await sale.complete(); });
    expect(screen.getByRole('alert').textContent).toBe('finalize: underpaid');
    click('Back');
    expect(sale.stage.kind).toBe('cart');
  });

  it('back={false} draws no Back button and keeps Complete sale', () => {
    render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} back={false} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.startTender('cash'));
    expect(screen.getByTestId('tender-complete').textContent).toBe('Complete sale');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});

describe('a taken leg freezes its picked units (#1133)', () => {
  const actions = vi.fn<(action: TenderAction) => void>();
  function ObservedPane({ sale }: { sale: ReturnType<typeof useSale> }) {
    const [state, reduce] = useReducer(tenderReducer, initialTenderState);
    const dispatch = useCallback((action: TenderAction) => {
      actions(action);
      reduce(action);
    }, [reduce]);
    return <TenderPane sale={sale} state={state} dispatch={dispatch} />;
  }
  function startPane() {
    actions.mockClear();
    render(<SaleHarness settings={settings}>{(sale) => <ObservedPane sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 1000));
    act(() => sale.startTender('cash'));
    fireEvent.click(screen.getByTestId('tender-method-cash'));
  }

  it('B1: dispatches the accepted cash leg’s non-empty payment id', () => {
    startPane();
    fireEvent.click(screen.getByTestId('tender-take'));
    const id = sale.order.payments[0].id;
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(actions).toHaveBeenCalledWith({ type: 'tender-started', paymentId: id });
  }, 20_000);

  it('B2: does not dispatch tender-started when a locked sale refuses the leg', async () => {
    startPane();
    const addTender = vi.spyOn(sale, 'addTender');
    await act(async () => {
      const completing = sale.complete();
      fireEvent.click(screen.getByTestId('tender-take'));
      await completing;
    });
    expect(addTender).toHaveBeenCalledTimes(1);
    expect(addTender).toHaveReturnedWith(null);
    expect(sale.order.payments).toEqual([]);
    expect(actions.mock.calls.some(([action]) => action.type === 'tender-started')).toBe(false);
  }, 20_000);
});

describe('a plan keys its legs by payment id (#1133 prerequisite 1)', () => {
  let state = initialTenderState;
  let dispatch: (action: TenderAction) => void;
  function ObservedPane({ sale }: { sale: ReturnType<typeof useSale> }) {
    const [paneState, paneDispatch] = useReducer(tenderReducer, initialTenderState);
    state = paneState;
    dispatch = paneDispatch;
    return <TenderPane sale={sale} state={paneState} dispatch={paneDispatch} />;
  }
  function startPane() {
    render(<SaleHarness settings={settings}>{(sale) => <ObservedPane sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 2000));
    act(() => sale.startTender('cash'));
  }

  it('D1: keeps an items plan’s paid line when a leg before the plan is voided', () => {
    startPane();
    act(() => { sale.addTender({ method: 'external', amountMinor: 500 }); });
    const A = sale.order.payments[0];
    const lineId = sale.order.lineItems[0].id;
    act(() => {
      dispatch({ type: 'set-plan', balanceMinor: 1500, plan: { kind: 'items', lineIds: [lineId], firstMinor: 1000, ways: 1, from: 1 } });
    });
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    expect(state.linesPaidBy[lineId]).toEqual(['cash']);
    fireEvent.click(screen.getByTestId(`tender-leg-${A.id}-void`));
    expect(text(`tender-leg-${A.id}-status`)).toBe('Cancelled');
    expect(state.linesPaidBy[lineId]).toEqual(['cash']);
  }, 20_000);

  it('D2: keeps an even plan’s progress when a leg before the plan is voided', () => {
    startPane();
    act(() => { sale.addTender({ method: 'external', amountMinor: 500 }); });
    const A = sale.order.payments[0];
    fireEvent.click(screen.getByTestId('tender-split-chip'));
    fireEvent.click(screen.getByTestId('tender-split-even-3'));
    expect(text('tender-plan')).toBe('1 of 3');
    act(() => { sale.addTender({ method: 'cash', amountMinor: 500 }); });
    expect(text('tender-plan')).toBe('2 of 3');
    fireEvent.click(screen.getByTestId(`tender-leg-${A.id}-void`));
    expect(text('tender-plan')).toBe('2 of 3');
  }, 20_000);
});

describe('Tender on a reopened order (ADR-090 gate 36)', () => {
  /** use-sale-locked-legs.test.tsx's reopenedBuilder: one kept line at €10 and a locked leg the store already holds. */
  function reopen(lockedMinor: number, capabilities?: { orderCreate: number }) {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false }, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
    builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: lockedMinor, reference: 'Cash', storePaymentId: 'p1', locked: true });
    render(<SaleHarness settings={settings} capabilities={capabilities}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    act(() => { expect(sale.openStoreOrder(builder.getSnapshot())).toBeNull(); });
  }

  it('a locked €10 leg and a price cut to €2 shows Refund due €8.00, not change', () => {
    reopen(1000);
    act(() => { expect(sale.setUnitPrice(sale.order.lineItems[0].id, 200)).toBeNull(); });
    act(() => sale.startTender('cash'));
    expect(sale.order.changeDueMinor).toBe(800);
    expect(screen.queryByTestId('tender-change')).toBeNull();
    expect(text('tender-refund-due')).toBe(`Refund due ${money(800)}`);
  });

  it('a normal overpaid cash sale shows its change as before and no refund due', () => {
    start(3451);
    click(money(4000));
    click(`Take ${money(3451)} in Cash`);
    expect(text('tender-change')).toBe(`Change ${money(549)}`);
    expect(screen.queryByTestId('tender-refund-due')).toBeNull();
    // Gate 36c, T3: a till sale has no store order, so its cash overpayment is never refused.
    expect(screen.queryByTestId('tender-store-holds')).toBeNull();
    expect(disabled('tender-complete')).toBe(false);
  });

  it('a reopened sale with refund due and till cash on top shows both, summing to changeDueMinor', () => {
    // This asserts the pane at the tender stage only; finalizeOrder refuses this state at completion (finalize.ts:196).
    reopen(1000);
    act(() => { expect(sale.setUnitPrice(sale.order.lineItems[0].id, 200)).toBeNull(); });
    act(() => sale.startTender('cash'));
    // startTender drops every unlocked leg, so the till cash goes on through the sale API once the tender has begun.
    act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 500 })).not.toBeNull(); });
    expect(sale.order.changeDueMinor).toBe(1300);
    expect(text('tender-change')).toBe(`Change ${money(500)}`);
    expect(text('tender-refund-due')).toBe(`Refund due ${money(800)}`);
    expect(500 + 800).toBe(sale.order.changeDueMinor);
  });

  it('gate 36c: the store holds the total, so a till leg blocks Complete until it is removed from the pane', () => {
    reopen(1000);
    act(() => { expect(sale.setUnitPrice(sale.order.lineItems[0].id, 800)).toBeNull(); });
    act(() => sale.startTender('cash'));
    // A restored draft or the sale API is the only way a till leg reaches this state: the entry is hidden at balance 0.
    let cash: string | null = null;
    act(() => { cash = sale.addTender({ method: 'cash', amountMinor: 500 }); });
    expect(cash).not.toBeNull();
    expect(disabled('tender-complete')).toBe(true);
    expect(text('tender-store-holds')).toBe(`The store already holds this sale's payment. Remove the ${money(500)} taken here to finish.`);
    fireEvent.click(screen.getByTestId(`tender-leg-${cash}-remove`));
    expect(sale.order.payments.map((payment) => payment.id)).not.toContain(cash);
    expect(screen.queryByTestId('tender-store-holds')).toBeNull();
    expect(disabled('tender-complete')).toBe(false);
    expect(text('tender-refund-due')).toBe(`Refund due ${money(200)}`);
  });

  it('gate 36c, T5: a voided till leg does not block a covered reopened sale', () => {
    reopen(1000);
    act(() => { expect(sale.setUnitPrice(sale.order.lineItems[0].id, 800)).toBeNull(); });
    act(() => sale.startTender('cash'));
    let cash: string | null = null;
    act(() => { cash = sale.addTender({ method: 'cash', amountMinor: 500 }); });
    act(() => { expect(sale.voidTender(cash!)).toBe(true); });
    expect(sale.order.payments.find((payment) => payment.id === cash)?.status).toBe('voided');
    expect(screen.queryByTestId('tender-store-holds')).toBeNull();
    expect(disabled('tender-complete')).toBe(false);
  });

  it('gate 36c, desk condition 3: a part-paid reopened sale still takes till cash for the remainder and completes', async () => {
    // A reopened sale's order.create needs version 5 or later (finalize.ts); the other cases never complete.
    reopen(1000, { orderCreate: 9 });
    act(() => { expect(sale.setUnitPrice(sale.order.lineItems[0].id, 1500)).toBeNull(); });
    act(() => sale.startTender('cash'));
    expect(screen.getByTestId('tender-entry')).toBeTruthy();
    click(money(1000));
    click(`Take ${money(500)} in Cash`);
    expect(sale.order.payments.filter((payment) => !payment.locked)).toMatchObject([{ method: 'cash', amountMinor: 1000 }]);
    expect(disabled('tender-complete')).toBe(false);
    expect(screen.queryByTestId('tender-store-holds')).toBeNull();
    expect(screen.queryByTestId('tender-refund-due')).toBeNull();
    expect(text('tender-change')).toBe(`Change ${money(500)}`);
    await act(async () => { click('Complete sale'); });
    expect(sale.error).toBeNull();
    expect(sale.stage.kind).toBe('receipt');
  });
});

describe("Tender with the host's own methods (ruling A, methodId)", () => {
  /** A host's descriptor: today's cash or card shape, under its own id, title, kind and capture mode. */
  const own = (id: string, title: string, kind: string, mode = 'manual'): PaymentMethodDescriptor =>
    ({ ...paymentMethodOf(kind === 'cash' ? 'cash' : 'external'), id, title, kind, capture: { mode, provider: null, hardware: null } });
  const host = [own('pos_cash', 'Till cash', 'cash'), own('cheque', 'Cheque', 'other'), own('stripe_terminal', 'Stripe reader', 'card', 'device')];
  /** A ledger row reads its title, then the amount and status. */
  const ledgerRow = (index: number) => text(`tender-leg-${leg(index)}`);

  it('records the default cash and card legs with no methodId at all', () => {
    start(3000);
    for (const key of ['1', '0', '0', '0']) press(key);
    click(`Take ${money(1000)} in Cash`);
    click('Card terminal');
    click(`Take ${money(2000)} in Card terminal`);
    expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 1000 }, { method: 'external', amountMinor: 2000 }]);
    for (const payment of sale.order.payments) expect(payment).not.toHaveProperty('methodId');
  });

  it('draws a tile per manual-capture method and none for a device method', () => {
    start(2500, 'cash', host);
    const tiles = within(screen.getByTestId('tender-methods')).getAllByRole('button');
    expect(tiles.map((tile) => tile.getAttribute('data-testid'))).toEqual(['tender-method-pos_cash', 'tender-method-cheque']);
    expect(screen.queryByTestId('tender-method-stripe_terminal')).toBeNull();
  });

  it("takes the host's cash method as cash under its own id, with change, titled in the ledger", () => {
    start(2500, 'cash', host);
    for (const key of ['3', '0', '0', '0']) press(key);
    expect(text('tender-entry-hint')).toBe(`Change ${money(500)}`);
    click(`Take ${money(2500)} in Till cash`);
    expect(sale.order.payments).toMatchObject([{ method: 'cash', methodId: 'pos_cash', amountMinor: 3000 }]);
    expect(text('tender-change')).toBe(`Change ${money(500)}`);
    expect(ledgerRow(0)).toBe(`Till cash${money(3000)}CapturedCancel payment`);
  });

  it("takes the host's cheque as an external leg under its own id, titled in the ledger", () => {
    start(2500, 'cash', host);
    fireEvent.click(screen.getByTestId('tender-method-cheque'));
    click(`Take ${money(2500)} in Cheque`);
    expect(sale.order.payments).toMatchObject([{ method: 'external', methodId: 'cheque', amountMinor: 2500 }]);
    expect(ledgerRow(0)).toBe(`Cheque${money(2500)}CapturedCancel payment`);
  });

  it('gives no change from a non-cash method that claims change: no hint, no cash chips, the no-change warning and no Take, as for the card', () => {
    const cheque = own('cheque', 'Cheque', 'other');
    const changingCheque = { ...cheque, capabilities: { ...cheque.capabilities, change: true } };
    const overpay = (tile: string) => { fireEvent.click(screen.getByTestId(tile)); for (const key of ['1', '5', '0', '0']) press(key); };
    start(1000);
    overpay('tender-method-external');
    const card = { hint: text('tender-entry-hint'), chips: quick(), take: disabled('tender-take') };
    expect(card).toEqual({ hint: `Only ${money(1000)} is due — Card terminal can't give change`, chips: ['tender-quick-balance'], take: true });
    cleanup();
    start(1000, 'cash', [own('pos_cash', 'Till cash', 'cash'), changingCheque]);
    overpay('tender-method-cheque');
    expect(text('tender-entry-hint')).toBe(`Only ${money(1000)} is due — Cheque can't give change`);
    expect(quick()).toEqual(['tender-quick-balance']);
    expect(disabled('tender-take')).toBe(true);
  });

  it("keeps the leg's methodId when its reference is edited", () => {
    start(1500, 'cash', host);
    fireEvent.click(screen.getByTestId('tender-method-cheque'));
    click(`Take ${money(1500)} in Cheque`);
    fireEvent.change(screen.getByRole('textbox', { name: 'Terminal reference' }), { target: { value: 'CHQ-12' } });
    expect(sale.order.payments).toMatchObject([{ method: 'external', methodId: 'cheque', amountMinor: 1500, reference: 'CHQ-12' }]);
  });

  it("opens on the offered method that records startTender's cash when no method has the id 'cash'", () => {
    start(2500, 'cash', [own('cheque', 'Cheque', 'other'), own('pos_cash', 'Till cash', 'cash')]);
    expect(screen.getByTestId('tender-method-pos_cash').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('tender-method-cheque').getAttribute('aria-selected')).toBe('false');
    expect(text('tender-take')).toBe(`Take ${money(2500)} in Till cash`);
  });

  it('a cash-kind method with change false never records above the balance: no Take over it, and at the balance a cash leg with no change', () => {
    const cod = own('cod', 'Cash on delivery', 'cash');
    start(1000, 'cash', [{ ...cod, capabilities: { ...cod.capabilities, change: false } }]);
    fireEvent.click(screen.getByTestId('tender-method-cod'));
    for (const key of ['1', '5', '0', '0']) press(key);
    expect(text('tender-entry-hint')).toBe(`Only ${money(1000)} is due — Cash on delivery can't give change`);
    expect(quick()).toEqual(['tender-quick-balance']);
    expect(disabled('tender-take')).toBe(true);
    expect(sale.order.payments).toEqual([]);
    press('Clear');
    for (const key of ['1', '0', '0', '0']) press(key);
    click(`Take ${money(1000)} in Cash on delivery`);
    expect(sale.order.payments).toMatchObject([{ method: 'cash', methodId: 'cod', amountMinor: 1000 }]);
    expect(sale.order.changeDueMinor).toBe(0);
    expect(sale.order.balanceDueMinor).toBe(0);
  });
});

describe("Tender's Full balance chip for a method that gives no change (v2 tender-pane.tsx:942-954)", () => {
  it('T1: the card at the balance reads Full balance, with no Exact or step chips', () => {
    start(2500);
    fireEvent.click(screen.getByTestId('tender-method-external'));
    expect(text('tender-entry-amount')).toBe(money(2500));
    expect(text('tender-quick-balance')).toBe('Full balance');
    expect(screen.queryByTestId('tender-quick-exact')).toBeNull();
    expect(quick()).toEqual(['tender-quick-balance']);
  });

  it('T2: over the balance it reads Full balance <balance>; a press sets the entry back, clears the no-change hint and takes nothing', () => {
    start(1000);
    fireEvent.click(screen.getByTestId('tender-method-external'));
    for (const key of ['1', '5', '0', '0']) press(key);
    expect(text('tender-entry-hint')).toBe(`Only ${money(1000)} is due — Card terminal can't give change`);
    expect(text('tender-quick-balance')).toBe(`Full balance ${money(1000)}`);
    fireEvent.click(screen.getByTestId('tender-quick-balance'));
    expect(text('tender-entry-amount')).toBe(money(1000));
    expect(text('tender-entry-hint')).toBe('');
    expect(text('tender-quick-balance')).toBe('Full balance');
    expect(disabled('tender-take')).toBe(false);
    expect(sale.order.payments).toEqual([]);
  });

  it('T3: restores full balance from a partial entry', () => {
    start(5000);
    fireEvent.click(screen.getByTestId('tender-method-external'));
    for (const key of ['Clear', '1', '2', '0', '0']) press(key);
    expect(text('tender-entry-amount')).toBe(money(1200));
    expect(text('tender-quick-balance')).toBe(`Full balance ${money(5000)}`);
    fireEvent.click(screen.getByTestId('tender-quick-balance'));
    expect(text('tender-entry-amount')).toBe(money(5000));
    expect(text('tender-entry-hint')).toBe('');
    expect(sale.order.payments).toEqual([]);
  });

  it('T4: cash keeps Exact and the step chips, and draws no balance chip', () => {
    start(3451);
    expect(quick()).toEqual(['tender-quick-exact', 'tender-quick-3500', 'tender-quick-4000', 'tender-quick-5000']);
    expect(text('tender-quick-exact')).toBe(`Exact ${money(3451)}`);
    expect(screen.queryByTestId('tender-quick-balance')).toBeNull();
  });

  it('T5: with no method picked there is no balance chip', () => {
    start(2500, 'cash', [paymentMethodOf('external')]);
    expect(screen.getByTestId('tender-method-external').getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByTestId('tender-take')).toBeNull();
    expect(screen.queryByTestId('tender-quick-balance')).toBeNull();
    expect(screen.queryByTestId('tender-quick')).toBeNull();
  });
});
