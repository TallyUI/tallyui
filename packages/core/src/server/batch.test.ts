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
  // A server's own lists (#297); core's SUPPORTED_* constants are the till's capability.
  const server = { orderCreate: [1, 2, 3, 4], register: [1] }

  it('a server supporting [1, 2, 3] refuses a v4 order.create naming its own list, not core\'s', () => {
    const v4 = { ...fixture, version: 4, payload: { ...fixture.payload, lines: fixture.payload.lines.map((line, i) =>
      ({ ...line, discountMinor: [169, 37][i] })), discountMinor: 206 } }
    expect(precheckCommand(v4 as never, { orderCreate: [1, 2, 3], register: [1] })).toEqual({ id: fixture.id, status: 'rejected',
      error: { code: 'unsupported_version', message: 'order.create version 4 is not supported; this server supports 1, 2, 3',
        data: { orderCreate: 3 } } })
    expect(precheckCommand(v4 as never, { orderCreate: [1, 2, 3, 4], register: [1] })).toBeUndefined()
  })

  it('checks register versions against the server\'s own list', () => {
    const open = { ...command, id: 'register-1', type: 'register.session.open', version: 2, payload: { sessionId: 'session' } }
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

  it('a malformed v3 is left to the executor, whose shape check gives the v1/v2 message', () => {
    const payload = { clientOrderId: 'order_1', createdAt: command.createdAt, currency: 'EUR', pricesIncludeTax: true,
      lines: 'abc', payments: [], subtotalMinor: 0, taxMinor: 0, totalMinor: 0 }
    for (const version of [1, 2, 3]) {
      const fields = version === 2 ? { discountMinor: 1 } : version === 3 ? { display: {}, taxByRate: [] } : {}
      const envelope = { ...command, version, payload: { ...payload, ...fields } }
      expect(precheckCommand(envelope as never, server)).toBeUndefined()
      expect(payloadShapeErrors(envelope.payload)).toStrictEqual(['lines: expected a non-empty array'])
    }
  })

  it('does not require discountMinor for version 3', () => {
    const envelope = { ...command, version: 3 }
    expect(precheckCommand(envelope as never, server)).toBeUndefined()
    const errors = payloadShapeErrors(envelope.payload)
    expect(errors).toContainEqual(expect.stringContaining('clientOrderId: expected'))
    expect(errors.some(error => error.includes('requires discountMinor'))).toBe(false)
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

  const register = { ...command, id: 'register-1', type: 'register.session.open', payload: { sessionId: 'session' } }

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
