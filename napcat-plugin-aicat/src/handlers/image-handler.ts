import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import { modelMonitorManager } from '../managers/model-monitor';
import { pluginState } from '../core/state';
import { sendReply, sendForwardMsg } from '../utils/message';
import { getPrioritizedImageTargets, getAllEnabledImageModels } from '../core/channel-store';
import { generateImageWithFallback } from '../image/generator';
import { imageUsageManager } from '../image/usage-manager';
import { imageCacheManager } from '../image/cache-manager';
import { fetchReferenceImagesFromEvent, filePathToMessageImage } from '../image/image-processor';
import { imagePresetManager } from '../image/preset-manager';
import { imagePersonaManager } from '../image/persona-manager';
import { isOwner, isWhitelisted } from '../managers/owner-manager';
import { imageSafetyAuditor } from '../image/safety-auditor';
import { imageTaskQueue } from '../image/task-queue';

function formatDuration (ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function getGlobalTimeoutText (): string {
  const cfg = pluginState.config as typeof pluginState.config & { imageGlobalTimeoutMs?: unknown; };
  const n = Number(cfg.imageGlobalTimeoutMs || 180000);
  const ms = Number.isFinite(n) && n > 0 ? n : 180000;
  return `${Math.round(ms / 1000)}秒`;
}

function getShowGenerationInfo (): boolean {
  return Boolean(pluginState.config.imageShowGenerationInfo);
}

function getShowModelInfo (): boolean {
  return Boolean(pluginState.config.imageShowModelInfo);
}

function extractJsonErrorMessage (text: string): string {
  const raw = String(text || '');

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return '';

  try {
    const obj = JSON.parse(jsonMatch[0]) as {
      error?: {
        message?: unknown;
        type?: unknown;
        code?: unknown;
      };
      message?: unknown;
      type?: unknown;
      code?: unknown;
    };

    const message = obj.error?.message ?? obj.message;
    return typeof message === 'string' ? message.trim() : '';
  } catch {
    return '';
  }
}

function cleanUpstreamMessage (text: string): string {
  return String(text || '')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\*\*/g, '')
    .trim();
}

function formatImageError (error: unknown): string {
  const raw = String(error || '').trim();

  if (!raw) {
    return '生成失败，请稍后再试。';
  }

  const lower = raw.toLowerCase();
  const upstreamMessage = cleanUpstreamMessage(extractJsonErrorMessage(raw));

  if (
    lower.includes('content_policy_violation') ||
    lower.includes('safety') ||
    lower.includes('policy') ||
    lower.includes('敏感内容') ||
    lower.includes('无法生成涉') ||
    lower.includes('无法生成')
  ) {
    return '提示词或画面触发上游安全策略，模型拒绝生成。请换成更日常、安全的描述。';
  }

  if (
    lower.includes('全局超时') ||
    lower.includes('请求超时') ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('aborterror')
  ) {
    return '生图请求超时，模型响应太慢或上游拥堵，请稍后重试。';
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('econn') ||
    lower.includes('socket') ||
    lower.includes('network') ||
    lower.includes('und_') ||
    lower.includes('epipe')
  ) {
    return '生图网络请求异常，可能是上游接口或网络不稳定，请稍后重试。';
  }

  if (lower.includes('http 401') || lower.includes('unauthorized')) {
    return '生图接口认证失败，请检查生图渠道 API Key。';
  }

  if (lower.includes('http 403') || lower.includes('forbidden')) {
    return '生图接口无权限访问，请检查 API Key 权限或模型权限。';
  }

  if (lower.includes('http 404') || lower.includes('not found')) {
    return '生图接口或模型不存在，请检查渠道地址和模型名称。';
  }

  if (lower.includes('http 429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return '生图接口请求过于频繁或额度受限，请稍后再试。';
  }

  if (lower.includes('http 5')) {
    return '生图上游服务暂时异常，请稍后重试。';
  }

  if (lower.includes('未生成任何图片')) {
    return '模型没有返回图片，请换个提示词或稍后再试。';
  }

  if (upstreamMessage) {
    const msg = upstreamMessage.slice(0, 120);
    return `上游模型拒绝或未能完成生成：${msg}`;
  }

  return '生图失败，请调整提示词后重试。';
}

function buildFailureText (
  title: string,
  error: unknown,
  elapsedMs?: number
): string {
  const lines = [
    `❌ ${title}: ${formatImageError(error)}`,
  ];

  if (getShowGenerationInfo() && typeof elapsedMs === 'number') {
    lines.push(`📊 耗时: ${formatDuration(elapsedMs)}`);
  }

  return lines.join('\n');
}

function buildSuccessText (
  elapsedMs: number,
  count: number,
  usedModel: string | undefined,
  userId: string,
  unlimited: boolean
): string {
  const showGenerationInfo = getShowGenerationInfo();
  const showModelInfo = getShowModelInfo();

  const lines: string[] = [];

  if (showGenerationInfo) {
    lines.push('✨ 生成成功！');
    lines.push(`📊 耗时: ${formatDuration(elapsedMs)}`);
    lines.push(`🖼️ 数量: ${count}张`);

    if (pluginState.config.imageEnableDailyLimit) {
      if (unlimited) {
        lines.push('📅 今日用量: 白名单/主人不限制');
      } else {
        lines.push(`📅 今日用量: ${imageUsageManager.getTodayUsage(userId)}/${imageUsageManager.getDailyLimit()}`);
      }
    }
  }

  if (showModelInfo && usedModel) {
    lines.push(`🤖 模型: ${usedModel}`);
  }

  return lines.join('\n');
}

function decodeHtmlEntities (text: string): string {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractFirstUrl (text: string): string {
  const decoded = decodeHtmlEntities(text);
  const match = decoded.match(/https?:\/\/\S+/i);
  if (!match) return '';

  return match[0]
    .replace(/[，。！？、；：]+$/g, '')
    .replace(/[)\]}>]+$/g, '')
    .trim();
}

