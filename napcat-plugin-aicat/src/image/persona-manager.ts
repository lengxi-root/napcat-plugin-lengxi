import fs from 'fs';
import path from 'path';
import { pluginState } from '../core/state';
import { getPrioritizedChatTargets } from '../core/channel-store';
import { AIClient } from '../tools/ai-client';

export interface ImageDailySelfieProfile {
  date: string;
  outfit: string;
  status: string;
  status_by_period?: Partial<Record<'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'late_night', string>>;
  mood: string;
  seed: string;
  updated_at: string;
  source?: 'chat_model' | 'fallback';
}

export interface ImagePersonaData {
  ref_image_path: string;
  ref_mime_type: string;
  updated_at?: string;
  daily_selfie_profile?: ImageDailySelfieProfile;
}

export interface SelfieIntent {
  raw: string;
  compact: string;
  isGroupPhoto: boolean;
  isMultiPersonGroupPhoto: boolean;
  changeClothes: boolean;
  changePose: boolean;
  useTodayOutfit: boolean;
  hasReferenceStyleHint: boolean;
}

function normalizeIntentText (text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?]/g, '');
}

function includesAny (text: string, list: string[]): boolean {
  return list.some(item => item && text.includes(item));
}

function detectMimeByBytes (data: Uint8Array): string {
  const b = data;

  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';

  return 'image/png';
}

function extFromMime (mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';

  return 'png';
}

function getLocalDateKey (): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

function getCurrentTimePeriod (): 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'late_night' {
  const h = new Date().getHours();

  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 13) return 'noon';
  if (h >= 13 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  if (h >= 21 || h < 1) return 'night';
  return 'late_night';
}

function getTimePeriodLabel (period: ReturnType<typeof getCurrentTimePeriod>): string {
  switch (period) {
    case 'morning': return '早晨';
    case 'noon': return '中午';
    case 'afternoon': return '下午';
    case 'evening': return '傍晚';
    case 'night': return '夜晚';
    case 'late_night': return '深夜';
    default: return '当前';
  }
}

function getProfileCurrentStatus (profile?: ImageDailySelfieProfile): string {
  if (!profile) return '';

  const period = getCurrentTimePeriod();
  return String(profile.status_by_period?.[period] || profile.status || '').trim();
}

function randomPick<T> (list: T[]): T {
  return list[Math.floor(Math.random() * list.length)] || list[0];
}

function makeRandomSeed (): string {
  const moods = [
    '温柔放松',
    '有点撒娇',
    '安静治愈',
    '元气满满',
    '慵懒惬意',
    '小小得意',
    '甜甜的期待感',
    '刚洗完澡的清爽感',
    '窝在家里的安全感',
    '出门回来后的满足感',
    '有一点想被夸奖',
    '心里软软的',
    '有点困但很开心',
    '像猫一样懒洋洋',
    '带着一点小期待',
  ];

  const places = [
    '卧室暖光灯下',
    '窗边小圆桌旁',
    '书桌前',
    '柔软沙发上',
    '铺着奶油色床品的床边',
    '浴室镜前',
    '玄关换鞋凳旁',
    '阳台小花架旁',
    '厨房岛台边',
    '铺着地毯的客厅角落',
    '靠近落地灯的阅读角',
    '摆着香薰的小梳妆台前',
    '放着抱枕的懒人沙发里',
  ];

  const activities = [
    '刚整理完头发',
    '刚泡好一杯热牛奶',
    '正在听轻音乐',
    '刚洗完澡准备护肤',
    '刚从市集散步回来',
    '准备窝着看书',
    '刚换好睡前香薰',
    '正在挑明天要用的小发夹',
    '刚拍完一组随手照',
    '准备吃一点小甜点',
    '刚把房间收拾好',
    '正在整理今天买回来的小物件',
    '刚把柔软的毯子披在身上',
    '正准备坐下来刷一会儿手机',
  ];

  const colors = [
    '奶油白',
    '淡粉色',
    '雾紫色',
    '浅蓝灰',
    '樱花粉',
    '杏仁米色',
    '薄荷绿',
    '焦糖奶茶色',
    '珍珠灰',
    '淡鹅黄色',
    '柔雾玫瑰色',
    '浅麦芽色',
    '水蜜桃色',
    '月光白',
  ];

  return [
    `mood=${randomPick(moods)}`,
    `place=${randomPick(places)}`,
    `activity=${randomPick(activities)}`,
    `color=${randomPick(colors)}`,
    `rand=${Math.random().toString(16).slice(2, 10)}`,
  ].join('; ');
}

