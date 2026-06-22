import fs from 'fs';
import { pluginState } from '../core/state';

const SUPPORTED_MIME = new Map<string, string>([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
]);

function detectMimeByBytes(data: Uint8Array): string {
  const b = data;
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
  return 'image/png';
}

function parseBase64Image(input: string): Uint8Array | null {
  try {
    if (input.startsWith('base64://')) {
      return new Uint8Array(Buffer.from(input.slice('base64://'.length), 'base64'));
    }

    if (input.startsWith('data:image/')) {
      const b64 = input.includes(',') ? input.split(',').pop() || '' : '';
      if (!b64) return null;
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchBytes(url: string, timeout = 30000): Promise<Uint8Array | null> {
  const base64Bytes = parseBase64Image(url);
  if (base64Bytes) return base64Bytes;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    if (fs.existsSync(url) && fs.statSync(url).isFile()) {
      return new Uint8Array(fs.readFileSync(url));
    }

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://im.qq.com/',
      },
    });

    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

export async function getAvatar(userId: string): Promise<Uint8Array | null> {
  const url = `https://q4.qlogo.cn/headimg_dl?dst_uin=${userId}&spec=640`;
  return fetchBytes(url, 20000);
}

async function appendImageByUrl (
  result: { data: Uint8Array; mime_type: string; }[],
  url: string
): Promise<void> {
  const bytes = await fetchBytes(url);
  if (!bytes) return;

  const maxSize = Number(pluginState.config.imageMaxImageSizeMB || 10) * 1024 * 1024;
  if (bytes.byteLength > maxSize) return;

  pushUniqueImageRef(result, {
    data: bytes,
    mime_type: detectMimeByBytes(bytes),
  });
}

function parseCqParams(paramsStr: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!paramsStr) return params;

  for (const p of paramsStr.split(',')) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;

    const key = p.slice(0, eq).trim();
    const value = p.slice(eq + 1).trim()
      .replace(/&amp;/g, '&')
      .replace(/&#44;/g, ',')
      .replace(/&#91;/g, '[')
      .replace(/&#93;/g, ']');

    if (key) params[key] = value;
  }

  return params;
}

async function extractImagesFromRawMessage (
  raw: string,
  result: { data: Uint8Array; mime_type: string; }[]
): Promise<void> {
  const pattern = /\[CQ:image,([^\]]+)\]/g;

  for (const match of raw.matchAll(pattern)) {
    const params = parseCqParams(match[1] || '');
    const file = params.url || params.file || '';
    if (file) await appendImageByUrl(result, file);
  }
}

async function extractImagesFromMessageSegments (
  segments: unknown[],
  result: { data: Uint8Array; mime_type: string; }[]
): Promise<void> {
  for (const seg of segments) {
    const s = seg as { type?: string; data?: Record<string, unknown>; };

    if (s.type === 'image') {
      const file = String(s.data?.url || s.data?.file || '');
      if (file) await appendImageByUrl(result, file);
    }

    if (s.type === 'text' && typeof s.data?.text === 'string') {
      await extractImagesFromRawMessage(s.data.text, result);
    }
  }
}

function buildRefFingerprint (item: { data: Uint8Array; mime_type: string; }): string {
  return `${item.mime_type}:${item.data.byteLength}:${Buffer.from(item.data.slice(0, 64)).toString('base64')}`;
}

function pushUniqueImageRef (
  result: { data: Uint8Array; mime_type: string; }[],
  item: { data: Uint8Array; mime_type: string; }
): void {
  if (!item?.data?.byteLength) return;

  const fingerprint = buildRefFingerprint(item);
  const existed = result.some(ref => buildRefFingerprint(ref) === fingerprint);

  if (!existed) result.push(item);
}

function extractReplyIdsFromRawMessage(raw: string): string[] {
  const result: string[] = [];

  for (const match of String(raw || '').matchAll(/\[CQ:reply,id=(-?\d+)\]/g)) {
    if (match[1]) result.push(match[1]);
  }

  return Array.from(new Set(result));
}

function looksLikeImageUrl (text: string): boolean {
  const v = String(text || '').trim();

  if (!v) return false;
  if (v.startsWith('data:image/')) return true;
  if (v.startsWith('base64://')) return true;

  return /^https?:\/\//i.test(v) && (
    /\/download\?/i.test(v) ||
    /\.(png|jpe?g|webp|gif|bmp)(?:[?#].*)?$/i.test(v) ||
    /multimedia\.nt\.qq\.com\.cn/i.test(v) ||
    /gchat\.qpic\.cn/i.test(v) ||
    /c2cpicdw\.qpic\.cn/i.test(v) ||
    /qlogo\.cn/i.test(v)
  );
}

function decodeOneBotEscapes (text: string): string {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&#44;/g, ',')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractUrlsFromText (text: string): string[] {
  const raw = decodeOneBotEscapes(String(text || ''));
  const result: string[] = [];

  for (const match of raw.matchAll(/https?:\/\/[^\s"'<>，。！？、；：)\]}]+/gi)) {
    const url = match[0]
      .replace(/[，。！？、；：]+$/g, '')
      .replace(/[)\]}>]+$/g, '')
      .trim();

    if (looksLikeImageUrl(url)) result.push(url);
  }

  for (const match of raw.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=_-]+/g)) {
    if (match[0]) result.push(match[0]);
  }

  for (const match of raw.matchAll(/base64:\/\/[A-Za-z0-9+/=_-]+/g)) {
    if (match[0]) result.push(match[0]);
  }

  return Array.from(new Set(result));
}

