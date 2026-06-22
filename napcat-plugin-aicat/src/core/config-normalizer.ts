import type { ChannelConfig, ImageChannelConfig, PluginConfig } from '../types';
import { DEFAULT_PLUGIN_CONFIG } from '../config';

function parseJsonValue<T> (value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;

  if (Array.isArray(fallback)) {
    if (Array.isArray(value)) return value as T;

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed as T : fallback;
      } catch {
        return fallback;
      }
    }

    return fallback;
  }

  if (typeof fallback === 'object' && fallback !== null) {
    if (typeof value === 'object') return value as T;

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return (parsed && typeof parsed === 'object') ? parsed as T : fallback;
      } catch {
        return fallback;
      }
    }
  }

  return value as T;
}

function toNumber (value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPort (value: unknown, fallback: number): number {
  const n = Math.floor(toNumber(value, fallback));
  if (n < 1 || n > 65535) return fallback;
  return n;
}

function normalizeGlobalImageTimeoutMs (value: unknown): number {
  const n = Number(value);

  /**
   * 默认 120 秒。
   * generateImageWithFallback 内部已经把这个时间作为全局 deadline，
   * 所以包含所有重试和重试等待。
   */
  if (!Number.isFinite(n) || n <= 0) return 120000;

  return Math.min(900000, Math.max(10000, Math.floor(n)));
}

function normalizeLooseList (
  value: unknown,
  options: { slash?: boolean } = {}
): string[] {
  const slash = options.slash !== false;

  const normalizeItem = (v: unknown): string[] => {
    if (v === undefined || v === null) return [];

    if (Array.isArray(v)) {
      return v.flatMap(item => normalizeItem(item));
    }

    const text = String(v).trim();
    if (!text) return [];

    return [text];
  };

  if (Array.isArray(value)) {
    return Array.from(new Set(
      value
        .flatMap(item => normalizeItem(item))
        .map(v => v.trim())
        .filter(Boolean)
    ));
  }

  if (typeof value !== 'string') {
    return normalizeItem(value);
  }

  let raw = value.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(
        parsed
          .flatMap(item => normalizeItem(item))
          .map(v => v.trim())
          .filter(Boolean)
      ));
    }
  } catch {}

  if (raw.startsWith('[') && raw.endsWith(']')) {
    raw = raw.slice(1, -1).trim();
  }

  raw = raw
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/["']/g, '');

  const delimiter = slash
    ? /[,，、\/\s\n\r\t]+/
    : /[,，、\s\n\r\t]+/;

  return Array.from(new Set(
    raw
      .split(delimiter)
      .map(v => v.trim())
      .filter(Boolean)
  ));
}

function normalizeStringList (value: unknown): string[] {
  return normalizeLooseList(value, { slash: true });
}

function normalizeModelPriorityList (value: unknown): string[] {
  return normalizeLooseList(value, { slash: false });
}

function normalizeChatChannels (channels: unknown): ChannelConfig[] {
  const list = parseJsonValue<unknown[]>(channels, []);

  return list
    .filter(Boolean)
    .map(item => {
      const c = item as Partial<ChannelConfig> & { models_cache_path?: unknown; };

      return {
        name: String(c.name || '').trim(),
        base_url: String(c.base_url || '').trim(),
        api_key: String(c.api_key || '').trim(),

        /**
         * 这里固定为空。
         * 模型缓存不进入主配置，也不进入运行时 config。
         * 需要读取缓存时走 model-cache-store.ts 直接读 JSON。
         */
        models_cache: [],
        models_cache_path: String(c.models_cache_path || '').trim(),

        enabled_models: Array.isArray(c.enabled_models)
          ? c.enabled_models
            .map(m => ({
              id: String((m as { id?: unknown; }).id || '').trim(),
              enabled: (m as { enabled?: unknown; }).enabled !== false,
            }))
            .filter(m => m.id)
          : [],
        timeout: toNumber(c.timeout, 20000),
      };
    })
    .filter(c => c.name && c.base_url);
}

function normalizeImageChannels (channels: unknown): ImageChannelConfig[] {
  const list = parseJsonValue<unknown[]>(channels, []);

  return list
    .filter(Boolean)
    .map(item => {
      const c = item as Partial<ImageChannelConfig> & { models_cache_path?: unknown; };

      return {
        name: String(c.name || '').trim(),
        base_url: String(c.base_url || '').trim(),
        api_key: String(c.api_key || '').trim(),
        provider_type: (c.provider_type || 'openai') as ImageChannelConfig['provider_type'],

        /**
         * 这里固定为空。
         * 模型缓存不进入主配置，也不进入运行时 config。
         */
        models_cache: [],
        models_cache_path: String(c.models_cache_path || '').trim(),

        enabled_models: Array.isArray(c.enabled_models)
          ? c.enabled_models
            .map(m => ({
              id: String((m as { id?: unknown; }).id || '').trim(),
              enabled: (m as { enabled?: unknown; }).enabled !== false,
            }))
            .filter(m => m.id)
          : [],
        timeout: toNumber(c.timeout, 180000),
        proxy: c.proxy ? String(c.proxy) : undefined,
        capability_options: c.capability_options || {
          text_to_image: true,
          image_to_image: true,
          aspect_ratio: true,
          resolution: true,
        },
        extra: (c.extra && typeof c.extra === 'object') ? c.extra as Record<string, unknown> : {},
      };
    })
    .filter(c => c.name && c.base_url);
}

