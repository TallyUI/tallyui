import { map } from 'rxjs';
import type { Observable } from 'rxjs';
import type { RxCollection, MangoQuery } from 'rxdb';
import type { Repository } from './types';

export function createRepository<T extends { id: string }>(
  collection: RxCollection<T>,
): Repository<T> {
  return {
    findById$(id: string): Observable<T | null> {
      return collection.findOne(id).$.pipe(
        map((doc) => (doc ? (doc.toJSON() as T) : null)),
      );
    },

    findAll$(query?: MangoQuery<T>): Observable<T[]> {
      const q = query ? collection.find(query) : collection.find();
      return q.$.pipe(
        map((docs) => docs.map((d) => d.toJSON() as T)),
      );
    },

    search$(term: string, fields: (keyof T)[]): Observable<T[]> {
      const regex = new RegExp(term, 'i');
      return collection.find().$.pipe(
        map((docs) =>
          docs
            .filter((doc) => {
              const json = doc.toJSON() as Record<string, unknown>;
              return fields.some((field) => {
                const val = json[field as string];
                return typeof val === 'string' && regex.test(val);
              });
            })
            .map((d) => d.toJSON() as T),
        ),
      );
    },

    count$(): Observable<number> {
      return collection.count().$.pipe(
        map((count) => count),
      );
    },

    async create(data: Partial<T>): Promise<T> {
      const doc = await collection.insert(data as T);
      return doc.toJSON() as T;
    },

    async update(id: string, patch: Partial<T>): Promise<T> {
      const doc = await collection.findOne(id).exec();
      if (!doc) throw new Error(`Document ${id} not found`);
      const updated = await doc.incrementalPatch(patch);
      return updated.toJSON() as T;
    },

    async remove(id: string): Promise<void> {
      const doc = await collection.findOne(id).exec();
      if (!doc) throw new Error(`Document ${id} not found`);
      await doc.remove();
    },

    async bulkCreate(items: Partial<T>[]): Promise<T[]> {
      const result = await collection.bulkInsert(items as T[]);
      return result.success.map((d) => d.toJSON() as T);
    },

    async bulkRemove(ids: string[]): Promise<void> {
      await collection.bulkRemove(ids);
    },
  };
}
