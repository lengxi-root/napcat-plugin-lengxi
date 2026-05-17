import type { AIConfig, AIMessage, AIResponse, Tool } from '../types';

export interface RequestMeta {
  bot_id?: string;
  owner_ids?: string[];
  user_id?: string;
}

export class AIClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private timeout: number;
  private meta: RequestMeta = {};

  constructor (config: AIConfig) {
    const base = config.base_url.replace(/\/+$/, '').replace(/\/v1$/i, '');
    this.baseUrl = `${base}/v1/chat/completions`;
    this.apiKey = config.api_key;
    this.model = config.model;
    this.timeout = config.timeout;
  }

  setMeta (meta: RequestMeta): void { this.meta = meta; }
  setModel (model: string): void { this.model = model; }
  getModel (): string { return this.model; }

  async chatWithTools (messages: AIMessage[], tools: Tool[]): Promise<AIResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const payload: Record<string, unknown> = {
        model: this.model,
        messages: messages.map(m => {
          if (typeof m.content === 'string') {
            return m.content ? m : { ...m, content: '(empty)' };
          }

          if (Array.isArray(m.content) && m.content.length > 0) {
            return m;
          }

          return { ...m, content: '(empty)' };
        }),
      };

      if (tools.length) {
        payload.tools = tools;
        payload.tool_choice = 'auto';
      }

//      if (this.meta.bot_id) payload.bot_id = this.meta.bot_id;
//      if (this.meta.owner_ids?.length) payload.owner_ids = this.meta.owner_ids;
//      if (this.meta.user_id) payload.user_id = this.meta.user_id;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        return {
          choices: [],
          error: `HTTP错误: ${res.status}`,
          detail: (await res.text()).slice(0, 500),
        };
      }

      return await res.json() as AIResponse;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof Error && e.name === 'AbortError') return { choices: [], error: '请求超时' };
      return { choices: [], error: String(e) };
    }
  }

  async chatSimple (messages: AIMessage[]): Promise<string> {
    const res = await this.chatWithTools(messages, []);
  
    if (res.error) {
      throw new Error(`${res.error}${res.detail ? ` | ${res.detail}` : ''}`);
    }
  
    const content = res.choices?.[0]?.message?.content;
  
    if (typeof content === 'string') {
      return content;
    }
  
    /**
     * 兼容部分 OpenAI 兼容接口返回数组 content：
     * [
     *   { type: "text", text: "..." }
     * ]
     */
    if (Array.isArray(content)) {
      return content
        .map(item => {
          if (typeof item === 'string') return item;
  
          if (item && typeof item === 'object') {
            const obj = item as Record<string, unknown>;
            return String(obj.text || obj.content || '');
          }
  
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
    }
  
    return '';
  }
}