async function appendImageFromAnyValue (
  value: unknown,
  result: { data: Uint8Array; mime_type: string; }[]
): Promise<void> {
  if (!value) return;

  if (typeof value === 'string') {
    const text = decodeOneBotEscapes(value.trim());

    if (looksLikeImageUrl(text)) {
      await appendImageByUrl(result, text);
      return;
    }

    const urls = extractUrlsFromText(text);
    for (const url of urls) {
      await appendImageByUrl(result, url);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      await appendImageFromAnyValue(item, result);
    }
    return;
  }

  if (typeof value !== 'object') return;

  const obj = value as Record<string, unknown>;

  /**
   * OneBot 图片段：
   * { type: "image", data: { file, url, ... } }
   */
  if (obj.type === 'image' && obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;

    const candidates = [
      data.url,
      data.file,
      data.path,
      data.base64,
    ];

    for (const candidate of candidates) {
      await appendImageFromAnyValue(candidate, result);
    }
  }

  /**
   * 常见字段兜底
   */
  for (const key of [
    'url',
    'file',
    'path',
    'image',
    'image_url',
    'imageUrl',
    'raw_message',
    'message',
    'content',
    'data',
  ]) {
    if (obj[key] !== undefined) {
      await appendImageFromAnyValue(obj[key], result);
    }
  }
}

async function appendReplyImagesByMessageId (
  replyId: string,
  result: { data: Uint8Array; mime_type: string; }[],
  ctx?: {
    actions?: {
      call: (action: string, params: unknown, adapter: string, config: unknown) => Promise<unknown>;
    };
    adapterName?: string;
    pluginManager?: { config: unknown; };
  }
): Promise<void> {
  if (!replyId || !ctx?.actions) return;

  try {
    const msgInfo = await ctx.actions.call(
      'get_msg',
      { message_id: replyId } as never,
      ctx.adapterName || '',
      ctx.pluginManager?.config
    ) as Record<string, unknown>;

    const data = msgInfo?.retcode === 0
      ? msgInfo.data as Record<string, unknown>
      : msgInfo;

    const tmp: { data: Uint8Array; mime_type: string; }[] = [];

    /**
     * 原逻辑：解析标准 OneBot message / raw_message
     */
    const message = data?.message;

    if (Array.isArray(message)) {
      await extractImagesFromMessageSegments(message, tmp);
    } else if (typeof message === 'string') {
      await extractImagesFromRawMessage(message, tmp);
    }

    const raw = String(data?.raw_message || '');
    if (raw) {
      await extractImagesFromRawMessage(raw, tmp);
    }

    /**
     * 新增强兜底：
     * 递归扫描 get_msg 返回体里的所有 image 段、url、file、raw_message、message 字段。
     *
     * 这可以兼容：
     * - data.message[].data.url
     * - data.message[].data.file
     * - raw_message 里 CQ:image
     * - 某些 NapCat 返回的嵌套结构
     */
    await appendImageFromAnyValue(data, tmp);

    for (const item of tmp) {
      pushUniqueImageRef(result, item);
    }
  } catch (e) {
    pluginState.debug(`[ImageProcessor] 读取引用消息图片失败 replyId=${replyId}: ${String(e)}`);
  }
}

