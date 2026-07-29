/**
 * QQ 官方机器人 WebSocket 桥接模块
 * 精简自 QQBot-Plugin 的 qq-official-bot SDK
 * 仅保留：连接、鉴权、心跳、收消息、发消息
 */

import WebSocket from 'ws';

// ========== 常量 ==========
const OpCode = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, HELLO: 10, HEARTBEAT_ACK: 11 } as const;
const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const API_BASE = 'https://api.sgroup.qq.com';
const GATEWAY_PATH = '/gateway/bot';
const MAX_RETRY = 10;

export interface QQBotConfig {
  appid: string;
  secret: string;
  intents: string[];
  maxRetry?: number;
  timeout?: number;
}

export interface QQBotMessage {
  type: 'group' | 'private' | 'interaction';
  group_id?: string;
  user_id: string;
  user_openid?: string;
  content: string;
  message_id: string;
  event_id?: string;
  raw: any;
}

type MsgHandler = (msg: QQBotMessage) => void;
type LogFn = (level: string, msg: string) => void;

// Intent 值映射
const IntentValues: Record<string, number> = {
  GUILDS: 1, GUILD_MEMBERS: 2, GUILD_MESSAGES: 512,
  GUILD_MESSAGE_REACTIONS: 1024, DIRECT_MESSAGE: 4096,
  C2C_MESSAGE_CREATE: 33554432, GROUP_AT_MESSAGE_CREATE: 33554432,
  INTERACTION: 67108864, PUBLIC_GUILD_MESSAGES: 1073741824,
};

export class QQBotBridge {
  private config: QQBotConfig;
  private accessToken = '';
  private wsUrl = '';
  private ws: WebSocket | null = null;
  private sessionId = '';
  private seq = 0;
  private heartbeatInterval = 0;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private retry = 0;
  private alive = false;
  private closed = false;
  private onMessage: MsgHandler;
  private log: LogFn;
  private apiBase: string;
  private selfId = '';
  private nickname = '';
  private tokenTimer: ReturnType<typeof setTimeout> | null = null;

  constructor (config: QQBotConfig, onMessage: MsgHandler, log: LogFn) {
    this.config = config;
    this.onMessage = onMessage;
    this.log = log;
    this.apiBase = API_BASE;
  }

  // ========== HTTP 工具 ==========
  private async httpPost (url: string, body: any, headers?: Record<string, string>): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  private async httpGet (url: string, headers?: Record<string, string>): Promise<any> {
    const res = await fetch(url, { headers });
    return res.json();
  }

  private authHeaders (): Record<string, string> {
    return { Authorization: `QQBot ${this.accessToken}`, 'X-Union-Appid': this.config.appid };
  }

  // ========== Token ==========
  private async refreshToken (): Promise<void> {
    try {
      const data = await this.httpPost(TOKEN_URL, { appId: this.config.appid, clientSecret: this.config.secret });
      this.accessToken = data.access_token;
      const expiresIn = (data.expires_in || 7200) - 60; // 提前 60s 刷新
      this.log('info', `QQBot token 获取成功, ${expiresIn}s 后刷新`);
      this.tokenTimer = setTimeout(() => this.refreshToken().catch(() => { }), expiresIn * 1000);
    } catch (e: any) {
      this.log('info', `QQBot token 获取失败: ${e.message}`);
      throw e;
    }
  }

  // ========== Gateway ==========
  private async getGateway (): Promise<void> {
    const data = await this.httpGet(`${this.apiBase}${GATEWAY_PATH}`, this.authHeaders());
    this.wsUrl = data.url;
    this.log('info', `QQBot gateway: ${this.wsUrl}`);
  }

  private async getBotInfo (): Promise<void> {
    try {
      const data = await this.httpGet(`${this.apiBase}/users/@me`, this.authHeaders());
      this.selfId = data.id;
      this.nickname = data.username;
      this.log('info', `QQBot 登录: ${this.nickname}(${this.selfId})`);
    } catch { /* ignore */ }
  }

  // ========== Intents ==========
  private getIntentsBitmask (): number {
    return (this.config.intents || []).reduce((r, k) => {
      const v = IntentValues[k];
      return v !== undefined ? r | v : r;
    }, 0);
  }

  // ========== WebSocket ==========
  async start (): Promise<void> {
    this.closed = false;
    await this.refreshToken();
    await this.getGateway();
    await this.getBotInfo();
    this.connect();
  }

  async stop (): Promise<void> {
    this.closed = true;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    if (this.tokenTimer) clearTimeout(this.tokenTimer);
    this.ws?.close();
    this.ws = null;
  }

