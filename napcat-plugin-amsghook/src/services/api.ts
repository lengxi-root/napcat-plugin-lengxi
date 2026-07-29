// WebUI API 路由
import { state, logBuffer } from '../core/state';
import { addLog } from '../core/logger';
import { saveConfig, getInstalledPlugins } from '../core/config';
import { startQQBot, stopQQBot } from './qqbot-handler';
import { installCmdInterceptHooks, uninstallCmdInterceptHooks } from './cmd-intercept';

export function registerApiRoutes (router: any): void {
  router.getNoAuth('/config', (_: any, res: any) => {
    res.json({ success: true, config: state.config });
  });

  router.postNoAuth('/config', (req: any, res: any) => {
    const body = req.body as Record<string, unknown>;
    if (body.enabled !== undefined) state.config.enabled = Boolean(body.enabled);
    if (body.debug !== undefined) state.config.debug = Boolean(body.debug);
    if (body.ownerQQ !== undefined) state.config.ownerQQ = String(body.ownerQQ || '');
    if (body.blockedGroups !== undefined) {
      state.config.blockedGroups = String(body.blockedGroups || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    if (body.blockedUsers !== undefined) {
      state.config.blockedUsers = String(body.blockedUsers || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    if (body.globalReplace !== undefined) state.config.globalReplace = Boolean(body.globalReplace);
    if (body.globalOwnerOnly !== undefined) state.config.globalOwnerOnly = Boolean(body.globalOwnerOnly);
    if (body.rules !== undefined && Array.isArray(body.rules)) {
      state.config.rules = (body.rules as any[]).map(r => ({
        name: String(r.name || ''), enabled: Boolean(r.enabled),
        suffix: String(r.suffix || ''), replace: Boolean(r.replace),
        replaceText: String(r.replaceText || ''),
        ownerOnly: Boolean(r.ownerOnly),
        blockedGroups: Array.isArray(r.blockedGroups) ? r.blockedGroups.map(String) : [],
        blockedUsers: Array.isArray(r.blockedUsers) ? r.blockedUsers.map(String) : [],
      })).filter(r => r.name);
    }
    saveConfig();
    // 重装指令拦截钩子以应用新配置
    uninstallCmdInterceptHooks();
    installCmdInterceptHooks();
    addLog('info', '配置已保存');
    res.json({ success: true });
  });

  router.getNoAuth('/plugins', (_: any, res: any) => {
    res.json({ success: true, data: getInstalledPlugins() });
  });

  router.getNoAuth('/logs', (_: any, res: any) => {
    res.json({ success: true, data: logBuffer });
  });

  router.postNoAuth('/logs/clear', (_: any, res: any) => {
    logBuffer.length = 0;
    res.json({ success: true });
  });

  router.getNoAuth('/qqbot/status', (_: any, res: any) => {
    res.json({
      success: true,
      data: {
        connected: state.qqbotBridge?.isConnected() || false,
        selfId: state.qqbotBridge?.getSelfId() || '',
        nickname: state.qqbotBridge?.getNickname() || '',
        config: state.config.qqbot,
      },
    });
  });

  router.postNoAuth('/qqbot/config', async (req: any, res: any) => {
    const body = req.body as any;
    const oldAppid = state.config.qqbot?.appid;
    const oldSecret = state.config.qqbot?.secret;
    state.config.qqbot = {
      appid: String(body.appid || ''), secret: String(body.secret || ''),
      intents: Array.isArray(body.intents) ? body.intents : ['GROUP_AT_MESSAGE_CREATE', 'C2C_MESSAGE_CREATE', 'INTERACTION'],
      qqNumber: String(body.qqNumber || ''),
      forceImageRehost: Boolean(body.forceImageRehost),
      masterQQ: String(body.masterQQ || ''),
    };
    saveConfig();
    addLog('info', 'QQBot 配置已保存');
    const hasCredentials = !!(state.config.qqbot.appid && state.config.qqbot.secret);
    const credentialsChanged = state.config.qqbot.appid !== oldAppid || state.config.qqbot.secret !== oldSecret;
    if (hasCredentials && (!state.qqbotBridge?.isConnected() || credentialsChanged)) {
      try { await startQQBot(); } catch { /* ignore */ }
    } else if (!hasCredentials && state.qqbotBridge) {
      try { await stopQQBot(); } catch { /* ignore */ }
    }
    res.json({ success: true });
  });

  router.postNoAuth('/qqbot/start', async (_: any, res: any) => {
    try { await startQQBot(); res.json({ success: true }); } catch (e: any) { res.json({ success: false, error: e.message }); }
  });

  router.postNoAuth('/qqbot/stop', async (_: any, res: any) => {
    try { await stopQQBot(); res.json({ success: true }); } catch (e: any) { res.json({ success: false, error: e.message }); }
  });

  router.postNoAuth('/qqbot/send', async (req: any, res: any) => {
    if (!state.qqbotBridge) { res.json({ success: false, error: '桥接未启动' }); return; }
    const { type, target_id, content, source } = req.body as any;
    const result = type === 'group'
      ? await state.qqbotBridge.sendGroupMsg(target_id, content, source)
      : await state.qqbotBridge.sendPrivateMsg(target_id, content, source);
    res.json({ success: !!result, data: result });
  });
}