function extractJsonObject (text: string): Record<string, unknown> | null {
  const raw = String(text || '').trim();

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') {
      return parsed[0] as Record<string, unknown>;
    }
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim()) as unknown;

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }

      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') {
        return parsed[0] as Record<string, unknown>;
      }
    } catch {}
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);

  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]) as unknown;

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/);

  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]) as unknown;

      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') {
        return parsed[0] as Record<string, unknown>;
      }
    } catch {}
  }

  return null;
}

function normalizeProfileText (value: unknown, fallback: string, maxLen = 260): string {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, maxLen).trim();
}

function fallbackDailyProfile (date: string, seed: string): ImageDailySelfieProfile {
  const outfits = [
    '奶油白色细针织上衣，领口有柔软的小花边，外搭浅杏色短开衫，下身是浅棕格纹百褶裙，搭配白色短袜和圆头玛丽珍鞋，整体温柔干净。',
    '浅粉色宽松卫衣，胸前有小猫刺绣，下身搭配奶白色短裙和柔软居家袜，发间别着一枚小珍珠发夹，整体轻松可爱。',
    '雾紫色针织连衣裙，袖口带一点蕾丝边，外披奶白色毛绒小披肩，搭配浅色短靴，整体柔和又有一点梦幻。',
    '杏仁米色短款针织开衫，内搭白色细肩带连衣裙，裙摆轻盈自然，搭配浅棕小皮鞋和奶白短袜，显得安静又清爽。',
    '浅蓝灰色宽松衬衫，袖口微微卷起，搭配白色高腰半身裙和简洁小皮鞋，整体像日常随手拍一样自然。',
    '樱花粉泡泡袖上衣，搭配奶油白 A 字短裙，腰间有细细蝴蝶结系带，脚上是白色玛丽珍鞋和淡粉短袜。',
    '薄荷绿色细针织开衫，内搭白色蕾丝吊带，搭配淡蓝色高腰短裙，发尾自然垂落，整体清新柔软。',
    '月白色宽松毛衣，搭配浅灰百褶裙和白色中筒袜，脚上是圆头小皮鞋，整体有一种干净温暖的日常感。',
  ];

  const moodSeeds = [
    '放松、安静、柔和',
    '清爽、自然、轻松',
    '温柔、治愈、稳定',
    '元气、明亮、轻快',
    '慵懒、舒适、安心',
    '安静、专注、柔软',
  ];

  const statusByPeriod: ImageDailySelfieProfile['status_by_period'] = {
    morning: '刚整理好头发和衣服，房间里是清晨的柔和光线，整个人看起来清爽自然。',
    noon: '坐在明亮的窗边休息，桌上放着简单的饮品和小点心，状态轻松又干净。',
    afternoon: '在房间里随意活动了一会儿，光线变得柔和，衣服和发丝都显得很自然。',
    evening: '刚把房间的暖光灯打开，周围氛围安静柔软，像准备随手拍一张日常照片。',
    night: '换到更舒适的室内状态，灯光温暖，表情放松，画面有安静的夜晚感。',
    late_night: '房间里只留着柔和小灯，状态有些慵懒但很安稳，像睡前随手自拍。',
  };

  const period = getCurrentTimePeriod();

  return {
    date,
    outfit: randomPick(outfits),
    status: statusByPeriod[period] || '处于自然放松的日常状态，画面安静、统一、真实。',
    status_by_period: statusByPeriod,
    mood: randomPick(moodSeeds),
    seed,
    updated_at: new Date().toISOString(),
    source: 'fallback',
  };
}

class ImagePersonaManager {
  private dataDir = '';
  private file = '';
  private imageDir = '';
  private data: ImagePersonaData = {
    ref_image_path: '',
    ref_mime_type: 'image/png',
  };

