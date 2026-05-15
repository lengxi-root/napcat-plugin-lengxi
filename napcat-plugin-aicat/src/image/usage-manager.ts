import fs from 'fs';
import path from 'path';
import { pluginState } from '../core/state';
import { IMAGE_USAGE_RETENTION_DAYS } from './constants';
import { isWhitelisted } from '../managers/owner-manager';

interface UsageData {
  [date: string]: Record<string, number>;
}

export class ImageUsageManager {
  private usageFile = '';
  private usageData: UsageData = {};
  private requestTimestamps = new Map<string, number>();

  init (dataDir: string): void {
    this.usageFile = path.join(dataDir, 'image_usage.json');
    this.load();
  }

  private load (): void {
    if (!this.usageFile || !fs.existsSync(this.usageFile)) {
      this.usageData = {};
      return;
    }

    try {
      this.usageData = JSON.parse(fs.readFileSync(this.usageFile, 'utf-8')) as UsageData;
      this.cleanupOldData();
    } catch {
      this.usageData = {};
    }
  }

  private save (): void {
    if (!this.usageFile) return;

    try {
      const dir = path.dirname(this.usageFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.usageFile, JSON.stringify(this.usageData, null, 2), 'utf-8');
    } catch (e) {
      pluginState.log('error', `保存生图使用数据失败: ${e}`);
    }
  }

  private cleanupOldData (): void {
    const today = new Date();
    let changed = false;

    for (const key of Object.keys(this.usageData)) {
      const d = new Date(`${key}T00:00:00`);

      if (Number.isNaN(d.getTime())) {
        delete this.usageData[key];
        changed = true;
        continue;
      }

      const diff = Math.floor((today.getTime() - d.getTime()) / (24 * 3600 * 1000));

      if (diff > IMAGE_USAGE_RETENTION_DAYS) {
        delete this.usageData[key];
        changed = true;
      }
    }

    if (changed) this.save();
  }

  private getToday (): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  isBlacklisted (userId: string): boolean {
    return (pluginState.config.imageUmoBlacklist || []).includes(String(userId).trim());
  }

  isUnlimited (userId: string): boolean {
    return isWhitelisted(String(userId).trim());
  }

  check (userId: string): true | string {
    const uid = String(userId).trim();
    if (!uid) return true;

    if (this.isBlacklisted(uid)) {
      return pluginState.config.imageBlacklistBlockMessage || '❌ 当前会话未启用生图功能';
    }

    if (this.isUnlimited(uid)) return true;

    if (pluginState.config.imageEnableDailyLimit) {
      const today = this.getToday();
      const count = this.usageData[today]?.[uid] || 0;
      const limit = Number(pluginState.config.imageDailyLimitCount || 10);

      if (count >= limit) {
        return `❌ 您今日的生图额度已用完 (${limit}次)，请明天再试`;
      }
    }

    const rate = Number(pluginState.config.imageRateLimitSeconds || 0);

    if (rate > 0) {
      const now = Date.now();
      const last = this.requestTimestamps.get(uid) || 0;
      const remain = Math.ceil(rate - (now - last) / 1000);

      if (remain > 0) return `❌ 请求过于频繁，请在 ${remain} 秒后再试`;

      this.requestTimestamps.set(uid, now);
    }

    return true;
  }

  record (userId: string): void {
    if (!pluginState.config.imageEnableDailyLimit) return;

    const uid = String(userId).trim();
    if (!uid) return;
    if (this.isUnlimited(uid)) return;

    const today = this.getToday();

    if (!this.usageData[today]) this.usageData[today] = {};

    this.usageData[today][uid] = (this.usageData[today][uid] || 0) + 1;
    this.save();
  }

  getTodayUsage (userId: string): number {
    const uid = String(userId).trim();
    const today = this.getToday();
    return this.usageData[today]?.[uid] || 0;
  }

  getDailyLimit (): number {
    return Number(pluginState.config.imageDailyLimitCount || 10);
  }

  cleanupExpired (): void {
    this.cleanupOldData();
  }
}

export const imageUsageManager = new ImageUsageManager();
