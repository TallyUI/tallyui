import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { RxJsonSchema, RxDocumentData, RxStorageInstanceCreationParams } from 'rxdb';
import { createMockSQLiteDatabase } from './mock-sqlite';
import { getRxStorageSQLite } from './rx-storage-sqlite';
import type { SQLiteStorageSettings } from './types';
import type { RxStorageInstanceSQLite } from './storage-instance';

// Simple doc type for testing
interface TestDoc {
  id: string;
  name: string;
  age: number;
}

const testSchema: RxJsonSchema<RxDocumentData<TestDoc>> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    age: { type: 'number' },
    _deleted: { type: 'boolean' },
    _rev: { type: 'string' },
    _meta: {
      type: 'object',
      properties: {
        lwt: { type: 'number' },
      },
      required: ['lwt'],
    },
    _attachments: { type: 'object' },
  },
  required: ['id', 'name', 'age', '_deleted', '_rev', '_meta', '_attachments'],
};

function makeDoc(
  overrides: Partial<TestDoc & RxDocumentData<TestDoc>> = {},
): RxDocumentData<TestDoc> {
  return {
    id: 'doc1',
    name: 'Alice',
    age: 30,
    _deleted: false,
    _rev: '1-abc',
    _meta: { lwt: Date.now() },
    _attachments: {},
    ...overrides,
  } as RxDocumentData<TestDoc>;
}

