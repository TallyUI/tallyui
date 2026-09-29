// @vitest-environment node
import { expect, it } from 'vitest'
import { canonicalJson, commandFingerprint } from '@tallyui/core/server'
import orderCreateV3Fixture from './__fixtures__/order-create-v3.json'
import vectors from './__fixtures__/fingerprint-vectors.json'

it("pins case 1's envelope to the order-create-v3 fixture, so a fixture change can't leave the vector behind", () => {
  const { type, version, payload } = orderCreateV3Fixture
  expect(vectors[0].envelope).toEqual({ type, version, payload })
})

const envelopes = [
  vectors[0].envelope,
  { type: 'order.create', version: 1, payload: { z: 1, a: { d: [3, 1, 2], c: 'x' }, b: undefined, m: null } },
  { type: 'register.movement.record', version: 1, payload: { items: [1, undefined, 'é', -0.5], reason: 'café "quoted"' } },
]

vectors.forEach(({ name, canonical, fingerprint }, index) => {
  it(`pins the canonical bytes and SHA-256 for ${name}`, () => {
    const envelope = envelopes[index]
    expect(canonicalJson(envelope)).toBe(canonical)
    expect(commandFingerprint(envelope)).toBe(fingerprint)
  })
})
