// Ported from WCPOS `next` `3b5331b5c` `register-bar.helpers.test.ts` (ADR-032 amendment 1,
// register-screens-a). `describeRegisterBar`'s `bindingStatus`/`sessionsOn`/`storeName` become
// `describeRegisterBarPill`'s plain `registerId` (`null` means unbound) and `sessionsOn`; there
// is no `place`/store-name concern here (TallyUI drops the store-switch/multi-store display,
// LEDGER 48 covers the pill only), and the returned pill is plain English, not an i18n key
// (ADR-064's neutral-copy rule).
import { describe, expect, it } from 'vitest';
import { describeRegisterBarPill } from '../register/register-bar.helpers';

const base = { registerId: 'register' as string | null, online: true };

it('shows no pill for a bound, online, session-less-off register', () => {
  expect(describeRegisterBarPill(base)).toBeNull();
});
it('asks for a register', () => {
  expect(describeRegisterBarPill({ ...base, registerId: null })).toBe('Choose a register');
});
it('shows offline', () => {
  expect(describeRegisterBarPill({ ...base, online: false })).toBe('Offline');
});
it('prioritises choosing over offline', () => {
  expect(describeRegisterBarPill({ ...base, registerId: null, online: false })).toBe('Choose a register');
});
describe.each([
  [{ sessionsOn: true, sessionStatus: null }, 'Register closed'],
  [{ sessionsOn: true, sessionStatus: 'open' as const, overdue: true }, 'Overdue'],
  [{ sessionsOn: true, sessionStatus: 'counting' as const, overdue: true }, 'Counting'],
  [{ sessionsOn: true, sessionStatus: 'counting' as const, online: false }, 'Offline'],
  [
    { sessionsOn: true, sessionStatus: 'counting' as const, online: false, registerId: null },
    'Choose a register',
  ],
  [{ sessionsOn: false, sessionStatus: null }, null],
] as const)('session pill priority %j', (state, pill) => {
  it(`resolves to ${pill}`, () => {
    expect(describeRegisterBarPill({ ...base, ...state })).toBe(pill);
  });
});

it('shows approval needed on a refused counting session', () => {
  expect(
    describeRegisterBarPill({ ...base, sessionStatus: 'counting', approvalRequired: true }),
  ).toBe('Approval needed');
});
