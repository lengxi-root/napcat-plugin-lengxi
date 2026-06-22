import type { PluginModule, NapCatPluginContext, PluginConfigSchema } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import type { PluginConfig } from './types';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { cleanConfigForRuntime } from './core/config-service';
import { initModelCacheStore } from './core/model-cache-store';
import { handleCommand } from './handlers/command-handler';
import { handleAICommand } from './handlers/ai-handler';
import { contextManager } from './managers/context-manager';
import { handlePacketCommands, handlePublicPacketCommands } from './handlers/packet-handler';
import { processMessageContent, sendReply, startMessageCleanup, stopMessageCleanup } from './utils/message';
import { executeApiTool } from './tools/api-tools';
import {
  isOwner,
  initOwnerDataDir,
  cleanupExpiredVerifications,
  setNapCatLogger,
  setConfigOwners,
  setConfigWhitelist,
} from './managers/owner-manager';
import { modelMonitorManager } from './managers/model-monitor';
import { commandManager, initDataDir } from './managers/custom-commands';
import { taskManager, initTasksDataDir } from './managers/scheduled-tasks';
import { userWatcherManager, initWatchersDataDir } from './managers/user-watcher';
import { initMessageLogger, logMessage, cleanupOldMessages, closeMessageLogger } from './managers/message-logger';
import { handleNoticeEvent, type NoticeEvent } from './managers/operation-tracker';
import { handleImageCommand } from './handlers/image-handler';
import { imageUsageManager } from './image/usage-manager';
import { imageCacheManager } from './image/cache-manager';
import { imagePresetManager } from './image/preset-manager';
import { imagePersonaManager } from './image/persona-manager';
import { imageTaskQueue } from './image/task-queue';
import { buildPluginConfigUi } from './core/plugin-config-ui';
import { pluginState } from './core/state';
import { PLUGIN_VERSION, setPluginVersion } from './config';
import { getPrioritizedChatTargets } from './core/channel-store';

export let plugin_config_ui: PluginConfigSchema = [];

let oldMessageCleanupTimer: ReturnType<typeof setInterval> | null = null;
let imageUsageCleanupTimer: ReturnType<typeof setInterval> | null = null;
let imageCacheCleanupTimer: ReturnType<typeof setInterval> | null = null;

interface RandomChatMessage {
  userId: string;
  nickname: string;
  content: string;
  messageId: string;
  time: number;
}

interface RandomChatGroupState {
  messages: RandomChatMessage[];
  lastActiveAt: number;
  running: boolean;
}

interface RandomReplyMeta {
  replyToMessageId?: string;
  atUserId?: string;
}

const randomChatStates = new Map<string, RandomChatGroupState>();

