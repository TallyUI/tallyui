// Ported from WCPOS `next` `3b5331b5c` `register-count.test.tsx` (ADR-032 amendment 1,
// register-screens-b; LEDGER 59, 60, 65, 67). Harness change: a real `useRegisterSession` over a
// real memory RxDB register (register-harness.tsx) instead of a mocked hook; money is minor
// units, denomination testIDs are keyed by minor-unit face value (`den-tile-2000`, not
// `den-tile-20`), and there is no i18n, ApproveSheet, printer or unsynced-count concept to mock.
//
// Not ported (5), each for the reason given:
// - 'shows short and exact with check': no `count-exact` checkmark icon in this design — only
//   the variance line's wording (covered by 'labels the amount field...' below).
// - 'blind cashier sees neither expected nor local manager line': this design keeps the approval
//   gate active while blind (dropping WCPOS's server-demanded `approval_required` would otherwise
//   leave a blind count with no gate at all over threshold) — see 'blind mode hides the variance
//   line but still refuses to close over threshold' below, and the BEHAVIOUR CHANGES note.
// - 'requires manager over threshold': WCPOS's ApproveSheet (a WooCommerce manager login) is
//   dropped, per the design, for the host's own gate; replaced below by 'refuses...without
//   approve' and 'calls approve...'.
// - 'server refusal requires approval even for an exact blind count': server-demanded approval
//   (`approval_required`) is registers job c2, out of scope here.
// - the `it.each` unsynced-sales pluralization: `unsyncedCount` is an outbox field
//   `useRegisterSession` itself never ported (no outbox yet); there is nothing to pluralize.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PosOrderPayment } from '@tallyui/pos';
import { APPROVAL_REQUIRED_TEXT, RegisterCount, type RegisterCountProps } from '../register/register-count';
import { createRegisterDb, RegisterHarness, seedSession, type RegisterDb } from './register-harness';

let db: RegisterDb;
beforeEach(async () => {
  db = await createRegisterDb();
});
afterEach(async () => {
  vi.useRealTimers();
  cleanup();
  await db.remove();
});

/** A hand-built captured sale, stamped to `sessionId`: only what `deriveExpected` reads. */
function sale(id: string, sessionId: string, payments: Omit<PosOrderPayment, 'id'>[]) {
  const total = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  return db.pos_orders.insert({
    id, commandId: `command-${id}`, createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: total, discountMinor: 0, taxMinor: 0,
    totalMinor: total, customer: null, syncStatus: 'pending', sessionId, cashierRef: '7',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    payments: payments.map((payment, i) => ({ ...payment, id: `${id}-payment-${i}` })),
  });
}

async function renderCounting(
  overrides?: Parameters<typeof RegisterHarness>[0]['overrides'],
  approve?: Parameters<typeof RegisterCount>[0]['approve'],
) {
  const session = await seedSession(db, 10000);
  const row = await db.register_sessions.findOne(session.id).exec();
  await row?.incrementalPatch({ status: 'counting' });
  render(
    <RegisterHarness db={db} overrides={overrides}>
      {(register) => <RegisterCount register={register} currency="EUR" approve={approve} />}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('register-count')).toBeTruthy());
  return session;
}
const enter = (value: string) => fireEvent.change(screen.getByTestId('count-amount'), { target: { value } });
const closeButton = () => screen.getByTestId('count-close') as HTMLButtonElement;

it('labels the amount field, and shows a live variance line against the expected float', async () => {
  await renderCounting();
  expect(screen.getByTestId('count-amount-label').textContent).toBe('Cash counted (€)');
  expect(screen.getByTestId('count-amount').getAttribute('aria-label')).toBe('Cash counted (€)');
  enter('63.30');
  expect(screen.getByTestId('count-variance').textContent).toBe('Expected €100.00 · €36.70 short');
  enter('100.00');
  expect(screen.getByTestId('count-variance').textContent).toContain('Exact');
});

it('counts two notes, clears their contribution on typing, and clears the tiles', async () => {
  // Unlike WCPOS's fold, this design's tiles are always visible (no 'count-denominations' toggle).
  await renderCounting();
  fireEvent.click(screen.getByTestId('den-tile-2000'));
  fireEvent.click(screen.getByTestId('den-tile-2000'));
  expect(screen.getByTestId('den-count-2000').textContent).toBe('2');
  expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('40.00');
  enter('7');
  expect(screen.getByTestId('den-count-2000').textContent).toBe('0');
  fireEvent.click(screen.getByTestId('den-tile-2000'));
  expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('20.00');
  fireEvent.click(screen.getByTestId('count-clear'));
  expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('0.00');
});

