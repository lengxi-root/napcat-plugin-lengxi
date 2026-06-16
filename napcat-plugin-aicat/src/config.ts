// AI Cat 插件配置
import type { AIConfig, PluginConfig } from './types';

// 插件版本号（plugin_init 时从同目录 package.json 动态读取）
export let PLUGIN_VERSION = '0.0.0';
export function setPluginVersion (version: string): void { PLUGIN_VERSION = version; }

// 默认插件配置
export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  prefix: 'xy',
  enableReply: true,
  sendConfirmMessage: true,
  botName: '汐雨',
  personality: '可爱猫娘助手，说话带"喵"等语气词，活泼俏皮会撒娇',
  confirmMessage: '汐雨收到喵～',
  maxContextTurns: 30,
  ownerQQs: '',
  model: 'gpt-5',
  debug: false,
  apiSource: 'main',
  customApiUrl: '',
  customApiKey: '',
  customModel: 'gpt-4o',
  allowPublicPacket: true,
  autoSwitchModel: true,
  allowAtTrigger: false,
  safetyFilter: true,
  disabledGroups: [],
  ytApiKey: '',
  yteaModel: '',
};

// 主接口模型列表（从 i.elaina.vin 动态更新）
export let MODEL_LIST: string[] = [
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.1',
  'gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-4-turbo',
  'claude-3-5-sonnet', 'claude-3-5-haiku',
  'deepseek-chat', 'deepseek-reasoner',
  'gemini-2.5-flash', 'gemini-2.5-pro',
];

// YTea 接口模型列表（从 api.ytea.top 动态更新）
export let YTEA_MODEL_LIST: string[] = [];

// 非对话模型关键词（嵌入/绘图/语音/重排/审核等，自动切换时应跳过）
const NON_CHAT_MODEL_KEYWORDS = [
  'embedding', 'embed', 'rerank', 'moderation', 'guard',
  'image', 'dall-e', 'dalle', 'midjourney', 'flux', 'stable-diffusion', 'sd-',
  'tts', 'whisper', 'audio', 'speech', 'voice', 'realtime',
  'video', 'sora', 'veo', 'kling', 'robotics', 'ocr',
];

// 判断是否为可对话模型（过滤掉嵌入/绘图/语音等非对话模型）
export function isChatModel (id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_CHAT_MODEL_KEYWORDS.some(kw => lower.includes(kw));
}

// 模型排序：常见对话模型族优先，其余按字母序
const MODEL_FAMILY_ORDER = ['gpt', 'o1', 'o3', 'o4', 'claude', 'gemini', 'deepseek', 'grok', 'glm', 'qwen', 'llama'];
function modelSortKey (id: string): [number, string] {
  const lower = id.toLowerCase();
  const family = MODEL_FAMILY_ORDER.findIndex(f => lower.includes(f));
  return [family === -1 ? MODEL_FAMILY_ORDER.length : family, lower];
}

// 规整模型列表：去重 + 过滤非对话模型 + 排序
export function normalizeChatModels (ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id) || !isChatModel(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result.sort((a, b) => {
    const [fa, ka] = modelSortKey(a);
    const [fb, kb] = modelSortKey(b);
    return fa !== fb ? fa - fb : ka.localeCompare(kb);
  });
}

// 默认AI配置
export const DEFAULT_AI_CONFIG: AIConfig = {
  base_url: 'https://i.elaina.vin/api/openai/chat/completions',
  api_key: '',
  model: 'gpt-5',
  timeout: 60000,
};

// 从主接口获取模型列表
export async function fetchModelList (): Promise<string[]> {
  try {
    const apiBase = DEFAULT_AI_CONFIG.base_url.replace('/chat/completions', '');
    const res = await fetch(`${apiBase}/models`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json() as { chat?: string[]; success?: boolean; };
      if (data.success && data.chat?.length) {
        MODEL_LIST = data.chat;
      }
    }
  } catch { /* ignore */ }
  return MODEL_LIST;
}

// YTea 接口地址
export const YTEA_BASE = 'https://api.ytea.top';

// 模型获取结果
export interface FetchModelsResult {
  ok: boolean;
  models: string[];
  error?: string;
}

