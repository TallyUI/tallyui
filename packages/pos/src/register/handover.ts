/**
 * What a cashier switch, a register switch or a sign-out leaves behind, and the hand-over slip (v2 parity A4, A12).
 * Port provenance: WCPOS v2 monorepo `main` 51e7c4351, `packages/core/src/screens/main/pos/cart/switch-confirm.tsx`
 * (the warnings it shows) and `services/register-session/use-session-report.ts:26-65` with
 * `closure-document.ts:206-273` (the slip is the open session's X report, marked as a hand-over, naming the cashier).
 */
import type { Cashier } from '@tallyui/core';
import type { OutboxHealth } from '../outbox/outbox-health';
import { buildXReportDocument, type ClosureContext } from './closure-document';
import type { RegisterSession } from './schemas';

export type SwitchKind = 'cashier' | 'register' | 'signOut';
export type SwitchWarning =
  | { code: 'unsentSales'; count: number }
  | { code: 'unsentTillUpdates'; count: number }
  | { code: 'parkedSales'; count: number }
  | { code: 'partlyPaidSale' }
  | { code: 'openSession' };
export interface SwitchWarningInput {
  kind: SwitchKind;
  /** `summarizeOutboxHealth`'s result (or `useOutboxHealth().health`). */
  outbox: Pick<OutboxHealth, 'sales' | 'tillUpdates'>;
  /** `useParkedSales(...).parked.length`. */
  parkedSales: number;
  /** Captured minor units on the sale in progress; 0 when nothing is paid. */
  paidMinor: number;
  /** The bound register's session status; `null` or absent when no session. */
  sessionStatus?: RegisterSession['status'] | null;
}
export interface SwitchWarnings {
  kind: SwitchKind;
  /** In this order: unsentSales, unsentTillUpdates, parkedSales, partlyPaidSale, openSession; only those that apply. */
  warnings: SwitchWarning[];
  /** `outbox.sales.pending`: the confirm wording reads it. */
  unsentSales: number;
  /** An `open` or `counting` session, for `register` and `signOut` only (a cashier switch keeps the drawer open by design). */
  sessionOpen: boolean;
}

/** What the switch would leave behind. Pure. */
export function switchWarnings({ kind, outbox, parkedSales, paidMinor, sessionStatus }: SwitchWarningInput): SwitchWarnings {
  const unsentSales = outbox.sales.pending;
  const sessionOpen = kind !== 'cashier' && (sessionStatus === 'open' || sessionStatus === 'counting');
  const warnings: SwitchWarning[] = [];
  if (unsentSales > 0) warnings.push({ code: 'unsentSales', count: unsentSales });
  if (outbox.tillUpdates.pending > 0) warnings.push({ code: 'unsentTillUpdates', count: outbox.tillUpdates.pending });
  if (parkedSales > 0) warnings.push({ code: 'parkedSales', count: parkedSales });
  if (paidMinor > 0) warnings.push({ code: 'partlyPaidSale' });
  if (sessionOpen) warnings.push({ code: 'openSession' });
  return { kind, warnings, unsentSales, sessionOpen };
}

export interface HandoverSlipInput {
  session: RegisterSession;
  /** The cashier handing over. */
  cashier: Pick<Cashier, 'name'>;
  registerName: string;
  /** Who opened the session; '' when unknown. */
  openedByName?: string;
  /** `useRegisterSession().salesCount`. */
  salesCount: number;
  /** `useRegisterSession().expected`, minor units per tender. */
  expected: Record<string, number>;
  /** `useRegisterSession().blind`: no expected figures on the slip. */
  blind: boolean;
  outbox: Pick<OutboxHealth, 'sales' | 'tillUpdates'>;
  context: ClosureContext;
}
type XReportDocument = ReturnType<typeof buildXReportDocument>;
export interface HandoverSlipData {
  registerName: string;
  cashierName: string;
  openedByName: string;
  /** `document.closure.opened_at.time`. */
  openedAtTime: string;
  salesCount: number;
  /** `null` while blind. */
  expected: Record<string, number> | null;
  unsentSales: number;
  unsentTillUpdates: number;
  /** The X-report envelope for the closure template and the print queue (`kind: 'report'`), marked as a hand-over. */
  document: XReportDocument & { fiscal: XReportDocument['fiscal'] & { document_type: 'handover'; is_handover: true } };
}

/** The hand-over slip's data and its printable envelope. Pure. */
export function handoverSlip({
  session, cashier, registerName, openedByName = '', salesCount, expected, blind, outbox, context,
}: HandoverSlipInput): HandoverSlipData {
  const doc = buildXReportDocument(session, {
    ...context,
    expected: blind ? {} : expected,
    breakdowns: {
      ...context.breakdowns, register_name: registerName, cashier_name: cashier.name, opened_by_name: openedByName,
      transaction_count: salesCount,
    },
  });
  return {
    registerName, cashierName: cashier.name, openedByName, openedAtTime: doc.closure.opened_at.time ?? '', salesCount,
    expected: blind ? null : expected,
    unsentSales: outbox.sales.pending, unsentTillUpdates: outbox.tillUpdates.pending,
    document: { ...doc, fiscal: { ...doc.fiscal, document_type: 'handover', is_handover: true } },
  };
}
