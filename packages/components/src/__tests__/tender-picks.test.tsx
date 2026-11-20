import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { formatMoney, paymentMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { splitUnitLines } from '@tallyui/pos';
import { Tender } from '../sale/tender';
import { pickFigure, useTender } from '../sale/use-tender';
import { blue, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

let tender: ReturnType<typeof useTender>;
function SharedTender({ methods }: { methods?: PaymentMethodDescriptor[] }) {
  tender = useTender(sale, methods);
  return <Tender sale={sale} tender={tender} methods={methods} />;
}
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (id: string) => screen.getByTestId(id).textContent;
const press = (id: string) => fireEvent.click(screen.getByTestId(id));
const enter = (minor: number) => act(() => tender.dispatch({ type: 'set-entry', minor }));
const pick = (id: string, units: number) => act(() => tender.picker!.onPick(id, units));
const taken = () => sale.order.payments.reduce((sum, leg) => sum + leg.amountMinor, 0);
function start(quantity = 2, methods?: PaymentMethodDescriptor[]) {
  render(<SaleHarness>{() => <SharedTender methods={methods} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  const id = sale.order.lineItems[0].id;
  act(() => sale.setQuantity(id, quantity));
  act(() => sale.startTender('cash'));
  return id;
}
function twoLines() {
  const id = start();
  act(() => { expect(sale.splitLine(id)).toBeNull(); });
  expect(sale.order.lineItems).toHaveLength(2);
  return splitUnitLines(sale.order);
}

it('W1: refuses a card entry either side of a part pick and takes exactly its money', () => {
  const id = start();
  const target = Math.floor(splitUnitLines(sale.order)[0].totalMinor / 2);
  press('tender-method-external');
  press('tender-split-chip');
  pick(id, 1);
  expect(text('tender-entry-amount')).toBe(money(target));
  for (const amount of [target + 1, target - 1]) {
    enter(amount);
    expect(screen.getByTestId('tender-take').getAttribute('aria-disabled')).toBe('true');
    expect(text('tender-entry-hint')).toBe(`This payment is ${money(target)} for the picked items`);
    press('tender-take');
    expect(sale.order.payments).toEqual([]);
  }
  press('tender-quick-balance');
  expect(text('tender-entry-amount')).toBe(money(target));
  expect(screen.getByTestId('tender-take').getAttribute('aria-disabled')).not.toBe('true');
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'external', amountMinor: target, units: { [id]: 1 } }]);
});

it('W2: keeps cash tendered and change on a part pick, including the change headline after taking it', () => {
  const id = start();
  const before = sale.order.balanceDueMinor;
  const target = Math.floor(splitUnitLines(sale.order)[0].totalMinor / 2);
  press('tender-split-chip');
  pick(id, 1);
  expect(text('tender-quick-exact')).toBe(`Exact ${money(target)}`);
  enter(target + 1500);
  expect(text('tender-entry-hint')).toBe(`Change ${money(1500)}`);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{
    method: 'cash', amountMinor: target, tenderedMinor: target + 1500, changeMinor: 1500, units: { [id]: 1 },
  }]);
  expect(text('tender-change')).toBe(`Change ${money(1500)}`);
  expect(sale.order.balanceDueMinor).toBe(before - target);
});

it('W2: refuses cash below a fresh part pick', () => {
  const id = start();
  const target = Math.floor(splitUnitLines(sale.order)[0].totalMinor / 2);
  press('tender-split-chip');
  pick(id, 1);
  enter(target - 1);
  expect(screen.getByTestId('tender-take').getAttribute('aria-disabled')).toBe('true');
  expect(text('tender-entry-hint')).toBe(`This payment is ${money(target)} for the picked items`);
  press('tender-take');
  expect(sale.order.payments).toEqual([]);
});

it('W3: clamps a second pick to the remaining unit and charges the line exactly once', () => {
  const id = start();
  const total = splitUnitLines(sale.order)[0].totalMinor;
  press('tender-split-chip');
  pick(id, 1);
  press('tender-take');
  expect(tender.state.pickedUnits).toEqual({});
  press('tender-split-chip');
  pick(id, 2);
  expect(tender.picker!.picked).toEqual({ [id]: 1 });
  expect(tender.picker!.paid).toEqual({ [id]: 1 });
  expect(tender.picker!.unitMinor(id, 2)).toBe(total - sale.order.payments[0].amountMinor);
  expect(text('tender-entry-amount')).toBe(money(total - sale.order.payments[0].amountMinor));
  press('tender-take');
  expect(sale.order.payments).toHaveLength(2);
  expect(sale.order.payments.map((leg) => leg.units)).toEqual([{ [id]: 1 }, { [id]: 1 }]);
  expect(taken()).toBe(total);
  expect(sale.order.balanceDueMinor).toBe(0);
});

it('W4: a pending leg holds units and prunes picks until it fails', () => {
  const id = start();
  const total = splitUnitLines(sale.order)[0].totalMinor;
  press('tender-split-chip');
  pick(id, 2);
  act(() => { expect(sale.addTender({ method: 'external', status: 'pending', amountMinor: Math.floor(total / 2), units: { [id]: 1 } })).not.toBeNull(); });
  expect(tender.picker!.paid).toEqual({ [id]: 1 });
  expect(tender.state.pickedUnits).toEqual({ [id]: 1 });
  pick(id, 2);
  expect(tender.picker!.picked).toEqual({ [id]: 1 });
  expect(tender.picker!.unitMinor(id, 2)).toBe(total - Math.floor(total / 2));
  expect(pickFigure(sale.order, { [id]: 2 })).toEqual({ picks: { [id]: 1 }, minor: total - Math.floor(total / 2) });
  act(() => { expect(sale.setTenderStatus(sale.order.payments[0].id, 'failed')).toBe(true); });
  expect(tender.picker!.paid).toEqual({});
  pick(id, 2);
  expect(tender.picker!.picked).toEqual({ [id]: 2 });
  expect(tender.picker!.unitMinor(id, 2)).toBe(total);
});

