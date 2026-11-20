import { useReducer } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { tenderReducer, initTenderState, type TenderState, type TenderAction } from '@tallyui/pos';
import { TenderPane } from '../sale/tender-pane';
import { blue, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

let host: { state: TenderState; dispatch: (a: TenderAction) => void };
function HostPane() {
  const [state, dispatch] = useReducer(tenderReducer, { methodId: 'cash', balanceMinor: sale.order.balanceDueMinor }, initTenderState);
  host = { state, dispatch };
  return <TenderPane sale={sale} state={state} dispatch={dispatch} />;
}
const press = (id: string) => {
  const button = screen.getByTestId(id);
  expect(button.getAttribute('aria-disabled')).not.toBe('true');
  fireEvent.click(button);
};
function start() {
  render(<SaleHarness>{() => <HostPane />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  const id = sale.order.lineItems[0].id;
  act(() => sale.setQuantity(id, 2));
  act(() => sale.startTender('cash'));
  return id;
}

it('HP1: picks made before a plan never reach the planned leg', { timeout: 20_000 }, () => {
  const lineId = start();
  act(() => host.dispatch({ type: 'open-split' }));
  act(() => host.dispatch({ type: 'set-split-units', lineId, units: 1, unpaidUnits: 2 }));
  press('tender-split-even-2');
  const balance = sale.order.balanceDueMinor;
  press('tender-take');
  expect(sale.order.payments).toHaveLength(1);
  expect(sale.order.payments[0].units).toBeUndefined();
  expect(sale.order.payments[0].amountMinor).toBeLessThan(balance);
  expect(host.state.unitAllocations).toEqual({});
  expect(host.state.pickedUnits).toEqual({});
});

it('HP2: picks dispatched under a plan never reach the leg', { timeout: 20_000 }, () => {
  const lineId = start();
  press('tender-split-chip');
  press('tender-split-even-2');
  act(() => host.dispatch({ type: 'set-split-units', lineId, units: 1, unpaidUnits: 2 }));
  expect(host.state.pickedUnits).toEqual({});
  press('tender-take');
  expect(sale.order.payments[0].units).toBeUndefined();
  expect(host.state.unitAllocations).toEqual({});
});

it('HP3: a pick on a line the order does not have never reaches the leg', { timeout: 20_000 }, () => {
  start();
  press('tender-split-chip');
  act(() => host.dispatch({ type: 'set-split-units', lineId: 'ghost', units: 1, unpaidUnits: 1 }));
  expect(host.state.pickedUnits).toEqual({ ghost: 1 });
  const balance = sale.order.balanceDueMinor;
  press('tender-take');
  expect(sale.order.payments).toHaveLength(1);
  expect(sale.order.payments[0].units).toBeUndefined();
  expect(sale.order.payments[0].amountMinor).toBe(balance);
  expect(host.state.unitAllocations).toEqual({});
});

it('HP4: a full-balance pick with an unknown line takes the standing units', { timeout: 20_000 }, () => {
  const lineId = start();
  press('tender-split-chip');
  act(() => host.dispatch({ type: 'set-split-units', lineId, units: 2, unpaidUnits: 2 }));
  act(() => host.dispatch({ type: 'set-split-units', lineId: 'ghost', units: 1, unpaidUnits: 1 }));
  const balance = sale.order.balanceDueMinor;
  press('tender-take');
  expect(sale.order.payments).toHaveLength(1);
  expect(sale.order.payments[0].units).toEqual({ [lineId]: 2 });
  expect(sale.order.payments[0].amountMinor).toBe(balance);
  expect(host.state.unitAllocations).toEqual({ [sale.order.payments[0].id]: { [lineId]: 2 } });
  expect(host.state.pickedUnits).toEqual({});
});

it('HP5: a part pick with an unknown line freezes only the standing units', { timeout: 20_000 }, () => {
  const lineId = start();
  press('tender-split-chip');
  act(() => host.dispatch({ type: 'set-split-units', lineId, units: 1, unpaidUnits: 2 }));
  act(() => host.dispatch({ type: 'set-split-units', lineId: 'ghost', units: 1, unpaidUnits: 1 }));
  const balance = sale.order.balanceDueMinor;
  press('tender-take');
  expect(sale.order.payments).toHaveLength(1);
  expect(sale.order.payments[0].units).toEqual({ [lineId]: 1 });
  expect(sale.order.payments[0].amountMinor).toBeLessThan(balance);
  expect(host.state.unitAllocations).toEqual({ [sale.order.payments[0].id]: { [lineId]: 1 } });
});
