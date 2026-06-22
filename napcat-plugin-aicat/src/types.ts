export interface ChannelModelInfo {
  id: string;
  enabled: boolean;
}

export interface ChannelConfig {
  name: string;
  base_url: string;
  api_key: string;
  models_cache: string[];
  models_cache_path?: string;
  enabled_models: ChannelModelInfo[];
  timeout?: number;
}

export interface ImageChannelConfig {
  name: string;
  base_url: string;
  api_key: string;
  provider_type: 'openai' | 'gemini' | 'gemini_openai' | 'z_image_gitee' | 'jimeng2api' | 'grok';
  models_cache: string[];
  models_cache_path?: string;
  enabled_models: ChannelModelInfo[];
  timeout?: number;
  proxy?: string;
  capability_options?: {
    text_to_image?: boolean;
    image_to_image?: boolean;
    aspect_ratio?: boolean;
    resolution?: boolean;
  };
  extra?: Record<string, unknown>;
}

export interface PluginConfig {
  prefix: string;
  enableReply: boolean;
  sendConfirmMessage: boolean;
  botName: string;
  personality: string;
  confirmMessage: string;
  maxContextTurns: number;
  ownerQQs: string;
  whitelistQQs: string[];
  debug: boolean;
  allowPublicPacket: boolean;
  autoSwitchModel: boolean;
  allowAtTrigger: boolean;
  safetyFilter: boolean;
  disabledGroups: string[];

  webEnable: boolean;
  webPort: number;
  webToken: string;

  chatChannels: ChannelConfig[];
  enabledChatModelPriority: string[];

  imageChannels: ImageChannelConfig[];
  enabledImageModelPriority: string[];

  imageEnableLLMTool: boolean;
  imageDefaultAspectRatio: string;
  imageDefaultResolution: string;
  imageMaxConcurrentTasks: number;
  imageGlobalTimeoutMs?: number;
  imageShowGenerationInfo: boolean;
  imageShowModelInfo: boolean;
  imageRateLimitSeconds: number;
  imageEnableDailyLimit: boolean;
  imageDailyLimitCount: number;
  imageMaxImageSizeMB: number;
  imageMaxCacheCount?: number;
  imageUmoBlacklist: string[];
  ocrModel?: string;
  imageBlacklistBlockMessage: string;

  imageAuditWhitelist?: string[];
  imagePromptBlockedWords?: string[];
  imageEnablePromptAudit?: boolean;
  imageEnableOutputAudit?: boolean;
  imagePromptAuditModel?: string;
  imageOutputAuditModel?: string;
  imagePromptAuditTemplate?: string;
  imageOutputAuditTemplate?: string;

  randomReplyChancePercent?: number;
  randomActiveMessageCount?: number;
  randomActiveIntervalMinutes?: number;
  randomIgnoreQQs?: string[];

  [key: string]: unknown;
}

export interface AIConfig {
  base_url: string;
  api_key: string;
  model: string;
  timeout: number;
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[]; default?: unknown; }>;
    required?: string[];
  };
}

export interface Tool { type: 'function'; function: ToolFunction; }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string; }; }
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | unknown[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}
export interface AIResponse { choices: { message: AIMessage; finish_reason: string; }[]; error?: string; detail?: string; }
export interface ToolResult { success: boolean; data?: unknown; error?: string; message?: string; count?: number; }

export interface CustomCommand {
  pattern: string;
  response_type: 'text' | 'api';
  response_content: string;
  api_url?: string;
  api_method?: 'GET' | 'POST';
  api_extract?: string;
  description?: string;
  enabled: boolean;
  created_at: string;
}

export interface ScheduledTask {
  task_type: 'send_message' | 'api_call';
  target_type: 'group' | 'private';
  target_id: string;
  content: string;
  interval_seconds: number;
  daily_time: string;
  repeat: boolean;
  description?: string;
  enabled: boolean;
  created_at: string;
  last_run: string | null;
  run_count: number;
}

export interface UserWatcher {
  target_user_id: string;
  action_type: 'reply' | 'recall' | 'ban' | 'kick' | 'api_call';
  action_content: string;
  group_id: string;
  keyword_filter: string;
  description?: string;
  cooldown_seconds: number;
  enabled: boolean;
  created_at: string;
  last_triggered: string | null;
  trigger_count: number;
}

export interface UserPermission {
  is_admin: boolean;
  is_owner: boolean;
  role: 'owner' | 'admin' | 'member';
}

export interface ContextInfo {
  turns: number;
  messages: number;
  expired: boolean;
}

export interface MessageLog {
  message_id: string;
  user_id: string;
  user_name: string;
  group_id: string;
  group_name: string;
  message_type: 'private' | 'group';
  content: string;
  raw_message: string;
  timestamp: number;
}

export interface ActionMap {
  call: (action: string, params: unknown, adapter: string, config: unknown) => Promise<unknown>;
  get: (action: string) => unknown;
}

export interface ChatModelTarget {
  channelName: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  timeout: number;
}

export interface ImageModelTarget {
  channelName: string;
  model: string;
  providerType: ImageChannelConfig['provider_type'];
  baseUrl: string;
  apiKey: string;
  timeout: number;
  proxy?: string;
  capability_options?: ImageChannelConfig['capability_options'];
  extra?: Record<string, unknown>;
}

export interface ImageGenerateRequest {
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  images?: { data: Uint8Array; mime_type: string; }[];
  task_id?: string;
}

export interface ImageGenerateResult {
  images?: Uint8Array[];
  error?: string;
}

export type ImageProviderType = ImageModelTarget['providerType'];