// 从 api.ytea.top 获取模型列表（需要密钥），返回过滤排序后的可对话模型
export async function fetchYteaModelList (ytApiKey: string): Promise<FetchModelsResult> {
  if (!ytApiKey) return { ok: false, models: YTEA_MODEL_LIST, error: '未配置密钥' };
  try {
    const res = await fetch(`${YTEA_BASE}/v1/models`, {
      headers: { 'Authorization': `Bearer ${ytApiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      return { ok: false, models: YTEA_MODEL_LIST, error: `HTTP ${res.status}${detail ? ': ' + detail : ''}` };
    }
    const data = await res.json() as { data?: { id: string; }[]; };
    const raw = (data.data || []).map(m => m.id).filter(Boolean);
    if (!raw.length) return { ok: false, models: YTEA_MODEL_LIST, error: '返回模型列表为空' };
    YTEA_MODEL_LIST = normalizeChatModels(raw);
    return { ok: true, models: YTEA_MODEL_LIST };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? '请求超时' : String(e);
    return { ok: false, models: YTEA_MODEL_LIST, error: msg };
  }
}

// 获取主接口模型选项列表
export function getModelOptions (): { label: string; value: string; }[] {
  return MODEL_LIST.map(m => ({ label: m, value: m }));
}

// 获取 YTea 模型选项列表
export function getYteaModelOptions (): { label: string; value: string; }[] {
  return YTEA_MODEL_LIST.map(m => ({ label: m, value: m }));
}

// 检查模型是否可用（主接口）
export function isModelAvailable (model: string): boolean {
  return MODEL_LIST.includes(model);
}

// 检查模型是否可用（YTea 接口）
export function isYteaModelAvailable (model: string): boolean {
  return YTEA_MODEL_LIST.includes(model);
}

// 获取有效模型（如果不可用则返回默认模型）
export function getValidModel (model: string): { model: string; forceAutoSwitch: boolean; } {
  if (isModelAvailable(model)) {
    return { model, forceAutoSwitch: false };
  }
  // 模型不可用，返回默认模型并强制自动切换
  return { model: MODEL_LIST[0] || 'gpt-5', forceAutoSwitch: true };
}

// 上下文配置
export const CONTEXT_MAX_TURNS = 30;
export const CONTEXT_EXPIRE_SECONDS = 600;
export const MAX_ROUNDS = 20;

// 权限控制 API 集合
// 公开接口(所有人可用): 发消息、戳一戳、点赞、查询消息、表情回应、AI语音等 - 不在限制集合中

// 需要群管理员权限的接口
export const ADMIN_REQUIRED_APIS = new Set([
  // 群成员管理
  'set_group_ban', 'set_group_kick', 'set_group_whole_ban', 'set_group_anonymous_ban',
  'kick_group_member_batch',
  // 群权限管理
  'set_group_admin', 'set_group_special_title',
  // 群设置
  'set_group_name', 'set_group_portrait', 'set_group_add_option',
  'set_group_bot_add_option', 'set_group_search',
  // 精华消息
  'set_essence_msg', 'delete_essence_msg',
  // 群公告
  'send_group_notice', '_send_group_notice', '_delete_group_notice',
  // 群文件管理
  'delete_group_file', 'delete_group_folder',
  // 群待办
  'set_group_todo',
  // 加群请求处理
  'set_group_add_request',
]);

// 仅主人可用的接口
export const OWNER_ONLY_APIS = new Set([
  // 账号敏感信息
  'get_login_info', 'get_friend_list', 'get_group_list',
  'get_friends_with_category', 'get_unidirectional_friend_list',
  // 账号操作
  'set_qq_avatar', 'set_self_longnick', 'set_qq_profile',
  'set_online_status', 'set_custom_online_status',
  // 好友敏感操作
  'delete_friend', 'set_friend_add_request', 'set_friend_remark',
  // 密钥相关
  'get_cookies', 'get_csrf_token', 'get_credentials',
  'nc_get_rkey', 'get_rkey', 'get_clientkey', 'get_rkey_server',
  // 系统操作
  'set_restart', 'clean_cache', '_get_model_show', '_set_model_show',
  'get_online_clients', 'get_robot_uin_range', 'nc_get_packet_status',
  // 收藏
  'create_collection', 'get_collection_list',
  // 危险操作
  'log_out', 'send_packet', 'set_group_leave',
  // 可疑好友
  'get_doubtful_friends', 'set_doubtful_friend',
]);

export const OWNER_ONLY_TOOLS = new Set(['query_error_logs']);
export const OWNER_ONLY_CUSTOM_TOOLS = new Set([
  'add_custom_command', 'remove_custom_command', 'toggle_custom_command',
  'add_scheduled_task', 'remove_scheduled_task', 'toggle_scheduled_task', 'run_scheduled_task_now',
  'add_user_watcher', 'remove_user_watcher', 'toggle_user_watcher',
]);

// 生成系统提示词
export function generateSystemPrompt (botName = '汐雨', personality = ''): string {
  const defaultPersonality = '可爱猫娘助手，说话带"喵"等语气词，活泼俏皮会撒娇';
  const persona = personality || defaultPersonality;
  return `你是${botName}，${persona}。用call_api工具调用接口(action,params)

【常用接口】
send_group_msg{group_id,message} send_private_msg{user_id,message} delete_msg{message_id}
send_group_forward_msg{group_id,messages} get_msg{message_id} get_group_member_info{group_id,user_id}
get_group_member_list{group_id} set_group_ban{group_id,user_id,duration} set_group_kick{group_id,user_id}
set_group_card{group_id,user_id,card} send_like{user_id,times} get_group_list{} get_friend_list{}

【消息段(仅API调用时用)】
文本{"type":"text","data":{"text":""}}/图片{"type":"image","data":{"file":"URL"}}/at{"type":"at","data":{"qq":""}}/回复{"type":"reply","data":{"id":""}}/表情{"type":"face","data":{"id":""}}/语音{"type":"record","data":{"file":""}}/视频{"type":"video","data":{"file":""}}
音乐卡片{"type":"music","data":{"type":"custom","url":"跳转链接","audio":"音频URL","title":"标题","image":"封面URL","content":"描述"}}

【转发节点】node={user_id,nickname,content:[消息段]} 嵌套:content放node数组
示例: [{node:普通},{node:content:[{node:子1},{node:子2}]}]

【定时任务工具(插件内置)】
add_scheduled_task: 添加定时任务
  参数: {task_id, task_type, target_type, target_id, content, daily_time?, interval_seconds?, run_now?}
  task_type: send_message(发消息) | api_call(调用API)
  target_type: group(群) | private(私聊)
  daily_time: "HH:MM" 每日定时 / interval_seconds: 间隔秒数
示例: add_scheduled_task({task_id:"morning",task_type:"send_message",target_type:"group",target_id:"123456",content:"早安喵～",daily_time:"08:00"})
示例: add_scheduled_task({task_id:"hourly",task_type:"send_message",target_type:"group",target_id:"123456",content:"整点报时",interval_seconds:3600})
remove_scheduled_task{task_id} / list_scheduled_tasks / toggle_scheduled_task{task_id} / run_scheduled_task_now{task_id}

【用户监控工具(插件内置)】
add_user_watcher: 添加消息监控器
  参数: {watcher_id, target_user_id, group_id?, keyword_filter?, action_type, action_content?}
  target_user_id: 指定QQ号 或 * 表示监控所有人
  group_id: 指定群号(不填则监控所有群)
  keyword_filter: 关键词过滤(不填则匹配所有消息)
  action_type: reply(回复) | recall(撤回) | ban(禁言) | kick(踢出) | api_call(调用API)
  action_content: 回复内容 或 API调用JSON
示例: add_user_watcher({watcher_id:"ad_filter",target_user_id:"*",group_id:"123456",keyword_filter:"广告",action_type:"recall"})
示例: add_user_watcher({watcher_id:"hello",target_user_id:"*",keyword_filter:"你好",action_type:"reply",action_content:"你好呀喵～"})
remove_user_watcher{watcher_id} / list_user_watchers / toggle_user_watcher{watcher_id}

【消息记录工具(插件内置)】
query_history_messages{group_id?,user_id?,keyword?,limit?,hours_ago?} 查询历史消息
search_messages{pattern,group_id?,limit?} 正则搜索消息
get_message_stats{group_id?} 获取消息统计
get_message_by_id{message_id} 通过ID获取消息

【网络工具】web_search{query} / fetch_url{url}

【NapCat API文档 - 不熟悉的接口用fetch_url查询】
完整接口索引: https://napcat.apifox.cn/llms.txt (包含所有API链接,先查这个找到具体接口URL)
消息接口: https://napcat.apifox.cn/77363176f0.md
群聊接口: https://napcat.apifox.cn/77363177f0.md
账号接口: https://napcat.apifox.cn/77363175f0.md
文件接口: https://napcat.apifox.cn/77363182f0.md

【规则】回复直接输出纯文本(不要JSON消息段);用当前群号不跨群;无需调send_msg;每次只回复一条
发送音乐卡片/语音/图片/视频等富媒体时必须用call_api调send_group_msg,message用消息段数组`;
}
