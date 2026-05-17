import fs from 'fs';
import path from 'path';

export type MonitorRecordType = 'chat' | 'image';

export interface ChatMonitorRecord {
  id: string;
  type: 'chat';
  created_at: string;
  source: string;
  model: string;
  channel?: string;
  prompt: string;
  response?: string;
  success: boolean;
  error?: string;
  elapsed_ms: number;
  elapsed_seconds: number;
}

export interface ImageMonitorRecord {
  id: string;
  type: 'image';
  created_at: string;
  source: string;
  requested_model?: string;
  used_model?: string;
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  success: boolean;
  error?: string;
  elapsed_ms: number;
  elapsed_seconds: number;
  input_previews?: string[];
  output_previews?: string[];
}

export type MonitorRecord = ChatMonitorRecord | ImageMonitorRecord;

export type MonitorListRecord =
  | (Omit<ChatMonitorRecord, 'response'> & {
      response?: string;
    })
  | (Omit<ImageMonitorRecord, 'input_previews' | 'output_previews'> & {
      input_preview_count?: number;
      output_preview_count?: number;
    });

interface MonitorStore {
  records: MonitorRecord[];
  updated_at: string;
}

let DATA_DIR = '';
let FILE = '';
let IMAGE_CACHE_DIR = '';

const MAX_RECORDS = 1000;
const MAX_TEXT = 4000;
const MAX_PREVIEW_COUNT = 4;

function nowIso (): string {
  return new Date().toISOString();
}

function genId (): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function trimText (text: unknown, max = MAX_TEXT): string {
  const raw = String(text || '');
  return raw.length > max ? raw.slice(0, max) + '...' : raw;
}

function ensureDir (dir: string): void {
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureImageCacheDir (): void {
  if (!IMAGE_CACHE_DIR && DATA_DIR) {
    IMAGE_CACHE_DIR = path.join(DATA_DIR, 'image-cache');
  }

  ensureDir(IMAGE_CACHE_DIR);
}

function detectMimeByBytes (data: Uint8Array): string {
  const b = data;

  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';

  return 'image/png';
}

function extFromMime (mime: string): string {
  const m = String(mime || '').toLowerCase();

  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('bmp')) return 'bmp';

  return 'png';
}

function bytesToDataUrl (bytes: Uint8Array, mime?: string): string {
  const m = mime || detectMimeByBytes(bytes);
  return `data:${m};base64,${Buffer.from(bytes).toString('base64')}`;
}

function dataUrlToBytes (dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const text = String(dataUrl || '').trim();
  const match = text.match(/^data:([^;,]+);base64,([\s\S]+)$/i);

  if (!match) return null;

  try {
    return {
      mime: match[1] || 'image/png',
      bytes: new Uint8Array(Buffer.from(match[2], 'base64')),
    };
  } catch {
    return null;
  }
}

function savePreviewBytes (
  bytes: Uint8Array,
  options: {
    mime?: string;
    prefix?: string;
  } = {}
): string {
  if (!bytes.byteLength) return '';

  ensureImageCacheDir();
  if (!IMAGE_CACHE_DIR) return '';

  const mime = options.mime || detectMimeByBytes(bytes);
  const ext = extFromMime(mime);
  const prefix = String(options.prefix || 'preview').replace(/[^\w.-]+/g, '_');

  const filename = `monitor_${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}.${ext}`;
  const filePath = path.join(IMAGE_CACHE_DIR, filename);

  try {
    fs.writeFileSync(filePath, Buffer.from(bytes));
    return filePath;
  } catch {
    return '';
  }
}

function fileToDataUrl (file: string): string {
  try {
    if (!file || !fs.existsSync(file)) return '';
    if (!fs.statSync(file).isFile()) return '';

    const bytes = new Uint8Array(fs.readFileSync(file));
    return bytesToDataUrl(bytes);
  } catch {
    return '';
  }
}

