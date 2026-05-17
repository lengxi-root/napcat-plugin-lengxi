import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import { pluginState } from '../core/state';
import { PLUGIN_VERSION } from '../config';
import { contextManager } from '../managers/context-manager';
import {
  isOwner,
  addWhitelist,
  removeWhitelist,
  listOwners,
  listWhitelist,
  startWhitelistVerification,
  verifyWhitelistCode,
} from '../managers/owner-manager';
import { userWatcherManager } from '../managers/user-watcher';
import { sendReply, sendForwardMsg } from '../utils/message';
import { handleAICommand } from './ai-handler';
import {
  getAllEnabledChatModels,
  getAllEnabledImageModels,
} from '../core/config-service';
import { handleChannelConfigCommand } from './channel-command-handler';
import { handleMusicCommand } from './music-handler';

interface CommandDef {
  name: string;
  ownerOnly?: boolean;
  pattern: RegExp | ((cmd: string) => RegExpMatchArray | null);
  handler: (
    event: OB11Message,
    cmd: string,
    match: RegExpMatchArray | null,
    ctx: NapCatPluginContext,
    replyMsgId?: string
  ) => Promise<boolean>;
}

async function handleHelp (
  event: OB11Message,
  userId: string,
  ctx: NapCatPluginContext
): Promise<void> {
  const master = isOwner(userId);
  const prefix = pluginState.config.prefix || 'xy';
  const name = pluginState.config.botName || '汐雨';

  const sections = [
    {
      title: `🐱 ${name}猫娘助手 v${PLUGIN_VERSION}`,
      content: [
        '欢迎使用喵～',
        '',
        `当前前缀：${prefix}`,
        '提示：下面示例里的 xy 请替换成你实际设置的前缀。',
      ].join('\n'),
    },
    {
      title: '📌 基础指令',
      content: [
        `${prefix} 帮助 - 显示帮助`,
        `${prefix} <内容> - AI 对话`,
        `${prefix} 上下文 - 查看当前上下文状态`,
        `${prefix} 清除上下文 - 清除当前上下文`,
        `${prefix} AI状态 - 查看本群 AI 开关状态`,
        '',
        '白名单：',
        `加白 - 申请加入白名单`,
        `加白 <验证码> - 验证加入白名单`,
      ].join('\n'),
    },
    {
      title: '🎨 生图指令',
      content: [
        `${prefix} 生图 <提示词> - 生成图片`,
        `/生图 <提示词> - 免前缀生成图片`,
        '',
        `${prefix} 生图模型 - 查看已启用生图模型`,
        `/生图模型 - 免前缀查看已启用生图模型`,
        '',
        `${prefix} 预设 - 查看生图预设`,
        `/预设 - 免前缀查看生图预设`,
      ].join('\n'),
    },
    {
      title: '📸 AI 自拍指令',
      content: [
        `${prefix} 自拍 - 生成一张默认自拍`,
        `${prefix} 自拍 <动作/场景> - 指定动作或场景自拍`,
        `/自拍 - 免前缀生成默认自拍`,
        `/自拍 <动作/场景> - 免前缀生成指定自拍`,
      ].join('\n'),
    },
    {
      title: '🖼️ 自拍形象参考图',
      content: [
        `${prefix} 形象查看 - 查看当前自拍参考图`,
        `${prefix} 形象设置 - 设置自拍参考图，需要发送图片或引用图片`,
        `${prefix} 形象设置 图片链接 - 使用图片链接设置自拍参考图`,
        `${prefix} 形象清除 - 清除自拍参考图`,
        '',
        '免前缀：',
        `/形象查看`,
        `/形象设置`,
        `/形象清除`,
        '',
        'Web 面板：',
        '进入 Web 管理页 → 自拍设置 → 直接上传自拍参考图',
      ].join('\n'),
    },
  ];

  if (pluginState.config.allowPublicPacket) {
    sections.push({
      title: '📦 公开取包指令',
      content: [
        '取 - 获取回复消息的 OneBot / ProtoBuf 数据',
        '取上一条 - 获取上一条消息',
        '取 <RealSeq> - 按 Real Seq 获取消息',
      ].join('\n'),
    });
  }

  if (master) {
    sections.push(
      {
        title: '👑 主人和白名单',
        content: [
          `${prefix} 主人列表 - 查看核心主人`,
          `${prefix} 白名单列表 - 查看白名单`,
          `${prefix} 白名单 - 查看白名单`,
          `${prefix} 加白 <QQ号> - 添加白名单`,
          `${prefix} 加白名单 <QQ号> - 添加白名单`,
          `${prefix} 移除白 <QQ号> - 移除动态白名单`,
          `${prefix} 移除白名单 <QQ号> - 移除动态白名单`,
        ].join('\n'),
      },
      {
        title: '🤖 群 AI 开关',
        content: [
          `${prefix} 开启AI - 开启本群 AI 对话`,
          `${prefix} 关闭AI - 关闭本群 AI 对话`,
          `${prefix} AI状态 - 查看本群 AI 对话状态`,
        ].join('\n'),
      },
      {
        title: '🧩 渠道管理',
        content: [
          '一个渠道会同时用于会话和生图。',
          '',
          `${prefix} 新增渠道 渠道名 渠道域名 sk`,
          `${prefix} 新增渠道 渠道名 渠道域名 sk provider`,
          `${prefix} 拉取渠道`,
          `${prefix} 拉取渠道 渠道名`,
          `${prefix} 查看渠道`,
          `${prefix} 查看渠道 渠道名`,
          `${prefix} 删除渠道 渠道名`,
          '',
          'provider 可选：',
          'openai / gemini / gemini_openai / z_image_gitee / jimeng2api / grok',
        ].join('\n'),
      },
      {
        title: '🤖 会话模型管理',
        content: [
          `${prefix} 查看会话缓存`,
          `${prefix} 查看会话缓存 渠道名`,
          `${prefix} 查看会话模型`,
          `${prefix} 启用会话模型 渠道/模型名`,
          `${prefix} 启用会话模型 1 2 3`,
          `${prefix} 禁用会话模型 渠道/模型名`,
          `${prefix} 禁用会话模型 1 2`,
          `${prefix} 设置会话模型 渠道/模型名 渠道/模型名`,
          `${prefix} 设置会话模型 4 3 12`,
          '',
          '提示：模型序号来自「查看会话缓存」。',
        ].join('\n'),
      },
      {
        title: '🎨 生图模型管理',
        content: [
          `${prefix} 查看生图缓存`,
          `${prefix} 查看生图缓存 渠道名`,
          `${prefix} 查看生图模型`,
          `${prefix} 启用生图模型 渠道/模型名`,
          `${prefix} 启用生图模型 1 2 3`,
          `${prefix} 禁用生图模型 渠道/模型名`,
          `${prefix} 禁用生图模型 1 2`,
          `${prefix} 设置生图模型 渠道/模型名 渠道/模型名`,
          `${prefix} 设置生图模型 4 3 12`,
          '',
          '提示：模型序号来自「查看生图缓存」。',
        ].join('\n'),
      },
      {
        title: '📋 生图预设管理',
        content: [
          `${prefix} 预设`,
          `${prefix} 预设 添加 名称:提示词`,
          `${prefix} 预设 添加 名称:{"prompt":"提示词","aspect_ratio":"16:9","resolution":"2K","description":"说明"}`,
          `${prefix} 预设 删除 名称`,
        ].join('\n'),
      },
      {
        title: '👀 用户检测器',
        content: [
          `${prefix} 检测器列表 - 查看用户检测器`,
        ].join('\n'),
      },
      {
        title: '📦 主人 Packet 指令',
        content: [
          'api <OneBot API>',
          'pb <json>',
          'pbl <json>',
          'raw <cmd>\\n<json>',
          '取',
          '取上一条',
          '取 <RealSeq>',
          '模式取1',
          '模式取2',
        ].join('\n'),
      }
    );
  }

  sections.push({
    title: '⚙️ 当前状态',
    content: [
      `前缀: ${prefix}`,
      `对话模型数: ${getAllEnabledChatModels().length}`,
      `生图模型数: ${getAllEnabledImageModels().length}`,
      `AI 对话: ${pluginState.config.enableReply === false ? '关闭' : '开启'}`,
      `艾特触发: ${pluginState.config.allowAtTrigger ? '开启' : '关闭'}`,
      `公开取包: ${pluginState.config.allowPublicPacket ? '开启' : '关闭'}`,
      `Web 面板: ${pluginState.config.webEnable ? `开启，端口 ${pluginState.config.webPort}` : '关闭'}`,
    ].join('\n'),
  });

  await sendForwardMsg(event, sections, ctx);
}

