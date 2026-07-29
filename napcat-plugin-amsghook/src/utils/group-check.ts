// 官方机器人在群检测（带缓存）
import { state } from '../core/state';
import { addLog } from '../core/logger';

interface BotInGroupCacheEntry { inGroup: boolean; timestamp: number; }

export const botInGroupCache = new Map<string, BotInGroupCacheEntry>();
export const BOT_IN_GROUP_TTL = 1800000; // 在群缓存 30 分钟
export const BOT_NOT_IN_GROUP_TTL = 300000; // 不在群缓存 5 分钟

/** 检查官方机器人是否在指定群内（结果缓存，不在群时短缓存以便入群后尽快生效） */
export async function isOfficialBotInGroup (groupId: string, adapter: string, netConfig: any): Promise<boolean> {
  const botQQ = state.config.qqbot?.qqNumber;
  if (!botQQ) return false;

  const cached = botInGroupCache.get(groupId);
  if (cached) {
    const ttl = cached.inGroup ? BOT_IN_GROUP_TTL : BOT_NOT_IN_GROUP_TTL;
    if (Date.now() - cached.timestamp < ttl) return cached.inGroup;
    botInGroupCache.delete(groupId);
  }

  let inGroup = false;
  try {
    const result: any = await state.originalCall.call(
      state.sourceActionsRef, 'get_group_member_info',
      { group_id: groupId, user_id: botQQ, no_cache: true }, adapter, netConfig,
    );
    const uid = result?.data?.user_id ?? result?.user_id;
    inGroup = uid !== undefined && uid !== null && String(uid) === String(botQQ);
  } catch {
    inGroup = false;
  }

  botInGroupCache.set(groupId, { inGroup, timestamp: Date.now() });
  if (!inGroup) addLog('info', `官方机器人 ${botQQ} 不在群 ${groupId}（缓存 ${BOT_NOT_IN_GROUP_TTL / 60000} 分钟）`);
  return inGroup;
}

export function clearBotInGroupCache (): void {
  botInGroupCache.clear();
}
