import type { CommandWarning } from '../types'

export type OrderRejectionCode =
  'unknown_variant' | 'invalid_quantity' | 'underpaid' | 'unsupported_currency'

export type Rejection = { code: OrderRejectionCode; message: string }

export function totalWarnings(expectedMinor: number, serverMinor: number): CommandWarning[] {
  return serverMinor === expectedMinor ? [] : [{ code: 'total_mismatch', expectedMinor, serverMinor }]
}