export async function fetchReferenceImagesFromEvent(
  event: {
    message?: unknown;
    raw_message?: string;
    self_id?: number | string;
  },
  ctx?: {
    actions?: {
      call: (action: string, params: unknown, adapter: string, config: unknown) => Promise<unknown>;
    };
    adapterName?: string;
    pluginManager?: { config: unknown; };
  }
): Promise<{ data: Uint8Array; mime_type: string; }[]> {
  const replyImages: { data: Uint8Array; mime_type: string; }[] = [];
  const directImages: { data: Uint8Array; mime_type: string; }[] = [];
  const avatarImages: { data: Uint8Array; mime_type: string; }[] = [];

  const msg = event.message;
  const raw = typeof event.raw_message === 'string' ? event.raw_message : '';
  const selfId = event.self_id ? String(event.self_id) : '';

  /**
   * 关键修复：
   * 不管 event.message 是不是数组，都先从 raw_message 里兜底解析 reply。
   * LLM 自动生图 / 自拍时经常依赖这里把引用图取出来。
   */
  for (const replyId of extractReplyIdsFromRawMessage(raw)) {
    await appendReplyImagesByMessageId(replyId, replyImages, ctx);
  }

  if (!Array.isArray(msg)) {
    const onlyRaw: { data: Uint8Array; mime_type: string; }[] = [];

    for (const item of replyImages) pushUniqueImageRef(onlyRaw, item);

    if (raw) {
      const tmp: { data: Uint8Array; mime_type: string; }[] = [];
      await extractImagesFromRawMessage(raw, tmp);
      for (const item of tmp) pushUniqueImageRef(onlyRaw, item);
    }

    return onlyRaw;
  }

  for (const seg of msg) {
    const s = seg as { type?: string; data?: Record<string, unknown>; };

    try {
      /**
       * 1. 引用消息图片
       */
      if (s.type === 'reply' && s.data?.id && ctx?.actions) {
        await appendReplyImagesByMessageId(String(s.data.id), replyImages, ctx);
      }

      /**
       * 2. 当前消息图片
       */
      if (s.type === 'image') {
        const file = String(s.data?.url || s.data?.file || '');

        if (file) {
          const bytes = await fetchBytes(file);

          if (bytes) {
            const maxSize = Number(pluginState.config.imageMaxImageSizeMB || 10) * 1024 * 1024;

            if (bytes.byteLength <= maxSize) {
              pushUniqueImageRef(directImages, {
                data: bytes,
                mime_type: detectMimeByBytes(bytes),
              });
            }
          }
        }
      }

      /**
       * 3. text 段里可能也包含 CQ:image
       */
      if (s.type === 'text' && typeof s.data?.text === 'string') {
        const tmp: { data: Uint8Array; mime_type: string; }[] = [];
        await extractImagesFromRawMessage(s.data.text, tmp);
        for (const item of tmp) pushUniqueImageRef(directImages, item);
      }

      /**
       * 4. @ 用户头像最后作为参考图
       */
      if (s.type === 'at') {
        const qq = String(s.data?.qq || '');
        if (!qq || qq === 'all' || qq === selfId) continue;

        const avatar = await getAvatar(qq);

        if (avatar) {
          pushUniqueImageRef(avatarImages, {
            data: avatar,
            mime_type: 'image/jpeg',
          });
        }
      }
    } catch {}
  }

  /**
   * 优先级：
   * 引用图 > 当前消息图 > @头像
   */
  const result: { data: Uint8Array; mime_type: string; }[] = [];

  for (const item of replyImages) pushUniqueImageRef(result, item);
  for (const item of directImages) pushUniqueImageRef(result, item);
  for (const item of avatarImages) pushUniqueImageRef(result, item);

  return result;
}

export function filePathToMessageImage(filePath: string): { type: 'image'; data: { file: string; }; } {
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
  const mime = SUPPORTED_MIME.get(ext) || 'image/png';
  const b64 = fs.readFileSync(filePath).toString('base64');

  return {
    type: 'image',
    data: {
      file: `base64://${b64}`,
    },
  };
}