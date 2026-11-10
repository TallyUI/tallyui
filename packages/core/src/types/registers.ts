/**
 * A register (till) in the store's register directory (v2 parity A4). Platform-neutral: each connector maps its own
 * register model onto it. Money is integer minor units of the store's currency.
 */
export interface RegisterInfo {
  /** The platform's register id. */
  id: string;
  /** The register's display name, as the cashier picks it. */
  name: string;
  /** The cash the drawer should open with; absent when the store sets none. */
  defaultFloatMinor?: number;
  /** The largest cash variance at close that needs no manager approval; absent means no threshold. */
  varianceThresholdMinor?: number;
  /** When the register is due to close: a local store time, `HH:MM` on a 24-hour clock; absent when the store sets none. */
  expectedCloseTime?: string;
}
