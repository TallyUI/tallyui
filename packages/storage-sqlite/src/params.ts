/**
 * RxDB Premium's SQLite storage passes query params as
 * `(string | number | boolean)[]`, but SQLite itself has no boolean type.
 * Every `SQLiteBasics` implementation in this package binds params the same
 * way, so booleans become `0`/`1` here once instead of in each adapter.
 */
export function sqliteBoolParams(params: readonly (string | number | boolean)[]): (string | number)[] {
  return params.map((param) => (typeof param === 'boolean' ? Number(param) : param));
}
