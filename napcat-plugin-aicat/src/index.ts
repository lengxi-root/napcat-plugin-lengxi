// NapCat AI Cat 插件 @author 冷曦
import type { PluginModule, NapCatPluginContext, PluginConfigSchema, PluginConfigUIController } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PluginConfig } from './types';
import { DEFAULT_PLUGIN_CONFIG, PLUGIN_VERSION, setPluginVersion, fetchModelList, fetchYteaModelList, getYteaModelOptions } from './config';
import { pluginState } from './core/state';
import { handleCommand } from './handlers/command-handler';
import { contextManager } from './managers/context-manager';
import { handlePacketCommands, handlePublicPacketCommands } from './handlers/packet-handler';
import { processMessageContent, sendReply, startMessageCleanup, stopMessageCleanup } from './utils/message';
import { executeApiTool } from './tools/api-tools';
import { isOwner, initOwnerDataDir, cleanupExpiredVerifications, setNapCatLogger, setConfigOwners } from './managers/owner-manager';
import { commandManager, initDataDir } from './managers/custom-commands';
import { taskManager, initTasksDataDir } from './managers/scheduled-tasks';
import { userWatcherManager, initWatchersDataDir } from './managers/user-watcher';
import { initMessageLogger, logMessage, cleanupOldMessages, closeMessageLogger } from './managers/message-logger';
import { handleNoticeEvent, type NoticeEvent } from './managers/operation-tracker';

export let plugin_config_ui: PluginConfigSchema = [];

