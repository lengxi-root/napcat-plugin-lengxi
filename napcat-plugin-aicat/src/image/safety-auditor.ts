import fs from 'fs';
import { pluginState } from '../core/state';
import { getPrioritizedChatTargets } from '../core/channel-store';

function extractJson(text: string): Record<string, unknown> | null {
  const raw = text.trim();
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return obj;
  } catch {}

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAuditTarget(kind: 'prompt' | 'output'): { baseUrl: string; apiKey: string; model: string; timeout: number; } | null {
  const cfg = pluginState.config as Record<string, unknown>;
  const field = kind === 'prompt' ? 'imagePromptAuditModel' : 'imageOutputAuditModel';
  const full = String(cfg[field] || '').trim();

  const targets = getPrioritizedChatTargets();
  if (!targets.length) return null;

  if (!full) {
    const t = targets[0];
    return {
      baseUrl: t.baseUrl,
      apiKey: t.apiKey,
      model: t.model,
      timeout: t.timeout,
    };
  }

  const pos = full.indexOf('/');
  if (pos <= 0) return null;

  const channelName = full.slice(0, pos);
  const model = full.slice(pos + 1);
  const hit = targets.find(t => t.channelName === channelName && t.model === model);
  if (!hit) return null;

  return {
    baseUrl: hit.baseUrl,
    apiKey: hit.apiKey,
    model: hit.model,
    timeout: hit.timeout,
  };
}

async function simpleAuditChat (
  prompt: string,
  kind: 'prompt' | 'output'
): Promise<string> {
  const target = getAuditTarget(kind);
  if (!target) return '';

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), target.timeout || 60000);

  try {
    const base = target.baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
    const url = `${base}/v1/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: target.model,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return '';
    const data = await res.json() as { choices?: { message?: { content?: string; }; }[]; };
    return data.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  } finally {
    clearTimeout(id);
  }
}

export class ImageSafetyAuditor {
  private getWhitelist(): string[] {
    return ((pluginState.config as Record<string, unknown>).imageAuditWhitelist as string[]) || [];
  }

  private getBlockedWords(): string[] {
    return ((pluginState.config as Record<string, unknown>).imagePromptBlockedWords as string[]) || [];
  }

  private promptAuditEnabled(): boolean {
    return Boolean((pluginState.config as Record<string, unknown>).imageEnablePromptAudit);
  }

  private imageAuditEnabled(): boolean {
    return Boolean((pluginState.config as Record<string, unknown>).imageEnableOutputAudit);
  }

  private getPromptAuditTemplate(): string {
    return String(
      (pluginState.config as Record<string, unknown>).imagePromptAuditTemplate ||
      '你是生图安全审核员。请判断以下提示词是否安全。提示词：{prompt}。仅输出 JSON：{"allow":true/false,"reason":"原因"}'
    );
  }

  private getOutputAuditTemplate(): string {
    return String(
      (pluginState.config as Record<string, unknown>).imageOutputAuditTemplate ||
      '你是图像安全审核员。请判断以下图片是否适合普通用户。仅输出 JSON：{"allow":true/false,"reason":"原因"}'
    );
  }

  isWhitelisted(sessionId: string): boolean {
    return this.getWhitelist().includes(String(sessionId).trim());
  }

  async auditPrompt(prompt: string, sessionId: string): Promise<{ allow: boolean; reason: string; }> {
    if (this.isWhitelisted(sessionId)) return { allow: true, reason: '' };

    for (const word of this.getBlockedWords()) {
      if (word && prompt.toLowerCase().includes(word.toLowerCase())) {
        return { allow: false, reason: `命中屏蔽词: ${word}` };
      }
    }

    if (!this.promptAuditEnabled()) return { allow: true, reason: '' };

    const tpl = this.getPromptAuditTemplate().replace(/\{prompt\}/g, prompt);
    const text = await simpleAuditChat(tpl, 'prompt');
    if (!text) return { allow: false, reason: '审核模型返回为空' };

    const obj = extractJson(text);
    if (obj && typeof obj.allow === 'boolean') {
      return {
        allow: Boolean(obj.allow),
        reason: String(obj.reason || ''),
      };
    }

    const low = text.toLowerCase();
    if (low.includes('false') || low.includes('拒绝') || low.includes('不通过')) {
      return { allow: false, reason: text.slice(0, 120) };
    }
    if (low.includes('true') || low.includes('通过') || low.includes('允许')) {
      return { allow: true, reason: text.slice(0, 120) };
    }
    return { allow: false, reason: `无法判定审核结果: ${text.slice(0, 120)}` };
  }

  async auditOutputImages(filePaths: string[], sessionId: string, prompt?: string): Promise<{ allow: boolean; reason: string; }> {
    if (this.isWhitelisted(sessionId)) return { allow: true, reason: '' };
    if (!this.imageAuditEnabled()) return { allow: true, reason: '' };
    if (!filePaths.length) return { allow: false, reason: '没有待审核图片' };

    const target = getAuditTarget('output');
    if (!target) return { allow: false, reason: '未配置可用审核模型' };

    const images = filePaths.map(file => {
      const b64 = fs.readFileSync(file).toString('base64');
      return {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${b64}` },
      };
    });

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), target.timeout || 60000);

    try {
      const base = target.baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
      const url = `${base}/v1/chat/completions`;
      const tpl = this.getOutputAuditTemplate().replace(/\{prompt\}/g, prompt || '');

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: target.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: tpl },
              ...images,
            ],
          }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) return { allow: false, reason: `审核接口失败: HTTP ${res.status}` };
      const data = await res.json() as { choices?: { message?: { content?: string; }; }[]; };
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) return { allow: false, reason: '图片审核返回为空' };

      const obj = extractJson(text);
      if (obj && typeof obj.allow === 'boolean') {
        return {
          allow: Boolean(obj.allow),
          reason: String(obj.reason || ''),
        };
      }

      const low = text.toLowerCase();
      if (low.includes('false') || low.includes('拒绝') || low.includes('不通过')) {
        return { allow: false, reason: text.slice(0, 120) };
      }
      if (low.includes('true') || low.includes('通过') || low.includes('允许')) {
        return { allow: true, reason: text.slice(0, 120) };
      }
      return { allow: false, reason: `无法判定审核结果: ${text.slice(0, 120)}` };
    } catch (e) {
      return { allow: false, reason: `审核请求异常: ${String(e).slice(0, 160)}` };
    } finally {
      clearTimeout(id);
    }
  }
}

export const imageSafetyAuditor = new ImageSafetyAuditor();
