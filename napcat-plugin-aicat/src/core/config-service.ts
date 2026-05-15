import type {
  ChannelConfig,
  ChatModelTarget,
  ImageChannelConfig,
  ImageModelTarget,
  PluginConfig,
} from '../types';
import { DEFAULT_PLUGIN_CONFIG } from '../config';
import { pluginState } from './state';
import { normalizePluginConfig } from './config-normalizer';
import {
  getModelCache,
  getModelCacheFilePath,
  removeModelCache,
  setModelCache,
  stripModelCachesFromConfig,
} from './model-cache-store';
import { fetchChatModelsForChannel, fetchImageModelsForChannel } from '../tools/model-discovery';

function uniq<T> (list: T[]): T[] {
  return Array.from(new Set(list));
}

function normalizeBaseUrl (url: string): string {
  let v = (url || '').trim().replace(/\/+$/, '');
  v = v.replace(/\/v1($|\/.*$)/i, '');
  v = v.replace(/\/chat\/completions$/i, '');
  v = v.replace(/\/images\/generations$/i, '');
  v = v.replace(/\/images\/edits$/i, '');
  return v;
}

function normalizeModelInfos (models: unknown): { id: string; enabled: boolean; }[] {
  if (!Array.isArray(models)) return [];

  return models
    .map(m => {
      if (typeof m === 'string') return { id: m.trim(), enabled: true };

      const row = m as { id?: unknown; enabled?: unknown; };

      return {
        id: String(row.id || '').trim(),
        enabled: row.enabled !== false,
      };
    })
    .filter(m => m.id);
}

function getGlobalImageTimeout (): number {
  const cfg = pluginState.config as PluginConfig & { imageGlobalTimeoutMs?: unknown; };
  const raw = cfg.imageGlobalTimeoutMs;
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0) return 180000;

  return Math.min(900000, Math.max(10000, Math.floor(n)));
}

function findRuntimeChatChannel (name: string): ChannelConfig | undefined {
  return pluginState.config.chatChannels.find(ch => ch.name === name);
}

function findRuntimeImageChannel (name: string): ImageChannelConfig | undefined {
  return pluginState.config.imageChannels.find(ch => ch.name === name);
}

export function normalizeChatChannelsUnified (channels: unknown): ChannelConfig[] {
  if (!Array.isArray(channels)) return [];

  return channels
    .map(item => {
      const c = item as Partial<ChannelConfig> & { models_cache_path?: unknown; };

      return {
        name: String(c.name || '').trim(),
        base_url: normalizeBaseUrl(String(c.base_url || '')),
        api_key: String(c.api_key || '').trim(),

        // 不把 models_cache 放入运行时配置
        // 需要读取时通过 getChatChannelsWithCache() 从 JSON 文件读取
        models_cache: [],
        models_cache_path: String(c.models_cache_path || '').trim(),

        enabled_models: normalizeModelInfos(c.enabled_models),
        timeout: Number(c.timeout || 20000),
      };
    })
    .filter(c => c.name && c.base_url);
}

export function normalizeImageChannelsUnified (channels: unknown): ImageChannelConfig[] {
  if (!Array.isArray(channels)) return [];

  return channels
    .map(item => {
      const c = item as Partial<ImageChannelConfig> & { models_cache_path?: unknown; };

      return {
        name: String(c.name || '').trim(),
        base_url: normalizeBaseUrl(String(c.base_url || '')),
        api_key: String(c.api_key || '').trim(),
        provider_type: (c.provider_type || 'openai') as ImageChannelConfig['provider_type'],

        // 不把 models_cache 放入运行时配置
        // 需要读取时通过 getImageChannelsWithCache() 从 JSON 文件读取
        models_cache: [],
        models_cache_path: String(c.models_cache_path || '').trim(),

        enabled_models: normalizeModelInfos(c.enabled_models),
        timeout: Number(c.timeout || 180000),
        proxy: c.proxy ? String(c.proxy) : undefined,
        capability_options: c.capability_options || {
          text_to_image: true,
          image_to_image: true,
          aspect_ratio: true,
          resolution: true,
        },
        extra: (c.extra && typeof c.extra === 'object') ? c.extra : {},
      };
    })
    .filter(c => c.name && c.base_url);
}

