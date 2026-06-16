// 命令处理器
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import { pluginState } from '../core/state';
import { MODEL_LIST, YTEA_MODEL_LIST, PLUGIN_VERSION, fetchModelList, fetchYteaModelList } from '../config';
import { contextManager } from '../managers/context-manager';
import { isOwner, startOwnerVerification, verifyOwnerCode, removeOwner, listOwners } from '../managers/owner-manager';
import { userWatcherManager } from '../managers/user-watcher';
import { sendReply, sendForwardMsg } from '../utils/message';
import { handleAICommand } from './ai-handler';

// 帮助信息
async function handleHelp (event: OB11Message, userId: string, ctx: NapCatPluginContext): Promise<void> {
  const isMaster = isOwner(userId);
  const prefix = pluginState.config.prefix || 'xy';
  const name = pluginState.config.botName || '汐雨';
  const currentModel = pluginState.config.model || 'gpt-5';

  const sections: { title: string; content: string; }[] = [
    { title: `🐱 ${name}猫娘助手 v${PLUGIN_VERSION}`, content: '欢迎使用喵～' },
    {
      title: '📌 基础指令',
      content: [
        `${prefix} <内容> - AI对话`,
        `${prefix} 帮助 - 显示帮助`,
        `${prefix} 额度 - 查询今日剩余额度`,
        `${prefix} 上下文 - 对话状态`,
        `${prefix} 清除上下文 - 清除历史`,
        `${prefix} 检测器列表 - 查看检测器`,
        `${prefix} AI状态 - 查看本群AI开关`,
      ].join('\n'),
    },
    {
      title: '👑 主人申请',
      content: `${prefix} 设置主人 - 申请成为主人\n${prefix} 验证主人 <验证码> - 验证身份`,
    },
  ];

  if (isMaster) {
    const masterCmds = [
      `${prefix} 主人列表 - 查看所有主人`,
      `${prefix} 移除主人 <QQ号> - 移除主人`,
      `${prefix} 开启AI - 开启本群AI对话`,
      `${prefix} 关闭AI - 关闭本群AI对话`,
    ];
    // 非主接口模式才显示模型管理命令
    if (pluginState.config.apiSource !== 'main') {
      masterCmds.push(`${prefix} 模型列表 - 查看AI模型`);
      masterCmds.push(`${prefix} 切换模型 <数字> - 切换模型`);
      masterCmds.push(`${prefix} 刷新模型 - 重新获取模型列表`);
    }
    sections.push({ title: '🔧 主人管理', content: masterCmds.join('\n') });
    sections.push({
      title: '🔬 Packet调试',
      content: '取 - 获取引用消息详情\napi <action>\\n{params} - 调用OneBot',
    });
  }

  const apiLabel = { main: '🆓 主接口', ytea: '🔑 YTea', custom: '🔧 自定义' }[pluginState.config.apiSource] || '主接口';
  sections.push({ title: '⚙️ 当前状态', content: `前缀: ${prefix}\nAPI: ${apiLabel}\n模型: ${pluginState.config.apiSource === 'main' ? '自动切换' : currentModel}` });

  await sendForwardMsg(event, sections, ctx);
}

// 当前 API 来源下的可用模型列表
function getActiveModelList (): string[] {
  if (pluginState.config.apiSource === 'ytea') return YTEA_MODEL_LIST;
  if (pluginState.config.apiSource === 'custom') {
    return pluginState.config.customModel ? [pluginState.config.customModel] : [];
  }
  return MODEL_LIST;
}

// 当前选中的模型
function getActiveModel (): string {
  if (pluginState.config.apiSource === 'ytea') return pluginState.config.yteaModel || YTEA_MODEL_LIST[0] || '';
  if (pluginState.config.apiSource === 'custom') return pluginState.config.customModel || '';
  return pluginState.config.model || 'gpt-5';
}

// 设置当前选中的模型
function setActiveModel (model: string): void {
  if (pluginState.config.apiSource === 'ytea') pluginState.config.yteaModel = model;
  else if (pluginState.config.apiSource === 'custom') pluginState.config.customModel = model;
  else pluginState.config.model = model;
}

