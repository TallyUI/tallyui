/** A plain object: `{}` or `Object.create(null)`, never an array, a class instance or null. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

/** The validators' shared error list: at most 10 `<field>: expected <what>` lines, in the order checked. */
export function shapeErrors() {
  const errors: string[] = []
  const check = (valid: boolean, field: string, expected: string) => {
    if (!valid && errors.length < 10) errors.push(`${field}: expected ${expected}`)
  }
  const noNul = (value: unknown, field: string) => {
    if (typeof value === 'string') check(!value.includes('\u0000'), field, 'no NUL character')
  }
  return { errors, check, noNul }
}