it('W5: voiding a part-pick leg frees its unit', () => {
  const id = start();
  press('tender-split-chip');
  pick(id, 1);
  press('tender-take');
  expect(tender.picker).toBeUndefined();
  press(`tender-leg-${sale.order.payments[0].id}-void`);
  expect(sale.order.payments[0].status).toBe('voided');
  press('tender-split-chip');
  expect(tender.picker!.paid).toEqual({});
  pick(id, 2);
  expect(tender.picker!.picked).toEqual({ [id]: 2 });
});

it('W6: Back clears picks, and re-entering waits for Split before exposing the picker', () => {
  const id = start();
  expect(tender.picker).toBeUndefined();
  press('tender-split-chip');
  pick(id, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(tender.state.pickedUnits).toEqual({});
  expect(tender.picker).toBeUndefined();
  act(() => sale.startTender('cash'));
  expect(tender.state.pickedUnits).toEqual({});
  expect(tender.picker).toBeUndefined();
  press('tender-split-chip');
  expect(tender.picker!.picked).toEqual({});
});

it('W7: a full cash pick keeps the rounded due and records the tendered amount', () => {
  const cash = paymentMethodOf('cash');
  const methods: PaymentMethodDescriptor[] = [{ ...cash, defaults: { ...cash.defaults, rounding: { incrementMinor: 10, mode: 'up' } } }];
  const id = start(2, methods);
  const total = splitUnitLines(sale.order)[0].totalMinor;
  const rounded = Math.ceil(total / 10) * 10;
  expect(rounded).toBeGreaterThan(total);
  press('tender-split-chip');
  pick(id, 2);
  expect(text('tender-entry-amount')).toBe(money(rounded));
  expect(text('tender-quick-exact')).toBe(`Exact ${money(rounded)}`);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: rounded, units: { [id]: 2 } }]);
});

it('W8: prunes picks when integer quantity falls during tender, and ignores unknown and negative picks', () => {
  const id = start(3);
  press('tender-split-chip');
  pick(id, 2);
  act(() => sale.setQuantity(id, 1));
  expect(sale.order.lineItems[0].quantity).toBe(1);
  expect(tender.state.pickedUnits).toEqual({ [id]: 1 });
  const minor = splitUnitLines(sale.order)[0].totalMinor;
  expect(pickFigure(sale.order, { [id]: 2.9 })).toEqual({ picks: { [id]: 1 }, minor });
  expect(pickFigure(sale.order, { unknown: 1 })).toBeNull();
  expect(pickFigure(sale.order, { [id]: -1 })).toBeNull();
  expect(tender.picker!.unitMinor('unknown', 1)).toBe(0);
  expect(tender.picker!.unitMinor(id, -1)).toBe(0);
  expect(text('tender-entry-amount')).toBe(money(minor));
});

// W9 is pinned by the existing Tender suites, run unchanged in acceptance.
it('W10: choosing a two-way plan clears picks and hides the picker', () => {
  const id = start();
  press('tender-split-chip');
  pick(id, 1);
  press('tender-split-even-2');
  expect(tender.state.plan).toMatchObject({ kind: 'even', ways: 2 });
  expect(tender.state.pickedUnits).toEqual({});
  expect(tender.picker).toBeUndefined();
});

it('W11: all units after a plain leg use the remaining balance as a full pick', () => {
  const lines = twoLines();
  const total = sale.order.totalMinor;
  enter(600);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ amountMinor: 600 }]);
  expect(sale.order.payments[0].units).toBeUndefined();
  const balance = sale.order.balanceDueMinor;
  press('tender-split-chip');
  for (const line of lines) pick(String(line.id), line.quantity);
  expect(pickFigure(sale.order, tender.state.pickedUnits)!.minor).toBeGreaterThan(balance);
  expect(text('tender-entry-amount')).toBe(money(balance));
  press('tender-take');
  expect(sale.order.payments).toHaveLength(2);
  expect(sale.order.payments[1].amountMinor).toBe(balance);
  expect(sale.order.payments[1].units).toEqual(Object.fromEntries(lines.map((line) => [line.id, line.quantity])));
  expect(taken()).toBe(total);
  expect(sale.order.balanceDueMinor).toBe(0);
});

it.each([true, false])('W12: with a pending card leg, cash takes the pick capped at room (all units: %s)', (all) => {
  const lines = twoLines();
  act(() => { expect(sale.addTender({ method: 'external', status: 'pending', amountMinor: 600 })).not.toBeNull(); });
  const balance = sale.order.balanceDueMinor;
  const pickedLines = all ? lines : lines.slice(0, 1);
  const pickedMoney = pickedLines.reduce((sum, line) => sum + line.totalMinor, 0);
  const target = Math.min(pickedMoney, balance - 600);
  expect(all ? pickedMoney > target : pickedMoney < balance - 600).toBe(true);
  press('tender-split-chip');
  for (const line of pickedLines) pick(String(line.id), line.quantity);
  expect(text('tender-entry-amount')).toBe(money(target));
  expect(text('tender-entry-hint')).toBe(`This payment is ${money(target)} for the picked items`);
  press('tender-take');
  expect(sale.order.payments).toHaveLength(2);
  expect(sale.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: target, tenderedMinor: target,
    units: Object.fromEntries(pickedLines.map((line) => [line.id, line.quantity])) });
  expect(sale.order.balanceDueMinor).toBe(balance - target);
});
