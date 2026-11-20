// MovementSheet is its own exported screen in this port (design item 4), so it gets its own
// direct tests here in addition to the WCPOS register-panel.test.tsx assertions ported into
// register-panel.test.tsx below. Real useRegisterSession over a real memory RxDB register, as
// register-harness.tsx.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MoneyFormatProvider } from '@tallyui/core';
import { I18nProvider } from '../i18n';
import { MovementSheet } from '../register/movement-sheet';
import { createRegisterDb, RegisterHarness, seedSession, type RegisterDb } from './register-harness';

let db: RegisterDb;
beforeEach(async () => {
  db = await createRegisterDb();
  await seedSession(db);
});
afterEach(async () => {
  cleanup();
  await db.remove();
});

const confirmButton = () => screen.getByTestId('movement-confirm') as HTMLButtonElement;

it('will not record a movement the server would refuse for a blank reason', () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_in" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  // The Front desk review (2026-09-28): two bare boxes had no visible labels.
  expect(screen.getByTestId('movement-amount-label').textContent).toBe('Amount (€)');
  expect(screen.getByTestId('movement-amount').getAttribute('aria-label')).toBe('Amount (€)');
  expect(screen.getByTestId('movement-reason-label').textContent).toBe('Reason');
  expect(screen.getByTestId('movement-reason').getAttribute('aria-label')).toBe('Reason');
  fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '20' } });
  expect(confirmButton().disabled).toBe(true);
  expect(screen.getByTestId('movement-invalid').textContent).toContain('reason');
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Change' } });
  expect(confirmButton().disabled).toBe(false);
});

it('no sale hides the amount, records zero with its reason, and opens the drawer', async () => {
  const onOpenDrawer = vi.fn();
  const onDone = vi.fn();
  render(
    <RegisterHarness db={db}>
      {(register) => (
        <MovementSheet
          register={register}
          type="no_sale"
          currency="EUR"
          onOpenChange={vi.fn()}
          onOpenDrawer={onOpenDrawer}
          onDone={onDone}
        />
      )}
    </RegisterHarness>,
  );
  expect(screen.queryByTestId('movement-amount')).toBeNull();
  expect(screen.queryByTestId('movement-amount-label')).toBeNull();
  expect(screen.getByTestId('movement-reason-label').textContent).toBe('Reason');
  // No reason yet: the server would refuse a no-sale with a blank one too.
  expect(confirmButton().disabled).toBe(true);
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Wrong change' } });
  fireEvent.click(confirmButton());
  await waitFor(() => expect(onOpenDrawer).toHaveBeenCalledTimes(1));
  expect(onDone).toHaveBeenCalledWith(expect.any(String), 'no_sale', 0);
  const [row] = await db.cash_movements.find().exec();
  expect(row?.toJSON()).toMatchObject({ type: 'no_sale', amountMinor: 0, reason: 'Wrong change' });
});

it('coalesces same-tick taps before React renders saving state, minting exactly one row', async () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_out" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '20' } });
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Milk' } });
  act(() => {
    fireEvent.click(confirmButton());
    fireEvent.click(confirmButton());
  });
  await waitFor(async () => expect(await db.cash_movements.count().exec()).toBe(1));
  expect(await db.cash_movements.count().exec()).toBe(1);
});

it('normalises a keypad decimal comma to the amount the server accepts', async () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_in" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '10,50' } });
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Change' } });
  expect(confirmButton().disabled).toBe(false);
  fireEvent.click(confirmButton());
  await waitFor(async () => {
    const [row] = await db.cash_movements.find().exec();
    expect(row?.amountMinor).toBe(1050);
  });
});

