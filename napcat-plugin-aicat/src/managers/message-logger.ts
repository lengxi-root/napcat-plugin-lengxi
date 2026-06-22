import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface MessageRecord {
  id?: number;
  message_id: string;
  user_id: string;
  user_name: string;
  group_id: string;
  group_name: string;
  message_type: 'private' | 'group';
  content: string;
  raw_message: string;
  timestamp: number;
  created_at: string;
}

export interface QueryOptions {
  user_id?: string;
  group_id?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
  start_time?: number;
  end_time?: number;
}

interface LogFileData {
  nextId: number;
  messages: MessageRecord[];
  savedAt: string;
}

const messageCache: Map<string, MessageRecord[]> = new Map();
const nextIdCache: Map<string, number> = new Map();
const dirtyFiles: Set<string> = new Set();

let LOG_DIR = '';

const SAVE_INTERVAL = 60000; // 自动保存间隔（毫秒）
const MAX_MESSAGES_PER_FILE = 5000; // 每个文件最大消息数
let saveTimer: ReturnType<typeof setInterval> | null = null;

function getLogFilePath (messageType: 'private' | 'group', targetId: string): string {
  const filename = messageType === 'group' ? `group_${targetId}.json` : `private_${targetId}.json`;
  return join(LOG_DIR, filename);
}

function getCacheKey (messageType: 'private' | 'group', targetId: string): string {
  return messageType === 'group' ? `group_${targetId}` : `private_${targetId}`;
}

function loadLogFile (cacheKey: string): MessageRecord[] {
  if (messageCache.has(cacheKey)) {
    return messageCache.get(cacheKey)!;
  }

  const filePath = join(LOG_DIR, `${cacheKey}.json`);

  if (!existsSync(filePath)) {
    messageCache.set(cacheKey, []);
    nextIdCache.set(cacheKey, 1);
    return [];
  }

  try {
    const data: LogFileData = JSON.parse(readFileSync(filePath, 'utf-8'));
    const messages = Array.isArray(data.messages) ? data.messages : [];
    messageCache.set(cacheKey, messages);
    nextIdCache.set(cacheKey, data.nextId || (messages.length > 0 ? Math.max(...messages.map(m => m.id || 0)) + 1 : 1));
    return messages;
  } catch (error) {
    console.error(`[MessageLogger] 加载日志文件失败 ${cacheKey}:`, error);
    messageCache.set(cacheKey, []);
    nextIdCache.set(cacheKey, 1);
    return [];
  }
}

