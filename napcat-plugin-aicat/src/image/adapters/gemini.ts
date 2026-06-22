import { BaseImageAdapter } from '../base-adapter';
import type { ImageGenerateRequest, ImageGenerateResult } from '../types';
import { normalizeImageBaseUrl } from '../utils';

export class GeminiImageAdapter extends BaseImageAdapter {
  async generate(req: ImageGenerateRequest): Promise<ImageGenerateResult> {
    const base = normalizeImageBaseUrl(this.baseUrl) || 'https://generativelanguage.googleapis.com';
    const modelPath = this.model.startsWith('models/')
      ? this.model
      : `models/${this.model}`;
    const url = `${base}/v1beta/${modelPath}:generateContent`;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const parts: unknown[] = [{ text: req.prompt }];

      for (const img of req.images || []) {
        parts.push({
          inline_data: {
            mime_type: img.mime_type,
            data: Buffer.from(img.data).toString('base64'),
          },
        });
      }

      const payload = {
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}` };

      const data = await res.json() as {
        candidates?: {
          content?: {
            parts?: {
              inline_data?: { data?: string; };
              inlineData?: { data?: string; };
            }[];
          };
        }[];
      };

      const partsResp = data.candidates?.[0]?.content?.parts || [];
      const images = partsResp
        .map(p => p.inline_data?.data || p.inlineData?.data)
        .filter(Boolean)
        .map(b64 => Uint8Array.from(Buffer.from(b64!, 'base64')));

      if (!images.length) return { error: '未生成任何图片' };
      return { images };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { error: `Gemini 生图请求超时（${Math.round(this.timeout / 1000)}秒）` };
      }
      return { error: String(e) };
    } finally {
      clearTimeout(id);
    }
  }
}
