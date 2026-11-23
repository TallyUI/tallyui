import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RefundNeedsAdminNotice } from '../order/refund-needs-admin-notice';

afterEach(() => {
  expect(document.body.textContent).not.toMatch(/fail/i);
  cleanup();
});

it('shows the Not paid line for session_closed in a polite live region', () => {
  render(<RefundNeedsAdminNotice reason="session_closed" />);
  const line = screen.getByTestId('refund-needs-admin-line');
  expect(line.textContent).toBe('Not paid. This refund needs a manager to finish it in the store admin.');
  expect(line.getAttribute('aria-live')).toBe('polite');
});

it.each(['compensation_failed', 'made_up_reason'])('shows the neutral line for %s', (reason) => {
  render(<RefundNeedsAdminNotice reason={reason} />);
  expect(screen.getByTestId('refund-needs-admin-line').textContent)
    .toBe('Not finished. A manager must check this refund in the store admin before any money is handed over.');
  expect(document.body.textContent).not.toContain('Not paid');
});

it('cuts a 600-character message to 500', () => {
  render(<RefundNeedsAdminNotice reason="session_closed" message={'m'.repeat(600)} />);
  expect(screen.getByTestId('refund-needs-admin-message').textContent).toBe('m'.repeat(500));
});

it('shows markup as plain text, without a link', () => {
  const message = '<b>x</b><a href="https://e.test">y</a>';
  const { container } = render(<RefundNeedsAdminNotice reason="session_closed" message={message} />);
  expect(screen.getByTestId('refund-needs-admin-message').textContent).toBe(message);
  expect(container.querySelector('a')).toBeNull();
});

it('hides an empty message and the button without a callback; Check again calls the callback once', () => {
  const { rerender } = render(<RefundNeedsAdminNotice reason="session_closed" message="" />);
  expect(screen.queryByTestId('refund-needs-admin-message')).toBeNull();
  expect(screen.queryByTestId('refund-needs-admin-check-again')).toBeNull();
  const onCheckAgain = vi.fn();
  rerender(<RefundNeedsAdminNotice reason="session_closed" onCheckAgain={onCheckAgain} />);
  expect(screen.getByTestId('refund-needs-admin-check-again').textContent).toBe('Check again');
  fireEvent.click(screen.getByTestId('refund-needs-admin-check-again'));
  expect(onCheckAgain).toHaveBeenCalledTimes(1);
});
