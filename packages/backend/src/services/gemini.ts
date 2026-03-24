import { GoogleGenerativeAI } from '@google/generative-ai';
import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { services, type Service } from '../db/schema';
import * as geminiKeys from './geminiKeys';

export class GeminiService {
  private db: DrizzleDb;

  constructor(db: DrizzleDb) {
    this.db = db;
  }

  private async withRetry<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
    let currentKey = geminiKeys.getNextKey();
    if (!currentKey) throw new Error('No API keys configured');

    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await fn(currentKey);
      } catch (err: any) {
        const is429 =
          err?.status === 429 ||
          err?.message?.includes('429') ||
          err?.message?.includes('RESOURCE_EXHAUSTED');
        if (!is429 || attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 3000));
        const next = geminiKeys.getKeyExcluding(currentKey);
        if (next) currentKey = next;
      }
    }
    // TypeScript: unreachable, but satisfies return type
    throw new Error('Retry exhausted');
  }

  async generateDescription(service: Service): Promise<void> {
    const hasKeys = geminiKeys.loadKeys();
    if (hasKeys.length === 0) {
      // No API key configured, skip silently
      return;
    }

    const prompt = `你是一個 Docker 服務分析師。根據以下容器資訊，用繁體中文寫一段 2-3 句的服務介紹，說明這個服務的用途。容器名稱：${service.name}，映像：${service.image}，開放端口：${service.ports}，標籤：${JSON.stringify(service.labels)}`;

    await this.withRetry(async (apiKey) => {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      geminiKeys.trackUsage(apiKey, 'gemini-2.5-flash', 'service-description', response.usageMetadata);

      if (text) {
        await this.db
          .update(services)
          .set({ ai_description: text })
          .where(eq(services.id, service.id));
      }
    });
  }
}
