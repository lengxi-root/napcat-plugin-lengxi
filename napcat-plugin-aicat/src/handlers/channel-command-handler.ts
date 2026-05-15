import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import type { ChannelConfig, ImageChannelConfig } from '../types';
import { pluginState } from '../core/state';
import { sendReply } from '../utils/message';
import {
  getAllEnabledChatModels,
  getAllEnabledImageModels,
  getChatChannelsWithCache,
  getImageChannelsWithCache,
  refreshChatModelCache,
  refreshImageModelCache,
  removeChatChannel,
  removeImageChannel,
} from '../core/config-service';

type ChannelKind = 'chat' | 'image';

function kindFromText (text: string): ChannelKind {
  return text === '生图' ? 'image' : 'chat';
}

function kindName (kind: ChannelKind): string {
  return kind === 'image' ? '生图' : '会话';
}

function normalizeBaseUrl (url: string): string {
  let v = String(url || '').trim().replace(/\/+$/, '');
  v = v.replace(/\/v1($|\/.*$)/i, '');
  v = v.replace(/\/chat\/completions$/i, '');
  v = v.replace(/\/images\/generations$/i, '');
  v = v.replace(/\/images\/edits$/i, '');
  return v;
}

function splitArgs (text: string): string[] {
  return String(text || '').split(/\s+/).map(v => v.trim()).filter(Boolean);
}

function uniq (list: string[]): string[] {
  return Array.from(new Set(list.map(v => v.trim()).filter(Boolean)));
}

function getRuntimeChannels (kind: ChannelKind): Array<ChannelConfig | ImageChannelConfig> {
  return kind === 'image'
    ? pluginState.config.imageChannels
    : pluginState.config.chatChannels;
}

function getChannelsWithCache (kind: ChannelKind): Array<ChannelConfig | ImageChannelConfig> {
  return kind === 'image'
    ? getImageChannelsWithCache()
    : getChatChannelsWithCache();
}

function getEnabledFullModels (kind: ChannelKind): string[] {
  return kind === 'image'
    ? getAllEnabledImageModels()
    : getAllEnabledChatModels();
}

function getPriorityList (kind: ChannelKind): string[] {
  return kind === 'image'
    ? pluginState.config.enabledImageModelPriority || []
    : pluginState.config.enabledChatModelPriority || [];
}

function setPriorityList (kind: ChannelKind, list: string[]): void {
  if (kind === 'image') {
    pluginState.config.enabledImageModelPriority = list;
  } else {
    pluginState.config.enabledChatModelPriority = list;
  }
}

function findRuntimeChannel (kind: ChannelKind, name: string): ChannelConfig | ImageChannelConfig | undefined {
  return getRuntimeChannels(kind).find(c => c.name === name);
}

function findChatRuntimeChannel (name: string): ChannelConfig | undefined {
  return pluginState.config.chatChannels.find(c => c.name === name);
}

function findImageRuntimeChannel (name: string): ImageChannelConfig | undefined {
  return pluginState.config.imageChannels.find(c => c.name === name);
}

function isModelEnabled (ch: ChannelConfig | ImageChannelConfig | undefined, model: string): boolean {
  return Boolean(ch?.enabled_models?.some(m => m.id === model && m.enabled !== false));
}

function buildCachedFullModels (kind: ChannelKind): string[] {
  const result: string[] = [];

  for (const ch of getChannelsWithCache(kind)) {
    for (const model of ch.models_cache || []) {
      if (model) result.push(`${ch.name}/${model}`);
    }
  }

  return uniq(result);
}

