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

export async function sendContentViaOfficialBot (
  groupId: string, groupOpenId: string, eventId: string,
  content: string, imageUrl?: string | null,
): Promise<boolean> {
  if (!state.qqbotBridge) return false;

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
        return false;
      }
      result = await state.qqbotBridge.sendGroupMediaMsg(groupOpenId, fileInfo, content, { event_id: eventId });
    } else {
      result = await state.qqbotBridge.sendGroupMarkdownMsg(groupOpenId, content, undefined, { event_id: eventId });
    }
    if (result && !result.code) {
      addLog('info', `官方机器人代发成功: 群=${groupId}(${groupOpenId}), eventId=${eventId}`);
      return true;
    } else {
      addLog('info', `官方机器人代发失败: 群=${groupId}, resp=${JSON.stringify(result)}`);
      if (result?.code) groupEventIdCache.delete(groupId);
      return false;
    }
  } catch (e: any) {
    addLog('info', `官方机器人代发异常: ${e.message}`);
    return false;
  }
}


/**
 * 通过官方机器人发送富媒体消息（语音/视频）
 * file_type: 2=视频, 3=语音
 */
export async function sendMediaViaOfficialBot (
  groupId: string, groupOpenId: string, eventId: string,
  fileBase64: string, fileType: number, content?: string,
): Promise<boolean> {
  if (!state.qqbotBridge) return false;
  try {
    const fileInfo = await state.qqbotBridge.uploadGroupMedia(groupOpenId, fileBase64, fileType);
    if (!fileInfo) {
      addLog('info', `官方机器人上传媒体失败: 群=${groupId}, type=${fileType}`);
      return false;
    }
    const result = await state.qqbotBridge.sendGroupMediaMsg(groupOpenId, fileInfo, content, { event_id: eventId });
    if (result && !result.code) {
      addLog('info', `官方机器人媒体代发成功: 群=${groupId}(${groupOpenId}), type=${fileType}`);
      return true;
    } else {
      addLog('info', `官方机器人媒体代发失败: 群=${groupId}, resp=${JSON.stringify(result)}`);
      if (result?.code) groupEventIdCache.delete(groupId);
      return false;
    }
  } catch (e: any) {
    addLog('info', `官方机器人媒体代发异常: ${e.message}`);
    return false;
  }
}
