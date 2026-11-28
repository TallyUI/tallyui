import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { formatMoney, paymentMethodOf } from '@tallyui/core';
import { TenderPane, type TenderPaneProps } from '../sale/tender-pane';
import { TenderLedger } from '../sale/tender-ledger';
import { Tender } from '../sale/tender';
import { useTender } from '../sale/use-tender';
import { blue, pricing, SaleHarness, sale, traits } from './sale-harness';

type Props = Omit<TenderPaneProps, 'sale' | 'state' | 'dispatch'>;
const cash = paymentMethodOf('cash');
const card = paymentMethodOf('external');
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' });
const press = (id: string) => fireEvent.click(screen.getByTestId(id));
const take = () => press('tender-take');
const entry = () => screen.getByTestId('tender-entry-amount').textContent;
const disabled = (id: string) => screen.getByTestId(id).getAttribute('aria-disabled') === 'true';
const enter = (minor: number) => { for (const digit of String(minor)) press(`tender-keypad-key-${digit}`); };
afterEach(cleanup);

function Pane(props: Props) {
  const { state, dispatch } = useTender(sale, props.methods);
  return <TenderPane sale={sale} state={state} dispatch={dispatch} {...props} />;
}

function start(props: Props = {}, wrapper = false) {
  const tree = (show: boolean) => <SaleHarness settings={{ ...pricing, taxRatesPpm: { default: 0 } }} capabilities={{ orderCreate: 12, cashRounding: true }}>
    {(current) => <>{show ? wrapper ? <Tender sale={current} {...props} /> : <Pane {...props} /> : null}
      {props.ledger === false ? <TenderLedger sale={current} /> : null}</>}
  </SaleHarness>;
  const root = render(tree(true));
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 1000));
  act(() => sale.startTender('cash'));
  return (visible: boolean) => root.rerender(tree(visible));
}

function later() {
  let resolve!: (value: boolean) => void;
  const hook = vi.fn<NonNullable<Props['beforeTake']>>(() => new Promise<boolean>((done) => { resolve = done; }));
  return { hook, settle: async (value: boolean) => { await act(async () => { resolve(value); }); } };
}

it('row 1: true takes the press-time amount and reports its id once', async () => {
  const { hook, settle } = later(), onTaken = vi.fn();
  start({ beforeTake: hook, onTaken, methods: [{ ...cash, id: 'till' }] });
  enter(1200);
  take();
  expect(hook).toHaveBeenCalledWith({ methodId: 'till', amountMinor: 1000 });
  expect(sale.order.payments).toHaveLength(0);
  expect(onTaken).not.toHaveBeenCalled();
  await settle(true);
  expect(sale.order.payments).toMatchObject([{ methodId: 'till', amountMinor: 1000, tenderedMinor: 1200 }]);
  expect(onTaken.mock.calls).toEqual([[sale.order.payments[0].id]]);
});

it('row 2: false keeps the entry without a leg, callback or alert', async () => {
  const { hook, settle } = later(), onTaken = vi.fn();
  start({ beforeTake: hook, onTaken });
  enter(360);
  take();
  await settle(false);
  expect(sale.order.payments).toHaveLength(0);
  expect(onTaken).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(entry()).toBe(money(360));
});

it.each([undefined, 'yes'])('row 3: %s is not strict true', async (answer) => {
  const { hook, settle } = later();
  start({ beforeTake: hook });
  take();
  await settle(answer as unknown as boolean);
  expect(sale.order.payments).toHaveLength(0);
});