function resolveTokenList (
  kind: ChannelKind,
  tokens: string[],
  source: 'cache' | 'enabled'
): { fulls: string[]; errors: string[] } {
  const baseList = source === 'cache'
    ? buildCachedFullModels(kind)
    : getEnabledFullModels(kind);

  const fulls: string[] = [];
  const errors: string[] = [];

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const index = Number(token) - 1;
      const full = baseList[index];

      if (!full) errors.push(`序号不存在: ${token}`);
      else fulls.push(full);

      continue;
    }

    if (token.includes('/')) {
      const pos = token.indexOf('/');
      const channelName = token.slice(0, pos);
      const model = token.slice(pos + 1);

      if (!channelName || !model) errors.push(`模型格式错误: ${token}`);
      else fulls.push(`${channelName}/${model}`);

      continue;
    }

    const matched = baseList.filter(full => full.endsWith(`/${token}`));

    if (matched.length === 1) fulls.push(matched[0]);
    else if (matched.length > 1) errors.push(`模型名不唯一，请使用 渠道/模型名: ${token}`);
    else errors.push(`未找到模型: ${token}`);
  }

  return {
    fulls: uniq(fulls),
    errors,
  };
}

function addEnabledModel (kind: ChannelKind, full: string): boolean {
  const pos = full.indexOf('/');
  if (pos <= 0) return false;

  const channelName = full.slice(0, pos);
  const model = full.slice(pos + 1);
  const ch = findRuntimeChannel(kind, channelName);

  if (!ch) return false;
  if (!Array.isArray(ch.enabled_models)) ch.enabled_models = [];

  const existed = ch.enabled_models.find(m => m.id === model);

  if (existed) {
    const changed = existed.enabled === false;
    existed.enabled = true;
    return changed;
  }

  ch.enabled_models.push({ id: model, enabled: true });
  return true;
}

function removeEnabledModel (kind: ChannelKind, full: string): boolean {
  const pos = full.indexOf('/');
  if (pos <= 0) return false;

  const channelName = full.slice(0, pos);
  const model = full.slice(pos + 1);
  const ch = findRuntimeChannel(kind, channelName);

  if (!ch || !Array.isArray(ch.enabled_models)) return false;

  const before = ch.enabled_models.length;
  ch.enabled_models = ch.enabled_models.filter(m => m.id !== model);

  return ch.enabled_models.length !== before;
}

function getProviderType (provider: string): ImageChannelConfig['provider_type'] {
  const v = String(provider || 'openai').trim();

  if (['openai', 'gemini', 'gemini_openai', 'z_image_gitee', 'jimeng2api', 'grok'].includes(v)) {
    return v as ImageChannelConfig['provider_type'];
  }

  return 'openai';
}

async function handleAddSharedChannel (
  name: string,
  baseUrl: string,
  apiKey: string,
  provider: string,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const channelName = name.trim();
  const base = normalizeBaseUrl(baseUrl);
  const key = apiKey.trim();
  const providerType = getProviderType(provider);

  if (!channelName || !base) {
    await sendReply(
      event,
      [
        '❌ 用法：新增渠道 渠道名 渠道域名 sk',
        '可选：新增渠道 渠道名 渠道域名 sk provider',
        '',
        'provider 可选：openai / gemini / gemini_openai / z_image_gitee / jimeng2api / grok',
      ].join('\n'),
      ctx
    );
    return true;
  }

  const existsChat = Boolean(findChatRuntimeChannel(channelName));
  const existsImage = Boolean(findImageRuntimeChannel(channelName));

  if (existsChat && existsImage) {
    await sendReply(event, `❌ 渠道已存在: ${channelName}`, ctx);
    return true;
  }

  if (!existsChat) {
    pluginState.config.chatChannels.push({
      name: channelName,
      base_url: base,
      api_key: key,
      models_cache: [],
      enabled_models: [],
      timeout: 60000,
    });
  }

  if (!existsImage) {
    pluginState.config.imageChannels.push({
      name: channelName,
      base_url: base,
      api_key: key,
      provider_type: providerType,
      models_cache: [],
      enabled_models: [],
      timeout: 180000,
      capability_options: {
        text_to_image: true,
        image_to_image: true,
        aspect_ratio: true,
        resolution: true,
      },
      extra: {},
    });
  }

  pluginState.saveConfig();

  await sendReply(
    event,
    [
      `✅ 已新增共用渠道: ${channelName}`,
      `域名: ${base}`,
      `生图 Provider: ${providerType}`,
      '',
      '该渠道已同时加入会话渠道和生图渠道。',
      `下一步可以发送：拉取渠道 ${channelName}`,
    ].join('\n'),
    ctx
  );

  return true;
}

