import type { MangoQuery, RxCollection } from 'rxdb';
import { readFresh } from '@tallyui/core/rxdb';

/** Most documents per background-check storage read or write, so an app query waits behind at most one chunk.
 * Perf spike: a 5,260-row write held the worker for 5.7 s. */
export const BACKGROUND_CHUNK_SIZE = 250;

/** Let the app's queued work run before the next chunk. */
export function pauseBetweenChunks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Read fresh storage data in ascending primary-key chunks, yielding to the event loop between reads. */
export async function* readFreshInChunks<T>(collection: RxCollection<T>, size = BACKGROUND_CHUNK_SIZE): AsyncGenerator<T[]> {
  const key = collection.schema.primaryPath;
  let after: string | undefined;
  while (true) {
    if (after !== undefined) await pauseBetweenChunks();
    const chunk = await readFresh(collection, {
      selector: after === undefined ? {} : { [key]: { $gt: after } },
      sort: [{ [key]: 'asc' }],
      limit: size,
    } as MangoQuery<T>);
    if (!chunk.length) return;
    yield chunk;
    if (chunk.length < size) return;
    after = (chunk[chunk.length - 1] as Record<string, unknown>)[key] as string;
  }
}