describe('RxStorageInstanceSQLite', () => {
  let storage: ReturnType<typeof getRxStorageSQLite>;
  let instance: RxStorageInstanceSQLite<TestDoc>;

  beforeEach(async () => {
    const db = createMockSQLiteDatabase();
    storage = getRxStorageSQLite(db);
    instance = (await storage.createStorageInstance({
      databaseInstanceToken: 'test-token',
      databaseName: 'testdb',
      collectionName: 'testcol',
      schema: testSchema,
      options: { database: db },
      multiInstance: false,
      devMode: false,
    })) as RxStorageInstanceSQLite<TestDoc>;
  });

  afterEach(async () => {
    await instance.close();
  });

  describe('bulkWrite', () => {
    it('should insert a new document', async () => {
      const doc = makeDoc({ id: 'doc1', name: 'Alice', age: 30 });
      const result = await instance.bulkWrite(
        [{ document: doc }],
        'test-insert',
      );
      expect(result.error).toHaveLength(0);

      // Verify we can read it back
      const found = await instance.findDocumentsById(['doc1'], false);
      expect(found).toHaveLength(1);
      expect(found[0].name).toBe('Alice');
    });

    it('should insert multiple documents', async () => {
      const doc1 = makeDoc({ id: 'doc1', name: 'Alice', age: 30, _meta: { lwt: 1000 } });
      const doc2 = makeDoc({ id: 'doc2', name: 'Bob', age: 25, _meta: { lwt: 1001 } });
      const result = await instance.bulkWrite(
        [{ document: doc1 }, { document: doc2 }],
        'test-multi-insert',
      );
      expect(result.error).toHaveLength(0);

      const found = await instance.findDocumentsById(['doc1', 'doc2'], false);
      expect(found).toHaveLength(2);
    });

    it('should update an existing document when previous matches', async () => {
      const doc1 = makeDoc({ id: 'doc1', name: 'Alice', _rev: '1-aaa', _meta: { lwt: 1000 } });
      await instance.bulkWrite([{ document: doc1 }], 'insert');

      const updated = makeDoc({
        id: 'doc1',
        name: 'Alice Updated',
        _rev: '2-bbb',
        _meta: { lwt: 2000 },
      });
      const result = await instance.bulkWrite(
        [{ previous: doc1, document: updated }],
        'update',
      );
      expect(result.error).toHaveLength(0);

      const found = await instance.findDocumentsById(['doc1'], false);
      expect(found).toHaveLength(1);
      expect(found[0].name).toBe('Alice Updated');
      expect(found[0]._rev).toBe('2-bbb');
    });

    it('should return a conflict error when previous rev does not match', async () => {
      const doc1 = makeDoc({ id: 'doc1', name: 'Alice', _rev: '1-aaa', _meta: { lwt: 1000 } });
      await instance.bulkWrite([{ document: doc1 }], 'insert');

      const wrongPrevious = makeDoc({
        id: 'doc1',
        name: 'Alice',
        _rev: '1-wrong',
        _meta: { lwt: 1000 },
      });
      const updated = makeDoc({
        id: 'doc1',
        name: 'Alice Updated',
        _rev: '2-bbb',
        _meta: { lwt: 2000 },
      });
      const result = await instance.bulkWrite(
        [{ previous: wrongPrevious, document: updated }],
        'conflict-update',
      );
      expect(result.error).toHaveLength(1);
      expect(result.error[0].status).toBe(409);
    });

    it('should emit events on the change stream', async () => {
      const events: any[] = [];
      const sub = instance.changeStream().subscribe((eventBulk) => {
        events.push(...eventBulk.events);
      });

      const doc = makeDoc({ id: 'doc1', name: 'Alice', _meta: { lwt: 1000 } });
      await instance.bulkWrite([{ document: doc }], 'insert');

      expect(events).toHaveLength(1);
      expect(events[0].operation).toBe('INSERT');
      expect(events[0].documentId).toBe('doc1');

      sub.unsubscribe();
    });
  });

  describe('findDocumentsById', () => {
    it('should return empty array for non-existent ids', async () => {
      const found = await instance.findDocumentsById(['nonexistent'], false);
      expect(found).toHaveLength(0);
    });

    it('should not return deleted documents when withDeleted is false', async () => {
      const doc = makeDoc({ id: 'doc1', _deleted: true, _meta: { lwt: 1000 } });
      await instance.bulkWrite([{ document: doc }], 'insert-deleted');

      const found = await instance.findDocumentsById(['doc1'], false);
      expect(found).toHaveLength(0);
    });

    it('should return deleted documents when withDeleted is true', async () => {
      const doc = makeDoc({ id: 'doc1', _deleted: true, _meta: { lwt: 1000 } });
      await instance.bulkWrite([{ document: doc }], 'insert-deleted');

      const found = await instance.findDocumentsById(['doc1'], true);
      expect(found).toHaveLength(1);
    });
  });

  describe('getChangedDocumentsSince', () => {
    it('should return documents ordered by lwt', async () => {
      const doc1 = makeDoc({ id: 'a', name: 'First', _meta: { lwt: 100 } });
      const doc2 = makeDoc({ id: 'b', name: 'Second', _meta: { lwt: 200 } });
      const doc3 = makeDoc({ id: 'c', name: 'Third', _meta: { lwt: 300 } });
      await instance.bulkWrite(
        [{ document: doc1 }, { document: doc2 }, { document: doc3 }],
        'insert-all',
      );

      const result = await instance.getChangedDocumentsSince(10);
      expect(result.documents).toHaveLength(3);
      expect(result.documents[0].name).toBe('First');
      expect(result.documents[2].name).toBe('Third');
      expect(result.checkpoint).toEqual({ id: 'c', lwt: 300 });
    });

    it('should respect the checkpoint for pagination', async () => {
      const doc1 = makeDoc({ id: 'a', name: 'First', _meta: { lwt: 100 } });
      const doc2 = makeDoc({ id: 'b', name: 'Second', _meta: { lwt: 200 } });
      const doc3 = makeDoc({ id: 'c', name: 'Third', _meta: { lwt: 300 } });
      await instance.bulkWrite(
        [{ document: doc1 }, { document: doc2 }, { document: doc3 }],
        'insert-all',
      );

      const result = await instance.getChangedDocumentsSince(10, { id: 'a', lwt: 100 });
      expect(result.documents).toHaveLength(2);
      expect(result.documents[0].name).toBe('Second');
      expect(result.documents[1].name).toBe('Third');
    });
  });

  describe('cleanup', () => {
    it('should remove deleted documents older than minimumDeletedTime', async () => {
      const oldLwt = Date.now() - 100000;
      const doc = makeDoc({
        id: 'doc1',
        _deleted: true,
        _meta: { lwt: oldLwt },
      });
      await instance.bulkWrite([{ document: doc }], 'insert-deleted');

      // Cleanup with a 1000ms threshold
      const result = await instance.cleanup(1000);
      expect(result).toBe(true);

      // Document should be gone
      const found = await instance.findDocumentsById(['doc1'], true);
      expect(found).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('should drop the table and close', async () => {
      const doc = makeDoc({ id: 'doc1', _meta: { lwt: 1000 } });
      await instance.bulkWrite([{ document: doc }], 'insert');

      await instance.remove();

      // After remove, creating a new instance should have no data
      const db = createMockSQLiteDatabase();
      const newStorage = getRxStorageSQLite(db);
      const newInstance = await newStorage.createStorageInstance({
        databaseInstanceToken: 'test-token-2',
        databaseName: 'testdb',
        collectionName: 'testcol',
        schema: testSchema,
        options: { database: db },
        multiInstance: false,
        devMode: false,
      });
      const found = await newInstance.findDocumentsById(['doc1'], true);
      expect(found).toHaveLength(0);
      await newInstance.close();
    });
  });
});
