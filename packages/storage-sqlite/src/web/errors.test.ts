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
