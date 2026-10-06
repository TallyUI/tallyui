// The same migration contract runs on memory and SQLite, reading both versions beneath RxDB.
import { expect, it } from 'vitest';
import {
  addRxPlugin, createRxDatabase, fillWithDefaultSettings, getPrimaryKeyOfInternalDocument, getSingleDocument,
  INTERNAL_CONTEXT_MIGRATION_STATUS, normalizeMangoQuery, prepareQuery, type RxCollection, type RxJsonSchema, type RxStorage,
} from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addRegisterSessionCollection, RegisterSessionOpenClosedError } from './open';
import { bindRegister, ensureRegister, mintUuid, nextSaleCounter, readRegister } from './register-document';
import { registerSessionSchema, type RegisterSession } from './schemas';

addRxPlugin(RxDBLocalDocumentsPlugin);

type VersionZeroSession = Omit<RegisterSession, 'status' | 'server_session_id'> & { status: 'open' | 'counting' | 'closed' };

/** The shipped version-0 schema, independent of the current schema. */
function versionZero(): RxJsonSchema<VersionZeroSession> {
  return {
    title: 'Register sessions', version: 0, primaryKey: 'id', type: 'object', additionalProperties: false,
    properties: {
      id: { type: 'string', maxLength: 36 }, register_id: { type: 'string', maxLength: 36 }, store_key: { type: ['string', 'null'] },
      status: { type: 'string', enum: ['open', 'counting', 'closed'], maxLength: 8 },
      business_day: { type: 'string', maxLength: 10 },
      opened_at_gmt: { type: 'string' }, opened_by: { type: ['string', 'null'] },
      expected_float_minor: { type: ['integer', 'null'] }, counted_float_minor: { type: 'integer' }, opening_variance_minor: { type: ['integer', 'null'] },
      counting_started_at_gmt: { type: ['string', 'null'] }, closed_at_gmt: { type: ['string', 'null'] }, closed_by: { type: ['string', 'null'] },
      approval_required: { type: 'boolean', default: false }, approved_by: { type: ['string', 'null'] },
      counted: { type: ['object', 'null'], additionalProperties: { type: 'integer' } },
      closure_id: { type: ['string', 'null'] },
      pending_status: { type: ['string', 'null'], default: null },
      server_status: { type: ['string', 'null'], default: null },
      status_at: { type: ['string', 'null'], default: null },
      approver_token: { type: ['string', 'null'], default: null },
      server_expected: { type: ['object', 'null'], additionalProperties: { type: 'integer' }, default: null },
      server_sales_count: { type: ['integer', 'null'], default: null },
    },
    required: ['id', 'register_id', 'status', 'opened_at_gmt', 'counted_float_minor'],
    indexes: [['register_id', 'status']],
  };
}

const olderCollection = () => ({ schema: versionZero(), localDocuments: true });
const STATUS_ID = getPrimaryKeyOfInternalDocument('register_sessions-v-1', INTERNAL_CONTEXT_MIGRATION_STATUS);

