// @vitest-environment node
import { expect, it } from 'vitest'
import { payloadShapeErrors } from '@tallyui/core/server'
import { createOrderBuilder, finalizeOrder, toOrderCreateEnvelope } from '@tallyui/pos'

// What the till sends for a sale whose product name is longer than the shared 255-character bound:
// the server's shape check must never refuse a value the till itself produced.
it.each([1, 3])('an order the till builds from a sale with a 300-character product name passes payloadShapeErrors (capability %i)', orderCreate => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 190000 } })
  builder.addLine({ productId: 'p1', variantId: 'v1', name: `${'Long product name '.repeat(16)}${'x'.repeat(12)}`,
    sku: 'SKU1', unitPrice: { amount: 1000, currency: 'EUR' } })
  builder.addPayment({ method: 'cash', amountMinor: 2000 })
  builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' })
  const order = finalizeOrder(builder.getSnapshot(), { registerId: 'register_1', cashierRef: 'cashier_1', capabilities: { orderCreate } })
  expect(order.lines[0].name).toHaveLength(300)
  const { payload } = toOrderCreateEnvelope(order, 'device_1')
  expect(payloadShapeErrors(JSON.parse(JSON.stringify(payload)))).toEqual([])
  expect(payload.lines[0].title).toHaveLength(255)
})
