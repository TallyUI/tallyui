// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import type { SQLiteQueryWithParams } from 'rxdb/plugins/storage-sqlite';
import { getSQLiteBasicsOpfsSahPool, type Oo1Db } from './sqlite-basics-sahpool';

function query(sql: string, params: (string | number | boolean)[] = []): SQLiteQueryWithParams {
  return { query: sql, params, context: { method: 'test', data: null } };
}

class FakeOo1Db implements Oo1Db {
  calls: { sql: string; bind?: unknown[]; rowMode?: 'object'; returnValue?: 'resultRows' }[] = [];
  closed = false;

  exec(opts: { sql: string; bind?: unknown[]; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown {
    this.calls.push(opts);
    if (opts.returnValue === 'resultRows') {
      return [{ id: 'row1', data: '{}' }];
    }
    return this;
  }

  close(): void {
    this.closed = true;
  }
}

describe('getSQLiteBasicsOpfsSahPool', () => {
  let fake: FakeOo1Db;
  let openDb: (name: string) => Promise<Oo1Db>;

  beforeEach(() => {
    fake = new FakeOo1Db();
    openDb = async () => fake;
  });

  it('sets locking_mode = exclusive before anything else', async () => {
    const basics = getSQLiteBasicsOpfsSahPool({ openDb });
    const db = await basics.open('mydb');

    expect(db).toBe(fake);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toEqual({ sql: 'PRAGMA locking_mode = exclusive' });
  });

  it('all passes rowMode: object and returnValue: resultRows, and turns booleans into 0/1', async () => {
    const basics = getSQLiteBasicsOpfsSahPool({ openDb });
    const db = await basics.open('mydb');
    fake.calls = [];

    const rows = await basics.all(db, query('SELECT * FROM t WHERE active = ?', [true, false, 'x']));

    expect(fake.calls).toEqual([
      { sql: 'SELECT * FROM t WHERE active = ?', bind: [1, 0, 'x'], rowMode: 'object', returnValue: 'resultRows' },
    ]);
    expect(rows).toEqual([{ id: 'row1', data: '{}' }]);
  });

  it('run binds the params', async () => {
    const basics = getSQLiteBasicsOpfsSahPool({ openDb });
    const db = await basics.open('mydb');
    fake.calls = [];

    await basics.run(db, query('INSERT INTO t (a, b) VALUES (?, ?)', [true, 'y']));

    expect(fake.calls).toEqual([{ sql: 'INSERT INTO t (a, b) VALUES (?, ?)', bind: [1, 'y'] }]);
  });

  it('setPragma issues the pragma', async () => {
    const basics = getSQLiteBasicsOpfsSahPool({ openDb });
    const db = await basics.open('mydb');
    fake.calls = [];

    await basics.setPragma(db, 'journal_mode', 'WAL');

    expect(fake.calls).toEqual([{ sql: 'pragma journal_mode = WAL;' }]);
  });

  it('close closes the handle', async () => {
    const basics = getSQLiteBasicsOpfsSahPool({ openDb });
    const db = await basics.open('mydb');

    await basics.close(db);

    expect(fake.closed).toBe(true);
  });

  it('opens two different names as two handles, each with the pragma run first', async () => {
    const fakes: Record<string, FakeOo1Db> = { a: new FakeOo1Db(), b: new FakeOo1Db() };
    const opened: string[] = [];
    const basics = getSQLiteBasicsOpfsSahPool({
      openDb: async (name) => {
        opened.push(name);
        return fakes[name];
      },
    });

    const a = await basics.open('a');
    const b = await basics.open('b');

    expect(a).toBe(fakes.a);
    expect(b).toBe(fakes.b);
    expect(opened).toEqual(['a', 'b']);
    expect(fakes.a.calls).toEqual([{ sql: 'PRAGMA locking_mode = exclusive' }]);
    expect(fakes.b.calls).toEqual([{ sql: 'PRAGMA locking_mode = exclusive' }]);
  });

  it('opening the same name twice calls openDb once', async () => {
    let openCalls = 0;
    const basics = getSQLiteBasicsOpfsSahPool({
      openDb: async (name) => {
        openCalls += 1;
        return fake;
      },
    });

    const first = await basics.open('mydb');
    const second = await basics.open('mydb');

    expect(first).toBe(fake);
    expect(second).toBe(fake);
    expect(openCalls).toBe(1);
  });

  it('opening the same name concurrently calls openDb once', async () => {
    let openCalls = 0;
    const basics = getSQLiteBasicsOpfsSahPool({
      openDb: async (name) => {
        openCalls += 1;
        return fake;
      },
    });

    const [first, second] = await Promise.all([basics.open('mydb'), basics.open('mydb')]);

    expect(first).toBe(fake);
    expect(second).toBe(fake);
    expect(openCalls).toBe(1);
  });

  it('reopens with a fresh openDb call after close', async () => {
    let openCalls = 0;
    const basics = getSQLiteBasicsOpfsSahPool({
      openDb: async (name) => {
        openCalls += 1;
        return fake;
      },
    });

    const db = await basics.open('mydb');
    await basics.close(db);
    await basics.open('mydb');

    expect(openCalls).toBe(2);
  });

  it('reports the debugId and journalMode', () => {
    const basics = getSQLiteBasicsOpfsSahPool({ openDb });

    expect(basics.debugId).toBe('tallyui-sqlite-sahpool');
    expect(basics.journalMode).toBe('WAL');
  });
});
