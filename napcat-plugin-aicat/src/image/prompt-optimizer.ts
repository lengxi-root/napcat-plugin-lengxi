import { pluginState } from '../core/state';
import { getPrioritizedChatTargets } from '../core/channel-store';
import { AIClient } from '../tools/ai-client';

export interface ImagePromptOptimizeResult {
  prompt: string;
  optimized: boolean;
  error?: string;
}

function stripCodeFence (text: string): string {
  return String(text || '')
    .trim()
    .replace(/^```(?:text|txt|markdown|md)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function normalizeOptimizedText (text: string): string {
  const raw = stripCodeFence(text);

  // 尽量兼容模型返回 JSON
  try {
    const obj = JSON.parse(raw) as {
      prompt?: unknown;
      optimized_prompt?: unknown;
      result?: unknown;
    };

    const value = obj.optimized_prompt ?? obj.prompt ?? obj.result;
    if (typeof value === 'string') return value.trim();
  } catch {}

  return raw.trim();
}

function buildOptimizerPrompt (prompt: string, aspectRatio?: string, resolution?: string): string {
  return [
    'You are an image generation prompt optimizer.',
    '',
    'Task:',
    '1. Rewrite the user prompt into a clear, structured, high-quality image generation prompt.',
    '2. Translate it into English.',
    '3. Preserve all important meaning, characters, actions, style, composition, mood, and constraints.',
    '4. Do not add unsafe, sexual, violent, political, hateful, or illegal content.',
    '5. Do not invent extra named characters unless implied by the original prompt.',
    '6. Output ONLY the final optimized English prompt. No explanations, no JSON, no markdown.',
    '',
    `Aspect ratio: ${aspectRatio || 'auto'}`,
    `Resolution: ${resolution || 'default'}`,
    '',
    'Original prompt:',
    prompt,
  ].join('\n');
}

/**
 * 副脑提示词优化：
 * - 生图前只执行一次
 * - 会话模型不可用 / 请求失败 / 返回为空时，直接返回原提示词
 */
export async function optimizeImagePrompt (
  prompt: string,
  aspectRatio?: string,
  resolution?: string
): Promise<ImagePromptOptimizeResult> {
  const original = String(prompt || '').trim();
  if (!original) {
    return {
      prompt: original,
      optimized: false,
      error: '提示词为空',
    };
  }

  let targets = [];

  try {
    targets = getPrioritizedChatTargets();
  } catch (e) {
    return {
      prompt: original,
      optimized: false,
      error: String(e),
    };
  }

  if (!targets.length) {
    return {
      prompt: original,
      optimized: false,
      error: '没有可用会话模型',
    };
  }

  const target = targets[0];

  try {
    const client = new AIClient({
      base_url: target.baseUrl,
      api_key: target.apiKey,
      model: target.model,
      timeout: Math.min(Math.max(target.timeout || 30000, 5000), 60000),
    });

    const result = await client.chatSimple([
      {
        role: 'user',
        content: buildOptimizerPrompt(original, aspectRatio, resolution),
      },
    ]);

    const optimized = normalizeOptimizedText(result);

    if (!optimized) {
      return {
        prompt: original,
        optimized: false,
        error: '副脑返回为空',
      };
    }

    // 防止异常模型输出过长内容
    const finalPrompt = optimized.slice(0, 4000).trim();

    if (!finalPrompt) {
      return {
        prompt: original,
        optimized: false,
        error: '副脑结果为空',
      };
    }

    pluginState.debug(`[ImagePromptOptimizer] 原提示词: ${original}`);
    pluginState.debug(`[ImagePromptOptimizer] 优化后: ${finalPrompt}`);

    return {
      prompt: finalPrompt,
      optimized: finalPrompt !== original,
    };
  } catch (e) {
    pluginState.debug(`[ImagePromptOptimizer] 优化失败，跳过: ${String(e)}`);

    return {
      prompt: original,
      optimized: false,
      error: String(e),
    };
  }
}