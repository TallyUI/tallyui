// RegisterColumn is new to TallyUI (design item 6, LEDGER 53): swaps the cart column for
// register selection, opening or counting when the till needs it, and offers Close register
// when an open session runs overdue with an empty cart.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startCounting } from '@tallyui/pos';
import { RegisterColumn } from '../register/register-column';
import { createRegisterDb, RegisterHarness, seedSession, type RegisterDb } from './register-harness';

let db: RegisterDb;
beforeEach(async () => {
  db = await createRegisterDb();
});
afterEach(async () => {
  cleanup();
  await db.remove();
});

const registers = [{ id: 'register', name: 'Front' }];

it('renders the picker when unbound', () => {
  const onPick = vi.fn();
  render(
    <RegisterHarness db={db} overrides={{ registerId: null }}>
      {(register) => (
        <RegisterColumn register={register} registerId={null} registers={registers} onPick={onPick} currency="EUR">
          <div>Cart</div>
        </RegisterColumn>
      )}
    </RegisterHarness>,
  );
  expect(screen.getByTestId('register-picker')).toBeTruthy();
  fireEvent.click(screen.getByTestId('register-picker-row-register'));
  expect(onPick).toHaveBeenCalledWith('register');
});

it('renders the open card when bound with no session', () => {
  render(
    <RegisterHarness db={db}>
      {(register) => (
        <RegisterColumn register={register} registerId="register" registers={registers} onPick={vi.fn()} currency="EUR">
          <div>Cart</div>
        </RegisterColumn>
      )}
    </RegisterHarness>,
  );
  expect(screen.getByTestId('open-register-card')).toBeTruthy();
});

it('renders the count slot while counting, and children once selling', async () => {
  const session = await seedSession(db);
  await startCounting(db.register_sessions, session.id);
  render(
    <RegisterHarness db={db}>
      {(register) => (
        <RegisterColumn
          register={register}
          registerId="register"
          registers={registers}
          onPick={vi.fn()}
          currency="EUR"
          countSlot={<div data-testid="count-slot">Counting…</div>}
        >
          <div data-testid="cart">Cart</div>
        </RegisterColumn>
      )}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('count-slot')).toBeTruthy());
  expect(screen.queryByTestId('cart')).toBeNull();
});

it('offers Close register when overdue with an empty cart, and starts counting', async () => {
  const session = await seedSession(db);
  render(
    <RegisterHarness db={db} overrides={{ expectedCloseTime: '00:00' }}>
      {(register) => (
        <RegisterColumn
          register={register}
          registerId="register"
          registers={registers}
          onPick={vi.fn()}
          currency="EUR"
          cartEmpty
        >
          <div data-testid="cart">Cart</div>
        </RegisterColumn>
      )}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('register-column-overdue')).toBeTruthy());
  fireEvent.click(screen.getByTestId('register-column-close-overdue'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const row = await db.register_sessions.findOne(session.id).exec();
  expect(row?.status).toBe('counting');
});

it('does not offer Close register when the cart has lines', async () => {
  await seedSession(db);
  render(
    <RegisterHarness db={db} overrides={{ expectedCloseTime: '00:00' }}>
      {(register) => (
        <RegisterColumn register={register} registerId="register" registers={registers} onPick={vi.fn()} currency="EUR">
          <div data-testid="cart">Cart</div>
        </RegisterColumn>
      )}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('cart')).toBeTruthy());
  expect(screen.queryByTestId('register-column-overdue')).toBeNull();
});