function detectMimeByBytes (data: Uint8Array): string {
  const b = data;
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  return 'image/png';
}

async function fetchImageUrlBytes (url: string): Promise<{ data: Uint8Array; mime_type: string; error?: string; } | null> {
  const realUrl = decodeHtmlEntities(url).trim();
  if (!realUrl) return null;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(realUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://im.qq.com/',
        'Connection': 'close',
      },
    });

    if (!res.ok) {
      return {
        data: new Uint8Array(),
        mime_type: 'image/png',
        error: `HTTP ${res.status}`,
      };
    }

    const bytes = new Uint8Array(await res.arrayBuffer());

    if (!bytes.byteLength) {
      return {
        data: new Uint8Array(),
        mime_type: 'image/png',
        error: '下载到的图片为空',
      };
    }

    const headerMime = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
    const byteMime = detectMimeByBytes(bytes);
    const mime = headerMime.startsWith('image/') ? headerMime : byteMime;

    return {
      data: bytes,
      mime_type: mime,
    };
  } catch (e) {
    return {
      data: new Uint8Array(),
      mime_type: 'image/png',
      error: e instanceof Error && e.name === 'AbortError'
        ? '下载超时'
        : String(e),
    };
  } finally {
    clearTimeout(id);
  }
}

async function getReferenceFromCommandOrEvent (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext
): Promise<{ data: Uint8Array; mime_type: string; error?: string; url?: string; } | null> {
  const refs = await fetchReferenceImagesFromEvent(event, {
    actions: ctx.actions,
    adapterName: ctx.adapterName,
    pluginManager: ctx.pluginManager,
  });

  if (refs.length) return refs[0];

  const url = extractFirstUrl(cmd);
  if (!url) return null;

  const downloaded = await fetchImageUrlBytes(url);
  if (!downloaded) return null;

  return {
    ...downloaded,
    url,
  };
}

async function sendPersonaStatus (
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<void> {
  await imagePersonaManager.ensureDailySelfieProfile('查看今日自拍设定');

  const filePath = imagePersonaManager.getReferencePath();
  const statusText = imagePersonaManager.statusText();

  if (!filePath) {
    await sendReply(event, statusText, ctx);
    return;
  }

  if (!ctx.actions) {
    await sendReply(event, statusText, ctx);
    return;
  }

  const message = [
    filePathToMessageImage(filePath),
    { type: 'text', data: { text: statusText } },
  ];

  const params = event.message_type === 'group'
    ? { group_id: String(event.group_id), message }
    : { user_id: String(event.user_id), message };

  await ctx.actions.call(
    event.message_type === 'group' ? 'send_group_msg' : 'send_private_msg',
    params as never,
    ctx.adapterName,
    ctx.pluginManager.config
  ).catch(async () => {
    await sendReply(event, statusText, ctx);
  });
}

function normalizeImageCommandText (cmd: string): string {
  return String(cmd || '').trim().replace(/\s+/g, ' ');
}

function normalizePersonaNaturalText (text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?]/g, '');
}

function looksLikeReferenceSelfieEditRequest (cmd: string): boolean {
  const compact = normalizePersonaNaturalText(cmd);

  if (!compact) return false;

  /**
   * 只有设置了 AI 固定形象图时，
   * “图2 / 第二张 / 参考图”才明确表示：
   * 图1 = AI 形象图
   * 图2 = 用户引用/发送的额外参考图
   */
  if (!imagePersonaManager.hasReferenceImage()) return false;

  const refTerms = [
    '图2',
    '图二',
    '第二张',
    '第2张',
    '参考图2',
    '参考图二',
    '参考第二张',
    '这张图',
    '这个图',
    '这图',
    '按这个',
    '按这张',
    '照这个',
    '照这张',
    '参考这个',
    '参考这张',
    '像这个',
    '像这张',
  ];

  const editTerms = [
    '衣服',
    '服装',
    '穿搭',
    '穿着',
    '穿这个',
    '穿这身',
    '穿这套',
    '换衣服',
    '换装',
    '换这身',
    '换这套',
    '裙子',
    '造型',
    'cos',
    'cosplay',

    '姿势',
    '动作',
    'pose',
    '表情',
    '站姿',
    '坐姿',
    '角度',
    '构图',
    '镜头',

    '腿',
    '脚',
    '手',
    '身体',
    '全身',
    '半身',
  ];

  const hasRef = refTerms.some(term => compact.includes(term));
  const hasEdit = editTerms.some(term => compact.includes(term));

  return hasRef && hasEdit;
}