it('labels whole notes and coins without decimals, and a fraction as money (the Front desk, fix round)', async () => {
  await renderCounting();
  expect(screen.getByTestId('den-tile-2000').getAttribute('aria-label')).toBe('€20');
  expect(screen.getByTestId('den-tile-500').getAttribute('aria-label')).toBe('€5');
  expect(screen.getByTestId('den-tile-50').getAttribute('aria-label')).toBe('€0.50');
});

it('holds for ten, repeats, and does not also single tap', async () => {
  // Rendered here, not by renderCounting, to keep `rerender`. The tiles mount on an RxDB emission
  // during waitFor, outside act, so their passive effects can still be pending when waitFor
  // returns; react-native-web's Pressable registers with its responder system in one, and a
  // mouseDown before that is never granted (no long press). React flushes pending effects before
  // it renders again, so the rerender (in act) registers the tiles before the gesture.
  const session = await seedSession(db, 10000);
  await (await db.register_sessions.findOne(session.id).exec())?.incrementalPatch({ status: 'counting' });
  const ui = <RegisterHarness db={db}>{(register) => <RegisterCount register={register} currency="EUR" />}</RegisterHarness>;
  const { rerender } = render(ui);
  await waitFor(() => expect(screen.getByTestId('register-count')).toBeTruthy());
  rerender(ui);
  const tile = screen.getByTestId('den-tile-2000');
  vi.useFakeTimers();
  fireEvent.mouseDown(tile);
  act(() => vi.advanceTimersByTime(400));
  expect(screen.getByTestId('den-count-2000').textContent).toBe('10');
  act(() => vi.advanceTimersByTime(150));
  expect(screen.getByTestId('den-count-2000').textContent).toBe('20');
  fireEvent.mouseUp(tile);
  fireEvent.click(tile);
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByTestId('den-count-2000').textContent).toBe('20');
  vi.useRealTimers();
});

it('rejects blank, negative-shaped, exponent and overflow counts, keeping Close disabled', async () => {
  await renderCounting();
  expect(closeButton().disabled).toBe(true);
  for (const bad of ['', '-1', '1e2', '9'.repeat(400)]) {
    enter(bad);
    expect(closeButton().disabled).toBe(true);
  }
  enter('50');
  expect(closeButton().disabled).toBe(false);
});

it('keeps an entered other tender, and closes with both counted in minor units', async () => {
  const session = await renderCounting();
  await sale('order-1', session.id, [{ method: 'external', amountMinor: 2200 }]);
  await waitFor(() => expect(screen.getByTestId('count-tender-external')).toBeTruthy());
  expect(screen.getByTestId('count-tender-external-label').textContent).toBe('Card counted (€)');
  enter('100.00');
  fireEvent.change(screen.getByTestId('count-tender-external'), { target: { value: '22' } });
  expect(closeButton().disabled).toBe(false);
  fireEvent.click(closeButton());
  await waitFor(async () => {
    const [row] = await db.register_sessions.find({ selector: { status: 'closed' } }).exec();
    expect(row?.counted).toEqual({ cash: 10000, external: 2200 });
  });
});

it('blind mode hides the variance line but still refuses to close over threshold', async () => {
  await renderCounting({ blind: true, varianceThreshold: 500 });
  enter('1.00');
  expect(screen.queryByTestId('count-variance')).toBeNull();
  fireEvent.click(closeButton());
  expect(screen.getByTestId('count-manager-line').textContent).toContain('Manager approval needed');
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(await db.register_sessions.find({ selector: { status: 'closed' } }).exec()).toHaveLength(0);
});

it('refuses Close over the variance threshold with the exact copy, and does not close, without approve', async () => {
  await renderCounting({ varianceThreshold: 500 });
  enter('1.00');
  fireEvent.click(closeButton());
  expect(screen.getByTestId('count-manager-line').textContent).toBe(
    'Manager approval needed. Ask a manager to approve, or count again.',
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(await db.register_sessions.find({ selector: { status: 'closed' } }).exec()).toHaveLength(0);
});

it('calls approve over threshold and closes once it resolves, refusing when it resolves null', async () => {
  const approve = vi.fn(async () => null as { approvedBy: string } | null);
  await renderCounting({ varianceThreshold: 500 }, approve);
  enter('1.00');
  fireEvent.click(closeButton());
  await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('count-manager-line').textContent).toContain('not granted');
  expect(await db.register_sessions.find({ selector: { status: 'closed' } }).exec()).toHaveLength(0);
  await waitFor(() => expect(closeButton().disabled).toBe(false));
  approve.mockResolvedValueOnce({ approvedBy: 'manager-1' });
  fireEvent.click(closeButton());
  await waitFor(async () =>
    expect(await db.register_sessions.find({ selector: { status: 'closed' } }).exec()).toHaveLength(1),
  );
});