async function handleRefreshShared (
  channelName: string,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const name = channelName.trim();

  if (name && !findChatRuntimeChannel(name) && !findImageRuntimeChannel(name)) {
    await sendReply(event, `❌ 未找到渠道: ${name}`, ctx);
    return true;
  }

  await sendReply(event, '🔄 正在拉取渠道模型缓存，请稍等喵～', ctx);

  const lines: string[] = [];
  let total = 0;

  if (!name || findChatRuntimeChannel(name)) {
    const r = await refreshChatModelCache(name);
    const channels = r.channels.filter(ch => !name || ch.name === name);

    for (const ch of channels) {
      lines.push(`• 会话/${ch.name}: ${(ch.models_cache || []).length} 个模型`);
      total += (ch.models_cache || []).length;
    }
  }

  if (!name || findImageRuntimeChannel(name)) {
    const r = await refreshImageModelCache(name);
    const channels = r.channels.filter(ch => !name || ch.name === name);

    for (const ch of channels) {
      lines.push(`• 生图/${ch.name}: ${(ch.models_cache || []).length} 个模型`);
      total += (ch.models_cache || []).length;
    }
  }

  await sendReply(
    event,
    [
      `✅ 渠道模型缓存拉取完成，共 ${total} 个模型记录`,
      ...lines,
      '',
      '查看全部缓存：查看渠道',
      '查看会话序号：查看会话缓存',
      '查看生图序号：查看生图缓存',
    ].join('\n'),
    ctx
  );

  return true;
}

async function handleShowTypedCache (
  kind: ChannelKind,
  channelName: string,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const name = channelName.trim();
  const channels = getChannelsWithCache(kind).filter(ch => !name || ch.name === name);

  if (name && !channels.length) {
    await sendReply(event, `❌ 未找到${kindName(kind)}渠道: ${name}`, ctx);
    return true;
  }

  if (!channels.length) {
    await sendReply(event, `📋 暂无${kindName(kind)}渠道`, ctx);
    return true;
  }

  let index = 1;
  const lines = [
    `📋 ${kindName(kind)}模型缓存：`,
    `提示：启用${kindName(kind)}模型时，序号以本列表为准。`,
    '',
  ];

  for (const ch of channels) {
    lines.push(`【${ch.name}】`);

    if (!ch.models_cache?.length) {
      lines.push('  暂无缓存，请先拉取渠道');
      lines.push('');
      continue;
    }

    for (const model of ch.models_cache) {
      const mark = isModelEnabled(ch, model) ? ' ✅已启用' : '';
      lines.push(`${index}. ${ch.name}/${model}${mark}`);
      index++;
    }

    lines.push('');
  }

  await sendReply(event, lines.join('\n').trim(), ctx);
  return true;
}