function escapeRegExp (text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearExtraTimers (): void {
  if (oldMessageCleanupTimer) {
    clearInterval(oldMessageCleanupTimer);
    oldMessageCleanupTimer = null;
  }

  if (imageUsageCleanupTimer) {
    clearInterval(imageUsageCleanupTimer);
    imageUsageCleanupTimer = null;
  }

  if (imageCacheCleanupTimer) {
    clearInterval(imageCacheCleanupTimer);
    imageCacheCleanupTimer = null;
  }
}

function applyRuntimeConfigEffects (): void {
  contextManager.setMaxTurns(pluginState.config.maxContextTurns);
  imageTaskQueue.setMaxConcurrent(pluginState.config.imageMaxConcurrentTasks);
  setConfigOwners(pluginState.config.ownerQQs || '');
  setConfigWhitelist(pluginState.config.whitelistQQs || []);
}

function normalizeSlashShortcutText (raw: string): string {
  return String(raw || '')
    .replace(/\[CQ:reply,id=-?\d+\]/g, '')
    .replace(/\[CQ:at,qq=\d+\]/g, '')
    .trim();
}

function getSlashShortcutCommand (content: string): string {
  const text = normalizeSlashShortcutText(content);
  if (!text) return '';

  const exactShortcuts = [
    '形象查看',
    '形象设置',
    '形象清除',
    '生图模型',
    '预设',
  ];

  for (const name of exactShortcuts) {
    const pattern = new RegExp(`^[\\/／]\\s*${escapeRegExp(name)}(?:\\s+([\\s\\S]+))?$`);
    const match = text.match(pattern);
    if (match) {
      const rest = String(match[1] || '').trim();
      return `${name}${rest ? ` ${rest}` : ''}`.trim();
    }
  }

  const selfieMatch = text.match(/^[\/／]\s*自拍(?:\s+([\s\S]+))?$/);
  if (selfieMatch) {
    const rest = String(selfieMatch[1] || '').trim();
    return `自拍${rest ? ` ${rest}` : ''}`.trim();
  }

  const imageMatch = text.match(/^[\/／]\s*生图(?:\s+([\s\S]+))?$/);
  if (imageMatch) {
    const rest = String(imageMatch[1] || '').trim();
    return `生图${rest ? ` ${rest}` : ''}`.trim();
  }

  return '';
}

function getNumberConfig (key: string, fallback: number, min: number, max: number): number {
  const cfg = pluginState.config as PluginConfig & Record<string, unknown>;
  const n = Number(cfg[key]);

  if (!Number.isFinite(n)) return fallback;

  return Math.min(max, Math.max(min, n));
}

function getRandomReplyChancePercent (): number {
  return getNumberConfig('randomReplyChancePercent', 5, 0, 100);
}

function getRandomActiveMessageCount (): number {
  return Math.floor(getNumberConfig('randomActiveMessageCount', 50, 1, 500));
}

function getRandomActiveIntervalMinutes (): number {
  return getNumberConfig('randomActiveIntervalMinutes', 300, 0, 10080);
}

function getRandomIgnoreQQs (): Set<string> {
  const list = ((pluginState.config.randomIgnoreQQs || []) as unknown[])
    .map(v => String(v).trim())
    .filter(Boolean);
  return new Set(list);
}

function shouldIgnoreRandomUser (userId: string, selfId: string): boolean {
  const uid = String(userId || '').trim();
  if (!uid) return true;
  if (selfId && uid === selfId) return true;
  return getRandomIgnoreQQs().has(uid);
}

function hasAvailableChatTarget (): boolean {
  try {
    return getPrioritizedChatTargets().length > 0;
  } catch {
    return false;
  }
}

function cleanRandomMessageContent (raw: string): string {
  return raw
    .replace(/\[CQ:reply,id=-?\d+\]/g, '')
    .replace(/\[CQ:at,qq=\d+\]/g, '')
    .replace(/\[CQ:image,[^\]]+\]/g, '[图片]')
    .replace(/\[CQ:record,[^\]]+\]/g, '[语音]')
    .replace(/\[CQ:video,[^\]]+\]/g, '[视频]')
    .trim()
    .slice(0, 500);
}

function getRandomState (groupId: string): RandomChatGroupState {
  const existed = randomChatStates.get(groupId);

  if (existed) return existed;

  const state: RandomChatGroupState = {
    messages: [],
    lastActiveAt: Date.now(),
    running: false,
  };

  randomChatStates.set(groupId, state);
  return state;
}

function rememberRandomChatMessage (
  groupId: string,
  userId: string,
  nickname: string,
  raw: string,
  messageId: string
): void {
  const content = cleanRandomMessageContent(raw);
  if (!content) return;

  const state = getRandomState(groupId);
  const maxCount = getRandomActiveMessageCount();

  state.messages.push({
    userId,
    nickname,
    content,
    messageId,
    time: Date.now(),
  });

  if (state.messages.length > maxCount) {
    state.messages.splice(0, state.messages.length - maxCount);
  }
}

