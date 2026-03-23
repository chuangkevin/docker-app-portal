import { GoogleGenerativeAI } from '@google/generative-ai';
import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { services, settings, type Service } from '../db/schema';

export class GeminiService {
  private db: DrizzleDb;

  constructor(db: DrizzleDb) {
    this.db = db;
  }

  private async getApiKey(): Promise<string | null> {
    const result = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'gemini_api_key'))
      .limit(1);

    if (result.length === 0 || !result[0].value) {
      return null;
    }
    return result[0].value;
  }

  async generateDescription(service: Service): Promise<void> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      // No API key configured, skip silently
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `你是一個 Docker 服務分析師。根據以下容器資訊，用繁體中文寫一段 2-3 句的服務介紹，說明這個服務的用途。容器名稱：${service.name}，映像：${service.image}，開放端口：${service.ports}，標籤：${JSON.stringify(service.labels)}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    if (text) {
      await this.db
        .update(services)
        .set({ ai_description: text })
        .where(eq(services.id, service.id));
    }
  }
}
