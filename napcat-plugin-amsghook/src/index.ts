// NapCat 消息拦截修改插件 — 入口
import type { PluginModule, NapCatPluginContext, PluginConfigSchema } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import fs from 'fs';
import { getMessagePb, jsonDumpsWithBytes } from './protobuf';
import { state, DEFAULT_CONFIG, originalHandles, pendingMessages, pendingPbExtracts, groupButtonMap, PENDING_TIMEOUT } from './core/state';
import { addLog } from './core/logger';
import { loadConfigFromFile, saveConfig } from './core/config';
import { loadButtonMap, saveButtonMap, extractButtonInfo, clickButton, getValidEventId, clickButtonAndWaitEventId, hasPendingWake, generateVerifyCode } from './utils/button';
import { sendContentViaOfficialBot } from './utils/markdown';
import { probePuppeteer } from './services/puppeteer';
import { registerApiRoutes } from './services/api';
import { installHooks } from './services/hook';
import { startQQBot, stopQQBot } from './services/qqbot-handler';
import { installCmdInterceptHooks, uninstallCmdInterceptHooks } from './services/cmd-intercept';

export let plugin_config_ui: PluginConfigSchema = [];

const plugin_init: PluginModule['plugin_init'] = async (ctx: NapCatPluginContext) => {
  state.logger = ctx.logger;
  state.configPath = ctx.configPath;
  state.pluginManagerRef = ctx.pluginManager;
  state.ctxRef = ctx;
  addLog('info', '消息拦截插件初始化中...');

  // 获取野机器人自身 QQ 号
  try {
    const loginInfo = await ctx.actions.call('get_login_info', {} as never, ctx.adapterName, ctx.pluginManager.config) as any;
    state.wildBotQQ = String(loginInfo?.data?.user_id || loginInfo?.user_id || '');
    if (state.wildBotQQ) addLog('info', `野机器人 QQ: ${state.wildBotQQ}`);
  } catch { /* ignore */ }

  // 探测 puppeteer 插件
  probePuppeteer().catch(() => { });

  try {
    const C = ctx.NapCatConfig;
    if (C) {
      plugin_config_ui = C.combine(
        C.html(`<div style="padding:16px;background:linear-gradient(135deg,rgba(96,165,250,0.1),rgba(30,41,59,0.1));border:1px solid rgba(96,165,250,0.3);border-radius:12px;margin-bottom:20px"><div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><div style="width:36px;height:36px;background:rgba(96,165,250,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z"/></svg></div><div><h3 style="margin:0;font-size:16px;font-weight:600">消息拦截修改 v1.2.0</h3><p style="margin:2px 0 0;font-size:12px;color:#9ca3af">napcat-plugin-amsghook</p></div></div><p style="margin:0;font-size:13px;color:#6b7280">前往 <a href="#" onclick="window.open(window.location.origin+'/plugin/napcat-plugin-amsghook/page/config','_blank');return false;" style="color:#3B82F6;font-weight:600">WebUI 面板</a> 管理拦截规则</p></div>`),
        C.boolean('enabled', '总开关', true, '启用消息拦截'),
      );
    }
  } catch { /* ignore */ }

  if (fs.existsSync(state.configPath)) {
    loadConfigFromFile();
  }
  loadButtonMap();

  const router = (ctx as any).router;
  if (router) {
    registerApiRoutes(router);
    router.page({ path: 'config', title: '消息拦截管理', icon: '✏️', htmlFile: 'webui/config.html', description: '管理各插件的消息拦截规则' });
  }

  // patch actions
  const sourceActions = (ctx.oneBot as any).actions;
  state.sourceActionsRef = sourceActions;
  state.originalCall = sourceActions.call;

  installHooks();

  // 安装指令拦截钩子
  installCmdInterceptHooks();

  addLog('info', '消息拦截插件初始化完成');
  state.logger.info('[MsgHook] 初始化完成');

  // 自动启动 QQBot 桥接
  if (state.config.qqbot?.appid && state.config.qqbot?.secret) {
    startQQBot().catch((e: any) => addLog('info', `QQBot 自动启动失败: ${e.message}`));
  }
};

export const plugin_get_config = async () => state.config;

export const plugin_set_config = async (ctx: NapCatPluginContext, newConfig: any): Promise<void> => {
  if (!state.configPath && ctx.configPath) state.configPath = ctx.configPath;
  if (state.config.globalSuffix === DEFAULT_CONFIG.globalSuffix && state.config.rules.length === 0) {
    loadConfigFromFile();
  }
  if (newConfig.enabled !== undefined) state.config.enabled = Boolean(newConfig.enabled);
  if (state.configPath) saveConfig();
};

