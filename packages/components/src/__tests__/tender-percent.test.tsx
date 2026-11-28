import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney, paymentMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { Tender } from '../sale/tender';
import type { TenderPaneProps } from '../sale/tender-pane';
import { useTender } from '../sale/use-tender';
import { blue, pricing, SaleHarness, sale, traits } from './sale-harness';

type Props = Pick<TenderPaneProps, 'percentSplit' | 'beforeTake'>;
const cash = paymentMethodOf('cash');
const methods: PaymentMethodDescriptor[] = [{ ...cash, defaults: { ...cash.defaults, rounding: { incrementMinor: 5, mode: 'nearest' } } }, paymentMethodOf('external')];
let tender: ReturnType<typeof useTender>;
function Pane(props: Props) {
  tender = useTender(sale, methods);
  return <Tender sale={sale} methods={methods} tender={tender} {...props} />;
}
function start(rest: number, props: Props = { percentSplit: true }) {
  render(<SaleHarness settings={{ ...pricing, taxRatesPpm: { default: 0 } }} capabilities={{ orderCreate: 12, cashRounding: true }}>
    {() => <Pane {...props} />}
  </SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, rest));
  act(() => sale.startTender('cash'));
}
afterEach(cleanup);

const money = (amount: number) => formatMoney({ amount, currency: 'EUR' });
const text = (id: string) => screen.getByTestId(id).textContent;
const press = (id: string) => fireEvent.click(screen.getByTestId(id));
const enter = (value: number) => { for (const digit of String(value)) press(`tender-keypad-key-${digit}`); };
const openPercent = () => { press('tender-split-chip'); press('tender-percent'); };
const takeDisabled = () => screen.getByTestId('tender-take').getAttribute('aria-disabled') === 'true';
const nothing = (value: number, rest: number) => `${value} % of ${money(rest)} takes nothing · type a larger share`;
const wayIds = () => within(screen.getByTestId('tender-split-ways')).getAllByRole('button').map((tile) => tile.getAttribute('data-testid'));

it.each<[string, number, number, number, boolean, number | null, number | null]>([
  ['P1', 1001, 10, 100, true, null, null],
  ['P2', 1001, 20, 200, true, null, null],
  ['P3', 1001, 25, 250, true, null, null],
  ['P4', 1001, 50, 501, false, 500, 505],
  ['P5', 1001, 0, 0, false, null, null],
  ['P6', 1001, 150, 1000, true, null, null],
  ['P7', 3, 10, 0, false, null, null],
  ['P8', 3, 20, 1, false, null, 5],
  ['P8', 3, 25, 1, false, null, 5],
  ['P8', 3, 50, 2, false, null, 5],
  ['P9', 3, 0, 0, false, null, null],
  ['P10', 3, 150, 5, true, null, null],
  ['P11', 7, 10, 1, false, null, 5],
  ['P11', 7, 20, 1, false, null, 5],
  ['P11', 7, 25, 2, false, null, 5],
  ['P11', 7, 50, 4, false, null, 5],
  ['P12', 7, 0, 0, false, null, null],
  ['P13', 7, 150, 5, true, null, null],
])('%s: rest %i, input %i %%', (row, rest, value, entry, enabled, below, above) => {
  start(rest);
  openPercent();
  const typed = value === 0 || value === 150;
  const chip = `tender-percent-${typed ? 'type' : value}`;
  press(chip);
  if (typed) enter(value);
  expect(screen.getByTestId(chip).getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByTestId('tender-quick-exact')).toBeNull();
  expect(text('tender-entry-amount')).toBe(money(entry));
  expect(takeDisabled()).toBe(!enabled);
  if (enabled) expect(text('tender-take')).toBe(`Take ${money(entry)} in Cash`);
  const hint = above !== null ? `Cash cannot pay that exactly. Take ${below !== null ? `${money(below)} or ` : ''}${money(above)}.`
    : entry === 0 ? nothing(value, rest) : `${Math.min(value, 100)} % of ${money(rest)} · type another share`;
  expect(text('tender-entry-hint')).toBe(hint);
  for (const [id, amount] of [['below', below], ['above', above]] as const) {
    if (amount === null) expect(screen.queryByTestId(`tender-payable-${id}`)).toBeNull();
    else expect(text(`tender-payable-${id}`)).toBe(money(amount));
  }
  if (row === 'P6') expect(screen.getByText(`Rounded from ${money(1001)}`)).not.toBeNull();
});