function looksLikeSelfieGroupPhotoRequest (cmd: string): boolean {
  const compact = normalizePersonaNaturalText(cmd);

  if (!compact) return false;

  /**
   * 这些表达通常是在要求 AI 自己和某人/某角色合影：
   * - 和菲比合影一张
   * - 跟鸣潮菲比合照
   * - 与某某同框
   * - 一起拍一张
   */
  const groupPhotoTerms = [
    '合影',
    '合照',
    '同框',
    '一起拍',
    '一起照',
    '拍一张合影',
    '拍张合影',
    '双人照',
    '双人合照',
  ];

  const relationTerms = [
    '和',
    '跟',
    '与',
    '同',
  ];

  const hasGroupPhoto = groupPhotoTerms.some(term => compact.includes(term));
  if (!hasGroupPhoto) return false;

  /**
   * 如果用户只说“合影一张”，也可以理解为和 AI 自己合影。
   */
  if (compact === '合影' || compact === '合照' || compact === '同框') {
    return true;
  }

  /**
   * “和xxx合影 / 跟xxx合照 / 与xxx同框”
   */
  const hasRelation = relationTerms.some(term => compact.includes(term));

  if (hasRelation) return true;

  /**
   * 例如：
   * 鸣潮菲比合影一张
   * 菲比同框
   */
  if (compact.includes('一张') || compact.includes('照片') || compact.includes('拍')) {
    return true;
  }

  return false;
}

function looksLikeNaturalSelfieRequest (cmd: string): boolean {
  const compact = normalizePersonaNaturalText(cmd);
  if (!compact) return false;

  const botName = String(pluginState.config.botName || '').trim().toLowerCase();
  const botTerms = ['你', '你的', '你自己', '你本人', '本体', '机器人', '助手', '看板娘'];
  if (botName) botTerms.push(botName);

  const directPhrases = [
    '看看你',
    '看下你',
    '看一下你',
    '让我看看你',
    '我想看你',
    '给我看看你',
    '给我看你',
    '发张你的照片',
    '发你的照片',
    '来张你的照片',
    '来张你照片',
    '你长什么样',
    '你长啥样',
    '看看你的样子',
    '看下你的样子',
    '你的样子',
    '你的自拍',
    '你的照片',
    '你本人照片',
    '你本人长什么样',
  ];

  if (directPhrases.some(p => compact === p || compact.startsWith(p))) {
    return true;
  }

  const hasBot = botTerms.some(term => compact.includes(term));
  if (!hasBot) return false;

  const photoTerms = [
    '合影',
    '合照',
    '同框',
    '一起拍',
    '一起照',
    '双人照',
    '和我合影',
    '和我合照',
    '自拍',
    '自拍照',
    '照片',
    '相片',
    '写真',
    '露脸',
    '脸',
    '样子',
    '外貌',
    '拍照',
  ];

  const outfitTerms = [
    '穿',
    '穿着',
    '穿上',
    '换',
    '换装',
    '换衣服',
    '衣服',
    '服装',
    '衣装',
    '裙子',
    '制服',
    '穿搭',
    '造型',
    '打扮',
    'cos',
    'cosplay',
    '扮成',
    '角色扮演',
  ];

  const referenceTerms = [
    '长这个',
    '长这样',
    '像这个',
    '像这样',
    '照这个',
    '按这个',
    '按这样',
    '变成这样',
    '照着这个',
    '照着这样',
    '参考这个',
  ];

  const requestTerms = [
    '看看',
    '看下',
    '看一下',
    '想看',
    '给我看',
    '让我看',
    '发张',
    '来张',
  ];

  if (photoTerms.some(term => compact.includes(term))) return true;
  if (outfitTerms.some(term => compact.includes(term))) return true;
  if (referenceTerms.some(term => compact.includes(term))) return true;

  if (requestTerms.some(term => compact.includes(term))) {
    if (compact.includes('你')) return true;
  }

  return false;
}

