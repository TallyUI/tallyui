import { expect, it } from 'vitest';
import { refundNeedsAdminLine } from './needs-admin-line';

it('says Not paid only when the session is closed', () => {
  expect(refundNeedsAdminLine('session_closed')).toBe('Not paid. This refund needs a manager to finish it in the store admin.');
});

it.each(['compensation_failed', 'made_up_reason'])('uses the neutral line for %s', (reason) => {
  const line = refundNeedsAdminLine(reason);
  expect(line).toBe('Not finished. A manager must check this refund in the store admin before any money is handed over.');
  expect(line).not.toContain('Not paid');
});
