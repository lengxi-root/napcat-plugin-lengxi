import type { Tool, ToolResult } from '../types';
import { queryMessages, searchMessages, getMessageStats, getMessageById } from '../managers/message-logger';

export const MESSAGE_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'query_history_messages',
      description: '查询群聊或私聊的历史消息记录。可按群号、用户、关键词、时间范围过滤',
      parameters: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: '群号，查询指定群的消息' },
          user_id: { type: 'string', description: '用户QQ号，过滤指定用户的消息' },
          keyword: { type: 'string', description: '关键词，搜索包含该词的消息' },
          limit: { type: 'number', description: '返回条数，默认20，最大300' },
          offset: { type: 'number', description: '偏移量，用于分页' },
          hours_ago: { type: 'number', description: '查询多少小时内的消息，如24表示最近24小时' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_messages',
      description: '使用正则表达式搜索消息内容',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式，支持正则表达式' },
          group_id: { type: 'string', description: '限定在指定群内搜索' },
          user_id: { type: 'string', description: '限定指定用户的消息' },
          limit: { type: 'number', description: '返回条数，默认20' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_message_stats',
      description: '获取消息统计信息，包括总数、今日消息数、活跃用户数',
      parameters: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: '群号，不填则统计所有' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_message_by_id',
      description: '根据消息ID获取消息详情',
      parameters: {
        type: 'object',
        properties: {
          message_id: { type: 'string', description: '消息ID' },
        },
        required: ['message_id'],
      },
    },
  },
];

export function executeMessageTool (name: string, args: Record<string, unknown>): ToolResult {
  try {
    switch (name) {
      case 'query_history_messages': {
        const groupId = args.group_id as string | undefined;
        const userId = args.user_id as string | undefined;
        const keyword = args.keyword as string | undefined;
        let limit = (args.limit as number) || 20;
        const offset = (args.offset as number) || 0;
        const hoursAgo = args.hours_ago as number | undefined;

        if (limit > 300) limit = 300;

        let startTime: number | undefined;
        if (hoursAgo && hoursAgo > 0) {
          startTime = Math.floor(Date.now() / 1000) - hoursAgo * 3600;
        }

        const messages = queryMessages({
          group_id: groupId,
          user_id: userId,
          keyword,
          limit,
          offset,
          start_time: startTime,
        });

        if (messages.length === 0) {
          return { success: true, message: '没有找到符合条件的消息记录', data: [], count: 0 };
        }

        const formatted = messages.map(m => ({
          id: m.id,
          message_id: m.message_id,
          user: `${m.user_name}(${m.user_id})`,
          content: m.content,
          time: new Date(m.timestamp * 1000).toLocaleString('zh-CN'),
        }));

        return {
          success: true,
          message: `查询到 ${messages.length} 条消息`,
          data: formatted,
          count: messages.length,
        };
      }

      case 'search_messages': {
        const pattern = args.pattern as string;
        if (!pattern) {
          return { success: false, error: '缺少搜索模式 pattern' };
        }

        const groupId = args.group_id as string | undefined;
        const userId = args.user_id as string | undefined;
        let limit = (args.limit as number) || 20;
        if (limit > 300) limit = 300;

        const messages = searchMessages(pattern, { group_id: groupId, user_id: userId, limit });

        if (messages.length === 0) {
          return { success: true, message: `没有找到匹配 "${pattern}" 的消息`, data: [], count: 0 };
        }

        const formatted = messages.map(m => ({
          id: m.id,
          user: `${m.user_name}(${m.user_id})`,
          content: m.content,
          time: new Date(m.timestamp * 1000).toLocaleString('zh-CN'),
        }));

        return {
          success: true,
          message: `搜索到 ${messages.length} 条匹配的消息`,
          data: formatted,
          count: messages.length,
        };
      }

      case 'get_message_stats': {
        const groupId = args.group_id as string | undefined;
        const stats = getMessageStats(groupId);

        return {
          success: true,
          message: groupId ? `群 ${groupId} 的消息统计` : '全部消息统计',
          data: {
            total: stats.total,
            today: stats.today,
            active_users: stats.users,
            log_files: stats.files,
          },
        };
      }

      case 'get_message_by_id': {
        const messageId = args.message_id as string;
        if (!messageId) {
          return { success: false, error: '缺少 message_id' };
        }

        const msg = getMessageById(messageId);
        if (!msg) {
          return { success: false, error: `未找到消息 ${messageId}` };
        }

        return {
          success: true,
          data: {
            id: msg.id,
            message_id: msg.message_id,
            user: `${msg.user_name}(${msg.user_id})`,
            group_id: msg.group_id,
            content: msg.content,
            raw_message: msg.raw_message,
            time: new Date(msg.timestamp * 1000).toLocaleString('zh-CN'),
          },
        };
      }

      default:
        return { success: false, error: `未知工具: ${name}` };
    }
  } catch (error) {
    return { success: false, error: `执行失败: ${String(error)}` };
  }
}

export const getMessageTools = (): Tool[] => MESSAGE_TOOLS;