/** The older app is unvalidated; the upgraded app validates over the same storage. */
function store(storage: RxStorage<any, any>) {
  const name = `registeropen${mintUuid().replaceAll('-', '')}`;
  const validating = wrappedValidateAjvStorage({ storage });
  const open = (validated = true) => createRxDatabase({ name, storage: validated ? validating : storage, multiInstance: false });
  const olderApp = async (step: (sessions: RxCollection<VersionZeroSession>) => Promise<unknown>) => {
    const db = await open(false);
    try {
      await step((await db.addCollections({ register_sessions: olderCollection() })).register_sessions);
    } finally { await db.close(); }
  };
  /** Strip storage metadata and sort by id, including when the old version has been removed. */
  const stored = async () => {
    const [v0, v1] = await Promise.all([versionZero(), registerSessionSchema].map(async (schema: RxJsonSchema<any>) => {
      const raw = await storage.createStorageInstance<any>({ databaseName: name, collectionName: 'register_sessions',
        schema: fillWithDefaultSettings(schema), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
      try {
        const query = normalizeMangoQuery(raw.schema, { selector: {}, sort: [{ id: 'asc' }] });
        const { documents } = await raw.query(prepareQuery(raw.schema, query));
        return documents.map(({ _rev, _meta, _attachments, _deleted, ...doc }) => doc);
      } finally { await raw.close(); }
    }));
    return { v0, v1 };
  };
  return { open, olderApp, stored };
}

const openSession: VersionZeroSession = {
  id: 'session-3', register_id: 'register-1', status: 'open', opened_at_gmt: '2026-10-06T09:00:00Z', counted_float_minor: 10000,
};
const counting: VersionZeroSession = {
  ...openSession, id: 'session-2', status: 'counting', opened_by: 'cashier-2', expected_float_minor: 10000,
  counting_started_at_gmt: '2026-10-06T10:00:00Z', counted: { cash: 15000 },
};
const closed: VersionZeroSession = {
  ...openSession, id: 'session-1', status: 'closed', store_key: 'store-1', business_day: '2026-10-06', opened_by: 'cashier-1',
  expected_float_minor: 9000, opening_variance_minor: 1000, counting_started_at_gmt: '2026-10-06T10:00:00Z',
  closed_at_gmt: '2026-10-06T10:05:00Z', closed_by: 'cashier-1', approval_required: true, approved_by: 'manager-1',
  counted: { cash: 18000, card: 25000 }, closure_id: 'closure-1', pending_status: 'closed', server_status: 'counting',
  status_at: '2026-10-06T10:05:00Z', approver_token: 'approval-1', server_expected: { cash: 18100, card: 25000 }, server_sales_count: 7,
};

export function addRegisterSessionCollectionTests(makeStorage: () => RxStorage<any, any>) {
  it('migrates every version-0 session byte for byte and keeps the register document', async () => {
    const { open, olderApp, stored } = store(makeStorage());
    let register: unknown;
    await olderApp(async (sessions) => {
      expect((await sessions.bulkInsert([closed, counting, openSession])).error).toEqual([]);
      await ensureRegister(sessions, 'web');
      await bindRegister(sessions, 'store-1', { id: openSession.register_id, name: 'Till 1' });
      await nextSaleCounter(sessions, 'store-1');
      register = await readRegister(sessions);
    });
    const { v0: storedRows } = await stored();
    const db = await open();
    try {
      const sessions = await addRegisterSessionCollection(db);
      expect(sessions.schema.version).toBe(1);
      for (const row of storedRows) expect((await sessions.findOne(row.id).exec())?.toJSON()).toStrictEqual(row);
      expect(await readRegister(sessions)).toStrictEqual(register);
      expect(await stored()).toStrictEqual({ v0: [], v1: storedRows });
    } finally { await db.close(); }
  });

  it('a genuinely invalid session rejects with DM4 after the migration has stopped, and the fixed one migrates on the next open', async () => {
    const { open, olderApp, stored } = store(makeStorage());
    await olderApp(async (sessions) => {
      // The older app's storage accepts an invalid status without validation.
      const bad = { ...counting, status: 'bogus' } as unknown as VersionZeroSession;
      expect((await sessions.bulkInsert([openSession, bad])).error).toEqual([]);
    });
    const db = await open();
    try {
      await expect(addRegisterSessionCollection(db)).rejects.toMatchObject({ code: 'DM4' });
      expect((await getSingleDocument(db.internalStore, STATUS_ID))?.data).toMatchObject({ status: 'ERROR' });
      expect(db.collections.register_sessions).toBeUndefined();
    } finally { await db.close(); }
    await olderApp(async (sessions) => {
      await (await sessions.findOne(counting.id).exec())!.incrementalPatch({ status: 'counting' });
    });
    const { v0: storedRows } = await stored();
    const reopened = await open();
    try {
      const sessions = await addRegisterSessionCollection(reopened);
      for (const row of storedRows) expect((await sessions.findOne(row.id).exec())?.toJSON()).toStrictEqual(row);
      expect(await stored()).toStrictEqual({ v0: [], v1: storedRows });
    } finally { await reopened.close(); }
  });

  it('an open on a database whose close has begun rejects with the coded error and keeps every session', async () => {
    const { open, olderApp, stored } = store(makeStorage());
    await olderApp(async (sessions) => {
      expect((await sessions.bulkInsert([closed, counting, openSession])).error).toEqual([]);
    });
    const { v0: storedRows } = await stored();
    const db = await open();
    const closing = db.close();
    try {
      const error = await addRegisterSessionCollection(db).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RegisterSessionOpenClosedError);
      expect(error).toMatchObject({ code: 'REGISTER_SESSION_OPEN_CLOSED' });
    } finally { await closing; }
    expect(db.collections.register_sessions).toBeUndefined();
    const reopened = await open();
    try {
      const sessions = await addRegisterSessionCollection(reopened);
      for (const row of storedRows) expect((await sessions.findOne(row.id).exec())?.toJSON()).toStrictEqual(row);
      expect(await stored()).toStrictEqual({ v0: [], v1: storedRows });
    } finally { await reopened.close(); }
  });

  it('opens a new database without migrating, and stores conflict and superseded sessions with server_session_id', async () => {
    const db = await store(makeStorage()).open();
    try {
      const sessions = await addRegisterSessionCollection(db);
      expect(await getSingleDocument(db.internalStore, STATUS_ID)).toBeUndefined();
      await sessions.insert({ ...openSession, id: 'conflict-1', status: 'conflict' });
      const superseded = await sessions.insert({ ...openSession, id: 'superseded-1', status: 'superseded', server_session_id: 'store-session-1' });
      const found = await sessions.find({ selector: { register_id: openSession.register_id, status: 'superseded' } }).exec();
      expect(found.map((doc) => doc.toJSON())).toStrictEqual([superseded.toJSON()]);
      expect(found[0].server_session_id).toBe('store-session-1');
      await expect(addRegisterSessionCollection(db)).rejects.toMatchObject({ code: 'DB3' });
    } finally { await db.close(); }
  });
}