function normalizePreviewListForStore (
  items?: Array<string | Uint8Array | { data: Uint8Array; mime_type?: string; }>,
  prefix = 'preview'
): string[] {
  if (!Array.isArray(items)) return [];

  const result: string[] = [];

  for (const item of items.slice(0, MAX_PREVIEW_COUNT)) {
    try {
      if (!item) continue;

      if (typeof item === 'string') {
        if (item.startsWith('data:image/')) {
          const parsed = dataUrlToBytes(item);
          if (!parsed || !parsed.bytes.byteLength) continue;

          const filePath = savePreviewBytes(parsed.bytes, {
            mime: parsed.mime,
            prefix,
          });

          if (filePath) result.push(filePath);
          continue;
        }

        if (fs.existsSync(item) && fs.statSync(item).isFile()) {
          result.push(item);
          continue;
        }

        continue;
      }

      if (item instanceof Uint8Array) {
        const filePath = savePreviewBytes(item, { prefix });
        if (filePath) result.push(filePath);
        continue;
      }

      if (typeof item === 'object' && item.data instanceof Uint8Array) {
        const filePath = savePreviewBytes(item.data, {
          mime: item.mime_type || 'image/png',
          prefix,
        });

        if (filePath) result.push(filePath);
      }
    } catch {}
  }

  return result;
}

function hydratePreviewListForDetail (items?: string[]): string[] {
  if (!Array.isArray(items)) return [];

  const result: string[] = [];

  for (const item of items.slice(0, MAX_PREVIEW_COUNT)) {
    try {
      if (!item) continue;

      if (item.startsWith('data:image/')) {
        result.push(item);
        continue;
      }

      const dataUrl = fileToDataUrl(item);
      if (dataUrl) result.push(dataUrl);
    } catch {}
  }

  return result;
}

class ModelMonitorManager {
  private records: MonitorRecord[] = [];

  private syncIfFileDeleted (): void {
    /**
     * 关键修复：
     * 如果 model_monitor.json 被外部手动删除，
     * 但进程还在运行，就把内存里的旧记录清空。
     *
     * 这样后续新记录就是从空开始，不会把删文件前的数据继续写回去。
     */
    if (FILE && !fs.existsSync(FILE) && this.records.length > 0) {
      this.records = [];
    }
  }

  init (dataDir: string): void {
    DATA_DIR = dataDir;
    FILE = path.join(DATA_DIR, 'model_monitor.json');
    IMAGE_CACHE_DIR = path.join(DATA_DIR, 'image-cache');

    ensureDir(DATA_DIR);
    ensureDir(IMAGE_CACHE_DIR);

    this.load();
  }

  private load (): void {
    if (!FILE || !fs.existsSync(FILE)) {
      this.records = [];
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Partial<MonitorStore>;
      this.records = Array.isArray(data.records) ? data.records : [];
    } catch {
      this.records = [];
    }
  }

  private save (): void {
    this.syncIfFileDeleted();
    if (!FILE) return;

    try {
      const dir = path.dirname(FILE);
      ensureDir(dir);

      const store: MonitorStore = {
        records: this.records.slice(0, MAX_RECORDS),
        updated_at: nowIso(),
      };

      fs.writeFileSync(FILE, JSON.stringify(store, null, 2), 'utf-8');
    } catch {}
  }

  private toListRecord (record: MonitorRecord): MonitorListRecord {
    if (record.type === 'chat') {
      return {
        ...record,
        response: record.response
          ? trimText(record.response, 300)
          : undefined,
      };
    }

    return {
      id: record.id,
      type: record.type,
      created_at: record.created_at,
      source: record.source,
      requested_model: record.requested_model,
      used_model: record.used_model,
      prompt: trimText(record.prompt, 500),
      aspect_ratio: record.aspect_ratio,
      resolution: record.resolution,
      success: record.success,
      error: record.error ? trimText(record.error, 800) : undefined,
      elapsed_ms: record.elapsed_ms,
      elapsed_seconds: record.elapsed_seconds,
      input_preview_count: record.input_previews?.length || 0,
      output_preview_count: record.output_previews?.length || 0,
    };
  }

