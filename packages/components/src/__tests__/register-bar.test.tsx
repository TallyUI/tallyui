// Ported from WCPOS `next` `3b5331b5c` `register-bar.test.tsx` (ADR-032 amendment 1,
// register-screens-a). Harness change: a typed stub of `useRegisterSession`'s return value (this
// bar's own props already carry `online`/`registerName`/`multiRegister`/`onOpenPanel`, so there
// is no WooCommerce store/credentials/theme context to mock).
//
// Not ported: 'opens the user sheet from the bar avatar', 'reopens the Add user consumer after
// this site returns from OAuth' — the user avatar, user sheet and OAuth-return rehosting are all
// dropped from this neutral port (design item 3).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { useRegisterSession } from '@tallyui/pos';
import { RegisterBar } from '../register/register-bar';

afterEach(() => cleanup());

const stub = (overrides: Partial<ReturnType<typeof useRegisterSession>> = {}) =>
  ({ session: null, overdue: false, enabled: false, lastClosure: null, ...overrides }) as unknown as ReturnType<
    typeof useRegisterSession
  >;

it('shows the register name only for multi-register stores', () => {
  const { rerender } = render(
    <RegisterBar register={stub()} registerId="r" online multiRegister registerName="Front" onOpenPanel={vi.fn()} />,
  );
  expect(screen.getByTestId('register-bar-name').textContent).toBe('Front');
  rerender(
    <RegisterBar register={stub()} registerId="r" online multiRegister={false} registerName="Front" onOpenPanel={vi.fn()} />,
  );
  expect(screen.queryByTestId('register-bar-name')).toBeNull();
});

// The Front desk review (2026-09-28): "Front counter" next to "Choose a register" contradicted
// the pill — with no register chosen, there's no name to show yet.
it('hides the register name when no register is chosen, even for multi-register stores', () => {
  render(
    <RegisterBar register={stub()} registerId={null} online multiRegister registerName="Front" onOpenPanel={vi.fn()} />,
  );
  expect(screen.queryByTestId('register-bar-name')).toBeNull();
  expect(screen.getByTestId('register-bar-pill').textContent).toBe('Choose a register');
});

it('shows the drawer only with a session or a last closure, and opens its panel', () => {
  const onOpenPanel = vi.fn();
  const { rerender } = render(
    <RegisterBar register={stub()} registerId="r" online multiRegister={false} onOpenPanel={onOpenPanel} />,
  );
  expect(screen.queryByTestId('register-bar-open-panel')).toBeNull();
  rerender(
    <RegisterBar
      register={stub({ session: { status: 'open' } as never })}
      registerId="r"
      online
      multiRegister={false}
      onOpenPanel={onOpenPanel}
    />,
  );
  fireEvent.click(screen.getByTestId('register-bar-open-panel'));
  expect(onOpenPanel).toHaveBeenCalledTimes(1);
});

it('shows the offline pill', () => {
  render(<RegisterBar register={stub()} registerId="r" online={false} multiRegister={false} onOpenPanel={vi.fn()} />);
  expect(screen.getByTestId('register-bar-pill').textContent).toBe('Offline');
});

it('shows the choose-a-register pill ahead of offline', () => {
  render(
    <RegisterBar register={stub()} registerId={null} online={false} multiRegister={false} onOpenPanel={vi.fn()} />,
  );
  expect(screen.getByTestId('register-bar-pill').textContent).toBe('Choose a register');
});

it('shows no pill once a register is chosen, online, with no session and sessions off', () => {
  render(<RegisterBar register={stub()} registerId="r" online multiRegister={false} onOpenPanel={vi.fn()} />);
  expect(screen.queryByTestId('register-bar-pill')).toBeNull();
});

// The Front desk review (2026-09-28): the pill opens the gate/picker or the panel when given onPressPill, otherwise it stays a plain badge.
it('makes the pill a button that calls onPressPill when given', () => {
  const onPressPill = vi.fn();
  render(
    <RegisterBar register={stub()} registerId={null} online={false} multiRegister={false} onOpenPanel={vi.fn()} onPressPill={onPressPill} />,
  );
  const pill = screen.getByTestId('register-bar-pill');
  expect(pill.getAttribute('role')).toBe('button');
  fireEvent.click(pill);
  expect(onPressPill).toHaveBeenCalledTimes(1);
});

it('leaves the pill a plain badge, not a button, when onPressPill is not given', () => {
  render(<RegisterBar register={stub()} registerId={null} online={false} multiRegister={false} onOpenPanel={vi.fn()} />);
  expect(screen.getByTestId('register-bar-pill').getAttribute('role')).not.toBe('button');
});
