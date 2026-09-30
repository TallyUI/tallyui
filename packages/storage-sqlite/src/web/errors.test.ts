// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { StorageWorkerStartError, isStorageWorkerStartError } from './errors';

describe('StorageWorkerStartError / isStorageWorkerStartError', () => {
  it('names the error and keeps the cause', () => {
    const cause = new Error('no OPFS');
    const error = new StorageWorkerStartError('worker failed to start', { cause });

    expect(error.name).toBe('StorageWorkerStartError');
    expect(error.message).toBe('worker failed to start');
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(Error);
  });

  it('recognises a real StorageWorkerStartError', () => {
    expect(isStorageWorkerStartError(new StorageWorkerStartError('x'))).toBe(true);
  });

  it('recognises a serialised { name, message } copy', () => {
    expect(isStorageWorkerStartError({ name: 'StorageWorkerStartError', message: 'worker failed to start' })).toBe(
      true
    );
  });

  it('recognises the name inside a wrapping message, as the remote storage plugin delivers it', () => {
    // rxdb/plugins/storage-remote wraps a rejected createStorageInstance as
    // `new Error('could not create instance ' + JSON.stringify(errorToPlainJson(err)))`,
    // so only the message survives, with the original error's `name` embedded as JSON.
    const wrapped = new Error(
      'could not create instance ' + JSON.stringify({ name: 'StorageWorkerStartError', message: 'worker failed to start' })
    );
    expect(isStorageWorkerStartError(wrapped)).toBe(true);
  });

  it('recognises the name in a bare message string', () => {
    expect(isStorageWorkerStartError('could not create instance {"name":"StorageWorkerStartError"}')).toBe(true);
  });

  it('rejects unrelated errors', () => {
    expect(isStorageWorkerStartError(new Error('some other failure'))).toBe(false);
    expect(isStorageWorkerStartError({ name: 'TypeError', message: 'nope' })).toBe(false);
    expect(isStorageWorkerStartError('nope')).toBe(false);
    expect(isStorageWorkerStartError(undefined)).toBe(false);
    expect(isStorageWorkerStartError(null)).toBe(false);
  });
});

// The stale-worker error the #242 proof captured in Chromium (a cached 16.21.1 worker under a 17.5.0
// main thread), verbatim: RxDB's remote storage wraps the worker's RxError (RM1) in a plain Error.
const RM1_MESSAGE =
  "could not create instance {\"name\":\"RxError (RM1)\",\"message\":\"\\n\\n        RxDB Error-Code: RM1.\\n        Hint: Error messages are not included in RxDB core to reduce build size.\\n        To show the full error messages and to ensure that you do not make any mistakes when using RxDB,\\n        use the dev-mode plugin when you are in development mode: https://rxdb.info/dev-mode.html?console=error\\n        \\nFind out more about this error here: https://rxdb.info/errors.html?console=errors#RM1 \\n\\n--------------------\\nParameters:\\nargs: {\\n  \\\"mainVersion\\\": \\\"17.5.0\\\",\\n  \\\"remoteVersion\\\": \\\"16.21.1\\\"\\n}\\n\",\"rxdb\":true,\"parameters\":{\"args\":{\"mainVersion\":\"17.5.0\",\"remoteVersion\":\"16.21.1\"}},\"code\":\"RM1\",\"url\":\"https://rxdb.info/errors.html?console=errors#RM1\",\"stack\":\"RxError (RM1):  \\n  \\n         RxDB Error-Code: RM1. \\n         Hint: Error messages are not included in RxDB core to reduce build size. \\n         To show the full error messages and to ensure that you do not make any mistakes when using RxDB, \\n         use the dev-mode plugin when you are in development mode: https://rxdb.info/dev-mode.html?console=error \\n          \\n Find out more about this error here: https://rxdb.info/errors.html?console=errors#RM1  \\n  \\n -------------------- \\n Parameters: \\n args: { \\n   \\\"mainVersion\\\": \\\"17.5.0\\\", \\n   \\\"remoteVersion\\\": \\\"16.21.1\\\" \\n } \\n  \\n     at newRxError (http://localhost:31338/v16/tallyui-sqlite-worker.js:12907:10) \\n     at Object.next (http://localhost:31338/v16/tallyui-sqlite-worker.js:19122:44) \\n     at ConsumerObserver2.next (http://localhost:31338/v16/tallyui-sqlite-worker.js:13775:25) \\n     at Subscriber2._next (http://localhost:31338/v16/tallyui-sqlite-worker.js:13745:22) \\n     at Subscriber2.next (http://localhost:31338/v16/tallyui-sqlite-worker.js:13718:12) \\n     at http://localhost:31338/v16/tallyui-sqlite-worker.js:14687:68 \\n     at OperatorSubscriber2._this._next (http://localhost:31338/v16/tallyui-sqlite-worker.js:14201:9) \\n     at Subscriber2.next (http://localhost:31338/v16/tallyui-sqlite-worker.js:13718:12) \\n     at http://localhost:31338/v16/tallyui-sqlite-worker.js:14562:22 \\n     at errorContext (http://localhost:31338/v16/tallyui-sqlite-worker.js:13685:5)\"}";

describe('isStorageWorkerStartError and a stale worker (RxDB RM1)', () => {
  it('recognises the real RM1 error, a { name, message } copy and the message alone', () => {
    const error = new Error(RM1_MESSAGE);
    expect('code' in error).toBe(false);
    expect(isStorageWorkerStartError(error)).toBe(true);
    expect(isStorageWorkerStartError({ name: 'Error', message: RM1_MESSAGE })).toBe(true);
    expect(isStorageWorkerStartError(RM1_MESSAGE)).toBe(true);
  });

  it('recognises an RxError with its own RM1 code', () => {
    expect(isStorageWorkerStartError(Object.assign(new Error('x'), { code: 'RM1' }))).toBe(true);
  });

  it('rejects the same message naming another RxDB code', () => {
    const other = RM1_MESSAGE.replace('"code":"RM1"', '"code":"COL23"');
    expect(other).toContain('"code":"COL23"');
    expect(isStorageWorkerStartError(new Error(other))).toBe(false);
    expect(isStorageWorkerStartError({ name: 'Error', message: other })).toBe(false);
    expect(isStorageWorkerStartError(other)).toBe(false);
  });
});
