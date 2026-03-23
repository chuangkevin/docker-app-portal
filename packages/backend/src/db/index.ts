import Database, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export interface DbConnection {
  db: ReturnType<typeof drizzle>;
  sqlite: BetterSqliteDatabase;
}

export function createDb(databasePath: string): DbConnection {
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export type DrizzleDb = ReturnType<typeof drizzle>;
