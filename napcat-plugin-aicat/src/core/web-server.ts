import http from 'http';
import { URL } from 'url';
import type { ChannelConfig, ChatModelTarget, ImageChannelConfig, ImageModelTarget, PluginConfig } from '../types';
import { modelMonitorManager } from '../managers/model-monitor';
import { AIClient } from '../tools/ai-client';
import { getModelCache, setModelCache } from './model-cache-store';
import { generateImageWithFallback } from '../image/generator';
import { getAdminClientJs, getAdminIndexHtml } from './admin-assets';
import { getAdminSelfieUploadJs } from './admin-selfie-upload';
import { imagePersonaManager } from '../image/persona-manager';

export interface WebServerOptions {
  port: number;
  token: string;
  getConfig: () => PluginConfig;
  setConfig: (patch: Record<string, unknown>) => PluginConfig;
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void;
}

let server: http.Server | null = null;
let currentPort = 0;
let currentToken = '';

function sendJson (
  res: http.ServerResponse,
  status: number,
  data: unknown
): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Token, X-AICat-Token, x-aicat-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(body);
}

function sendText (
  res: http.ServerResponse,
  status: number,
  contentType: string,
  text: string
): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function readBody (req: http.IncomingMessage, maxBytes = 32 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf-8');
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function getTokenFromRequest (req: http.IncomingMessage, url: URL): string {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();

  const xToken = req.headers['x-token'];
  if (typeof xToken === 'string') return xToken.trim();

  const aicatToken = req.headers['x-aicat-token'];
  if (typeof aicatToken === 'string') return aicatToken.trim();

  return String(url.searchParams.get('token') || '').trim();
}

function checkAuth (
  req: http.IncomingMessage,
  url: URL,
  token: string
): boolean {
  if (!token) return true;
  return getTokenFromRequest(req, url) === token;
}

function normalizeBaseUrl (url: string): string {
  let v = String(url || '').trim().replace(/\/+$/, '');
  v = v.replace(/\/v1($|\/.*$)/i, '');
  v = v.replace(/\/chat\/completions$/i, '');
  v = v.replace(/\/images\/generations$/i, '');
  v = v.replace(/\/images\/edits$/i, '');
  return v;
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

    if (typeof record.id === 'string' && record.id.trim()) result.add(record.id.trim());
    if (typeof record.name === 'string' && record.name.trim() && typeof record.id !== 'string') result.add(record.name.trim());

    for (const key of ['data', 'models', 'items', 'results', 'list']) {
      if (Array.isArray(record[key])) walk(record[key]);
    }
  };

  walk(data);
  return Array.from(result);
}

function getImageGlobalTimeout (config: PluginConfig): number {
  const raw = Number((config as PluginConfig & { imageGlobalTimeoutMs?: unknown }).imageGlobalTimeoutMs || 180000);
  if (!Number.isFinite(raw) || raw <= 0) return 180000;
  return Math.min(900000, Math.max(10000, Math.floor(raw)));
}

async function fetchJsonWithTimeout (
  url: string,
  headers: Record<string, string>,
  timeout: number
): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
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

