import { expect, it } from 'vitest';
import { needsAdminReasonOf } from './needs-admin-reason';

it('reads a needs_admin retry reason', () => {
  expect(needsAdminReasonOf('needs_admin:session_closed')).toBe('session_closed');
});

it.each(['status_409', 'needs_admin:', 'needs_admin:Bad'])('does not read %s as a needs_admin reason', (reason) => {
  expect(needsAdminReasonOf(reason)).toBeUndefined();
});