// approved-by: approve()'s approver reaches closeSession, and through it the Z.
it("passes approve()'s approvedBy and approvedByName to closeSession, and the Z carries them", async () => {
  const approve = vi.fn(async () => ({ approvedBy: 'mgr-1', approvedByName: 'Morgan Lee' }));
  const session = await renderCounting({ varianceThreshold: 500 }, approve);
  enter('1.00');
  fireEvent.click(closeButton());
  await waitFor(async () => expect(await db.closures.findOne(session.id).exec()).not.toBeNull());
  const closure = await db.closures.findOne(session.id).exec();
  expect(closure?.breakdowns).toMatchObject({ approved_by: 'mgr-1', approved_by_name: 'Morgan Lee' });
  expect((await db.register_sessions.findOne(session.id).exec())?.approved_by).toBe('mgr-1');
});

// approved-by: the hook gates too. Here the screen is handed no threshold, so only the hook's gate
// (threshold 500) stands between Close and the write, and its refusal shows the same copy.
it("shows the hook's RegisterApprovalRequiredError with the refusal copy, and does not close", async () => {
  const session = await seedSession(db, 10000);
  await (await db.register_sessions.findOne(session.id).exec())?.incrementalPatch({ status: 'counting' });
  render(
    <RegisterHarness db={db} overrides={{ varianceThreshold: 500 }}>
      {(register) => <RegisterCount register={{ ...register, varianceThreshold: undefined }} currency="EUR" />}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('register-count')).toBeTruthy());
  enter('1.00');
  fireEvent.click(closeButton());
  await waitFor(() =>
    expect(screen.getByTestId('count-manager-line').textContent).toBe(
      'Manager approval needed. Ask a manager to approve, or count again.',
    ),
  );
  expect(screen.queryByTestId('count-error')).toBeNull();
  expect(await db.register_sessions.find({ selector: { status: 'closed' } }).exec()).toHaveLength(0);
});

it('returns to selling without closing', async () => {
  const session = await renderCounting();
  fireEvent.click(screen.getByTestId('count-back'));
  await waitFor(async () => expect((await db.register_sessions.findOne(session.id).exec())?.status).toBe('open'));
  expect(await db.register_sessions.find({ selector: { status: 'closed' } }).exec()).toHaveLength(0);
});

it('shows RegisterTenderInProgressError as its own message on Close', async () => {
  await renderCounting({ tenderInProgress: true });
  enter('100.00');
  fireEvent.click(closeButton());
  await waitFor(() =>
    expect(screen.getByTestId('count-error').textContent).toBe('Finish or cancel the sale in progress first.'),
  );
  expect(await db.register_sessions.find({ selector: { status: 'closed' } }).exec()).toHaveLength(0);
});

// ADR-082: `approve` gets the count and returns the store's proof, which RegisterCount carries to
// `closeSession`. `closeSession` is spied, delegating to the hook's, so the real gate still runs.
type Register = RegisterCountProps['register'];
type CloseInput = Parameters<Register['actions']['closeSession']>[0];
let liveRegister: Register | undefined;
let countingId = '';
async function renderSpied(approve: RegisterCountProps['approve']) {
  const closeSession = vi.fn<(input: CloseInput) => void>();
  const session = await seedSession(db, 10000);
  countingId = session.id;
  await (await db.register_sessions.findOne(session.id).exec())?.incrementalPatch({ status: 'counting' });
  render(
    <RegisterHarness db={db} overrides={{ varianceThreshold: 500 }}>
      {(register) => {
        liveRegister = register;
        const actions = {
          ...register.actions,
          closeSession: (input: CloseInput) => {
            closeSession(input);
            return register.actions.closeSession(input);
          },
        };
        return <RegisterCount register={{ ...register, actions }} currency="EUR" approve={approve} />;
      }}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('register-count')).toBeTruthy());
  return { session, closeSession };
}
const closedRows = async () => (await db.register_sessions.find({ selector: { status: 'closed' } }).exec()).length;

it('closes as before for an old zero-argument approve', async () => {
  const oldShape: RegisterCountProps['approve'] = async () => ({ approvedBy: 'm1' });
  const { session, closeSession } = await renderSpied(oldShape);
  enter('1.00');
  fireEvent.click(closeButton());
  await waitFor(async () => expect(await db.closures.findOne(session.id).exec()).not.toBeNull());
  expect(closeSession).toHaveBeenCalledTimes(1);
  expect(closeSession.mock.calls[0]![0]).toStrictEqual({ counted: { cash: 100 }, approvedBy: 'm1', approvedByName: undefined });
  const row = await db.register_sessions.findOne(session.id).exec();
  expect(row?.approved_by).toBe('m1');
  expect(row?.approver_token ?? null).toBeNull();
});

