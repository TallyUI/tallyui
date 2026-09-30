// Ported from WCPOS `next` `3b5331b5c` `register-panel.test.tsx` (ADR-032 amendment 1,
// register-screens-a). Harness change: a real `useRegisterSession` over a real memory RxDB
// register (register-harness.tsx) instead of a mocked hook and mocked `@wcpos/components`; money
// is minor units, and there is no printer/receipt, reports, capabilities or router to mock away.
//
// Ported (8, titles kept word for word): 'records paid out and Undo inserts a void', 'no sale
// hides amount and opens the resolved drawer', 'will not record a movement the server would
// refuse for a blank reason', 'will not open the drawer for a no sale the server would refuse',
// 'normalises %s to the amount grammar the server accepts', 'keeps confirm dead for %s, which the
// server would refuse', 'Close register starts counting and dismisses the panel', 'coalesces
// same-tick movement taps before React renders saving state'.
//
// Not ported (12), each for the reason given:
// - the X-report (a later job, per design item 5's "Leave out"): 'hides every amount and the X
//   report for blind cashiers' (blind hiding every amount is covered by a new test below instead),
//   'translates a failed X-report dispatch in the register panel'.
// - refused movements and retry (no outbox here; `useRegisterSession`'s own "Not ported" note):
//   'shows refused movements at the top of the pane and offers a retry', 'keeps the refused
//   banner and its retry after the session has closed', 'says nothing about refused movements
//   when every row is delivered'.
// - closure sync/print/reprint (no outbox or printer, per design item 5's "Leave out"): 'shows
//   Unsynced until every named row is acknowledged, then offers Reprint', 'shows the server
//   number and offers Reprint for an acknowledged superseded closure', 'hides acknowledged
//   closure reprinting from blind cashiers', 'shows the dead-lettered closure movement error'.
// - the Reports deep link and its capability gating (a later job, per design item 5's "Leave
//   out"): 'opens the last closure in Reports Closures and dismisses the register panel',
//   'explains the closure restriction only while blind counting is enabled', 'keeps unknown
//   report capabilities navigable, but hides blind amounts (%j)'.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { RegisterPanel } from '../register/register-panel';
import { createRegisterDb, RegisterHarness, seedMovement, seedSession, type RegisterDb } from './register-harness';

let db: RegisterDb;
let sessionId = '';
beforeEach(async () => {
  db = await createRegisterDb();
  const session = await seedSession(db);
  sessionId = session.id;
  await seedMovement(db, sessionId, 'paid_out', 700, 'Milk');
});
afterEach(async () => {
  cleanup();
  await db.remove();
});

/** A hand-built pending sale stamped to the seeded session, enough for `salesCount` to count it. */
function seedSale(id: string) {
  return db.pos_orders.insert({
    id, commandId: `command-${id}`, createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: 1000, discountMinor: 0, taxMinor: 0,
    totalMinor: 1000, customer: null, syncStatus: 'pending', sessionId, cashierRef: '7',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    payments: [{ id: `${id}-payment-0`, method: 'cash', amountMinor: 1000 }],
  });
}

async function renderPanel(overrides?: Parameters<typeof RegisterHarness>[0]['overrides']) {
  render(
    <RegisterHarness db={db} overrides={overrides}>
      {(register) => <RegisterPanel register={register} currency="EUR" registerName="Front" open onOpenChange={() => {}} />}
    </RegisterHarness>,
  );
  // The hook's first snapshot arrives asynchronously (an RxDB subscription, not a render-time
  // value); every interaction below waits for the panel — and the seeded session — to be there.
  await waitFor(() => expect(screen.getByTestId('register-panel-paid-in')).toBeTruthy());
}
const confirmButton = () => screen.getByTestId('movement-confirm') as HTMLButtonElement;

it('blind mode hides every amount', async () => {
  await renderPanel({ blind: true });
  await waitFor(() => expect(screen.getByTestId('register-panel-amount').textContent).toBe('Front'));
  fireEvent.click(screen.getByTestId('register-panel-movements'));
  expect(screen.getByTestId('register-panel').textContent).not.toContain('€');
  expect(screen.queryByTestId('register-panel-expected')).toBeNull();
});

// The Front desk review (2026-09-28): a bare, unlabelled headline amount duplicated the Cash
// row below it. The heading is the register name and the sales count in both modes; only a
// labelled section, hidden while blind, lists the expected figures.
it('labels the heading with the register name and sales count, and the figures under Expected in the drawer', async () => {
  await renderPanel();
  await waitFor(() => expect(screen.getByTestId('register-panel-amount').textContent).toBe('Front'));
  expect(screen.getByTestId('register-panel-sales-count').textContent).toBe('0 sales this session');
  const expectedSection = screen.getByTestId('register-panel-expected');
  expect(expectedSection.textContent).toContain('Expected in the drawer');
  expect(expectedSection.textContent).toContain('Cash');
  expect(expectedSection.textContent).toContain('€93.00');
});

