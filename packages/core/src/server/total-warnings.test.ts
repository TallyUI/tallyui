// @vitest-environment node
import { expect, it } from 'vitest'
import { totalWarnings } from './total-warnings'

it('has no warning for equal totals', () => {
  expect(totalWarnings(1705, 1705)).toEqual([])
})

it.each([1704, 1706])('warns for server total %s', serverMinor => {
  expect(totalWarnings(1705, serverMinor)).toEqual([{ code: 'total_mismatch', expectedMinor: 1705, serverMinor }])
})