it('P14: Card terminal takes the half-up share', async () => {
  const beforeTake = vi.fn().mockResolvedValue(true);
  start(1001, { percentSplit: true, beforeTake });
  press('tender-method-external');
  openPercent();
  press('tender-percent-50');
  expect(takeDisabled()).toBe(false);
  expect(text('tender-take')).toBe(`Take ${money(501)} in Card terminal`);
  await act(async () => { press('tender-take'); });
  expect(beforeTake).toHaveBeenCalledWith({ methodId: 'external', amountMinor: 501 });
  expect(sale.order.payments).toMatchObject([{ amountMinor: 501 }]);
  expect(tender.state.entryMode).toBe('money');
  expect(text('tender-entry-amount')).toBe(money(500));
});

describe.each([['below', 500], ['above', 505]] as const)('P4: %s', (side, amount) => {
  it('payable chips leave percent mode', () => {
    start(1001);
    openPercent();
    press('tender-percent-50');
    press(`tender-payable-${side}`);
    expect(tender.state.entryMode).toBe('money');
    expect(screen.queryByTestId('tender-percent-heading')).toBeNull();
    expect(text('tender-entry-amount')).toBe(money(amount));
    expect(text('tender-take')).toBe(`Take ${money(amount)} in Cash`);
    expect(takeDisabled()).toBe(false);
    press('tender-take');
    expect(sale.order.payments).toMatchObject([{ amountMinor: amount }]);
  });
});

describe.each([['P5', 1001], ['P15', 1002]] as const)('%s', (row, total) => {
  it('a typed 0 takes nothing and says so', () => {
    start(total);
    if (row === 'P15') {
      press('tender-method-external');
      enter(1000);
      press('tender-take');
      expect(sale.order.payments).toMatchObject([{ method: 'external', amountMinor: 1000 }]);
      press('tender-method-cash');
    }
    const rest = row === 'P15' ? 2 : total;
    openPercent();
    press('tender-percent-type');
    enter(0);
    expect(takeDisabled()).toBe(true);
    expect(text('tender-entry-hint')).toBe(nothing(0, rest));
    press('tender-take');
    expect(sale.order.payments).toHaveLength(row === 'P15' ? 1 : 0);
    expect(sale.order.balanceDueMinor).toBe(rest);
  });
});

it('percent survives a typed entry', () => {
  start(1001);
  enter(30);
  openPercent();
  expect(text('tender-percent-heading')).toBe('Percent of the rest');
  expect(tender.state.entryMode).toBe('percent');
});

it('a pick ends percent mode', () => {
  start(1001);
  press('tender-method-external');
  openPercent();
  press('tender-percent-25');
  act(() => tender.dispatch({ type: 'set-split-units', lineId: sale.order.lineItems[0].id, units: 1, unpaidUnits: 1 }));
  expect(tender.state.entryMode).toBe('money');
  expect(screen.queryByTestId('tender-percent-heading')).toBeNull();
  expect(text('tender-entry-amount')).toBe(money(1001));
});

it('Split again ends percent mode', () => {
  start(1000);
  openPercent();
  press('tender-percent-25');
  press('tender-split-chip');
  expect(tender.state.entryMode).toBe('money');
  expect(text('tender-entry-amount')).toBe(money(1000));
});

describe.each([{}, { percentSplit: false }, { percentSplit: true }])('props %j', (props: Props) => {
  it('Percent tile is first and only with the prop', () => {
    start(1001, props);
    press('tender-split-chip');
    const ways = [2, 3, 4, 5, 6].map((count) => `tender-split-even-${count}`);
    expect(wayIds()).toEqual(props.percentSplit ? ['tender-percent', ...ways] : ways);
    if (!props.percentSplit) expect(screen.queryByTestId('tender-percent')).toBeNull();
  });
});

describe.each([{}, { percentSplit: false }])('props %j', (props: Props) => {
  it("prop off is today's output", () => {
    start(1001, props);
    press('tender-split-chip');
    expect(wayIds()).toHaveLength(5);
    expect(screen.queryByTestId('tender-percent')).toBeNull();
    expect(screen.queryByTestId('tender-percent-heading')).toBeNull();
  });
});
