import type { ImageGenerateRequest, ImageGenerateResult } from '../types';

export abstract class BaseImageAdapter {
  protected baseUrl: string;
  protected apiKey: string;
  protected model: string;
  protected timeout: number;
  protected proxy?: string;

  constructor (baseUrl: string, apiKey: string, model: string, timeout: number, proxy?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
    this.timeout = timeout;
    this.proxy = proxy;
  }

  protected async fetchRaw (url: string, init: RequestInit = {}): Promise<Response> {
    return await fetch(url, init);
  }

  protected async postJson (url: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await this.fetchRaw(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Connection': 'close',
          'User-Agent': 'AI-Cat/1.0',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(id);
    }
  }

  abstract generate(req: ImageGenerateRequest): Promise<ImageGenerateResult>;
}