function buildNaturalSelfieAction (cmd: string): string {
  const compact = normalizePersonaNaturalText(cmd);

  if (looksLikeReferenceSelfieEditRequest(cmd)) {
    return [
      `根据用户要求自拍：${String(cmd || '').trim()}。`,
      '用户提到的“图2 / 第二张 / 参考图 / 这张图”指用户引用或发送的额外参考图。',
      '参考图一是 AI 自己的固定形象图，必须保持同一个人、同一张脸、同一身份。',
      '用户引用或发送的额外参考图只用于衣服、穿搭、姿势、动作、构图、镜头角度或风格参考。',
      '不要把额外参考图中的人物身份替换成 AI 自己。',
      '不要询问用户图2是否存在，当前引用图就是额外参考图。',
    ].join('\n');
  }

  if (looksLikeSelfieGroupPhotoRequest(cmd)) {
    return [
      `根据用户要求生成合影自拍：${String(cmd || '').trim()}。`,
      '这是 AI 自己和用户指定角色/人物的合照或同框照片。',
      'AI 自己必须作为画面主角之一出现。',
      '如果已经设置 AI 固定形象参考图，参考图一是 AI 自己的身份参考图，必须保持同一个人、同一张脸、同一发型气质。',
      '用户指定的角色或人物作为同框对象出现，不要把对方替换成 AI 自己。',
      '画面应像真实拍下的一张自然合影，不要拼图，不要分镜，不要多视角，不要角色设定图。',
      '如果用户指定的是游戏/动漫角色，请生成符合其常见形象特征的同框对象，但整体画面保持自然、统一。',
    ].join('\n');
  }
  
  if (
    compact === '看看你' ||
    compact === '看下你' ||
    compact === '看一下你' ||
    compact === '让我看看你' ||
    compact === '我想看你' ||
    compact === '给我看看你' ||
    compact === '给我看你' ||
    compact === '你长什么样' ||
    compact === '你长啥样' ||
    compact === '你的样子' ||
    compact === '看看你的样子'
  ) {
    return '看着镜头自然自拍，展示你现在的样子，真实、自然、好看';
  }

  if (
    compact.includes('长这个') ||
    compact.includes('长这样') ||
    compact.includes('像这个') ||
    compact.includes('像这样') ||
    compact.includes('照这个') ||
    compact.includes('按这个') ||
    compact.includes('变成这样') ||
    compact.includes('参考这个')
  ) {
    return '参考用户提供的图片风格、造型、穿搭或氛围，但保持你自己的身份、脸和核心形象，看着镜头自然自拍';
  }

  if (
    compact.includes('穿') ||
    compact.includes('换装') ||
    compact.includes('换衣服') ||
    compact.includes('衣服') ||
    compact.includes('服装') ||
    compact.includes('裙子') ||
    compact.includes('制服') ||
    compact.includes('穿搭') ||
    compact.includes('造型') ||
    compact.includes('cos') ||
    compact.includes('cosplay')
  ) {
    return `根据这个要求自拍：${String(cmd || '').trim()}。如果有参考图，就参考其服装/造型/风格，但保持你自己的身份与脸。`;
  }

  if (
    compact.includes('合照') ||
    compact.includes('合影') ||
    compact.includes('同框') ||
    compact.includes('一起拍') ||
    compact.includes('一起照')
  ) {
    return `根据这个要求生成合照：${String(cmd || '').trim()}。你必须是合照主角之一。`;
  }

  if (
    compact.includes('照片') ||
    compact.includes('自拍') ||
    compact.includes('写真') ||
    compact.includes('露脸') ||
    compact.includes('拍照')
  ) {
    return `根据这个要求自拍：${String(cmd || '').trim()}`;
  }

  return '看着镜头自然自拍，表情自然，像今天真实拍下的一张照片';
}

function isPresetShortcutCommand (cmd: string): boolean {
  const text = normalizeImageCommandText(cmd);
  if (!text) return false;

  const resolved = imagePresetManager.resolve(text);
  return Boolean(resolved.presetName);
}

function isImageCommand (cmd: string): boolean {
  const text = normalizeImageCommandText(cmd);

  return (
    text === '预设' ||
    text.startsWith('预设 ') ||
    text === '生图模型' ||
    text.startsWith('生图 ') ||
    isPresetShortcutCommand(text) ||
    text === '自拍' ||
    text.startsWith('自拍 ') ||
    looksLikeNaturalSelfieRequest(text) ||
    looksLikeReferenceSelfieEditRequest(text) ||
    looksLikeSelfieGroupPhotoRequest(text) ||
    text === '形象查看' ||
    text === '形象刷新' ||
    text === '形象设置' ||
    text.startsWith('形象设置 ') ||
    text === '形象清除'
  );
}

