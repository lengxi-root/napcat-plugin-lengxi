// 原生 markdown / 富媒体 通过官方机器人发送
import { state, groupEventIdCache } from '../core/state';
import { addLog } from '../core/logger';

/** 唤醒流程用的回调按钮键盘（原生构建，无需模板 ID） */
export const CALLBACK_KEYBOARD = {
  content: {
    rows: [{
      buttons: [{
        id: '1',
        render_data: { label: '回调', visited_label: '回调', style: 0 },
        action: { type: 1, permission: { type: 2 }, data: '回调', unsupport_tips: '不支持该操作' },
      }],
    }],
  },
};

const EVENT_ID_MAX_USES = 5; // 官方被动消息同一 event_id 最多回复 5 次
const CONTENT_VIOLATION_CODE = 40034006;

export interface OfficialSendResult {
  success: boolean;
  contentViolation: boolean;
}

function getSendResult (result: any): OfficialSendResult {
  const code = Number(result?.code ?? result?.err_code ?? 0);
  return {
    success: Boolean(result) && code === 0,
    contentViolation: code === CONTENT_VIOLATION_CODE,
  };
}

/** 代发成功后累计 event_id 使用次数，达上限则提前淘汰，下次点击按钮换新的 */
function recordEventIdUse (groupId: string, eventId: string): void {
  const info = groupEventIdCache.get(groupId);
  if (!info || info.eventId !== eventId) return;
  info.useCount = (info.useCount || 0) + 1;
  if (info.useCount >= EVENT_ID_MAX_USES) {
    groupEventIdCache.delete(groupId);
    addLog('info', `event_id 已用满 ${EVENT_ID_MAX_USES} 次，提前淘汰: 群=${groupId}`);
  }
}

async function downloadToBase64 (url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString('base64');
  } catch (e: any) {
    addLog('info', `下载图片失败: ${e.message}`);
    return null;
  }
}

export async function sendContentViaOfficialBotDetailed (
  groupId: string, groupOpenId: string, eventId: string,
  content: string, imageUrl?: string | null,
): Promise<OfficialSendResult> {
  if (!state.qqbotBridge) return { success: false, contentViolation: false };

  try {
    let result: any;
    if (imageUrl) {
      // 图片走富媒体：URL 直传，失败则下载后 base64 上传
      let fileInfo = await state.qqbotBridge.uploadGroupMedia(groupOpenId, imageUrl, 1, true);
      if (!fileInfo) {
        const base64 = await downloadToBase64(imageUrl);
        if (base64) fileInfo = await state.qqbotBridge.uploadGroupMedia(groupOpenId, base64, 1);
      }
      if (!fileInfo) {
        addLog('info', `官方机器人图片上传失败: 群=${groupId}, url=${imageUrl}`);
        return { success: false, contentViolation: false };
      }
      result = await state.qqbotBridge.sendGroupMediaMsg(groupOpenId, fileInfo, content, { event_id: eventId });
    } else {
      result = await state.qqbotBridge.sendGroupMarkdownMsg(groupOpenId, content, undefined, { event_id: eventId });
    }
    const sendResult = getSendResult(result);
    if (sendResult.success) {
      addLog('info', `官方机器人代发成功: 群=${groupId}(${groupOpenId}), eventId=${eventId}`);
      recordEventIdUse(groupId, eventId);
      return sendResult;
    } else {
      addLog('info', `官方机器人代发失败: 群=${groupId}, resp=${JSON.stringify(result)}`);
      if (!sendResult.contentViolation) groupEventIdCache.delete(groupId);
      return sendResult;
    }
  } catch (e: any) {
    addLog('info', `官方机器人代发异常: ${e.message}`);
    groupEventIdCache.delete(groupId);
    return { success: false, contentViolation: false };
  }
}

export async function sendContentViaOfficialBot (
  groupId: string, groupOpenId: string, eventId: string,
  content: string, imageUrl?: string | null,
): Promise<boolean> {
  return (await sendContentViaOfficialBotDetailed(groupId, groupOpenId, eventId, content, imageUrl)).success;
}

export async function sendViolationNotice (
  groupId: string, groupOpenId: string, eventId: string,
  adapter?: string, netConfig?: any,
): Promise<void> {
  addLog('info', `检测到官方机器人拒绝违规内容: 群=${groupId}`);
  if (state.config.sendViolationNotice === false) {
    addLog('info', `违规提示已关闭: 群=${groupId}`);
    return;
  }

  if (state.config.violationNoticeByOfficial !== false) {
    const result = await sendContentViaOfficialBotDetailed(groupId, groupOpenId, eventId, '消息违规');
    addLog('info', result.success
      ? `已由官方机器人发送违规提示: 群=${groupId}`
      : `官方机器人发送违规提示失败: 群=${groupId}`);
    return;
  }

  const targetAdapter = adapter || state.ctxRef?.adapterName;
  const targetNetConfig = netConfig || state.ctxRef?.pluginManager.config;
  if (!state.originalCall || !state.sourceActionsRef || !targetAdapter) {
    addLog('info', `本体发送违规提示失败: 群=${groupId}, 缺少发送上下文`);
    return;
  }
  try {
    await state.originalCall.call(
      state.sourceActionsRef, 'send_group_msg',
      { group_id: groupId, message: '消息违规' }, targetAdapter, targetNetConfig,
    );
    addLog('info', `已由本体发送违规提示: 群=${groupId}`);
  } catch (e: any) {
    addLog('info', `本体发送违规提示失败: 群=${groupId}, ${e.message}`);
  }
}


/**
 * 通过官方机器人发送富媒体消息（语音/视频）
 * file_type: 2=视频, 3=语音
 */
export async function sendMediaViaOfficialBotDetailed (
  groupId: string, groupOpenId: string, eventId: string,
  fileBase64: string, fileType: number, content?: string,
): Promise<OfficialSendResult> {
  if (!state.qqbotBridge) return { success: false, contentViolation: false };
  try {
    const fileInfo = await state.qqbotBridge.uploadGroupMedia(groupOpenId, fileBase64, fileType);
    if (!fileInfo) {
      addLog('info', `官方机器人上传媒体失败: 群=${groupId}, type=${fileType}`);
      return { success: false, contentViolation: false };
    }
    const result = await state.qqbotBridge.sendGroupMediaMsg(groupOpenId, fileInfo, content, { event_id: eventId });
    const sendResult = getSendResult(result);
    if (sendResult.success) {
      addLog('info', `官方机器人媒体代发成功: 群=${groupId}(${groupOpenId}), type=${fileType}`);
      recordEventIdUse(groupId, eventId);
      return sendResult;
    } else {
      addLog('info', `官方机器人媒体代发失败: 群=${groupId}, resp=${JSON.stringify(result)}`);
      if (!sendResult.contentViolation) groupEventIdCache.delete(groupId);
      return sendResult;
    }
  } catch (e: any) {
    addLog('info', `官方机器人媒体代发异常: ${e.message}`);
    groupEventIdCache.delete(groupId);
    return { success: false, contentViolation: false };
  }
}

export async function sendMediaViaOfficialBot (
  groupId: string, groupOpenId: string, eventId: string,
  fileBase64: string, fileType: number, content?: string,
): Promise<boolean> {
  return (await sendMediaViaOfficialBotDetailed(groupId, groupOpenId, eventId, fileBase64, fileType, content)).success;
}
