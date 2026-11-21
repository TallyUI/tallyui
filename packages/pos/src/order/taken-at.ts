/** A stored takenAt must be an instant in toISOString() form (the Front desk's ruling on #1178); any other value is dropped. */
export function isTakenAt(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