  recordChat (input: {
    source?: string;
    model: string;
    channel?: string;
    prompt: string;
    response?: string;
    success: boolean;
    error?: string;
    elapsed_ms: number;
  }): ChatMonitorRecord {
    this.syncIfFileDeleted();

    const elapsedMs = Math.max(0, Math.floor(Number(input.elapsed_ms || 0)));

    const record: ChatMonitorRecord = {
      id: genId(),
      type: 'chat',
      created_at: nowIso(),
      source: String(input.source || 'api'),
      model: String(input.model || ''),
      channel: input.channel ? String(input.channel) : undefined,
      prompt: trimText(input.prompt),
      response: input.response ? trimText(input.response) : undefined,
      success: Boolean(input.success),
      error: input.error ? trimText(input.error, 2000) : undefined,
      elapsed_ms: elapsedMs,
      elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
    };

    this.records.unshift(record);
    this.records = this.records.slice(0, MAX_RECORDS);
    this.save();

    return record;
  }

  recordImage (input: {
    source?: string;
    requested_model?: string;
    used_model?: string;
    prompt: string;
    aspect_ratio?: string;
    resolution?: string;
    success: boolean;
    error?: string;
    elapsed_ms: number;
    input_images?: Array<string | Uint8Array | { data: Uint8Array; mime_type?: string; }>;
    output_images?: Array<string | Uint8Array | { data: Uint8Array; mime_type?: string; }>;
  }): ImageMonitorRecord {
    this.syncIfFileDeleted();

    const elapsedMs = Math.max(0, Math.floor(Number(input.elapsed_ms || 0)));

    const record: ImageMonitorRecord = {
      id: genId(),
      type: 'image',
      created_at: nowIso(),
      source: String(input.source || 'api'),
      requested_model: input.requested_model ? String(input.requested_model) : undefined,
      used_model: input.used_model ? String(input.used_model) : undefined,
      prompt: trimText(input.prompt),
      aspect_ratio: input.aspect_ratio ? String(input.aspect_ratio) : undefined,
      resolution: input.resolution ? String(input.resolution) : undefined,
      success: Boolean(input.success),
      error: input.error ? trimText(input.error, 3000) : undefined,
      elapsed_ms: elapsedMs,
      elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
      input_previews: normalizePreviewListForStore(input.input_images, 'input'),
      output_previews: normalizePreviewListForStore(input.output_images, 'output'),
    };

    this.records.unshift(record);
    this.records = this.records.slice(0, MAX_RECORDS);
    this.save();

    return record;
  }

  list (options: {
    type?: MonitorRecordType | '';
    model?: string;
    success?: string;
    limit?: number;
    offset?: number;
  } = {}): { records: MonitorListRecord[]; total: number; } {
    this.syncIfFileDeleted();

    let rows = [...this.records];

    if (options.type) {
      rows = rows.filter(r => r.type === options.type);
    }

    if (options.model) {
      const kw = String(options.model).toLowerCase();

      rows = rows.filter(r => {
        if (r.type === 'chat') {
          return r.model.toLowerCase().includes(kw);
        }

        return String(r.used_model || r.requested_model || '').toLowerCase().includes(kw);
      });
    }

    if (options.success === 'true') {
      rows = rows.filter(r => r.success);
    } else if (options.success === 'false') {
      rows = rows.filter(r => !r.success);
    }

    const total = rows.length;
    const offset = Math.max(0, Math.floor(Number(options.offset || 0)));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit || 20))));

    return {
      total,
      records: rows
        .slice(offset, offset + limit)
        .map(record => this.toListRecord(record)),
    };
  }

  getDetail (id: string): MonitorRecord | null {
    this.syncIfFileDeleted();

    const target = String(id || '').trim();
    if (!target) return null;

    const record = this.records.find(r => r.id === target);
    if (!record) return null;

    if (record.type === 'chat') {
      return { ...record };
    }

    return {
      ...record,
      input_previews: hydratePreviewListForDetail(record.input_previews),
      output_previews: hydratePreviewListForDetail(record.output_previews),
    };
  }

  remove (id: string): boolean {
    this.syncIfFileDeleted();

    const before = this.records.length;
    this.records = this.records.filter(r => r.id !== id);

    const changed = this.records.length !== before;
    if (changed) this.save();

    return changed;
  }

  clear (type?: MonitorRecordType | ''): number {
    this.syncIfFileDeleted();

    const before = this.records.length;

    if (type) {
      this.records = this.records.filter(r => r.type !== type);
    } else {
      this.records = [];
    }

    const deleted = before - this.records.length;
    if (deleted) this.save();

    return deleted;
  }
}

export const modelMonitorManager = new ModelMonitorManager();