it('shows a thrown error by its message alone, without its class name', async () => {
  class FooError extends Error {
    name = 'FooError';
  }
  render(
    <RegisterHarness db={db}>
      {(register) => (
        <MovementSheet
          register={{ ...register, actions: { ...register.actions, recordMovement: () => Promise.reject(new FooError('Finish first')) } }}
          type="no_sale"
          currency="EUR"
          onOpenChange={vi.fn()}
        />
      )}
    </RegisterHarness>,
  );
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Wrong change' } });
  fireEvent.click(confirmButton());
  await waitFor(() => expect(screen.getByText('Finish first')).toBeTruthy());
  expect(screen.queryByText(/FooError/)).toBeNull();
});

const chipIds = () =>
  Array.from(screen.getByTestId('movement-reason-chips').querySelectorAll('[data-testid^="movement-reason-"]')).map((el) =>
    el.getAttribute('data-testid'),
  );
const reasonInput = () => screen.getByTestId('movement-reason') as HTMLInputElement;
const pressed = (id: string) => screen.getByTestId(id).getAttribute('aria-pressed');

it("paid out offers v2's reasons as chips", () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_out" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  expect(chipIds()).toEqual(['supplier', 'petty-cash', 'bank', 'tips', 'change', 'other'].map((k) => `movement-reason-${k}`));
  expect(screen.getByTestId('movement-reason-petty-cash').textContent).toBe('Petty cash');
});

it('a chip fills the reason, a second tap clears it, and the reason records', async () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_out" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '5' } });
  fireEvent.click(screen.getByTestId('movement-reason-supplier'));
  expect(reasonInput().value).toBe('Supplier');
  expect(pressed('movement-reason-supplier')).toBe('true');
  fireEvent.click(screen.getByTestId('movement-reason-supplier'));
  expect(reasonInput().value).toBe('');
  expect(pressed('movement-reason-supplier')).toBe('false');
  fireEvent.click(screen.getByTestId('movement-reason-supplier'));
  fireEvent.click(confirmButton());
  await waitFor(async () => {
    const [row] = await db.cash_movements.find().exec();
    expect(row?.toJSON()).toMatchObject({ type: 'paid_out', reason: 'Supplier' });
  });
});

it("typing a chip's label turns it on; Other… clears and focuses the field", () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_out" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  fireEvent.change(reasonInput(), { target: { value: 'Bank' } });
  expect(pressed('movement-reason-bank')).toBe('true');
  fireEvent.click(screen.getByTestId('movement-reason-other'));
  expect(reasonInput().value).toBe('');
  expect(document.activeElement).toBe(reasonInput());
});

it('no sale offers its own reasons, and `reasons` replaces the defaults', () => {
  const { unmount } = render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="no_sale" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  expect(chipIds()).toEqual(['change', 'mistake', 'drawer-check', 'other'].map((k) => `movement-reason-${k}`));
  unmount();
  render(
    <RegisterHarness db={db}>
      {(register) => (
        <MovementSheet register={register} type="no_sale" currency="EUR" onOpenChange={vi.fn()} reasons={['Milk run']} />
      )}
    </RegisterHarness>,
  );
  expect(chipIds()).toEqual(['movement-reason-milk-run', 'movement-reason-other']);
});

it("paid in offers Float, Change, Bank and Other…", () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_in" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  expect(chipIds()).toEqual(['float', 'change', 'bank', 'other'].map((k) => `movement-reason-${k}`));
});

const typeAmount = (value: string) => fireEvent.change(screen.getByTestId('movement-amount'), { target: { value } });

it('the confirm button names the amount to put in, and the bare verb without a valid amount', () => {
  const { unmount } = render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_in" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  expect(confirmButton().textContent).toBe('Put cash in');
  typeAmount('5');
  expect(confirmButton().textContent).toBe('Put €5.00 in');
  typeAmount('5,5');
  expect(confirmButton().textContent).toBe('Put €5.50 in');
  typeAmount('abc');
  expect(confirmButton().textContent).toBe('Put cash in');
  typeAmount('0');
  expect(confirmButton().textContent).toBe('Put cash in');
  unmount();
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_in" currency="JPY" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  typeAmount('500');
  expect(confirmButton().textContent).toBe('Put ¥500 in');
});