  private connect (): void {
    this.ws = new WebSocket(this.wsUrl, {
      headers: { Authorization: `QQBot ${this.accessToken}`, 'X-Union-Appid': this.config.appid },
    });
    this.ws.on('open', () => this.log('info', 'QQBot WS 已连接'));
    this.ws.on('close', (code) => this.onClose(code));
    this.ws.on('error', (e) => this.log('info', `QQBot WS 错误: ${e.message}`));
    this.ws.on('message', (raw) => this.onWsMessage(raw));
  }

  private onClose (code: number): void {
    this.alive = false;
    if (this.heartbeatTimer) { clearTimeout(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.closed) return;
    if (this.retry < (this.config.maxRetry || MAX_RETRY)) {
      this.retry++;
      this.log('info', `QQBot WS 断开(${code}), 重连 #${this.retry}`);
      setTimeout(() => {
        this.refreshToken().then(() => this.getGateway()).then(() => this.connect()).catch(() => { });
      }, Math.min(this.retry * 2000, 30000));
    } else {
      this.log('info', `QQBot WS 超过最大重试(${MAX_RETRY}), 停止`);
    }
  }

  private sendWs (data: any): void {
    try { this.ws?.send(JSON.stringify(data)); } catch { /* ignore */ }
  }

  private onWsMessage (raw: any): void {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    // HELLO → 鉴权
    if (msg.op === OpCode.HELLO && msg.d?.heartbeat_interval) {
      this.heartbeatInterval = msg.d.heartbeat_interval;
      this.sendWs({
        op: OpCode.IDENTIFY,
        d: { token: `QQBot ${this.accessToken}`, intents: this.getIntentsBitmask(), shard: [0, 1] },
      });
      return;
    }

    // READY → 保存 session
    if (msg.t === 'READY') {
      const { session_id, user } = msg.d || {};
      if (session_id) this.sessionId = session_id;
      if (msg.s) this.seq = msg.s;
      this.retry = 0;
      this.alive = true;
      this.log('info', `QQBot WS 鉴权通过, session=${session_id}`);
      this.sendHeartbeat();
      return;
    }

    // 心跳 ACK
    if (msg.op === OpCode.HEARTBEAT_ACK || msg.t === 'RESUMED') {
      this.alive = true;
      this.scheduleHeartbeat();
      return;
    }

    // 重连通知
    if (msg.op === OpCode.RECONNECT) {
      this.log('info', 'QQBot 服务端要求重连');
      this.ws?.close();
      return;
    }

    // 事件分发
    if (msg.op === OpCode.DISPATCH) {
      if (msg.s) this.seq = msg.s;
      this.dispatchEvent(msg.t, msg.d, msg.id);
    }
  }

  private sendHeartbeat (): void {
    this.sendWs({ op: OpCode.HEARTBEAT, d: this.seq || null });
    this.scheduleHeartbeat();
  }

  private scheduleHeartbeat (): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatInterval);
  }

  // ========== 事件处理 ==========
  private dispatchEvent (type: string, payload: any, eventId?: string): void {
    if (!payload) return;
    switch (type) {
      case 'GROUP_AT_MESSAGE_CREATE':
        this.onMessage({
          type: 'group',
          group_id: payload.group_id,
          user_id: payload.author?.id || '',
          user_openid: payload.author?.member_openid,
          content: (payload.content || '').replace(/<@!\w+>\s*/g, '').trim(),
          message_id: payload.id,
          event_id: eventId,
          raw: payload,
        });
        break;
      case 'C2C_MESSAGE_CREATE':
        this.onMessage({
          type: 'private',
          user_id: payload.author?.id || '',
          user_openid: payload.author?.user_openid,
          content: (payload.content || '').trim(),
          message_id: payload.id,
          event_id: eventId,
          raw: payload,
        });
        break;
      case 'INTERACTION_CREATE':
        this.log('info', `QQBot 收到 INTERACTION 事件: ${JSON.stringify(payload)}`);
        this.onMessage({
          type: 'interaction',
          group_id: payload.group_openid || payload.group_id,
          user_id: payload.group_member_openid || payload.user_openid || '',
          content: payload.data?.resolved?.button_data || '',
          message_id: payload.id || '',
          event_id: eventId,
          raw: payload,
        });
        break;
    }
  }

  // ========== 发送消息 ==========
  async sendGroupMsg (groupId: string, content: string, source?: { id?: string; event_id?: string; }): Promise<any> {
    const body: any = {
      content,
      msg_type: 0,
      msg_seq: Math.floor(Math.random() * 1000000),
    };
    if (source?.id) body.msg_id = source.id;
    else if (source?.event_id) body.event_id = source.event_id;
    try {
      return await this.httpPost(`${this.apiBase}/v2/groups/${groupId}/messages`, body, this.authHeaders());
    } catch (e: any) {
      this.log('info', `QQBot 发送群消息失败: ${e.message}`);
      return null;
    }
  }

  async sendPrivateMsg (userId: string, content: string, source?: { id?: string; event_id?: string; }): Promise<any> {
    const body: any = {
      content,
      msg_type: 0,
      msg_seq: Math.floor(Math.random() * 1000000),
    };
    if (source?.id) body.msg_id = source.id;
    else if (source?.event_id) body.event_id = source.event_id;
    try {
      return await this.httpPost(`${this.apiBase}/v2/users/${userId}/messages`, body, this.authHeaders());
    } catch (e: any) {
      this.log('info', `QQBot 发送私聊消息失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 发送原生 markdown + 自定义键盘按钮消息（群聊）
   * msg_type: 2 = markdown
   */
  async sendGroupMarkdownMsg (groupId: string, content: string, keyboard?: any, source?: { id?: string; event_id?: string; }): Promise<any> {
    const body: any = {
      msg_type: 2,
      msg_seq: Math.floor(Math.random() * 1000000),
      markdown: { content: content || '1' },
    };
    if (keyboard) body.keyboard = keyboard;
    // 被动消息回复：优先用 msg_id（普通消息），event_id 仅用于事件回调
    if (source?.id) body.msg_id = source.id;
    else if (source?.event_id) body.event_id = source.event_id;
    try {
      this.log('info', `QQBot markdown 请求体: ${JSON.stringify(body)}`);
      const result = await this.httpPost(`${this.apiBase}/v2/groups/${groupId}/messages`, body, this.authHeaders());
      this.log('info', `QQBot markdown 响应: ${JSON.stringify(result)}`);
      return result;
    } catch (e: any) {
      this.log('info', `QQBot 发送 markdown 群消息失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 发送原生 markdown + 自定义键盘按钮消息（私聊）
   */
  async sendPrivateMarkdownMsg (userId: string, content: string, keyboard?: any, source?: { id?: string; event_id?: string; }): Promise<any> {
    const body: any = {
      msg_type: 2,
      msg_seq: Math.floor(Math.random() * 1000000),
      markdown: { content: content || '1' },
    };
    if (keyboard) body.keyboard = keyboard;
    if (source?.id) body.msg_id = source.id;
    else if (source?.event_id) body.event_id = source.event_id;
    try {
      const result = await this.httpPost(`${this.apiBase}/v2/users/${userId}/messages`, body, this.authHeaders());
      this.log('info', `QQBot 发送 markdown 私聊消息成功: user=${userId}`);
      return result;
    } catch (e: any) {
      this.log('info', `QQBot 发送 markdown 私聊消息失败: ${e.message}`);
      return null;
    }
  }

  // ========== 富媒体（语音/视频/图片）==========

  /**
   * 上传富媒体文件到 QQ 服务器
   * file_type: 1=图片, 2=视频, 3=语音
   * 返回 file_info 字符串（用于后续发送）
   */
  async uploadGroupMedia (groupId: string, fileData: string, fileType: number, isUrl = false): Promise<string | null> {
    try {
      const body: any = { srv_send_msg: false, file_type: fileType };
      if (isUrl) body.url = fileData;
      else body.file_data = fileData;
      const result = await this.httpPost(`${this.apiBase}/v2/groups/${groupId}/files`, body, this.authHeaders());
      const fileInfo = result?.file_info;
      if (fileInfo) {
        this.log('info', `QQBot 上传媒体成功: type=${fileType}, group=${groupId}`);
        return fileInfo;
      }
      this.log('info', `QQBot 上传媒体失败: ${JSON.stringify(result)}`);
      return null;
    } catch (e: any) {
      this.log('info', `QQBot 上传媒体异常: ${e.message}`);
      return null;
    }
  }

  /**
   * 发送富媒体消息（msg_type=7）
   * 用于语音、视频等需要先 upload 再发送的消息
   */
  async sendGroupMediaMsg (groupId: string, fileInfo: string, content?: string, source?: { id?: string; event_id?: string; }): Promise<any> {
    const body: any = {
      msg_type: 7,
      msg_seq: Math.floor(Math.random() * 1000000),
      content: content || '',
      media: { file_info: fileInfo },
    };
    if (source?.id) body.msg_id = source.id;
    else if (source?.event_id) body.event_id = source.event_id;
    try {
      this.log('info', `QQBot 富媒体消息请求: group=${groupId}, type=7`);
      const result = await this.httpPost(`${this.apiBase}/v2/groups/${groupId}/messages`, body, this.authHeaders());
      this.log('info', `QQBot 富媒体消息响应: ${JSON.stringify(result)}`);
      return result;
    } catch (e: any) {
      this.log('info', `QQBot 发送富媒体消息失败: ${e.message}`);
      return null;
    }
  }

  // ========== 状态 ==========
  isConnected (): boolean { return this.alive; }
  getSelfId (): string { return this.selfId; }
  getNickname (): string { return this.nickname; }
}
