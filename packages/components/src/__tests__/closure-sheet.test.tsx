// Ported from WCPOS `next` `3b5331b5c` `closure-sheet.test.tsx` (ADR-032 amendment 1,
// register-screens-b; LEDGER 54, 62). Harness change: a real `useRegisterSession` over a real
// memory RxDB register instead of a mocked hook and `@wcpos/query`'s `useDocField`; money is
// minor units and per tender, not one decimal-string cash figure.
//
// Not ported (3), each for the reason given:
// - 'blind closure hides expected and variance': adapted below as 'blind closure hides every
//   figure, but still shows the closure number' — this design hides ALL figures while blind
//   (not just expected/variance), since TallyUI's closure lists every tender, not only cash; see
//   the BEHAVIOUR CHANGES note.
// - 'shows the minted number offline, prints and acknowledges the printed time': no offline/
//   printed-time state — replaced below by 'renders no print button without onPrint, and calls
//   onPrint, showing a busy state, when given one'.
// - 'updates the title to the server number once acknowledged': no server-number adoption
//   (registers c2); the local `number` never changes after the closure is written.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';
import { ClosureSheet } from '../register/closure-sheet';
import { createRegisterDb, RegisterHarness, seedSession, type RegisterDb } from './register-harness';
import { closeSession, writeClosure } from '@tallyui/pos';

let db: RegisterDb;
beforeEach(async () => {
  db = await createRegisterDb();
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await db.remove();
});

async function closeWithCount(
  counted: number,
  otherTenders: Record<string, number> = {},
  approval?: { approvedBy?: string; approvedByName?: string },
) {
  const session = await seedSession(db, 10000);
  const closed = await closeSession(db.register_sessions, session.id, {
    counted: { cash: counted, ...otherTenders }, approvedBy: approval?.approvedBy,
  });
  return writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted,
    otherTenders, movements: [], orders: [], softwareVersion: '1.0.0',
    labels: approval?.approvedByName
      ? { register_name: '', closed_by_name: '', approved_by_name: approval.approvedByName }
      : undefined,
  });
}

async function renderClosure(overrides?: Parameters<typeof RegisterHarness>[0]['overrides'], onPrint?: () => void | Promise<void>) {
  render(
    <RegisterHarness db={db} overrides={overrides}>
      {(register) => <ClosureSheet register={register} currency="EUR" onPrint={onPrint} onDone={() => {}} />}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('closure-sheet')).toBeTruthy());
}

it('shows the closure number, and figures and variance per tender, and dismisses with Done', async () => {
  await closeWithCount(6330, { external: 2200 });
  const onDone = vi.fn();
  render(
    <RegisterHarness db={db}>
      {(register) => <ClosureSheet register={register} currency="EUR" onDone={onDone} />}
    </RegisterHarness>,
  );
  await waitFor(() => expect(screen.getByTestId('closure-title').textContent).toBe('Register closed'));
  expect(screen.getByTestId('closure-number').textContent).toBe('Closure #1');
  expect(screen.getByTestId('closure-counted-cash').textContent).toBe('Counted €63.30');
  expect(screen.getByTestId('closure-expected-cash').textContent).toBe('Expected €100.00');
  expect(screen.getByTestId('closure-variance-cash').textContent).toBe('€36.70 short');
  expect(screen.getByTestId('closure-counted-external').textContent).toBe('Counted €22.00');
  fireEvent.click(screen.getByTestId('closure-done'));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('blind closure hides every figure, but still shows the closure number', async () => {
  await closeWithCount(6330);
  await renderClosure({ blind: true }, vi.fn());
  expect(screen.getByTestId('closure-title').textContent).toBe('Register closed');
  expect(screen.getByTestId('closure-number').textContent).toBe('Closure #1');
  expect(screen.queryByTestId('closure-figures')).toBeNull();
  expect(screen.queryByTestId('closure-print')).toBeNull();
});

it('renders no print button without onPrint, and calls onPrint, showing a busy state, when given one', async () => {
  await closeWithCount(10000);
  await renderClosure();
  expect(screen.queryByTestId('closure-print')).toBeNull();
  cleanup();
  let resolvePrint: () => void = () => {};
  const onPrint = vi.fn(() => new Promise<void>((resolve) => (resolvePrint = resolve)));
  await renderClosure(undefined, onPrint);
  fireEvent.click(screen.getByTestId('closure-print'));
  expect(screen.getByTestId('closure-print').textContent).toBe('Printing…');
  resolvePrint();
  await waitFor(() => expect(screen.getByTestId('closure-print').textContent).not.toBe('Printing…'));
  expect(onPrint).toHaveBeenCalledTimes(1);
});

it('shows a failed print as its own message', async () => {
  await closeWithCount(10000);
  const onPrint = vi.fn(async () => {
    throw new Error('Printer offline');
  });
  await renderClosure(undefined, onPrint);
  fireEvent.click(screen.getByTestId('closure-print'));
  await waitFor(() => expect(screen.getByTestId('closure-print-error').textContent).toBe('Printer offline'));
});

it('shows who approved the close, under the figures, blind or not', async () => {
  await closeWithCount(10000, {}, { approvedByName: 'Morgan Lee' });
  await renderClosure();
  const figures = screen.getByTestId('closure-figures');
  const approved = screen.getByTestId('closure-approved-by');
  const done = screen.getByTestId('closure-done');
  expect(approved.textContent).toBe('Approved by Morgan Lee');
  expect(figures.compareDocumentPosition(approved) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(approved.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  cleanup();
  // The blind variant: same closure, re-rendered blind — not a figure, so it still shows.
  await renderClosure({ blind: true });
  expect(screen.getByTestId('closure-approved-by').textContent).toBe('Approved by Morgan Lee');
});

it('falls back to the approver id without a name', async () => {
  await closeWithCount(10000, {}, { approvedBy: 'mgr-9' });
  await renderClosure();
  expect(screen.getByTestId('closure-approved-by').textContent).toBe('Approved by mgr-9');
});

it('shows no approved-by line without an approver', async () => {
  await closeWithCount(10000);
  await renderClosure();
  expect(screen.queryByTestId('closure-approved-by')).toBeNull();
});

it('renders nothing before any session has closed', async () => {
  render(
    <RegisterHarness db={db}>
      {(register) => <ClosureSheet register={register} currency="EUR" onDone={() => {}} />}
    </RegisterHarness>,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(screen.queryByTestId('closure-sheet')).toBeNull();
});

it('the completion checkmark appears at once under reduced motion', async () => {
  await closeWithCount(10000);
  await renderClosure();
  await waitFor(() => expect(screen.getByTestId('closure-check').style.opacity).toBe('1'));
});

it('the completion checkmark animates in when motion is not reduced', async () => {
  vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  await closeWithCount(10000);
  await renderClosure();
  await waitFor(() => expect(screen.getByTestId('closure-check').style.opacity).toBe('1'));
});