// The Front desk review (2026-09-28): "1 sales this session" reads wrong; "sale" pluralises for
// 0, 1 and more.
it.each([
  [0, '0 sales this session'],
  [1, '1 sale this session'],
  [2, '2 sales this session'],
])('pluralises the sales count for %i', async (count, expected) => {
  for (let i = 0; i < count; i += 1) {
    await seedSale(`sale-${i}`);
  }
  await renderPanel();
  await waitFor(() => expect(screen.getByTestId('register-panel-sales-count').textContent).toBe(expected));
});

// The Front desk review (2026-09-28): at 360x640 the dialog was taller than the viewport and its
// top went under the page header, hiding the heading. The dialog now caps its own height (tied
// to the window) and puts everything but the heading in a scrolling body.
it('caps the dialog height and scrolls the body, leaving the heading outside the scroller', async () => {
  await renderPanel();
  await waitFor(() => expect(screen.getByTestId('register-panel-amount').textContent).toBe('Front'));
  const dialog = screen.getByTestId('register-panel');
  expect(dialog.style.maxHeight).not.toBe('');
  const body = screen.getByTestId('register-panel-body');
  expect(body.contains(screen.getByTestId('register-panel-close'))).toBe(true);
  expect(body.contains(screen.getByTestId('register-panel-amount'))).toBe(false);
});

it('records paid out and Undo inserts a void', async () => {
  await renderPanel();
  fireEvent.click(screen.getByTestId('register-panel-paid-out'));
  fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '20' } });
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Milk' } });
  fireEvent.click(confirmButton());
  await waitFor(async () => expect(await db.cash_movements.count().exec()).toBe(2));
  fireEvent.click(screen.getByTestId('register-panel-movements'));
  const rows = await db.cash_movements.find({ selector: { type: 'paid_out', amountMinor: 2000 } }).exec();
  fireEvent.click(screen.getByTestId(`movement-void-${rows[0].id}`));
  await waitFor(async () => expect((await db.cash_movements.findOne(rows[0].id).exec())?.voided_by).toBeTruthy());
});

it('no sale hides amount and opens the resolved drawer', async () => {
  await renderPanel();
  fireEvent.click(screen.getByTestId('register-panel-no-sale'));
  expect(screen.queryByTestId('movement-amount')).toBeNull();
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Wrong change' } });
  fireEvent.click(confirmButton());
  await waitFor(async () => {
    const rows = await db.cash_movements.find({ selector: { type: 'no_sale' } }).exec();
    expect(rows).toHaveLength(1);
  });
});

it('will not record a movement the server would refuse for a blank reason', async () => {
  await renderPanel();
  fireEvent.click(screen.getByTestId('register-panel-paid-in'));
  fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '20' } });
  expect(confirmButton().disabled).toBe(true);
  expect(screen.getByTestId('movement-invalid').textContent).toContain('reason');
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Change' } });
  expect(confirmButton().disabled).toBe(false);
});

it('will not open the drawer for a no sale the server would refuse', async () => {
  await renderPanel();
  fireEvent.click(screen.getByTestId('register-panel-no-sale'));
  expect(confirmButton().disabled).toBe(true);
  fireEvent.click(confirmButton());
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(await db.cash_movements.count().exec()).toBe(1); // only the seeded paid-out
});

it.each([
  ['10,50', 1050],
  ['10.', 1000],
  ['.5', 50],
  [' 10 ', 1000],
])('normalises %s to the amount grammar the server accepts', async (typed, minor) => {
  await renderPanel();
  fireEvent.click(screen.getByTestId('register-panel-paid-in'));
  fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: typed } });
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Change' } });
  expect(confirmButton().disabled).toBe(false);
  fireEvent.click(confirmButton());
  await waitFor(async () => {
    const rows = await db.cash_movements.find({ selector: { type: 'paid_in' } }).exec();
    expect(rows[0]?.amountMinor).toBe(minor);
  });
});

it.each(['1e2', '1 0', '10.50.1', '0'])(
  'keeps confirm dead for %s, which the server would refuse',
  async (typed) => {
    await renderPanel();
    fireEvent.click(screen.getByTestId('register-panel-paid-in'));
    fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: typed } });
    fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Change' } });
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByTestId('movement-invalid').textContent).toContain('amount');
  },
);

it('Close register starts counting and dismisses the panel', async () => {
  let closed = false;
  render(
    <RegisterHarness db={db}>
      {(register) => (
        <RegisterPanel
          register={register}
          currency="EUR"
          registerName="Front"
          open
          onOpenChange={(open) => {
            closed = !open;
          }}
        />
      )}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('register-panel-close')).toBeTruthy());
  fireEvent.click(screen.getByTestId('register-panel-close'));
  await waitFor(() => expect(closed).toBe(true));
  const [row] = await db.register_sessions.find({ selector: { id: sessionId } }).exec();
  expect(row?.status).toBe('counting');
});

it('coalesces same-tick movement taps before React renders saving state', async () => {
  await renderPanel();
  fireEvent.click(screen.getByTestId('register-panel-paid-out'));
  fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '20' } });
  fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Milk' } });
  act(() => {
    fireEvent.click(confirmButton());
    fireEvent.click(confirmButton());
  });
  await waitFor(async () => expect(await db.cash_movements.count().exec()).toBe(2)); // seeded row + one new
  expect(await db.cash_movements.count().exec()).toBe(2);
});