function ownerDenied (): string {
  return '❌ 该指令仅核心主人可用喵～';
}

function formatWhitelist (): string {
  const w = listWhitelist();

  const configPart = w.config.length
    ? w.config.map(id => `  • ${id}`).join('\n')
    : '  暂无';

  const dynamicPart = w.dynamic.length
    ? w.dynamic.map(id => `  • ${id}`).join('\n')
    : '  暂无';

  return [
    `🧾 白名单列表 (共${w.total}人)`,
    '',
    '【Web配置】',
    configPart,
    '',
    '【动态添加】',
    dynamicPart,
  ].join('\n');
}

const commands: CommandDef[] = [
  {
    name: '帮助',
    pattern: /^帮助$|^$/,
    handler: async (event, _cmd, _m, ctx) => {
      await handleHelp(event, String(event.user_id), ctx);
      return true;
    },
  },
  {
    name: '清除上下文',
    pattern: /^清除上下文$/,
    handler: async (event, _cmd, _m, ctx) => {
      contextManager.clearContext(
        String(event.user_id),
        event.group_id ? String(event.group_id) : undefined
      );

      await sendReply(event, '✅ 上下文已清除喵～', ctx);
      return true;
    },
  },
  {
    name: '上下文',
    pattern: /^上下文$/,
    handler: async (event, _cmd, _m, ctx) => {
      const info = contextManager.getContextInfo(
        String(event.user_id),
        event.group_id ? String(event.group_id) : undefined
      );

      await sendReply(
        event,
        info.expired || info.messages === 0
          ? '📝 当前没有活跃上下文喵～'
          : `📝 对话轮数: ${info.turns} | 消息数: ${info.messages}`,
        ctx
      );

      return true;
    },
  },
  {
    name: 'AI状态',
    pattern: /^AI状态$/,
    handler: async (event, _cmd, _m, ctx) => {
      const groupId = event.group_id ? String(event.group_id) : undefined;

      if (!groupId) {
        await sendReply(event, '📝 私聊AI对话状态: ✅ 已开启', ctx);
      } else {
        await sendReply(
          event,
          `📝 本群AI对话状态: ${pluginState.isGroupAIDisabled(groupId) ? '❌ 已关闭' : '✅ 已开启'}`,
          ctx
        );
      }

      return true;
    },
  },
  {
    name: '加白自助',
    pattern: /^加白名单?$|^加白$/,
    handler: async (event, _cmd, _m, ctx) => {
      const res = startWhitelistVerification(String(event.user_id));
      await sendReply(event, res.message, ctx);
      return true;
    },
  },
  {
    name: '加白验证或添加',
    pattern: /^加白名单?\s+(\S+)$/,
    handler: async (event, _cmd, m, ctx) => {
      const arg = String(m?.[1] || '').trim();
      const userId = String(event.user_id);

      if (/^\d{5,12}$/.test(arg) && isOwner(userId)) {
        const res = addWhitelist(userId, arg);
        await sendReply(event, res.message, ctx);
        return true;
      }

      const res = verifyWhitelistCode(userId, arg);
      await sendReply(event, res.message, ctx);
      return true;
    },
  },
  {
    name: '移除白名单',
    ownerOnly: true,
    pattern: /^移除白名单?\s+(\d+)$/,
    handler: async (event, _cmd, m, ctx) => {
      const res = removeWhitelist(String(event.user_id), m?.[1] || '');
      await sendReply(event, res.message, ctx);
      return true;
    },
  },
  {
    name: '白名单列表',
    ownerOnly: true,
    pattern: /^白名单列表$|^白名单$/,
    handler: async (event, _cmd, _m, ctx) => {
      await sendReply(event, formatWhitelist(), ctx);
      return true;
    },
  },
  {
    name: '检测器列表',
    ownerOnly: true,
    pattern: /^检测器列表$/,
    handler: async (event, _cmd, _m, ctx) => {
      const result = userWatcherManager.listWatchers();
      const watchers = (result.data as {
        id: string;
        target_user: string;
        action: string;
        enabled: boolean;
        trigger_count: number;
      }[]) || [];

      if (!watchers.length) {
        await sendReply(event, '📋 暂无用户检测器喵～', ctx);
      } else {
        await sendReply(
          event,
          `📋 用户检测器列表 (${watchers.length}个)：\n${watchers
            .map(w => `${w.enabled ? '✅' : '❌'} ${w.id}: 监控${w.target_user} -> ${w.action} (触发${w.trigger_count}次)`)
            .join('\n')}`,
          ctx
        );
      }

      return true;
    },
  },
  {
    name: '主人列表',
    ownerOnly: true,
    pattern: /^主人列表$/,
    handler: async (event, _cmd, _m, ctx) => {
      const owners = listOwners();

      const defaultPart = owners.default.length
        ? owners.default.map(id => `  • ${id}`).join('\n')
        : '  暂无';

      await sendReply(
        event,
        `👑 核心主人列表 (共${owners.total}人)：\n\n【NapCat配置】\n${defaultPart}`,
        ctx
      );

      return true;
    },
  },
  {
    name: '移除主人',
    ownerOnly: true,
    pattern: /^移除主人\s+(\d+)$/,
    handler: async (event, _cmd, _m, ctx) => {
      await sendReply(event, '❌ 核心主人只能在 NapCat 插件配置中修改喵～', ctx);
      return true;
    },
  },
  {
    name: '开启AI',
    ownerOnly: true,
    pattern: /^开启AI$/,
    handler: async (event, _cmd, _m, ctx) => {
      if (!event.group_id) {
        await sendReply(event, '❌ 该指令仅在群聊中可用喵～', ctx);
      } else {
        pluginState.setGroupAI(String(event.group_id), true);
        await sendReply(event, `✅ 本群(${event.group_id})AI对话已开启喵～`, ctx);
      }

      return true;
    },
  },
  {
    name: '关闭AI',
    ownerOnly: true,
    pattern: /^关闭AI$/,
    handler: async (event, _cmd, _m, ctx) => {
      if (!event.group_id) {
        await sendReply(event, '❌ 该指令仅在群聊中可用喵～', ctx);
      } else {
        pluginState.setGroupAI(String(event.group_id), false);
        await sendReply(event, `✅ 本群(${event.group_id})AI对话已关闭喵～`, ctx);
      }

      return true;
    },
  },
];

