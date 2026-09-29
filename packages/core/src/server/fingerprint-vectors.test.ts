// @vitest-environment node
import { expect, it } from 'vitest'
import { canonicalJson, commandFingerprint } from '@tallyui/core/server'
import vectors from './__fixtures__/fingerprint-vectors.json'

const envelopes = [
  vectors[0].envelope,
  { type: 'order.create', version: 1, payload: { z: 1, a: { d: [3, 1, 2], c: 'x' }, b: undefined, m: null } },
  { type: 'register.movement.record', version: 1, payload: { items: [1, undefined, 'é', -0.5], reason: 'café "quoted"' } },
]

vectors.forEach(({ name, canonical, fingerprint }, index) => {
  it(`pins the canonical bytes and SHA-256 for ${name}`, () => {
    const envelope = envelopes[index]
    expect(canonicalJson(envelope)).toBe(canonical)
    // Exercise the recorded register vector without widening the source's order-only signature.
    expect(commandFingerprint(envelope as Parameters<typeof commandFingerprint>[0])).toBe(fingerprint)
  })
})
