import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { settings } from '../db/schema';

export async function getOpenCodeSetting(db: DrizzleDb, key: string): Promise<string | null> {
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (result.length === 0) return null;
  return result[0].value ?? null;
}

export async function setOpenCodeSetting(
  db: DrizzleDb,
  key: string,
  value: string | null,
): Promise<void> {
  if (value === null) {
    await db.delete(settings).where(eq(settings.key, key));
    return;
  }

  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export function parseOpenCodeServers(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function getOpenCodeServers(db: DrizzleDb): Promise<string[]> {
  const raw = await getOpenCodeSetting(db, 'opencode_servers');
  if (raw) return parseOpenCodeServers(raw);

  const envVal = process.env.OPENCODE_SERVER_URL;
  if (envVal) return parseOpenCodeServers(envVal);

  return [];
}

export async function getOpenCodeModel(db: DrizzleDb): Promise<string> {
  const raw = await getOpenCodeSetting(db, 'opencode_text_model');
  if (raw) return raw;
  return process.env.OPENCODE_MODEL ?? 'opencode/deepseek-v4-flash-free';
}
