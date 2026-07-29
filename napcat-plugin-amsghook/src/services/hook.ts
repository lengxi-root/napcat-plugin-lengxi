// _handle hook 逻辑：拦截发送消息
import { state, ONEBOT_RULE_NAME, originalHandles, pendingMessages, groupButtonMap, PENDING_TIMEOUT } from '../core/state';
import { addLog } from '../core/logger';
import { getCallerPlugin, getSuffix, transformParams, applyReplaceText } from '../utils/transform';
import { extractTextContent, extractImageInfo, extractMediaInfo } from '../utils/message';
import { resolveImageForMarkdown, isForwardMessage, forwardNodesToHtml } from '../utils/image';
import { sendContentViaOfficialBot, sendMediaViaOfficialBot } from '../utils/markdown';
import { renderHtmlToBase64, uploadBase64Image } from './puppeteer';
import { getValidEventId, clickButtonAndWaitEventId, hasPendingWake, cleanupPending, generateVerifyCode } from '../utils/button';
import { convertToSilk } from '../utils/audio';
import { isOfficialBotInGroup } from '../utils/group-check';

/** 下载文件并转为 base64 */
async function downloadToBase64 (url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString('base64');
  } catch (e: any) {
    addLog('info', `下载文件失败: ${e.message}`);
    return null;
  }
}

/** 获取文件 base64（支持 url / base64:// / file:// / 本地路径） */
async function resolveFileBase64 (fileOrUrl: string): Promise<string | null> {
  if (fileOrUrl.startsWith('base64://')) return fileOrUrl.slice(9);
  if (fileOrUrl.startsWith('http')) return downloadToBase64(fileOrUrl);
  // file:// 协议
  if (fileOrUrl.startsWith('file:///')) {
    try {
      const fs = await import('fs');
      const filePath = fileOrUrl.slice(8); // file:///C:/xxx → C:/xxx
      const buf = fs.readFileSync(filePath);
      return Buffer.from(buf).toString('base64');
    } catch (e: any) {
      addLog('info', `读取本地文件失败(file://): ${e.message}`);
      return null;
    }
  }
  // 本地绝对路径（Windows: C:\xxx 或 /xxx）
  if (/^[A-Za-z]:[\\\/]/.test(fileOrUrl) || fileOrUrl.startsWith('/')) {
    try {
      const fs = await import('fs');
      const buf = fs.readFileSync(fileOrUrl);
      return Buffer.from(buf).toString('base64');
    } catch (e: any) {
      addLog('info', `读取本地文件失败: ${e.message}`);
      return null;
    }
  }
  addLog('info', `resolveFileBase64: 不支持的格式: ${fileOrUrl.substring(0, 80)}`);
  return null;
}

/**
 * 尝试通过三条路径发送媒体消息（语音/视频）
 * 返回 true 表示发送成功
 */
async function trySendMedia (gid: string, fileBase64: string, fileType: number, content?: string): Promise<boolean> {
  const cached = getValidEventId(gid);
  if (cached) {
    const sent = await sendMediaViaOfficialBot(gid, cached.groupOpenId, cached.eventId, fileBase64, fileType, content);
    if (sent) return true;
  }
  const btnInfo = groupButtonMap.get(gid);
  if (btnInfo?.buttonId && btnInfo?.callbackData) {
    const newEventId = await clickButtonAndWaitEventId(gid, btnInfo.buttonId, btnInfo.callbackData);
    if (newEventId) {
      const sent = await sendMediaViaOfficialBot(gid, btnInfo.groupOpenId, newEventId, fileBase64, fileType, content);
      if (sent) return true;
    }
  }
  return false;
}

