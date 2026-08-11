// 类型定义

export interface PluginRule {
  name: string;
  enabled: boolean;
  suffix: string;
  replace: boolean;
  replaceText: string;
  /** 仅主人可触发该插件 */
  ownerOnly: boolean;
  /** 该插件屏蔽的群号列表 */
  blockedGroups?: string[];
  /** 该插件屏蔽的用户列表 */
  blockedUsers?: string[];
}

export interface QQBotPluginConfig {
  appid: string;
  secret: string;
  intents: string[];
  qqNumber: string;
  forceImageRehost: boolean;
  masterQQ: string;
}

export interface PluginConfig {
  enabled: boolean;
  globalSuffix: string;
  debug: boolean;
  rules: PluginRule[];
  qqbot?: QQBotPluginConfig;
  /** 全局主人QQ号（指令拦截用） */
  ownerQQ?: string;
  /** 屏蔽群列表：这些群的消息不会触发任何插件指令 */
  blockedGroups?: string[];
  /** 屏蔽用户列表：这些用户的消息不会触发任何插件指令 */
  blockedUsers?: string[];
  /** 全局官机代发开关 */
  globalReplace?: boolean;
  /** 全局仅主人开关 */
  globalOwnerOnly?: boolean;
  /** 官机返回消息内容违规时是否发送提示 */
  sendViolationNotice?: boolean;
  /** 违规提示是否由官方机器人发送；关闭时由本体发送 */
  violationNoticeByOfficial?: boolean;
}

export interface LogEntry {
  id: number;
  time: number;
  level: string;
  msg: string;
}

export interface PendingMessage {
  groupId: string;
  content: string;
  imageUrl?: string | null;
  imgWidth?: number;
  imgHeight?: number;
  rawMessage: any;
  code: string;
  timestamp: number;
  caller: string | null;
  /** 唤醒超时后用于回退原始发送的现场信息 */
  fallback?: {
    actionName: string;
    params: any;
    adapter: string;
    netConfig: any;
  };
}

export interface PendingPbExtract {
  officialBotQQ: string;
  timestamp: number;
  code: string;
  groupOpenId: string;
}

export interface GroupButtonInfo {
  buttonId: string;
  callbackData: string;
  groupOpenId: string;
  updatedAt: number;
}

export interface GroupEventIdInfo {
  eventId: string;
  groupOpenId: string;
  timestamp: number;
  /** 已使用次数（官方被动消息同一 event_id 最多回复 5 次） */
  useCount?: number;
}

export interface PendingContentInfo {
  content: string;
  imageUrl?: string | null;
  timestamp: number;
}

export interface ImageInfo {
  url?: string;
  file?: string;
  width?: number;
  height?: number;
}

/** 语音/视频媒体信息 */
export interface MediaInfo {
  type: 'record' | 'video';
  url?: string;
  file?: string;
}
