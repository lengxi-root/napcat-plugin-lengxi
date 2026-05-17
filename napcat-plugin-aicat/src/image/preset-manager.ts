import fs from 'fs';
import path from 'path';

export interface ImagePreset {
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  description?: string;
}

class ImagePresetManager {
  private file = '';
  private presets = new Map<string, ImagePreset>();

  init (dataDir: string): void {
    this.file = path.join(dataDir, 'image_presets.json');
    this.load();
  }

  private load (): void {
    if (!this.file || !fs.existsSync(this.file)) {
      this.presets = new Map();
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Record<string, ImagePreset>;
      this.presets = new Map(
        Object.entries(data)
          .map(([name, value]) => [String(name).trim(), value] as [string, ImagePreset])
          .filter(([name, value]) => Boolean(name && value && typeof value.prompt === 'string'))
      );
    } catch {
      this.presets = new Map();
    }
  }

  private save (): void {
    if (!this.file) return;
    const obj = Object.fromEntries(this.presets);
    fs.writeFileSync(this.file, JSON.stringify(obj, null, 2), 'utf-8');
  }

  list (): { name: string; data: ImagePreset; }[] {
    return Array.from(this.presets.entries()).map(([name, data]) => ({ name, data }));
  }

  add (name: string, value: string): { success: boolean; message: string; } {
    const key = String(name || '').trim();
    const rawValue = String(value || '').trim();

    if (!key) return { success: false, message: '预设名不能为空' };
    if (!rawValue) return { success: false, message: '预设内容不能为空' };

    let preset: ImagePreset;

    try {
      if (rawValue.startsWith('{')) {
        const obj = JSON.parse(rawValue) as ImagePreset;
        preset = {
          prompt: String(obj.prompt || '').trim(),
          aspect_ratio: obj.aspect_ratio ? String(obj.aspect_ratio).trim() : undefined,
          resolution: obj.resolution ? String(obj.resolution).trim() : undefined,
          description: obj.description ? String(obj.description).trim() : undefined,
        };
      } else {
        preset = { prompt: rawValue };
      }
    } catch {
      preset = { prompt: rawValue };
    }

    if (!preset.prompt) return { success: false, message: '预设内容不能为空' };

    this.presets.set(key, preset);
    this.save();

    return { success: true, message: `已添加预设 ${key}` };
  }

  remove (name: string): { success: boolean; message: string; } {
    const key = String(name || '').trim();
    if (!key) return { success: false, message: '预设名不能为空' };

    const ok = this.presets.delete(key);
    if (!ok) return { success: false, message: `预设不存在: ${name}` };

    this.save();
    return { success: true, message: `已删除预设 ${name}` };
  }

  private normalizeText (text: string): string {
    return String(text || '').trim().replace(/\s+/g, ' ');
  }

  private findBestPresetMatch (
    text: string
  ): { name: string; data: ImagePreset; rest: string; } | null {
    const normalized = this.normalizeText(text);
    if (!normalized) return null;

    const entries = Array.from(this.presets.entries())
      .map(([name, data]) => ({ name: this.normalizeText(name), rawName: name, data }))
      .filter(item => item.name && item.data?.prompt)
      .sort((a, b) => b.name.length - a.name.length);

    const lower = normalized.toLowerCase();

    for (const item of entries) {
      const presetName = item.name;
      const presetLower = presetName.toLowerCase();

      if (lower === presetLower) {
        return {
          name: item.rawName,
          data: item.data,
          rest: '',
        };
      }

      if (lower.startsWith(presetLower + ' ')) {
        return {
          name: item.rawName,
          data: item.data,
          rest: normalized.slice(presetName.length).trim(),
        };
      }
    }

    return null;
  }

  resolve (rawPrompt: string): { prompt: string; aspect_ratio?: string; resolution?: string; presetName?: string; } {
    const text = this.normalizeText(rawPrompt);
    if (!text) return { prompt: '' };

    const matched = this.findBestPresetMatch(text);
    if (!matched) return { prompt: text };

    const mergedPrompt = `${matched.data.prompt}${matched.rest ? ` ${matched.rest}` : ''}`.trim();

    return {
      prompt: mergedPrompt,
      aspect_ratio: matched.data.aspect_ratio,
      resolution: matched.data.resolution,
      presetName: matched.name,
    };
  }
}

export const imagePresetManager = new ImagePresetManager();
