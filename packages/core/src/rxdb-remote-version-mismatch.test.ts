// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isRxdbRemoteVersionMismatch } from './rxdb-remote-version-mismatch';

// The stale-worker error the #242 proof captured in Chromium (a cached 16.21.1 worker under a 17.5.0
// main thread), verbatim: RxDB's remote storage wraps the worker's RxError (RM1) in a plain Error.
const RM1_MESSAGE =
  "could not create instance {\"name\":\"RxError (RM1)\",\"message\":\"\\n\\n        RxDB Error-Code: RM1.\\n        Hint: Error messages are not included in RxDB core to reduce build size.\\n        To show the full error messages and to ensure that you do not make any mistakes when using RxDB,\\n        use the dev-mode plugin when you are in development mode: https://rxdb.info/dev-mode.html?console=error\\n        \\nFind out more about this error here: https://rxdb.info/errors.html?console=errors#RM1 \\n\\n--------------------\\nParameters:\\nargs: {\\n  \\\"mainVersion\\\": \\\"17.5.0\\\",\\n  \\\"remoteVersion\\\": \\\"16.21.1\\\"\\n}\\n\",\"rxdb\":true,\"parameters\":{\"args\":{\"mainVersion\":\"17.5.0\",\"remoteVersion\":\"16.21.1\"}},\"code\":\"RM1\",\"url\":\"https://rxdb.info/errors.html?console=errors#RM1\",\"stack\":\"RxError (RM1):  \\n  \\n         RxDB Error-Code: RM1. \\n         Hint: Error messages are not included in RxDB core to reduce build size. \\n         To show the full error messages and to ensure that you do not make any mistakes when using RxDB, \\n         use the dev-mode plugin when you are in development mode: https://rxdb.info/dev-mode.html?console=error \\n          \\n Find out more about this error here: https://rxdb.info/errors.html?console=errors#RM1  \\n  \\n -------------------- \\n Parameters: \\n args: { \\n   \\\"mainVersion\\\": \\\"17.5.0\\\", \\n   \\\"remoteVersion\\\": \\\"16.21.1\\\" \\n } \\n  \\n     at newRxError (http://localhost:31338/v16/tallyui-sqlite-worker.js:12907:10) \\n     at Object.next (http://localhost:31338/v16/tallyui-sqlite-worker.js:19122:44) \\n     at ConsumerObserver2.next (http://localhost:31338/v16/tallyui-sqlite-worker.js:13775:25) \\n     at Subscriber2._next (http://localhost:31338/v16/tallyui-sqlite-worker.js:13745:22) \\n     at Subscriber2.next (http://localhost:31338/v16/tallyui-sqlite-worker.js:13718:12) \\n     at http://localhost:31338/v16/tallyui-sqlite-worker.js:14687:68 \\n     at OperatorSubscriber2._this._next (http://localhost:31338/v16/tallyui-sqlite-worker.js:14201:9) \\n     at Subscriber2.next (http://localhost:31338/v16/tallyui-sqlite-worker.js:13718:12) \\n     at http://localhost:31338/v16/tallyui-sqlite-worker.js:14562:22 \\n     at errorContext (http://localhost:31338/v16/tallyui-sqlite-worker.js:13685:5)\"}";

const forms = (message: string) => [new Error(message), { name: 'Error', message }, message];

describe('isRxdbRemoteVersionMismatch (RxDB RM1)', () => {
  it('recognises the real RM1 error, a { name, message } copy and the message alone', () => {
    const error = new Error(RM1_MESSAGE);
    expect('code' in error).toBe(false);
    for (const form of forms(RM1_MESSAGE)) expect(isRxdbRemoteVersionMismatch(form)).toBe(true);
  });

  it('recognises an RxError by its own RM1 code, unless rxdb says it is not one', () => {
    expect(isRxdbRemoteVersionMismatch(Object.assign(new Error('x'), { code: 'RM1' }))).toBe(true);
    expect(isRxdbRemoteVersionMismatch(Object.assign(new Error('x'), { code: 'RM1', rxdb: true }))).toBe(true);
    expect(isRxdbRemoteVersionMismatch(Object.assign(new Error('x'), { code: 'RM1', rxdb: false }))).toBe(false);
  });

  it('rejects RM1 text that is not the remote storage wrapping an RxError, and other RxDB codes', () => {
    const otherCode = RM1_MESSAGE.replace('"code":"RM1"', '"code":"COL23"');
    const otherPrefix = RM1_MESSAGE.replace('could not create instance ', 'could not update instance ');
    expect(otherCode).not.toBe(RM1_MESSAGE);
    expect(otherPrefix).not.toBe(RM1_MESSAGE);
    const notRm1 = [
      'Invalid SKU RM1 in row 3',
      'Invalid value {"code":"RM1"}',
      'could not create instance ' + JSON.stringify({ name: 'RxError (RM1)', code: 'RM1' }),
      'could not create instance {"rxdb":true,"code":"RM1"',
      otherCode,
      otherPrefix,
    ];
    for (const message of notRm1) {
      for (const form of forms(message)) expect(isRxdbRemoteVersionMismatch(form), message.slice(0, 40)).toBe(false);
    }
    for (const value of [undefined, null, 42, {}]) expect(isRxdbRemoteVersionMismatch(value)).toBe(false);
  });
});
