import type {
  BulkWriteRow,
  EventBulk,
  PreparedQuery,
  RxDocumentData,
  RxJsonSchema,
  RxStorageBulkWriteResponse,
  RxStorageChangeEvent,
  RxStorageCountResult,
  RxStorageDefaultCheckpoint,
  RxStorageInstance,
  RxStorageInstanceCreationParams,
  RxStorageQueryResult,
  StringKeys,
} from 'rxdb';
import { categorizeBulkWriteRows, getQueryMatcher, getSortComparator } from 'rxdb';
import { now, ensureNotFalsy, randomToken } from 'rxdb/plugins/utils';
import { Subject, type Observable } from 'rxjs';
import type { SQLiteDatabase, SQLiteStorageSettings } from './types';
import type { RxStorageSQLite } from './rx-storage-sqlite';
import { buildQuerySQL, buildCountSQL } from './mango-to-sql';

export interface SQLiteStorageInternals {
  database: SQLiteDatabase;
  tableName: string;
}

function sanitizeTableName(databaseName: string, collectionName: string, schemaVersion: number): string {
  return `${databaseName}_${collectionName}_v${schemaVersion}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

export class RxStorageInstanceSQLite<RxDocType>
  implements RxStorageInstance<
    RxDocType,
    SQLiteStorageInternals,
    SQLiteStorageSettings,
    RxStorageDefaultCheckpoint
  >
{
  readonly databaseName: string;
  readonly collectionName: string;
  readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>;
  readonly internals: SQLiteStorageInternals;
  readonly options: Readonly<SQLiteStorageSettings>;
  readonly primaryPath: StringKeys<RxDocumentData<RxDocType>>;
  private changes$ = new Subject<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>>();
  private closed = false;

  constructor(
    readonly storage: RxStorageSQLite,
    params: RxStorageInstanceCreationParams<RxDocType, SQLiteStorageSettings>,
    private database: SQLiteDatabase,
  ) {
    this.databaseName = params.databaseName;
    this.collectionName = params.collectionName;
    this.schema = params.schema;
    this.options = params.options;
    this.primaryPath = (
      typeof params.schema.primaryKey === 'string'
        ? params.schema.primaryKey
        : params.schema.primaryKey.key
    ) as StringKeys<RxDocumentData<RxDocType>>;

    const tableName = sanitizeTableName(params.databaseName, params.collectionName, params.schema.version);
    this.internals = { database, tableName };

    this.createTable();
  }

  /**
   * Create the SQLite table for this collection if it does not exist.
   * Stores documents as JSON with indexed columns for _deleted, _rev, _meta.lwt and the primary key.
   */
  private createTable(): void {
    this.database.execSync(
      `CREATE TABLE IF NOT EXISTS "${this.internals.tableName}" (` +
      `  id TEXT PRIMARY KEY NOT NULL,` +
      `  data TEXT NOT NULL,` +
      `  _deleted INTEGER NOT NULL DEFAULT 0,` +
      `  _meta_lwt REAL NOT NULL DEFAULT 0` +
      `)`
    );
  }

  /**
   * Read documents from SQLite by their primary keys.
   * Returns a Map<primaryKey, RxDocumentData> for use with categorizeBulkWriteRows.
   */
  private getDocsByIdMap(ids: string[]): Map<string, RxDocumentData<RxDocType>> {
    const map = new Map<string, RxDocumentData<RxDocType>>();
    if (ids.length === 0) return map;

    // Batch query using IN clause
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.database.getAllSync<{ id: string; data: string }>(
      `SELECT id, data FROM "${this.internals.tableName}" WHERE id IN (${placeholders})`,
      ids
    );
    for (const row of rows) {
      const doc = JSON.parse(row.data) as RxDocumentData<RxDocType>;
      map.set(row.id, doc);
    }
    return map;
  }

  async bulkWrite(
    documentWrites: BulkWriteRow<RxDocType>[],
    context: string,
  ): Promise<RxStorageBulkWriteResponse<RxDocType>> {
    if (this.closed) {
      throw new Error('RxStorageInstanceSQLite: storage is closed');
    }

    // Collect all document IDs we need to check for conflicts
    const ids = documentWrites.map(
      (row) => (row.document as any)[this.primaryPath] as string
    );
    const docsInDb = this.getDocsByIdMap(ids);

    // Use RxDB's built-in categorization for conflict detection and event generation
    const categorized = categorizeBulkWriteRows<RxDocType>(
      this,
      this.primaryPath,
      docsInDb,
      documentWrites,
      context,
    );

    const error = categorized.errors;

    // Perform inserts
    for (const row of categorized.bulkInsertDocs) {
      const doc = row.document;
      const docId = (doc as any)[this.primaryPath] as string;
      const json = JSON.stringify(doc);
      this.database.runSync(
        `INSERT OR REPLACE INTO "${this.internals.tableName}" (id, data, _deleted, _meta_lwt) VALUES (?, ?, ?, ?)`,
        [docId, json, doc._deleted ? 1 : 0, doc._meta.lwt]
      );
    }

    // Perform updates
    for (const row of categorized.bulkUpdateDocs) {
      const doc = row.document;
      const docId = (doc as any)[this.primaryPath] as string;
      const json = JSON.stringify(doc);
      this.database.runSync(
        `UPDATE "${this.internals.tableName}" SET data = ?, _deleted = ?, _meta_lwt = ? WHERE id = ?`,
        [json, doc._deleted ? 1 : 0, doc._meta.lwt, docId]
      );
    }

    // Emit events for change stream
    if (categorized.eventBulk.events.length > 0) {
      const lastState = ensureNotFalsy(categorized.newestRow).document;
      categorized.eventBulk.checkpoint = {
        id: (lastState as any)[this.primaryPath],
        lwt: lastState._meta.lwt,
      };
      this.changes$.next(categorized.eventBulk);
    }

    return { error };
  }

  async findDocumentsById(
    ids: string[],
    withDeleted: boolean,
  ): Promise<RxDocumentData<RxDocType>[]> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    let sql = `SELECT data FROM "${this.internals.tableName}" WHERE id IN (${placeholders})`;
    if (!withDeleted) {
      sql += ' AND _deleted = 0';
    }
    const rows = this.database.getAllSync<{ data: string }>(sql, ids);
    return rows.map((row) => JSON.parse(row.data) as RxDocumentData<RxDocType>);
  }

  async query(
    preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageQueryResult<RxDocType>> {
    const { query } = preparedQuery;

    // Try the Mango-to-SQL path first. If the SQLite database supports
    // json_extract (all modern versions do), this is the fast path.
    // Fall back to in-memory filtering if the SQL query fails.
    try {
      const { sql, params } = buildQuerySQL(this.internals.tableName, query);
      const rows = this.database.getAllSync<{ data: string }>(sql, params);
      const documents = rows.map(
        (row) => JSON.parse(row.data) as RxDocumentData<RxDocType>,
      );
      return { documents };
    } catch {
      // Fallback: load all non-deleted docs and filter in-memory
      return this.queryInMemory(query);
    }
  }

  async count(
    preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageCountResult> {
    const { query } = preparedQuery;

    // Try the SQL COUNT path first.
    try {
      const { sql, params } = buildCountSQL(this.internals.tableName, query);
      const rows = this.database.getAllSync<{ count: number }>(sql, params);
      if (rows.length > 0 && typeof rows[0].count === 'number') {
        return { count: rows[0].count, mode: 'fast' };
      }
    } catch {
      // fall through to in-memory
    }

    // Fallback: do a full query and count the results
    const result = await this.queryInMemory(query);
    return { count: result.documents.length, mode: 'slow' };
  }

  /**
   * In-memory query fallback using RxDB's built-in query matcher and sort comparator.
   * Used when the Mango-to-SQL translation fails (e.g., unsupported operators).
   */
  private async queryInMemory(
    query: PreparedQuery<RxDocType>['query'],
  ): Promise<RxStorageQueryResult<RxDocType>> {
    const rows = this.database.getAllSync<{ data: string }>(
      `SELECT data FROM "${this.internals.tableName}" WHERE _deleted = 0`,
    );

    let documents = rows.map(
      (row) => JSON.parse(row.data) as RxDocumentData<RxDocType>,
    );

    const queryMatcher = getQueryMatcher(this.schema, query);
    documents = documents.filter((doc) => queryMatcher(doc));

    const sortComparator = getSortComparator(this.schema, query);
    documents.sort(sortComparator);

    const skip = query.skip ?? 0;
    const limit = query.limit ?? Infinity;
    documents = documents.slice(skip, skip + limit);

    return { documents };
  }

  getAttachmentData(
    _documentId: string,
    _attachmentId: string,
    _digest: string,
  ): Promise<string> {
    throw new Error('Attachments not supported by SQLite storage');
  }

  async getChangedDocumentsSince(
    limit: number,
    checkpoint?: RxStorageDefaultCheckpoint,
  ): Promise<{
    documents: RxDocumentData<RxDocType>[];
    checkpoint: RxStorageDefaultCheckpoint;
  }> {
    let sql: string;
    let params: any[];

    if (checkpoint) {
      // Get documents changed after the checkpoint.
      // Order by lwt then by id to break ties deterministically.
      sql = `SELECT data FROM "${this.internals.tableName}" ` +
        `WHERE (_meta_lwt > ?) OR (_meta_lwt = ? AND id > ?) ` +
        `ORDER BY _meta_lwt ASC, id ASC LIMIT ?`;
      params = [checkpoint.lwt, checkpoint.lwt, checkpoint.id, limit];
    } else {
      sql = `SELECT data FROM "${this.internals.tableName}" ` +
        `ORDER BY _meta_lwt ASC, id ASC LIMIT ?`;
      params = [limit];
    }

    const rows = this.database.getAllSync<{ data: string }>(sql, params);
    const documents = rows.map(
      (row) => JSON.parse(row.data) as RxDocumentData<RxDocType>
    );

    const lastDoc = documents.length > 0 ? documents[documents.length - 1] : undefined;
    const newCheckpoint: RxStorageDefaultCheckpoint = lastDoc
      ? {
          id: (lastDoc as any)[this.primaryPath],
          lwt: lastDoc._meta.lwt,
        }
      : checkpoint ?? { id: '', lwt: 0 };

    return {
      documents,
      checkpoint: newCheckpoint,
    };
  }

  changeStream(): Observable<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>> {
    return this.changes$.asObservable();
  }

  async cleanup(minimumDeletedTime: number): Promise<boolean> {
    const maxDeletionTime = now() - minimumDeletedTime;
    this.database.runSync(
      `DELETE FROM "${this.internals.tableName}" WHERE _deleted = 1 AND _meta_lwt < ?`,
      [maxDeletionTime]
    );
    return true;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.changes$.complete();
  }

  async remove(): Promise<void> {
    this.database.execSync(`DROP TABLE IF EXISTS "${this.internals.tableName}"`);
    await this.close();
  }
}

export async function createSQLiteStorageInstance<RxDocType>(
  storage: RxStorageSQLite,
  params: RxStorageInstanceCreationParams<RxDocType, SQLiteStorageSettings>,
  database: SQLiteDatabase,
): Promise<RxStorageInstanceSQLite<RxDocType>> {
  const instance = new RxStorageInstanceSQLite(storage, params, database);
  return instance;
}
