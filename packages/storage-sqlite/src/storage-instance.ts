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
} from 'rxdb';
import { Subject, type Observable } from 'rxjs';
import type { SQLiteDatabase, SQLiteStorageSettings } from './types';
import type { RxStorageSQLite } from './rx-storage-sqlite';

export interface SQLiteStorageInternals {
  database: SQLiteDatabase;
  tableName: string;
}

/**
 * Stub implementation -- will be completed in Task 12.
 */
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
  readonly primaryPath: string;
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
    this.primaryPath = typeof params.schema.primaryKey === 'string'
      ? params.schema.primaryKey
      : params.schema.primaryKey.key;

    const tableName = `${params.databaseName}_${params.collectionName}`.replace(/[^a-zA-Z0-9_]/g, '_');
    this.internals = { database, tableName };
  }

  bulkWrite(documentWrites: BulkWriteRow<RxDocType>[], context: string): Promise<RxStorageBulkWriteResponse<RxDocType>> {
    throw new Error('Not implemented -- see Task 12');
  }

  findDocumentsById(ids: string[], withDeleted: boolean): Promise<RxDocumentData<RxDocType>[]> {
    throw new Error('Not implemented -- see Task 12');
  }

  query(preparedQuery: PreparedQuery<RxDocType>): Promise<RxStorageQueryResult<RxDocType>> {
    throw new Error('Not implemented -- see Task 12');
  }

  count(preparedQuery: PreparedQuery<RxDocType>): Promise<RxStorageCountResult> {
    throw new Error('Not implemented -- see Task 12');
  }

  getAttachmentData(_documentId: string, _attachmentId: string, _digest: string): Promise<string> {
    throw new Error('Attachments not supported by SQLite storage');
  }

  getChangedDocumentsSince(
    limit: number,
    checkpoint?: RxStorageDefaultCheckpoint,
  ): Promise<{
    documents: RxDocumentData<RxDocType>[];
    checkpoint: RxStorageDefaultCheckpoint;
  }> {
    throw new Error('Not implemented -- see Task 12');
  }

  changeStream(): Observable<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>> {
    return this.changes$.asObservable();
  }

  cleanup(_minimumDeletedTime: number): Promise<boolean> {
    throw new Error('Not implemented -- see Task 12');
  }

  async close(): Promise<void> {
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