async function handlePresetCommands (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const text = normalizeImageCommandText(cmd);

  const pageMatch = text.match(/^预设(?:\s+(\d+))?$/);

  if (pageMatch) {
    const presets = imagePresetManager.list();

    if (!presets.length) {
      await sendReply(event, '📋 当前没有生图预设喵～', ctx);
      return true;
    }

    const prefix = pluginState.config.prefix || '/';
    const pageSize = 20;
    const totalPages = Math.max(1, Math.ceil(presets.length / pageSize));

    const rawPage = Number(pageMatch[1] || 1);
    const page = Math.min(
      totalPages,
      Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1)
    );

    const start = (page - 1) * pageSize;
    const pageItems = presets.slice(start, start + pageSize);

    const sections: { title: string; content: string; }[] = [];

    sections.push({
      title: `📋 生图预设说明 第 ${page}/${totalPages} 页`,
      content: [
        `当前共有 ${presets.length} 个生图预设。`,
        `当前显示第 ${page} 页，每页 ${pageSize} 个。`,
        '',
        '使用方式：',
        `1. ${prefix} 生图 预设名`,
        `2. ${prefix} 预设名`,
        `3. 引用图片后发送：${prefix} 预设名`,
        '4. 开启艾特触发后：引用图片 @机器人 预设名',
        '',
        totalPages > 1 ? '翻页方式：' : '',
        totalPages > 1 && page < totalPages ? `下一页：${prefix} 预设 ${page + 1}` : '',
        totalPages > 1 && page > 1 ? `上一页：${prefix} 预设 ${page - 1}` : '',
      ].filter(Boolean).join('\n'),
    });

    for (const [idx, p] of pageItems.entries()) {
      const index = start + idx + 1;
      const desc = String(p.data.description || p.data.prompt || '').trim();
      const aspect = p.data.aspect_ratio ? `比例: ${p.data.aspect_ratio}` : '';
      const resolution = p.data.resolution ? `分辨率: ${p.data.resolution}` : '';
      const params = [aspect, resolution].filter(Boolean).join(' | ');

      sections.push({
        title: `📌 ${index}. ${p.name}`,
        content: [
          `预设名: ${p.name}`,
          '',
          desc ? `说明:\n${desc.slice(0, 300)}${desc.length > 300 ? '...' : ''}` : '',
          params ? `参数: ${params}` : '',
          '',
          '用法:',
          `${prefix} ${p.name}`,
          `${prefix} 生图 ${p.name}`,
          '',
          '图生图用法:',
          `引用图片后发送：${prefix} ${p.name}`,
        ].filter(Boolean).join('\n'),
      });
    }

    await sendForwardMsg(event, sections, ctx);
    return true;
  }

  const addMatch = text.match(/^预设 添加 ([^:：]+)[:：]([\s\S]+)$/);

  if (addMatch) {
    if (!isOwner(String(event.user_id))) {
      await sendReply(event, '❌ 只有核心主人可以添加预设喵～', ctx);
      return true;
    }

    const res = imagePresetManager.add(addMatch[1], addMatch[2]);
    await sendReply(event, `${res.success ? '✅' : '❌'} ${res.message}`, ctx);
    return true;
  }

  const delMatch = text.match(/^预设 删除 ([\s\S]+)$/);

  if (delMatch) {
    if (!isOwner(String(event.user_id))) {
      await sendReply(event, '❌ 只有核心主人可以删除预设喵～', ctx);
      return true;
    }

    const res = imagePresetManager.remove(delMatch[1]);
    await sendReply(event, `${res.success ? '✅' : '❌'} ${res.message}`, ctx);
    return true;
  }

  return false;
}

async function handlePersonaCommands (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const owner = isOwner(String(event.user_id));
  const text = normalizeImageCommandText(cmd);

  if (text === '形象查看') {
    await sendPersonaStatus(event, ctx);
    return true;
  }

  if (text === '形象刷新') {
    if (!owner) {
      await sendReply(event, '❌ 只有核心主人可以刷新今日自拍设定喵～', ctx);
      return true;
    }

    imagePersonaManager.refreshDailySelfieProfileForTest();
    await imagePersonaManager.ensureDailySelfieProfile('手动刷新今日自拍设定');
    await sendReply(event, imagePersonaManager.statusText(), ctx);
    return true;
  }

  if (!(text === '形象设置' || text.startsWith('形象设置 ') || text === '形象清除')) {
    return false;
  }

  if (!owner) {
    await sendReply(event, '❌ 只有核心主人可以修改 AI 形象喵～', ctx);
    return true;
  }

  if (text === '形象清除') {
    imagePersonaManager.clearReferenceImage();
    await sendReply(event, '✅ 已清除 AI 形象参考图喵～', ctx);
    return true;
  }

  const ref = await getReferenceFromCommandOrEvent(event, text, ctx);

  if (!ref) {
    await sendReply(
      event,
      [
        '❌ 没有检测到可用图片。',
        '',
        '用法：',
        '1. 发送图片并配文：形象设置',
        '2. 引用图片发送：形象设置',
        '3. 使用链接：形象设置 https://xxx/image.png',
      ].join('\n'),
      ctx
    );
    return true;
  }

  if (ref.error || !ref.data.byteLength) {
    await sendReply(
      event,
      [
        '❌ 图片链接下载失败，无法设置 AI 形象。',
        ref.url ? `链接: ${ref.url}` : '',
        `原因: ${ref.error || '未知错误'}`,
      ].filter(Boolean).join('\n'),
      ctx
    );
    return true;
  }

  imagePersonaManager.saveReferenceImage(ref.data, ref.mime_type);
  await sendReply(event, '✅ 已保存为 AI 形象参考图喵～', ctx);
  return true;
}

