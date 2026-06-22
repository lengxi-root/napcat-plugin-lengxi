import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import {
  normalizeMusicServer,
  searchMusicListForSession,
  selectMusicFromSession,
  switchMusicPlatformForSession,
  type MusicServer,
} from '../tools/music-tools';
import { sendReply } from '../utils/message';

function detectPlatform(cmd: string): MusicServer {
  const text = String(cmd || '').trim().toLowerCase();

  if (
    /^qq点歌$/i.test(text) ||
    /^qq音乐点歌$/i.test(text) ||
    /^腾讯点歌$/.test(cmd) ||
    /^QQ点歌$/.test(cmd) ||
    /^QQ音乐点歌$/.test(cmd)
  ) {
    return 'tencent';
  }

  return 'netease';
}

/**
 * 支持：
 * 点歌 关键词
 * 网易点歌 关键词
 * 网易云点歌 关键词
 * qq点歌 关键词
 * QQ点歌 关键词
 * QQ音乐点歌 关键词
 * 选歌 3
 * 换平台
 */
export async function handleMusicCommand(
  event: OB11Message,
  instruction: string,
  ctx: NapCatPluginContext
): Promise<boolean> {
  const text = String(instruction || '').trim();

  if (!text) return false;

  const selectMatch = text.match(/^选歌\s*(\d+)$/);

  if (selectMatch) {
    const result = await selectMusicFromSession(
      event,
      ctx,
      Number(selectMatch[1])
    );

    if (!result.success) {
      await sendReply(event, `❌ ${result.error || '选歌失败喵～'}`, ctx);
    }

    return true;
  }

  if (/^换平台$|^切换平台$|^换源$|^切源$/.test(text)) {
    const result = await switchMusicPlatformForSession(event, ctx);

    if (!result.success) {
      await sendReply(event, `❌ ${result.error || '换平台失败喵～'}`, ctx);
    }

    return true;
  }

  const searchMatch = text.match(/^((?:qq|QQ|腾讯|qq音乐|QQ音乐|网易|网易云)?点歌)\s+([\s\S]+)$/);

  if (!searchMatch) return false;

  const cmd = searchMatch[1];
  const keyword = searchMatch[2].trim();

  if (!keyword) {
    await sendReply(event, '❌ 请提供歌名喵～\n例如：点歌 关键词', ctx);
    return true;
  }

  const server = normalizeMusicServer(detectPlatform(cmd));

  const result = await searchMusicListForSession(
    event,
    ctx,
    keyword,
    server,
    10
  );

  if (!result.success) {
    await sendReply(event, `❌ ${result.error || '搜索失败喵～'}`, ctx);
  }

  return true;
}