export function cleanConfigForRuntime (
  input: Partial<PluginConfig> | Record<string, unknown>
): PluginConfig {
  const merged = normalizePluginConfig({
    ...DEFAULT_PLUGIN_CONFIG,
    ...input,
  });

  return {
    ...merged,
    chatChannels: normalizeChatChannelsUnified(merged.chatChannels),
    imageChannels: normalizeImageChannelsUnified(merged.imageChannels),
  };
}

/**
 * Web 高级 JSON 使用的配置。
 * 注意：这里不返回大 models_cache，只返回 models_cache_path。
 */
export function getWebConfig (): PluginConfig {
  return stripModelCachesFromConfig(pluginState.config);
}

export function saveWebConfig (webInput: Record<string, unknown>): PluginConfig {
  pluginState.config = cleanConfigForRuntime({
    ...pluginState.config,
    ...webInput,
  });

  pluginState.saveConfig();
  return getWebConfig();
}

/**
 * 读取对话渠道，并从独立 JSON 文件实时读取 models_cache。
 */
export function getChatChannelsWithCache (): ChannelConfig[] {
  return pluginState.config.chatChannels.map(ch => ({
    ...ch,
    models_cache: getModelCache('chat', ch.name),
    models_cache_path: getModelCacheFilePath('chat', ch.name),
  }));
}

/**
 * 读取生图渠道，并从独立 JSON 文件实时读取 models_cache。
 */
export function getImageChannelsWithCache (): ImageChannelConfig[] {
  return pluginState.config.imageChannels.map(ch => ({
    ...ch,
    models_cache: getModelCache('image', ch.name),
    models_cache_path: getModelCacheFilePath('image', ch.name),
  }));
}

export function getAllEnabledChatModels (): string[] {
  const list: string[] = [];

  for (const ch of pluginState.config.chatChannels) {
    for (const m of ch.enabled_models || []) {
      if (m.enabled !== false && m.id) list.push(`${ch.name}/${m.id}`);
    }
  }

  return uniq(list);
}

export function getAllEnabledImageModels (): string[] {
  const list: string[] = [];

  for (const ch of pluginState.config.imageChannels) {
    for (const m of ch.enabled_models || []) {
      if (m.enabled !== false && m.id) list.push(`${ch.name}/${m.id}`);
    }
  }

  return uniq(list);
}

export function getPrioritizedChatTargets (): ChatModelTarget[] {
  const channels = pluginState.config.chatChannels;
  const index = new Map(channels.map(c => [c.name, c]));
  const result: ChatModelTarget[] = [];
  const seen = new Set<string>();

  for (const full of pluginState.config.enabledChatModelPriority || []) {
    const pos = full.indexOf('/');
    if (pos <= 0) continue;

    const channelName = full.slice(0, pos);
    const model = full.slice(pos + 1);
    const key = `${channelName}/${model}`;
    if (seen.has(key)) continue;

    const channel = index.get(channelName);
    if (!channel) continue;

    const enabled = channel.enabled_models.some(m => m.id === model && m.enabled !== false);
    if (!enabled) continue;

    seen.add(key);
    result.push({
      channelName,
      model,
      baseUrl: channel.base_url,
      apiKey: channel.api_key,
      timeout: channel.timeout || 20000,
    });
  }

  for (const ch of channels) {
    for (const m of ch.enabled_models || []) {
      if (m.enabled === false || !m.id) continue;

      const key = `${ch.name}/${m.id}`;
      if (seen.has(key)) continue;

      seen.add(key);
      result.push({
        channelName: ch.name,
        model: m.id,
        baseUrl: ch.base_url,
        apiKey: ch.api_key,
        timeout: ch.timeout || 20000,
      });
    }
  }

  return result;
}

