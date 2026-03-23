import type { DrizzleDb } from './index';
import { sql } from 'drizzle-orm';

export async function runMigrations(db: DrizzleDb): Promise<void> {
  // Create tables if they don't exist (simple migration approach for SQLite)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      avatar_color TEXT NOT NULL DEFAULT '#4ECDC4',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      ports TEXT NOT NULL DEFAULT '[]',
      labels TEXT NOT NULL DEFAULT '{}',
      ai_description TEXT,
      custom_description TEXT,
      status TEXT NOT NULL DEFAULT 'online' CHECK(status IN ('online', 'offline')),
      last_seen_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL REFERENCES users(id)
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS service_page_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL REFERENCES services(id),
      page_id INTEGER NOT NULL REFERENCES pages(id),
      "order" INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS user_service_prefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      service_id INTEGER NOT NULL REFERENCES services(id),
      is_hidden INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Add preferred_port column to user_service_prefs if it doesn't exist
  try {
    db.run(sql`ALTER TABLE user_service_prefs ADD COLUMN preferred_port INTEGER`);
  } catch {
    // Column already exists, ignore
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS admin_service_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL REFERENCES services(id),
      target_user_id INTEGER REFERENCES users(id),
      is_force_hidden INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}
