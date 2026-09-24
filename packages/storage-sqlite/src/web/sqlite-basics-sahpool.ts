import type { SQLiteBasics, SQLResultRow } from 'rxdb/plugins/storage-sqlite';
import { sqliteBoolParams } from '../params';

/**
 * The minimal surface of `@sqlite.org/sqlite-wasm`'s synchronous OO1 API
 * (https://sqlite.org/wasm/doc/trunk/api-oo1.md) that this adapter needs,
 * whether the handle comes from `sqlite3.oo1.DB` or from an opfs-sahpool
 * `OpfsSAHPoolDb`.
 */
export interface Oo1Db {
  exec(opts: { sql: string; bind?: unknown[]; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown;
  close(): void;
}

/**
 * A port of WCPOS's `getSQLiteBasicsOo1` spike onto the synchronous OO1 API,
 * for RxDB Premium's SQLite storage (ADR-061). Unlike the expo-sqlite
 * `SQLiteBasics` in `rx-storage-sqlite.ts`, one worker here can serve several
 * RxDB databases: `openDb(name)` opens a separate opfs-sahpool file per name,
 * for example one per store scope after a store switch. What must not happen
 * is opening the *same* name twice, which would give two handles on one pool
 * file — so handles are cached by name. `open(name)` returns the cached
 * handle if there is one, otherwise opens a new one (running
 * `PRAGMA locking_mode = exclusive` before anything else touches it), caches
 * it, and returns it; concurrent opens of the same name share a single
 * in-flight promise. `close` removes the handle from the cache, so a later
 * `open` of that name reopens it.
 */
export function getSQLiteBasicsOpfsSahPool({ openDb }: { openDb: (name: string) => Promise<Oo1Db> }): SQLiteBasics<Oo1Db> {
  const handles = new Map<string, Promise<Oo1Db>>();
  const namesByHandle = new Map<Oo1Db, string>();
  return {
    debugId: 'tallyui-sqlite-sahpool',
    journalMode: 'WAL',
    open: async (name) => {
      const cached = handles.get(name);
      if (cached !== undefined) {
        return cached;
      }
      const opening = (async () => {
        const db = await openDb(name);
        // Exclusive locking must be set before anything else touches the
        // handle: it drops SQLite's per-transaction lock/unlock cycle, which
        // is the point of opfs-sahpool owning the origin's storage alone.
        db.exec({ sql: 'PRAGMA locking_mode = exclusive' });
        namesByHandle.set(db, name);
        return db;
      })();
      handles.set(name, opening);
      return opening;
    },
    all: async (db, q) => {
      return db.exec({
        sql: q.query,
        bind: sqliteBoolParams(q.params),
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as SQLResultRow[];
    },
    run: async (db, q) => {
      db.exec({ sql: q.query, bind: sqliteBoolParams(q.params) });
    },
    setPragma: async (db, key, value) => {
      db.exec({ sql: `pragma ${key} = ${value};` });
    },
    close: async (db) => {
      const name = namesByHandle.get(db);
      if (name !== undefined) {
        handles.delete(name);
        namesByHandle.delete(db);
      }
      db.close();
    },
  };
}