// 模型列表
async function handleListModels (event: OB11Message, ctx: NapCatPluginContext): Promise<void> {
  const list = getActiveModelList();
  if (!list.length) {
    const tip = pluginState.config.apiSource === 'ytea'
      ? '📝 暂无模型，请先在配置填写 YTea 密钥，或发送「xy刷新模型」重新获取喵～'
      : '📝 暂无可用模型喵～';
    await sendReply(event, tip, ctx);
    return;
  }
  const currentModel = getActiveModel();
  const lines = [`🐱 可用模型列表（共${list.length}个）喵～\n`];
  list.forEach((m, i) => lines.push(`${i + 1}. ${m}${m === currentModel ? ' ← 当前' : ''}`));
  lines.push('\n使用 xy切换模型<数字> 切换喵～');
  await sendReply(event, lines.join('\n'), ctx);
}

// 切换模型
async function handleSwitchModel (event: OB11Message, idx: string | undefined, ctx: NapCatPluginContext): Promise<void> {
  if (!idx) {
    await handleListModels(event, ctx);
    return;
  }
  const list = getActiveModelList();
  const i = parseInt(idx);
  if (i >= 1 && i <= list.length) {
    setActiveModel(list[i - 1]);
    await sendReply(event, `✅ 模型已切换为 ${list[i - 1]} 喵～`, ctx);
  } else {
    await sendReply(event, `❌ 无效序号，请输入1-${list.length}`, ctx);
  }
}

// 刷新模型列表（运行时重新获取，无需重启）
async function handleRefreshModels (event: OB11Message, ctx: NapCatPluginContext): Promise<void> {
  if (pluginState.config.apiSource === 'ytea') {
    if (!pluginState.config.ytApiKey) {
      await sendReply(event, '❌ 未配置 YTea 密钥，无法获取模型喵～', ctx);
      return;
    }
    await sendReply(event, '🔄 正在从 api.ytea.top 获取模型列表喵～', ctx);
    const result = await fetchYteaModelList(pluginState.config.ytApiKey);
    if (result.ok && result.models.length) {
      await sendReply(event, `✅ 已获取 ${result.models.length} 个可对话模型喵～\n发送「xy模型列表」查看`, ctx);
    } else {
      await sendReply(event, `❌ 获取失败：${result.error || '未知错误'}`, ctx);
    }
    return;
  }
  if (pluginState.config.apiSource === 'main') {
    await sendReply(event, '🔄 正在刷新主接口模型列表喵～', ctx);
    const models = await fetchModelList();
    await sendReply(event, `✅ 主接口共 ${models.length} 个模型喵～`, ctx);
    return;
  }
  await sendReply(event, '📝 自定义API模式无需获取模型列表喵～', ctx);
}

