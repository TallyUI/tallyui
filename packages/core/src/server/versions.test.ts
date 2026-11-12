// @vitest-environment node
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { OrderCreateEnvelope } from '../types'
import { SUPPORTED_ORDER_CREATE_VERSIONS } from './versions'

// The type check fails tsc when the envelope's version union grows; the runtime check fails when the constant drifts from it.
const ENVELOPE_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const satisfies readonly OrderCreateEnvelope['version'][]

describe('SUPPORTED_ORDER_CREATE_VERSIONS', () => {
  it('lists every order.create version the envelope type allows', () => {
    expectTypeOf<(typeof ENVELOPE_VERSIONS)[number]>().toEqualTypeOf<OrderCreateEnvelope['version']>()
    expect(SUPPORTED_ORDER_CREATE_VERSIONS).toEqual(ENVELOPE_VERSIONS)
  })

  it('lists versions once, in ascending order', () => {
    expect(SUPPORTED_ORDER_CREATE_VERSIONS).toEqual([...new Set(SUPPORTED_ORDER_CREATE_VERSIONS)].sort((a, b) => a - b))
  })
})