// 插件初始化
const plugin_init: PluginModule['plugin_init'] = async (ctx: NapCatPluginContext) => {
  // 设置全局状态
  Object.assign(pluginState, {
    logger: ctx.logger,
    actions: ctx.actions,
    adapterName: ctx.adapterName,
    networkConfig: ctx.pluginManager.config,
  });
  pluginState.log('info', 'AI Cat 插件正在初始化喵～');

  // 从同目录 package.json 动态读取版本号
  try {
    const pluginDir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf-8'));
    if (pkg.version) setPluginVersion(pkg.version);
  } catch { /* ignore */ }

  // 先获取最新模型列表（等待完成后再生成配置UI）
  // 加载配置（需要先加载才能拿到 ytApiKey）
  if (fs.existsSync(ctx.configPath)) {
    pluginState.config = { ...DEFAULT_PLUGIN_CONFIG, ...JSON.parse(fs.readFileSync(ctx.configPath, 'utf-8')) };
  }
  pluginState.configPath = ctx.configPath || '';

  try {
    const models = await fetchModelList();
    pluginState.log('info', `主接口已获取 ${models.length} 个可用模型`);
  } catch { /* 获取失败使用默认列表 */ }

  // 如果配置了 ytApiKey，拉取 ytea 模型列表
  if (pluginState.config.ytApiKey) {
    const result = await fetchYteaModelList(pluginState.config.ytApiKey);
    if (result.ok) {
      pluginState.log('info', `YTea接口已获取 ${result.models.length} 个可对话模型`);
    } else {
      pluginState.log('warn', `YTea接口模型获取失败：${result.error || '未知错误'}`);
    }
  }

  // 配置UI（使用更新后的模型列表）
  const yteaOpts = getYteaModelOptions();
  const yteaModelSelect = yteaOpts.length
    ? ctx.NapCatConfig.select('yteaModel', 'YTea模型', yteaOpts, yteaOpts[0]?.value || '', '从 api.ytea.top 获取的模型列表')
    : ctx.NapCatConfig.text('yteaModel', 'YTea模型', '', '填写密钥并重启后自动获取模型列表');

  plugin_config_ui = ctx.NapCatConfig.combine(
    ctx.NapCatConfig.html(`<div style="padding:10px;background:#f5f5f5;border-radius:8px;margin-bottom:10px"><b>🐱 AI Cat 智能猫娘助手 v${PLUGIN_VERSION}</b><br/><span style="color:#666;font-size:13px">使用 <code>xy帮助</code> 查看指令 | 交流群：1085402468</span></div>`),
    // 基础设置
    ctx.NapCatConfig.html('<b>📌 基础设置</b>'),
    ctx.NapCatConfig.text('prefix', '指令前缀', 'xy', '触发AI对话的前缀'),
    ctx.NapCatConfig.boolean('allowAtTrigger', '艾特触发', false, '允许@机器人时无需前缀直接触发'),
    ctx.NapCatConfig.text('botName', '机器人名称', '汐雨', '机器人显示名称'),
    ctx.NapCatConfig.text('personality', 'AI个性', '可爱猫娘助手，说话带"喵"等语气词，活泼俏皮会撒娇', 'AI的性格描述，会影响回复风格'),
    ctx.NapCatConfig.text('ownerQQs', '主人QQ', '', '多个用逗号分隔'),
    ctx.NapCatConfig.boolean('enableReply', '启用回复', true, '是否启用消息回复功能'),
    ctx.NapCatConfig.boolean('sendConfirmMessage', '发送确认消息', true, '收到指令后发送确认提示'),
    ctx.NapCatConfig.text('confirmMessage', '确认消息内容', '汐雨收到喵～', '确认提示的文本内容'),
    // AI 配置
    ctx.NapCatConfig.html('<b>🤖 AI 配置</b> <span style="color:#999;font-size:12px">主接口免费50次/天 | 填写YTea密钥可解除限制，前往 <a href="https://api.ytea.top/" target="_blank">api.ytea.top</a> 免费签到和订阅获取</span>'),
    ctx.NapCatConfig.select('apiSource', 'API来源', [
      { label: '🆓 主接口（免费50次/天）', value: 'main' },
      { label: '🔑 YTea接口（自购密钥，无限制）', value: 'ytea' },
      { label: '🔧 自定义API', value: 'custom' },
    ], 'main', '主接口：自动切换模型，10轮上下文 | YTea/自定义：可选模型和轮数'),
    ctx.NapCatConfig.text('ytApiKey', 'YTea密钥', '', '如 sk-xxx，选择「YTea接口」后生效，无每日次数限制（填写后会自动拉取模型列表）', true),
    yteaModelSelect,
    ctx.NapCatConfig.boolean('autoSwitchModel', '自动切换模型', true, '模型失败时自动尝试其他可用模型'),
    ctx.NapCatConfig.select('maxContextTurns', '上下文轮数', [5, 10, 15, 20, 30].map(n => ({ label: `${n}轮`, value: n })), 30, '保留的对话历史轮数'),
    // 自定义 API
    ctx.NapCatConfig.html('<b>🔧 自定义API</b> <span style="color:#999;font-size:12px">仅选择「自定义API」时生效</span>'),
    ctx.NapCatConfig.text('customApiUrl', 'API地址', '', '如 https://api.openai.com/v1/chat/completions'),
    ctx.NapCatConfig.text('customApiKey', 'API密钥', '', '如 sk-xxx'),
    ctx.NapCatConfig.text('customModel', '模型名称', 'gpt-4o', '如 gpt-4o'),
    // 高级设置
    ctx.NapCatConfig.html('<b>⚙️ 高级设置</b>'),
    ctx.NapCatConfig.boolean('debug', '调试模式', false, '显示详细调试日志'),
    ctx.NapCatConfig.boolean('allowPublicPacket', '公开取指令', true, '允许所有人使用"取"指令'),
    ctx.NapCatConfig.boolean('safetyFilter', '安全过滤', true, '开启后禁止普通用户通过AI发送图片/语音/视频等媒体内容，关闭则允许（主人不受限制）')
  );

  // 初始化配置相关
  if (pluginState.config.ownerQQs) setConfigOwners(pluginState.config.ownerQQs);
  if (ctx.logger) setNapCatLogger((msg: string) => ctx.logger?.info(msg));

  // 初始化数据目录
  const dataPath = ctx.configPath ? dirname(ctx.configPath) : path.join(process.cwd(), 'data');
  initDataDir(dataPath);
  initTasksDataDir(dataPath);
  initWatchersDataDir(dataPath);
  initOwnerDataDir(dataPath);
  await initMessageLogger(dataPath);

  // 启动定时清理
  pluginState.setVerificationCleanupInterval(setInterval(() => cleanupExpiredVerifications(), 60000));
  setInterval(() => cleanupOldMessages(7), 24 * 60 * 60 * 1000);
  startMessageCleanup();
  contextManager.startCleanup();

  // 配置消息发送器
  taskManager.setMessageSender(async (type, id, content) => {
    if (!pluginState.actions || !pluginState.networkConfig) return;
    const msg = taskManager.parseMessageContent(content);
    const action = type === 'group' ? 'send_group_msg' : 'send_private_msg';
    const param = type === 'group' ? { group_id: id, message: msg } : { user_id: id, message: msg };
    await pluginState.actions.call(action, param as never, pluginState.adapterName, pluginState.networkConfig).catch(() => { });
  });

  // 配置 API 调用器
  userWatcherManager.setApiCaller(async (action, params) => {
    if (!pluginState.actions || !pluginState.networkConfig) return { success: false, error: 'actions未初始化' };
    try {
      return await executeApiTool(pluginState.actions, pluginState.adapterName, pluginState.networkConfig, { action, params });
    } catch (e) { return { success: false, error: String(e) }; }
  });

  // 初始化延迟加载的组件
  commandManager.init();
  userWatcherManager.init();
  taskManager.init();

  taskManager.startScheduler();

  pluginState.log('info', 'AI Cat 插件初始化完成喵～');
};

