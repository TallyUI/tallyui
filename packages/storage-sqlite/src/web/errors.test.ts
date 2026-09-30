// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isRxdbRemoteVersionMismatch } from '@tallyui/core';
import { StorageUnavailableError, StorageWorkerStartError, isStorageHeldError, isStorageUnavailableError } from './errors';
import { isStorageWorkerStartError } from './is-storage-worker-start-error';

// The worker's messages (./worker), as RxDB's remote storage wraps them on the main thread.
const wrap = (name: string, message: string) => 'could not create instance ' + JSON.stringify({ name, message });
const UNAVAILABLE_MESSAGE =
  'StorageUnavailableError: this browser gives the page no OPFS storage (a private window?): UnknownError: The operation failed for an unknown transient reason (e.g. out of memory).';
const HELD_MESSAGE =
  'StorageWorkerStartError: another tab holds the database (opfs-sahpool): InvalidStateError: The object is in an invalid state.';

describe('StorageUnavailableError / isStorageUnavailableError (#293)', () => {
  it('names the error and keeps the cause', () => {
    const cause = new Error('UnknownError');
    const error = new StorageUnavailableError(UNAVAILABLE_MESSAGE, { cause });
    expect(error.name).toBe('StorageUnavailableError');
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(Error);
  });

  it('recognises the error, a { name, message } copy, the wrapped message and a bare string', () => {
    const forms = [
      new StorageUnavailableError(UNAVAILABLE_MESSAGE),
      { name: 'StorageUnavailableError', message: 'x' },
      new Error(wrap('StorageUnavailableError', UNAVAILABLE_MESSAGE)),
      wrap('StorageUnavailableError', UNAVAILABLE_MESSAGE),
    ];
    for (const form of forms) {
      expect(isStorageUnavailableError(form)).toBe(true);
      // A reload can't help, so it is never a failed start.
      expect(isStorageWorkerStartError(form)).toBe(false);
    }
  });

  it('is false for the held case, RM1 and unrelated errors', () => {
    expect(isStorageUnavailableError(new Error(wrap('StorageWorkerStartError', HELD_MESSAGE)))).toBe(false);
    expect(isStorageWorkerStartError(new Error(wrap('StorageWorkerStartError', HELD_MESSAGE)))).toBe(true);
    expect(isStorageUnavailableError(new Error(RM1_MESSAGE))).toBe(false);
    expect(isStorageUnavailableError({ name: 'TypeError', message: 'nope' })).toBe(false);
    expect(isStorageUnavailableError(undefined)).toBe(false);
    expect(isStorageUnavailableError(null)).toBe(false);
  });
});

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
  // The RM1 check itself is @tallyui/core's isRxdbRemoteVersionMismatch, tested there; this pins the wiring.
  it('recognises the real RM1 error and rejects a data error mentioning RM1', () => {
    expect(isStorageWorkerStartError(new Error(RM1_MESSAGE))).toBe(true);
    expect(isStorageWorkerStartError(new Error('Invalid SKU RM1 in row 3'))).toBe(false);
  });
});

// Each start failure in the forms it takes: as thrown, as a { name, message } copy, and as RxDB's remote storage
// wraps it on the main thread (RM1's wrapped shape is #280's, above).
const GENERIC_MESSAGE = 'StorageWorkerStartError: SQLite worker start failed: TypeError: boom';
const FAILURES = {
  unavailable: [
    new StorageUnavailableError(UNAVAILABLE_MESSAGE),
    { name: 'StorageUnavailableError', message: UNAVAILABLE_MESSAGE },
    new Error(wrap('StorageUnavailableError', UNAVAILABLE_MESSAGE)),
  ],
  held: [
    new StorageWorkerStartError(HELD_MESSAGE),
    { name: 'StorageWorkerStartError', message: HELD_MESSAGE },
    new Error(wrap('StorageWorkerStartError', HELD_MESSAGE)),
    wrap('StorageWorkerStartError', HELD_MESSAGE),
  ],
  stale: [
    Object.assign(new Error('RxDB Error-Code: RM1.'), { code: 'RM1', rxdb: true }),
    { name: 'Error', message: RM1_MESSAGE },
    new Error(RM1_MESSAGE),
  ],
  generic: [
    new StorageWorkerStartError(GENERIC_MESSAGE),
    { name: 'StorageWorkerStartError', message: GENERIC_MESSAGE },
    new Error(wrap('StorageWorkerStartError', GENERIC_MESSAGE)),
  ],
};
const PREDICATES = { unavailable: isStorageUnavailableError, held: isStorageHeldError, stale: isRxdbRemoteVersionMismatch };

describe('three start failures, told apart: unavailable, held, stale worker (#293)', () => {
  it.each(['unavailable', 'held', 'stale'] as const)('%s: its own predicate is true and the other two false, in every form', (failure) => {
    for (const form of FAILURES[failure]) {
      for (const [name, predicate] of Object.entries(PREDICATES)) {
        expect(predicate(form), `${name} on ${failure}: ${JSON.stringify(form)}`).toBe(name === failure);
      }
    }
  });

  it('a generic start failure: all three are false, and isStorageWorkerStartError is true', () => {
    for (const form of FAILURES.generic) {
      for (const [name, predicate] of Object.entries(PREDICATES)) expect(predicate(form), name).toBe(false);
      expect(isStorageWorkerStartError(form)).toBe(true);
    }
  });
});
