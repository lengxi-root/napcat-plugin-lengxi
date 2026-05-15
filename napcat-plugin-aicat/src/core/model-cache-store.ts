import fs from 'fs';
import path from 'path';
import type { PluginConfig, ChannelConfig, ImageChannelConfig } from '../types';
import { pluginState } from './state';

type CacheType = 'chat' | 'image';

interface ModelCacheFile {
  channel: string;
  type: CacheType;
  models: string[];
  updated_at: string;
}

let CACHE_ROOT = '';

function safeName (name: string): string {
  const raw = String(name || '').trim() || 'unnamed';
  return raw.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 120);
}

function ensureRoot (): void {
  if (CACHE_ROOT) return;

  const base = pluginState.configPath
    ? path.dirname(path.resolve(pluginState.configPath))
    : path.join(process.cwd(), 'data');

  CACHE_ROOT = path.join(base, 'model-cache');
}

function getDir (type: CacheType): string {
  ensureRoot();
  return path.join(CACHE_ROOT, type);
}

function ensureDir (type: CacheType): void {
  const dir = getDir(type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getFile (type: CacheType, channelName: string): string {
  ensureRoot();
  return path.join(getDir(type), `${safeName(channelName)}.json`);
}

function uniq (list: unknown[]): string[] {
  return Array.from(new Set(
    (Array.isArray(list) ? list : [])
      .map(v => String(v || '').trim())
      .filter(Boolean)
  ));
}

export function initModelCacheStore (dataDir: string): void {
  CACHE_ROOT = path.join(dataDir, 'model-cache');
  ensureDir('chat');
  ensureDir('image');
}

export function getModelCacheFilePath (type: CacheType, channelName: string): string {
  if (!channelName) return '';

  ensureDir(type);
  return getFile(type, channelName);
}

export function getModelCache (type: CacheType, channelName: string): string[] {
  if (!channelName) return [];

  ensureDir(type);

  const file = getFile(type, channelName);
  if (!fs.existsSync(file)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<ModelCacheFile>;
    return uniq(data.models || []);
  } catch (e) {
    pluginState.debug(`[ModelCache] 读取失败 ${type}/${channelName}: ${String(e)}`);
    return [];
  }
}

export function setModelCache (type: CacheType, channelName: string, models: unknown[]): string {
  if (!channelName) return '';

  ensureDir(type);

  const file = getFile(type, channelName);

  const data: ModelCacheFile = {
    channel: String(channelName),
    type,
    models: uniq(models),
    updated_at: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    pluginState.log('error', `保存模型缓存失败 ${type}/${channelName}: ${String(e)}`);
  }

  return file;
}

export function removeModelCache (type: CacheType, channelName: string): void {
  if (!channelName) return;

  const file = getFile(type, channelName);

  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

export function extractAndPersistModelCaches (
  config: Partial<PluginConfig> | Record<string, unknown>
): void {
  const chatChannels = Array.isArray(config.chatChannels)
    ? config.chatChannels as Partial<ChannelConfig>[]
    : [];

  const imageChannels = Array.isArray(config.imageChannels)
    ? config.imageChannels as Partial<ImageChannelConfig>[]
    : [];

  for (const ch of chatChannels) {
    if (ch?.name && Array.isArray(ch.models_cache) && ch.models_cache.length) {
      setModelCache('chat', String(ch.name), ch.models_cache);
    }
  }

  for (const ch of imageChannels) {
    if (ch?.name && Array.isArray(ch.models_cache) && ch.models_cache.length) {
      setModelCache('image', String(ch.name), ch.models_cache);
    }
  }
}

export function stripModelCachesFromConfig<T extends Partial<PluginConfig> | Record<string, unknown>> (
  input: T
): T {
  const cloned = JSON.parse(JSON.stringify(input || {})) as Record<string, unknown>;

  const strip = (list: unknown, type: CacheType): unknown => {
    if (!Array.isArray(list)) return list;

    return list.map(item => {
      if (!item || typeof item !== 'object') return item;

      const row = { ...(item as Record<string, unknown>) };
      const name = String(row.name || '').trim();

      row.models_cache = [];
      row.models_cache_path = name
        ? getModelCacheFilePath(type, name)
        : '';

      return row;
    });
  };

  cloned.chatChannels = strip(cloned.chatChannels, 'chat');
  cloned.imageChannels = strip(cloned.imageChannels, 'image');

  return cloned as T;
}

export function mergeModelCachesIntoConfig (config: PluginConfig): PluginConfig {
  const cloned = JSON.parse(JSON.stringify(config || {})) as PluginConfig;

  cloned.chatChannels = (cloned.chatChannels || []).map(ch => ({
    ...ch,
    models_cache: getModelCache('chat', ch.name),
    models_cache_path: getModelCacheFilePath('chat', ch.name),
  }));

  cloned.imageChannels = (cloned.imageChannels || []).map(ch => ({
    ...ch,
    models_cache: getModelCache('image', ch.name),
    models_cache_path: getModelCacheFilePath('image', ch.name),
  }));

  return cloned;
}