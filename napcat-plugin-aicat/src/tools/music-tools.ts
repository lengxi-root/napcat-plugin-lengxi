import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { OB11Message } from 'napcat-types/napcat-onebot/types/index';
import type { Tool, ToolResult } from '../types';
import { sendReply } from '../utils/message';

export type MusicServer = 'netease' | 'tencent';
export type MusicSendMode = 'record' | 'card' | 'text';

export interface Song {
  id: string;
  name: string;
  artists: string;
  audio_url?: string;
  cover_url?: string;
  lyric_url?: string;
  lyrics?: string;
  platform: MusicServer;
  raw?: unknown;
}

interface MusicSearchSession {
  keyword: string;
  server: MusicServer;
  songs: Song[];
  updatedAt: number;
}

const METING_BASE_URL = 'https://api.qijieya.cn/meting/';
const MUSIC_SESSION_TTL = 10 * 60 * 1000;
const musicSessions = new Map<string, MusicSearchSession>();

export const MUSIC_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'search_music',
      description: '搜索音乐，返回歌曲列表。不会自动播放。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '歌曲名、歌手名或搜索关键词',
          },
          platform: {
            type: 'string',
            description: '音乐平台，默认 netease。可选 netease / qq / tencent',
            enum: ['netease', 'qq', 'tencent'],
          },
          limit: {
            type: 'integer',
            description: '返回数量，默认10，最大20',
          },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'play_music',
      description: '自动点歌并播放。用户说“我想听 xxx”“来首 xxx”“放一首 xxx”时调用。LLM 调用此工具时会自动搜索、自动匹配歌手、自动选择并播放；手动点歌指令才显示候选列表。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '歌曲名、歌手名或完整点歌请求。例如：晴天、周杰伦的晴天、QQ的稻香、我想听周杰伦的晴天',
          },
          platform: {
            type: 'string',
            description: '音乐平台，默认 netease。用户明确说 QQ音乐 / QQ / 腾讯时填 tencent，否则默认 netease。',
            enum: ['netease', 'qq', 'tencent'],
          },
          limit: {
            type: 'integer',
            description: '返回数量，默认10，最大20',
          },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select_music',
      description: '从上一次点歌搜索结果中选择一首播放。用户说“选歌3”“第三首”“就这个第2个”“播放第5首”时调用。',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'integer',
            description: '歌曲序号，从1开始，例如用户说第三首就传 3',
          },
        },
        required: ['index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switch_music_platform',
      description: '切换音乐平台，在网易云和QQ音乐之间互换，并用上一次关键词重新搜索。用户说“换平台”“换源”“换QQ”“换网易云”时调用。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

function normalizeLimit(value: unknown): number {
  const n = Number(value || 10);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(20, Math.floor(n));
}

export function normalizeMusicServer(value: unknown): MusicServer {
  const raw = String(value || '').trim().toLowerCase();

  if (
    raw === 'qq' ||
    raw === 'tencent' ||
    raw === 'tx' ||
    raw === '腾讯' ||
    raw === 'qq音乐'
  ) {
    return 'tencent';
  }

  return 'netease';
}

function detectMusicServerFromText(text: string): MusicServer | '' {
  const raw = String(text || '').trim().toLowerCase();

  if (
    raw.includes('qq音乐') ||
    raw.includes('qq的') ||
    raw.includes('qq ') ||
    raw.includes('qq点') ||
    raw.includes('腾讯音乐') ||
    raw.includes('腾讯的') ||
    raw.includes('tencent')
  ) {
    return 'tencent';
  }

  if (
    raw.includes('网易云') ||
    raw.includes('网易的') ||
    raw.includes('netease')
  ) {
    return 'netease';
  }

  return '';
}

function stripMusicRequestWords(text: string): string {
  let s = String(text || '').trim();

  s = s
    .replace(/^我想听\s*/i, '')
    .replace(/^想听\s*/i, '')
    .replace(/^我要听\s*/i, '')
    .replace(/^我想要听\s*/i, '')
    .replace(/^来一首\s*/i, '')
    .replace(/^来首\s*/i, '')
    .replace(/^放一首\s*/i, '')
    .replace(/^播放\s*/i, '')
    .replace(/^帮我放\s*/i, '')
    .replace(/^给我放\s*/i, '')
    .replace(/^点歌\s*/i, '')
    .replace(/^qq点歌\s*/i, '')
    .replace(/^QQ点歌\s*/, '')
    .replace(/^qq音乐点歌\s*/i, '')
    .replace(/^QQ音乐点歌\s*/, '')
    .replace(/^网易云点歌\s*/, '')
    .replace(/^网易点歌\s*/, '')
    .trim();

  s = s
    .replace(/^(qq|QQ|qq音乐|QQ音乐|腾讯|腾讯音乐)的?/i, '')
    .replace(/^(网易|网易云|网易云音乐)的?/i, '')
    .trim();

  return s;
}

function normalizeMusicText(text: string): string {
  return String(text || '')
    .trim()
    .replace(/[《》「」『』【】]/g, '')
    .replace(/[，。！？、；：,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactMusicText(text: string): string {
  return normalizeMusicText(text)
    .toLowerCase()
    .replace(/\s+/g, '');
}

function parseMusicIntent(rawKeyword: string): {
  song: string;
  artist: string;
  query: string;
  platformHint: MusicServer | '';
} {
  const raw = normalizeMusicText(rawKeyword);
  const platformHint = detectMusicServerFromText(raw);
  let text = stripMusicRequestWords(raw);

  text = normalizeMusicText(text);

  let artist = '';
  let song = text;

  /**
   * 典型：
   * - 周杰伦的晴天
   * - 周杰伦 的 晴天
   * - 陈奕迅的十年
   */
  const possessiveMatch = text.match(/^(.{1,30}?)(?:的|唱的|演唱的)(.{1,80})$/);

  if (possessiveMatch) {
    artist = possessiveMatch[1].trim();
    song = possessiveMatch[2].trim();
  } else {
    /**
     * 兼容：
     * - 周杰伦 晴天
     * - 周杰伦-晴天
     * - 周杰伦 - 晴天
     */
    const sepMatch = text.match(/^(.{1,20}?)[\s\-—_]+(.{1,80})$/);

    if (sepMatch) {
      artist = sepMatch[1].trim();
      song = sepMatch[2].trim();
    }
  }

  song = normalizeMusicText(song);
  artist = normalizeMusicText(artist);

  return {
    song,
    artist,
    query: song || text,
    platformHint,
  };
}

function scoreSongForIntent(song: Song, intent: { song: string; artist: string; }): number {
  const targetSong = compactMusicText(intent.song);
  const targetArtist = compactMusicText(intent.artist);

  const songName = compactMusicText(song.name);
  const artists = compactMusicText(song.artists);

  let score = 0;

  if (targetSong) {
    if (songName === targetSong) score += 100;
    else if (songName.includes(targetSong)) score += 70;
    else if (targetSong.includes(songName)) score += 30;
  }

  if (targetArtist) {
    if (artists === targetArtist) score += 120;
    else if (artists.includes(targetArtist)) score += 100;
    else if (targetArtist.includes(artists)) score += 40;
  }

  return score;
}

function pickBestSongForIntent(
  songs: Song[],
  intent: { song: string; artist: string; }
): Song | null {
  if (!songs.length) return null;

  if (!intent.artist) {
    return songs[0];
  }

  let best = songs[0];
  let bestScore = -1;

  for (const song of songs) {
    const score = scoreSongForIntent(song, intent);

    if (score > bestScore) {
      best = song;
      bestScore = score;
    }
  }

  return best || songs[0];
}

function serverName(server: MusicServer): string {
  return server === 'tencent' ? 'QQ音乐' : '网易云';
}

function normalizeMode(value: unknown): MusicSendMode {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'card' || raw === '卡片') return 'card';
  if (raw === 'text' || raw === '文本') return 'text';

  return 'record';
}

function getMusicSessionKey(event: OB11Message): string {
  if (event.message_type === 'group') {
    return `g:${String(event.group_id || '')}`;
  }

  return `p:${String(event.user_id || '')}`;
}

function cleanupMusicSessions(): void {
  const now = Date.now();

  for (const [key, session] of musicSessions) {
    if (now - session.updatedAt > MUSIC_SESSION_TTL) {
      musicSessions.delete(key);
    }
  }
}

async function fetchTextWithTimeout(
  url: string,
  init: RequestInit = {},
  timeout = 20000
): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return text;
  } finally {
    clearTimeout(id);
  }
}

async function fetchJsonOrTextWithTimeout(
  url: string,
  init: RequestInit = {},
  timeout = 20000
): Promise<unknown> {
  const text = await fetchTextWithTimeout(url, init, timeout);

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildMetingUrl(params: Record<string, string>): string {
  const url = new URL(METING_BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function parseIdFromMetingUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function normalizeArtist(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map(v => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') return String((v as Record<string, unknown>).name || '');
        return '';
      })
      .filter(Boolean)
      .join('/');
  }

  return String(value || '').trim();
}

function getSongIdFromSearchItem(item: Record<string, unknown>): string {
  if (item.id) return String(item.id);

  const url = String(item.url || '');
  const lrc = String(item.lrc || '');
  const pic = String(item.pic || '');

  return parseIdFromMetingUrl(url) || parseIdFromMetingUrl(lrc) || parseIdFromMetingUrl(pic);
}

function getPicIdFromSearchItem(item: Record<string, unknown>, fallbackSongId: string): string {
  const pic = String(item.pic || '');
  return parseIdFromMetingUrl(pic) || fallbackSongId;
}

function normalizeSearchRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(i => i && typeof i === 'object') as Record<string, unknown>[];
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    for (const key of ['data', 'result', 'songs', 'list', 'items']) {
      if (Array.isArray(record[key])) {
        return (record[key] as unknown[]).filter(i => i && typeof i === 'object') as Record<string, unknown>[];
      }
    }
  }

  return [];
}