function pickRandomChatMessage (groupId: string, selfId: string): RandomChatMessage | null {
  const state = randomChatStates.get(groupId);
  if (!state || !state.messages.length) return null;

  const ignored = getRandomIgnoreQQs();
  const pool = state.messages.filter(msg => {
    const uid = String(msg.userId || '').trim();
    if (!uid) return false;
    if (selfId && uid === selfId) return false;
    if (ignored.has(uid)) return false;
    return true;
  });

  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function pickRandomReplyMeta (msg: RandomChatMessage, preferQuote: boolean): RandomReplyMeta {
  const r = Math.random();

  if (preferQuote) {
    if (r < 0.70) return { replyToMessageId: msg.messageId };
    if (r < 0.85) return { replyToMessageId: msg.messageId, atUserId: msg.userId };
    if (r < 0.95) return { atUserId: msg.userId };
    return {};
  }

  if (r < 0.25) return { replyToMessageId: msg.messageId };
  if (r < 0.40) return { atUserId: msg.userId };
  if (r < 0.50) return { replyToMessageId: msg.messageId, atUserId: msg.userId };
  return {};
}

function isExplicitCommandLike (
  raw: string,
  content: string,
  prefix: string,
  selfId: string
): boolean {
  if (!content) return true;

  if (getSlashShortcutCommand(content)) return true;

  const prefixPattern = escapeRegExp(prefix);
  if (new RegExp(`^${prefixPattern}\\s*`, 'is').test(content)) return true;

  if (selfId) {
    const atBotPattern = new RegExp(`\\[CQ:at,qq=${escapeRegExp(selfId)}\\]`, 'g');
    if (atBotPattern.test(raw)) return true;
  }

  return false;
}

function buildRandomReplyInstruction (msg: RandomChatMessage): string {
  return [
    '这是一次随机对话触发，不是用户直接命令。',
    '请根据下面这条群聊消息自然、简短地接一句话，像正常群友聊天一样。',
    '你可以像在群聊里一样自然回应，不要解释“随机触发”，不要提系统规则，不要太长。',
    '系统可能会帮你引用或艾特该消息的发送者，你只需要输出自然文本。',
    `发送者: ${msg.nickname || msg.userId}(${msg.userId})`,
    `消息: ${msg.content}`,
  ].join('\n');
}

function buildRandomActiveInstruction (picked: RandomChatMessage, recent: RandomChatMessage[]): string {
  const ignored = getRandomIgnoreQQs();
  const recentText = recent
    .filter(m => !ignored.has(String(m.userId || '').trim()))
    .slice(-10)
    .map(m => `${m.nickname || m.userId}: ${m.content}`)
    .join('\n');

  return [
    '这是一次群聊随机活跃触发，不是用户直接命令。',
    '请参考最近群聊上下文，围绕被选中的消息自然、简短地回复一句，像你主动参与聊天。',
    '不要解释“随机活跃”，不要提系统规则，不要太长。',
    '系统会尽量帮你引用被选中的消息，所以你的回复要像是在接这条消息的话。',
    '',
    '最近群聊片段：',
    recentText || '无',
    '',
    `被选中的消息：${picked.nickname || picked.userId}(${picked.userId}): ${picked.content}`,
  ].join('\n');
}

async function callAIWithoutConfirm (
  event: OB11Message,
  instruction: string,
  ctx: NapCatPluginContext,
  meta: RandomReplyMeta = {}
): Promise<void> {
  const previous = pluginState.config.sendConfirmMessage;
  const e = event as OB11Message & {
    __aicat_reply_to_message_id?: string;
    __aicat_at_user_id?: string;
  };

  const oldReply = e.__aicat_reply_to_message_id;
  const oldAt = e.__aicat_at_user_id;

  try {
    pluginState.config.sendConfirmMessage = false;

    if (meta.replyToMessageId) e.__aicat_reply_to_message_id = meta.replyToMessageId;
    else delete e.__aicat_reply_to_message_id;

    if (meta.atUserId) e.__aicat_at_user_id = meta.atUserId;
    else delete e.__aicat_at_user_id;

    await handleAICommand(event, instruction, ctx, meta.replyToMessageId);
  } finally {
    pluginState.config.sendConfirmMessage = previous;

    if (oldReply) e.__aicat_reply_to_message_id = oldReply;
    else delete e.__aicat_reply_to_message_id;

    if (oldAt) e.__aicat_at_user_id = oldAt;
    else delete e.__aicat_at_user_id;
  }
}

async function maybeHandleRandomChat (
  event: OB11Message,
  raw: string,
  content: string,
  ctx: NapCatPluginContext,
  prefix: string,
  selfId: string
): Promise<boolean> {
  const groupId = event.group_id ? String(event.group_id) : '';
  if (!groupId) return false;
  if (pluginState.isGroupAIDisabled(groupId)) return false;
  if (isExplicitCommandLike(raw, content, prefix, selfId)) return false;

  // 关闭回复时，随机回复 / 随机活跃一起关闭
  if (pluginState.config.enableReply === false) return false;

  if (!hasAvailableChatTarget()) return false;

  const userId = String(event.user_id);
  if (shouldIgnoreRandomUser(userId, selfId)) return false;

  const sender = event.sender as { nickname?: string; card?: string; } | undefined;
  const nickname = sender?.card || sender?.nickname || '';

  rememberRandomChatMessage(groupId, userId, nickname, raw, String(event.message_id));

  const state = getRandomState(groupId);
  if (state.running) return false;

  const now = Date.now();
  const activeIntervalMinutes = getRandomActiveIntervalMinutes();
  const activeIntervalMs = activeIntervalMinutes * 60 * 1000;

  if (activeIntervalMinutes > 0 && state.messages.length > 0 && now - state.lastActiveAt >= activeIntervalMs) {
    const picked = pickRandomChatMessage(groupId, selfId);

    if (picked) {
      state.lastActiveAt = now;
      state.running = true;

      try {
        await callAIWithoutConfirm(
          event,
          buildRandomActiveInstruction(picked, state.messages),
          ctx,
          pickRandomReplyMeta(picked, true)
        );
      } finally {
        state.running = false;
      }

      return true;
    }
  }

  const chance = getRandomReplyChancePercent();
  if (chance > 0 && Math.random() * 100 < chance) {
    const msg = pickRandomChatMessage(groupId, selfId);

    if (msg) {
      state.running = true;

      try {
        await callAIWithoutConfirm(
          event,
          buildRandomReplyInstruction(msg),
          ctx,
          pickRandomReplyMeta(msg, false)
        );
      } finally {
        state.running = false;
      }

      return true;
    }
  }

  return false;
}

const plugin_init: PluginModule['plugin_init'] = async (ctx: NapCatPluginContext) => {
  Object.assign(pluginState, {
    logger: ctx.logger,
    actions: ctx.actions,
    adapterName: ctx.adapterName,
    networkConfig: ctx.pluginManager.config,
  });

  pluginState.log('info', 'AI Cat 插件正在初始化喵～');

  try {
    const pluginDir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf-8'));
    if (pkg.version) setPluginVersion(pkg.version);
  } catch {}

  const dataPath = ctx.configPath
    ? dirname(ctx.configPath)
    : path.join(process.cwd(), 'data');

  pluginState.configPath = ctx.configPath || '';

  let runtimeConfigSource: Record<string, unknown> = {};

  if (pluginState.configPath && fs.existsSync(pluginState.configPath)) {
    try {
      runtimeConfigSource = JSON.parse(fs.readFileSync(pluginState.configPath, 'utf-8')) as Record<string, unknown>;
    } catch (e) {
      pluginState.log('warn', `读取配置文件失败，使用运行时配置: ${String(e)}`);
    }
  }

  if (!Object.keys(runtimeConfigSource).length) {
    runtimeConfigSource =
      (ctx.pluginManager?.config && typeof ctx.pluginManager.config === 'object')
        ? ctx.pluginManager.config as Record<string, unknown>
        : {};
  }

  pluginState.config = cleanConfigForRuntime(runtimeConfigSource);

  plugin_config_ui = buildPluginConfigUi(ctx);
  pluginState.setRuntimeConfigSyncer(applyRuntimeConfigEffects);

  applyRuntimeConfigEffects();

  if (ctx.logger) setNapCatLogger((msg: string) => ctx.logger?.info(msg));

  initDataDir(dataPath);
  initTasksDataDir(dataPath);
  initWatchersDataDir(dataPath);
  initOwnerDataDir(dataPath);
  initModelCacheStore(dataPath);
  await initMessageLogger(dataPath);

  applyRuntimeConfigEffects();

  imageUsageManager.init(dataPath);
  imageCacheManager.init(dataPath);
  imagePresetManager.init(dataPath);
  imagePersonaManager.init(dataPath);
  modelMonitorManager.init(dataPath);

  pluginState.setVerificationCleanupInterval(setInterval(() => cleanupExpiredVerifications(), 60000));

  clearExtraTimers();
  oldMessageCleanupTimer = setInterval(() => cleanupOldMessages(7), 24 * 60 * 60 * 1000);
  imageUsageCleanupTimer = setInterval(() => imageUsageManager.cleanupExpired(), 24 * 60 * 60 * 1000);
  imageCacheCleanupTimer = setInterval(() => imageCacheManager.cleanup(), 6 * 60 * 60 * 1000);

  startMessageCleanup();
  contextManager.startCleanup();

  taskManager.setMessageSender(async (type, id, content) => {
    if (!pluginState.actions || !pluginState.networkConfig) return;

    const msg = taskManager.parseMessageContent(content);
    const action = type === 'group' ? 'send_group_msg' : 'send_private_msg';
    const param = type === 'group'
      ? { group_id: id, message: msg }
      : { user_id: id, message: msg };

    await pluginState.actions.call(action, param as never, pluginState.adapterName, pluginState.networkConfig).catch(() => {});
  });

  userWatcherManager.setApiCaller(async (action, params) => {
    if (!pluginState.actions || !pluginState.networkConfig) {
      return { success: false, error: 'actions未初始化' };
    }

    try {
      return await executeApiTool(pluginState.actions, pluginState.adapterName, pluginState.networkConfig, { action, params });
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  commandManager.init();
  userWatcherManager.init();
  taskManager.init();
  taskManager.startScheduler();

  pluginState.log('info', `AI Cat 插件初始化完成喵～ v${PLUGIN_VERSION}`);
  pluginState.log('info', `当前配置: webEnable=${String(pluginState.config.webEnable)}, webPort=${String(pluginState.config.webPort)}`);
};

export const plugin_get_config = async (): Promise<PluginConfig> => {
  const cloned = JSON.parse(JSON.stringify(pluginState.config || {})) as PluginConfig;

  /**
   * NapCat 配置页不适合展示复杂对象数组。
   * 渠道、模型缓存、启用模型、优先级请通过 Web 面板 / 群聊指令维护。
   */
  delete (cloned as Record<string, unknown>).chatChannels;
  delete (cloned as Record<string, unknown>).imageChannels;
  delete (cloned as Record<string, unknown>).enabledChatModelPriority;
  delete (cloned as Record<string, unknown>).enabledImageModelPriority;

  return cloned;
};

export const plugin_set_config = async (ctx: NapCatPluginContext, config: PluginConfig): Promise<void> => {
  pluginState.configPath = ctx?.configPath || pluginState.configPath;

  // 关键修复：
  // NapCat 配置页只会提交 schema 中存在的字段。
  // 如果直接 cleanConfigForRuntime(config)，未出现在 schema 里的字段会被默认值覆盖。
  // 这里改成基于当前配置做 merge，避免保存时丢失未暴露字段。
  pluginState.config = cleanConfigForRuntime({
    ...pluginState.config,
    ...(config as Partial<PluginConfig>),
  });

  applyRuntimeConfigEffects();
  pluginState.saveConfig();
  pluginState.log('info', `配置已更新: webEnable=${String(pluginState.config.webEnable)}, webPort=${String(pluginState.config.webPort)}`);
};

const plugin_cleanup: PluginModule['plugin_cleanup'] = async () => {
  pluginState.log('info', 'AI Cat 插件正在卸载喵～');
  taskManager.stopScheduler();
  pluginState.clearVerificationCleanupInterval();
  clearExtraTimers();
  stopMessageCleanup();
  contextManager.stopCleanup();
  closeMessageLogger();
  randomChatStates.clear();
};

const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx: NapCatPluginContext, event: OB11Message) => {
  if (event.post_type !== 'message') return;

  const raw = event.raw_message || '';
  const userId = String(event.user_id);
  const groupId = event.group_id ? String(event.group_id) : undefined;
  const sender = event.sender as { nickname?: string; } | undefined;

  logMessage({
    message_id: String(event.message_id),
    user_id: userId,
    user_name: sender?.nickname || '',
    group_id: groupId || '',
    group_name: '',
    message_type: event.message_type,
    content: raw.slice(0, 500),
    raw_message: raw,
    timestamp: event.time,
  });

  const watchResult = await userWatcherManager.checkAndExecute(
    userId,
    groupId || '',
    raw,
    String(event.message_id)
  ).catch(() => null);

  if (watchResult) pluginState.log('info', `检测器触发: ${watchResult.watcherId}`);

  const cmdResp = await commandManager.matchAndExecute(
    raw.trim(),
    userId,
    groupId || '',
    sender?.nickname || ''
  ).catch(() => null);

  if (cmdResp) {
    await sendReply(event, cmdResp, ctx);
    return;
  }

  if (pluginState.config.allowPublicPacket && ctx.actions) {
    const publicResult = await handlePublicPacketCommands(raw, event, ctx);
    if (publicResult) return;
  }

  if (isOwner(userId) && ctx.actions) {
    const packetResult = await handlePacketCommands(raw, event, ctx);
    if (packetResult) return;
  }

  const { content, replyMessageId } = processMessageContent(raw);
  const prefix = pluginState.config.prefix || 'xy';
  const prefixPattern = escapeRegExp(prefix);
  const selfId = String(event.self_id || '');

  const slashShortcut = getSlashShortcutCommand(raw || content);
  if (slashShortcut) {
    if (await handleImageCommand(event, slashShortcut, ctx)) return;
    return;
  }

  if (groupId && pluginState.isGroupAIDisabled(groupId)) {
    const prefixMatch = content.match(new RegExp(`^${prefixPattern}\\s*(.*)`, 'is'));
    const cmdText = prefixMatch?.[1]?.trim() || '';

    if (['开启AI', '关闭AI', 'AI状态', '帮助'].includes(cmdText)) {
      await handleCommand(event, cmdText, ctx, replyMessageId);
    }

    return;
  }

  if (await maybeHandleRandomChat(event, raw, content, ctx, prefix, selfId)) return;

  let instruction = '';

  // 允许无前缀 @机器人 触发
  // 这里不再受 enableReply 控制，这样即使关闭普通 AI 对话，也仍然可以 @机器人 触发生图/自拍类命令
  if (pluginState.config.allowAtTrigger && selfId) {
    const atBotPattern = new RegExp(`\\[CQ:at,qq=${escapeRegExp(selfId)}\\]`, 'g');

    if (atBotPattern.test(raw)) {
      const atText = raw
        .replace(atBotPattern, '')
        .replace(/\[CQ:reply,id=-?\d+\]/g, '')
        .trim();

      instruction = atText.trim();
    }
  }

  if (!instruction) {
    const match = content.match(new RegExp(`^${prefixPattern}\\s*(.*)`, 'is'));
    if (!match) return;
    instruction = match[1].trim();
  }

  // 优先处理图片相关命令，包括：
  // - /生图
  // - /自拍
  // - /看看你
  // - @机器人 看看你
  // - @机器人 你长这个看看
  if (await handleImageCommand(event, instruction, ctx)) return;

  await handleCommand(event, instruction, ctx, replyMessageId);
};

const plugin_onevent: PluginModule['plugin_onevent'] = async (_ctx: NapCatPluginContext, event: unknown) => {
  const e = event as { post_type?: string; notice_type?: string; };

  if (e.post_type === 'notice' && e.notice_type) {
    const handled = handleNoticeEvent(event as NoticeEvent);
    if (handled) pluginState.debug(`[Notice] 操作已确认: ${e.notice_type}`);
  }
};

export { plugin_init, plugin_onmessage, plugin_onevent, plugin_cleanup };