// 主命令入口
export async function handleCommand (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext,
  replyMsgId?: string
): Promise<boolean> {
  const userId = String(event.user_id);
  const groupId = event.group_id ? String(event.group_id) : undefined;

  // 基础命令
  if (cmd === '帮助' || cmd === '') {
    await handleHelp(event, userId, ctx);
    return true;
  }

  if (cmd === '清除上下文') {
    contextManager.clearContext(userId, groupId);
    await sendReply(event, '✅ 上下文已清除喵～', ctx);
    return true;
  }

  if (cmd === '上下文') {
    const info = contextManager.getContextInfo(userId, groupId);
    const msg = info.expired || info.messages === 0
      ? '📝 当前没有活跃上下文喵～'
      : `📝 对话轮数: ${info.turns} | 消息数: ${info.messages}`;
    await sendReply(event, msg, ctx);
    return true;
  }

  // 主人命令 - 刷新模型列表（运行时重新获取，无需重启）
  if ((cmd === '刷新模型' || cmd === '获取模型') && isOwner(userId)) {
    await handleRefreshModels(event, ctx);
    return true;
  }

  // 主人命令 - 模型管理（仅非主接口模式可用）
  if (cmd === '模型列表' && isOwner(userId)) {
    if (pluginState.config.apiSource === 'main') {
      await sendReply(event, '📝 主接口模式使用自动切换，无需手动选择模型喵～', ctx);
      return true;
    }
    await handleListModels(event, ctx);
    return true;
  }

  const switchMatch = cmd.match(/^切换模型\s*(\d+)?$/);
  if (switchMatch && isOwner(userId)) {
    if (pluginState.config.apiSource === 'main') {
      await sendReply(event, '📝 主接口模式使用自动切换，无需手动选择模型喵～', ctx);
      return true;
    }
    await handleSwitchModel(event, switchMatch[1], ctx);
    return true;
  }

  if (cmd === '检测器列表' && isOwner(userId)) {
    const result = userWatcherManager.listWatchers();
    const watchers = (result.data as { id: string; target_user: string; action: string; enabled: boolean; trigger_count: number; }[]) || [];
    if (!watchers.length) {
      await sendReply(event, '📋 暂无用户检测器喵～', ctx);
    } else {
      const list = watchers.map(w =>
        `${w.enabled ? '✅' : '❌'} ${w.id}: 监控${w.target_user} -> ${w.action} (触发${w.trigger_count}次)`
      ).join('\n');
      await sendReply(event, `📋 用户检测器列表 (${watchers.length}个)：\n${list}`, ctx);
    }
    return true;
  }

  // 主人验证
  if (cmd === '设置主人') {
    await sendReply(event, startOwnerVerification(userId).message, ctx);
    return true;
  }

  const verifyMatch = cmd.match(/^验证主人\s+(\S+)$/);
  if (verifyMatch) {
    await sendReply(event, verifyOwnerCode(userId, verifyMatch[1]).message, ctx);
    return true;
  }

  if (cmd === '主人列表' && isOwner(userId)) {
    const owners = listOwners();
    const dynamicPart = owners.dynamic.length
      ? '\n\n【动态添加】\n' + owners.dynamic.map(id => `  • ${id}`).join('\n')
      : '';
    await sendReply(event, `👑 主人列表 (共${owners.total}人)：\n\n【初始主人】\n${owners.default.map(id => `  • ${id}`).join('\n')}${dynamicPart}`, ctx);
    return true;
  }

  const removeMatch = cmd.match(/^移除主人\s+(\d+)$/);
  if (removeMatch && isOwner(userId)) {
    await sendReply(event, removeOwner(userId, removeMatch[1]).message, ctx);
    return true;
  }

  // 群AI开关（主人命令，仅群聊可用）
  if (cmd === '开启AI' && isOwner(userId)) {
    if (!groupId) { await sendReply(event, '❌ 该指令仅在群聊中可用喵～', ctx); return true; }
    pluginState.setGroupAI(groupId, true);
    await sendReply(event, `✅ 本群(${groupId})AI对话已开启喵～`, ctx);
    return true;
  }

  if (cmd === '关闭AI' && isOwner(userId)) {
    if (!groupId) { await sendReply(event, '❌ 该指令仅在群聊中可用喵～', ctx); return true; }
    pluginState.setGroupAI(groupId, false);
    await sendReply(event, `✅ 本群(${groupId})AI对话已关闭喵～`, ctx);
    return true;
  }

  if (cmd === 'AI状态') {
    if (!groupId) { await sendReply(event, '📝 私聊AI对话状态: ✅ 已开启', ctx); return true; }
    const disabled = pluginState.isGroupAIDisabled(groupId);
    await sendReply(event, `📝 本群AI对话状态: ${disabled ? '❌ 已关闭' : '✅ 已开启'}`, ctx);
    return true;
  }

  // 查询今日额度
  if (cmd === '额度' || cmd === '剩余额度') {
    try {
      const apiBase = (await import('../config')).DEFAULT_AI_CONFIG.base_url.replace('/chat/completions', '').replace('/v1', '');
      let botId: string | undefined;
      try {
        const loginInfo = await ctx.actions?.call('get_login_info', {}, ctx.adapterName, ctx.pluginManager.config) as { user_id?: number | string; } | undefined;
        botId = loginInfo?.user_id ? String(loginInfo.user_id) : undefined;
      } catch { /* ignore */ }
      if (!botId) { await sendReply(event, '❌ 无法获取机器人信息喵～', ctx); return true; }
      if (pluginState.config.ytApiKey) {
        await sendReply(event, '🔑 已配置自定义密钥，无每日次数限制喵～', ctx);
        return true;
      }
      const res = await fetch(`${apiBase}/usage/${botId}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json() as { used: number; remaining: number; limit: number; date: string; };
        await sendReply(event, `📊 今日额度 (${data.date})\n已用: ${data.used}/${data.limit} 次\n剩余: ${data.remaining} 次\n\n💡 额度用完可前往 https://api.ytea.top/ 免费签到和订阅获取密钥`, ctx);
      } else {
        await sendReply(event, '❌ 查询额度失败喵～', ctx);
      }
    } catch {
      await sendReply(event, '❌ 查询额度失败喵～', ctx);
    }
    return true;
  }

  // AI 对话
  if (cmd) {
    await handleAICommand(event, cmd, ctx, replyMsgId);
    return true;
  }

  return false;
}