it('paid out reads Take … out, and no sale keeps Record', () => {
  const { unmount } = render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="paid_out" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  expect(confirmButton().textContent).toBe('Take cash out');
  typeAmount('20');
  expect(confirmButton().textContent).toBe('Take €20.00 out');
  unmount();
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type="no_sale" currency="EUR" onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
  expect(confirmButton().textContent).toBe('Record');
});

it('the amount in the label follows the store money format', () => {
  render(
    <MoneyFormatProvider locale="en" format={{ position: 'right_space', thousandSeparator: '.', decimalSeparator: ',', symbol: '€' }}>
      <RegisterHarness db={db}>
        {(register) => <MovementSheet register={register} type="paid_in" currency="EUR" onOpenChange={vi.fn()} />}
      </RegisterHarness>
    </MoneyFormatProvider>,
  );
  typeAmount('5');
  expect(confirmButton().textContent).toBe('Put 5,00 € in');
});

it('an app catalogue overrides the label string', () => {
  render(
    <I18nProvider locale="en" resources={{ en: { 'register.put_in': 'Deposit {amount}' } }}>
      <RegisterHarness db={db}>
        {(register) => <MovementSheet register={register} type="paid_in" currency="EUR" onOpenChange={vi.fn()} />}
      </RegisterHarness>
    </I18nProvider>,
  );
  typeAmount('5');
  expect(confirmButton().textContent).toBe('Deposit €5.00');
});

const renderSheet = (type: 'paid_in' | 'paid_out', currency: string, onDone = vi.fn()) =>
  render(
    <RegisterHarness db={db}>
      {(register) => <MovementSheet register={register} type={type} currency={currency} onDone={onDone} onOpenChange={vi.fn()} />}
    </RegisterHarness>,
  );
const typeReason = (value: string) => fireEvent.change(screen.getByTestId('movement-reason'), { target: { value } });
const hint = () => screen.getByTestId('movement-invalid').textContent;

it('refuses more decimal places than the currency has, before the tap', async () => {
  const onDone = vi.fn();
  renderSheet('paid_in', 'EUR', onDone);
  typeAmount('5.123');
  typeReason('Change');
  expect(confirmButton().disabled).toBe(true);
  expect(hint()).toBe('Enter an amount with at most 2 decimal places.');
  expect(confirmButton().textContent).toBe('Put cash in');
  fireEvent.click(confirmButton());
  expect(onDone).not.toHaveBeenCalled();
  expect(await db.cash_movements.find().exec()).toHaveLength(0);
});

it('records 5.12 EUR as 512 minor units', async () => {
  const onDone = vi.fn();
  renderSheet('paid_in', 'EUR', onDone);
  typeAmount('5.12');
  typeReason('Change');
  fireEvent.click(confirmButton());
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.any(String), 'paid_in', 512));
  expect((await db.cash_movements.find().exec())[0]?.toJSON()).toMatchObject({ type: 'paid_in', amountMinor: 512 });
});

it('refuses a fractional yen amount and records a whole one', async () => {
  const onDone = vi.fn();
  renderSheet('paid_out', 'JPY', onDone);
  typeAmount('500.5');
  typeReason('Milk');
  expect(confirmButton().disabled).toBe(true);
  expect(hint()).toBe('Enter a whole amount.');
  typeAmount('500');
  expect(confirmButton().disabled).toBe(false);
  fireEvent.click(confirmButton());
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.any(String), 'paid_out', 500));
});

it('refuses an amount too large for minor units', () => {
  renderSheet('paid_in', 'EUR');
  typeAmount('99999999999999');
  typeReason('Change');
  expect(confirmButton().disabled).toBe(true);
  expect(hint()).toBe('Enter a valid amount.');
  expect(confirmButton().textContent).toBe('Put cash in');
});

it('a missing reason still names a valid amount', () => {
  renderSheet('paid_in', 'EUR');
  typeAmount('5.12');
  expect(hint()).toBe('Enter a reason.');
  expect(confirmButton().textContent).toBe('Put €5.12 in');
});
