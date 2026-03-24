import { eq, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { settings } from '../db/schema';

let keyIndex = 0;
let cachedKeys: string[] = [];
let lastLoadTime = 0;
const CACHE_TTL = 60_000;

let _db: DrizzleDb;

export function initGeminiKeys(db: DrizzleDb): void {
  _db = db;
}

function getDb(): DrizzleDb {
  if (!_db) throw new Error('GeminiKeys not initialized. Call initGeminiKeys(db) first.');
  return _db;
}

/** Load keys from DB settings, with 60s cache */
export function loadKeys(): string[] {
  const now = Date.now();
  if (cachedKeys.length > 0 && now - lastLoadTime < CACHE_TTL) return cachedKeys;

  const db = getDb();
  const keys: string[] = [];

  // 1. gemini_api_keys (comma-separated list, new format)
  const multi = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'gemini_api_keys'))
    .limit(1)
    .all();

  if (multi.length > 0 && multi[0].value) {
    keys.push(
      ...multi[0].value
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    );
  }

  // 2. gemini_api_key (single key, legacy compat)
  const single = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'gemini_api_key'))
    .limit(1)
    .all();

  if (single.length > 0 && single[0].value) {
    keys.push(single[0].value.trim());
  }

  // Deduplicate preserving order
  const seen = new Set<string>();
  cachedKeys = keys.filter((k) => {
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  lastLoadTime = now;
  return cachedKeys;
}

/** Force reload keys from DB */
export function invalidateCache(): void {
  lastLoadTime = 0;
  cachedKeys = [];
}

/** Get the next API key using round-robin */
export function getNextKey(): string | null {
  const keys = loadKeys();
  if (keys.length === 0) return null;
  const key = keys[keyIndex % keys.length];
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

/** Get a key excluding the failed one (for 429 failover) */
export function getKeyExcluding(failedKey: string): string | null {
  const keys = loadKeys().filter((k) => k !== failedKey);
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}

/** Record token usage from a Gemini API call */
export function trackUsage(
  apiKey: string,
  model: string,
  callType: string,
  usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined,
): void {
  try {
    const db = getDb();
    const suffix = apiKey.slice(-4);
    const prompt = usageMetadata?.promptTokenCount || 0;
    const completion = usageMetadata?.candidatesTokenCount || 0;
    const total = usageMetadata?.totalTokenCount || 0;
    db.run(
      sql`INSERT INTO api_key_usage (api_key_suffix, model, call_type, prompt_tokens, completion_tokens, total_tokens) VALUES (${suffix}, ${model}, ${callType}, ${prompt}, ${completion}, ${total})`,
    );
  } catch {
    // Non-fatal
  }
}

/** Get aggregated usage stats (today, week, month) */
export function getUsageStats(): {
  today: { calls: number; tokens: number };
  week: { calls: number; tokens: number };
  month: { calls: number; tokens: number };
} {
  const db = getDb();

  const todayResult = db.all<{ calls: number; tokens: number }>(
    sql`SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens FROM api_key_usage WHERE date(created_at) = date('now')`,
  );
  const weekResult = db.all<{ calls: number; tokens: number }>(
    sql`SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens FROM api_key_usage WHERE created_at >= datetime('now', '-7 days')`,
  );
  const monthResult = db.all<{ calls: number; tokens: number }>(
    sql`SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens FROM api_key_usage WHERE created_at >= datetime('now', '-30 days')`,
  );

  const today = todayResult[0] || { calls: 0, tokens: 0 };
  const week = weekResult[0] || { calls: 0, tokens: 0 };
  const month = monthResult[0] || { calls: 0, tokens: 0 };

  return {
    today: { calls: today.calls, tokens: today.tokens },
    week: { calls: week.calls, tokens: week.tokens },
    month: { calls: month.calls, tokens: month.tokens },
  };
}

/** Get per-key stats for today */
export function getKeyStats(): Array<{
  suffix: string;
  todayCalls: number;
  todayTokens: number;
}> {
  const db = getDb();
  const keys = loadKeys();

  return keys.map((k) => {
    const suffix = k.slice(-4);
    const result = db.all<{ calls: number; tokens: number }>(
      sql`SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens FROM api_key_usage WHERE api_key_suffix = ${suffix} AND date(created_at) = date('now')`,
    );
    const row = result[0] || { calls: 0, tokens: 0 };
    return {
      suffix,
      todayCalls: row.calls,
      todayTokens: row.tokens,
    };
  });
}

/** Add keys from multi-line text. Returns { added, total }. */
export function addKeysFromText(text: string): { added: number; total: number } {
  const db = getDb();
  const lines = text.split(/[\n,]+/);
  const newKeys: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('AIza') && trimmed.length >= 30) {
      newKeys.push(trimmed);
    }
  }

  if (newKeys.length === 0) {
    return { added: 0, total: loadKeys().length };
  }

  const existingKeys = loadKeys();
  const existingSet = new Set(existingKeys);
  const toAdd = newKeys.filter((k) => !existingSet.has(k));

  // Deduplicate within new keys
  const seen = new Set<string>();
  const uniqueToAdd = toAdd.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (uniqueToAdd.length === 0) {
    return { added: 0, total: existingKeys.length };
  }

  const allKeys = [...existingKeys, ...uniqueToAdd];
  const value = allKeys.join(',');

  // Upsert gemini_api_keys
  const existing = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'gemini_api_keys'))
    .limit(1)
    .all();

  if (existing.length > 0) {
    db.update(settings)
      .set({ value })
      .where(eq(settings.key, 'gemini_api_keys'))
      .run();
  } else {
    db.insert(settings)
      .values({ key: 'gemini_api_keys', value })
      .run();
  }

  invalidateCache();
  return { added: uniqueToAdd.length, total: allKeys.length };
}

/** Remove a key by suffix. Returns true if found and removed. */
export function removeKeyBySuffix(suffix: string): boolean {
  const keys = loadKeys();
  const target = keys.find((k) => k.slice(-4) === suffix);
  if (!target) return false;

  const db = getDb();
  const filtered = keys.filter((k) => k.slice(-4) !== suffix);
  const value = filtered.join(',');

  const existing = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'gemini_api_keys'))
    .limit(1)
    .all();

  if (existing.length > 0) {
    db.update(settings)
      .set({ value })
      .where(eq(settings.key, 'gemini_api_keys'))
      .run();
  } else {
    db.insert(settings)
      .values({ key: 'gemini_api_keys', value })
      .run();
  }

  invalidateCache();
  return true;
}
