import { BaseImageAdapter } from '../base-adapter';
import type { ImageGenerateRequest, ImageGenerateResult } from '../types';
import { normalizeImageBaseUrl } from '../utils';

export class ZImageAdapter extends BaseImageAdapter {
  async generate(req: ImageGenerateRequest): Promise<ImageGenerateResult> {
    const base = normalizeImageBaseUrl(this.baseUrl) || 'https://ai.gitee.com';
    const url = `${base}/v1/images/generations`;
    const payload = {
      model: this.model || 'z-image-turbo',
      prompt: req.prompt,
      size: '1024x1024',
      num_inference_steps: 9,
    };
    const res = await this.postJson(url, payload);
    if (!res.ok) return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json() as { data?: { b64_json?: string; }[]; };
    const images = (data.data || []).map(i => i.b64_json ? Uint8Array.from(Buffer.from(i.b64_json, 'base64')) : null).filter(Boolean) as Uint8Array[];
    if (!images.length) return { error: '未生成任何图片' };
    return { images };
  }
}