export function getPrioritizedImageTargets (): ImageModelTarget[] {
  const channels = pluginState.config.imageChannels;
  const index = new Map(channels.map(c => [c.name, c]));
  const result: ImageModelTarget[] = [];
  const seen = new Set<string>();
  const globalTimeout = getGlobalImageTimeout();

  for (const full of pluginState.config.enabledImageModelPriority || []) {
    const pos = full.indexOf('/');
    if (pos <= 0) continue;

    const channelName = full.slice(0, pos);
    const model = full.slice(pos + 1);
    const key = `${channelName}/${model}`;
    if (seen.has(key)) continue;

    const channel = index.get(channelName);
    if (!channel) continue;

    const enabled = channel.enabled_models.some(m => m.id === model && m.enabled !== false);
    if (!enabled) continue;

    seen.add(key);
    result.push({
      channelName,
      model,
      providerType: channel.provider_type,
      baseUrl: channel.base_url,
      apiKey: channel.api_key,
      timeout: globalTimeout,
      proxy: channel.proxy,
      capability_options: channel.capability_options,
      extra: channel.extra,
    });
  }

  for (const ch of channels) {
    for (const m of ch.enabled_models || []) {
      if (m.enabled === false || !m.id) continue;

      const key = `${ch.name}/${m.id}`;
      if (seen.has(key)) continue;

      seen.add(key);
      result.push({
        channelName: ch.name,
        model: m.id,
        providerType: ch.provider_type,
        baseUrl: ch.base_url,
        apiKey: ch.api_key,
        timeout: globalTimeout,
        proxy: ch.proxy,
        capability_options: ch.capability_options,
        extra: ch.extra,
      });
    }
  }

  return result;
}

export async function refreshChatModelCache (
  channelName = '',
  transientChannel?: ChannelConfig
): Promise<{ count: number; channels: ChannelConfig[]; }> {
  const channels = transientChannel
    ? [transientChannel]
    : getChatChannelsWithCache();

  let count = 0;

  for (const ch of channels) {
    if (channelName && ch.name !== channelName) continue;

    const models = await fetchChatModelsForChannel(ch);
    const filePath = setModelCache('chat', ch.name, models);

    ch.models_cache = models;
    ch.models_cache_path = filePath;

    const runtime = findRuntimeChatChannel(ch.name);
    if (runtime) {
      runtime.models_cache = [];
      runtime.models_cache_path = filePath;
    }

    count++;
  }

  return { count, channels };
}

export async function refreshImageModelCache (
  channelName = '',
  transientChannel?: ImageChannelConfig
): Promise<{ count: number; channels: ImageChannelConfig[]; }> {
  const channels = transientChannel
    ? [transientChannel]
    : getImageChannelsWithCache();

  let count = 0;

  for (const ch of channels) {
    if (channelName && ch.name !== channelName) continue;

    const models = await fetchImageModelsForChannel(ch);
    const filePath = setModelCache('image', ch.name, models);

    ch.models_cache = models;
    ch.models_cache_path = filePath;

    const runtime = findRuntimeImageChannel(ch.name);
    if (runtime) {
      runtime.models_cache = [];
      runtime.models_cache_path = filePath;
    }

    count++;
  }

  return { count, channels };
}

export function removeChatChannel (name: string): void {
  const target = String(name || '').trim();

  pluginState.config.chatChannels = pluginState.config.chatChannels.filter(c => c.name !== target);
  pluginState.config.enabledChatModelPriority = (pluginState.config.enabledChatModelPriority || [])
    .filter(i => !i.startsWith(`${target}/`));

  removeModelCache('chat', target);
  pluginState.saveConfig();
}

export function removeImageChannel (name: string): void {
  const target = String(name || '').trim();

  pluginState.config.imageChannels = pluginState.config.imageChannels.filter(c => c.name !== target);
  pluginState.config.enabledImageModelPriority = (pluginState.config.enabledImageModelPriority || [])
    .filter(i => !i.startsWith(`${target}/`));

  removeModelCache('image', target);
  pluginState.saveConfig();
}