async function handleShowSharedCache (
  channelName: string,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const name = channelName.trim();

  const chatChannels = getChatChannelsWithCache().filter(ch => !name || ch.name === name);
  const imageChannels = getImageChannelsWithCache().filter(ch => !name || ch.name === name);

  if (name && !chatChannels.length && !imageChannels.length) {
    await sendReply(event, `❌ 未找到渠道: ${name}`, ctx);
    return true;
  }

  if (!chatChannels.length && !imageChannels.length) {
    await sendReply(event, '📋 暂无渠道', ctx);
    return true;
  }

  const lines: string[] = [
    '📋 渠道模型缓存概览：',
    '提示：这里是概览。启用模型时请用「查看会话缓存」或「查看生图缓存」里的序号。',
    '',
  ];

  if (chatChannels.length) {
    lines.push('【会话缓存】');
    let i = 1;
    for (const ch of chatChannels) {
      if (!ch.models_cache?.length) {
        lines.push(`- ${ch.name}: 暂无缓存`);
        continue;
      }
      for (const model of ch.models_cache) {
        const mark = isModelEnabled(ch, model) ? ' ✅' : '';
        lines.push(`${i}. ${ch.name}/${model}${mark}`);
        i++;
      }
    }
    lines.push('');
  }

  if (imageChannels.length) {
    lines.push('【生图缓存】');
    let i = 1;
    for (const ch of imageChannels) {
      if (!ch.models_cache?.length) {
        lines.push(`- ${ch.name}: 暂无缓存`);
        continue;
      }
      for (const model of ch.models_cache) {
        const mark = isModelEnabled(ch, model) ? ' ✅' : '';
        lines.push(`${i}. ${ch.name}/${model}${mark}`);
        i++;
      }
    }
    lines.push('');
  }

  lines.push('可用指令：');
  lines.push('查看会话缓存');
  lines.push('查看生图缓存');

  await sendReply(event, lines.join('\n'), ctx);
  return true;
}

async function handleDeleteSharedChannel (
  channelName: string,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const name = channelName.trim();

  if (!name) {
    await sendReply(event, '❌ 用法：删除渠道 渠道名', ctx);
    return true;
  }

  const existsChat = Boolean(findChatRuntimeChannel(name));
  const existsImage = Boolean(findImageRuntimeChannel(name));

  if (!existsChat && !existsImage) {
    await sendReply(event, `❌ 未找到渠道: ${name}`, ctx);
    return true;
  }

  if (existsChat) removeChatChannel(name);
  if (existsImage) removeImageChannel(name);

  await sendReply(
    event,
    [
      `✅ 已删除渠道: ${name}`,
      existsChat ? '• 已删除会话渠道' : '',
      existsImage ? '• 已删除生图渠道' : '',
      '• 已清理对应模型优先级和模型缓存',
    ].filter(Boolean).join('\n'),
    ctx
  );

  return true;
}

async function handleShowEnabledModels (
  kind: ChannelKind,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const enabled = getEnabledFullModels(kind);
  const priority = getPriorityList(kind).filter(full => enabled.includes(full));

  if (!enabled.length) {
    await sendReply(event, `📋 当前没有启用的${kindName(kind)}模型喵～`, ctx);
    return true;
  }

  const ordered = uniq([
    ...priority,
    ...enabled.filter(full => !priority.includes(full)),
  ]);

  await sendReply(
    event,
    [
      `📋 已启用${kindName(kind)}模型：`,
      '',
      ...ordered.map((full, i) => `${i + 1}. ${full}`),
    ].join('\n'),
    ctx
  );

  return true;
}

async function handleEnableModels (
  kind: ChannelKind,
  rawArgs: string,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const tokens = splitArgs(rawArgs);

  if (!tokens.length) {
    await sendReply(
      event,
      [
        `❌ 用法：启用${kindName(kind)}模型 渠道/模型名`,
        `也可以使用缓存序号：启用${kindName(kind)}模型 1 2 3`,
        '',
        `序号来自「查看${kindName(kind)}缓存」，不是「查看渠道」概览。`,
      ].join('\n'),
      ctx
    );
    return true;
  }

  const { fulls, errors } = resolveTokenList(kind, tokens, 'cache');

  if (!fulls.length) {
    await sendReply(
      event,
      [
        `❌ 没有可启用的${kindName(kind)}模型`,
        errors.length ? `错误：${errors.join('；')}` : '',
        '',
        `请先发送：查看${kindName(kind)}缓存`,
      ].filter(Boolean).join('\n'),
      ctx
    );
    return true;
  }

  let changed = 0;

  for (const full of fulls) {
    if (addEnabledModel(kind, full)) changed++;
  }

  pluginState.saveConfig();

  await sendReply(
    event,
    [
      `✅ 已启用${kindName(kind)}模型 ${fulls.length} 个`,
      `新增启用: ${changed} 个`,
      '',
      ...fulls.map(full => `• ${full}`),
      errors.length ? `\n⚠️ 部分参数未处理：${errors.join('；')}` : '',
    ].filter(Boolean).join('\n'),
    ctx
  );

  return true;
}

