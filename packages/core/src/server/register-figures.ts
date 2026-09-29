/**
 * A session's expected figures per method: the counted float in cash, plus each order's payments, plus paid_in
 * and minus paid_out movements that are not voided. The plugin chooses which orders count (for Medusa: completed,
 * archived and cancelled POS orders, so a received sale stays counted after an admin archives or cancels it) and
 * passes each order's recorded POS payments; this function only sums.
 */
export function deriveSessionFigures(input: {
  countedFloatMinor: number
  orders: { payments: { method: string; amountMinor: number }[] }[]
  movements: { id: string; type: 'paid_in' | 'paid_out' | 'no_sale' | 'void'; amountMinor: number; voids: string | null }[]
}): { expected: Record<string, number>; salesCount: number } {
  const expected: Record<string, number> = Object.assign(Object.create(null), { cash: input.countedFloatMinor })
  // tally_payments is order metadata an admin could edit, and a malformed row must never make register commands transient.
  for (const order of input.orders) {
    if (!Array.isArray(order.payments)) continue
    for (const payment of order.payments) {
      if (typeof payment?.method !== 'string' || !payment.method.length || !Number.isSafeInteger(payment.amountMinor)) continue
      expected[payment.method] = (expected[payment.method] ?? 0) + payment.amountMinor
    }
  }
  const voided = new Set(input.movements.filter(row => row.type === 'void').map(row => row.voids))
  for (const row of input.movements) {
    if (row.type === 'void' || voided.has(row.id)) continue
    if (row.type === 'paid_in') expected.cash += row.amountMinor
    if (row.type === 'paid_out') expected.cash -= row.amountMinor
  }
  return { expected: { ...expected }, salesCount: input.orders.length }
}

export function deriveVariance(counted: Record<string, number>, expected: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counted).map(([key, value]) => [key, value - (expected[key] ?? 0)]))
}
