import { BaseImageAdapter } from '../base-adapter';
import type { ImageGenerateRequest, ImageGenerateResult } from '../types';
import { normalizeImageBaseUrl } from '../utils';

function b64ToBytes (b64: string): Uint8Array {
  const cleaned = b64.includes(',') ? b64.split(',').pop() || '' : b64;
  return Uint8Array.from(Buffer.from(cleaned, 'base64'));
}

function decodeHtmlEntities (text: string): string {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function cleanImageUrl (url: string): string {
  let text = decodeHtmlEntities(String(url || '')).trim();

  /**
   * 去掉 Markdown title，例如：
   * https://xxx/image.png "Generated Image"
   */
  const titleMatch = text.match(/^(https?:\/\/\S+?)(?:\s+["'][\s\S]*["'])?$/i);
  if (titleMatch) text = titleMatch[1];

  text = text
    .replace(/^<+/, '')
    .replace(/>+$/, '')
    .replace(/[，。！？、；：]+$/g, '')
    .trim();

  /**
   * 裸 URL 可能被 Markdown 或文本带上结尾右括号。
   * 例如：
   * https://xxx/image.png)
   */
  while (text.endsWith(')') && !text.includes('(')) {
    text = text.slice(0, -1).trim();
  }

  return text;
}

function addMaybeImageUrl (
  input: string,
  b64: Set<string>,
  urls: Set<string>,
  others?: Set<string>
): void {
  const url = cleanImageUrl(input);
  if (!url) return;

  if (url.startsWith('data:image/')) {
    b64.add(url);
    return;
  }

  if (/^https?:\/\//i.test(url)) {
    urls.add(url);
    return;
  }

  /**
   * 记录非 http/https 的内容，方便排查：
   * 例如模型返回：
   * ![Generated Image](这是链接)
   */
  others?.add(url);
}

function extractDataImageBase64FromText (text: string): string[] {
  const raw = String(text || '');
  const result: string[] = [];

  for (const match of raw.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=_-]+/g)) {
    if (match[0]) result.push(match[0]);
  }

  return result;
}

function extractImageUrlsFromText (text: string): {
  b64: string[];
  urls: string[];
  others: string[];
} {
  const raw = decodeHtmlEntities(String(text || ''));
  const b64 = new Set<string>();
  const urls = new Set<string>();
  const others = new Set<string>();

  /**
   * Markdown 图片 / 普通 Markdown 链接：
   *
   * ![Generated Image](https://flow-content.google/image/xxx?... )
   * [image](https://xxx)
   *
   * 这里故意不要求括号里必须是 https，
   * 先完整取出来，再由 addMaybeImageUrl 判断，便于排查非 URL 返回。
   */
  for (const match of raw.matchAll(/!?\[[^\]]*]\(([\s\S]*?)\)/g)) {
    const inside = String(match[1] || '').trim();
    if (inside) addMaybeImageUrl(inside, b64, urls, others);
  }

  /**
   * HTML img 标签：
   * <img src="https://xxx">
   */
  for (const match of raw.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const src = String(match[1] || '').trim();
    if (src) addMaybeImageUrl(src, b64, urls, others);
  }

  /**
   * data:image base64
   */
  for (const item of extractDataImageBase64FromText(raw)) {
    b64.add(item);
  }

  /**
   * 裸 URL：
   *
   * https://flow-content.google/image/xxx?Expires=xxx&KeyName=xxx&Signature=xxx
   *
   * 你刚才给的这种链接可以被这里识别。
   */
  for (const match of raw.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
    const url = cleanImageUrl(match[0]);
    if (url) urls.add(url);
  }

  return {
    b64: Array.from(b64),
    urls: Array.from(urls),
    others: Array.from(others),
  };
}

async function fetchImageUrl (url: string, timeout: number): Promise<Uint8Array | null> {
  if (url.startsWith('data:image/')) return b64ToBytes(url);

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Connection': 'close',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://flow.google/',
      },
    });

    if (!res.ok) {
      console.warn('[GeminiOpenAIImageAdapter] 图片链接下载失败 HTTP:', res.status, url);
      return null;
    }

    const bytes = new Uint8Array(await res.arrayBuffer());

    if (!bytes.byteLength) {
      console.warn('[GeminiOpenAIImageAdapter] 图片链接下载为空:', url);
      return null;
    }

    return bytes;
  } catch (e) {
    console.warn('[GeminiOpenAIImageAdapter] 图片链接下载异常:', url, e);
    return null;
  } finally {
    clearTimeout(id);
  }
}