export function normalizePluginConfig (input: Partial<PluginConfig> | Record<string, unknown>): PluginConfig {
  const merged = { ...DEFAULT_PLUGIN_CONFIG, ...input } as PluginConfig & Record<string, unknown>;

  return {
    ...merged,
    prefix: String(merged.prefix || DEFAULT_PLUGIN_CONFIG.prefix),
    enableReply: merged.enableReply !== false,
    sendConfirmMessage: merged.sendConfirmMessage !== false,
    botName: String(merged.botName || DEFAULT_PLUGIN_CONFIG.botName),
    personality: String(merged.personality || DEFAULT_PLUGIN_CONFIG.personality),
    confirmMessage: String(merged.confirmMessage || DEFAULT_PLUGIN_CONFIG.confirmMessage),
    maxContextTurns: Math.max(1, toNumber(merged.maxContextTurns, DEFAULT_PLUGIN_CONFIG.maxContextTurns)),
    ownerQQs: normalizeStringList(merged.ownerQQs).join(','),
    whitelistQQs: normalizeStringList(merged.whitelistQQs),
    debug: Boolean(merged.debug),
    allowPublicPacket: merged.allowPublicPacket !== false,
    autoSwitchModel: merged.autoSwitchModel !== false,
    allowAtTrigger: Boolean(merged.allowAtTrigger),
    safetyFilter: merged.safetyFilter !== false,
    disabledGroups: normalizeStringList(merged.disabledGroups),

    webEnable: Boolean(merged.webEnable),
    webPort: toPort(merged.webPort, DEFAULT_PLUGIN_CONFIG.webPort),
    webToken: String(merged.webToken || DEFAULT_PLUGIN_CONFIG.webToken).trim(),

    chatChannels: normalizeChatChannels(merged.chatChannels),
    enabledChatModelPriority: normalizeModelPriorityList(merged.enabledChatModelPriority),

    imageChannels: normalizeImageChannels(merged.imageChannels),
    enabledImageModelPriority: normalizeModelPriorityList(merged.enabledImageModelPriority),

    imageEnableLLMTool: merged.imageEnableLLMTool !== false,
    imageDefaultAspectRatio: String(merged.imageDefaultAspectRatio || DEFAULT_PLUGIN_CONFIG.imageDefaultAspectRatio),
    imageDefaultResolution: String(merged.imageDefaultResolution || DEFAULT_PLUGIN_CONFIG.imageDefaultResolution),
    imageMaxConcurrentTasks: Math.max(1, toNumber(merged.imageMaxConcurrentTasks, DEFAULT_PLUGIN_CONFIG.imageMaxConcurrentTasks)),
    imageShowGenerationInfo: Boolean(merged.imageShowGenerationInfo),
    imageShowModelInfo: Boolean(merged.imageShowModelInfo),
    imageRateLimitSeconds: Math.max(0, toNumber(merged.imageRateLimitSeconds, DEFAULT_PLUGIN_CONFIG.imageRateLimitSeconds)),
    imageEnableDailyLimit: Boolean(merged.imageEnableDailyLimit),
    imageDailyLimitCount: Math.max(1, toNumber(merged.imageDailyLimitCount, DEFAULT_PLUGIN_CONFIG.imageDailyLimitCount)),
    imageMaxImageSizeMB: Math.max(1, toNumber(merged.imageMaxImageSizeMB, DEFAULT_PLUGIN_CONFIG.imageMaxImageSizeMB)),
    imageMaxCacheCount: Math.max(1, toNumber(merged.imageMaxCacheCount, DEFAULT_PLUGIN_CONFIG.imageMaxCacheCount || 100)),
    imageUmoBlacklist: normalizeStringList(merged.imageUmoBlacklist),
    ocrModel: String(merged.ocrModel || ''),
    imageBlacklistBlockMessage: String(merged.imageBlacklistBlockMessage || DEFAULT_PLUGIN_CONFIG.imageBlacklistBlockMessage),

    imageAuditWhitelist: normalizeStringList(merged.imageAuditWhitelist),
    imagePromptBlockedWords: normalizeStringList(merged.imagePromptBlockedWords),
    imageEnablePromptAudit: Boolean(merged.imageEnablePromptAudit),
    imageEnableOutputAudit: Boolean(merged.imageEnableOutputAudit),
    imagePromptAuditModel: String(merged.imagePromptAuditModel || ''),
    imageOutputAuditModel: String(merged.imageOutputAuditModel || ''),
    imagePromptAuditTemplate: String(merged.imagePromptAuditTemplate || DEFAULT_PLUGIN_CONFIG.imagePromptAuditTemplate),
    imageOutputAuditTemplate: String(merged.imageOutputAuditTemplate || DEFAULT_PLUGIN_CONFIG.imageOutputAuditTemplate),

    imageGlobalTimeoutMs: normalizeGlobalImageTimeoutMs(merged.imageGlobalTimeoutMs),

    randomReplyChancePercent: Math.max(0, Math.min(100, toNumber(merged.randomReplyChancePercent, DEFAULT_PLUGIN_CONFIG.randomReplyChancePercent || 5))),
    randomActiveMessageCount: Math.max(1, toNumber(merged.randomActiveMessageCount, DEFAULT_PLUGIN_CONFIG.randomActiveMessageCount || 50)),
    randomActiveIntervalMinutes: Math.max(0, toNumber(merged.randomActiveIntervalMinutes, DEFAULT_PLUGIN_CONFIG.randomActiveIntervalMinutes || 300)),
    randomIgnoreQQs: normalizeStringList(merged.randomIgnoreQQs),
  } as PluginConfig;
}