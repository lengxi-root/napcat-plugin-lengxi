import type { AIConfig, PluginConfig, ChannelConfig, ImageChannelConfig } from './types';

export let PLUGIN_VERSION = '0.0.0';
export function setPluginVersion (version: string): void { PLUGIN_VERSION = version; }

export const DEFAULT_CHAT_CHANNELS: ChannelConfig[] = [];
export const DEFAULT_IMAGE_CHANNELS: ImageChannelConfig[] = [];

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  prefix: '/',
  enableReply: true,
  sendConfirmMessage: true,
  botName: '汐雨',
  personality: '可爱猫娘助手，说话带"喵"等语气词，活泼俏皮会撒娇',
  confirmMessage: '汐雨收到喵～',
  maxContextTurns: 30,
  ownerQQs: '',
  whitelistQQs: [],
  debug: false,
  allowPublicPacket: true,
  allowAtTrigger: false,
  safetyFilter: true,
  disabledGroups: [],
  autoSwitchModel: true,

  webEnable: true,
  webPort: 14514,
  webToken: 'changeme',

  chatChannels: DEFAULT_CHAT_CHANNELS,
  enabledChatModelPriority: [],

  imageChannels: DEFAULT_IMAGE_CHANNELS,
  enabledImageModelPriority: [],

  imageEnableLLMTool: true,
  imageDefaultAspectRatio: '自动',
  imageDefaultResolution: '1K',
  imageMaxConcurrentTasks: 3,
  imageGlobalTimeoutMs: 180000,
  imageShowGenerationInfo: false,
  imageShowModelInfo: false,
  imageRateLimitSeconds: 0,
  imageEnableDailyLimit: false,
  imageDailyLimitCount: 10,
  imageMaxImageSizeMB: 10,
  imageMaxCacheCount: 100,
  imageUmoBlacklist: [],
  imageBlacklistBlockMessage: '❌ 当前会话未启用生图功能',
  ocrModel: '',
  imageAuditWhitelist: [],
  imagePromptBlockedWords: [],
  imageEnablePromptAudit: false,
  imageEnableOutputAudit: false,
  imagePromptAuditModel: '',
  imageOutputAuditModel: '',
  imagePromptAuditTemplate: '你是生图安全审核员。请判断以下提示词是否安全。提示词：{prompt}。仅输出 JSON：{"allow":true/false,"reason":"原因"}',
  imageOutputAuditTemplate: '你是图像安全审核员。请判断以下图片是否适合普通用户。仅输出 JSON：{"allow":true/false,"reason":"原因"}',

  randomReplyChancePercent: 0,
  randomActiveMessageCount: 50,
  randomActiveIntervalMinutes: 0,
  randomIgnoreQQs: [],
} as PluginConfig;

export const DEFAULT_AI_CONFIG: AIConfig = {
  base_url: 'https://api.openai.com/v1/chat/completions',
  api_key: '',
  model: 'gpt-4o',
  timeout: 60000,
};

export let MODEL_LIST: string[] = [];
export let YTEA_MODEL_LIST: string[] = [];

export const CONTEXT_MAX_TURNS = 30;
export const CONTEXT_EXPIRE_SECONDS = 600;
export const MAX_ROUNDS = 20;

export const ADMIN_REQUIRED_APIS = new Set([
  'set_group_ban',
  'set_group_kick',
  'set_group_whole_ban',
  'set_group_anonymous_ban',
  'kick_group_member_batch',
  'set_group_admin',
  'set_group_special_title',
  'set_group_name',
  'set_group_portrait',
  'set_group_add_option',
  'set_group_bot_add_option',
  'set_group_search',
  'set_essence_msg',
  'delete_essence_msg',
  'send_group_notice',
  '_send_group_notice',
  '_delete_group_notice',
  'delete_group_file',
  'delete_group_folder',
  'set_group_todo',
  'set_group_add_request',
]);

export const OWNER_ONLY_APIS = new Set([
  'get_login_info',
  'get_friend_list',
  'get_group_list',
  'get_friends_with_category',
  'get_unidirectional_friend_list',
  'set_qq_avatar',
  'set_self_longnick',
  'set_qq_profile',
  'set_online_status',
  'set_custom_online_status',
  'delete_friend',
  'set_friend_add_request',
  'set_friend_remark',
  'get_cookies',
  'get_csrf_token',
  'get_credentials',
  'nc_get_rkey',
  'get_rkey',
  'get_clientkey',
  'get_rkey_server',
  'set_restart',
  'clean_cache',
  '_get_model_show',
  '_set_model_show',
  'get_online_clients',
  'get_robot_uin_range',
  'nc_get_packet_status',
  'create_collection',
  'get_collection_list',
  'log_out',
  'send_packet',
  'set_group_leave',
  'get_doubtful_friends',
  'set_doubtful_friend',
]);

export const OWNER_ONLY_TOOLS = new Set([
  'query_error_logs',
]);

export const OWNER_ONLY_CUSTOM_TOOLS = new Set([
  'add_custom_command',
  'remove_custom_command',
  'toggle_custom_command',

  'add_scheduled_task',
  'remove_scheduled_task',
  'toggle_scheduled_task',
  'run_scheduled_task_now',

  'add_user_watcher',
  'remove_user_watcher',
  'toggle_user_watcher',
]);

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

【转发节点】
node={user_id,nickname,content:[消息段]}
嵌套转发：content 放 node 数组

【插件工具】
- 历史消息查询
- 自定义指令管理
- 定时任务管理
- 用户监控管理
- 网络搜索与网页抓取
- 生图工具（如已启用）

【配置规则】
基础开关、主人、白名单、生图限额、黑名单、审核、Web服务等配置在 NapCat 插件配置页或 Web 配置页修改。
渠道、模型缓存、启用模型、模型优先级由核心主人通过群聊指令管理。
普通用户不能通过 AI 工具修改配置、渠道、模型、检测器或定时任务。

【规则】
回复直接输出纯文本，不要输出 JSON 消息段。
用当前群号，不跨群。
无需调用 send_msg。
每次只回复一条。
发送音乐卡片、语音、图片、视频等富媒体时，必须用 call_api 调 send_group_msg 或 send_private_msg，message 使用消息段数组。`;
}