async function refreshModels (
  channel: Partial<ChannelConfig | ImageChannelConfig>,
  kind: 'chat' | 'image'
): Promise<string[]> {
  const base = normalizeBaseUrl(String(channel.base_url || ''));
  const apiKey = String(channel.api_key || '');
  const timeoutRaw = Number(channel.timeout || (kind === 'image' ? 180000 : 60000));
  const timeout = Number.isFinite(timeoutRaw) && timeoutRaw > 0
    ? Math.min(20000, Math.max(3000, Math.floor(timeoutRaw)))
    : 10000;

  if (!base) throw new Error('base_url 为空');

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const providerType = String((channel as Partial<ImageChannelConfig>).provider_type || '');

  if (kind === 'image' && providerType === 'gemini' && apiKey) {
    headers['x-goog-api-key'] = apiKey;
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const candidates = [
    `${base}/v1/models`,
    `${base}/models`,
    `${base}/v1beta/models`,
  ];

  const errors: string[] = [];

  for (const url of candidates) {
    try {
      const data = await fetchJsonWithTimeout(url, headers, timeout);
      const models = extractModelIds(data);
      if (models.length) return models;
      errors.push(`${url}: 返回成功但未识别到模型`);
    } catch (e) {
      errors.push(`${url}: ${String(e)}`);
    }
  }

  throw new Error(errors.join('\n'));
}

function findChatTarget (
  config: PluginConfig,
  channelName: string,
  model: string
): ChatModelTarget | null {
  const ch = (config.chatChannels || []).find(c => c.name === channelName);
  if (!ch) return null;

  return {
    channelName,
    model,
    baseUrl: ch.base_url,
    apiKey: ch.api_key,
    timeout: ch.timeout || 60000,
  };
}

function findImageTarget (
  config: PluginConfig,
  channelName: string,
  model: string
): ImageModelTarget | null {
  const ch = (config.imageChannels || []).find(c => c.name === channelName);
  if (!ch) return null;

  return {
    channelName,
    model,
    providerType: ch.provider_type,
    baseUrl: ch.base_url,
    apiKey: ch.api_key,
    timeout: getImageGlobalTimeout(config),
    proxy: ch.proxy,
    capability_options: ch.capability_options,
    extra: ch.extra,
  };
}

function dataUrlToBytes (input: string): { bytes: Uint8Array; mime: string } {
  const text = String(input || '').trim();

  const dataUrlMatch = text.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  if (dataUrlMatch) {
    return {
      mime: dataUrlMatch[1] || 'image/png',
      bytes: new Uint8Array(Buffer.from(dataUrlMatch[2], 'base64')),
    };
  }

  const base64Prefix = 'base64://';
  if (text.startsWith(base64Prefix)) {
    return {
      mime: 'image/png',
      bytes: new Uint8Array(Buffer.from(text.slice(base64Prefix.length), 'base64')),
    };
  }

  return {
    mime: 'image/png',
    bytes: new Uint8Array(Buffer.from(text, 'base64')),
  };
}

function detectMimeByBytes (data: Uint8Array): string {
  const b = data;
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
  return 'image/png';
}

function buildTestImagePromptWithReferences (
  prompt: string,
  options: {
    useSelfieReference: boolean;
    extraReferenceCount: number;
    intent?: {
      isGroupPhoto: boolean;
      changeClothes: boolean;
      changePose: boolean;
      useTodayOutfit: boolean;
      hasReferenceStyleHint: boolean;
    };
  }
): string {
  const rawPrompt = String(prompt || '').trim();
  const intent = options.intent;

  if (!options.useSelfieReference) {
    return rawPrompt;
  }

  const lines: string[] = [
    '这是一次 Web 生图测试。',
    '',
  ];

  if (intent?.isGroupPhoto) {
    lines.push(
      '【合照模式】',
      '1. 参考图一是主角本人。',
      '2. 允许出现同框人物，但参考图一仍然是主角。',
      '3. 其他参考图中的人物可以作为同框对象或场景参考。',
      '4. 不要把其他参考图的人替换成主角。',
      '5. 画面应像真实合照，不要拼图，不要多视角。'
    );
  } else if (intent?.changeClothes) {
    lines.push(
      '【改衣服 / 改穿搭模式】',
      '1. 参考图一是唯一主体身份参考图，必须保持同一个人。',
      '2. 其他参考图只用于服装、配饰、颜色、材质、风格参考。',
      '3. 不要把其他参考图中的人物当成主角。',
      '4. 不要改变参考图一的脸、发型、发色和身份。'
    );
  } else if (intent?.changePose) {
    lines.push(
      '【改姿势模式】',
      '1. 参考图一是唯一主体身份参考图，必须保持同一个人。',
      '2. 其他参考图只用于姿势、动作、镜头角度、构图参考。',
      '3. 不要把其他参考图中的人物当成主角。',
      '4. 不要改变参考图一的脸、发型、发色和身份。'
    );
  } else if (intent?.useTodayOutfit) {
    lines.push(
      '【今日穿搭 / 日常自拍模式】',
      '1. 参考图一是唯一主体身份参考图，必须保持同一个人。',
      '2. 优先使用参考图一的今日穿搭和日常状态。',
      '3. 其他参考图只用于氛围、构图、风格参考。',
      '4. 不要把其他参考图中的人物当成主角。'
    );
  } else {
    lines.push(
      '【普通自拍模式】',
      '1. 参考图一是唯一主体身份参考图，必须保持同一个人。',
      '2. 其他参考图只用于服装、姿势、构图、风格、场景参考。',
      '3. 不要把其他参考图中的人物当成主角。',
      '4. 不要改变参考图一的脸、发型、发色和身份。'
    );
  }

  if (options.extraReferenceCount > 0) {
    lines.push(
      '',
      `当前除参考图一外，还有 ${options.extraReferenceCount} 张额外参考图。`,
      '这些额外参考图只能作为辅助参考，不能抢主体。'
    );
  }

  lines.push(
    '',
    '【生成要求】',
    '- 单张完整图像。',
    intent?.isGroupPhoto ? '- 允许合照，但仍要保证参考图一是主角。' : '- 只有一个主角，主角必须来自参考图一。',
    '- 不要拼图，不要分镜，不要多视角，不要角色设定图。',
    '- 不要文字，不要水印。',
    '- 画面自然、统一、完整。',
    '',
    '【用户测试提示词】',
    rawPrompt || '看着镜头自然自拍'
  );

  return lines.join('\n');
}

function getSelfieReferencePayload (): Record<string, unknown> {
  const data = imagePersonaManager.get();

  const ref = imagePersonaManager.getReferenceImage();
  if (!ref) {
    return {
      has_image: false,
      ref_mime_type: data.ref_mime_type || 'image/png',
      updated_at: data.updated_at || '',
    };
  }

  return {
    has_image: true,
    ref_mime_type: ref.mime_type || 'image/png',
    updated_at: data.updated_at || '',
    image: `data:${ref.mime_type || 'image/png'};base64,${Buffer.from(ref.data).toString('base64')}`,
  };
}

export function startWebServer (options: WebServerOptions): void {
  const port = Number(options.port || 0);
  const normalizedPort = Number.isFinite(port) && port > 0 && port <= 65535
    ? Math.floor(port)
    : 14514;

  const token = String(options.token || '').trim();

  if (server && currentPort === normalizedPort && currentToken === token) return;

  stopWebServer();

  currentPort = normalizedPort;
  currentToken = token;

  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

      if (req.method === 'OPTIONS') {
        sendJson(res, 200, { success: true });
        return;
      }

      if (url.pathname === '/' || url.pathname === '/index.html') {
        sendText(res, 200, 'text/html; charset=utf-8', getAdminIndexHtml());
        return;
      }

      if (url.pathname === '/admin.js') {
        sendText(
          res,
          200,
          'application/javascript; charset=utf-8',
          `${getAdminClientJs()}\n\n${getAdminSelfieUploadJs()}`
        );
        return;
      }

      if (url.pathname === '/api/health') {
        sendJson(res, 200, {
          success: true,
          data: {
            status: 'ok',
            port: currentPort,
            auth: Boolean(currentToken),
          },
        });
        return;
      }

      if (!checkAuth(req, url, currentToken)) {
        sendJson(res, 401, {
          success: false,
          error: 'Unauthorized：Token 不正确',
        });
        return;
      }

      if (url.pathname === '/api/monitor-records' && req.method === 'GET') {
        const type = String(url.searchParams.get('type') || '') as 'chat' | 'image' | '';
        const model = String(url.searchParams.get('model') || '');
        const success = String(url.searchParams.get('success') || '');
        const limit = Number(url.searchParams.get('limit') || 20);
        const offset = Number(url.searchParams.get('offset') || 0);
      
        const data = modelMonitorManager.list({
          type,
          model,
          success,
          limit,
          offset,
        });
      
        sendJson(res, 200, {
          success: true,
          data: data.records,
          total: data.total,
          limit,
          offset,
        });
        return;
      }
      

      if (url.pathname === '/api/monitor-records/detail' && req.method === 'GET') {
        const id = String(url.searchParams.get('id') || '').trim();

        if (!id) {
          sendJson(res, 400, {
            success: false,
            error: '缺少 id',
          });
          return;
        }

        const detail = modelMonitorManager.getDetail(id);

        if (!detail) {
          sendJson(res, 404, {
            success: false,
            error: '记录不存在',
          });
          return;
        }

        sendJson(res, 200, {
          success: true,
          data: detail,
        });
        return;
      }

      if (url.pathname === '/api/monitor-records/delete' && req.method === 'POST') {
        const body = await readBody(req);
        const payload = JSON.parse(body || '{}') as { id?: string; };
        const id = String(payload.id || '').trim();
      
        if (!id) {
          sendJson(res, 400, {
            success: false,
            error: '缺少 id',
          });
          return;
        }
      
        const ok = modelMonitorManager.remove(id);
      
        sendJson(res, 200, {
          success: true,
          deleted: ok,
        });
        return;
      }
      
      if (url.pathname === '/api/monitor-records/clear' && req.method === 'POST') {
        const body = await readBody(req);
        const payload = JSON.parse(body || '{}') as { type?: 'chat' | 'image' | ''; };
        const deleted = modelMonitorManager.clear(payload.type || '');
      
        sendJson(res, 200, {
          success: true,
          deleted,
        });
        return;
      }

      if (url.pathname === '/api/config' && req.method === 'GET') {
        sendJson(res, 200, {
          success: true,
          data: options.getConfig(),
        });
        return;
      }

      if (url.pathname === '/api/config' && req.method === 'POST') {
        const body = await readBody(req);
        const parsed = JSON.parse(body || '{}') as { config?: Record<string, unknown>; } & Record<string, unknown>;
        const patch = parsed.config && typeof parsed.config === 'object' && !Array.isArray(parsed.config)
          ? parsed.config
          : parsed;

        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
          sendJson(res, 400, {
            success: false,
            error: '请求体必须是 JSON 对象',
          });
          return;
        }

        const next = options.setConfig(patch);
        sendJson(res, 200, {
          success: true,
          data: next,
        });
        return;
      }

      if (url.pathname === '/api/selfie-reference' && req.method === 'GET') {
        sendJson(res, 200, {
          success: true,
          data: getSelfieReferencePayload(),
        });
        return;
      }

      if (url.pathname === '/api/selfie-reference' && req.method === 'POST') {
        const body = await readBody(req, 32 * 1024 * 1024);
        const payload = JSON.parse(body || '{}') as {
          image?: string;
          data?: string;
          mime_type?: string;
          filename?: string;
        };

        const rawImage = String(payload.image || payload.data || '').trim();
        if (!rawImage) {
          sendJson(res, 400, {
            success: false,
            error: '缺少 image 字段，支持 data:image/...;base64,... 或纯 base64',
          });
          return;
        }

        const parsed = dataUrlToBytes(rawImage);
        if (!parsed.bytes.byteLength) {
          sendJson(res, 400, {
            success: false,
            error: '上传图片为空',
          });
          return;
        }

        const maxSizeMb = Math.max(1, Number(options.getConfig().imageMaxImageSizeMB || 10));
        const maxBytes = maxSizeMb * 1024 * 1024;

        if (parsed.bytes.byteLength > maxBytes) {
          sendJson(res, 400, {
            success: false,
            error: `图片过大，最大允许 ${maxSizeMb}MB`,
          });
          return;
        }

        const mime = normalizeImageMime(payload.mime_type || detectMimeByBytes(parsed.bytes));
        imagePersonaManager.saveReferenceImage(parsed.bytes, mime);

        sendJson(res, 200, {
          success: true,
          data: getSelfieReferencePayload(),
          message: '自拍参考图已保存',
        });
        return;
      }

      if (url.pathname === '/api/selfie-reference/clear' && req.method === 'POST') {
        imagePersonaManager.clearReferenceImage();

        sendJson(res, 200, {
          success: true,
          data: getSelfieReferencePayload(),
          message: '自拍参考图已清除',
        });
        return;
      }

      if (url.pathname === '/api/refresh-chat-models' && req.method === 'POST') {
        const body = await readBody(req);
        const payload = JSON.parse(body || '{}') as { channel?: Partial<ChannelConfig>; };
        const channel = payload.channel || {};
        const models = await refreshModels(channel, 'chat');
      
        const channelName = String(channel.name || '').trim();
        const cachePath = channelName
          ? setModelCache('chat', channelName, models)
          : '';
      
        /**
         * 关键：
         * 拉取后不直接信任内存里的 models，
         * 而是重新从独立缓存 JSON 读取，保证 Web 看到的始终是缓存文件内容。
         */
        const cachedModels = channelName
          ? getModelCache('chat', channelName)
          : models;
      
        sendJson(res, 200, {
          success: true,
          data: cachedModels,
          count: cachedModels.length,
          cache_path: cachePath,
        });
        return;
      }

      if (url.pathname === '/api/refresh-image-models' && req.method === 'POST') {
        const body = await readBody(req);
        const payload = JSON.parse(body || '{}') as { channel?: Partial<ImageChannelConfig>; };
        const channel = payload.channel || {};
        const models = await refreshModels(channel, 'image');
      
        const channelName = String(channel.name || '').trim();
        const cachePath = channelName
          ? setModelCache('image', channelName, models)
          : '';
      
        /**
         * 关键：
         * 拉取后重新从独立缓存 JSON 读取。
         */
        const cachedModels = channelName
          ? getModelCache('image', channelName)
          : models;
      
        sendJson(res, 200, {
          success: true,
          data: cachedModels,
          count: cachedModels.length,
          cache_path: cachePath,
        });
        return;
      }

      if (url.pathname === '/api/test-chat-channel' && req.method === 'POST') {
        const started = Date.now();
        const body = await readBody(req);
        const payload = JSON.parse(body || '{}') as {
          channel?: string;
          model?: string;
          prompt?: string;
        };

        const config = options.getConfig();
        const target = findChatTarget(config, String(payload.channel || ''), String(payload.model || ''));

        if (!target) {
          sendJson(res, 400, {
            success: false,
            error: '未找到指定对话模型',
          });
          return;
        }

        const client = new AIClient({
          base_url: target.baseUrl,
          api_key: target.apiKey,
          model: target.model,
          timeout: target.timeout,
        });

        const prompt = String(payload.prompt || '你好');

        const requestData = {
          type: 'chat-test',
          channel: target.channelName,
          model: target.model,
          base_url: target.baseUrl,
          timeout: target.timeout,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        };

        let content = '';
        let chatError = '';
        
        try {
          content = await client.chatSimple([
            {
              role: 'user',
              content: prompt,
            },
          ]);
        } catch (e) {
          chatError = String(e);
        }
        
        const elapsedMs = Date.now() - started;
        
        modelMonitorManager.recordChat({
          source: 'web-test',
          channel: target.channelName,
          model: `${target.channelName}/${target.model}`,
          prompt,
          response: content,
          success: !chatError && Boolean(content),
          error: chatError || (!content ? '模型返回为空' : ''),
          elapsed_ms: elapsedMs,
        });
        
        if (chatError) {
          sendJson(res, 500, {
            success: false,
            error: chatError,
            data: {
              used_model: `${target.channelName}/${target.model}`,
              elapsed_ms: elapsedMs,
              elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
              request_data: requestData,
              response_data: {
                success: false,
                error: chatError,
                content,
              },
            },
          });
          return;
        }

        sendJson(res, 200, {
          success: true,
          data: {
            used_model: `${target.channelName}/${target.model}`,
            content,
            elapsed_ms: elapsedMs,
            elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
            request_data: requestData,
            response_data: {
              success: true,
              content,
              used_model: `${target.channelName}/${target.model}`,
              elapsed_ms: elapsedMs,
              elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
            },
          },
        });
        return;
      }

      if (url.pathname === '/api/test-image-channel' && req.method === 'POST') {
        const started = Date.now();
        const body = await readBody(req, 32 * 1024 * 1024);
      
        const payload = JSON.parse(body || '{}') as {
          channel?: string;
          model?: string;
          prompt?: string;
          aspect_ratio?: string;
          resolution?: string;
          images?: string[];
          image?: string;
          use_selfie_reference?: boolean;
        };
      
        const config = options.getConfig();
        const target = findImageTarget(config, String(payload.channel || ''), String(payload.model || ''));
      
        if (!target) {
          sendJson(res, 400, {
            success: false,
            error: '未找到指定生图模型',
          });
          return;
        }
      
        const refs: { data: Uint8Array; mime_type: string; }[] = [];
        const rawImages = [
          ...(Array.isArray(payload.images) ? payload.images : []),
          ...(payload.image ? [payload.image] : []),
        ];
        
        const maxSizeMb = Math.max(1, Number(config.imageMaxImageSizeMB || 10));
        const maxBytes = maxSizeMb * 1024 * 1024;
        
        /**
         * 渠道测试可勾选使用 AI 自拍形象图。
         * 勾选后，形象图会作为第一张参考图传入。
         */
        if (payload.use_selfie_reference) {
          const selfieRef = imagePersonaManager.getReferenceImage();
        
          if (!selfieRef) {
            sendJson(res, 400, {
              success: false,
              error: '当前未设置 AI 自拍形象参考图，请先在“形象设置”中上传或设置参考图',
            });
            return;
          }
        
          if (selfieRef.data.byteLength > maxBytes) {
            sendJson(res, 400, {
              success: false,
              error: `AI 自拍形象图过大，最大允许 ${maxSizeMb}MB`,
            });
            return;
          }
        
          refs.push({
            data: selfieRef.data,
            mime_type: normalizeImageMime(selfieRef.mime_type || detectMimeByBytes(selfieRef.data)),
          });
        }
      
        for (const raw of rawImages) {
          const text = String(raw || '').trim();
          if (!text) continue;
      
          try {
            const parsed = dataUrlToBytes(text);
      
            if (!parsed.bytes.byteLength) continue;
      
            if (parsed.bytes.byteLength > maxBytes) {
              sendJson(res, 400, {
                success: false,
                error: `参考图过大，最大允许 ${maxSizeMb}MB`,
              });
              return;
            }
      
            refs.push({
              data: parsed.bytes,
              mime_type: normalizeImageMime(parsed.mime || detectMimeByBytes(parsed.bytes)),
            });
          } catch (e) {
            sendJson(res, 400, {
              success: false,
              error: `参考图解析失败: ${String(e)}`,
            });
            return;
          }
        }
      
        const originalPrompt = String(payload.prompt || '').trim();
        const intent = imagePersonaManager.analyzeSelfieIntent(originalPrompt);
        
        const finalPrompt = buildTestImagePromptWithReferences(originalPrompt, {
          useSelfieReference: Boolean(payload.use_selfie_reference),
          extraReferenceCount: rawImages.filter(i => String(i || '').trim()).length,
          intent,
        });
        
        const aspectRatio = String(payload.aspect_ratio || config.imageDefaultAspectRatio || '自动');
        const resolution = String(payload.resolution || config.imageDefaultResolution || '1K');

        const requestData = {
          type: 'image-test',
          channel: target.channelName,
          model: target.model,
          provider_type: target.providerType,
          base_url: target.baseUrl,
          timeout: target.timeout,
          prompt: finalPrompt,
          original_prompt: originalPrompt,
          aspect_ratio: aspectRatio,
          resolution,
          reference_images: refs.map((ref, index) => ({
            index,
            mime_type: ref.mime_type,
            size_bytes: ref.data.byteLength,
          })),
          use_selfie_reference: Boolean(payload.use_selfie_reference),
          extra_reference_images: rawImages.filter(i => String(i || '').trim()).length,
        };

        const result = await generateImageWithFallback([target], {
          prompt: finalPrompt,
          aspect_ratio: aspectRatio,
          resolution,
          images: refs.length ? refs : undefined,
        });
      
        const elapsedMs = Date.now() - started;
      
        if (result.error || !result.images?.length) {
          modelMonitorManager.recordImage({
            source: 'web-test',
            requested_model: `${target.channelName}/${target.model}`,
            used_model: result.usedModel || `${target.channelName}/${target.model}`,
            prompt: finalPrompt,
            aspect_ratio: aspectRatio,
            resolution,
            success: false,
            error: result.error || '未生成任何图片',
            elapsed_ms: elapsedMs,
            input_images: refs,
          });
        
          sendJson(res, 500, {
            success: false,
            error: result.error || '未生成任何图片',
            data: {
              used_model: result.usedModel || `${target.channelName}/${target.model}`,
              elapsed_ms: elapsedMs,
              elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
              reference_images: refs.length,
              use_selfie_reference: Boolean(payload.use_selfie_reference),
              extra_reference_images: rawImages.filter(i => String(i || '').trim()).length,
              original_prompt: originalPrompt,
              final_prompt: finalPrompt,
              request_data: requestData,
              response_data: {
                success: false,
                error: result.error || '未生成任何图片',
                raw_result: result,
                used_model: result.usedModel || `${target.channelName}/${target.model}`,
                image_count: 0,
                elapsed_ms: elapsedMs,
                elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
              },
            },
          });
          return;
        }

        modelMonitorManager.recordImage({
          source: 'web-test',
          requested_model: `${target.channelName}/${target.model}`,
          used_model: result.usedModel || `${target.channelName}/${target.model}`,
          prompt: String(payload.prompt || ''),
          aspect_ratio: String(payload.aspect_ratio || config.imageDefaultAspectRatio || '自动'),
          resolution: String(payload.resolution || config.imageDefaultResolution || '1K'),
          success: true,
          elapsed_ms: elapsedMs,
          input_images: refs,
          output_images: result.images,
        });

        sendJson(res, 200, {
          success: true,
            data: {
              used_model: result.usedModel || `${target.channelName}/${target.model}`,
              elapsed_ms: elapsedMs,
              elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
              reference_images: refs.length,
              use_selfie_reference: Boolean(payload.use_selfie_reference),
              extra_reference_images: rawImages.filter(i => String(i || '').trim()).length,
              original_prompt: originalPrompt,
              final_prompt: finalPrompt,
              images: result.images.map(img => `data:image/png;base64,${Buffer.from(img).toString('base64')}`),
              request_data: requestData,
              response_data: {
                success: true,
                used_model: result.usedModel || `${target.channelName}/${target.model}`,
                image_count: result.images.length,
                image_sizes: result.images.map(img => img.byteLength),
                elapsed_ms: elapsedMs,
                elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
              },
            },
        });
        return;
      }

      sendJson(res, 404, {
        success: false,
        error: `Not Found: ${url.pathname}`,
      });
    } catch (error) {
      sendJson(res, 500, {
        success: false,
        error: String(error),
      });
    }
  });

  server.listen(currentPort, '0.0.0.0', () => {
    options.log?.('info', `Web 配置服务已启动: http://127.0.0.1:${currentPort}`);
  });

  server.on('error', error => {
    options.log?.('error', `Web 配置服务异常: ${String(error)}`);
  });
}

export function stopWebServer (): void {
  if (!server) return;

  const old = server;
  server = null;
  currentPort = 0;
  currentToken = '';

  try {
    old.close();
  } catch {}
}

export function getWebServerState (): {
  running: boolean;
  port: number;
  auth: boolean;
} {
  return {
    running: Boolean(server),
    port: currentPort,
    auth: Boolean(currentToken),
  };
}

function normalizeImageMime (mime: string): string {
  const v = String(mime || '').split(';')[0].trim().toLowerCase();

  if (v === 'image/jpg') return 'image/jpeg';

  if (
    v === 'image/png' ||
    v === 'image/jpeg' ||
    v === 'image/webp' ||
    v === 'image/gif'
  ) {
    return v;
  }

  return 'image/png';
}