function saveLogFile (cacheKey: string): void {
  const messages = messageCache.get(cacheKey);
  if (!messages) return;

  const filePath = join(LOG_DIR, `${cacheKey}.json`);

  try {
    const data: LogFileData = {
      nextId: nextIdCache.get(cacheKey) || 1,
      messages,
      savedAt: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[MessageLogger] 保存日志文件失败 ${cacheKey}:`, error);
  }
}

function saveAllDirtyFiles (): void {
  for (const cacheKey of dirtyFiles) {
    saveLogFile(cacheKey);
  }
  dirtyFiles.clear();
}

export async function initMessageLogger (dataPath: string): Promise<boolean> {
  try {
    LOG_DIR = join(dataPath, 'log');

    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }

    saveTimer = setInterval(() => {
      if (dirtyFiles.size > 0) {
        saveAllDirtyFiles();
      }
    }, SAVE_INTERVAL);

    console.log(`[MessageLogger] 已初始化，日志目录: ${LOG_DIR}`);
    return true;
  } catch (error) {
    console.error('[MessageLogger] 初始化失败:', error);
    return false;
  }
}

export function logMessage (record: Omit<MessageRecord, 'id' | 'created_at'>): void {
  const targetId = record.message_type === 'group' ? record.group_id : record.user_id;

  if (!targetId) return;

  const cacheKey = getCacheKey(record.message_type, targetId);
  const messages = loadLogFile(cacheKey);

  const created_at = new Date().toISOString();
  const nextId = nextIdCache.get(cacheKey) || 1;

  messages.push({
    ...record,
    id: nextId,
    created_at,
  });

  nextIdCache.set(cacheKey, nextId + 1);

  if (messages.length > MAX_MESSAGES_PER_FILE) {
    messages.splice(0, messages.length - MAX_MESSAGES_PER_FILE);
  }

  dirtyFiles.add(cacheKey);
}

export function queryMessages (options: QueryOptions = {}): MessageRecord[] {
  const {
    user_id,
    group_id,
    keyword,
    limit = 20,
    offset = 0,
    start_time,
    end_time,
  } = options;

  let results: MessageRecord[] = [];

  if (group_id) {
    const cacheKey = getCacheKey('group', group_id);
    results = [...loadLogFile(cacheKey)];
  }
  else if (user_id && !group_id) {
    const cacheKey = getCacheKey('private', user_id);
    results = [...loadLogFile(cacheKey)];
  }
  else {
    try {
      const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const cacheKey = file.replace('.json', '');
        const messages = loadLogFile(cacheKey);
        results.push(...messages);
      }
    } catch {
    }
  }

  if (user_id) {
    results = results.filter(m => m.user_id === user_id);
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    results = results.filter(m => m.content.toLowerCase().includes(kw));
  }

  if (start_time) {
    results = results.filter(m => m.timestamp >= start_time);
  }
  if (end_time) {
    results = results.filter(m => m.timestamp <= end_time);
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return results.slice(offset, offset + limit);
}

export function getMessageStats (group_id?: string): {
  total: number;
  today: number;
  users: number;
  files: number;
} {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = Math.floor(todayStart.getTime() / 1000);

  let results: MessageRecord[] = [];
  let fileCount = 0;

  if (group_id) {
    const cacheKey = getCacheKey('group', group_id);
    results = loadLogFile(cacheKey);
    fileCount = 1;
  } else {
    try {
      const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));
      fileCount = files.length;
      for (const file of files) {
        const cacheKey = file.replace('.json', '');
        const messages = loadLogFile(cacheKey);
        results.push(...messages);
      }
    } catch {
    }
  }

  const users = new Set(results.map(m => m.user_id));
  const today = results.filter(m => m.timestamp >= todayTs).length;

  return {
    total: results.length,
    today,
    users: users.size,
    files: fileCount,
  };
}

export function getMessageById (message_id: string): MessageRecord | null {
  try {
    const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const cacheKey = file.replace('.json', '');
      const messages = loadLogFile(cacheKey);
      const found = messages.find(m => m.message_id === message_id);
      if (found) return found;
    }
  } catch {
  }
  return null;
}

export function cleanupOldMessages (days: number = 7): number {
  const cutoff = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  let totalDeleted = 0;

  try {
    const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const cacheKey = file.replace('.json', '');
      const messages = loadLogFile(cacheKey);
      const before = messages.length;

      const filtered = messages.filter(m => m.timestamp >= cutoff);
      const deleted = before - filtered.length;

      if (deleted > 0) {
        messageCache.set(cacheKey, filtered);
        dirtyFiles.add(cacheKey);
        totalDeleted += deleted;
      }
    }
  } catch {
  }

  return totalDeleted;
}

export function closeMessageLogger (): void {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }

  saveAllDirtyFiles();
}

export function getStorageType (): 'json' | 'memory' {
  return LOG_DIR ? 'json' : 'memory';
}

export function getLogDirectory (): string {
  return LOG_DIR;
}

export function getLogFiles (): { name: string; type: 'group' | 'private'; id: string; count: number; }[] {
  const result: { name: string; type: 'group' | 'private'; id: string; count: number; }[] = [];

  try {
    const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const cacheKey = file.replace('.json', '');
      const messages = loadLogFile(cacheKey);

      let type: 'group' | 'private' = 'group';
      let id = '';

      if (cacheKey.startsWith('group_')) {
        type = 'group';
        id = cacheKey.replace('group_', '');
      } else if (cacheKey.startsWith('private_')) {
        type = 'private';
        id = cacheKey.replace('private_', '');
      }

      result.push({
        name: file,
        type,
        id,
        count: messages.length,
      });
    }
  } catch {
  }

  return result;
}

export function searchMessages (pattern: string, options: QueryOptions = {}): MessageRecord[] {
  const { group_id, user_id, limit = 20 } = options;

  let results: MessageRecord[] = [];

  if (group_id) {
    const cacheKey = getCacheKey('group', group_id);
    results = [...loadLogFile(cacheKey)];
  } else if (user_id) {
    const cacheKey = getCacheKey('private', user_id);
    results = [...loadLogFile(cacheKey)];
  } else {
    try {
      const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const cacheKey = file.replace('.json', '');
        const messages = loadLogFile(cacheKey);
        results.push(...messages);
      }
    } catch {
    }
  }

  if (user_id && group_id) {
    results = results.filter(m => m.user_id === user_id);
  }

  try {
    const regex = new RegExp(pattern, 'i');
    results = results.filter(m => regex.test(m.content));
  } catch {
    const kw = pattern.toLowerCase();
    results = results.filter(m => m.content.toLowerCase().includes(kw));
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return results.slice(0, limit);
}
