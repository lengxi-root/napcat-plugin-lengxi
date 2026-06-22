import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

let WHITELIST_FILE = '';
let configOwners: string[] = [];
let configWhitelist: string[] = [];
let dynamicWhitelist: string[] = [];
let napCatLogger: ((msg: string) => void) | null = null;

const pendingWhitelistVerifications: Map<string, { code: string; expireTime: number }> = new Map();

export const setNapCatLogger = (logger: (msg: string) => void) => { napCatLogger = logger; };

function normalizeListFromText (text: string): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(v => String(v).trim()).filter(Boolean);
    }
  } catch {}

  let body = raw;

  if (body.startsWith('[') && body.endsWith(']')) {
    body = body.slice(1, -1).trim();
  }

  body = body
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/["']/g, '');

  return body.split(/[,，、\/\s\n\r\t]+/).map(v => v.trim()).filter(Boolean);
}

function normalizeListFromUnknown (value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }

  return normalizeListFromText(String(value || ''));
}

function uniq (list: string[]): string[] {
  return [...new Set(list.map(v => String(v).trim()).filter(Boolean))];
}

export function setConfigOwners (ownerQQs: string): void {
  configOwners = uniq(normalizeListFromText(ownerQQs));
}

export function setConfigWhitelist (list: unknown): void {
  configWhitelist = uniq(normalizeListFromUnknown(list));
}

export function initOwnerDataDir (dataPath: string): void {
  if (!existsSync(dataPath)) mkdirSync(dataPath, { recursive: true });

  WHITELIST_FILE = join(dataPath, 'whitelist.json');

  if (existsSync(WHITELIST_FILE)) {
    try {
      const data = JSON.parse(readFileSync(WHITELIST_FILE, 'utf-8'));
      dynamicWhitelist = Array.isArray(data) ? uniq(data.map(v => String(v))) : [];
    } catch {
      dynamicWhitelist = [];
    }
  }
}

function saveWhitelist (): void {
  if (!WHITELIST_FILE) return;

  const dir = dirname(WHITELIST_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(WHITELIST_FILE, JSON.stringify(uniq(dynamicWhitelist), null, 2), 'utf-8');
}

function generateCode (): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export const isOwner = (userId: string): boolean => {
  const uid = String(userId).trim();
  return configOwners.includes(uid);
};

export const isWhitelisted = (userId: string): boolean => {
  const uid = String(userId).trim();
  if (!uid) return false;
  if (isOwner(uid)) return true;
  return configWhitelist.includes(uid) || dynamicWhitelist.includes(uid);
};

export const isPrivilegedUser = (userId: string): boolean => {
  return isOwner(userId) || isWhitelisted(userId);
};

export const getAllOwners = (): string[] => uniq(configOwners);

export const getAllWhitelist = (): string[] => uniq([
  ...configWhitelist,
  ...dynamicWhitelist,
]);

export function addWhitelist (operatorId: string, targetId: string): { success: boolean; message: string } {
  if (!isOwner(operatorId)) {
    return { success: false, message: '只有核心主人可以添加白名单喵～' };
  }

  const target = String(targetId || '').trim();
  if (!/^\d{5,12}$/.test(target)) {
    return { success: false, message: 'QQ号格式不正确喵～' };
  }

  if (isOwner(target)) {
    return { success: false, message: '该用户已经是核心主人，无需加入白名单喵～' };
  }

  if (dynamicWhitelist.includes(target) || configWhitelist.includes(target)) {
    return { success: false, message: '该用户已经在白名单里喵～' };
  }

  dynamicWhitelist.push(target);
  dynamicWhitelist = uniq(dynamicWhitelist);
  saveWhitelist();

  return { success: true, message: `✅ 已将 ${target} 加入白名单喵～` };
}

export function removeWhitelist (operatorId: string, targetId: string): { success: boolean; message: string } {
  if (!isOwner(operatorId)) {
    return { success: false, message: '只有核心主人可以移除白名单喵～' };
  }

  const target = String(targetId || '').trim();

  if (configWhitelist.includes(target)) {
    return { success: false, message: '该用户来自配置白名单，请在配置页中删除喵～' };
  }

  const index = dynamicWhitelist.indexOf(target);
  if (index === -1) {
    return { success: false, message: '该用户不在动态白名单里喵～' };
  }

  dynamicWhitelist.splice(index, 1);
  saveWhitelist();

  return { success: true, message: `✅ 已将 ${target} 移出白名单喵～` };
}

export function startWhitelistVerification (userId: string): { success: boolean; code?: string; message: string } {
  const uid = String(userId).trim();

  if (isOwner(uid)) {
    return { success: false, message: '你已经是核心主人了喵～' };
  }

  if (isWhitelisted(uid)) {
    return { success: false, message: '你已经在白名单里了喵～' };
  }

  const code = generateCode();
  pendingWhitelistVerifications.set(uid, { code, expireTime: Date.now() + 5 * 60 * 1000 });

  const log = `[AI Cat] 白名单验证 | 用户: ${uid} | 验证码: ${code} | 有效期: 5分钟`;
  if (napCatLogger) napCatLogger(log);
  console.log(log);

  return {
    success: true,
    code,
    message: '白名单验证码已生成并输出到 NapCat 日志中喵～\n请在5分钟内发送：加白 <验证码>',
  };
}

export function verifyWhitelistCode (userId: string, inputCode: string): { success: boolean; message: string } {
  const uid = String(userId).trim();

  if (isOwner(uid)) {
    return { success: false, message: '你已经是核心主人了喵～' };
  }

  if (isWhitelisted(uid)) {
    return { success: false, message: '你已经在白名单里了喵～' };
  }

  const pending = pendingWhitelistVerifications.get(uid);

  if (!pending) {
    return { success: false, message: '没有找到白名单验证请求，请先发送「加白」喵～' };
  }

  if (Date.now() > pending.expireTime) {
    pendingWhitelistVerifications.delete(uid);
    return { success: false, message: '验证码已过期喵～' };
  }

  if (inputCode.trim() !== pending.code) {
    return { success: false, message: '验证码错误喵～' };
  }

  dynamicWhitelist.push(uid);
  dynamicWhitelist = uniq(dynamicWhitelist);
  saveWhitelist();

  pendingWhitelistVerifications.delete(uid);

  return { success: true, message: '🎉 验证成功！你已加入白名单喵～' };
}

export function listOwners (): { default: string[]; dynamic: string[]; total: number } {
  return {
    default: getAllOwners(),
    dynamic: [],
    total: getAllOwners().length,
  };
}

export function listWhitelist (): {
  config: string[];
  dynamic: string[];
  total: number;
} {
  return {
    config: [...configWhitelist],
    dynamic: [...dynamicWhitelist],
    total: getAllWhitelist().length,
  };
}

export function startOwnerVerification (userId: string): { success: boolean; code?: string; message: string } {
  return startWhitelistVerification(userId);
}

export function verifyOwnerCode (userId: string, inputCode: string): { success: boolean; message: string } {
  return verifyWhitelistCode(userId, inputCode);
}

export function removeOwner (_operatorId: string, _targetId: string): { success: boolean; message: string } {
  return { success: false, message: '动态主人已改为白名单；核心主人只能在 NapCat 插件配置中修改喵～' };
}

export function cleanupExpiredVerifications (): void {
  const now = Date.now();

  for (const [userId, pending] of pendingWhitelistVerifications) {
    if (now > pending.expireTime) pendingWhitelistVerifications.delete(userId);
  }
}
