import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message, OB11PostSendMsg } from 'napcat-types/napcat-onebot/types/index';
import { pluginState } from '../core/state';

const recentMsgs = new Map<string, number>();
const DEDUP_TTL = 3000;
const CLEANUP_INTERVAL = 30000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startMessageCleanup (): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, t] of recentMsgs) {
      if (now - t > DEDUP_TTL) recentMsgs.delete(k);
    }
  }, CLEANUP_INTERVAL);
}

export function stopMessageCleanup (): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  recentMsgs.clear();
}

export async function sendReply (event: OB11Message, content: string, ctx: NapCatPluginContext): Promise<void> {
  if (!ctx.actions) return;

  const meta = event as OB11Message & {
    __aicat_reply_to_message_id?: string;
    __aicat_at_user_id?: string;
  };

  const replyTo = meta.__aicat_reply_to_message_id ? String(meta.__aicat_reply_to_message_id) : '';
  const atUser = meta.__aicat_at_user_id ? String(meta.__aicat_at_user_id) : '';

  const key = `${event.group_id || event.user_id}:${replyTo}:${atUser}:${content.slice(0, 100)}`;
  if (recentMsgs.has(key) && Date.now() - recentMsgs.get(key)! < DEDUP_TTL) return;
  recentMsgs.set(key, Date.now());

  let message: unknown = content;

  if (replyTo || atUser) {
    const segments: unknown[] = [];

    if (replyTo) {
      segments.push({ type: 'reply', data: { id: replyTo } });
    }

    if (atUser && event.message_type === 'group') {
      segments.push({ type: 'at', data: { qq: atUser } });
      segments.push({ type: 'text', data: { text: ' ' } });
    }

    segments.push({ type: 'text', data: { text: content } });
    message = segments;
  }

  const params: OB11PostSendMsg = {
    message: message as never,
    message_type: event.message_type,
    ...(event.message_type === 'group'
      ? { group_id: String(event.group_id) }
      : { user_id: String(event.user_id) }),
  };

  await ctx.actions.call('send_msg', params, ctx.adapterName, ctx.pluginManager.config).catch(() => {});
}

function createTextNode (text: string, nickname?: string): unknown {
  return {
    type: 'node',
    data: {
      user_id: 66600000,
      nickname: nickname || pluginState.config.botName || 'AI Cat',
      content: [{ type: 'text', data: { text } }],
    },
  };
}

function buildForwardCall (event: OB11Message, messages: unknown[]): { action: string; param: Record<string, unknown> } {
  const isGroup = !!event.group_id;
  return {
    action: isGroup ? 'send_group_forward_msg' : 'send_private_forward_msg',
    param: isGroup
      ? { group_id: String(event.group_id), messages }
      : { user_id: String(event.user_id), messages },
  };
}

async function callForward (
  event: OB11Message,
  messages: unknown[],
  ctx: NapCatPluginContext,
  fallback?: () => Promise<void>
): Promise<void> {
  if (!ctx.actions) return;
  const { action, param } = buildForwardCall(event, messages);
  await ctx.actions.call(action, param as never, ctx.adapterName, ctx.pluginManager.config).catch(() => fallback?.());
}

function needsForwardMessage (content: string): boolean {
  return content.length > 400 || content.split('\n').length > 25;
}

export async function sendLongMessage (
  event: OB11Message,
  content: string,
  ctx: NapCatPluginContext,
  forceForward = false
): Promise<void> {
  if (!forceForward && !needsForwardMessage(content)) {
    await sendReply(event, content, ctx);
    return;
  }

  const nodes = splitTextToChunks(content, 600).map(c => createTextNode(c));
  await callForward(event, nodes, ctx, () => sendReply(event, content, ctx));
}

export async function sendNestedForward (
  event: OB11Message,
  title: string,
  sections: { title: string; content: string; }[],
  ctx: NapCatPluginContext
): Promise<void> {
  const innerNodes = sections.map(s => createTextNode(s.content, s.title));
  const outerNode = {
    type: 'node',
    data: {
      user_id: 66600000,
      nickname: title || pluginState.config.botName || 'AI Cat',
      content: innerNodes,
    },
  };
  await callForward(event, [outerNode], ctx);
}

export async function sendForwardMsg (
  event: OB11Message,
  sections: { title: string; content: string; }[],
  ctx: NapCatPluginContext
): Promise<void> {
  await callForward(event, sections.map(s => createTextNode(s.content, s.title)), ctx);
}

export function splitTextToChunks (content: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const lines = content.split('\n');
  let cur = '';

  for (const l of lines) {
    if (cur.length + l.length + 1 > maxLen) {
      if (cur) chunks.push(cur.trim());
      cur = l;
    } else {
      cur += (cur ? '\n' : '') + l;
    }
  }

  if (cur) chunks.push(cur.trim());
  return chunks;
}

function stripNonTextCqCodes (raw: string): string {
  return raw
    .replace(/\[CQ:reply,id=(-?\d+)\]/g, '')
    .replace(/\[CQ:at,qq=\d+\]/g, '')
    .replace(/\[CQ:image,[^\]]*\]/g, '')
    .replace(/\[CQ:record,[^\]]*\]/g, '')
    .replace(/\[CQ:video,[^\]]*\]/g, '')
    .replace(/\[CQ:file,[^\]]*\]/g, '')
    .replace(/\[CQ:json,[^\]]*\]/g, '')
    .replace(/\[CQ:xml,[^\]]*\]/g, '')
    .trim();
}

export function processMessageContent (raw: string): { content: string; replyMessageId?: string; } {
  const match = raw.match(/\[CQ:reply,id=(-?\d+)\]/);
  return {
    content: stripNonTextCqCodes(raw),
    replyMessageId: match?.[1],
  };
}

export function extractAtUsers (message: unknown, selfId?: string): string[] {
  if (!Array.isArray(message)) return [];
  return message
    .filter((s: { type?: string; data?: { qq?: string | number; }; }) =>
      s.type === 'at' &&
      s.data?.qq &&
      s.data.qq !== 'all' &&
      (!selfId || String(s.data.qq) !== selfId))
    .map((s: { data?: { qq?: string | number; }; }) => String(s.data?.qq));
}
