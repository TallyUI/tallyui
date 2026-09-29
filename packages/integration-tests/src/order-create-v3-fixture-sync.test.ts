// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('keeps the core and POS order.create v3 golden fixtures byte-identical', () => {
  const core = readFileSync(new URL('../../core/src/server/__fixtures__/order-create-v3.json', import.meta.url))
  const pos = readFileSync(new URL('../../pos/src/pos-order/__fixtures__/order-create-v3.json', import.meta.url))
  expect(core.equals(pos)).toBe(true)
})