const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx: NapCatPluginContext, event: OB11Message) => {
  if (event.post_type !== 'message') return;
  const raw = (event.raw_message || '').trim();

  // ========== 自动 pb 提取 ==========
  if (event.message_type === 'group' && event.group_id) {
    const groupId = String(event.group_id);
    const senderQQ = String(event.user_id || '');
    const pending = pendingPbExtracts.get(groupId);
    if (pending && senderQQ === pending.officialBotQQ && Date.now() - pending.timestamp < PENDING_TIMEOUT) {
      pendingPbExtracts.delete(groupId);
      addLog('info', `检测到官方机器人消息: 群=${groupId}, msgId=${event.message_id}, 开始提取 pb`);
      (async () => {
        try {
          const msgId = String(event.message_id);
          const result = await getMessagePb(ctx.actions as any, ctx.adapterName, ctx.pluginManager.config, groupId, msgId);
          if (result.success && result.data) {
            addLog('debug', `pb 原始数据:\n${jsonDumpsWithBytes(result.data)}`);
            const info = extractButtonInfo(result.data);
            if (info) {
              groupButtonMap.set(groupId, { buttonId: info.buttonId, callbackData: info.callbackData, groupOpenId: pending.groupOpenId, updatedAt: Date.now() });
              saveButtonMap();
              addLog('info', `提取按钮成功: 群=${groupId}, buttonId=${info.buttonId}, callback=${info.callbackData}, openId=${pending.groupOpenId}`);
              await clickButton(groupId, info.buttonId, info.callbackData);
            } else {
              addLog('info', `pb 中未找到按钮信息: 群=${groupId}`);
              addLog('debug', `pb 数据:\n${jsonDumpsWithBytes(result.data)}`);
            }
          } else {
            addLog('info', `pb 提取失败: ${result.error || '未知错误'}`);
          }
        } catch (e: any) {
          addLog('info', `pb 提取异常: ${e.message}`);
        }
      })();
      return;
    }
  }

  if (raw === 'msghook status') {
    const lines = ['📌 消息拦截状态', `总开关: ${state.config.enabled ? '✅' : '❌'}`, `规则数: ${state.config.rules.length}`];
    for (const r of state.config.rules) lines.push(`  ${r.enabled ? '✅' : '❌'} ${r.name}`);
    const msg = [{ type: 'text', data: { text: lines.join('\n') } }];
    const action = event.message_type === 'group' ? 'send_group_msg' : 'send_private_msg';
    const id = event.message_type === 'group' ? { group_id: event.group_id } : { user_id: event.user_id };
    await ctx.actions.call(action, { ...id, message: msg } as never, ctx.adapterName, ctx.pluginManager.config).catch(() => { });
  }

  // ========== dm 指令 ==========
  if (raw.startsWith('dm ') && event.message_type === 'group' && event.group_id) {
    const senderQQ = String(event.user_id || '');
    const masterQQ = state.config.qqbot?.masterQQ;
    if (!masterQQ || senderQQ !== masterQQ) return;
    const content = raw.slice(3).trim();
    if (!content) return;
    const gid = String(event.group_id);
    const qcfg = state.config.qqbot;
    if (!qcfg?.appid || !state.qqbotBridge?.isConnected()) {
      addLog('info', `dm 指令: QQBot 未连接`);
      return;
    }
    addLog('info', `dm 指令: 主人=${senderQQ}, 群=${gid}, 内容=${content.substring(0, 50)}`);

    const dmText = content.replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&amp;/g, '&');

    const cached = getValidEventId(gid);
    if (cached) {
      const sent = await sendContentViaOfficialBot(gid, cached.groupOpenId, cached.eventId, dmText);
      if (sent) return;
    }
    const btnInfo = groupButtonMap.get(gid);
    if (btnInfo?.buttonId && btnInfo?.callbackData) {
      const newEventId = await clickButtonAndWaitEventId(gid, btnInfo.buttonId, btnInfo.callbackData);
      if (newEventId) {
        const sent = await sendContentViaOfficialBot(gid, btnInfo.groupOpenId, newEventId, dmText);
        if (sent) return;
      }
    }
    if (qcfg.qqNumber) {
      if (hasPendingWake(gid)) {
        addLog('info', `dm 指令: 群 ${gid} 已有唤醒流程等待中，跳过重复唤醒`);
        return;
      }
      const code = generateVerifyCode();
      pendingMessages.set(code, { groupId: gid, content: dmText, rawMessage: null, code, timestamp: Date.now(), caller: null });
      const atMsg = [{ type: 'at', data: { qq: qcfg.qqNumber } }, { type: 'text', data: { text: ' ' + code } }];
      try {
        await state.originalCall?.call(state.sourceActionsRef, 'send_group_msg', { group_id: event.group_id, message: atMsg }, ctx.adapterName, ctx.pluginManager.config);
      } catch (e: any) {
        addLog('info', `dm 唤醒发送失败: ${e.message}`);
        pendingMessages.delete(code);
      }
    }
  }
};

const plugin_cleanup: PluginModule['plugin_cleanup'] = async () => {
  await stopQQBot();
  uninstallCmdInterceptHooks();
  if (state.sourceActionsRef) {
    for (const [actionName, origHandle] of originalHandles) {
      const handler = state.sourceActionsRef.get(actionName);
      if (handler) { handler._handle = origHandle; addLog('info', `已还原 ${actionName}._handle`); }
    }
    originalHandles.clear();
  }
  state.originalCall = null;
  state.sourceActionsRef = null;
  state.pluginManagerRef = null;
  state.ctxRef = null;
};

export { plugin_init, plugin_onmessage, plugin_cleanup };
