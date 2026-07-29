// 按钮相关：提取、点击、持久化、验证码、event_id 缓存
import fs from 'fs';
import path from 'path';
import { state, pendingMessages, PENDING_TIMEOUT, groupButtonMap, groupEventIdCache, EVENT_ID_TTL, eventIdWaiters, originalHandles } from '../core/state';
import type { GroupButtonInfo, GroupEventIdInfo } from '../core/types';
import { addLog } from '../core/logger';

export function getValidEventId (groupId: string): GroupEventIdInfo | null {
  const info = groupEventIdCache.get(groupId);
  if (!info) return null;
  if (Date.now() - info.timestamp > EVENT_ID_TTL) {
    groupEventIdCache.delete(groupId);
    return null;
  }
  return info;
}

export function generateVerifyCode (): string {
  return 'VERIFY_' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

export function cleanupPending (): void {
  const now = Date.now();
  for (const [key, pm] of pendingMessages) {
    if (now - pm.timestamp > PENDING_TIMEOUT) {
      pendingMessages.delete(key);
      // 唤醒超时（官方机器人未响应验证码）：回退原始发送，避免消息丢失
      if (pm.fallback) {
        const orig = originalHandles.get(pm.fallback.actionName);
        if (orig) {
          addLog('info', `唤醒超时: 验证码=${pm.code}, 群=${pm.groupId}, 回退原始发送`);
          Promise.resolve(orig(pm.fallback.params, pm.fallback.adapter, pm.fallback.netConfig, undefined))
            .catch((e: any) => addLog('info', `唤醒超时回退发送失败: ${e.message}`));
        }
      }
    }
  }
}

/** 判断某群是否已有未完成的唤醒流程（避免重复发送 @官方机器人 验证码刷屏） */
export function hasPendingWake (groupId: string): boolean {
  cleanupPending();
  for (const pm of pendingMessages.values()) {
    if (pm.groupId === groupId) return true;
  }
  return false;
}

/** 从 pb 数据中提取按钮信息 */
export function extractButtonInfo (data: any): { buttonId: string; callbackData: string; } | null {
  if (!data || typeof data !== 'object') return null;
  let foundCallbackData = '';
  let foundButtonId = '';

  function findBotString (obj: any, _parentObj?: any, _parentKey?: string): boolean {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'string' && val.startsWith('BOT1.0_')) {
        foundCallbackData = val;
        if (_parentObj && _parentObj['1'] !== undefined) {
          const bid = String(_parentObj['1']);
          if (!bid.startsWith('BOT1.0_')) { foundButtonId = bid; return true; }
        }
        if (obj['1'] !== undefined) {
          const bid = String(obj['1']);
          if (!bid.startsWith('BOT1.0_')) { foundButtonId = bid; return true; }
        }
        return true;
      }
    }
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val)) {
        for (const item of val) { if (findBotString(item, obj, key)) return true; }
      } else if (typeof val === 'object' && val !== null) {
        if (findBotString(val, obj, key)) return true;
      }
    }
    return false;
  }

  findBotString(data);

  if (foundCallbackData && !foundButtonId) {
    function findNumericButtonId (obj: any): string | null {
      if (!obj || typeof obj !== 'object') return null;
      if (obj['3'] && typeof obj['3'] === 'object') {
        const val5 = obj['3']['5'];
        if (typeof val5 === 'string' && val5 === foundCallbackData && obj['1'] !== undefined) {
          return String(obj['1']);
        }
      }
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (Array.isArray(val)) {
          for (const item of val) { const r = findNumericButtonId(item); if (r) return r; }
        } else if (typeof val === 'object' && val !== null) {
          const r = findNumericButtonId(val); if (r) return r;
        }
      }
      return null;
    }
    foundButtonId = findNumericButtonId(data) || '';
  }

  addLog('debug', `extractButtonInfo 结果: buttonId=${foundButtonId}, callbackData=${foundCallbackData}`);
  if (foundCallbackData) return { buttonId: foundButtonId || '1', callbackData: foundCallbackData };
  return null;
}

/** 通过 NapCat 的 click_inline_keyboard_button 点击按钮 */
export async function clickButton (groupId: string, buttonId: string, callbackData: string): Promise<void> {
  if (!state.ctxRef || !state.originalCall || !state.sourceActionsRef) return;
  const appid = state.config.qqbot?.appid;
  if (!appid) { addLog('info', '未配置 appid，无法点击按钮'); return; }
  try {
    const payload = {
      group_id: groupId, bot_appid: appid, button_id: buttonId,
      callback_data: callbackData, msg_seq: String(Math.floor(Math.random() * 1000000)),
    };
    addLog('info', `点击按钮发包: ${JSON.stringify(payload)}`);
    const result = await state.originalCall.call(state.sourceActionsRef, 'click_inline_keyboard_button', payload, state.ctxRef.adapterName, state.ctxRef.pluginManager.config);
    addLog('info', `点击按钮结果: ${JSON.stringify(result)}`);
  } catch (e: any) {
    addLog('info', `点击按钮失败: 群=${groupId}, ${e.message}`);
  }
}

/** 点击按钮并等待 INTERACTION 回调返回 event_id */
export async function clickButtonAndWaitEventId (groupId: string, buttonId: string, callbackData: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      eventIdWaiters.delete(groupId);
      addLog('info', `等待 event_id 超时: 群=${groupId}`);
      resolve(null);
    }, 10000);
    eventIdWaiters.set(groupId, { resolve: (eid) => resolve(eid), timer });
    clickButton(groupId, buttonId, callbackData).catch(() => {
      clearTimeout(timer);
      eventIdWaiters.delete(groupId);
      resolve(null);
    });
  });
}

export function saveButtonMap (): void {
  if (!state.configPath) return;
  try {
    const dir = path.dirname(state.configPath);
    const mapPath = path.join(dir, 'button_map.json');
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj: Record<string, GroupButtonInfo> = {};
    for (const [k, v] of groupButtonMap) obj[k] = v;
    fs.writeFileSync(mapPath, JSON.stringify(obj, null, 2));
  } catch { /* ignore */ }
}

export function loadButtonMap (): void {
  if (!state.configPath) return;
  try {
    const mapPath = path.join(path.dirname(state.configPath), 'button_map.json');
    if (fs.existsSync(mapPath)) {
      const data = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
      for (const [k, v] of Object.entries(data)) groupButtonMap.set(k, v as GroupButtonInfo);
      addLog('info', `已加载 ${groupButtonMap.size} 个群按钮映射`);
    }
  } catch { /* ignore */ }
}
