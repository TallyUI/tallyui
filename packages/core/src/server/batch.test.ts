// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/order-create-v3.json'
import { precheckCommand, validateBatch } from './batch'
import { MAX_COMMANDS_PER_BATCH } from './index'
import { fiscalFiguresErrors } from './fiscal-figures'
import { payloadShapeErrors } from './order-payload-shape'

const command = {
  id: 'sale-1', type: 'order.create', version: 1, payload: {},
  createdAt: '2026-09-23T10:00:00Z', deviceId: 'register-1', attempt: 1,
}

describe('validateBatch', () => {
  it('accepts an order.update envelope (ADR-090)', () => {
    const commands = [{ ...command, type: 'order.update' }]
    expect(validateBatch({ commands })).toEqual({ ok: true, commands })
  })

  it('accepts an order.reopen envelope (ADR-090)', () => {
    const commands = [{ ...command, type: 'order.reopen' }]
    expect(validateBatch({ commands })).toEqual({ ok: true, commands })
  })

  it('accepts an order.refund envelope (ADR-080)', () => {
    const commands = [{ ...command, type: 'order.refund' }]
    expect(validateBatch({ commands })).toEqual({ ok: true, commands })
  })

  it('accepts a valid batch and leaves payload validation to the workflow', () => {
    expect(validateBatch({ commands: [command] })).toEqual({ ok: true, commands: [command] })
    expect(validateBatch({ commands: Array(50).fill(command) }).ok).toBe(true)
  })

  it('answers more than 50 commands with 413 batch_too_large (ADR-038, Front desk ruling 18)', () => {
    const message = 'At most 50 commands are allowed'
    expect(validateBatch({ commands: Array(51).fill(command) })).toEqual({
      ok: false, status: 413, message, body: { code: 'batch_too_large', maxCommands: 50, message },
    })
  })

  it('accepts exactly 50 commands, the limit', () => {
    expect(validateBatch({ commands: Array(50).fill(command) })).toEqual({ ok: true, commands: Array(50).fill(command) })
  })

  it('pins MAX_COMMANDS_PER_BATCH at 50', () => {
    expect(MAX_COMMANDS_PER_BATCH).toBe(50)
  })

  it.each([null, [], 'batch', 1, {}, { commands: {} }, { commands: [] }])('rejects invalid body %p', body => {
    expect(validateBatch(body)).toMatchObject({ ok: false, status: 400 })
  })

  it.each([
    ['id', ''], ['id', 'x'.repeat(65)], ['id', 1],
    ['type', 'order.cancel'], ['version', '2'],
    ['deviceId', undefined], ['createdAt', undefined],
    ['payload', null], ['payload', []], ['payload', 'sale'],
    ['attempt', 0], ['attempt', 1.5], ['attempt', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects invalid %s (%p), naming the index and field', (field, value) => {
    const result = validateBatch({ commands: [command, { ...command, [field as string]: value }] })
    expect(result).toEqual({ ok: false, status: 400, message: expect.stringContaining(`commands[1].${field}`) })
  })

  it('accepts version 2 (ADR-062)', () => {
    expect(validateBatch({ commands: [{ ...command, version: 2 }] })).toEqual({ ok: true, commands: [{ ...command, version: 2 }] })
  })

  it('accepts version 3', () => {
    expect(validateBatch({ commands: [{ ...command, version: 3 }] })).toEqual({ ok: true, commands: [{ ...command, version: 3 }] })
  })

  it("validateBatch accepts a positive integer version it doesn't support", () => {
    for (const version of [4, Number.MAX_SAFE_INTEGER]) {
      const commands = [{ ...command, version }]
      expect(validateBatch({ commands })).toEqual({ ok: true, commands })
    }
  })

  it.each([1.5, 0, -1, undefined, Number.MAX_SAFE_INTEGER + 1])('still rejects a non-integer or zero version with 400 (%p)', version => {
    expect(validateBatch({ commands: [{ ...command, version }] })).toEqual({
      ok: false, status: 400, message: 'Invalid commands[0].version',
    })
  })

  it('rejects a non-object envelope', () => {
    expect(validateBatch({ commands: [null] })).toEqual({
      ok: false, status: 400, message: expect.stringContaining('commands[0]'),
    })
  })
})

describe('precheckCommand', () => {
  const update = { ...command, type: 'order.update' as const, version: 1 as const,
    payload: { ...fixture.payload, orderId: 'order-1', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', createVersion: 9,
      lines: fixture.payload.lines.map((line, i) => ({ ...line, discountMinor: [169, 37][i], storeLineId: `line-${i}` })),
      discountMinor: 206, payments: fixture.payload.payments.map(payment => ({ ...payment, paymentId: 'payment-1' })) } }
  const updateServer = { orderCreate: [1, 6, 9], register: [1], orderUpdate: [1] }

  it.each([{}, { orderUpdate: [] }])('takes no updates without a listed version (%j)', capability => {
    expect(precheckCommand(update, { orderCreate: [9], register: [1], ...capability })).toEqual({
      id: command.id, status: 'rejected', error: { code: 'unsupported_version',
        message: 'order.update version 1 is not supported; this server takes no updates', data: { orderUpdate: 0 } },
    })
  })

  it('refuses an unsupported update version with data.orderUpdate', () => {
    expect(precheckCommand({ ...update, version: 2 }, updateServer)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'unsupported_version',
        message: 'order.update version 2 is not supported; this server supports 1', data: { orderUpdate: 1 } },
    })
  })

  it('refuses update-only errors before create-version errors', () => {
    expect(precheckCommand({ ...update, payload: { ...update.payload, orderId: '', createVersion: 8 } }, updateServer)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'invalid_payload',
        message: 'orderId: expected a non-empty string of at most 64 characters' },
    })
  })

  it('refuses an unsupported createVersion with data.orderCreate', () => {
    expect(precheckCommand({ ...update, payload: { ...update.payload, createVersion: 8 } }, updateServer)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'unsupported_version',
        message: 'order.create version 8 is not supported; this server supports 1, 6, 9', data: { orderCreate: 9 } },
    })
  })

  it('applies order.create version rules at createVersion', () => {
    expect(precheckCommand({ ...update, payload: { ...update.payload, createVersion: 6, note: 'Keep this note' } }, updateServer)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'invalid_payload', message: 'note requires version 7' },
    })
    // As order.create v1: the create part's shape is refused at every createVersion (#1344), as a backstop to the plugin's check.
    expect(precheckCommand({ ...update, payload: { orderId: 'order-1', createVersion: 1 } }, updateServer)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'invalid_payload', message: 'clientOrderId: expected a non-empty string; createdAt: expected a string; '
        + 'currency: expected a string; pricesIncludeTax: expected a boolean; lines: expected a non-empty array; payments: expected an array; '
        + 'subtotalMinor: expected a finite number; taxMinor: expected a finite number; totalMinor: expected a finite number' },
    })
    expect(precheckCommand({ ...update, payload: { ...update.payload, lines: undefined } }, updateServer)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'invalid_payload', message: 'lines: expected a non-empty array' },
    })
  })

  it('accepts a valid update', () => {
    expect(precheckCommand(update, updateServer)).toBeUndefined()
  })

  // A server's own lists (#297); core's SUPPORTED_* constants are the till's capability.
  const server = { orderCreate: [1, 2, 3, 4], register: [1] }
  // Valid payloads per refund, reopen and register command type (#1346); register ones as in register-fixtures.test.ts.
  const sessionId = 'session-1'
  const validRefund = { clientRefundId: 'refund-1', orderId: 'order-1', registerId: 'register-1', sessionId,
    lines: [{ orderLineId: 'line-1', quantity: 1, restock: true }], shippingMinor: 0, adjustmentMinor: 0, totalMinor: 100,
    destination: 'original_method', reason: 'Returned item', createdAt: '2026-01-01T08:00:00.000Z' }
  const validReopen = { orderId: 'order-1', cashierRef: 'cashier-1', registerId: 'register-1', createdAt: '2026-01-01T08:00:00.000Z' }
  const validRegister: Record<string, Record<string, unknown>> = {
    'register.session.open': { sessionId, registerId: 'register-1', openedAt: '2026-09-11T08:00:00.000Z', countedFloatMinor: 9950 },
    'register.session.transition': { sessionId, status: 'counting', at: '2026-09-11T16:45:00.000Z' },
    'register.movement.record': { movementId: 'movement-1', sessionId, type: 'paid_out', amountMinor: 1250,
      reason: 'Milk for the coffee machine', createdAt: '2026-09-11T10:15:00.000Z' },
    'register.movement.void': { movementId: 'movement-2', sessionId, voids: 'movement-1', createdAt: '2026-09-11T10:20:00.000Z' },
    'register.closure.submit': { closureId: 'closure-1', sessionId, registerId: 'register-1', number: 42,
      openedAt: '2026-09-11T08:00:00.000Z', closedAt: '2026-09-11T17:00:00.000Z', tillExpected: { cash: 18000 }, counted: { cash: 17800 },
      periodSalesTotalMinor: 25000, periodRefundsTotalMinor: 5000, perpetualSalesTotalMinor: 525000, perpetualRefundsTotalMinor: 25000,
      unsyncedCount: 0, unsyncedTotalMinor: 0, softwareVersion: 'preview', orderIds: [], movementIds: [] },
  }
  // [type, required field dropped, valid payload, the shape function's message for it]
  const otherCommands: [string, string, Record<string, unknown>, string][] = [
    ['order.refund', 'reason', validRefund, 'reason: expected a non-empty string after trim of at most 500 characters'],
    ['order.reopen', 'orderId', validReopen, 'orderId: expected a non-empty string of at most 64 characters'],
    ['register.session.open', 'registerId', validRegister['register.session.open'], 'registerId: expected a non-empty string'],
    ['register.session.transition', 'at', validRegister['register.session.transition'], 'at: expected a non-empty string'],
    ['register.movement.record', 'reason', validRegister['register.movement.record'],
      'reason: expected a non-empty string after trim of at most 500 characters'],
    ['register.movement.void', 'voids', validRegister['register.movement.void'], 'voids: expected a non-empty string'],
    ['register.closure.submit', 'closureId', validRegister['register.closure.submit'], 'closureId: expected a non-empty string'],
  ]
  const allVersions = { ...server, orderRefund: [1], orderReopen: [1] }
  const without = (payload: Record<string, unknown>, field: string) => Object.fromEntries(Object.entries(payload).filter(([key]) => key !== field))

  it.each(otherCommands)('accepts a valid %s at a supported version (#1346)', (type, _field, payload) => {
    expect(precheckCommand({ ...command, type, payload } as never, allVersions)).toBeUndefined()
  })

  it.each(otherCommands)('refuses a %s missing %s with the shape check\'s message (#1346)', (type, field, payload, message) => {
    expect(precheckCommand({ ...command, type, payload: without(payload, field) } as never, allVersions)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'invalid_payload', message },
    })
  })

  it.each(otherCommands)('answers an unsupported %s missing %s with unsupported_version first (#1346)', (type, field, payload) => {
    const result = precheckCommand({ ...command, type, version: 3, payload: without(payload, field) } as never, allVersions)
    expect(result?.error?.code).toBe('unsupported_version')
  })

  it.each(otherCommands)('still refuses a %s missing %s at a supported version 2 (#1346)', (type, field, payload, message) => {
    const twos = { ...server, register: [1, 2], orderRefund: [1, 2], orderReopen: [1, 2] }
    expect(precheckCommand({ ...command, type, version: 2, payload } as never, twos)).toBeUndefined()
    expect(precheckCommand({ ...command, type, version: 2, payload: without(payload, field) } as never, twos)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'invalid_payload', message },
    })
  })

  it('refuses a refund with more than 10 errors naming the first 10, joined with "; " (#1346)', () => {
    const payload = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`extra${i}`, true]))
    expect(precheckCommand({ ...command, type: 'order.refund', payload } as never, allVersions)).toEqual({
      id: command.id, status: 'rejected', error: { code: 'invalid_payload', message: 'extra0: unknown field for order.refund version 1; '
        + 'extra1: unknown field for order.refund version 1; extra2: unknown field for order.refund version 1; '
        + 'extra3: unknown field for order.refund version 1; extra4: unknown field for order.refund version 1; '
        + 'extra5: unknown field for order.refund version 1; extra6: unknown field for order.refund version 1; '
        + 'extra7: unknown field for order.refund version 1; extra8: unknown field for order.refund version 1; '
        + 'extra9: unknown field for order.refund version 1' },
    })
  })

  it('accepts a register payload with an extra unknown key (#1346)', () => {
    const payload = { ...validRegister['register.session.open'], futureField: true }
    expect(precheckCommand({ ...command, type: 'register.session.open', payload } as never, allVersions)).toBeUndefined()
  })

  it('accepts a valid order.reopen at a supported version (ADR-090)', () => {
    expect(precheckCommand({ ...command, type: 'order.reopen', payload: validReopen }, { ...server, orderReopen: [1] })).toBeUndefined()
  })

  it('refuses an unsupported order.reopen version with the server capability', () => {
    expect(precheckCommand({ ...command, type: 'order.reopen', version: 2 }, { ...server, orderReopen: [1] }))
      .toEqual({ id: command.id, status: 'rejected', error: {
        code: 'unsupported_version', message: 'order.reopen version 2 is not supported; this server supports 1',
        data: { orderReopen: 1 },
      } })
  })

  it('names the highest reopen version a server lists', () => {
    expect(precheckCommand({ ...command, type: 'order.reopen', version: 3 }, { ...server, orderReopen: [1, 2] }))
      .toEqual({ id: command.id, status: 'rejected', error: {
        code: 'unsupported_version', message: 'order.reopen version 3 is not supported; this server supports 1, 2',
        data: { orderReopen: 2 },
      } })
  })

  it.each([{}, { orderReopen: [] }])('takes no reopens when the reopen list is absent or empty (%j)', capability => {
    expect(precheckCommand({ ...command, type: 'order.reopen' }, { ...server, ...capability }))
      .toEqual({ id: command.id, status: 'rejected', error: {
        code: 'unsupported_version', message: 'order.reopen version 1 is not supported; this server takes no reopens',
        data: { orderReopen: 0 },
      } })
  })

  it('accepts a valid order.refund at a supported version (ADR-080)', () => {
    expect(precheckCommand({ ...command, type: 'order.refund', payload: validRefund }, { ...server, orderRefund: [1] })).toBeUndefined()
  })

  it('refuses an unsupported order.refund version with the server capability', () => {
    expect(precheckCommand({ ...command, type: 'order.refund', version: 2 }, { ...server, orderRefund: [1] }))
      .toEqual({ id: command.id, status: 'rejected', error: {
        code: 'unsupported_version', message: 'order.refund version 2 is not supported; this server supports 1',
        data: { orderRefund: 1 },
      } })
  })

  it('names the highest refund version a server lists', () => {
    expect(precheckCommand({ ...command, type: 'order.refund', version: 3 }, { ...server, orderRefund: [1, 2] }))
      .toEqual({ id: command.id, status: 'rejected', error: {
        code: 'unsupported_version', message: 'order.refund version 3 is not supported; this server supports 1, 2',
        data: { orderRefund: 2 },
      } })
  })

  it.each([{}, { orderRefund: [] }])('takes no refunds when the refund list is absent or empty (%j)', capability => {
    expect(precheckCommand({ ...command, type: 'order.refund' }, { ...server, ...capability }))
      .toEqual({ id: command.id, status: 'rejected', error: {
        code: 'unsupported_version', message: 'order.refund version 1 is not supported; this server takes no refunds',
        data: { orderRefund: 0 },
      } })
  })

  it('a server supporting [1, 2, 3] refuses a v4 order.create naming its own list, not core\'s', () => {
    const v4 = { ...fixture, version: 4, payload: { ...fixture.payload, lines: fixture.payload.lines.map((line, i) =>
      ({ ...line, discountMinor: [169, 37][i] })), discountMinor: 206 } }
    expect(precheckCommand(v4 as never, { orderCreate: [1, 2, 3], register: [1] })).toEqual({ id: fixture.id, status: 'rejected',
      error: { code: 'unsupported_version', message: 'order.create version 4 is not supported; this server supports 1, 2, 3',
        data: { orderCreate: 3 } } })
    expect(precheckCommand(v4 as never, { orderCreate: [1, 2, 3, 4], register: [1] })).toBeUndefined()
  })

  it('checks register versions against the server\'s own list', () => {
    const open = { ...command, id: 'register-1', type: 'register.session.open', version: 2, payload: validRegister['register.session.open'] }
    expect(precheckCommand(open as never, { orderCreate: [1], register: [1, 2] })).toBeUndefined()
    expect(precheckCommand({ ...open, version: 1 } as never, { orderCreate: [1], register: [2] })).toMatchObject({
      error: { code: 'unsupported_version', message: 'register version 1 is not supported; this server supports 2', data: { register: 2 } },
    })
  })

  it('throws on an empty supported list rather than sending Math.max() of nothing', () => {
    expect(() => precheckCommand(command as never, { orderCreate: [], register: [1] }))
      .toThrow(new TypeError('precheckCommand: supported.orderCreate must list at least one version'))
    expect(() => precheckCommand(command as never, { orderCreate: [1], register: [] }))
      .toThrow(new TypeError('precheckCommand: supported.register must list at least one version'))
  })

  it('rejects an unsupported version before any payload rule or ledger claim', () => {
    expect(precheckCommand({ ...command, version: 5, payload: { display: {} } } as never, server)).toEqual({
      id: command.id, status: 'rejected', error: {
        code: 'unsupported_version', message: 'order.create version 5 is not supported; this server supports 1, 2, 3, 4',
        data: { orderCreate: 4 },
      },
    })
  })

  it('accepts version 4 (#286) with version 3 fields, and the shape check keeps the discount equality', () => {
    // The golden v3 at version 4: its inclusive line's 203 is 169 net (the till's figure, pos command.test.ts).
    const lines = fixture.payload.lines.map((line, i) => ({ ...line, discountMinor: [169, 37][i] }))
    const v4 = { ...fixture, version: 4, payload: { ...fixture.payload, lines, discountMinor: 206 } }
    expect(precheckCommand(v4 as never, server)).toBeUndefined()
    expect(payloadShapeErrors(v4.payload)).toStrictEqual([])
    expect(fiscalFiguresErrors(v4.payload as never)).toStrictEqual([])
    expect(payloadShapeErrors({ ...v4.payload, discountMinor: 240 })).toStrictEqual(['discountMinor: expected the sum of lines[].discountMinor'])
  })

  it('refuses a malformed payload at versions 1 to 4 with the shape check\'s message (#1344)', () => {
    const payload = { clientOrderId: 'order_1', createdAt: command.createdAt, currency: 'EUR', pricesIncludeTax: true,
      lines: 'abc', payments: [], subtotalMinor: 0, taxMinor: 0, totalMinor: 0 }
    for (const version of [1, 2, 3, 4]) {
      const fields = version === 2 ? { discountMinor: 1 } : version >= 3 ? { display: {}, taxByRate: [] } : {}
      const envelope = { ...command, version, payload: { ...payload, ...fields } }
      expect(precheckCommand(envelope as never, server)).toEqual({ id: command.id, status: 'rejected', error: {
        code: 'invalid_payload', message: 'lines: expected a non-empty array',
      } })
    }
  })

  // Valid payloads per order.create version (#1344): v2 is v1 with its discount, v3 the golden fixture, v4 the golden v4.
  const v1Payload = { clientOrderId: 'order_1', createdAt: command.createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ clientLineId: 'l1', variantId: 'v1', title: 'Tea', quantity: 1, unitPriceMinor: 1000 }],
    payments: [{ clientPaymentId: 'p1', method: 'cash', amountMinor: 1100, tenderedMinor: 2000, changeMinor: 900 }],
    subtotalMinor: 1000, taxMinor: 100, totalMinor: 1100, customer: null }
  const goldenV4 = { ...fixture.payload, lines: fixture.payload.lines.map((line, i) => ({ ...line, discountMinor: [169, 37][i] })), discountMinor: 206 }
  const validPayloads: [number, Record<string, unknown>][] = [
    [1, v1Payload],
    [2, { ...v1Payload, lines: [{ ...v1Payload.lines[0], discountMinor: 100 }], discountMinor: 100, subtotalMinor: 900, taxMinor: 90,
      totalMinor: 990, payments: [{ ...v1Payload.payments[0], amountMinor: 990, changeMinor: 1010 }] }],
    [3, fixture.payload],
    [4, goldenV4],
  ]
  const asCreate = (version: number, payload: Record<string, unknown>) => ({ ...command, version, payload })
  const asUpdate = (version: number, payload: Record<string, unknown>) =>
    ({ ...command, type: 'order.update', version: 1, payload: { ...payload, orderId: 'order-1', createVersion: version } })
  const both = validPayloads.flatMap(([version, payload]) => [['order.create', version, payload, asCreate] as const,
    ['order.update', version, payload, asUpdate] as const])
  const updateCapable = { ...server, orderUpdate: [1] }
  const taxOffByOne = (payload: Record<string, unknown>) => {
    const broken = structuredClone(payload) as typeof fixture.payload
    broken.taxByRate[0].taxMinor += 1
    return broken as Record<string, unknown>
  }

  it('does not require discountMinor for version 3', () => {
    const display = { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 1000, discountMinor: 0, taxMinor: 100,
      totalMinor: 1100, orderDiscountMinor: 0, lines: [{ clientLineId: 'l1', amountMinor: 1000, discounts: [] }] }
    const taxByRate = [{ ratePpm: 100000, netMinor: 1000, taxMinor: 100, grossMinor: 1100 }]
    expect(precheckCommand(asCreate(3, { ...v1Payload, display, taxByRate }) as never, server)).toBeUndefined()
  })

  it.each(both)('accepts a valid %s at create version %i', (_type, version, payload, build) => {
    expect(precheckCommand(build(version, payload) as never, updateCapable)).toBeUndefined()
  })

  it.each(both)('refuses an %s at create version %i with a shape error, with the shape check\'s messages', (_type, version, payload, build) => {
    const broken = { ...payload, totalMinor: 'x' }
    expect(precheckCommand(build(version, broken) as never, updateCapable)).toEqual({ id: command.id, status: 'rejected', error: {
      code: 'invalid_payload', message: payloadShapeErrors(broken).join('; '),
    } })
  })

  it.each([[3, fixture.payload], [4, goldenV4]] as const)('refuses a version %i with a taxByRate figure off by one, with the fiscal messages', (version, payload) => {
    const broken = taxOffByOne(payload)
    expect(payloadShapeErrors(broken)).toStrictEqual([])
    expect(precheckCommand(asCreate(version, broken) as never, server)).toEqual({ id: command.id, status: 'rejected', error: {
      code: 'invalid_payload', message: fiscalFiguresErrors(broken as never).join('; '),
    } })
  })

  it.each([[3, fixture.payload], [4, goldenV4]] as const)('refuses a version %i with a shape and a fiscal error with the shape message only', (version, payload) => {
    const broken = { ...taxOffByOne(payload), totalMinor: 'x' }
    expect(precheckCommand(asCreate(version, broken) as never, server)).toEqual({ id: command.id, status: 'rejected', error: {
      code: 'invalid_payload', message: payloadShapeErrors(broken).join('; '),
    } })
  })

  it.each([
    [1, { display: {} }, 'display and taxByRate require version 3'],
    [2, { display: {}, discountMinor: 1 }, 'display and taxByRate require version 3'],
    [2, { taxByRate: [], discountMinor: 1 }, 'display and taxByRate require version 3'],
    [3, { display: {} }, 'display and taxByRate must both be present or both absent'],
    [3, { taxByRate: [] }, 'display and taxByRate must both be present or both absent'],
    [4, { display: {} }, 'display and taxByRate must both be present or both absent'],
    [1, { sessionId: 'session' }, 'sessionId requires version 3'],
    [2, { sessionId: 'session', discountMinor: 1 }, 'sessionId requires version 3'],
    [1, { customer: { customerId: 'customer' } }, 'customerId requires version 3'],
    [2, { customer: { customerId: 'customer' }, discountMinor: 1 }, 'customerId requires version 3'],
  ])('rejects version %s fields %j before touching the container', (version, payload, message) => {
    expect(precheckCommand({ ...command, version, payload } as never, server)).toEqual({ id: command.id, status: 'rejected', error: {
      code: 'invalid_payload', message,
    } })
  })

  it('rejects a version 2 command without a discount before touching the container', () => {
    expect(precheckCommand({ ...command, id: 'sale-2', version: 2 } as never, server)).toEqual({ id: 'sale-2', status: 'rejected', error: {
      code: 'invalid_payload', message: 'version 2 requires discountMinor',
    } })
  })

  it.each([
    ['on a line', { lines: [{ clientLineId: 'line_1' }, { clientLineId: 'line_2', discountMinor: 100 }] }],
    ['on the payload', { lines: [{ clientLineId: 'line_1' }], discountMinor: 100 }],
  ])('rejects a version 1 command carrying discountMinor %s before touching the container', (_where, payload) => {
    expect(precheckCommand({ ...command, id: 'sale-1', payload } as never, server)).toEqual({ id: 'sale-1', status: 'rejected', error: {
      code: 'invalid_payload', message: 'discountMinor requires version 2',
    } })
  })

  const register = { ...command, id: 'register-1', type: 'register.session.open', payload: validRegister['register.session.open'] }

  it('rejects a register command with an unsupported version', () => {
    expect(precheckCommand({ ...register, version: 2 } as never, server)).toEqual({ id: 'register-1', status: 'rejected', error: {
      code: 'unsupported_version', message: 'register version 2 is not supported; this server supports 1',
      data: { register: 1 },
    } })
  })

  it('leaves a supported register command to the executor', () => {
    expect(precheckCommand(register as never, server)).toBeUndefined()
  })

  it('rejects a well-shaped v3 whose fiscal figures are wrong, with at most 10 messages', () => {
    const envelope = structuredClone(fixture)
    envelope.payload.taxByRate[0].taxMinor += 1
    expect(payloadShapeErrors(envelope.payload)).toStrictEqual([])
    const result = precheckCommand(envelope as never, server)
    expect(result).toEqual({ id: fixture.id, status: 'rejected', error: { code: 'invalid_payload', message:
      'taxByRate: expected the sum of taxMinor to equal payload.taxMinor; taxByRate[0].grossMinor: expected netMinor + taxMinor',
    } })
    expect(result?.error?.message.split('; ').length).toBeLessThanOrEqual(10)
  })

  const valid = { clientOrderId: 'order_1', createdAt: command.createdAt, currency: 'EUR', pricesIncludeTax: true,
    lines: [{ clientLineId: 'line_1', variantId: 'variant_1', title: 'Coffee', quantity: 1, unitPriceMinor: 1000 }],
    subtotalMinor: 1000, taxMinor: 0, totalMinor: 1000, payments: [{ clientPaymentId: 'payment_1', method: 'cash', amountMinor: 1000 }] }
  const titled = (title: string) => ({ ...command, payload: { ...valid, lines: [{ ...valid.lines[0], title }] } })

  it('rejects an otherwise valid v1 order.create with a 256-character title as invalid_payload naming lines[0].title', () => {
    expect(precheckCommand(titled('x'.repeat(255)) as never, server)).toBeUndefined()
    expect(precheckCommand(titled('x'.repeat(256)) as never, server)).toEqual({ id: command.id, status: 'rejected', error: {
      code: 'invalid_payload', message: 'lines[0].title: expected at most 255 characters',
    } })
  })

  it('a handler in the documented order (shape, replay lookup, precheckCommand) replays an applied 300-character title as duplicate', () => {
    const applied = new Map([[command.id, { id: command.id, status: 'duplicate' as const }]])
    const handle = (envelope: ReturnType<typeof titled>) => payloadShapeErrors(envelope.payload).length ? 'invalid_shape'
      : applied.get(envelope.id) ?? precheckCommand(envelope as never, server)
    expect(handle(titled('x'.repeat(300)))).toEqual({ id: command.id, status: 'duplicate' })
    expect(handle({ ...titled('x'.repeat(300)), id: 'sale-new' })).toMatchObject({ status: 'rejected', error: { code: 'invalid_payload' } })
  })

  it('caps the message at the first 10 fiscal-figure errors when more than 10 fields are invalid', () => {
    const envelope = structuredClone(fixture)
    const { display, taxByRate } = envelope.payload
    // Break 12 independent money fields (more than the 10 `fiscalFiguresErrors` itself keeps),
    // so the batch message is provably the first 10 in traversal order, not just under 10 of them.
    display.subtotalMinor = NaN
    display.discountMinor = NaN
    display.taxMinor = NaN
    display.totalMinor = NaN
    display.orderDiscountMinor = NaN
    display.lines[0].amountMinor = NaN
    display.lines[0].discounts[0].amountMinor = NaN
    display.lines[1].amountMinor = NaN
    taxByRate[0].netMinor = NaN
    taxByRate[0].taxMinor = NaN
    taxByRate[0].grossMinor = NaN
    taxByRate[1].netMinor = NaN
    expect(payloadShapeErrors(envelope.payload)).toStrictEqual([])
    const fullErrors = fiscalFiguresErrors(envelope.payload as never)
    const result = precheckCommand(envelope as never, server)
    expect(result).toEqual({ id: fixture.id, status: 'rejected', error: { code: 'invalid_payload',
      message: fullErrors.slice(0, 10).join('; '),
    } })
    expect(fullErrors).toHaveLength(10)
  })
})
