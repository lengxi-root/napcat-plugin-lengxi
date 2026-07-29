// 共享可变状态
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { QQBotBridge } from '../qqbot-ws';
import type {
  PluginConfig, LogEntry, PendingMessage, PendingPbExtract,
  GroupButtonInfo, GroupEventIdInfo, PendingContentInfo,
} from './types';

export const DEFAULT_CONFIG: PluginConfig = {
  enabled: true, globalSuffix: '', debug: false, rules: [],
  qqbot: {
    appid: '', secret: '',
    intents: ['GROUP_AT_MESSAGE_CREATE', 'C2C_MESSAGE_CREATE', 'INTERACTION'],
    qqNumber: '',
    forceImageRehost: false, masterQQ: '',
  },
  ownerQQ: '',
  blockedGroups: [],
  blockedUsers: [],
  globalReplace: false,
  globalOwnerOnly: false,
};

export const state = {
  config: { ...DEFAULT_CONFIG, rules: [] } as PluginConfig,
  logger: console as any,
  configPath: '',
  originalCall: null as any,
  sourceActionsRef: null as any,
  pluginManagerRef: null as any,
  qqbotBridge: null as QQBotBridge | null,
  ctxRef: null as NapCatPluginContext | null,
  wildBotQQ: '',
  puppeteerBaseUrl: '',
};

export const originalHandles = new Map<string, Function>();
export const logBuffer: LogEntry[] = [];
export const MAX_LOGS = 500;

export const pendingMessages = new Map<string, PendingMessage>();
export const PENDING_TIMEOUT = 30000;

export const pendingPbExtracts = new Map<string, PendingPbExtract>();

export const groupButtonMap = new Map<string, GroupButtonInfo>();

export const groupEventIdCache = new Map<string, GroupEventIdInfo>();
export const EVENT_ID_TTL = 270000; // 4分30秒

export const eventIdWaiters = new Map<string, {
  resolve: (eventId: string) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

export const pendingContentAfterAwaken = new Map<string, PendingContentInfo>();

export const ONEBOT_RULE_NAME = 'OneBot 外部调用';