export async function searchMusicByMeting(
  keyword: string,
  server: MusicServer = 'netease',
  limit = 10
): Promise<Song[]> {
  const query = String(keyword || '').trim();
  if (!query) return [];

  const url = buildMetingUrl({
    server,
    type: 'search',
    id: query,
    page: '1',
    limit: String(limit),
    search_type: '1',
  });

  const data = await fetchJsonOrTextWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json,text/plain,*/*',
      },
    },
    20000
  );

  const rows = normalizeSearchRows(data);

  return rows.slice(0, limit).map(row => {
    const id = getSongIdFromSearchItem(row);
    const picId = getPicIdFromSearchItem(row, id);

    const name = String(row.name || row.title || query || '未知歌曲').trim();
    const artists = normalizeArtist(row.artist || row.artists || row.author) || '未知歌手';

    const audioUrl = String(row.url || '').trim() || buildMetingUrl({
      server,
      type: 'url',
      id,
      br: '2000',
    });

    const coverUrl = String(row.pic || '').trim() || buildMetingUrl({
      server,
      type: 'pic',
      id: picId || id,
      cover: '500',
    });

    const lyricUrl = String(row.lrc || '').trim() || buildMetingUrl({
      server,
      type: 'lrc',
      id,
    });

    return {
      id,
      name,
      artists,
      audio_url: audioUrl,
      cover_url: coverUrl,
      lyric_url: lyricUrl,
      platform: server,
      raw: row,
    };
  }).filter(song => song.name && song.id);
}

function looksLikeUrl(text: string): boolean {
  return /^https?:\/\//i.test(String(text || '').trim());
}

async function resolveMetingUrl(endpoint: string): Promise<string> {
  const input = String(endpoint || '').trim();
  if (!input) return '';

  if (!input.includes('api.qijieya.cn/meting')) {
    return input;
  }

  try {
    const data = await fetchJsonOrTextWithTimeout(
      input,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json,text/plain,*/*',
        },
      },
      20000
    );

    if (typeof data === 'string') {
      const text = data.trim();

      if (looksLikeUrl(text)) return text;

      const urlMatch = text.match(/https?:\/\/\S+/);
      if (urlMatch) {
        return urlMatch[0]
          .replace(/[，。！？、；：]+$/g, '')
          .replace(/[)\]}>]+$/g, '')
          .trim();
      }

      return text;
    }

    if (Array.isArray(data)) {
      const first = data[0] as Record<string, unknown> | undefined;
      if (first) {
        return String(first.url || first.link || first.data || '').trim();
      }
    }

    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      return String(obj.url || obj.link || obj.data || '').trim();
    }
  } catch {}

  return input;
}