// 获取配置
export const plugin_get_config = async (): Promise<PluginConfig> => pluginState.config;

// 保存配置
export const plugin_set_config = async (ctx: NapCatPluginContext, config: PluginConfig): Promise<void> => {
  pluginState.config = config;
  if (config.ownerQQs !== undefined) setConfigOwners(config.ownerQQs);
  if (ctx?.configPath) {
    const resolved = path.resolve(ctx.configPath);
    if (resolved.includes('napcat')) {
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolved, JSON.stringify(config, null, 2), 'utf-8');
    }
  }
};

// 拉取 YTea 模型并实时更新配置页的「YTea模型」下拉框（无需重启）
async function refreshYteaModelField (ui: PluginConfigUIController, apiKey: string): Promise<void> {
  const key = (apiKey || '').trim();
  if (!key) {
    ui.updateField('yteaModel', { type: 'text', options: undefined, placeholder: '填写密钥后自动获取模型列表' });
    return;
  }
  const result = await fetchYteaModelList(key);
  if (result.ok && result.models.length) {
    const current = String(ui.getCurrentConfig().yteaModel || '');
    const value = result.models.includes(current) ? current : result.models[0];
    ui.updateField('yteaModel', {
      type: 'select',
      options: result.models.map(m => ({ label: m, value: m })),
      default: value,
      description: `已获取 ${result.models.length} 个可对话模型`,
    });
  } else {
    ui.updateField('yteaModel', {
      type: 'text',
      options: undefined,
      description: `模型获取失败：${result.error || '未知错误'}，请检查密钥或稍后重试`,
    });
  }
}

// 配置界面打开时：若已填写 YTea 密钥则实时拉取模型列表
export const plugin_config_controller = async (
  _ctx: NapCatPluginContext,
  ui: PluginConfigUIController,
  initialConfig: Record<string, unknown>
): Promise<void> => {
  const key = String(initialConfig.ytApiKey || '');
  if (key) await refreshYteaModelField(ui, key).catch(() => { });
};

// 响应式字段变化：YTea 密钥变更时实时刷新模型列表
export const plugin_on_config_change = async (
  _ctx: NapCatPluginContext,
  ui: PluginConfigUIController,
  key: string,
  value: unknown
): Promise<void> => {
  if (key === 'ytApiKey') await refreshYteaModelField(ui, String(value || '')).catch(() => { });
};