function collectImagesFromUnknown (value: unknown): {
  b64: string[];
  urls: string[];
  others: string[];
} {
  const b64 = new Set<string>();
  const urls = new Set<string>();
  const others = new Set<string>();

  const walk = (v: unknown): void => {
    if (!v) return;

    if (typeof v === 'string') {
      const extracted = extractImageUrlsFromText(v);

      for (const item of extracted.b64) b64.add(item);
      for (const item of extracted.urls) urls.add(item);
      for (const item of extracted.others) others.add(item);

      return;
    }

    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }

    if (typeof v !== 'object') return;

    const obj = v as Record<string, unknown>;

    /**
     * OpenAI Images:
     * { b64_json: "..." }
     */
    if (typeof obj.b64_json === 'string' && obj.b64_json.trim()) {
      b64.add(obj.b64_json.trim());
    }

    /**
     * 常见 URL:
     * { url: "https://..." }
     */
    if (typeof obj.url === 'string' && obj.url.trim()) {
      addMaybeImageUrl(obj.url, b64, urls, others);
    }

    /**
     * 兼容一些代理接口常见字段：
     * { image: "https://..." }
     * { imageUrl: "https://..." }
     * { image_url: "https://..." }
     * { output: "![...](https://...)" }
     * { content: "![...](https://...)" }
     * { text: "![...](https://...)" }
     */
    for (const key of ['image', 'imageUrl', 'image_url', 'output', 'content', 'text']) {
      if (typeof obj[key] === 'string' && String(obj[key]).trim()) {
        walk(obj[key]);
      }
    }

    /**
     * OpenAI Vision 格式:
     * { image_url: { url: "..." } }
     */
    const imageUrl = obj.image_url as Record<string, unknown> | undefined;
    if (imageUrl && typeof imageUrl.url === 'string') {
      addMaybeImageUrl(imageUrl.url, b64, urls, others);
    }

    /**
     * Gemini 原生兼容字段：
     * inline_data / inlineData
     */
    const inlineData1 = obj.inline_data as Record<string, unknown> | undefined;
    if (inlineData1 && typeof inlineData1.data === 'string' && inlineData1.data.trim()) {
      b64.add(inlineData1.data.trim());
    }

    const inlineData2 = obj.inlineData as Record<string, unknown> | undefined;
    if (inlineData2 && typeof inlineData2.data === 'string' && inlineData2.data.trim()) {
      b64.add(inlineData2.data.trim());
    }

    /**
     * 递归扫描所有字段，兼容各种代理返回结构：
     * choices[0].message.content
     * candidates[0].content.parts
     * data[0].url
     * 等等
     */
    for (const child of Object.values(obj)) {
      walk(child);
    }
  };

  walk(value);

  return {
    b64: Array.from(b64),
    urls: Array.from(urls),
    others: Array.from(others),
  };
}

export class GeminiOpenAIImageAdapter extends BaseImageAdapter {
  async generate(req: ImageGenerateRequest): Promise<ImageGenerateResult> {
    const base = normalizeImageBaseUrl(this.baseUrl);
    const url = `${base}/v1/chat/completions`;

    const content: unknown[] = [
      { type: 'text', text: `Generate an image: ${req.prompt}` },
    ];

    for (const img of req.images || []) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mime_type};base64,${Buffer.from(img.data).toString('base64')}`,
        },
      });
    }

    const payload = {
      model: this.model,
      messages: [{ role: 'user', content }],
      modalities: ['image', 'text'],
      stream: false,
    };

    const res = await this.postJson(url, payload);

    if (!res.ok) {
      return {
        error: `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`,
      };
    }

    const data = await res.json();

    const collected = collectImagesFromUnknown(data);
    const images: Uint8Array[] = [];

    for (const item of collected.b64) {
      try {
        const bytes = b64ToBytes(item);
        if (bytes.byteLength) images.push(bytes);
      } catch (e) {
        console.warn('[GeminiOpenAIImageAdapter] base64 解码失败:', e);
      }
    }

    for (const item of collected.urls) {
      const bytes = await fetchImageUrl(item, this.timeout);
      if (bytes?.byteLength) images.push(bytes);
    }

    if (!images.length) {
      const preview = JSON.stringify(data).slice(0, 1000);

      if (collected.urls.length) {
        return {
          error: [
            '未生成任何图片。接口返回了图片链接，但下载失败。',
            `识别到链接数: ${collected.urls.length}`,
            `链接预览: ${collected.urls.slice(0, 3).join(' | ')}`,
            `返回预览: ${preview}`,
          ].join('\n'),
        };
      }

      if (collected.b64.length) {
        return {
          error: [
            '未生成任何图片。接口返回了 base64 图片数据，但解码失败。',
            `base64 数量: ${collected.b64.length}`,
            `返回预览: ${preview}`,
          ].join('\n'),
        };
      }

      if (collected.others.length) {
        return {
          error: [
            '未生成任何图片。接口返回了疑似图片链接，但不是 http/https 或 data:image，当前无法直接下载。',
            `识别到非 HTTP 内容: ${collected.others.slice(0, 3).join(' | ')}`,
            `返回预览: ${preview}`,
          ].join('\n'),
        };
      }

      return {
        error: `未生成任何图片。接口已返回，但未识别到可下载图片字段。返回预览: ${preview}`,
      };
    }

    return { images };
  }
}