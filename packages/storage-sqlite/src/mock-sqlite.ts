/**
 * A simple in-memory mock of the expo-sqlite synchronous API.
 *
 * This does not parse SQL in a general way -- it handles only
 * the specific query patterns that RxStorageInstanceSQLite generates.
 * Good enough for unit and integration tests.
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

  /**
   * Extract a quoted table name from SQL.
   * Handles "tableName" and plain tableName.
   */
  function extractTableName(sql: string): string {
    // Match "tableName" or tableName after FROM/INTO/UPDATE/TABLE
    const match = sql.match(/(?:FROM|INTO|UPDATE|TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?)\s+"?([a-zA-Z0-9_]+)"?/i);
    if (match) return match[1];
    throw new Error(`Could not extract table name from SQL: ${sql}`);
  }

  function execSync(source: string): void {
    const trimmed = source.trim();

    // CREATE TABLE
    if (/^CREATE TABLE/i.test(trimmed)) {
      const tableName = extractTableName(trimmed);
      // Parse columns from the parenthesized section
      const colMatch = trimmed.match(/\((.+)\)/s);
      if (colMatch) {
        const colDefs = colMatch[1].split(',').map((c) => c.trim());
        const columns = colDefs.map((def) => {
          const name = def.split(/\s+/)[0].replace(/"/g, '');
          return name;
        });
        const table = ensureTable(tableName);
        table.columns = columns;
      }
      return;
    }

    // DROP TABLE
    if (/^DROP TABLE/i.test(trimmed)) {
      const tableName = extractTableName(trimmed);
      tables.delete(tableName);
      return;
    }

    throw new Error(`execSync: unsupported SQL: ${trimmed}`);
  }

  function getAllSync<T>(source: string, params: any[] = []): T[] {
    const trimmed = source.trim();
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

    // Start with all rows
    let rows = [...table.rows];

    // Parse WHERE clause
    const whereMatch = trimmed.match(/WHERE\s+(.+?)(?:\s+ORDER\s|\s+LIMIT\s|$)/is);
    if (whereMatch) {
      const whereClause = whereMatch[1].trim();
      rows = filterRows(rows, whereClause, params);
    }

    // ORDER BY
    const orderMatch = trimmed.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT\s|$)/i);
    if (orderMatch) {
      const orderSpec = orderMatch[1].trim();
      rows = sortRows(rows, orderSpec);
    }

    // LIMIT
    const limitMatch = trimmed.match(/LIMIT\s+(\?|\d+)/i);
    if (limitMatch) {
      let limitVal: number;
      if (limitMatch[1] === '?') {
        // Find the param index for LIMIT -- it's the last parameter
        limitVal = params[params.length - 1];
      } else {
        limitVal = parseInt(limitMatch[1], 10);
      }
      rows = rows.slice(0, limitVal);
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

      // Parse column names from INSERT INTO "table" (col1, col2, ...)
      const colMatch = trimmed.match(/\)\s*\(([^)]+)\)\s*VALUES/i) || trimmed.match(/\(([^)]+)\)\s*VALUES/i);
      let columns: string[];
      if (colMatch) {
        columns = colMatch[1].split(',').map((c) => c.trim());
      } else {
        columns = table.columns;
      }

      // Build the row from params
      const newRow: TableRow = {};
      for (let i = 0; i < columns.length; i++) {
        newRow[columns[i]] = params[i];
      }

      // For INSERT OR REPLACE, remove existing row with same id
      const idCol = columns[0]; // assume first column is the primary key
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

      // Parse SET clause: SET col1 = ?, col2 = ?, ...
      const setMatch = trimmed.match(/SET\s+(.+?)\s+WHERE/i);
      if (!setMatch) throw new Error(`UPDATE without SET: ${trimmed}`);

      const setCols = setMatch[1].split(',').map((s) => {
        const parts = s.trim().split(/\s*=\s*/);
        return parts[0].trim();
      });

      // Parse WHERE clause
      const whereMatch = trimmed.match(/WHERE\s+(.+)$/i);
      if (!whereMatch) throw new Error(`UPDATE without WHERE: ${trimmed}`);

      // Params: first N are SET values, remaining are WHERE values
      const setParams = params.slice(0, setCols.length);
      const whereParams = params.slice(setCols.length);

      let changes = 0;
      for (const row of table.rows) {
        if (matchesWhereSimple(row, whereMatch[1].trim(), whereParams)) {
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
      table.rows = table.rows.filter(
        (row) => !matchesWhereSimple(row, whereMatch[1].trim(), params),
      );
      return { changes: before - table.rows.length, lastInsertRowId: 0 };
    }

    throw new Error(`runSync: unsupported SQL: ${trimmed}`);
  }

  /**
   * Filter rows based on a WHERE clause string and params.
   * Handles:
   *  - id IN (?, ?, ?)
   *  - _deleted = 0
   *  - compound conditions with AND
   *  - OR groups in parentheses: (cond1) OR (cond2)
   *  - comparison operators: >, >=, <, <=, =, !=
   */
  function filterRows(rows: TableRow[], whereClause: string, params: any[]): TableRow[] {
    let paramIdx = 0;

    function evaluateCondition(row: TableRow, condition: string): boolean {
      const cond = condition.trim();

      // IN clause: column IN (?, ?, ?)
      const inMatch = cond.match(/^(\w+)\s+IN\s*\(([^)]+)\)/i);
      if (inMatch) {
        const col = inMatch[1];
        const placeholderCount = inMatch[2].split(',').length;
        const values = params.slice(paramIdx, paramIdx + placeholderCount);
        // Don't advance paramIdx here -- it's handled in the outer loop
        return values.includes(row[col]);
      }

      // Simple comparison: column OP value
      const compMatch = cond.match(/^(\w+)\s*(>=|<=|!=|>|<|=)\s*(\?|\d+(?:\.\d+)?)/i);
      if (compMatch) {
        const col = compMatch[1];
        const op = compMatch[2];
        let val: any;
        if (compMatch[3] === '?') {
          val = params[paramIdx];
          // Don't advance -- handled externally
        } else {
          val = parseFloat(compMatch[3]);
        }
        const rowVal = row[col];
        switch (op) {
          case '=': return rowVal == val;
          case '!=': return rowVal != val;
          case '>': return rowVal > val;
          case '>=': return rowVal >= val;
          case '<': return rowVal < val;
          case '<=': return rowVal <= val;
        }
      }

      return true; // unknown conditions pass
    }

    // For the actual filtering, we need to handle parameter indexing properly.
    // Re-parse the WHERE clause for each row, tracking parameter positions.
    return rows.filter((row) => {
      return evaluateWhereForRow(row, whereClause, params);
    });
  }

  /**
   * Evaluate a WHERE clause for a single row, properly tracking parameter positions.
   */
  function evaluateWhereForRow(row: TableRow, whereClause: string, params: any[]): boolean {
    let paramIdx = 0;

    function consumeParam(): any {
      return params[paramIdx++];
    }

    function evalAtom(cond: string): boolean {
      const trimCond = cond.trim();

      // IN clause
      const inMatch = trimCond.match(/^(\w+)\s+IN\s*\(([^)]+)\)/i);
      if (inMatch) {
        const col = inMatch[1];
        const placeholders = inMatch[2].split(',');
        const values: any[] = [];
        for (const p of placeholders) {
          if (p.trim() === '?') {
            values.push(consumeParam());
          } else {
            values.push(p.trim());
          }
        }
        return values.includes(row[col]);
      }

      // Comparison: column OP ?|literal
      const compMatch = trimCond.match(/^(\w+)\s*(>=|<=|!=|>|<|=)\s*(\?|-?\d+(?:\.\d+)?)/i);
      if (compMatch) {
        const col = compMatch[1];
        const op = compMatch[2];
        let val: any;
        if (compMatch[3] === '?') {
          val = consumeParam();
        } else {
          val = parseFloat(compMatch[3]);
        }
        const rowVal = row[col];
        switch (op) {
          case '=': return rowVal == val;
          case '!=': return rowVal != val;
          case '>': return rowVal > val;
          case '>=': return rowVal >= val;
          case '<': return rowVal < val;
          case '<=': return rowVal <= val;
        }
      }

      return true;
    }

    // Split on AND (not within parentheses)
    // Handle: (condA) OR (condB AND condC)
    // For our storage's generated queries, the structure is straightforward.
    // Handle compound OR groups: (cond1) OR (cond2)
    if (/\bOR\b/i.test(whereClause)) {
      // Split on OR at the top level
      const orParts = splitTopLevel(whereClause, 'OR');
      return orParts.some((part) => {
        // Reset param index for each OR branch... actually that's wrong.
        // For our specific queries, OR is used within parenthesized groups.
        // e.g., ((_meta_lwt > ?) OR (_meta_lwt = ? AND id > ?))
        return evaluateWhereForRow(row, part.replace(/^\(|\)$/g, ''), params);
      });
    }

    // Split on AND
    const andParts = splitTopLevel(whereClause, 'AND');
    for (const part of andParts) {
      const trimmed = part.trim().replace(/^\(|\)$/g, '').trim();
      if (/\bOR\b/i.test(trimmed)) {
        // nested OR
        const orParts = splitTopLevel(trimmed, 'OR');
        const orResult = orParts.some((orPart) => {
          return evalAtom(orPart.replace(/^\(|\)$/g, '').trim());
        });
        if (!orResult) return false;
      } else {
        if (!evalAtom(trimmed)) return false;
      }
    }
    return true;
  }

  /**
   * Split an expression on a keyword (AND/OR) respecting parentheses.
   */
  function splitTopLevel(expr: string, keyword: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    const tokens = expr.split(/(\(|\)|\s+)/);
    let buffer = '';

    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      buffer += ch;

      // Check if at top level we've hit the keyword
      if (depth === 0) {
        const keywordMatch = buffer.match(new RegExp(`^(.+?)\\s+${keyword}\\s+$`, 'i'));
        if (keywordMatch) {
          parts.push(keywordMatch[1].trim());
          buffer = '';
        }
      }
    }
    if (buffer.trim()) {
      parts.push(buffer.trim());
    }
    return parts.length > 0 ? parts : [expr];
  }

  /**
   * Simple WHERE matching for UPDATE/DELETE statements.
   * Only handles: col = ?
   */
  function matchesWhereSimple(row: TableRow, whereClause: string, params: any[]): boolean {
    return evaluateWhereForRow(row, whereClause, params);
  }

  /**
   * Sort rows by an ORDER BY spec like "_meta_lwt ASC, id ASC"
   */
  function sortRows(rows: TableRow[], orderSpec: string): TableRow[] {
    const parts = orderSpec.split(',').map((p) => {
      const trimmed = p.trim();
      const [col, dir] = trimmed.split(/\s+/);
      return { col, desc: (dir || 'ASC').toUpperCase() === 'DESC' };
    });

    return rows.sort((a, b) => {
      for (const { col, desc } of parts) {
        const av = a[col];
        const bv = b[col];
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
      }
      return 0;
    });
  }

  return { execSync, getAllSync, runSync };
}
