import fs from 'fs';
import path from 'path';
import { pluginState } from '../core/state';
import { DEFAULT_IMAGE_MAX_CACHE_COUNT } from './constants';

export class ImageCacheManager {
  private cacheDir = '';

  init(dataDir: string): void {
    this.cacheDir = path.join(dataDir, 'image-cache');
    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  getDir(): string {
    return this.cacheDir;
  }

  saveGeneratedImage(taskId: string, bytes: Uint8Array, ext = 'png'): string | null {
    if (!this.cacheDir) return null;
    try {
      const file = `gen_${taskId}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}.${ext}`;
      const filePath = path.join(this.cacheDir, file);
      fs.writeFileSync(filePath, Buffer.from(bytes));
      return filePath;
    } catch (e) {
      pluginState.log('error', `保存生图缓存失败: ${e}`);
      return null;
    }
  }

  cleanup(): number {
    if (!this.cacheDir || !fs.existsSync(this.cacheDir)) return 0;

    const maxCount = Number(pluginState.config.imageMaxCacheCount || DEFAULT_IMAGE_MAX_CACHE_COUNT);
    const files = fs.readdirSync(this.cacheDir)
      .map(name => {
        const file = path.join(this.cacheDir, name);
        try {
          const stat = fs.statSync(file);
          return stat.isFile() ? { file, mtime: stat.mtimeMs } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { file: string; mtime: number; }[];

    if (files.length <= maxCount) return 0;

    files.sort((a, b) => a.mtime - b.mtime);
    const toDelete = files.slice(0, files.length - maxCount);
    let count = 0;

    for (const item of toDelete) {
      try {
        fs.unlinkSync(item.file);
        count++;
      } catch {}
    }

    return count;
  }
}

export const imageCacheManager = new ImageCacheManager();