  init (dataDir: string): void {
    this.dataDir = dataDir;
    this.file = path.join(this.dataDir, 'image_persona.json');
    this.imageDir = path.join(this.dataDir, 'image-persona');

    if (!fs.existsSync(this.imageDir)) fs.mkdirSync(this.imageDir, { recursive: true });

    this.load();
  }

  private ensureInit (): void {
    if (this.file) return;

    const base = pluginState.configPath
      ? path.dirname(pluginState.configPath)
      : path.join(process.cwd(), 'data');

    this.init(base);
  }

  private load (): void {
    if (!this.file || !fs.existsSync(this.file)) return;

    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<ImagePersonaData>;

      this.data = {
        ref_image_path: String(raw.ref_image_path || ''),
        ref_mime_type: String(raw.ref_mime_type || 'image/png'),
        updated_at: raw.updated_at,
        daily_selfie_profile: raw.daily_selfie_profile,
      };
    } catch {
      this.data = {
        ref_image_path: '',
        ref_mime_type: 'image/png',
      };
    }
  }

  private save (): void {
    this.ensureInit();

    if (!this.file) return;

    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  get (): ImagePersonaData {
    this.ensureInit();
    return {
      ...this.data,
    };
  }

  getReferencePath (): string {
    this.ensureInit();

    if (!this.data.ref_image_path) return '';
    if (!fs.existsSync(this.data.ref_image_path)) return '';

    return this.data.ref_image_path;
  }

  saveReferenceImage (bytes: Uint8Array, mimeType?: string): ImagePersonaData {
    this.ensureInit();

    if (!bytes.byteLength) {
      throw new Error('参考图为空');
    }

    if (!fs.existsSync(this.imageDir)) fs.mkdirSync(this.imageDir, { recursive: true });

    const mime = mimeType || detectMimeByBytes(bytes);
    const ext = extFromMime(mime);
    const filePath = path.join(this.imageDir, `persona_ref_${Date.now()}.${ext}`);

    fs.writeFileSync(filePath, Buffer.from(bytes));

    if (this.data.ref_image_path && this.data.ref_image_path !== filePath) {
      try {
        if (fs.existsSync(this.data.ref_image_path)) fs.unlinkSync(this.data.ref_image_path);
      } catch {}
    }

    this.data.ref_image_path = filePath;
    this.data.ref_mime_type = mime;
    this.data.updated_at = new Date().toISOString();

    this.save();

    return this.get();
  }

  clearReferenceImage (): ImagePersonaData {
    this.ensureInit();

    if (this.data.ref_image_path) {
      try {
        if (fs.existsSync(this.data.ref_image_path)) fs.unlinkSync(this.data.ref_image_path);
      } catch {}
    }

    this.data.ref_image_path = '';
    this.data.ref_mime_type = 'image/png';
    this.data.updated_at = new Date().toISOString();

    this.save();

    return this.get();
  }

  hasReferenceImage (): boolean {
    this.ensureInit();
    return Boolean(this.data.ref_image_path && fs.existsSync(this.data.ref_image_path));
  }

  getReferenceImage (): { data: Uint8Array; mime_type: string; } | null {
    this.ensureInit();

    if (!this.data.ref_image_path || !fs.existsSync(this.data.ref_image_path)) return null;

    try {
      return {
        data: new Uint8Array(fs.readFileSync(this.data.ref_image_path)),
        mime_type: this.data.ref_mime_type || 'image/png',
      };
    } catch {
      return null;
    }
  }

  analyzeSelfieIntent (action: string): SelfieIntent {
    const raw = String(action || '').trim();
    const compact = normalizeIntentText(raw);
  
    const isGroupPhoto = includesAny(compact, [
      '合照',
      '合影',
      '同框',
      '一起拍',
      '一起照',
      '跟我拍',
      '和我拍',
      '双人',
      '多人',
      '大合照',
      '集体照',
      '全员',
      '一起出镜',
      '三人',
      '四人',
      '五人',
      '六人',
    ]);
  
    const isMultiPersonGroupPhoto = includesAny(compact, [
      '多人',
      '大合照',
      '集体照',
      '全员',
      '三人',
      '四人',
      '五人',
      '六人',
      '多人合照',
      '多人合影',
      '大家一起',
      '一起出镜',
    ]) || /[3-9三四五六七八九十]人/.test(compact);
  
    const changeClothes = includesAny(compact, [
      '穿这个',
      '穿这身',
      '穿这套',
      '穿这件',
      '换装',
      '换这身',
      '换这套',
      '换这件',
      '换衣服',
      '衣服',
      '服装',
      '穿搭',
      '造型',
      'cos',
      'cosplay',
      '扮成',
    ]);
  
    const changePose = includesAny(compact, [
      '姿势',
      '动作',
      '表情',
      '站着',
      '坐着',
      '回头',
      '叉腰',
      '比心',
      '伸手',
      '托脸',
      'wink',
      '眨眼',
      '微笑',
      '歪头',
      '看镜头',
      '回眸',
      '趴着',
      '蹲着',
    ]);
  
    const useTodayOutfit = compact === '' ||
      includesAny(compact, [
        '看看你',
        '看下你',
        '看一下你',
        '你长什么样',
        '你长啥样',
        '你的样子',
        '今日穿搭',
        '今天穿搭',
        '今天这身',
        '今日这身',
      ]);
  
    const hasReferenceStyleHint = includesAny(compact, [
      '长这个',
      '长这样',
      '像这个',
      '像这样',
      '照这个',
      '按这个',
      '参考这个',
    ]);
  
    return {
      raw,
      compact,
      isGroupPhoto,
      isMultiPersonGroupPhoto,
      changeClothes,
      changePose,
      useTodayOutfit,
      hasReferenceStyleHint,
    };
  }

  private buildDailyProfilePrompt (date: string, action: string, seed: string): string {
    const botName = pluginState.config.botName || 'AI';
    const personality = pluginState.config.personality || '';
    const period = getCurrentTimePeriod();
    const periodLabel = getTimePeriodLabel(period);

    return [
      '你是 AI 自拍日常设定生成器。',
      '',
      '请为今天生成一份“AI 自拍日常状态”，用于图像生成。',
      '',
      '重要要求：',
      '1. 只生成当前 AI 助手自己的日常状态，不要写第二个人，不要出现“被谁夸奖 / 给谁看 / 和某人互动”等明显第二人描述。',
      '2. 不要改变角色身份、脸、发色、核心形象，只更新今日穿搭、环境状态和心情。',
      '3. 今日穿搭必须具体、连贯、可视化，有颜色、材质、层次、鞋袜或配饰。',
      '4. 当前状态要像真实生活里的自然自拍，不要夸张，不要战斗、危险、政治、血腥、色情。',
      '5. 请额外给出不同时间段的状态描述，方便运行时按时间段取用。',
      '6. 所有状态描述都要通用、自然、单人视角，不要写明显第二人。',
      '7. 只输出 JSON，不要 Markdown，不要解释。',
      '',
      `今天日期：${date}`,
      `当前时间段：${periodLabel}`,
      `随机种子：${seed}`,
      `角色名称：${botName}`,
      personality ? `角色人设：${personality}` : '',
      action ? `本次用户自拍意图：${action}` : '',
      '',
      '输出 JSON 格式：',
      JSON.stringify({
        outfit: '今日固定穿搭，详细、连贯、可用于图像生成',
        status: '当前通用状态',
        status_by_period: {
          morning: '早晨状态',
          noon: '中午状态',
          afternoon: '下午状态',
          evening: '傍晚状态',
          night: '夜晚状态',
          late_night: '深夜状态',
        },
        mood: '当前心情',
      }),
    ].filter(Boolean).join('\n');
  }

  private async generateDailyProfileByChatModel (
    date: string,
    action: string,
    seed: string
  ): Promise<ImageDailySelfieProfile | null> {
    try {
      const targets = getPrioritizedChatTargets();

      if (!targets.length) {
        pluginState.debug('[ImagePersona] 没有可用会话模型，使用 fallback 每日自拍状态');
        return null;
      }

      const target = targets[0];

      const client = new AIClient({
        base_url: target.baseUrl,
        api_key: target.apiKey,
        model: target.model,
        timeout: Math.min(Math.max(target.timeout || 30000, 5000), 60000),
      });

      const text = await client.chatSimple([
        {
          role: 'user',
          content: this.buildDailyProfilePrompt(date, action, seed),
        },
      ]);

      const obj = extractJsonObject(text);

      if (!obj) {
        pluginState.debug(`[ImagePersona] 每日自拍状态模型返回无法解析: ${String(text).slice(0, 300)}`);
        return null;
      }

      const fallback = fallbackDailyProfile(date, seed);

      const outfit =
        obj.outfit ??
        obj.clothes ??
        obj.clothing ??
        obj.dress ??
        obj['今日穿搭'] ??
        obj['穿搭'];

      const status =
        obj.status ??
        obj.state ??
        obj.situation ??
        obj.activity ??
        obj['当前状态'] ??
        obj['状态'];

      const mood =
        obj.mood ??
        obj.emotion ??
        obj.feeling ??
        obj['当前心情'] ??
        obj['心情'];

      const statusByPeriodRaw =
        obj.status_by_period ??
        obj.statusByPeriod ??
        obj.period_status ??
        obj.periodStatus ??
        obj['分时段状态'];

      const fallbackStatusByPeriod = fallback.status_by_period || {};

      let statusByPeriod: ImageDailySelfieProfile['status_by_period'] = {
        ...fallbackStatusByPeriod,
      };

      if (
        statusByPeriodRaw &&
        typeof statusByPeriodRaw === 'object' &&
        !Array.isArray(statusByPeriodRaw)
      ) {
        const r = statusByPeriodRaw as Record<string, unknown>;

        statusByPeriod = {
          morning: normalizeProfileText(r.morning ?? r['早晨'] ?? r['上午'], fallbackStatusByPeriod.morning || fallback.status, 280),
          noon: normalizeProfileText(r.noon ?? r['中午'] ?? r['午间'], fallbackStatusByPeriod.noon || fallback.status, 280),
          afternoon: normalizeProfileText(r.afternoon ?? r['下午'], fallbackStatusByPeriod.afternoon || fallback.status, 280),
          evening: normalizeProfileText(r.evening ?? r['傍晚'] ?? r['晚上前'], fallbackStatusByPeriod.evening || fallback.status, 280),
          night: normalizeProfileText(r.night ?? r['夜晚'] ?? r['晚上'], fallbackStatusByPeriod.night || fallback.status, 280),
          late_night: normalizeProfileText(r.late_night ?? r.lateNight ?? r['深夜'], fallbackStatusByPeriod.late_night || fallback.status, 280),
        };
      }

      const currentStatus = normalizeProfileText(
        status,
        getProfileCurrentStatus({
          ...fallback,
          status_by_period: statusByPeriod,
        }),
        320
      );

      return {
        date,
        outfit: normalizeProfileText(outfit, fallback.outfit, 420),
        status: currentStatus,
        status_by_period: statusByPeriod,
        mood: normalizeProfileText(mood, fallback.mood, 260),
        seed,
        updated_at: new Date().toISOString(),
        source: 'chat_model',
      };
    } catch (e) {
      pluginState.debug(`[ImagePersona] 生成每日自拍状态失败: ${String(e)}`);
      return null;
    }
  }

  async ensureDailySelfieProfile (action = ''): Promise<ImageDailySelfieProfile> {
    this.ensureInit();

    const today = getLocalDateKey();
    const existed = this.data.daily_selfie_profile;

    if (existed?.date === today && existed.outfit && existed.status && existed.mood) {
      return {
        ...existed,
        status: getProfileCurrentStatus(existed) || existed.status,
      };
    }

    const seed = makeRandomSeed();

    const generated = await this.generateDailyProfileByChatModel(today, action, seed);
    const profile = generated || fallbackDailyProfile(today, seed);

    /**
     * 不再保存历史数据。
     * 每天第一次生成今日设定，直接覆盖。
     */
    this.data.daily_selfie_profile = profile;
    this.data.updated_at = new Date().toISOString();

    this.save();

    pluginState.debug(`[ImagePersona] 今日自拍状态已更新: ${JSON.stringify(profile)}`);

    return profile;
  }

  refreshDailySelfieProfileForTest (): void {
    this.ensureInit();
    this.data.daily_selfie_profile = undefined;
    this.data.updated_at = new Date().toISOString();
    this.save();
  }

  getDailySelfieProfile (): ImageDailySelfieProfile | null {
    this.ensureInit();

    const profile = this.data.daily_selfie_profile;
    if (!profile) return null;

    return {
      ...profile,
      status: getProfileCurrentStatus(profile) || profile.status,
    };
  }

  buildSelfiePrompt (
    action: string,
    options?: {
      has_reference_image?: boolean;
      extra_reference_count?: number;
    }
  ): string {
    this.ensureInit();

    const botName = pluginState.config.botName || 'AI';
    const personality = pluginState.config.personality || '';
    const act = String(action || '').trim();
    const intent = this.analyzeSelfieIntent(act);

    const daily = this.data.daily_selfie_profile;
    const hasReferenceImage = Boolean(options?.has_reference_image);
    const extraReferenceCount = Number(options?.extra_reference_count || 0);

    const dailyOutfitLine = daily?.outfit ? `今日穿搭：${daily.outfit}` : '';
    const currentStatus = getProfileCurrentStatus(daily);
    const currentPeriod = getCurrentTimePeriod();
    const currentPeriodLabel = getTimePeriodLabel(currentPeriod);
    const dailyStatusLine = currentStatus
      ? `当前时间段：${currentPeriodLabel}\n当前状态：${currentStatus}`
      : '';
    const dailyMoodLine = daily?.mood ? `当前心情：${daily.mood}` : '';

    const identityLines = hasReferenceImage
      ? [
          '存在固定自拍形象参考图。',
          '参考图一是唯一主体身份参考图。',
          '必须保持参考图一中的同一角色身份、脸部特征、发型、发色、气质和整体形象，不要变成另一个人。',
          '角色名称和人设只用于语气、氛围和角色一致性，不要覆盖参考图一的脸和身份。',
        ]
      : [
          '当前没有固定自拍形象参考图。',
          '请严格根据角色名称、人设、今日状态来生成同一个稳定角色，不要生成随机路人脸。',
          '没有形象参考图时，角色名称、人设和今日设定就是主角身份的主要依据。',
        ];

    const referenceLines = extraReferenceCount > 0
      ? [
          `当前除${hasReferenceImage ? '参考图一' : '主角设定'}外，还有 ${extraReferenceCount} 张额外参考图。`,
          intent.isGroupPhoto
            ? [
                '这些额外参考图在合照模式下可以作为不同的同框对象、人物身份、服装、姿势、构图和风格参考。',
                '如果有多张额外参考图，应尽量把每张额外参考图理解为一个独立同框对象或独立参考来源。',
                '不要只使用其中一张额外参考图，也不要把多张参考图的人脸融合成一个人。',
                '每个同框对象应保持各自独立身份、脸部特征、发型、服装特征和气质。',
                '如果额外参考图是动漫、游戏、二次元、插画、头像、Q版、卡通角色，请将其真人化 / 写实化为真实人类同框对象。',
                '动漫或游戏角色应转化为真实人类 cosplay 或真人电影感角色：保留发型、发色、服装、配色、标志性特征和气质，但身体必须是真实人类。',
                '不要把动漫、游戏、二次元、头像参考生成玩偶、手办、毛绒玩具、贴纸、抱枕、立牌、Q版小人或非真人物件。',
                '所有同框对象都必须作为真实人物出现在画面中，而不是道具。',
                '所有人物需要出现在同一个真实空间里，光线、透视、色调、画风和相机焦段必须统一。',
              ].join('\n')
            : '额外参考图只能作为服装、姿势、构图、风格、场景、道具参考，不要覆盖主角身份。',
          hasReferenceImage
            ? '参考图一始终是 AI 自己的主体身份参考图。不要把额外参考图中的人物身份替换成 AI 自己，除非用户明确要求角色融合。'
            : '没有固定形象图时，额外参考图可以辅助构图、衣服、姿势，但主角仍应符合角色名称和人设。',
        ]
      : [];

    const modeLines: string[] = [];

    if (intent.isGroupPhoto) {
      modeLines.push('【合照 / 同框模式】');
      modeLines.push('本次要求是合照 / 合影 / 同框。');
      modeLines.push('主角仍然是你自己。');
    
      if (extraReferenceCount > 0) {
        modeLines.push(`当前有 ${extraReferenceCount} 张额外参考图，可作为一个或多个同框对象参考。`);
        modeLines.push('如果额外参考图中包含人物，应尽量保留每张图中人物的独立身份特征。');
        modeLines.push('多张额外参考图可以对应多个同框人物，不要只生成其中一个。');
      } else {
        modeLines.push('如果没有额外人物参考图，则根据用户文字描述生成自然同框对象。');
      }
    
      if (intent.isMultiPersonGroupPhoto || extraReferenceCount >= 2) {
        modeLines.push('本次允许多人合影。人物数量应根据用户要求和额外参考图数量自然决定。');
        modeLines.push('多人合影中，每个人都应有清晰、独立、稳定的身份，不要复制脸，不要融合脸。');
      }
    
      modeLines.push('合照中的人物应自然站位或坐位，有合理距离、遮挡关系、视线方向和肢体互动。');
      modeLines.push('如果同框对象来自动漫、游戏、二次元头像、插画或卡通图，请把它真人化成真实人类角色，而不是玩偶、手办、贴纸、抱枕或道具。');
      modeLines.push('动漫 / 游戏角色真人化时，应保留其标志性发型、发色、服装配色、角色气质和辨识特征，但面部、皮肤、身体、姿势都应是自然真实人类。');
      modeLines.push('所有人物必须处在同一个场景中，使用统一光线、统一色调、统一画风和统一相机透视。');
      modeLines.push('整体效果应像同一时间、同一地点、同一相机拍下的一张照片，而不是多张图拼接。');
    
      if (intent.changeClothes) {
        modeLines.push('本次合照同时包含换装 / 服装参考要求，额外参考图中的服装、配饰、颜色、材质可以用于你或对应同框对象。');
      }
    
      if (intent.changePose) {
        modeLines.push('本次合照同时包含姿势 / 动作 / 表情参考要求，额外参考图中的动作、镜头角度、构图可以用于你、同框对象或整体合照构图。');
      }
    } else if (intent.changeClothes && intent.changePose) {
      modeLines.push('【换衣服 + 改姿势模式】');
      modeLines.push('本次要求同时包含换装和改姿势。');
      modeLines.push('保持你自己的身份、脸部特征、发型气质和核心形象不变。');
      modeLines.push('如果提供了额外参考图，优先把额外参考图用于服装、配饰、颜色、材质、姿势、动作、镜头角度和构图。');
      modeLines.push('不要使用今日穿搭覆盖用户指定或参考图中的衣服。');
      modeLines.push('不要把额外参考图中的人物身份替换成你，只参考衣服和姿势。');
    } else if (intent.changeClothes) {
      modeLines.push('【改衣服 / 改穿搭模式】');
      modeLines.push('本次要求重点是换装 / 穿搭 / 服装变化。');
      modeLines.push('保持你自己的身份、脸部特征、发型气质和核心形象不变。');
      modeLines.push('如果提供了额外参考图，只把额外参考图用于服装、配饰、造型、颜色、材质参考，不要把参考图中的人替换成你。');
      modeLines.push('不要使用今日穿搭覆盖用户指定或参考图中的衣服。');
    } else if (intent.changePose) {
      modeLines.push('【改姿势 / 改动作模式】');
      modeLines.push('本次要求重点是姿势 / 动作 / 表情变化。');
      modeLines.push('优先保持你今天的穿搭不变，只改变姿势、表情、镜头角度或肢体动作。');
      modeLines.push('如果提供了额外参考图，只参考其姿势、动作、表情、镜头角度或构图。');
    } else {
      modeLines.push('【今日穿搭 / 普通自拍模式】');
      modeLines.push('本次要求是普通自拍 / 看看你现在的样子。');
      modeLines.push('优先使用你今天的穿搭、状态和心情来生成一张自然的照片。');
    }

    if (intent.hasReferenceStyleHint && !intent.changeClothes && !intent.isGroupPhoto) {
      modeLines.push('如果提供了额外参考图，可以适度参考其风格、构图或氛围，但不要改变你自己的身份。');
    }

    const todayLines: string[] = [];

    /**
     * 今日穿搭规则：
     * - 普通自拍：传今日穿搭。
     * - 改姿势：传今日穿搭，因为只是换动作。
     * - 合照：可以传今日穿搭。
     * - 改衣服 / 改衣服+改姿势：不要传今日穿搭，避免覆盖用户参考图衣服。
     */
    if (dailyOutfitLine && !intent.changeClothes) {
      todayLines.push(dailyOutfitLine);
    }

    if (dailyStatusLine) todayLines.push(dailyStatusLine);
    if (dailyMoodLine) todayLines.push(dailyMoodLine);

    const actionLine = act
      ? `用户要求：${act}`
      : '用户要求：看着镜头自然自拍，展示你现在的样子。';

    const outputConstraintLines = intent.isGroupPhoto
      ? [
          '【生成要求】',
          '1. 你必须是画面主角之一，且身份来自参考图一或角色设定。',
          '2. 如果有多张额外参考图，允许出现多位同框对象；每位同框对象都应保持独立身份，不要融合脸，不要复制脸。',
          '3. 人物数量应符合用户要求和参考图数量；不要因为有多张参考图却只生成一个同框对象。',
          '4. 所有人物必须在同一个完整场景中，自然站位或坐位，姿势协调，比例合理，透视一致。',
          '5. 人物之间要有自然互动，例如并肩、靠近、一起看镜头、轻微倾身、自然手势，但不要肢体扭曲。',
          '6. 统一整体风格、光线方向、色彩、清晰度、镜头焦段和画面质感，不要像拼贴或抠图合成。',
          '7. 整张图像应像真实拍下的一张自然合照，不要多视角，不要拼图，不要分镜。',
          '8. 如果参考图中有动漫、游戏、二次元、卡通头像或插画角色，必须将其真人化为真实人类同框对象，不要生成玩偶、手办、毛绒玩具、抱枕、贴纸、立牌或 Q 版小人。',
          '9. 不要文字水印，不要角色设定图，不要多人复制脸。',
          '',
          'single coherent group photo, natural group selfie, multiple distinct real human people if references are provided, anime or game characters must be humanized into realistic live-action human cosplay characters, consistent lighting, consistent style, same camera perspective, natural poses, believable spatial relationship, no doll, no toy, no plush toy, no figurine, no chibi, no sticker, no pillow, no standee, no collage, no split screen, no character sheet, no face merging, no duplicated faces, no watermark, no text',
        ]
      : [
          '【生成要求】',
          '1. 保持主角就是你自己，不要变成另一个人。',
          '2. 可以根据本次要求自然变化衣服、姿势、表情、室内氛围和小道具。',
          '3. 整张图应像今天真实拍下的一张照片，而不是模板图。',
          '4. 不要拼图，不要分镜，不要角色展示板，不要多视角，不要文字水印。',
          '5. 表情、眼神和动作要符合当前要求与当前心情。',
          '',
          'single image, natural selfie photo, complete and unified scene, no collage, no grid, no split screen, no character sheet, no multiple views, no watermark, no text',
        ];
    
    return [
      `这是 ${botName} 的自拍照片。`,

      /**
       * 有固定形象图时，不让长人格描述压过参考图身份。
       * 没有形象图时，人格才作为主角身份依据。
       */
      !hasReferenceImage && personality ? `角色设定：${personality}` : '',

      ...identityLines,
      ...referenceLines,
      ...todayLines,
      ...modeLines,
      actionLine,
      ...outputConstraintLines,
    ].filter(Boolean).join('\n');
  }

  statusText (): string {
    this.ensureInit();

    const profile = this.data.daily_selfie_profile;

    const dailyText = profile
      ? [
          '',
          `📅 今日自拍设定：${profile.date}`,
          `🧩 来源：${profile.source === 'chat_model' ? '会话模型生成' : '本地随机兜底'}`,
          `👗 今日穿搭：${profile.outfit}`,
          `🏠 当前状态(${getTimePeriodLabel(getCurrentTimePeriod())})：${getProfileCurrentStatus(profile) || profile.status}`,
          `💗 当前心情：${profile.mood}`,
        ].join('\n')
      : '';

    if (!this.hasReferenceImage()) {
      return `📸 当前还没有设置 AI 自拍参考图喵～${dailyText}`;
    }

    return `📸 当前已设置 AI 自拍参考图喵～${dailyText}`;
  }
}

export const imagePersonaManager = new ImagePersonaManager();