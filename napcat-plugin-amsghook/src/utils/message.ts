// 消息处理工具函数
import type { ImageInfo, MediaInfo } from '../core/types';
import { addLog } from '../core/logger';

/**
 * 提取消息中的文本内容
 * 同时将 at 段转为 @昵称 文本（官机不支持 at）
 */
export function extractTextContent (message: any): string {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    return message.map((seg: any) => {
      if (seg?.type === 'text') return seg?.data?.text || '';
      if (seg?.type === 'at') {
        const name = seg?.data?.name || seg?.data?.qq || '';
        return name ? `@${name}` : '';
      }
      return '';
    }).join('');
  }
  return '';
}

/**
 * 官机代发的消息段白名单。
 * 官方富媒体消息一次只能携带一个图片、语音或视频；其他消息段保持 NapCat 原始发送。
 */
export function isOfficialMessageSupported (message: any): boolean {
  if (typeof message === 'string') return true;
  if (!Array.isArray(message) || message.length === 0) return false;

  let mediaCount = 0;
  for (const seg of message) {
    const type = seg?.type;
    if (type === 'text' || type === 'at') continue;
    if (type === 'image' || type === 'record' || type === 'video') {
      if (!seg?.data || (typeof seg.data.url !== 'string' && typeof seg.data.file !== 'string')) return false;
      mediaCount++;
      if (mediaCount > 1) return false;
      continue;
    }
    return false;
  }
  return true;
}

/** 提取消息中的第一张图片信息（含宽高） */
export function extractImageInfo (message: any): ImageInfo | null {
  if (!Array.isArray(message)) return null;
  for (const seg of message) {
    if (seg?.type === 'image' && seg?.data) {
      const d = seg.data;
      const w = parseInt(d.image_size?.split('x')?.[0]) || d.width || 0;
      const h = parseInt(d.image_size?.split('x')?.[1]) || d.height || 0;
      if (d.url && typeof d.url === 'string' && d.url.startsWith('http')) return { url: d.url, width: w, height: h };
      if (d.file && typeof d.file === 'string') {
        if (d.file.startsWith('http')) return { url: d.file, width: w, height: h };
        return { file: d.file, width: w, height: h };
      }
    }
  }
  return null;
}

/** 只下载图片头部字节来解析宽高（PNG/JPEG/GIF/BMP/WEBP） */
export async function probeImageSize (url: string): Promise<{ width: number; height: number; }> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-32767' },
      signal: AbortSignal.timeout(8000),
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      return { width: w, height: h };
    }
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { width: buf[6] | (buf[7] << 8), height: buf[8] | (buf[9] << 8) };
    }
    // BMP
    if (buf[0] === 0x42 && buf[1] === 0x4D) {
      const w = buf[18] | (buf[19] << 8) | (buf[20] << 16) | (buf[21] << 24);
      const h = buf[22] | (buf[23] << 8) | (buf[24] << 16) | (buf[25] << 24);
      return { width: w, height: Math.abs(h) };
    }
    // WEBP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x4C && buf.length > 25) {
        const bits = (buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24)) >>> 0;
        return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
      }
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20 && buf.length > 29) {
        return { width: (buf[26] | (buf[27] << 8)) & 0x3FFF, height: (buf[28] | (buf[29] << 8)) & 0x3FFF };
      }
    }
    // JPEG
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const marker = buf[i + 1];
        if ((marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          const h = (buf[i + 5] << 8) | buf[i + 6];
          const w = (buf[i + 7] << 8) | buf[i + 8];
          return { width: w, height: h };
        }
        const segLen = (buf[i + 2] << 8) | buf[i + 3];
        i += 2 + segLen;
      }
    }
  } catch (e: any) {
    addLog('debug', `probeImageSize 失败: ${e.message}`);
  }
  return { width: 0, height: 0 };
}


/** 提取消息中的语音或视频信息 */
export function extractMediaInfo (message: any): MediaInfo | null {
  if (!Array.isArray(message)) return null;
  for (const seg of message) {
    if ((seg?.type === 'record' || seg?.type === 'video') && seg?.data) {
      const d = seg.data;
      const url = d.url || d.file || '';
      if (url) return { type: seg.type, url: typeof url === 'string' && url.startsWith('http') ? url : undefined, file: url };
    }
  }
  return null;
}
