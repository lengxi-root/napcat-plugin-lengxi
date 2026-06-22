import { pluginState } from '../core/state';

const DANGEROUS_CQ_TYPES = new Set(['image', 'record', 'video', 'flash']);

const CQ_CODE_REGEX = /\[CQ:(\w+)(?:,[^\]]+)?\]/g;

const ONEBOT_SEGMENT_REGEX = /\{\s*"type"\s*:\s*"(\w+)"\s*,\s*"data"\s*:\s*\{[^}]*\}\s*\}/g;

/**
 * 检查用户输入的指令中是否包含危险内容（CQ码或OneBot消息段）
 * 返回 null 表示安全，返回描述字符串表示检测到的危险内容
 */
export function detectUserInputDanger (instruction: string): string | null {
  for (const match of instruction.matchAll(CQ_CODE_REGEX)) {
    const cqType = match[1];
    if (DANGEROUS_CQ_TYPES.has(cqType)) {
      pluginState.debug(`[安全] 用户指令中检测到危险CQ码: [CQ:${cqType}]`);
      return cqType;
    }
  }

  for (const match of instruction.matchAll(ONEBOT_SEGMENT_REGEX)) {
    const segType = match[1];
    if (DANGEROUS_CQ_TYPES.has(segType)) {
      pluginState.debug(`[安全] 用户指令中检测到危险消息段: {"type":"${segType}"}`);
      return segType;
    }
  }

  return null;
}

/**
 * 清理用户指令中的危险CQ码和OneBot消息段，替换为安全文本
 * 保留at、reply、face等安全类型
 */
export function sanitizeUserInput (instruction: string): string {
  let result = instruction;

  result = result.replace(CQ_CODE_REGEX, (match, type) => {
    if (DANGEROUS_CQ_TYPES.has(type)) {
      return `[已过滤的${TYPE_LABELS[type] || type}]`;
    }
    return match;
  });

  result = result.replace(ONEBOT_SEGMENT_REGEX, (match, type) => {
    if (DANGEROUS_CQ_TYPES.has(type)) {
      return `[已过滤的${TYPE_LABELS[type] || type}]`;
    }
    return match;
  });

  return result;
}

const TYPE_LABELS: Record<string, string> = {
  image: '图片', record: '语音', video: '视频', flash: '闪照',
};

/**
 * 清理AI直接回复文本中的危险CQ码（非主人用户）
 * 防止用户通过prompt注入让AI在纯文本回复中输出可执行的CQ码
 */
export function sanitizeReplyText (text: string): string {
  return text.replace(CQ_CODE_REGEX, (match, type) => {
    if (DANGEROUS_CQ_TYPES.has(type)) {
      return `[${TYPE_LABELS[type] || type}已过滤]`;
    }
    return match;
  });
}


/**
 * 检查消息段数组/字符串中是否包含危险媒体类型
 */
function containsDangerousSegment (message: unknown): string | null {
  if (typeof message === 'string') {
    for (const match of message.matchAll(CQ_CODE_REGEX)) {
      if (DANGEROUS_CQ_TYPES.has(match[1])) return match[1];
    }
    return null;
  }
  if (!Array.isArray(message)) return null;

  for (const seg of message) {
    const s = seg as { type?: string; data?: Record<string, unknown>; };
    if (s.type && DANGEROUS_CQ_TYPES.has(s.type)) return s.type;
    if (s.type === 'text' && typeof s.data?.text === 'string') {
      for (const match of s.data.text.matchAll(CQ_CODE_REGEX)) {
        if (DANGEROUS_CQ_TYPES.has(match[1])) return match[1];
      }
    }
  }
  return null;
}

/**
 * 检查合并转发消息中是否包含危险内容（递归）
 */
function containsDangerousForwardContent (messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (const node of messages) {
    const n = node as { type?: string; data?: { content?: unknown; }; };
    if (n.type === 'node' && n.data?.content) {
      const found = containsDangerousSegment(n.data.content);
      if (found) return found;
      if (Array.isArray(n.data.content) &&
        (n.data.content as unknown[]).some((i: unknown) => (i as { type?: string; }).type === 'node')) {
        const nested = containsDangerousForwardContent(n.data.content);
        if (nested) return nested;
      }
    }
  }
  return null;
}

const SEND_MESSAGE_APIS = new Set([
  'send_msg', 'send_group_msg', 'send_private_msg',
  'send_group_forward_msg', 'send_private_forward_msg',
]);

/**
 * 检查 call_api 发送的消息是否包含危险媒体内容
 * 返回 null 表示安全，返回字符串表示被拦截的媒体类型
 */
export function checkMessageSafety (action: string, params: Record<string, unknown>): string | null {
  if (!SEND_MESSAGE_APIS.has(action)) return null;

  if (action.includes('forward_msg') && params.messages) {
    const found = containsDangerousForwardContent(params.messages);
    if (found) { pluginState.debug(`[安全] 拦截合并转发中的危险内容: ${found}`); return found; }
    return null;
  }

  const message = params.message;
  if (!message) return null;
  const found = containsDangerousSegment(message);
  if (found) { pluginState.debug(`[安全] 拦截消息中的危险内容: ${found}`); return found; }
  return null;
}

/**
 * 获取拦截提示消息
 */
export function getSafetyBlockMessage (dangerousType: string): string {
  const label = TYPE_LABELS[dangerousType] || dangerousType;
  return `安全限制：普通用户不能让机器人发送${label}内容喵～如需此功能请联系主人`;
}
