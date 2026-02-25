export interface SQLiteDatabase {
  execSync(source: string): void;
  getAllSync<T>(source: string, params?: any[]): T[];
  runSync(source: string, params?: any[]): { changes: number; lastInsertRowId: number };
}

export interface SQLiteStorageSettings {
  database: SQLiteDatabase;
}
