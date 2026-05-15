import type { Tool, ToolResult } from '../types';
import { pluginState } from '../core/state';
import { addPendingOperation, type OperationType } from '../managers/operation-tracker';

interface ActionMap {
  call: (action: string, params: unknown, adapter: string, config: unknown) => Promise<unknown>;
  get: (action: string) => unknown;
}

export const API_TOOLS: Tool[] = [{
  type: 'function',
  function: {
    name: 'call_api',
    description: '调用 OneBot API 接口。可用接口见系统提示词中的【可用API列表】',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'API名称，如 send_group_msg, set_group_ban 等' },
        params: { type: 'object', description: 'API参数' },
      },
      required: ['action'],
    },
  },
}];

const NO_RETURN_ACTIONS = new Set([
  'set_group_ban', 'set_group_whole_ban', 'set_group_kick',
  'set_group_admin', 'set_group_card', 'delete_msg',
]);

function getOperationType (action: string, params: Record<string, unknown>): OperationType | null {
  if (action === 'set_group_ban') {
    const duration = params.duration as number || 0;
    return duration === 0 ? 'lift_ban' : 'ban';
  }
  if (action === 'set_group_kick') return 'kick';
  if (action === 'set_group_admin') {
    return params.enable ? 'set_admin' : 'unset_admin';
  }
  if (action === 'delete_msg') return 'recall';
  return null;
}

export async function executeApiTool (
  actions: ActionMap, adapter: string, config: unknown, args: Record<string, unknown>
): Promise<ToolResult> {
  const action = args.action as string;
  let params = (args.params as Record<string, unknown>) || {};
  if (Object.keys(params).length === 0) {
    params = Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'action'));
  }

  if (!action) return { success: false, error: '缺少 action 参数' };

  if (action.includes('forward_msg') && params.messages) {
    params.messages = sanitizeForwardMessages(params.messages as unknown[]);
  }

  const isNoReturnAction = NO_RETURN_ACTIONS.has(action);
  const operationType = getOperationType(action, params);

  pluginState.debug(`[API] 执行 ${action}，参数: ${JSON.stringify(params)}`);

  try {
    const result = await actions.call(action as never, params as never, adapter, config) as Record<string, unknown>;
    pluginState.debug(`[API] ${action} 返回: ${JSON.stringify(result)}`);

    if (result && result.retcode !== undefined && result.retcode !== 0) {
      return parseApiError(action, result);
    }

    if (!isNoReturnAction || result) {
      return { success: true, message: getSuccessMessage(action, params), data: result ?? {} };
    }

    if (operationType && params.group_id && params.user_id) {
      pluginState.debug(`[API] ${action} 无返回值，等待通知确认...`);
      const confirmation = await addPendingOperation(
        operationType,
        String(params.group_id),
        String(params.user_id),
        { duration: params.duration as number, timeout: 3000 }
      );
      pluginState.debug(`[API] ${action} 确认结果: ${confirmation.confirmed ? '已确认' : '超时假定成功'}`);
      return { success: confirmation.success, message: confirmation.message, data: confirmation.data };
    }

    return { success: true, message: getSuccessMessage(action, params), data: {} };

  } catch (error) {
    const errorStr = String(error);
    pluginState.debug(`[API] ${action} 异常: ${errorStr}`);

    if (errorStr.includes('No data returned') && isNoReturnAction) {
      if (operationType && params.group_id && params.user_id) {
        pluginState.debug(`[API] ${action} "No data returned"，等待通知确认...`);
        const confirmation = await addPendingOperation(
          operationType,
          String(params.group_id),
          String(params.user_id),
          { duration: params.duration as number, timeout: 3000 }
        );
        return { success: confirmation.success, message: confirmation.message, data: confirmation.data };
      }
      return { success: true, message: getSuccessMessage(action, params), data: {} };
    }

    return parseApiError(action, errorStr);
  }
}

