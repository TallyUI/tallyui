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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApprovalNeeded, RegisterSession } from '@tallyui/pos';
import { RegisterPanel, type RegisterPanelProps } from '../register/register-panel';
import { describeSession } from '../register/register-side-sheet';
import { createRegisterDb, RegisterHarness, seedMovement, seedSession, type RegisterDb } from './register-harness';

// react-native-web turns nativewind classes into generated ones, so the sheet's placement is read
// from the className DialogContent hands the primitive; the primitive itself still renders.
const contentClasses = vi.hoisted(() => [] as string[]);
vi.mock('@tallyui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tallyui/primitives')>();
  const { createElement, forwardRef } = await import('react');
  const Content = forwardRef<unknown, { className?: string }>(function RecordedContent(props, ref) {
    contentClasses.push(props.className ?? '');
    return createElement(actual.Dialog.Content as never, { ...props, ref });
  });
  return { ...actual, Dialog: { ...actual.Dialog, Content } };
});

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

async function renderPanel(
  overrides?: Parameters<typeof RegisterHarness>[0]['overrides'],
  onOpenChange: (open: boolean) => void = () => {},
) {
  render(
    <RegisterHarness db={db} overrides={overrides}>
      {(register) => <RegisterPanel register={register} currency="EUR" registerName="Front" open onOpenChange={onOpenChange} />}
    </RegisterHarness>,
  );
  // The hook's first snapshot arrives asynchronously (an RxDB subscription, not a render-time
  // value); every interaction below waits for the panel — and the seeded session — to be there.
  await waitFor(() => expect(screen.getByTestId('register-panel-paid-in')).toBeTruthy());
}
const confirmButton = () => screen.getByTestId('movement-confirm') as HTMLButtonElement;

it('blind mode hides every amount', async () => {
  await db.pos_orders.insert({
    id: 'card-sale', commandId: 'command-card-sale', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: 952, discountMinor: 0, taxMinor: 0,
    totalMinor: 952, customer: null, syncStatus: 'pending', sessionId, cashierRef: '7',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    payments: [{ id: 'card-payment-0', method: 'external', amountMinor: 952 }],
  });
  await renderPanel({ blind: true });
  await waitFor(() => expect(screen.getByTestId('register-panel-sales-count').textContent).toBe('1 sale this session'));
  await waitFor(() => expect(screen.getByTestId('register-panel-amount').textContent).toBe('Front'));
  fireEvent.click(screen.getByTestId('register-panel-movements'));
  expect(screen.getByTestId('register-panel').textContent).not.toContain('€');
  expect(screen.queryByTestId('register-panel-expected')).toBeNull();
  expect(screen.queryByTestId('register-panel-other-tenders')).toBeNull();
});

it('splits card takings out of Expected in the drawer into Other tenders', async () => {
  await db.pos_orders.insert({
    id: 'card-sale', commandId: 'command-card-sale', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: 952, discountMinor: 0, taxMinor: 0,
    totalMinor: 952, customer: null, syncStatus: 'pending', sessionId, cashierRef: '7',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    payments: [{ id: 'card-payment-0', method: 'external', amountMinor: 952 }],
  });
  await renderPanel();
  await waitFor(() => expect(screen.getByTestId('register-panel-other-tenders').textContent).toContain('€9.52'));
  const expectedSection = screen.getByTestId('register-panel-expected');
  expect(expectedSection.textContent).toContain('Cash');
  expect(expectedSection.textContent).not.toContain('Card');
  expect(expectedSection.textContent).not.toContain('External');
  expect(expectedSection.textContent).not.toContain('€9.52');
  const otherTenders = screen.getByTestId('register-panel-other-tenders');
  expect(otherTenders.textContent).toContain('Other tenders');
  expect(otherTenders.textContent).toContain('Card');
  expect(otherTenders.textContent).toContain('€9.52');
});

