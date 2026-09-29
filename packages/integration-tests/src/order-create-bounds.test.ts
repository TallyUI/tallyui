// @vitest-environment node
import { expect, it } from 'vitest'
import { fiscalFiguresErrors, payloadShapeErrors } from '@tallyui/core/server'
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

// A customer that reached the order unchecked (e.g. restored from a parked order) and a 300-character
// discount label: the envelope leaves the customer out and clamps the label, so both server checks pass.
it('an order with an out-of-bounds customer and a long discount label passes payloadShapeErrors and fiscalFiguresErrors', () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 190000 } })
  const line = builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'EUR' }, taxRates: [{ code: 'VAT', ratePpm: 190000 }] })
  builder.applyLineDiscount(line, { type: 'fixed', value: 100, label: 'l'.repeat(300) })
  builder.addPayment({ method: 'cash', amountMinor: 2000 })
  builder.setCustomer({ id: 'c\u00001', name: 'Customer', email: `${'a'.repeat(246)}@test.com` })
  const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 3 } })
  const payload = JSON.parse(JSON.stringify(toOrderCreateEnvelope(order, 'device_1').payload))
  expect(payloadShapeErrors(payload)).toEqual([])
  expect(fiscalFiguresErrors(payload)).toEqual([])
  expect(payload.customer).toBeNull()
  expect(payload.display.lines[0].discounts[0].label).toHaveLength(255)
})
