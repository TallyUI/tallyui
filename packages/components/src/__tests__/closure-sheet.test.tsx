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

async function closeWithCount(counted: number, otherTenders: Record<string, number> = {}) {
  const session = await seedSession(db, 10000);
  const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: counted, ...otherTenders } });
  return writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted,
    otherTenders, movements: [], orders: [], softwareVersion: '1.0.0',
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
  await waitFor(() => expect(screen.getByTestId('closure-title').textContent).toBe('Closure 1 written'));
  expect(screen.getByTestId('closure-counted-cash').textContent).toBe('Counted €63.30');
  expect(screen.getByTestId('closure-expected-cash').textContent).toBe('Expected €100.00');
  expect(screen.getByTestId('closure-variance-cash').textContent).toBe('−€36.70 short');
  expect(screen.getByTestId('closure-counted-external').textContent).toBe('Counted €22.00');
  fireEvent.click(screen.getByTestId('closure-done'));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('blind closure hides every figure, but still shows the closure number', async () => {
  await closeWithCount(6330);
  await renderClosure({ blind: true }, vi.fn());
  expect(screen.getByTestId('closure-title').textContent).toBe('Closure 1 written');
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