async function runSelfieCommand (
  event: OB11Message,
  action: string,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const userId = String(event.user_id);
  const owner = isOwner(userId);
  const whitelist = isWhitelisted(userId);
  const unlimited = owner || whitelist;

  const check = imageUsageManager.check(userId);

  if (typeof check === 'string') {
    if (check) await sendReply(event, check, ctx);
    return true;
  }

  const normalizedAction = String(action || '').trim() || '看着镜头自然自拍，展示你现在的样子';

  await imagePersonaManager.ensureDailySelfieProfile(normalizedAction);

  const personaRef = imagePersonaManager.getReferenceImage();

  const extraRefs = await fetchReferenceImagesFromEvent(event, {
    actions: ctx.actions,
    adapterName: ctx.adapterName,
    pluginManager: ctx.pluginManager,
  });

  /**
   * 自拍参考图顺序：
   * 1. AI 固定形象图，如果存在，永远放第一位，作为主体身份参考。
   * 2. 用户引用图 / 当前图 / @头像，放后面，只作为衣服、姿势、构图、风格、合照对象等辅助参考。
   *
   * 如果没有形象图，就不传主体图，buildSelfiePrompt 会改用人格 + 今日设定做主角。
   */
  const refs = [
    ...(personaRef ? [personaRef] : []),
    ...extraRefs,
  ];

  const prompt = imagePersonaManager.buildSelfiePrompt(normalizedAction, {
    has_reference_image: Boolean(personaRef),
    extra_reference_count: extraRefs.length,
  });

  const promptAudit = await imageSafetyAuditor.auditPrompt(prompt, userId);

  if (!promptAudit.allow) {
    await sendReply(event, `❌ 提示词审核未通过: ${promptAudit.reason}`, ctx);
    return true;
  }

  const targets = getPrioritizedImageTargets();

  if (!targets.length) {
    await sendReply(event, '❌ 当前没有可用的生图模型喵～', ctx);
    return true;
  }

  const queueInfo = imageTaskQueue.getSnapshot();

  if (queueInfo.running >= queueInfo.maxConcurrent) {
    await sendReply(
      event,
      `⏳ 当前生图任务较多，自拍已进入队列喵～\n排队序号: ${queueInfo.pending + 1}\n并发上限: ${queueInfo.maxConcurrent}\n全局超时: ${getGlobalTimeoutText()}`,
      ctx
    );
  } else {
    await sendReply(
      event,
      [
        '📸 正在生成自拍喵～',
        `全局超时: ${getGlobalTimeoutText()}`,
        personaRef ? '' : '⚠️ 当前还没有设置 AI 形象参考图，会按人设与今日设定生成主角。',
        extraRefs.length ? `🧩 已检测到 ${extraRefs.length} 张额外参考图` : '',
      ].filter(Boolean).join('\n'),
      ctx
    );
  }

  const startAt = Date.now();

  let result: Awaited<ReturnType<typeof generateImageWithFallback>>;

  try {
    result = await imageTaskQueue.submit(async () => {
      return await generateImageWithFallback(targets, {
        prompt,
        aspect_ratio: pluginState.config.imageDefaultAspectRatio,
        resolution: pluginState.config.imageDefaultResolution,
        images: refs.length ? refs : undefined,
      });
    });
  } catch (e) {
    const elapsedMs = Date.now() - startAt;
    await sendReply(event, buildFailureText('自拍生成异常', e, elapsedMs), ctx);
    return true;
  }

  const elapsedMs = Date.now() - startAt;

  if (result.error || !result.images?.length) {
    modelMonitorManager.recordImage({
      source: event.message_type === 'group' ? 'group-selfie' : 'private-selfie',
      requested_model: targets.map(t => `${t.channelName}/${t.model}`).join(', '),
      used_model: result.usedModel,
      prompt,
      aspect_ratio: pluginState.config.imageDefaultAspectRatio,
      resolution: pluginState.config.imageDefaultResolution,
      success: false,
      error: result.error || '未知错误',
      elapsed_ms: elapsedMs,
      input_images: refs,
    });

    await sendReply(event, buildFailureText('自拍生成失败', result.error || '未知错误', elapsedMs), ctx);
    return true;
  }

  const saved = result.images
    .map(img => imageCacheManager.saveGeneratedImage(`selfie_${Date.now()}`, img))
    .filter(Boolean) as string[];

  modelMonitorManager.recordImage({
    source: event.message_type === 'group' ? 'group-selfie' : 'private-selfie',
    requested_model: targets.map(t => `${t.channelName}/${t.model}`).join(', '),
    used_model: result.usedModel,
    prompt,
    aspect_ratio: pluginState.config.imageDefaultAspectRatio,
    resolution: pluginState.config.imageDefaultResolution,
    success: true,
    elapsed_ms: elapsedMs,
    input_images: refs,
    output_images: saved,
  });

  if (!saved.length) {
    await sendReply(event, buildFailureText('自拍发送失败', '图片生成成功，但保存失败', elapsedMs), ctx);
    return true;
  }

  const outputAudit = await imageSafetyAuditor.auditOutputImages(saved, userId, prompt);

  if (!outputAudit.allow) {
    await sendReply(event, `❌ 自拍内容审核未通过: ${outputAudit.reason}`, ctx);
    return true;
  }

  imageUsageManager.record(userId);

  if (!ctx.actions) {
    await sendReply(event, '❌ actions未初始化，无法发送图片', ctx);
    return true;
  }

  const message = [
    ...saved.map(filePathToMessageImage),
  ];

  const successText = buildSuccessText(elapsedMs, saved.length, result.usedModel, userId, unlimited);

  if (successText) {
    message.push({
      type: 'text',
      data: {
        text: successText,
      },
    } as never);
  }

  const params = event.message_type === 'group'
    ? {
        group_id: String(event.group_id),
        message,
      }
    : {
        user_id: String(event.user_id),
        message,
      };

  await ctx.actions.call(
    event.message_type === 'group' ? 'send_group_msg' : 'send_private_msg',
    params as never,
    ctx.adapterName,
    ctx.pluginManager.config
  ).catch(async () => {
    await sendReply(event, successText || '自拍生成成功，但发送图片失败喵～', ctx);
  });

  return true;
}