async function handleDisableModels (
  kind: ChannelKind,
  rawArgs: string,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const tokens = splitArgs(rawArgs);

  if (!tokens.length) {
    await sendReply(event, `❌ 用法：禁用${kindName(kind)}模型 渠道/模型名\n也可以使用已启用序号：禁用${kindName(kind)}模型 1 2 3`, ctx);
    return true;
  }

  const { fulls, errors } = resolveTokenList(kind, tokens, 'enabled');

  if (!fulls.length) {
    await sendReply(
      event,
      [
        `❌ 没有可禁用的${kindName(kind)}模型`,
        errors.length ? `错误：${errors.join('；')}` : '',
      ].filter(Boolean).join('\n'),
      ctx
    );
    return true;
  }

  let changed = 0;

  for (const full of fulls) {
    if (removeEnabledModel(kind, full)) changed++;
  }

  const enabled = getEnabledFullModels(kind);
  const priority = getPriorityList(kind).filter(full => enabled.includes(full));
  setPriorityList(kind, priority);

  pluginState.saveConfig();

  await sendReply(
    event,
    [
      `✅ 已禁用${kindName(kind)}模型 ${changed} 个`,
      '',
      ...fulls.map(full => `• ${full}`),
      errors.length ? `\n⚠️ 部分参数未处理：${errors.join('；')}` : '',
    ].filter(Boolean).join('\n'),
    ctx
  );

  return true;
}

async function handleSetPriority (
  kind: ChannelKind,
  rawArgs: string,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const tokens = splitArgs(rawArgs);

  if (!tokens.length) {
    await sendReply(
      event,
      [
        `❌ 用法：设置${kindName(kind)}模型 渠道/模型名 渠道/模型名`,
        `也可以使用已启用模型序号：设置${kindName(kind)}模型 4 3 12`,
        '',
        `查看序号：查看${kindName(kind)}模型`,
      ].join('\n'),
      ctx
    );
    return true;
  }

  const enabled = getEnabledFullModels(kind);

  if (!enabled.length) {
    await sendReply(event, `❌ 当前没有启用的${kindName(kind)}模型，请先启用模型`, ctx);
    return true;
  }

  const { fulls, errors } = resolveTokenList(kind, tokens, 'enabled');
  const validSelected = fulls.filter(full => enabled.includes(full));

  if (!validSelected.length) {
    await sendReply(
      event,
      [
        `❌ 没有找到要设置优先级的${kindName(kind)}模型`,
        errors.length ? `错误：${errors.join('；')}` : '',
      ].filter(Boolean).join('\n'),
      ctx
    );
    return true;
  }

  const currentPriority = getPriorityList(kind).filter(full => enabled.includes(full));
  const currentOrdered = uniq([
    ...currentPriority,
    ...enabled.filter(full => !currentPriority.includes(full)),
  ]);

  const next = uniq([
    ...validSelected,
    ...currentOrdered.filter(full => !validSelected.includes(full)),
    ...enabled.filter(full => !validSelected.includes(full)),
  ]);

  setPriorityList(kind, next);
  pluginState.saveConfig();

  await sendReply(
    event,
    [
      `✅ 已设置${kindName(kind)}模型优先级`,
      '',
      ...next.map((full, i) => `${i + 1}. ${full}`),
      errors.length ? `\n⚠️ 部分参数未处理：${errors.join('；')}` : '',
      '',
      '未写入的已启用模型会自动排在后面。',
    ].filter(Boolean).join('\n'),
    ctx
  );

  return true;
}

