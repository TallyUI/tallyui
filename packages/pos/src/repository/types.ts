import type { Observable } from 'rxjs';
import type { MangoQuery } from 'rxdb';

export interface Repository<T> {
  findById$(id: string): Observable<T | null>;
  findAll$(query?: MangoQuery<T>): Observable<T[]>;
  search$(term: string, fields: (keyof T)[]): Observable<T[]>;
  count$(): Observable<number>;

  create(data: Partial<T>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
  bulkCreate(items: Partial<T>[]): Promise<T[]>;
  bulkRemove(ids: string[]): Promise<void>;
}
