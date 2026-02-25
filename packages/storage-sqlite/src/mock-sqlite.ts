/**
 * A simple in-memory mock of the expo-sqlite synchronous API.
 *
 * This does not parse SQL in a general way -- it handles only
 * the specific query patterns that RxStorageInstanceSQLite generates.
 * Supports json_extract(data, '$.field') for accessing document fields
 * stored as JSON in the `data` column.
 */
import type { SQLiteDatabase } from './types';

interface TableRow {
  [column: string]: any;
}

interface Table {
  columns: string[];
  rows: TableRow[];
}

export function createMockSQLiteDatabase(): SQLiteDatabase {
  const tables = new Map<string, Table>();

  function getTable(name: string): Table | undefined {
    return tables.get(name);
  }

  function ensureTable(name: string): Table {
    let table = tables.get(name);
    if (!table) {
      table = { columns: [], rows: [] };
      tables.set(name, table);
    }
    return table;
  }

  function extractTableName(sql: string): string {
    const match = sql.match(/(?:FROM|INTO|UPDATE|TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?)\s+"?([a-zA-Z0-9_]+)"?/i);
    if (match) return match[1];
    throw new Error(`Could not extract table name from SQL: ${sql}`);
  }

  /**
   * Resolve a value reference from a row.
   * Handles:
   *   - json_extract(data, '$.field.nested')  -> parse row.data JSON and access path
   *   - COUNT(*) as count                      -> special aggregate
   *   - plain column name                      -> row[col]
   */
  function resolveValue(row: TableRow, expr: string): any {
    const trimmed = expr.trim();

    // json_extract(data, '$.path')
    const jsonMatch = trimmed.match(/^json_extract\s*\(\s*(\w+)\s*,\s*'([^']+)'\s*\)$/i);
    if (jsonMatch) {
      const dataCol = jsonMatch[1];
      const jsonPath = jsonMatch[2]; // e.g., $.field or $._meta.lwt
      const raw = row[dataCol];
      if (typeof raw !== 'string') return undefined;
      try {
        const parsed = JSON.parse(raw);
        // Navigate the path: $.field.nested
        const pathParts = jsonPath.replace(/^\$\.?/, '').split('.');
        let value: any = parsed;
        for (const part of pathParts) {
          if (value === null || value === undefined) return undefined;
          value = value[part];
        }
        return value;
      } catch {
        return undefined;
      }
    }

    // Plain column name
    return row[trimmed];
  }

  function execSync(source: string): void {
    const trimmed = source.trim();

    if (/^CREATE TABLE/i.test(trimmed)) {
      const tableName = extractTableName(trimmed);
      const colMatch = trimmed.match(/\((.+)\)/s);
      if (colMatch) {
        const colDefs = colMatch[1].split(',').map((c) => c.trim());
        const columns = colDefs.map((def) => def.split(/\s+/)[0].replace(/"/g, ''));
        const table = ensureTable(tableName);
        table.columns = columns;
      }
      return;
    }

    if (/^DROP TABLE/i.test(trimmed)) {
      const tableName = extractTableName(trimmed);
      tables.delete(tableName);
      return;
    }

    throw new Error(`execSync: unsupported SQL: ${trimmed}`);
  }

  function getAllSync<T>(source: string, params: any[] = []): T[] {
    const trimmed = source.trim();

    // Handle COUNT queries
    const countMatch = trimmed.match(/^SELECT\s+COUNT\s*\(\s*\*\s*\)\s+as\s+(\w+)\s+FROM/i);
    if (countMatch) {
      const alias = countMatch[1];
      const tableName = extractTableName(trimmed);
      const table = getTable(tableName);
      if (!table) return [{ [alias]: 0 } as T];

      let rows = [...table.rows];
      const whereMatch = trimmed.match(/WHERE\s+(.+?)$/is);
      if (whereMatch) {
        rows = filterRowsWithParams(rows, whereMatch[1].trim(), params);
      }
      return [{ [alias]: rows.length } as T];
    }

    const tableName = extractTableName(trimmed);
    const table = getTable(tableName);
    if (!table) return [];

    // Determine which columns to select
    const selectMatch = trimmed.match(/^SELECT\s+(.+?)\s+FROM/i);
    let selectColumns: string[] | '*' = '*';
    if (selectMatch) {
      const cols = selectMatch[1].trim();
      if (cols !== '*') {
        selectColumns = cols.split(',').map((c) => c.trim());
      }
    }

    let rows = [...table.rows];

    // Parse WHERE clause
    const whereMatch = trimmed.match(/WHERE\s+(.+?)(?:\s+ORDER\s|\s+LIMIT\s|$)/is);
    if (whereMatch) {
      rows = filterRowsWithParams(rows, whereMatch[1].trim(), params);
    }

    // ORDER BY
    const orderMatch = trimmed.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT\s|$)/i);
    if (orderMatch) {
      rows = sortRows(rows, orderMatch[1].trim());
    }

    // LIMIT / OFFSET
    const limitMatch = trimmed.match(/LIMIT\s+(\?|-?\d+)/i);
    const offsetMatch = trimmed.match(/OFFSET\s+(\?|\d+)/i);
    if (limitMatch || offsetMatch) {
      let limitVal = Infinity;
      let offsetVal = 0;
      // Count WHERE params first to find LIMIT/OFFSET param positions
      const whereStr = whereMatch ? whereMatch[1] : '';
      const whereParamCount = (whereStr.match(/\?/g) || []).length;
      let extraIdx = whereParamCount;

      if (limitMatch) {
        if (limitMatch[1] === '?') {
          limitVal = params[extraIdx++];
        } else {
          limitVal = parseInt(limitMatch[1], 10);
          if (limitVal < 0) limitVal = Infinity; // LIMIT -1 means no limit
        }
      }
      if (offsetMatch) {
        if (offsetMatch[1] === '?') {
          offsetVal = params[extraIdx++];
        } else {
          offsetVal = parseInt(offsetMatch[1], 10);
        }
      }
      rows = rows.slice(offsetVal, offsetVal + limitVal);
    }

    // Project selected columns
    if (selectColumns === '*') {
      return rows as T[];
    }
    return rows.map((row) => {
      const result: any = {};
      for (const col of selectColumns as string[]) {
        result[col] = row[col];
      }
      return result;
    }) as T[];
  }

  function runSync(
    source: string,
    params: any[] = [],
  ): { changes: number; lastInsertRowId: number } {
    const trimmed = source.trim();

    // INSERT OR REPLACE
    if (/^INSERT/i.test(trimmed)) {
      const tableName = extractTableName(trimmed);
      const table = ensureTable(tableName);

      const colMatch = trimmed.match(/\)\s*\(([^)]+)\)\s*VALUES/i) || trimmed.match(/\(([^)]+)\)\s*VALUES/i);
      let columns: string[];
      if (colMatch) {
        columns = colMatch[1].split(',').map((c) => c.trim());
      } else {
        columns = table.columns;
      }

      const newRow: TableRow = {};
      for (let i = 0; i < columns.length; i++) {
        newRow[columns[i]] = params[i];
      }

      const idCol = columns[0];
      const existingIdx = table.rows.findIndex((r) => r[idCol] === newRow[idCol]);
      if (existingIdx >= 0) {
        table.rows[existingIdx] = newRow;
      } else {
        table.rows.push(newRow);
      }

      return { changes: 1, lastInsertRowId: table.rows.length };
    }

    // UPDATE
    if (/^UPDATE/i.test(trimmed)) {
      const tableName = extractTableName(trimmed);
      const table = getTable(tableName);
      if (!table) return { changes: 0, lastInsertRowId: 0 };

      const setMatch = trimmed.match(/SET\s+(.+?)\s+WHERE/i);
      if (!setMatch) throw new Error(`UPDATE without SET: ${trimmed}`);

      const setCols = setMatch[1].split(',').map((s) => s.trim().split(/\s*=\s*/)[0].trim());

      const whereMatch = trimmed.match(/WHERE\s+(.+)$/i);
      if (!whereMatch) throw new Error(`UPDATE without WHERE: ${trimmed}`);

      const setParams = params.slice(0, setCols.length);
      const whereParams = params.slice(setCols.length);

      let changes = 0;
      for (const row of table.rows) {
        if (evaluateWhere(row, whereMatch[1].trim(), whereParams)) {
          for (let i = 0; i < setCols.length; i++) {
            row[setCols[i]] = setParams[i];
          }
          changes++;
        }
      }

      return { changes, lastInsertRowId: 0 };
    }

    // DELETE
    if (/^DELETE/i.test(trimmed)) {
      const tableName = extractTableName(trimmed);
      const table = getTable(tableName);
      if (!table) return { changes: 0, lastInsertRowId: 0 };

      const whereMatch = trimmed.match(/WHERE\s+(.+)$/i);
      if (!whereMatch) {
        const changes = table.rows.length;
        table.rows = [];
        return { changes, lastInsertRowId: 0 };
      }

      const before = table.rows.length;
      table.rows = table.rows.filter((row) => !evaluateWhere(row, whereMatch[1].trim(), params));
      return { changes: before - table.rows.length, lastInsertRowId: 0 };
    }

    throw new Error(`runSync: unsupported SQL: ${trimmed}`);
  }

  // ------------------------------------------------------------------
  // WHERE evaluation
  // ------------------------------------------------------------------

  function filterRowsWithParams(rows: TableRow[], whereClause: string, params: any[]): TableRow[] {
    return rows.filter((row) => evaluateWhere(row, whereClause, params));
  }

  /**
   * Evaluate a WHERE clause for a single row.
   * Supports AND, OR, parentheses, json_extract, IN, NOT IN, and comparisons.
   */
  function evaluateWhere(row: TableRow, whereClause: string, params: any[]): boolean {
    // Tokenize and evaluate with proper parameter tracking
    const ctx = { params, idx: 0 };
    return evalExpr(row, whereClause.trim(), ctx);
  }

  interface ParamCtx {
    params: any[];
    idx: number;
  }

  function evalExpr(row: TableRow, expr: string, ctx: ParamCtx): boolean {
    // Strip outer parens if the entire expr is wrapped
    expr = stripOuterParens(expr);

    // Split on top-level OR
    const orParts = splitOnKeyword(expr, 'OR');
    if (orParts.length > 1) {
      // For OR, we need to save/restore param index for each branch
      // but since our queries typically use all params in sequence,
      // we evaluate left to right.
      // However, for proper OR handling with params, we evaluate each branch
      // independently and pick the first match.
      // In our case, the most common OR pattern is:
      //   (_meta_lwt > ?) OR (_meta_lwt = ? AND id > ?)
      // These consume params in sequence, so we save state and try.
      const savedIdx = ctx.idx;
      for (const part of orParts) {
        ctx.idx = savedIdx; // reset for each OR branch
        if (evalExpr(row, part.trim(), ctx)) {
          // Advance ctx.idx past all params for remaining branches
          // Actually for OR, we need to consume all params regardless.
          // Let's just compute the max idx.
          return true;
        }
      }
      // Need to advance past all OR params
      // Count total ?'s in the full expression
      const totalParams = (expr.match(/\?/g) || []).length;
      ctx.idx = savedIdx + totalParams;
      return false;
    }

    // Split on top-level AND
    const andParts = splitOnKeyword(expr, 'AND');
    if (andParts.length > 1) {
      for (const part of andParts) {
        if (!evalExpr(row, part.trim(), ctx)) {
          // Need to skip remaining params for failed AND branches
          // Count remaining ?'s
          const remaining = andParts.slice(andParts.indexOf(part) + 1).join(' ');
          const remainingParams = (remaining.match(/\?/g) || []).length;
          ctx.idx += remainingParams;
          return false;
        }
      }
      return true;
    }

    // Atomic condition
    return evalAtom(row, expr.trim(), ctx);
  }

  function evalAtom(row: TableRow, cond: string, ctx: ParamCtx): boolean {
    cond = stripOuterParens(cond).trim();

    // NOT IN: expr NOT IN (?, ?, ...)
    const notInMatch = cond.match(/^(.+?)\s+NOT\s+IN\s*\(([^)]+)\)/i);
    if (notInMatch) {
      const val = resolveExpr(row, notInMatch[1].trim());
      const placeholders = notInMatch[2].split(',');
      const values: any[] = [];
      for (const p of placeholders) {
        if (p.trim() === '?') {
          values.push(ctx.params[ctx.idx++]);
        } else {
          values.push(parseLiteral(p.trim()));
        }
      }
      return !values.includes(val);
    }

    // IN clause: expr IN (?, ?, ...)
    const inMatch = cond.match(/^(.+?)\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      const val = resolveExpr(row, inMatch[1].trim());
      const placeholders = inMatch[2].split(',');
      const values: any[] = [];
      for (const p of placeholders) {
        if (p.trim() === '?') {
          values.push(ctx.params[ctx.idx++]);
        } else {
          values.push(parseLiteral(p.trim()));
        }
      }
      return values.includes(val);
    }

    // LIKE: expr LIKE ?
    const likeMatch = cond.match(/^(.+?)\s+LIKE\s+(\?|'[^']*')/i);
    if (likeMatch) {
      const val = String(resolveExpr(row, likeMatch[1].trim()) ?? '');
      let pattern: string;
      if (likeMatch[2] === '?') {
        pattern = String(ctx.params[ctx.idx++]);
      } else {
        pattern = likeMatch[2].slice(1, -1);
      }
      return matchLike(val, pattern);
    }

    // Comparison: expr OP expr
    const compMatch = cond.match(/^(.+?)\s*(>=|<=|!=|>|<|=)\s*(.+)$/);
    if (compMatch) {
      const left = resolveExpr(row, compMatch[1].trim());
      const right = resolveExpr(row, compMatch[3].trim(), ctx);
      switch (compMatch[2]) {
        case '=': return left == right;
        case '!=': return left != right;
        case '>': return left > right;
        case '>=': return left >= right;
        case '<': return left < right;
        case '<=': return left <= right;
      }
    }

    // Unknown condition -- pass
    return true;
  }

  /**
   * Resolve an expression to a value.
   * Can be: json_extract(data, '$.field'), column name, ?, or literal.
   */
  function resolveExpr(row: TableRow, expr: string, ctx?: ParamCtx): any {
    const trimmed = expr.trim();

    if (trimmed === '?') {
      if (!ctx) throw new Error('Parameter ? without context');
      return ctx.params[ctx.idx++];
    }

    // json_extract(data, '$.path')
    const jsonMatch = trimmed.match(/^json_extract\s*\(\s*(\w+)\s*,\s*'([^']+)'\s*\)$/i);
    if (jsonMatch) {
      return resolveValue(row, trimmed);
    }

    // Numeric literal
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    // String literal
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1);
    }

    // Boolean-like: true/false
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    // Column name
    if (/^\w+$/.test(trimmed)) {
      return row[trimmed];
    }

    return trimmed;
  }

  function parseLiteral(s: string): any {
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
    return s;
  }

  function matchLike(value: string, pattern: string): boolean {
    // Convert SQL LIKE pattern to regex
    const regexStr = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, (m) => {
        if (m === '%') return '.*';
        if (m === '_') return '.';
        return '\\' + m;
      })
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    return new RegExp(`^${regexStr}$`, 'i').test(value);
  }

  function stripOuterParens(expr: string): string {
    const trimmed = expr.trim();
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      // Verify the parens actually wrap the whole expression
      let depth = 0;
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '(') depth++;
        if (trimmed[i] === ')') depth--;
        if (depth === 0 && i < trimmed.length - 1) {
          return trimmed; // parens don't wrap the whole thing
        }
      }
      return stripOuterParens(trimmed.slice(1, -1));
    }
    return trimmed;
  }

  /**
   * Split an expression on a keyword (AND/OR) at the top level only
   * (not within parentheses).
   */
  function splitOnKeyword(expr: string, keyword: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    const kw = ` ${keyword} `;
    const kwLen = kw.length;

    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === '(') depth++;
      if (expr[i] === ')') depth--;
      if (depth === 0 && i + kwLen <= expr.length) {
        const slice = expr.slice(i, i + kwLen);
        if (slice.toUpperCase() === kw.toUpperCase()) {
          parts.push(expr.slice(start, i).trim());
          start = i + kwLen;
          i += kwLen - 1;
        }
      }
    }
    parts.push(expr.slice(start).trim());
    return parts.filter(Boolean);
  }

  /**
   * Sort rows by an ORDER BY spec.
   * Handles both plain columns and json_extract expressions.
   */
  function sortRows(rows: TableRow[], orderSpec: string): TableRow[] {
    // Parse order parts, handling json_extract(data, '$.field') ASC/DESC
    const parts: { expr: string; desc: boolean }[] = [];
    // Split on commas that are not within parentheses
    let depth = 0;
    let current = '';
    for (const ch of orderSpec) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(parseOrderPart(current.trim()));
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) {
      parts.push(parseOrderPart(current.trim()));
    }

    return rows.sort((a, b) => {
      for (const { expr, desc } of parts) {
        const av = resolveValue(a, expr);
        const bv = resolveValue(b, expr);
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
      }
      return 0;
    });
  }

  function parseOrderPart(part: string): { expr: string; desc: boolean } {
    // Match trailing ASC/DESC
    const dirMatch = part.match(/\s+(ASC|DESC)\s*$/i);
    const desc = dirMatch ? dirMatch[1].toUpperCase() === 'DESC' : false;
    const expr = dirMatch ? part.slice(0, dirMatch.index).trim() : part;
    return { expr, desc };
  }

  return { execSync, getAllSync, runSync };
}