const ERROR_RULES: [RegExp, string][] = [
  [/no permission|lack|NOT_GROUP_ADMIN/i, '机器人没有管理员权限，无法执行此操作'],
  [/owner|群主|cannot ban owner/i, '无法对群主执行此操作'],
  [/admin|管理|cannot ban admin/i, '无法对管理员执行此操作（权限不足）'],
  [/not found|uid error|user not found/i, '找不到该用户，可能不在群内'],
  [/group not found/i, '找不到该群'],
  [/频繁|rate|风控/i, '操作过于频繁或触发风控，请稍后再试'],
];

function parseApiError (action: string, msgOrResult: string | Record<string, unknown>): ToolResult {
  let text: string;
  let data: Record<string, unknown> | undefined;

  if (typeof msgOrResult === 'string') {
    text = msgOrResult;
  } else {
    const retcode = msgOrResult.retcode as number | undefined;
    text = String(msgOrResult.message || msgOrResult.msg || msgOrResult.wording || '');
    data = msgOrResult;
    if (retcode === 102) return { success: false, error: '机器人没有管理员权限，无法执行此操作', data };
    if (retcode === 100) return { success: false, error: '找不到该用户，可能不在群内', data };
  }

  const lower = text.toLowerCase();
  for (const [pattern, msg] of ERROR_RULES) {
    if (pattern.test(lower)) return { success: false, error: msg, data };
  }
  return { success: false, error: `${action} 失败: ${text.slice(0, 100)}`, data };
}

function getSuccessMessage (action: string, params: Record<string, unknown>): string {
  if (action === 'set_group_ban') {
    const duration = params.duration as number || 0;
    return duration === 0
      ? `已解除用户 ${params.user_id} 的禁言`
      : `已禁言用户 ${params.user_id}，时长 ${Math.floor(duration / 60)}分钟`;
  }
  if (action === 'set_group_whole_ban') {
    return params.enable ? '已开启全员禁言' : '已关闭全员禁言';
  }
  if (action === 'set_group_kick') {
    return `已将用户 ${params.user_id} 踢出群聊`;
  }
  if (action === 'delete_msg') {
    return `已撤回消息 ${params.message_id}`;
  }
  if (action === 'set_group_admin') {
    return params.enable
      ? `已设置用户 ${params.user_id} 为管理员`
      : `已取消用户 ${params.user_id} 的管理员`;
  }
  return `${action} 执行成功`;
}

export const getApiTools = (): Tool[] => API_TOOLS;

function sanitizeForwardMessages (messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map(node => {
    const n = node as Record<string, unknown>;
    if (n.type !== 'node' || !n.data) return node;

    const data = n.data as Record<string, unknown>;

    if (data.user_id !== undefined) {
      data.user_id = Number(data.user_id) || 66600000;
    }

    if (!data.nickname) {
      data.nickname = 'Bot';
    }

    if (typeof data.content === 'string') {
      data.content = [{ type: 'text', data: { text: sanitizeText(data.content) } }];
    } else if (Array.isArray(data.content)) {
      const hasNestedNodes = (data.content as unknown[]).some(
        seg => (seg as Record<string, unknown>).type === 'node'
      );

      if (hasNestedNodes) {
        data.content = sanitizeForwardMessages(data.content as unknown[]);
      } else {
        data.content = (data.content as unknown[]).map(seg => {
          const s = seg as Record<string, unknown>;

          if (s.type === 'text' && s.data) {
            const d = s.data as Record<string, unknown>;
            if (typeof d.text === 'string') {
              d.text = sanitizeText(d.text);
            }
          }

          if (s.type === 'image' && s.data) {
            const d = s.data as Record<string, unknown>;
            if (!d.file && !d.url) {
              return { type: 'text', data: { text: '[图片]' } };
            }
          }

          return seg;
        }).filter(Boolean);
      }
    }

    return node;
  });
}

function sanitizeText (text: string): string {
  return text.replace(/\[(?!CQ:)(动画表情|表情|图片|文件|语音|视频)[^\]]*\]/g, match => {
    return '【' + match.slice(1, -1) + '】';
  });
}