it('calls approve with the count typed, cash and other tenders in minor units', async () => {
  const approve = vi.fn(async (_input: { counted: Record<string, number> }) => null);
  const { session } = await renderSpied(approve);
  await sale('order-1', session.id, [{ method: 'external', amountMinor: 2200 }]);
  await waitFor(() => expect(screen.getByTestId('count-tender-external')).toBeTruthy());
  enter('1.00');
  fireEvent.change(screen.getByTestId('count-tender-external'), { target: { value: '21.50' } });
  fireEvent.click(closeButton());
  await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
  expect(approve).toHaveBeenCalledWith({ counted: { cash: 100, external: 2150 } });
});

it("passes approve()'s approval and approvedVariance to closeSession, and the close lands", async () => {
  const granted: { approvedVariance?: Record<string, number> } = {};
  const approve = vi.fn(async ({ counted }: { counted: Record<string, number> }) => {
    granted.approvedVariance = await liveRegister!.actions.closureVariance(counted);
    return { approvedBy: 'mgr-1', approval: 'proof-1', approvedVariance: granted.approvedVariance };
  });
  const { session, closeSession } = await renderSpied(approve);
  enter('1.00');
  fireEvent.click(closeButton());
  await waitFor(async () => expect(await db.closures.findOne(session.id).exec()).not.toBeNull());
  expect(closeSession).toHaveBeenCalledTimes(1);
  expect(granted.approvedVariance).toBeDefined();
  expect(closeSession.mock.calls[0]![0]).toMatchObject({
    counted: { cash: 100 }, approvedBy: 'mgr-1', approval: 'proof-1', approvedVariance: granted.approvedVariance,
  });
  expect((await db.register_sessions.findOne(session.id).exec())?.approver_token).toBe('proof-1');
});

it('keeps the not-granted copy and never calls closeSession when approve resolves null', async () => {
  const { closeSession } = await renderSpied(async () => null);
  enter('1.00');
  fireEvent.click(closeButton());
  await waitFor(() =>
    expect(screen.getByTestId('count-manager-line').textContent).toBe('Approval was not granted. The count is unchanged.'),
  );
  await waitFor(() => expect(closeButton().disabled).toBe(false));
  expect(closeSession).not.toHaveBeenCalled();
  expect(await closedRows()).toBe(0);
});

// The count inputs stay editable while the host's approval is open: an approval for the old count
// must not close the register on it.
it('asks again, and does not close, when the count is edited while approve is pending', async () => {
  let grant: (value: { approvedBy: string }) => void = () => {};
  const approve = vi.fn(
    (_input: { counted: Record<string, number> }) =>
      new Promise<{ approvedBy: string } | null>((resolve) => {
        grant = resolve;
      }),
  );
  const { closeSession } = await renderSpied(approve);
  enter('1.00');
  fireEvent.click(closeButton());
  await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
  enter('2.00');
  await act(async () => grant({ approvedBy: 'mgr-1' }));
  await waitFor(() => expect(screen.getByTestId('count-manager-line').textContent).toBe(APPROVAL_REQUIRED_TEXT));
  await waitFor(() => expect(closeButton().disabled).toBe(false));
  expect(closeSession).not.toHaveBeenCalled();
  expect(await closedRows()).toBe(0);
  approve.mockResolvedValueOnce({ approvedBy: 'mgr-1' });
  fireEvent.click(closeButton());
  await waitFor(async () => expect(await closedRows()).toBe(1));
  expect(approve).toHaveBeenCalledTimes(2);
  expect(approve).toHaveBeenLastCalledWith({ counted: { cash: 200 } });
  expect(closeSession.mock.calls[0]![0].counted).toEqual({ cash: 200 });
});

// ADR-082 d5: a sale between the approval and the close moves the variance the proof is bound to;
// the hook's gate refuses, and the next Close asks again.
it("asks again when a sale lands after the approval's variance, which the hook's gate refuses", async () => {
  let asked = 0;
  const approve = vi.fn(async ({ counted }: { counted: Record<string, number> }) => {
    const approvedVariance = await liveRegister!.actions.closureVariance(counted);
    asked += 1;
    if (asked === 1) await sale('late-sale', countingId, [{ method: 'cash', amountMinor: 500 }]);
    return { approvedBy: 'mgr-1', approvedVariance };
  });
  await renderSpied(approve);
  enter('1.00');
  fireEvent.click(closeButton());
  await waitFor(() => expect(screen.getByTestId('count-manager-line').textContent).toBe(APPROVAL_REQUIRED_TEXT));
  await waitFor(() => expect(closeButton().disabled).toBe(false));
  expect(screen.queryByTestId('count-error')).toBeNull();
  expect(await closedRows()).toBe(0);
  fireEvent.click(closeButton());
  await waitFor(async () => expect(await closedRows()).toBe(1));
  expect(approve).toHaveBeenCalledTimes(2);
});
