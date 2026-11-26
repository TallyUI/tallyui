// @vitest-environment node
import { expect, it } from 'vitest'
import fixture from './__fixtures__/order-create-v3.json'
import { precheckCommand } from './batch'

const server = { orderCreate: [5], register: [1], orderUpdate: [1] }
const enabled = { ...server, chargeTaxMode: true }
const gate = 'amountIncludesTax requires the chargeTaxMode capability, which this server does not declare'
const refusal = (message: string) => ({ id: fixture.id, status: 'rejected', error: { code: 'invalid_payload', message } })

function create(pricesIncludeTax = false, amountIncludesTax: boolean | 'yes' = true, field: 'fees' | 'shipping' = 'fees', wrongRow = false, taxMinor = 200, residue = 0) {
  const { payload } = fixture, { display } = payload
  const netMinor = amountIncludesTax === false ? 800 : 1002 - taxMinor, grossMinor = netMinor + taxMinor
  const amountMinor = amountIncludesTax === false ? netMinor : grossMinor
  const id = field === 'fees' ? 'clientFeeId' : 'clientShippingId'
  const totals = { totalMinor: payload.totalMinor + grossMinor + residue, taxMinor: payload.taxMinor + taxMinor }
  return { ...fixture, type: 'order.create' as const, version: 5, payload: { ...payload, ...totals, pricesIncludeTax,
    lines: payload.lines.map((line, index) => ({ ...line, taxInclusive: index === 0, discountMinor: [169, 37][index] })), discountMinor: 206,
    [field]: [{ [id]: 'charge', name: 'Charge', taxStatus: 'taxable', amountMinor, amountIncludesTax, taxMinor }],
    taxByRate: [...payload.taxByRate, { ratePpm: taxMinor === 0 ? 0 : 250000, netMinor, taxMinor, grossMinor }],
    payments: payload.payments.map(payment => ({ ...payment, amountMinor: totals.totalMinor, tenderedMinor: payment.tenderedMinor + grossMinor + residue })),
    display: { ...display, ...totals, taxInclusive: pricesIncludeTax,
      ...(!pricesIncludeTax && { subtotalMinor: 3000, discountMinor: 206, orderDiscountMinor: 106,
        lines: display.lines.map((line, index) => ({ ...line, amountMinor: [2000, 1000][index],
          discounts: line.discounts.map(discount => ({ ...discount, amountMinor: 100 })) })) }),
      [field]: [{ [id]: 'charge', amountMinor: wrongRow ? amountMinor : (pricesIncludeTax ? grossMinor : netMinor) + residue }] } } }
}

it('C1 accepts a gross fee displayed net', () => {
  expect(precheckCommand(create(), enabled)).toBeUndefined()
})
it.each([{}, { chargeTaxMode: false }])('C2 refuses but preserves the fee mode with %j', flag => {
  const command = create()
  expect(precheckCommand(command, { ...server, ...flag })).toEqual(refusal(gate))
  expect(command.payload).toHaveProperty('fees[0].amountIncludesTax', true)
})
it('C3 accepts a net fee displayed gross', () => {
  expect(precheckCommand(create(true, false), enabled)).toBeUndefined()
})
it('C4 accepts gross shipping displayed net', () => {
  expect(precheckCommand(create(false, true, 'shipping'), enabled)).toBeUndefined()
})
it('C5 refuses the gross fee amount in a net display row', () => {
  expect(precheckCommand(create(false, true, 'fees', true), enabled)).toEqual(refusal(
    'display.fees[0].amountMinor: expected the payload.fees amountMinor converted to the display tax mode'))
})
it('C6 refuses a non-boolean fee mode', () => {
  expect(precheckCommand(create(false, 'yes'), enabled)).toEqual(refusal('fees[0].amountIncludesTax: expected a boolean'))
})
it('C7 accepts an explicitly net fee displayed net', () => {
  expect(precheckCommand(create(false, false), enabled)).toBeUndefined()
})
it('C8 gates the fee mode on the create part of an update', () => {
  const command = create()
  const update = { ...command, type: 'order.update' as const, version: 1,
    payload: { ...command.payload, orderId: 'order-1', createVersion: command.version } }
  expect(precheckCommand(update, server)).toEqual(refusal(gate))
  expect(precheckCommand(update, enabled)).toBeUndefined()
})
it('C9 accepts one cent of residue on a gross fee displayed net', () => {
  expect(precheckCommand(create(false, true, 'fees', false, 200, -1), enabled)).toBeUndefined()
})
it.each([
  ['C10 refuses two cents of residue on a converted taxed fee', 200, -2],
] as const)('%s', (_, taxMinor, residue) => {
  expect(precheckCommand(create(false, true, 'fees', false, taxMinor, residue), enabled)).toEqual(refusal(
    'display.fees[0].amountMinor: expected the payload.fees amountMinor converted to the display tax mode'))
})
it('C11 accepts one cent of residue on a converted fee with zero taxMinor', () => {
  expect(precheckCommand(create(false, true, 'fees', false, 0, -1), enabled)).toBeUndefined()
})
