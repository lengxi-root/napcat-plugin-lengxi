import type { ChannelConfig, ImageChannelConfig } from '../types';
import { pluginState } from '../core/state';

const DEFAULT_MODEL_DISCOVERY_TIMEOUT = 10000;
const MIN_MODEL_DISCOVERY_TIMEOUT = 3000;
const MAX_MODEL_DISCOVERY_TIMEOUT = 120000;

function normalizeBaseUrl (url: string): string {
  let v = (url || '').trim().replace(/\/+$/, '');
  v = v.replace(/\/v1($|\/.*$)/i, '');
  v = v.replace(/\/chat\/completions$/i, '');
  v = v.replace(/\/images\/generations$/i, '');
  v = v.replace(/\/images\/edits$/i, '');
  return v;
}

function normalizeTimeout (value: unknown): number {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_MODEL_DISCOVERY_TIMEOUT;
  }

  return Math.min(
    MAX_MODEL_DISCOVERY_TIMEOUT,
    Math.max(MIN_MODEL_DISCOVERY_TIMEOUT, Math.floor(n))
  );
}

async function tryFetchJson (
  url: string,
  headers: Record<string, string>,
  timeoutValue: unknown = DEFAULT_MODEL_DISCOVERY_TIMEOUT
): Promise<unknown> {
  const timeout = normalizeTimeout(timeoutValue);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    pluginState.debug(`[ModelDiscovery] 尝试拉取模型: ${url}，超时: ${timeout}ms`);

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function extractModelIds (data: unknown): string[] {
  const result = new Set<string>();

  const walk = (value: unknown): void => {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }

    if (typeof value === 'string') {
      const text = value.trim();
      if (text) result.add(text);
      return;
    }

    if (typeof value !== 'object') return;

    const record = value as Record<string, unknown>;

    if (typeof record.id === 'string' && record.id.trim()) {
      result.add(record.id.trim());
    }

    if (typeof record.name === 'string' && record.name.trim() && typeof record.id !== 'string') {
      result.add(record.name.trim());
    }

    const candidateArrays = ['data', 'models', 'items', 'results', 'list'];

    for (const key of candidateArrays) {
      if (Array.isArray(record[key])) {
        walk(record[key]);
      }
    }
  };

  walk(data);

  return Array.from(result);
}

async function fetchModels (
  baseUrl: string,
  apiKey: string,
  timeoutValue: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<string[]> {
  const base = normalizeBaseUrl(baseUrl);
  const timeout = normalizeTimeout(timeoutValue);

  if (!base) {
    pluginState.debug('[ModelDiscovery] Base URL 为空，跳过模型拉取');
    return [];
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extraHeaders,
  };

  if (apiKey && !headers.Authorization && !headers['x-goog-api-key']) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const candidates = [
    `${base}/v1/models`,
    `${base}/models`,
    `${base}/v1beta/models`,
  ];

  for (const url of candidates) {
    try {
      const data = await tryFetchJson(url, headers, timeout);
      const models = extractModelIds(data);

      if (models.length > 0) {
        pluginState.debug(`[ModelDiscovery] 模型拉取成功: ${url}，数量: ${models.length}`);
        return models;
      }

      pluginState.debug(`[ModelDiscovery] ${url} 请求成功但模型为空，继续尝试下一个接口`);
    } catch (error) {
      pluginState.debug(`[ModelDiscovery] ${url} 拉取失败: ${String(error)}，继续尝试下一个接口`);
    }
  }

  pluginState.debug('[ModelDiscovery] 所有模型接口均未返回有效模型');
  return [];
}

export async function fetchChatModelsForChannel (channel: ChannelConfig): Promise<string[]> {
  const models = await fetchModels(
    channel.base_url,
    channel.api_key,
    channel.timeout
  );

  return models.length ? models : (channel.models_cache || []);
}

export async function fetchImageModelsForChannel (channel: ImageChannelConfig): Promise<string[]> {
  const extraHeaders: Record<string, string> = {};

  if (channel.provider_type === 'gemini' && channel.api_key) {
    extraHeaders['x-goog-api-key'] = channel.api_key;
  }

  const models = await fetchModels(
    channel.base_url,
    channel.api_key,
    channel.timeout,
    extraHeaders
  );

  return models.length ? models : (channel.models_cache || []);
}
