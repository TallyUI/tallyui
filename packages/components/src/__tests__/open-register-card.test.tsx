// Ported from WCPOS `next` `3b5331b5c` `open-register-card.test.tsx` (ADR-032 amendment 1,
// register-screens-a; LEDGER 52). The harness changes: a real `useRegisterSession` over a real
// memory RxDB register instead of a mocked hook, and money is minor units (a '200' chip becomes
// 20000; '570.10' becomes 57010). `expectedFloat` comes from `configuredFloatMinor`/
// `register.lastClosure`, not a WooCommerce `default_float` binding lookup, and there is no
// receipt/printer, dialog or overlay-side concern to mock away (dropped from this port).
//
// Not ported: `Toast.show`'s success message — TallyUI has no imperative toast manager; the
// card opening the session is already visible through the caller swapping it out once
// `register.session` is set (RegisterColumn).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { closeSession, writeClosure } from '@tallyui/pos';
import { OpenRegisterCard } from '../register/open-register-card';
import { createRegisterDb, RegisterHarness, seedSession, type RegisterDb } from './register-harness';

let db: RegisterDb;
beforeEach(async () => {
  db = await createRegisterDb();
});
afterEach(async () => {
  cleanup();
  await db.remove();
});

async function closeWithCount(cash: number) {
  const session = await seedSession(db, 10000);
  const closed = await closeSession(db.register_sessions, session.id, { counted: { cash } });
  await writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: cash,
    otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0',
  });
}

it('prefills the configured float, offers the last count, shows variance only when they differ, and opens', async () => {
  await closeWithCount(57010);
  render(
    <RegisterHarness db={db}>
      {(register) => <OpenRegisterCard register={register} currency="EUR" configuredFloatMinor={20000} />}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('open-register-chip-last')).toBeTruthy());
  // The Front desk review (2026-09-28): the amount field had no visible label. Followup (2026-09-28,
  // medusapos): the label names the currency too, matching MovementSheet's "Amount (€)".
  expect(screen.getByTestId('open-register-amount-label').textContent).toBe('Cash in the drawer to start (€)');
  expect(screen.getByTestId('open-register-amount').getAttribute('aria-label')).toBe(
    'Cash in the drawer to start (€)',
  );
  expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('200.00');
  expect(screen.queryByTestId('opening-variance')).toBeNull();
  fireEvent.click(screen.getByTestId('open-register-chip-last'));
  expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('570.10');
  expect(screen.getByTestId('opening-variance')).toBeTruthy();
  fireEvent.click(screen.getByTestId('open-register-button'));
  await waitFor(async () => {
    const rows = await db.register_sessions.find({ selector: { register_id: 'register', status: 'open' } }).exec();
    expect(rows).toHaveLength(1);
  });
});

it('uses a last count that arrives after the local query, without replacing typed input', async () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <OpenRegisterCard register={register} currency="EUR" />}
    </RegisterHarness>,
  );
  expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('');
  await closeWithCount(57010);
  await waitFor(() =>
    expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('570.10'),
  );
  fireEvent.change(screen.getByTestId('open-register-amount'), { target: { value: '600' } });
  // A second, unrelated closure arriving afterwards must not replace what the cashier typed.
  await closeWithCount(12345);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('600');
});