// 插件清理
const plugin_cleanup: PluginModule['plugin_cleanup'] = async () => {
  pluginState.log('info', 'AI Cat 插件正在卸载喵～');
  taskManager.stopScheduler();
  pluginState.clearVerificationCleanupInterval();
  stopMessageCleanup();
  contextManager.stopCleanup();
  closeMessageLogger();
};

// 消息处理
const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx: NapCatPluginContext, event: OB11Message) => {
  if (event.post_type !== 'message') return;

  const raw = event.raw_message || '';
  const userId = String(event.user_id);
  const groupId = event.group_id ? String(event.group_id) : undefined;
  const sender = event.sender as { nickname?: string; } | undefined;

  // 记录消息
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

  // 用户检测器
  const watchResult = await userWatcherManager.checkAndExecute(userId, groupId || '', raw, String(event.message_id)).catch(() => null);
  if (watchResult) pluginState.log('info', `检测器触发: ${watchResult.watcherId}`);

  // 自定义命令
  const cmdResp = await commandManager.matchAndExecute(raw.trim(), userId, groupId || '', sender?.nickname || '').catch(() => null);
  if (cmdResp) {
    await sendReply(event, cmdResp, ctx);
    return;
  }

  // 公开的"取"指令
  if (pluginState.config.allowPublicPacket && ctx.actions) {
    const publicResult = await handlePublicPacketCommands(raw, event, ctx);
    if (publicResult) return;
  }

  // 主人专属 Packet 指令
  if (isOwner(userId) && ctx.actions) {
    const packetResult = await handlePacketCommands(raw, event, ctx);
    if (packetResult) return;
  }

  // AI 对话处理
  const { content, replyMessageId } = processMessageContent(raw);
  if (pluginState.config.enableReply === false) return;

  // 检查群AI开关（禁用时仍允许开关命令和状态查询）
  const prefix = pluginState.config.prefix || 'xy';
  const selfId = String(event.self_id || '');

  if (groupId && pluginState.isGroupAIDisabled(groupId)) {
    // 仅放行开关相关命令
    const prefixMatch = content.match(new RegExp(`^${prefix}\\s*(.*)`, 'is'));
    const cmdText = prefixMatch?.[1]?.trim() || '';
    if (['开启AI', '关闭AI', 'AI状态', '帮助'].includes(cmdText)) {
      await handleCommand(event, cmdText, ctx, replyMessageId);
    }
    return;
  }

  // 检测是否艾特了机器人（仅在开启 allowAtTrigger 时生效）
  let instruction = '';
  if (pluginState.config.allowAtTrigger && selfId) {
    const atBotPattern = new RegExp(`\\[CQ:at,qq=${selfId}\\]`, 'g');
    if (atBotPattern.test(raw)) {
      // 去掉机器人的@，保留其他用户的@
      instruction = raw.replace(atBotPattern, '').replace(/\[CQ:reply,id=-?\d+\]/g, '').trim();
    }
  }

  // 如果没有通过艾特触发，则尝试前缀匹配
  if (!instruction) {
    const match = content.match(new RegExp(`^${prefix}\\s*(.*)`, 'is'));
    if (!match) return;
    instruction = match[1].trim();
  }

  await handleCommand(event, instruction, ctx, replyMessageId);
};

// 事件处理
const plugin_onevent: PluginModule['plugin_onevent'] = async (_ctx: NapCatPluginContext, event: unknown) => {
  const e = event as { post_type?: string; notice_type?: string; };

  if (e.post_type === 'notice' && e.notice_type) {
    const handled = handleNoticeEvent(event as NoticeEvent);
    if (handled) pluginState.debug(`[Notice] 操作已确认: ${e.notice_type}`);
  }
};

export { plugin_init, plugin_onmessage, plugin_onevent, plugin_cleanup };
