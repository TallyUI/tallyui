// MovementSheet is its own exported screen in this port (design item 4), so it gets its own
// direct tests here in addition to the WCPOS register-panel.test.tsx assertions ported into
// register-panel.test.tsx below. Real useRegisterSession over a real memory RxDB register, as
// register-harness.tsx.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
