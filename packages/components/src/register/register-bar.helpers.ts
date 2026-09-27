/**
 * The register bar's status pill: one pill, one place. Port provenance (ADR-032 amendment 1):
 * WCPOS `next` `3b5331b5c` `register-bar.helpers.ts` (LEDGER 48).
 *
 * Neutral changes: WCPOS decides "choosing a register" from a WooCommerce binding status
 * (`bindingStatus: 'bound' | 'choose' | 'none' | 'unknown'`) and folds the store's display name
 * into `place`. TallyUI's binding is entirely the app's own (ADR-032 amendment 1's "Not ported"
 * note), so this takes the plain `registerId` the app already passes to `useRegisterSession`
 * (`null` means unbound) instead, and drops the store name — RegisterBar here shows only the
 * register name (`multiRegister` decides whether that's shown at all) and the status pill.
 * Copy is plain English (no i18n keys, ADR-064's neutral-copy rule).
 */

export type RegisterBarPill =
  | 'Choose a register'
  | 'Offline'
  | 'Approval needed'
  | 'Counting'
  | 'Overdue'
  | 'Register closed';

/**
 * Priority, matching WCPOS's ordering: choosing a register outranks everything (LEDGER 48);
 * then an unreachable store reads as offline, ahead of any session state; approval needed
 * outranks plain counting; an open, overdue session outranks a session-less "closed" pill.
 */
export function describeRegisterBarPill({
  registerId,
  online,
  sessionStatus,
  overdue = false,
  approvalRequired = false,
  sessionsOn = false,
}: {
  /** The register this till is bound to, or `null` when it isn't bound yet. */
  registerId: string | null;
  online: boolean;
  sessionStatus?: 'open' | 'counting' | 'closed' | null;
  overdue?: boolean;
  approvalRequired?: boolean;
  /** The store uses register sessions at all (`useRegisterSession`'s `enabled`). */
  sessionsOn?: boolean;
}): RegisterBarPill | null {
  if (registerId === null) return 'Choose a register';
  if (!online) return 'Offline';
  if (sessionStatus === 'counting' && !approvalRequired) return 'Counting';
  if (approvalRequired) return 'Approval needed';
  if (sessionStatus === 'open' && overdue) return 'Overdue';
  if (sessionsOn && !sessionStatus) return 'Register closed';
  return null;
}