it('omits Other tenders without a non-cash sale', async () => {
  await renderPanel();
  expect(screen.queryByTestId('register-panel-other-tenders')).toBeNull();
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

it('the close button dismisses the panel without closing the register', async () => {
  const onOpenChange = vi.fn();
  await renderPanel(undefined, onOpenChange);
  fireEvent.click(screen.getByTestId('register-panel-dismiss'));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  const [row] = await db.register_sessions.find({ selector: { id: sessionId } }).exec();
  expect(row?.status).toBe('open');
});

it('Escape dismisses the panel', async () => {
  const onOpenChange = vi.fn();
  await renderPanel(undefined, onOpenChange);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

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

it('shows a thrown error by its message alone, without its class name', async () => {
  class FooError extends Error {
    name = 'FooError';
  }
  render(
    <RegisterHarness db={db}>
      {(register) => (
        <RegisterPanel
          register={{ ...register, actions: { ...register.actions, startCounting: () => Promise.reject(new FooError('Finish first')) } }}
          currency="EUR"
          registerName="Front"
          open
          onOpenChange={() => {}}
        />
      )}
    </RegisterHarness>,
  );
  await waitFor(() => expect((screen.getByTestId('register-panel-close') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByTestId('register-panel-close'));
  await waitFor(() => expect(screen.getByText('Finish first')).toBeTruthy());
  expect(screen.queryByText(/FooError/)).toBeNull();
});

// ADR-082 d7: the card for a closure the store refused. `approvalNeeded` comes from command rows
// this harness has no collection for, so it is set on the register value, with
// `reapproveClosure` spied; the hook's own tests cover building it and requeueing the row.
const needed: ApprovalNeeded = {
  closureId: 'closure-1', sessionId: 'session-1', variance: { cash: -700 },
  code: 'register_approval_invalid', reason: 'expired', liveAtStore: true,
};
async function renderReapproval(approvalNeeded: ApprovalNeeded | null, reapprove?: RegisterPanelProps['reapprove']) {
  const reapproveClosure = vi.fn(async (_input: { closureId: string; approval: string; approvedBy: string }) => {});
  render(
    <RegisterHarness db={db}>
      {(register) => (
        <RegisterPanel
          register={{ ...register, approvalNeeded, actions: { ...register.actions, reapproveClosure } }}
          currency="EUR"
          open
          onOpenChange={() => {}}
          reapprove={reapprove}
        />
      )}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('register-panel-paid-in')).toBeTruthy());
  return reapproveClosure;
}

it('shows no re-approval card without approvalNeeded', async () => {
  await renderReapproval(null, async () => ({ approvedBy: 'mgr-2', approval: 'proof-2' }));
  expect(screen.queryByTestId('register-panel-reapproval')).toBeNull();
});

it('shows the re-approval card from approvalNeeded, with no button without reapprove', async () => {
  await renderReapproval(needed);
  const card = screen.getByTestId('register-panel-reapproval');
  expect(card.textContent).toBe(
    "Approval neededThe store refused this closure's manager approval. A manager must approve it again.",
  );
  expect(screen.queryByTestId('register-panel-reapprove')).toBeNull();
});

it("sends reapprove's proof and approver to reapproveClosure", async () => {
  const reapprove = vi.fn(async (_needed: ApprovalNeeded) => ({ approvedBy: 'mgr-2', approval: 'proof-2' }));
  const reapproveClosure = await renderReapproval(needed, reapprove);
  fireEvent.click(screen.getByTestId('register-panel-reapprove'));
  await waitFor(() => expect(reapproveClosure).toHaveBeenCalledTimes(1));
  expect(reapprove).toHaveBeenCalledWith(needed);
  expect(reapproveClosure).toHaveBeenCalledWith({ closureId: 'closure-1', approval: 'proof-2', approvedBy: 'mgr-2' });
});

it('changes nothing when reapprove resolves null', async () => {
  const reapprove = vi.fn(async (_needed: ApprovalNeeded) => null);
  const reapproveClosure = await renderReapproval(needed, reapprove);
  fireEvent.click(screen.getByTestId('register-panel-reapprove'));
  await waitFor(() => expect(reapprove).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((screen.getByTestId('register-panel-reapprove') as HTMLButtonElement).disabled).toBe(false));
  expect(reapproveClosure).not.toHaveBeenCalled();
  expect(screen.getByTestId('register-panel-reapproval')).toBeTruthy();
});

// TallyUI#716: `presentation="side"`, WCPOS v2's right-hand register sheet.
async function renderSide(props: Partial<RegisterPanelProps> = {}, overrides?: Parameters<typeof RegisterHarness>[0]['overrides']) {
  render(
    <RegisterHarness db={db} overrides={overrides}>
      {(register) => (
        <RegisterPanel register={register} currency="EUR" registerName="Front" open onOpenChange={() => {}} presentation="side" {...props} />
      )}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('register-panel-paid-in')).toBeTruthy());
}
async function seedSideFixture() {
  await seedSale('sale-0');
  await seedSale('sale-1');
  await seedMovement(db, sessionId, 'paid_in', 500, 'Change');
}

it('side: the hero shows the cash expected in the drawer, and session sales their amount and count', async () => {
  await seedSideFixture();
  await renderSide();
  // 100.00 float + 20.00 cash sales + 5.00 paid in − 7.00 paid out.
  await waitFor(() => expect(screen.getByTestId('register-panel-hero').textContent).toBe('€118.00in the drawer'));
  expect(screen.getByTestId('register-panel-session-sales').textContent).toBe('Session sales€20.00 · 2 sales');
});

it('side: the ledger lists each term with its count, leaves out zero-count rows, and ends on Expected in the drawer', async () => {
  await seedSideFixture();
  await renderSide();
  await waitFor(() => expect(screen.getByTestId('register-panel-ledger').textContent).toContain('Cash sales · 2€20.00'));
  const ledger = screen.getByTestId('register-panel-ledger').textContent;
  expect(ledger).toContain('Float€100.00');
  expect(ledger).toContain('Paid in · 1€5.00');
  expect(ledger).toContain('Paid out · 1−€7.00');
  expect(ledger).not.toContain('Cash refunds');
  expect(ledger).not.toContain('No sale');
  expect(screen.getByTestId('register-panel-expected').textContent).toBe('Expected in the drawer€118.00');
});

it('side: lists Other tenders with their count', async () => {
  await db.pos_orders.insert({
    id: 'card-sale', commandId: 'command-card-sale', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: 952, discountMinor: 0, taxMinor: 0,
    totalMinor: 952, customer: null, syncStatus: 'pending', sessionId, cashierRef: '7',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    payments: [{ id: 'card-payment-0', method: 'external', amountMinor: 952 }],
  });
  await renderSide();
  await waitFor(() => expect(screen.getByTestId('register-panel-other-tenders').textContent).toBe('Other tendersCard · 1€9.52'));
});

it('side: blind shows a dash in the hero and no ledger, session sales or Other tenders', async () => {
  await seedSideFixture();
  await db.pos_orders.insert({
    id: 'card-sale', commandId: 'command-card-sale', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: 952, discountMinor: 0, taxMinor: 0,
    totalMinor: 952, customer: null, syncStatus: 'pending', sessionId, cashierRef: '7',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    payments: [{ id: 'card-payment-0', method: 'external', amountMinor: 952 }],
  });
  await renderSide({ onPrintXReport: vi.fn() }, { blind: true });
  expect(screen.getByTestId('register-panel-hero').textContent).toBe('—in the drawer');
  expect(screen.queryByTestId('register-panel-ledger')).toBeNull();
  expect(screen.queryByTestId('register-panel-session-sales')).toBeNull();
  expect(screen.queryByTestId('register-panel-other-tenders')).toBeNull();
  expect(screen.getByTestId('register-panel').textContent).not.toContain('€');
  expect((screen.getByTestId('register-panel-print') as HTMLButtonElement).disabled).toBe(true);
});

it('side: Print X-report calls onPrintXReport, and a rejection says printing failed', async () => {
  const onPrintXReport = vi.fn(async () => {});
  await renderSide({ onPrintXReport });
  fireEvent.click(screen.getByTestId('register-panel-print'));
  await waitFor(() => expect(onPrintXReport).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId('register-panel-print-error')).toBeNull();
  cleanup();
  let reject: (error: Error) => void = () => {};
  const failing = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
  await renderSide({ onPrintXReport: failing });
  fireEvent.click(screen.getByTestId('register-panel-print'));
  await waitFor(() => expect((screen.getByTestId('register-panel-print') as HTMLButtonElement).disabled).toBe(true));
  await act(async () => reject(new Error('offline')));
  await waitFor(() => expect(screen.getByTestId('register-panel-print-error').textContent).toBe('Printing failed. Try again.'));
  expect((screen.getByTestId('register-panel-print') as HTMLButtonElement).disabled).toBe(false);
});

it('side: without onPrintXReport there is no Print X-report button', async () => {
  await renderSide();
  expect(screen.queryByTestId('register-panel-print')).toBeNull();
});

it('side: an overdue session keeps the plain Close register label, the hook giving no close time', async () => {
  let overdue = false;
  render(
    <RegisterHarness db={db} overrides={{ expectedCloseTime: '00:00' }}>
      {(register) => {
        overdue = register.overdue;
        return <RegisterPanel register={register} currency="EUR" open onOpenChange={() => {}} presentation="side" />;
      }}
    </RegisterHarness>,
  );
  await waitFor(() => expect(overdue).toBe(true));
  expect(screen.getByTestId('register-panel-close').textContent).toBe('Close register');
});

it('side: the header line holds the store, open since, the age and the opener', async () => {
  const [row] = await db.register_sessions.find({ selector: { id: sessionId } }).exec();
  const opened = new Date(row!.opened_at_gmt);
  const time = `${String(opened.getHours()).padStart(2, '0')}:${String(opened.getMinutes()).padStart(2, '0')}`;
  await renderSide({ storeName: 'Main Street', now: () => new Date(opened.getTime() + 75 * 60_000) });
  expect(screen.getByTestId('register-panel-title').textContent).toBe('Front');
  expect(screen.getByTestId('register-panel-description').textContent).toBe(`Main Street · open since ${time} · 1 h 15 m · Cashier`);
});

// `describeSession` alone: the age at the hour boundary, and a closed session's age to its close.
// Times are local wall-clock values, as the header shows them.
const at = (hours: number, minutes: number) => new Date(2026, 9, 20, hours, minutes);
const headerSession = (fields: Partial<RegisterSession>) =>
  ({ status: 'open', opened_at_gmt: at(9, 0).toISOString(), ...fields }) as RegisterSession;

it('side: an open session exactly 60 minutes old reads 1 h 0 m', () => {
  expect(describeSession(headerSession({}), undefined, at(10, 0))).toBe('open since 09:00 · 1 h 0 m · Cashier');
});

it('side: an open session 59 minutes old reads 59 m', () => {
  expect(describeSession(headerSession({}), undefined, at(9, 59))).toBe('open since 09:00 · 59 m · Cashier');
});

it('side: a closed session reads its close time and its age to the close, not to now', () => {
  const closed = headerSession({ status: 'closed', closed_at_gmt: at(10, 30).toISOString() });
  expect(describeSession(closed, undefined, at(15, 0))).toBe('closed 10:30 · 1 h 30 m · Cashier');
});

it('side: renders a right-hand sheet, its footer outside the scrolling body', async () => {
  contentClasses.length = 0;
  await renderSide({ onPrintXReport: vi.fn() });
  const sheet = contentClasses.at(-1) ?? '';
  expect(sheet).toContain('right-0');
  expect(sheet).toContain('h-full');
  expect(sheet).not.toContain('translate');
  const body = screen.getByTestId('register-panel-body');
  expect(body.contains(screen.getByTestId('register-panel-close'))).toBe(false);
  expect(screen.getByTestId('register-panel-footer').contains(screen.getByTestId('register-panel-print'))).toBe(true);
});

it('the default presentation renders no side-sheet hero', async () => {
  await seedSideFixture();
  await renderPanel();
  expect(screen.queryByTestId('register-panel-hero')).toBeNull();
  expect(screen.queryByTestId('register-panel-ledger')).toBeNull();
});
