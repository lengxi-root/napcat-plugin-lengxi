import type { ImageModelTarget } from '../types';
import type { ImageGenerateRequest, ImageGenerateResult } from '../types';
import { OpenAIImageAdapter } from './adapters/openai';
import { GeminiImageAdapter } from './adapters/gemini';
import { GeminiOpenAIImageAdapter } from './adapters/gemini-openai';
import { ZImageAdapter } from './adapters/z-image';
import { JimengImageAdapter } from './adapters/jimeng';
import { GrokImageAdapter } from './adapters/grok';

const IMAGE_RETRY_ATTEMPTS = 3;

function createAdapter (target: ImageModelTarget) {
  switch (target.providerType) {
    case 'openai': return new OpenAIImageAdapter(target.baseUrl, target.apiKey, target.model, target.timeout, target.proxy);
    case 'gemini': return new GeminiImageAdapter(target.baseUrl, target.apiKey, target.model, target.timeout, target.proxy);
    case 'gemini_openai': return new GeminiOpenAIImageAdapter(target.baseUrl, target.apiKey, target.model, target.timeout, target.proxy);
    case 'z_image_gitee': return new ZImageAdapter(target.baseUrl, target.apiKey, target.model, target.timeout, target.proxy);
    case 'jimeng2api': return new JimengImageAdapter(target.baseUrl, target.apiKey, target.model, target.timeout, target.proxy);
    case 'grok': return new GrokImageAdapter(target.baseUrl, target.apiKey, target.model, target.timeout, target.proxy);
    default: throw new Error(`未知生图渠道类型: ${target.providerType}`);
  }
}

function formatTimeout (ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}秒`;
}

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runWithTimeout<T> (
  task: () => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  const timeout = Number(timeoutMs);
  const ms = Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : 180000;

  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} 请求超时（全局生图超时 ${formatTimeout(ms)}）`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stringifyCause (cause: unknown): string {
  if (!cause) return '';

  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

function normalizeError (error: unknown): string {
  if (error instanceof Error) {
    const e = error as Error & { cause?: unknown };

    if (error.name === 'AbortError') {
      return '请求超时或已被中止';
    }

    let msg = error.message || String(error);

    if (e.cause) {
      msg += ` | cause: ${stringifyCause(e.cause)}`;
    }

    return msg;
  }

  return String(error);
}

function shouldRetry (errorText: string): boolean {
  return /fetch failed|ECONN|ETIMEDOUT|EPIPE|UND_|aborted|ECONNABORTED|socket|network|timeout|超时|HTTP 5\d\d/i.test(errorText);
}

export async function generateImageWithFallback (
  targets: ImageModelTarget[],
  req: ImageGenerateRequest
): Promise<ImageGenerateResult & { usedModel?: string; }> {
  if (!targets.length) {
    return { error: '未配置生图模型' };
  }

  let lastError = '未配置生图模型';
  const globalTimeoutMs = Math.max(
    10000,
    Math.floor(targets[0]?.timeout || 180000)
  );
  const startedAt = Date.now();
  const deadline = startedAt + globalTimeoutMs;

  for (let attempt = 1; attempt <= IMAGE_RETRY_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      return {
        error: `生图全局超时（${formatTimeout(globalTimeoutMs)}），最后错误: ${lastError}`,
      };
    }

    const target = targets[(attempt - 1) % targets.length];
    const label = `${target.channelName}/${target.model}`;

    try {
      const adapter = createAdapter(target);

      const result = await runWithTimeout(
        () => adapter.generate(req),
        Math.min(target.timeout || globalTimeoutMs, remaining),
        `${label} 第${attempt}次`
      );

      if (!result.error && result.images?.length) {
        return { ...result, usedModel: label };
      }

      lastError = `${label}: ${result.error || '生成失败'}`;

      if (!shouldRetry(lastError)) {
        return { error: lastError };
      }
    } catch (error) {
      const err = normalizeError(error);
      lastError = `${label}: ${err}`;

      if (!shouldRetry(err)) {
        return { error: lastError };
      }
    }

    if (attempt < IMAGE_RETRY_ATTEMPTS) {
      const waitMs = 1000 * attempt;
      const remainAfter = deadline - Date.now();

      if (remainAfter <= waitMs) {
        return {
          error: `生图全局超时（${formatTimeout(globalTimeoutMs)}），最后错误: ${lastError}`,
        };
      }

      await sleep(waitMs);
    }
  }

  return { error: lastError };
}