async function handleRemovedOldChannelCommand (
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<boolean> {
  await sendReply(
    event,
    [
      '⚠️ 旧的分类渠道指令已移除。',
      '',
      '请使用共用渠道指令：',
      '新增渠道 渠道名 渠道域名 sk',
      '拉取渠道 渠道名',
      '查看渠道 渠道名',
      '删除渠道 渠道名',
      '',
      '模型启用仍然区分用途：',
      '启用会话模型 渠道/模型名',
      '启用生图模型 渠道/模型名',
    ].join('\n'),
    ctx
  );

  return true;
}

export async function handleChannelConfigCommand (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext,
  isOwnerUser: boolean
): Promise<boolean> {
  const text = cmd.trim();

  const isSharedChannelCommand = /^(新增|拉取|查看|删除)渠道/.test(text);
  const isOldTypedChannelCommand = /^(新增|拉取|查看|删除)(生图|会话)渠道/.test(text);
  const isModelCommand = /^(查看|启用|禁用|设置)(生图|会话)模型/.test(text);
  const isTypedCacheCommand = /^查看(生图|会话)缓存/.test(text);

  if (!isSharedChannelCommand && !isOldTypedChannelCommand && !isModelCommand && !isTypedCacheCommand) {
    return false;
  }

  if (!isOwnerUser) {
    await sendReply(event, '❌ 该配置指令仅核心主人可用喵～', ctx);
    return true;
  }

  if (isOldTypedChannelCommand) {
    return handleRemovedOldChannelCommand(event, ctx);
  }

  let m = text.match(/^新增渠道\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S+))?$/);
  if (m) return handleAddSharedChannel(m[1], m[2], m[3], m[4] || 'openai', event, ctx);

  m = text.match(/^拉取渠道(?:\s+(\S+))?$/);
  if (m) return handleRefreshShared(m[1] || '', event, ctx);

  m = text.match(/^查看渠道(?:\s+(\S+))?$/);
  if (m) return handleShowSharedCache(m[1] || '', event, ctx);

  m = text.match(/^查看(生图|会话)缓存(?:\s+(\S+))?$/);
  if (m) return handleShowTypedCache(kindFromText(m[1]), m[2] || '', event, ctx);

  m = text.match(/^删除渠道\s+(\S+)$/);
  if (m) return handleDeleteSharedChannel(m[1], event, ctx);

  m = text.match(/^查看(生图|会话)模型$/);
  if (m) return handleShowEnabledModels(kindFromText(m[1]), event, ctx);

  m = text.match(/^启用(生图|会话)模型\s+([\s\S]+)$/);
  if (m) return handleEnableModels(kindFromText(m[1]), m[2], event, ctx);

  m = text.match(/^禁用(生图|会话)模型\s+([\s\S]+)$/);
  if (m) return handleDisableModels(kindFromText(m[1]), m[2], event, ctx);

  m = text.match(/^设置(生图|会话)模型\s+([\s\S]+)$/);
  if (m) return handleSetPriority(kindFromText(m[1]), m[2], event, ctx);

  await sendReply(
    event,
    [
      '❌ 渠道/模型配置指令格式不正确',
      '',
      '渠道指令：',
      '新增渠道 openai https://api.openai.com sk-xxx',
      '新增渠道 gemini https://generativelanguage.googleapis.com sk-xxx gemini',
      '拉取渠道 openai',
      '查看渠道 openai',
      '查看会话缓存 openai',
      '查看生图缓存 openai',
      '删除渠道 openai',
      '',
      '模型指令：',
      '启用会话模型 openai/gpt-4o',
      '启用生图模型 openai/gpt-image-1',
      '启用生图模型 1 2',
      '禁用会话模型 1 2',
      '查看会话模型',
      '查看生图模型',
      '设置会话模型 4 3 12',
      '',
      '注意：启用模型的序号来自「查看会话缓存」或「查看生图缓存」，不是「查看渠道」概览。',
    ].join('\n'),
    ctx
  );

  return true;
}