async function handleSelfieCommands (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const text = normalizeImageCommandText(cmd);
  const selfie = text.match(/^自拍(?: ([\s\S]+))?$/);

  if (selfie) {
    return await runSelfieCommand(event, selfie[1] || '', ctx);
  }

  if (
    looksLikeNaturalSelfieRequest(text) ||
    looksLikeReferenceSelfieEditRequest(text) ||
    looksLikeSelfieGroupPhotoRequest(text)
  ) {
    return await runSelfieCommand(event, buildNaturalSelfieAction(text), ctx);
  }

  return false;
}

async function handleImageModelCommand (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const text = normalizeImageCommandText(cmd);
  if (text !== '生图模型') return false;

  const models = getAllEnabledImageModels();

  if (!models.length) {
    await sendReply(event, '❌ 当前没有启用的生图模型喵～', ctx);
    return true;
  }

  const lines = ['🎨 已启用生图模型优先级列表', ''];
  models.forEach((m, i) => lines.push(`${i + 1}. ${m}`));

  await sendReply(event, lines.join('\n'), ctx);
  return true;
}

async function handleGenerateImageCommand (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const text = normalizeImageCommandText(cmd);
  const match = text.match(/^生图 ([\s\S]+)$/);

  let rawPrompt = '';

  if (match) {
    rawPrompt = match[1].trim();
  } else {
    const shortcutResolved = imagePresetManager.resolve(text);

    if (!shortcutResolved.presetName) {
      return false;
    }

    rawPrompt = text;
  }

  const userId = String(event.user_id);
  const owner = isOwner(userId);
  const whitelist = isWhitelisted(userId);
  const unlimited = owner || whitelist;

  const check = imageUsageManager.check(userId);
  if (typeof check === 'string') {
    if (check) await sendReply(event, check, ctx);
    return true;
  }

  if (!rawPrompt) {
    await sendReply(event, '❌ 请提供生图提示词喵～', ctx);
    return true;
  }

  const resolved = imagePresetManager.resolve(rawPrompt);
  const originalPrompt = resolved.prompt;

  if (!originalPrompt) {
    await sendReply(event, '❌ 预设或提示词无效喵～', ctx);
    return true;
  }

  const originalPromptAudit = await imageSafetyAuditor.auditPrompt(originalPrompt, userId);
  if (!originalPromptAudit.allow) {
    await sendReply(event, `❌ 提示词审核未通过: ${originalPromptAudit.reason}`, ctx);
    return true;
  }

  const targets = getPrioritizedImageTargets();
  if (!targets.length) {
    await sendReply(event, '❌ 当前没有可用的生图模型喵～', ctx);
    return true;
  }

  // 通用参考图优先级：引用图 > 当前消息图片 > @用户头像
  const refs = await fetchReferenceImagesFromEvent(event, {
    actions: ctx.actions,
    adapterName: ctx.adapterName,
    pluginManager: ctx.pluginManager,
  });

  const aspectRatio = resolved.aspect_ratio || pluginState.config.imageDefaultAspectRatio;
  const resolution = resolved.resolution || pluginState.config.imageDefaultResolution;
  const queueInfo = imageTaskQueue.getSnapshot();

  if (queueInfo.running >= queueInfo.maxConcurrent) {
    await sendReply(
      event,
      [
        '⏳ 当前生图任务较多，已进入队列喵～',
        `排队序号: ${queueInfo.pending + 1}`,
        `并发上限: ${queueInfo.maxConcurrent}`,
      ].join('\n'),
      ctx
    );
  } else {
    await sendReply(
      event,
      [
        `🎨 开始${refs.length ? `图生图(${refs.length}张参考图)` : '生图'}喵，请稍等～`,
        resolved.presetName ? `📌 预设: ${resolved.presetName}` : '',
      ].filter(Boolean).join('\n'),
      ctx
    );
  }

  const optimized = await optimizeImagePrompt(originalPrompt, aspectRatio, resolution);
  const prompt = optimized.prompt;

  if (optimized.optimized) {
    const optimizedPromptAudit = await imageSafetyAuditor.auditPrompt(prompt, userId);
    if (!optimizedPromptAudit.allow) {
      await sendReply(event, `❌ 优化后提示词审核未通过: ${optimizedPromptAudit.reason}`, ctx);
      return true;
    }
  }

  const startAt = Date.now();

  let result: Awaited<ReturnType<typeof generateImageWithFallback>>;

  try {
    result = await imageTaskQueue.submit(async () => {
      return await generateImageWithFallback(targets, {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        images: refs.length ? refs : undefined,
      });
    });
  } catch (e) {
    const elapsedMs = Date.now() - startAt;
    await sendReply(event, buildFailureText('生图异常', e, elapsedMs), ctx);
    return true;
  }

  const elapsedMs = Date.now() - startAt;

  if (result.error || !result.images?.length) {
    modelMonitorManager.recordImage({
      source: event.message_type === 'group' ? 'group-command' : 'private-command',
      requested_model: targets.map(t => `${t.channelName}/${t.model}`).join(', '),
      used_model: result.usedModel,
      prompt,
      aspect_ratio: aspectRatio,
      resolution,
      success: false,
      error: result.error || '未知错误',
      elapsed_ms: elapsedMs,
      input_images: refs,
    });

    await sendReply(event, buildFailureText('生图失败', result.error || '未知错误', elapsedMs), ctx);
    return true;
  }

  const saved = result.images
    .map(img => imageCacheManager.saveGeneratedImage(`img_${Date.now()}`, img))
    .filter(Boolean) as string[];

  modelMonitorManager.recordImage({
    source: event.message_type === 'group' ? 'group-command' : 'private-command',
    requested_model: targets.map(t => `${t.channelName}/${t.model}`).join(', '),
    used_model: result.usedModel,
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    success: true,
    elapsed_ms: elapsedMs,
    input_images: refs,
    output_images: saved,
  });

  if (!saved.length) {
    await sendReply(event, buildFailureText('图片发送失败', '图片生成成功，但保存失败', elapsedMs), ctx);
    return true;
  }

  const outputAudit = await imageSafetyAuditor.auditOutputImages(saved, userId, prompt);
  if (!outputAudit.allow) {
    await sendReply(event, `❌ 图片内容审核未通过: ${outputAudit.reason}`, ctx);
    return true;
  }

  imageUsageManager.record(userId);

  if (!ctx.actions) {
    await sendReply(event, '❌ actions未初始化，无法发送图片', ctx);
    return true;
  }

  const successText = buildSuccessText(elapsedMs, saved.length, result.usedModel, userId, unlimited);

  const message = [
    ...saved.map(filePathToMessageImage),
    ...(successText ? [{ type: 'text', data: { text: successText } }] : []),
  ];

  const params = event.message_type === 'group'
    ? { group_id: String(event.group_id), message }
    : { user_id: String(event.user_id), message };

  await ctx.actions.call(
    event.message_type === 'group' ? 'send_group_msg' : 'send_private_msg',
    params as never,
    ctx.adapterName,
    ctx.pluginManager.config
  ).catch(async () => {
    await sendReply(
      event,
      successText || '图片生成成功，但发送图片失败喵～',
      ctx
    );
  });

  return true;
}

export async function handleImageCommand (
  event: OB11Message,
  cmd: string,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const text = normalizeImageCommandText(cmd);
  if (!text) return false;
  if (!isImageCommand(text)) return false;

  if (await handlePresetCommands(event, text, ctx)) return true;
  if (await handlePersonaCommands(event, text, ctx)) return true;
  if (await handleSelfieCommands(event, text, ctx)) return true;
  if (await handleImageModelCommand(event, text, ctx)) return true;
  if (await handleGenerateImageCommand(event, text, ctx)) return true;

  return false;
}