it.each(['throw', 'reject'])('row 4: a %s takes nothing and releases the guard', async (failure) => {
  const hook = vi.fn(() => { if (failure === 'throw') throw Error(); return Promise.reject(Error()); }), onTaken = vi.fn();
  start({ beforeTake: hook, onTaken });
  await act(async () => { take(); });
  expect(disabled('tender-take')).toBe(false);
  await act(async () => { take(); });
  expect(hook).toHaveBeenCalledTimes(2);
  expect(sale.order.payments).toHaveLength(0);
  expect(onTaken).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('row 5: repeated Take asks once and records one leg', async () => {
  const { hook, settle } = later();
  start({ beforeTake: hook });
  act(() => { take(); take(); });
  expect(disabled('tender-take')).toBe(true);
  expect(screen.getByTestId('tender-take').getAttribute('aria-busy')).toBe('true');
  take();
  expect(hook).toHaveBeenCalledTimes(1);
  await settle(true);
  expect(sale.order.payments).toHaveLength(1);
});

it('row 6: a true after the host cancels the tender takes nothing', async () => {
  const { hook, settle } = later();
  start({ beforeTake: hook });
  take();
  act(() => sale.cancelTender());
  expect(sale.stage.kind).not.toBe('tender');
  const add = vi.spyOn(sale, 'addTender');
  await settle(true);
  expect(add).not.toHaveBeenCalled();
  expect(sale.order.payments).toHaveLength(0);
});

it('row 7: a host leg invalidates approval and shows the sale-changed alert', async () => {
  const { hook, settle } = later(), onTaken = vi.fn();
  start({ beforeTake: hook, onTaken });
  enter(350);
  take();
  act(() => { sale.addTender({ method: 'external', amountMinor: 200 }); });
  await settle(true);
  expect(sale.order.payments).toMatchObject([{ method: 'external', amountMinor: 200 }]);
  expect(onTaken).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBe(screen.getByTestId('tender-sale-changed'));
  expect(entry()).toBe(money(350));
  take();
  expect(screen.queryByRole('alert')).toBeNull();
  await settle(false);
});

it('row 8: pending Take disables Cancel payment in a separate ledger', async () => {
  const { hook, settle } = later();
  start({ beforeTake: hook, ledger: false });
  act(() => { sale.addTender({ method: 'external', amountMinor: 200 }); });
  const cancel = `tender-leg-${sale.order.payments[0].id}-void`;
  take();
  expect(disabled(cancel)).toBe(true);
  press(cancel);
  expect(sale.order.paidMinor).toBe(200);
  await settle(false);
  expect(disabled(cancel)).toBe(false);
});

it('row 9: a true after unmount takes nothing, even with a remounted pane', async () => {
  const { hook, settle } = later();
  const show = start({ beforeTake: hook });
  take();
  show(false);
  show(true);
  expect(disabled('tender-take')).toBe(true);
  take();
  expect(hook).toHaveBeenCalledTimes(1);
  await settle(true);
  expect(sale.order.payments).toHaveLength(0);
  expect(disabled('tender-take')).toBe(false);
});

it('row 10: a pending beforeVoid disables Take', async () => {
  const { hook, settle } = later();
  start({ beforeVoid: () => hook({ methodId: 'cash', amountMinor: 200 }) });
  act(() => { sale.addTender({ method: 'cash', amountMinor: 200 }); });
  press(`tender-leg-${sale.order.payments[0].id}-void`);
  expect(disabled('tender-take')).toBe(true);
  take();
  expect(sale.order.payments).toHaveLength(1);
  await settle(false);
  expect(disabled('tender-take')).toBe(false);
});

it('row 11: a pending Take ignores keypad digits', async () => {
  const { hook, settle } = later();
  start({ beforeTake: hook });
  enter(12);
  take();
  enter(3);
  expect(entry()).toBe(money(12));
  await settle(false);
});

it('row 12: zero-due cash writes off without either hook', () => {
  const beforeTake = vi.fn(() => false), onTaken = vi.fn();
  start({ beforeTake, onTaken, methods: [{ ...cash, defaults: { ...cash.defaults, rounding: { incrementMinor: 10, mode: 'down' } } }, card] });
  act(() => { sale.addTender({ method: 'external', amountMinor: 997 }); });
  take();
  expect(beforeTake).not.toHaveBeenCalled();
  expect(onTaken).not.toHaveBeenCalled();
  expect(sale.order.payments).toHaveLength(1);
  expect(sale.order.cashRoundings).toEqual([{ paymentId: sale.order.payments[0].id, minor: -3 }]);
  expect(sale.order.balanceDueMinor).toBe(0);
});

it('row 13: without beforeTake the leg and onTaken are synchronous', () => {
  const onTaken = vi.fn();
  start({ onTaken });
  take();
  expect(sale.order.payments).toHaveLength(1);
  expect(onTaken.mock.calls).toEqual([[sale.order.payments[0].id]]);
});

it('row 14: a throw in onTaken leaves the leg taken', () => {
  const onTaken = vi.fn(() => { throw Error(); });
  start({ onTaken });
  take();
  expect(onTaken).toHaveBeenCalledTimes(1);
  expect(sale.order.paidMinor).toBe(1000);
});

it.each([true, undefined])('row 15: offline=%s marks every tile or none', (offline) => {
  start({ offline, methods: [cash, card] });
  for (const method of [cash, card]) {
    expect(screen.queryByTestId(`tender-method-${method.id}-offline`)?.textContent).toBe(offline ? 'Offline' : undefined);
    expect(disabled(`tender-method-${method.id}`)).toBe(false);
  }
});

it('row 16: Tender passes beforeTake, onTaken and offline to the pane', async () => {
  const { hook, settle } = later(), onTaken = vi.fn();
  start({ beforeTake: hook, onTaken, offline: true }, true);
  expect(screen.getByTestId('tender-method-cash-offline').textContent).toBe('Offline');
  take();
  expect(hook).toHaveBeenCalledWith({ methodId: 'cash', amountMinor: 1000 });
  expect(sale.order.payments).toHaveLength(0);
  await settle(true);
  expect(onTaken.mock.calls).toEqual([[sale.order.payments[0].id]]);
});