async function resolveLyrics(endpoint: string): Promise<string> {
  const input = String(endpoint || '').trim();
  if (!input) return '';

  try {
    const data = await fetchJsonOrTextWithTimeout(
      input,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json,text/plain,*/*',
        },
      },
      20000
    );

    if (typeof data === 'string') return data;

    if (Array.isArray(data)) {
      const first = data[0] as Record<string, unknown> | undefined;
      if (first) {
        return String(first.lrc || first.lyric || first.data || '').trim();
      }
    }

    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      return String(obj.lrc || obj.lyric || obj.data || '').trim();
    }
  } catch {}

  return '';
}

export function cleanLyrics(raw: string, maxLines = 80): string {
  const text = String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, '\n')
    .trim();

  if (!text) return '';

  const lines: string[] = [];

  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;

    line = line.replace(/\[(ti|ar|al|by|offset|kana|hash|sign|qq|total|language):[^\]]*]/gi, '');
    line = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?]/g, '');

    line = line.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    if (
      /^作词\s*[:：]/.test(line) ||
      /^作曲\s*[:：]/.test(line) ||
      /^编曲\s*[:：]/.test(line) ||
      /^制作人\s*[:：]/.test(line) ||
      /^OP\s*[:：]/i.test(line) ||
      /^SP\s*[:：]/i.test(line) ||
      /^ISRC\s+/i.test(line) ||
      /^配唱制作\s*[:：]/.test(line) ||
      /^录音/.test(line) ||
      /^混音/.test(line) ||
      /^和声/.test(line) ||
      /^弦乐/.test(line) ||
      /^第一小提琴\s*[:：]/.test(line) ||
      /^第二小提琴\s*[:：]/.test(line) ||
      /^中提琴\s*[:：]/.test(line) ||
      /^大提琴\s*[:：]/.test(line) ||
      /^低音/.test(line)
    ) {
      continue;
    }

    lines.push(line);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const key = line.trim();
    if (!key) continue;
    if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(key)) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(key);

    if (deduped.length >= maxLines) break;
  }

  return deduped.join('\n');
}

async function ensureSongExtra(song: Song): Promise<Song> {
  const next: Song = { ...song };

  if (next.audio_url) {
    const resolvedAudio = await resolveMetingUrl(next.audio_url);
    if (looksLikeUrl(resolvedAudio)) next.audio_url = resolvedAudio;
  }

  if (next.lyric_url && !next.lyrics) {
    const rawLyrics = await resolveLyrics(next.lyric_url);
    next.lyrics = cleanLyrics(rawLyrics);
  }

  return next;
}

function buildMusicCardUrl(song: Song): string {
  if (song.platform === 'netease') {
    return `https://music.163.com/#/song?id=${encodeURIComponent(song.id)}`;
  }

  return `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(song.id)}`;
}

async function sendOneBotMessage(
  event: OB11Message,
  ctx: NapCatPluginContext,
  message: unknown
): Promise<void> {
  const isGroup = event.message_type === 'group';

  const action = isGroup ? 'send_group_msg' : 'send_private_msg';
  const params = isGroup
    ? {
        group_id: String(event.group_id),
        message,
      }
    : {
        user_id: String(event.user_id),
        message,
      };

  await ctx.actions.call(
    action,
    params as never,
    ctx.adapterName,
    ctx.pluginManager.config
  );
}

function songTitle(song: Song): string {
  return `${song.name} - ${song.artists}`;
}

function songToText(song: Song): string {
  return [
    `🎵 ${songTitle(song)}`,
    `🎧 平台：${serverName(song.platform)}`,
    song.audio_url ? `▶️ 播放链接：${song.audio_url}` : '',
    song.cover_url ? `🖼️ 封面：${song.cover_url}` : '',
    song.lyrics ? `\n歌词：\n${song.lyrics}` : '',
  ].filter(Boolean).join('\n');
}

async function sendMusicCard(event: OB11Message, ctx: NapCatPluginContext, song: Song): Promise<boolean> {
  try {
    if (!song.audio_url) return false;

    await sendOneBotMessage(event, ctx, [
      {
        type: 'music',
        data: {
          type: 'custom',
          url: buildMusicCardUrl(song),
          audio: song.audio_url,
          title: song.name,
          content: `${song.artists} | ${serverName(song.platform)}`,
          image: song.cover_url || '',
        },
      },
    ]);

    return true;
  } catch {
    return false;
  }
}

async function sendMusicRecordWithCoverAndLyrics(
  event: OB11Message,
  ctx: NapCatPluginContext,
  song: Song
): Promise<boolean> {
  try {
    if (!song.audio_url) return false;

    const message: unknown[] = [];

    if (song.cover_url) {
      message.push({
        type: 'image',
        data: {
          file: song.cover_url,
        },
      });
    }

    message.push({
      type: 'record',
      data: {
        file: song.audio_url,
      },
    });

    const lyricText = song.lyrics
      ? `🎵 ${songTitle(song)}\n🎧 ${serverName(song.platform)}\n\n歌词：\n${song.lyrics}`
      : `🎵 ${songTitle(song)}\n🎧 ${serverName(song.platform)}`;

    message.push({
      type: 'text',
      data: {
        text: lyricText.slice(0, 3500),
      },
    });

    await sendOneBotMessage(event, ctx, message);
    return true;
  } catch {
    return false;
  }
}

async function sendMusicText(event: OB11Message, ctx: NapCatPluginContext, song: Song): Promise<boolean> {
  try {
    await sendOneBotMessage(event, ctx, [
      {
        type: 'text',
        data: {
          text: songToText(song).slice(0, 3500),
        },
      },
    ]);

    return true;
  } catch {
    return false;
  }
}

export async function sendSong(
  event: OB11Message,
  ctx: NapCatPluginContext,
  song: Song,
  mode: MusicSendMode = 'record'
): Promise<ToolResult> {
  if (!ctx.actions) {
    return {
      success: false,
      error: 'actions未初始化',
    };
  }

  const fullSong = await ensureSongExtra(song);

  const tried: string[] = [];

  const modes: MusicSendMode[] = mode === 'record'
    ? ['record', 'card', 'text']
    : mode === 'card'
      ? ['card', 'record', 'text']
      : ['text'];

  for (const m of modes) {
    if (tried.includes(m)) continue;
    tried.push(m);

    let ok = false;

    if (m === 'record') {
      ok = await sendMusicRecordWithCoverAndLyrics(event, ctx, fullSong);
    } else if (m === 'card') {
      ok = await sendMusicCard(event, ctx, fullSong);
    } else {
      ok = await sendMusicText(event, ctx, fullSong);
    }

    if (ok) {
      return {
        success: true,
        message: `已发送歌曲：${songTitle(fullSong)}`,
        data: {
          song: fullSong,
          mode: m,
        },
      };
    }
  }

  return {
    success: false,
    error: `歌曲发送失败：${songTitle(fullSong)}`,
    data: {
      song: fullSong,
      tried,
    },
  };
}

export function formatSongList(
  songs: Song[],
  keyword: string,
  server: MusicServer
): string {
  if (!songs.length) {
    return `❌ ${serverName(server)}没有搜索到：${keyword}`;
  }

  const lines = [
    `🎵 ${serverName(server)} 搜索结果：${keyword}`,
    '',
    ...songs.map((song, index) => {
      return `${index + 1}. ${song.name} - ${song.artists}`;
    }),
    '',
    '发送：选歌 序号',
    '例如：选歌 3',
    '',
    '发送：换平台',
    `将在 ${server === 'netease' ? 'QQ音乐' : '网易云'} 重新搜索这个关键词`,
  ];

  return lines.join('\n');
}

export async function searchMusicListForSession(
  event: OB11Message,
  ctx: NapCatPluginContext,
  keyword: string,
  server: MusicServer,
  limit = 10
): Promise<ToolResult> {
  cleanupMusicSessions();

  const query = String(keyword || '').trim();

  if (!query) {
    return {
      success: false,
      error: '缺少歌曲关键词',
    };
  }

  let songs: Song[] = [];

  try {
    songs = await searchMusicByMeting(query, server, limit);
  } catch (e) {
    return {
      success: false,
      error: `搜索失败: ${String(e)}`,
    };
  }

  const key = getMusicSessionKey(event);

  musicSessions.set(key, {
    keyword: query,
    server,
    songs,
    updatedAt: Date.now(),
  });

  await sendReply(event, formatSongList(songs, query, server), ctx);

  return {
    success: true,
    message: `已搜索到 ${songs.length} 首歌曲，请用户发送“选歌 序号”`,
    data: {
      keyword: query,
      platform: server,
      songs,
      count: songs.length,
    },
    count: songs.length,
  };
}

async function autoSearchAndPlayMusic(
  event: OB11Message,
  ctx: NapCatPluginContext,
  rawKeyword: string,
  server: MusicServer,
  limit = 10
): Promise<ToolResult> {
  const intent = parseMusicIntent(rawKeyword);

  const finalServer = intent.platformHint || server || 'netease';
  const query = intent.query || stripMusicRequestWords(rawKeyword);

  if (!query) {
    return {
      success: false,
      error: '缺少歌曲关键词',
    };
  }

  let songs: Song[] = [];

  try {
    songs = await searchMusicByMeting(query, finalServer, limit);
  } catch (e) {
    return {
      success: false,
      error: `搜索失败: ${String(e)}`,
    };
  }

  if (!songs.length) {
    return {
      success: false,
      error: `${serverName(finalServer)}没有搜索到：${query}`,
      data: {
        keyword: query,
        artist: intent.artist,
        song: intent.song,
        platform: finalServer,
      },
    };
  }

  const selected = pickBestSongForIntent(songs, intent);

  if (!selected) {
    return {
      success: false,
      error: '没有可播放的歌曲',
      data: {
        keyword: query,
        artist: intent.artist,
        song: intent.song,
        platform: finalServer,
        songs,
      },
    };
  }

  await sendReply(
    event,
    [
      `🎧 正在播放：${selected.name} - ${selected.artists}`,
      `🎵 平台：${serverName(finalServer)}`,
      intent.artist ? `🔎 匹配歌手：${intent.artist}` : '',
    ].filter(Boolean).join('\n'),
    ctx
  );

  const result = await sendSong(event, ctx, selected, 'record');

  return {
    ...result,
    data: {
      ...(result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {}),
      auto_selected: true,
      keyword: query,
      requested_artist: intent.artist,
      requested_song: intent.song,
      platform: finalServer,
      selected,
      candidates: songs.slice(0, limit),
    },
  };
}

export async function selectMusicFromSession(
  event: OB11Message,
  ctx: NapCatPluginContext,
  index: number
): Promise<ToolResult> {
  cleanupMusicSessions();

  const n = Number(index);

  if (!Number.isFinite(n) || n <= 0) {
    return {
      success: false,
      error: '请选择正确的歌曲序号，例如：选歌 3',
    };
  }

  const key = getMusicSessionKey(event);
  const session = musicSessions.get(key);

  if (!session) {
    return {
      success: false,
      error: '没有可选的点歌列表，请先点歌搜索',
    };
  }

  const song = session.songs[Math.floor(n) - 1];

  if (!song) {
    return {
      success: false,
      error: `序号 ${n} 不存在，当前列表共有 ${session.songs.length} 首`,
      data: {
        count: session.songs.length,
      },
    };
  }

  await sendReply(event, `🎧 正在播放：${song.name} - ${song.artists}`, ctx);

  const result = await sendSong(event, ctx, song, 'record');

  session.updatedAt = Date.now();

  return result;
}

export async function switchMusicPlatformForSession(
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<ToolResult> {
  cleanupMusicSessions();

  const key = getMusicSessionKey(event);
  const session = musicSessions.get(key);

  if (!session) {
    return {
      success: false,
      error: '没有可切换的平台记录，请先点歌搜索',
    };
  }

  const nextServer: MusicServer = session.server === 'netease'
    ? 'tencent'
    : 'netease';

  await sendReply(
    event,
    `🔄 正在切换到 ${serverName(nextServer)} 搜索：${session.keyword}`,
    ctx
  );

  return await searchMusicListForSession(
    event,
    ctx,
    session.keyword,
    nextServer,
    10
  );
}

export async function executeMusicTool(
  name: string,
  args: Record<string, unknown>,
  event: OB11Message,
  ctx: NapCatPluginContext
): Promise<ToolResult> {
  const keyword = String(args.keyword || args.song_name || '').trim();

  if ((name === 'search_music' || name === 'play_music') && !keyword) {
    return {
      success: false,
      error: '缺少 keyword',
    };
  }

  if (name === 'search_music') {
    const intent = parseMusicIntent(keyword);
    const server = intent.platformHint || normalizeMusicServer(args.platform);
    const limit = normalizeLimit(args.limit);
    const query = intent.query || keyword;

    const songs = await searchMusicByMeting(query, server, limit);

    return {
      success: true,
      message: songs.length
        ? `搜索到 ${songs.length} 首歌曲`
        : `没有搜索到歌曲：${query}`,
      data: {
        keyword: query,
        requested_artist: intent.artist,
        requested_song: intent.song,
        platform: server,
        songs,
      },
      count: songs.length,
    };
  }

  if (name === 'play_music') {
    const intent = parseMusicIntent(keyword);
    const server = intent.platformHint || normalizeMusicServer(args.platform);
    const limit = normalizeLimit(args.limit || 10);

    /**
     * LLM 点歌：自动搜索、自动匹配、自动播放。
     *
     * 手动点歌不走这里，手动点歌在 music-handler.ts 里仍然调用
     * searchMusicListForSession() 展示候选列表。
     */
    return await autoSearchAndPlayMusic(
      event,
      ctx,
      keyword,
      server,
      limit
    );
  }

  if (name === 'select_music') {
    const index = Number(args.index || args.number || args.no || 0);

    return await selectMusicFromSession(
      event,
      ctx,
      index
    );
  }

  if (name === 'switch_music_platform') {
    return await switchMusicPlatformForSession(event, ctx);
  }

  return {
    success: false,
    error: `未知音乐工具: ${name}`,
  };
}

export const getMusicTools = (): Tool[] => MUSIC_TOOLS;