export function installHooks (): void {
  const sourceActions = state.sourceActionsRef;
  if (!sourceActions) return;

  let hookReentrant = false;
  const HOOK_ACTIONS = ['send_msg', 'send_group_msg', 'send_private_msg', 'send_group_forward_msg'];

  for (const actionName of HOOK_ACTIONS) {
    const handler = sourceActions.get(actionName);
    if (!handler || typeof handler._handle !== 'function') continue;
    if ((handler._handle as any).__msghook) continue;
    const origHandle = handler._handle.bind(handler);
    originalHandles.set(actionName, origHandle);

    handler._handle = async function (params: any, adapter: string, netConfig: any, req: any) {
      if (hookReentrant || !state.config.enabled || !(params?.message || params?.messages)) {
        return origHandle(params, adapter, netConfig, req);
      }
      hookReentrant = true;
      try {
        const rawCaller = getCallerPlugin();
        const caller = rawCaller || ONEBOT_RULE_NAME;

        // ========== 消息替代模式（按插件规则） ==========
        const qcfg = state.config.qqbot;
        const callerRule = state.config.rules.find((r: any) => r.name === caller) || null;

        if ((callerRule?.replace || state.config.globalReplace) && qcfg?.appid && qcfg.secret && qcfg.qqNumber && state.qqbotBridge?.isConnected()) {
          const groupId = params.group_id || (actionName === 'send_msg' && params.message_type === 'group' ? params.group_id : null);
          if (groupId && caller !== 'napcat-plugin-amsghook' && await isOfficialBotInGroup(String(groupId), adapter, netConfig)) {
            const gid = String(groupId);

            let textContent = '';
            let imageUrl: string | null = null;
            let imgWidth = 0, imgHeight = 0;

            if (isForwardMessage(actionName, params)) {
              addLog('info', `替代模式: 拦截合并转发 ← ${caller}, 群=${gid}`);
              const nodes = params.messages || params.message;
              if (Array.isArray(nodes) && nodes.length > 0) {
                addLog('debug', `合并转发 node[0] keys: ${JSON.stringify(nodes[0])}`);
                const html = forwardNodesToHtml(nodes);
                const base64 = await renderHtmlToBase64(html);
                if (base64) {
                  // 从 PNG base64 解析实际宽高
                  try {
                    const buf = new Uint8Array(Buffer.from(base64, 'base64'));
                    if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length > 24) {
                      imgWidth = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
                      imgHeight = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
                    }
                  } catch { /* ignore */ }
                  imageUrl = await uploadBase64Image(base64, gid);
                  if (imageUrl) {
                    addLog('info', `合并转发渲染成功: ${imageUrl} ${imgWidth}x${imgHeight}`);
                  } else {
                    addLog('info', '合并转发图片上传失败，回退原始发送');
                    return origHandle(params, adapter, netConfig, req);
                  }
                } else {
                  addLog('info', '合并转发渲染失败，回退原始发送');
                  return origHandle(params, adapter, netConfig, req);
                }
                textContent = '';
              }
            } else {
              // ===== 语音/视频媒体检测 =====
              const mediaInfo = extractMediaInfo(params.message);
              if (mediaInfo) {
                const fileType = mediaInfo.type === 'record' ? 3 : 2;
                const typeLabel = mediaInfo.type === 'record' ? '语音' : '视频';
                addLog('info', `替代模式: 检测到${typeLabel} ← ${caller}, 群=${gid}`);

                // 获取原始文件
                const fileSource = mediaInfo.url || mediaInfo.file || '';
                let fileBase64 = await resolveFileBase64(fileSource);

                if (fileBase64) {
                  // 语音需要转换为标准 silk 格式（官方 API 要求）
                  if (mediaInfo.type === 'record') {
                    const rawBuf = Buffer.from(fileBase64, 'base64');
                    const silkBuf = await convertToSilk(rawBuf);
                    if (silkBuf) {
                      fileBase64 = silkBuf.toString('base64');
                    } else {
                      addLog('info', `替代模式: 语音 silk 转换失败，回退原始发送`);
                      return origHandle(params, adapter, netConfig, req);
                    }
                  }

                  const sent = await trySendMedia(gid, fileBase64, fileType);
                  if (sent) {
                    addLog('info', `替代模式: ${typeLabel}代发成功`);
                    return { message_id: -1 };
                  }
                  addLog('info', `替代模式: ${typeLabel}官方代发失败（无可用 event_id），回退原始发送`);
                } else {
                  addLog('info', `替代模式: ${typeLabel}文件解析失败，回退原始发送`);
                }
                return origHandle(params, adapter, netConfig, req);
              }

              textContent = extractTextContent(params.message);
              const imgInfo = extractImageInfo(params.message);
              if (imgInfo) {
                const resolved = await resolveImageForMarkdown(imgInfo, gid);
                if (resolved) {
                  imageUrl = resolved.url;
                  imgWidth = resolved.width;
                  imgHeight = resolved.height;
                } else {
                  addLog('info', `图片 URL 解析失败: ${JSON.stringify(imgInfo)}`);
                }
              }
            }

            // 模糊替换文本内容
            if (callerRule?.replaceText) {
              const rules: { find: string; rep: string; }[] = [];
              for (const part of callerRule.replaceText.split(';')) {
                const eq = part.indexOf('=');
                if (eq > 0) rules.push({ find: part.slice(0, eq), rep: part.slice(eq + 1) });
              }
              if (rules.length) {
                const old = textContent;
                for (const r of rules) textContent = textContent.split(r.find).join(r.rep);
                if (old !== textContent) addLog('info', `替代模式: 文本替换 "${old.slice(0, 40)}" → "${textContent.slice(0, 40)}"`);
              }
            }

            if (textContent || imageUrl) {
              addLog('info', `替代模式: 拦截 ${actionName} ← ${caller}, 群=${gid}${imageUrl ? `, 含图片 ${imgWidth}x${imgHeight}` : ''}`);

              const cached = getValidEventId(gid);
              if (cached) {
                addLog('info', `替代模式: 使用缓存 event_id=${cached.eventId}, 群=${gid}`);
                const sent = await sendContentViaOfficialBot(gid, cached.groupOpenId, cached.eventId, textContent, imageUrl);
                if (sent) return { message_id: -1 };
                addLog('info', `替代模式: event_id 可能已过期，尝试重新点击按钮`);
              }

              const btnInfo = groupButtonMap.get(gid);
              if (btnInfo?.buttonId && btnInfo?.callbackData) {
                addLog('info', `替代模式: 点击按钮获取新 event_id, 群=${gid}`);
                const newEventId = await clickButtonAndWaitEventId(gid, btnInfo.buttonId, btnInfo.callbackData);
                if (newEventId) {
                  const sent = await sendContentViaOfficialBot(gid, btnInfo.groupOpenId, newEventId, textContent, imageUrl);
                  if (sent) return { message_id: -1 };
                }
                // 已有按钮 id 的群无需唤醒流程，点击失败直接回退原始发送
                addLog('info', `替代模式: 点击按钮未获得有效 event_id，群 ${gid} 已有按钮映射，跳过唤醒回退原始发送`);
                return origHandle(params, adapter, netConfig, req);
              }

              if (hasPendingWake(gid)) {
                addLog('info', `替代模式: 群 ${gid} 已有唤醒流程等待中，跳过重复唤醒，回退原始发送`);
                return origHandle(params, adapter, netConfig, req);
              }
              const code = generateVerifyCode();
              pendingMessages.set(code, {
                groupId: gid, content: textContent, imageUrl, imgWidth, imgHeight,
                rawMessage: params.message || params.messages, code, timestamp: Date.now(), caller,
                fallback: { actionName, params, adapter, netConfig },
              });
              // 到期主动检查：官方机器人未响应时回退原始发送
              setTimeout(() => cleanupPending(), PENDING_TIMEOUT + 1000);
              addLog('info', `替代模式: 唤醒流程, 验证码=${code}, 群=${gid}`);
              const atMsg = [
                { type: 'at', data: { qq: qcfg.qqNumber } },
                { type: 'text', data: { text: ' ' + code } },
              ];
              try {
                await state.originalCall.call(state.sourceActionsRef, 'send_group_msg', { group_id: groupId, message: atMsg }, adapter, netConfig);
                addLog('info', `替代模式: 已发送 @官方机器人 + 验证码到群 ${gid}`);
              } catch (e: any) {
                addLog('info', `替代模式: 发送 @消息失败: ${e.message}`);
                pendingMessages.delete(code);
                return origHandle(params, adapter, netConfig, req);
              }
              return { message_id: -1 };
            }
          }
        }

        // ========== 普通后缀 + 替换文本模式 ==========
        if (actionName !== 'send_group_forward_msg' && params?.message) {
          // replaceText 独立于后缀，只要规则存在且 enabled 且有 replaceText 就执行
          if (callerRule?.enabled && callerRule?.replaceText) {
            params = applyReplaceText(params, callerRule.replaceText);
            addLog('info', `替换文本: ${caller}`);
          }
          const suffix = getSuffix(caller);
          if (suffix) {
            addLog('info', `拦截 ${actionName} ← ${caller}, 后缀="${suffix}"`);
            params = transformParams(params, suffix);
          } else if (state.config.debug && caller) {
            addLog('debug', `跳过 ${actionName} ← ${caller} (无后缀)`);
          }
        }

        return origHandle(params, adapter, netConfig, req);
      } finally {
        hookReentrant = false;
      }
    };
    (handler._handle as any).__msghook = true;
    addLog('info', `已 hook ${actionName}._handle`);
  }
  addLog('info', `hook 完成 | 规则数=${state.config.rules.length}`);
}
