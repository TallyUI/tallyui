// Ported from WCPOS v2 packages/core/src/services/payment-drivers/types.ts (monorepo 5ac185b0).
import type { PaymentMethodDescriptor } from '@tallyui/core';
import type { PaymentTransport } from '../tender/tender-state';

export interface DriverCapabilities {
  /** `harness`: the till lists readers and connects; `sdk_ui`: the vendor SDK shows its own picker. */
  discovery: 'harness' | 'sdk_ui';
  /** `app`: the till can cancel a collection; `on_device`: only the reader can. */
  cancel: 'app' | 'on_device';
  refund: boolean;
}
export interface ReaderInfo {
  id: string;
  label: string;
  model?: string;
  serial?: string;
  battery?: number | null;
  transport: PaymentTransport;
}
export interface DriverStatus {
  connection: 'disconnected' | 'discovering' | 'connecting' | 'updating' | 'connected';
  reader: ReaderInfo | null;
  progress?: number | null;
  pairingCode?: string | null;
  message?: string | null;
}
export type DriverAvailability =
  | { available: true }
  | { available: false; reason: 'web' | 'permission' | 'bluetooth_off' | 'not_logged_in' | 'unsupported' };
export interface CollectInput {
  /** The payment leg's id; a driver may use it to make its provider reference. */
  legId: string;
  /** The leg's amount in minor units of `currency`. */
  amountMinor: number;
  /** ISO 4217 code. */
  currency: string;
  method: PaymentMethodDescriptor;
  transport: PaymentTransport;
  /** Provider data from the server (credentials, an intent), or null. */
  handoff: Record<string, unknown> | null;
  /** The amount a tip may be taken on, in minor units; null when the leg takes no tip. */
  tipEligibleMinor: number | null;
}
export type CollectOutcome = 'captured' | 'authorized' | 'declined' | 'cancelled';
export interface CollectResult {
  outcome: CollectOutcome;
  /** The provider's own references for the payment (opaque to the till). */
  providerRefs: Record<string, unknown>;
  /** Card details to print (brand, last four and so on). */
  receipt: Record<string, unknown>;
  /** What the reader charged in minor units, tip included; null when the driver cannot say. */
  amountMinor: number | null;
  transport: PaymentTransport;
  /** Why a leg was declined or cancelled; `'timed_out'` when the reader's own collect window ran out. */
  failureReason?: string | null;
}
export interface DriverStatusSource {
  subscribe(listener: (status: DriverStatus) => void): () => void;
  get(): DriverStatus;
}
export interface PaymentDriver {
  /** Matches a payment method's `capture.provider`. */
  readonly provider: string;
  readonly capabilities: DriverCapabilities;
  availability(): DriverAvailability;
  /** Scan for readers; `until` names a reader id the caller waits for, so a driver may stop early. */
  discoverReaders?(transport: PaymentTransport, options?: { until?: string }): Promise<ReaderInfo[]>;
  connect?(reader: ReaderInfo, handoff: Record<string, unknown> | null): Promise<void>;
  disconnect?(): Promise<void>;
  collect(input: CollectInput): Promise<CollectResult>;
  cancel?(): Promise<void>;
  status$: DriverStatusSource;
}
