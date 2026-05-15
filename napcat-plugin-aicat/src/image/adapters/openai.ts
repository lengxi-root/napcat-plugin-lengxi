import { BaseImageAdapter } from '../base-adapter';
import type { ImageGenerateRequest, ImageGenerateResult } from '../types';
import { aspectRatioToOpenAISize, normalizeImageBaseUrl } from '../utils';

function isGptImageModel (model: string): boolean {
  return model.toLowerCase().includes('gpt-image');
}

function mapAspectRatioToGptImageSize (aspect?: string): string {
  if (!aspect || aspect === '自动') return 'auto';

  const horizontal = new Set(['3:2', '16:9', '4:3', '5:4', '21:9']);
  const vertical = new Set(['2:3', '3:4', '9:16', '4:5']);

  if (aspect === '1:1') return '1024x1024';
  if (horizontal.has(aspect)) return '1536x1024';
  if (vertical.has(aspect)) return '1024x1536';

  return 'auto';
}

function b64ToBytes (b64: string): Uint8Array {
  const cleaned = b64.includes(',') ? b64.split(',').pop() || '' : b64;
  return Uint8Array.from(Buffer.from(cleaned, 'base64'));
}

async function fetchImageUrl (url: string, timeout: number): Promise<Uint8Array | null> {
  if (url.startsWith('data:image/')) return b64ToBytes(url);

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'image/*,*/*',
        'Connection': 'close',
        'User-Agent': 'AI-Cat/1.0',
      },
    });

    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

async function extractOpenAIImages (data: unknown, timeout: number): Promise<Uint8Array[]> {
  const result: Uint8Array[] = [];
  const record = data as { data?: { b64_json?: string; url?: string; }[]; };

  for (const item of record.data || []) {
    if (item.b64_json) {
      result.push(b64ToBytes(item.b64_json));
      continue;
    }

    if (item.url) {
      const bytes = await fetchImageUrl(item.url, timeout);
      if (bytes) result.push(bytes);
    }
  }

  return result;
}

export class OpenAIImageAdapter extends BaseImageAdapter {
  async generate(req: ImageGenerateRequest): Promise<ImageGenerateResult> {
    const gptImage = isGptImageModel(this.model || '');
    const hasReferenceImages = Boolean(req.images?.length);

    if (hasReferenceImages) {
      if (!gptImage) {
        return {
          error: 'OpenAI 图生图仅支持 gpt-image 系列模型，DALL-E 系列不支持参考图',
        };
      }

      return this.generateEdit(req);
    }

    return this.generateImage(req, gptImage);
  }

  private async generateImage (
    req: ImageGenerateRequest,
    gptImage: boolean
  ): Promise<ImageGenerateResult> {
    const base = normalizeImageBaseUrl(this.baseUrl) || 'https://api.openai.com';
    const url = `${base}/v1/images/generations`;

    const payload: Record<string, unknown> = {
      model: this.model || (gptImage ? 'gpt-image-1' : 'dall-e-3'),
      prompt: req.prompt,
      n: 1,
    };

    if (gptImage) {
      payload.size = mapAspectRatioToGptImageSize(req.aspect_ratio);
      payload.response_format = 'b64_json';
    } else {
      payload.size = aspectRatioToOpenAISize(req.aspect_ratio);
      payload.response_format = 'b64_json';
    }

    const res = await this.postJson(url, payload);
    if (!res.ok) {
      return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}` };
    }

    const data = await res.json();
    const images = await extractOpenAIImages(data, this.timeout);

    if (!images.length) return { error: '未生成任何图片' };
    return { images };
  }

  private async generateEdit (req: ImageGenerateRequest): Promise<ImageGenerateResult> {
    const base = normalizeImageBaseUrl(this.baseUrl) || 'https://api.openai.com';
    const url = `${base}/v1/images/edits`;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const form = new FormData();

      form.append('model', this.model || 'gpt-image-1');
      form.append('prompt', req.prompt);
      form.append('n', '1');

      const size = mapAspectRatioToGptImageSize(req.aspect_ratio);
      if (size) form.append('size', size);

      for (let i = 0; i < (req.images || []).length; i++) {
        const img = req.images![i];
        const ext = img.mime_type.includes('jpeg') ? 'jpg'
          : img.mime_type.includes('webp') ? 'webp'
            : img.mime_type.includes('gif') ? 'gif'
              : 'png';

        const blob = new Blob([Buffer.from(img.data)], { type: img.mime_type || 'image/png' });

        form.append('image[]', blob, `image_${i}.${ext}`);
      }

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Connection': 'close',
        'User-Agent': 'AI-Cat/1.0',
      };

      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const res = await this.fetchRaw(url, {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}` };
      }

      const data = await res.json();
      const images = await extractOpenAIImages(data, this.timeout);

      if (!images.length) return { error: '未生成任何图片' };
      return { images };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { error: 'OpenAI 图生图请求超时' };
      }
      return { error: String(e) };
    } finally {
      clearTimeout(id);
    }
  }
}