const removedWebOnlyCommandPatterns: RegExp[] = [
  /^模型列表$/,
  /^切换模型(?:\s+\d+)?$/,
  /^渠道列表$/,
  /^渠道$/,
  /^对话渠道$/,
  /^聊天渠道$/,
  /^生图渠道$/,
  /^绘画渠道$/,
  /^刷新对话模型(?:\s+.+)?$/,
  /^刷新生图模型(?:\s+.+)?$/,
  /^对话优先级\s+[\s\S]+$/,
  /^生图优先级\s+[\s\S]+$/,
  /^生图模型\s+\d+$/,
];

function isRemovedWebOnlyCommand (cmd: string): boolean {
  return removedWebOnlyCommandPatterns.some(pattern => pattern.test(cmd));
}

export async function handleCommand (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext,
  replyMsgId?: string
): Promise<boolean> {
  const userId = String(event.user_id);
  const owner = isOwner(userId);

  if (/^设置主人$/.test(cmd) || /^验证主人\s+\S+$/.test(cmd)) {
    await sendReply(event, '❌ 动态主人已改为白名单，请使用「加白」喵～', ctx);
    return true;
  }

  if (await handleChannelConfigCommand(event, cmd, ctx, owner)) {
    return true;
  }

  if (await handleMusicCommand(event, cmd, ctx)) {
    return true;
  }

  if (isRemovedWebOnlyCommand(cmd)) {
    await sendReply(event, '⚙️ 该配置已移到指令方式或配置文件中，请使用新的渠道/模型指令喵～', ctx);
    return true;
  }

  for (const def of commands) {
    const match = typeof def.pattern === 'function'
      ? def.pattern(cmd)
      : cmd.match(def.pattern);

    if (!match) continue;

    if (def.ownerOnly && !owner) {
      await sendReply(event, ownerDenied(), ctx);
      return true;
    }

    return await def.handler(event, cmd, match, ctx, replyMsgId);
  }

  if (cmd) {
    if (pluginState.config.enableReply === false) {
      await sendReply(event, '❌ AI 对话功能已关闭喵～', ctx);
      return true;
    }

    await handleAICommand(event, cmd, ctx, replyMsgId);
    return true;
  }

  return false;
}