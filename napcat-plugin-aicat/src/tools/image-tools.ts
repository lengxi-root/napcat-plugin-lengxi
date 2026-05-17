import type { Tool, ToolResult } from '../types';
import { pluginState } from '../core/state';
import { getPrioritizedImageTargets } from '../core/channel-store';
import { generateImageWithFallback } from '../image/generator';
import { imageCacheManager } from '../image/cache-manager';
import { imageTaskQueue } from '../image/task-queue';
import { imagePersonaManager } from '../image/persona-manager';
import { optimizeImagePrompt } from '../image/prompt-optimizer';

export const IMAGE_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: '使用生图模型生成图片。支持文生图和参考图图生图；如果用户引用/发送图片并要求换衣服、换姿势、参考图片风格、按图生成，应结合参考图生成。',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '生图提示词',
          },
          aspect_ratio: {
            type: 'string',
            description: '宽高比',
            enum: ['自动', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
          },
          resolution: {
            type: 'string',
            description: '分辨率',
            enum: ['1K', '2K', '4K'],
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_selfie',
      description: '以当前 AI 助手自己的形象生成自拍。当用户要求“你自拍一张”“发张你的照片”“来一张你的自拍”“看看你长什么样”“你穿这个”“你换这个衣服和姿势”“和某人合照”等场景时调用。参考图使用主人设置的自拍形象参考图作为主体身份图，用户引用图只作为衣服、姿势、风格、合照对象等辅助参考。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '自拍动作、表情、服装、姿势、环境或场景描述。例如：看着镜头自拍、换成这张图的衣服和姿势、和图里的人合照、坐在窗边自拍',
          },
          aspect_ratio: {
            type: 'string',
            description: '宽高比',
            enum: ['自动', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
          },
          resolution: {
            type: 'string',
            description: '分辨率',
            enum: ['1K', '2K', '4K'],
          },
        },
        required: ['action'],
      },
    },
  },
];

function buildPromptWithReferenceInstruction (
  prompt: string,
  images?: { data: Uint8Array; mime_type: string; }[]
): string {
  const raw = String(prompt || '').trim();

  if (!images?.length) return raw;

  return [
    'The user has provided reference image(s).',
    '',
    'Reference image rules:',
    '1. Use the provided image(s) as visual references.',
    '2. If the user asks to change clothes, outfit, pose, action, style, composition, character appearance, scene, or camera angle, follow the reference image(s).',
    '3. Do not ignore the reference image(s).',
    '4. If there are multiple reference images, use them according to the user request. For example, one image may provide identity, another may provide outfit or pose.',
    '5. Keep the final image as a single complete coherent image, not a collage, not split screen, not multiple panels.',
    '6. Do not add text, watermark, UI, borders, or captions.',
    '',
    'User request:',
    raw,
  ].join('\n');
}

async function runImageGeneration (
  prompt: string,
  args: Record<string, unknown>,
  images?: { data: Uint8Array; mime_type: string; }[],
  options: {
    optimize?: boolean;
  } = {}
): Promise<ToolResult> {
  const targets = getPrioritizedImageTargets();

  if (!targets.length) {
    return {
      success: false,
      error: '当前没有可用的生图模型',
    };
  }

  const aspectRatio = String(args.aspect_ratio || pluginState.config.imageDefaultAspectRatio || '自动');
  const resolution = String(args.resolution || pluginState.config.imageDefaultResolution || '1K');

  const referencedPrompt = buildPromptWithReferenceInstruction(prompt, images);

  /**
   * 普通生图可以优化。
   * 自拍不优化，因为自拍提示词里有强控制规则：
   * - 形象图是主体身份
   * - 额外图只参考衣服 / 姿势 / 合照对象
   * - 今日穿搭是否传入
   * - 合照 / 改衣服 / 改姿势模式
   *
   * 优化器可能会把这些结构化规则吞掉，导致监控里只剩人格提示词。
   */
  const shouldOptimize = options.optimize !== false;

  const optimized = shouldOptimize
    ? await optimizeImagePrompt(referencedPrompt, aspectRatio, resolution)
    : {
        prompt: referencedPrompt,
        optimized: false,
      };

  const finalPrompt = optimized.prompt;

  const startAt = Date.now();

  const result = await imageTaskQueue.submit(async () => {
    return await generateImageWithFallback(targets, {
      prompt: finalPrompt,
      aspect_ratio: aspectRatio,
      resolution,
      images,
    });
  });

  const elapsedMs = Date.now() - startAt;

  if (result.error || !result.images?.length) {
    return {
      success: false,
      error: result.error || '生成失败',
      data: {
        elapsed_ms: elapsedMs,
        elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
        prompt_optimized: optimized.optimized,
        original_prompt: prompt,
        referenced_prompt: referencedPrompt,
        final_prompt: finalPrompt,
        reference_images: images?.length || 0,
      },
    };
  }

  const files = result.images
    .map((img, i) => imageCacheManager.saveGeneratedImage(`tool_${Date.now()}_${i}`, img))
    .filter(Boolean) as string[];

  return {
    success: true,
    message: `已生成 ${files.length} 张图片，耗时 ${(elapsedMs / 1000).toFixed(2)}s`,
    data: {
      files,
      used_model: result.usedModel,
      count: files.length,
      elapsed_ms: elapsedMs,
      elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
      queue: imageTaskQueue.getSnapshot(),
      prompt_optimized: optimized.optimized,
      original_prompt: prompt,
      referenced_prompt: referencedPrompt,
      final_prompt: finalPrompt,
      reference_images: images?.length || 0,
    },
  };
}

export async function executeImageTool (
  name: string,
  args: Record<string, unknown>,
  images?: { data: Uint8Array; mime_type: string; }[]
): Promise<ToolResult> {
  if (name === 'generate_image') {
    const prompt = String(args.prompt || '').trim();

    if (!prompt) {
      return {
        success: false,
        error: '缺少 prompt',
      };
    }

    return runImageGeneration(
      prompt,
      args,
      images,
      {
        optimize: true,
      }
    );
  }

  if (name === 'generate_selfie') {
    const action = String(args.action || args.prompt || '').trim() || '看着镜头微笑自拍';

    await imagePersonaManager.ensureDailySelfieProfile(action);

    const personaRef = imagePersonaManager.getReferenceImage();
    const extraRefs = images || [];

    /**
     * 自拍参考图顺序：
     * 1. 主人设置的 AI 形象图，如果存在，永远第一张，作为主体身份参考。
     * 2. 用户引用 / 发送 / @头像等额外参考图，从第二张开始，只作为衣服、姿势、构图、风格、合照对象等辅助参考。
     *
     * 如果没有形象图，就不伪造主体图，提示词会改用人格 / 今日设定作为主角身份依据。
     */
    const refs = [
      ...(personaRef ? [personaRef] : []),
      ...extraRefs,
    ];

    const prompt = imagePersonaManager.buildSelfiePrompt(action, {
      has_reference_image: Boolean(personaRef),
      extra_reference_count: extraRefs.length,
    });

    return runImageGeneration(
      prompt,
      args,
      refs.length ? refs : undefined,
      {
        optimize: false,
      }
    );
  }

  return {
    success: false,
    error: `未知工具: ${name}`,
  };
}

export const getImageTools = (): Tool[] => IMAGE_TOOLS;