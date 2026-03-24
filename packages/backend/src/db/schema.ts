import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

function randomHexColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').unique().notNull(),
  password_hash: text('password_hash'),
  role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
  avatar_color: text('avatar_color').default('#4ECDC4').notNull(),
  created_at: integer('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
});

export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  container_id: text('container_id').unique().notNull(),
  name: text('name').notNull(),
  image: text('image').notNull(),
  ports: text('ports').notNull().default('[]'),
  labels: text('labels').notNull().default('{}'),
  display_name: text('display_name'),
  ai_description: text('ai_description'),
  custom_description: text('custom_description'),
  status: text('status', { enum: ['online', 'offline'] }).default('online').notNull(),
  last_seen_at: integer('last_seen_at').notNull(),
});

export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  order: integer('order').default(0).notNull(),
  created_by: integer('created_by').references(() => users.id).notNull(),
});

export const service_page_assignments = sqliteTable('service_page_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  service_id: integer('service_id').references(() => services.id).notNull(),
  page_id: integer('page_id').references(() => pages.id).notNull(),
  order: integer('order').default(0).notNull(),
});

export const user_service_prefs = sqliteTable('user_service_prefs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  service_id: integer('service_id').references(() => services.id).notNull(),
  is_hidden: integer('is_hidden').default(0).notNull(),
  preferred_port: integer('preferred_port'),
});

export const admin_service_overrides = sqliteTable('admin_service_overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  service_id: integer('service_id').references(() => services.id).notNull(),
  target_user_id: integer('target_user_id').references(() => users.id),
  is_force_hidden: integer('is_force_hidden').default(1).notNull(),
});

export const refresh_tokens = sqliteTable('refresh_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  token: text('token').unique().notNull(),
  expires_at: integer('expires_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Service = typeof services.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type RefreshToken = typeof refresh_tokens.$inferSelect;
export type Setting = typeof settings.$inferSelect;
