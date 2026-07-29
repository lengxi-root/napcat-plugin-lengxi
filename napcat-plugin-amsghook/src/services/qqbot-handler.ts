// QQBot 桥接消息处理 + 启停
import { QQBotBridge } from '../qqbot-ws';
import type { QQBotConfig, QQBotMessage } from '../qqbot-ws';
import {
  state, pendingMessages, PENDING_TIMEOUT, pendingPbExtracts,
  groupButtonMap, groupEventIdCache, eventIdWaiters, pendingContentAfterAwaken,
} from '../core/state';
import { addLog } from '../core/logger';
import { sendContentViaOfficialBot, CALLBACK_KEYBOARD } from '../utils/markdown';

function onQQBotMessage (msg: QQBotMessage): void {
  if (!state.ctxRef) return;
  addLog('info', `QQBot 收到 ${msg.type} 消息 ← ${msg.user_id}: ${msg.content}`);

  // ========== INTERACTION 回调事件 ==========
  if (msg.type === 'interaction') {
    const eventId = msg.event_id || msg.raw?.id || '';
    const groupOpenId = msg.group_id || msg.raw?.group_openid || '';
    addLog('info', `QQBot 回调事件: group_openid=${groupOpenId}, event_id=${eventId}, button_data=${msg.content}`);

    if (eventId && groupOpenId) {
      let qqGroupId: string | null = null;
      for (const [gid, info] of groupButtonMap) {
        if (info.groupOpenId === groupOpenId) { qqGroupId = gid; break; }
      }
      if (qqGroupId) {
        groupEventIdCache.set(qqGroupId, { eventId, groupOpenId, timestamp: Date.now() });
        addLog('info', `已缓存 event_id: 群=${qqGroupId}(${groupOpenId}), eventId=${eventId}`);

        const waiter = eventIdWaiters.get(qqGroupId);
        if (waiter) {
          clearTimeout(waiter.timer);
          eventIdWaiters.delete(qqGroupId);
          waiter.resolve(eventId);
        }

        const pendingContent = pendingContentAfterAwaken.get(qqGroupId);
        if (pendingContent && Date.now() - pendingContent.timestamp < PENDING_TIMEOUT) {
          pendingContentAfterAwaken.delete(qqGroupId);
          addLog('info', `唤醒流程完成，发送待发内容: 群=${qqGroupId}`);
          sendContentViaOfficialBot(qqGroupId, groupOpenId, eventId, pendingContent.content, pendingContent.imageUrl).catch(() => { });
        }
      } else {
        addLog('info', `INTERACTION 回调: 未找到 group_openid=${groupOpenId} 对应的 QQ 群号`);
      }
    }
    return;
  }

  // ========== 消息替代模式：检查是否是验证码消息 ==========
  if (msg.type === 'group' && msg.group_id) {
    const content = (msg.content || '').trim();
    if (content.startsWith('VERIFY_')) {
      const code = content;
      const pending = pendingMessages.get(code);
      if (pending) {
        pendingMessages.delete(code);
        addLog('info', `验证码匹配成功: ${code} → 由官方机器人发送消息到群 ${msg.group_id}`);
        if (state.qqbotBridge) {
          state.qqbotBridge.sendGroupMarkdownMsg(
            msg.group_id, '1', CALLBACK_KEYBOARD,
            { id: msg.message_id, event_id: msg.event_id },
          ).then((result) => {
            if (result && !result.code) {
              addLog('info', `官方机器人 markdown 消息发送成功: group=${msg.group_id}`);
              if (pending.groupId && state.config.qqbot?.qqNumber) {
                pendingPbExtracts.set(pending.groupId, {
                  officialBotQQ: state.config.qqbot.qqNumber, timestamp: Date.now(),
                  code, groupOpenId: msg.group_id!,
                });
                addLog('info', `已注册 pb 提取等待: 群=${pending.groupId}, openId=${msg.group_id}, 官方机器人QQ=${state.config.qqbot.qqNumber}`);
                pendingContentAfterAwaken.set(pending.groupId, {
                  content: pending.content, imageUrl: pending.imageUrl, timestamp: Date.now(),
                });
              }
            } else {
              addLog('info', `官方机器人 markdown 消息发送失败: group=${msg.group_id}, resp=${JSON.stringify(result)}`);
            }
          }).catch((e: any) => addLog('info', `官方机器人发送异常: ${e.message}`));
        }
        return;
      } else {
        addLog('debug', `收到验证码 ${code} 但无匹配的待发送消息`);
      }
    }
  }

  // 将 QQBot 消息转发到 NapCat 的插件系统
  const fakeEvent: any = {
    post_type: 'message',
    message_type: msg.type === 'group' ? 'group' : 'private',
    sub_type: 'normal',
    user_id: msg.user_id,
    group_id: msg.group_id,
    raw_message: msg.content,
    message: [{ type: 'text', data: { text: msg.content } }],
    message_id: msg.message_id,
    self_id: state.qqbotBridge?.getSelfId() || '',
    sender: { user_id: msg.user_id, nickname: '', card: '' },
    time: Math.floor(Date.now() / 1000),
    _qqbot_source: { id: msg.message_id, event_id: msg.event_id, group_id: msg.group_id, user_id: msg.user_id },
  };
  try {
    const pm = state.ctxRef!.pluginManager as any;
    if (pm?.callPluginEventHandler) {
      pm.callPluginEventHandler(fakeEvent).catch(() => { });
    }
  } catch { /* ignore */ }
}

export async function startQQBot (): Promise<void> {
  const qcfg = state.config.qqbot;
  if (!qcfg?.appid || !qcfg.secret) return;
  await stopQQBot();
  const botConfig: QQBotConfig = {
    appid: qcfg.appid, secret: qcfg.secret,
    intents: qcfg.intents || ['GROUP_AT_MESSAGE_CREATE', 'C2C_MESSAGE_CREATE', 'INTERACTION'],
  };
  state.qqbotBridge = new QQBotBridge(botConfig, onQQBotMessage, addLog);
  try {
    await state.qqbotBridge.start();
    addLog('info', 'QQBot 桥接已启动');
  } catch (e: any) {
    addLog('info', `QQBot 桥接启动失败: ${e.message}`);
  }
}

export async function stopQQBot (): Promise<void> {
  if (state.qqbotBridge) {
    await state.qqbotBridge.stop();
    state.qqbotBridge = null;
    addLog('info', 'QQBot 桥接已停止');
  }
}
