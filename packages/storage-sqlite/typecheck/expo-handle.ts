import type { SQLiteDatabase as ExpoSQLiteDatabase } from 'expo-sqlite';
import { getRxStorageSQLite } from '../src/rx-storage-sqlite';

declare const expoDatabase: ExpoSQLiteDatabase;
declare const missingRunSync: Omit<ExpoSQLiteDatabase, 'runSync'>;

const accepted: Parameters<typeof getRxStorageSQLite>[0] = expoDatabase;
// @ts-expect-error A handle without runSync cannot execute writes.
const rejected: Parameters<typeof getRxStorageSQLite>[0] = missingRunSync;
