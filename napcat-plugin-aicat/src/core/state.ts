import type { ActionMap } from 'napcat-types/napcat-onebot/action/index';
import type { PluginLogger } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { NetworkAdapterConfig } from 'napcat-types/napcat-onebot/config/config';
import type { PluginConfig } from '../types';
import { DEFAULT_PLUGIN_CONFIG } from '../config';
import { startWebServer, stopWebServer } from './web-server';
import fs from 'fs';
import path from 'path';
import {
  extractAndPersistModelCaches,
  stripModelCachesFromConfig,
  mergeModelCachesIntoConfig,
} from './model-cache-store';

class PluginState {
  logger: PluginLogger | null = null;
  actions: ActionMap | undefined;
  adapterName = '';
  networkConfig: NetworkAdapterConfig | null = null;
  config: PluginConfig = { ...DEFAULT_PLUGIN_CONFIG };
  configPath = '';
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private webMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private lastWebSignature = '';
  private runtimeConfigSyncer: (() => void) | null = null;

  constructor () {
    this.startWebMonitor();
  }

  setRuntimeConfigSyncer (fn: (() => void) | null): void {
    this.runtimeConfigSyncer = fn;
  }

  runRuntimeConfigSyncer (): void {
    try {
      this.runtimeConfigSyncer?.();
    } catch (e) {
      this.log('error', `运行时配置同步失败: ${String(e)}`);
    }
  }

  private startWebMonitor (): void {
    if (this.webMonitorInterval) return;

    this.webMonitorInterval = setInterval(() => {
      this.syncWebServer();
    }, 3000);
  }

  private syncWebServer (): void {
    const enabled = Boolean(this.config.webEnable);
    const port = Number(this.config.webPort || 14514);
    const token = String(this.config.webToken || '').trim();
    const signature = enabled ? `${port}:${token}` : 'disabled';

    if (signature === this.lastWebSignature) return;

    this.lastWebSignature = signature;
    this.log('info', `Web配置同步: enabled=${String(enabled)}, port=${String(port)}, token=${token ? '***' : '(empty)'}`);

    if (!enabled) {
      stopWebServer();
      return;
    }

    startWebServer({
      port,
      token,
      getConfig: () => mergeModelCachesIntoConfig(this.config),
      setConfig: patch => {
        this.config = {
          ...this.config,
          ...(patch as Partial<PluginConfig>),
        } as PluginConfig;

        this.runRuntimeConfigSyncer();
        this.saveConfig();
        this.lastWebSignature = '';
        this.syncWebServer();

        return mergeModelCachesIntoConfig(this.config);
      },
      log: (level, msg) => this.log(level, msg),
    });
  }

  setVerificationCleanupInterval (interval: ReturnType<typeof setInterval>): void {
    this.cleanupInterval = interval;
    this.syncWebServer();
  }

  clearVerificationCleanupInterval (): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.webMonitorInterval) {
      clearInterval(this.webMonitorInterval);
      this.webMonitorInterval = null;
    }

    stopWebServer();
    this.lastWebSignature = '';
  }

  log (level: 'info' | 'warn' | 'error', msg: string, ...args: unknown[]): void {
    this.logger?.[level](`[AI Cat] ${msg}`, ...args);
  }

  debug (msg: string, ...args: unknown[]): void {
    if (this.config.debug) this.logger?.info(`[AI Cat] [DEBUG] ${msg}`, ...args);
  }

  isGroupAIDisabled (groupId: string): boolean {
    return (this.config.disabledGroups || []).includes(groupId);
  }

  setGroupAI (groupId: string, enabled: boolean): void {
    if (!this.config.disabledGroups) this.config.disabledGroups = [];

    const idx = this.config.disabledGroups.indexOf(groupId);

    if (enabled && idx !== -1) {
      this.config.disabledGroups.splice(idx, 1);
    } else if (!enabled && idx === -1) {
      this.config.disabledGroups.push(groupId);
    }

    this.saveConfig();
  }

  saveConfig (): void {
    this.runRuntimeConfigSyncer();

    if (!this.configPath) {
      this.log('warn', 'configPath 为空，无法保存 NapCat 配置');
      return;
    }

    try {
      const resolved = path.resolve(this.configPath);
      const dir = path.dirname(resolved);

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      /**
       * 关键：
       * 1. 如果运行时临时带了 models_cache，先写入独立 JSON
       * 2. 主配置保存前剥离 models_cache，只保留 models_cache_path
       */
      extractAndPersistModelCaches(this.config);

      const stripped = stripModelCachesFromConfig(this.config);

      fs.writeFileSync(resolved, JSON.stringify(stripped, null, 2), 'utf-8');

      /**
       * 保证运行时也不持有大 models_cache
       */
      this.config = stripped as PluginConfig;
    } catch (e) {
      this.log('error', `保存配置失败: ${String(e)}`);
    }

    this.syncWebServer();
  }
}

export const pluginState = new PluginState();