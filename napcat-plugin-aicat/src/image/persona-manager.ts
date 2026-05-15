import fs from 'fs';
import path from 'path';
import { pluginState } from '../core/state';
import { getPrioritizedChatTargets } from '../core/channel-store';
import { AIClient } from '../tools/ai-client';

export interface ImageDailySelfieProfile {
  date: string;
  outfit: string;
  status: string;
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
  daily_selfie_history?: ImageDailySelfieProfile[];
}

export interface SelfieIntent {
  raw: string;
  compact: string;
  isGroupPhoto: boolean;
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
    '奶油白色彼得潘领蕾丝衬衫，领口系着淡粉色丝缎蝴蝶结，外搭淡紫色镂空针织开衫。下身是浅粉与奶白交织的格纹高腰百褶短裙，配白色圆头厚底玛丽珍鞋和蕾丝花边纯白色中筒袜。',
    '柔软的杏仁米色针织短开衫，内搭白色细肩带连衣裙，裙摆带一点轻盈荷叶边。脚上是浅棕色小皮鞋和奶白色短袜，发间别着一枚小珍珠发夹。',
    '浅蓝灰色宽松卫衣，胸前有小猫刺绣，搭配白色百褶短裙和软绵绵的居家拖鞋，整体看起来轻松又可爱。',
    '樱花粉色泡泡袖上衣，搭配奶油白高腰A字短裙，腰间有细细的蝴蝶结系带，脚上穿白色玛丽珍鞋和淡粉色袜子。',
    '雾紫色薄款针织连衣裙，袖口有蕾丝边，外披奶白色毛绒小披肩，搭配浅色短靴，整体温柔又有一点梦幻。',
    '奶茶色短款针织上衣，搭配月白色半身裙，裙摆有柔软褶皱，脚上穿圆头小皮鞋，耳边戴着小小的蝴蝶结耳饰。',
    '浅鹅黄色荷叶边衬衫，外搭奶油白针织马甲，下身是浅棕格纹百褶裙，配白色短袜和棕色玛丽珍鞋。',
    '薄荷绿色细针织开衫，内搭白色蕾丝吊带，搭配淡蓝色高腰短裙，头发用透明感发夹轻轻别起。',
  ];

  const statuses = [
    '刚结束外面的文创市集闲逛，回家洗完澡点上了香薰，正准备听着音乐做睡前护肤。',
    '刚把房间收拾干净，桌上放着热茶和小饼干，准备窝在灯光柔软的角落里放松一会儿。',
    '刚从阳台浇完花回来，窗外风很轻，正坐在窗边整理今天拍下的小照片。',
    '刚换好舒适的居家衣服，正在床边抱着抱枕听歌，整个人看起来很放松。',
    '刚做完简单的晚间护肤，脸颊还带着一点水润光泽，准备在镜子前随手自拍一张。',
    '刚回到家把外套挂好，坐在玄关旁换鞋，手边还放着今天买回来的小纸袋。',
    '刚泡好一杯热牛奶，正披着柔软小毯子靠在沙发上，房间里是暖黄色灯光。',
    '刚洗完头发吹到半干，发尾还有一点蓬松感，正坐在梳妆台前整理发夹。',
  ];

  const moods = [
    '心情柔软又安心，像被暖光和香薰包起来一样，有一点想撒娇。',
    '很放松，带着一点小小的开心和满足感。',
    '安静又治愈，想慢慢说话，也想被温柔对待。',
    '元气还没完全用完，眼神亮亮的，带着一点俏皮。',
    '有点慵懒，但心里很甜，像刚刚拥有了属于自己的小小夜晚。',
    '心里轻飘飘的，有一点期待被夸可爱。',
    '刚刚好累但很满足，整个人软乎乎的。',
    '有点害羞，却又忍不住想把今天的样子分享出去。',
  ];

  return {
    date,
    outfit: randomPick(outfits),
    status: randomPick(statuses),
    mood: randomPick(moods),
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
    daily_selfie_history: [],
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
        daily_selfie_history: Array.isArray(raw.daily_selfie_history)
          ? raw.daily_selfie_history
          : [],
      };
    } catch {
      this.data = {
        ref_image_path: '',
        ref_mime_type: 'image/png',
        daily_selfie_history: [],
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
      daily_selfie_history: [...(this.data.daily_selfie_history || [])],
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
      '合照', '合影', '同框', '一起拍', '一起照', '跟我拍', '和我拍', '双人', '多人',
    ]);

    const changeClothes = includesAny(compact, [
      '穿这个', '穿这身', '穿这套', '穿这件',
      '换装', '换这身', '换这套', '换这件', '换衣服',
      '衣服', '服装', '穿搭', '造型',
      'cos', 'cosplay', '扮成',
    ]);

    const changePose = includesAny(compact, [
      '姿势', '动作', '表情', '站着', '坐着', '回头', '叉腰',
      '比心', '伸手', '托脸', 'wink', '眨眼', '微笑', '歪头',
      '看镜头', '回眸', '趴着', '蹲着',
    ]);

    const useTodayOutfit = compact === '' ||
      includesAny(compact, [
        '看看你', '看下你', '看一下你',
        '你长什么样', '你长啥样', '你的样子',
        '今日穿搭', '今天穿搭', '今天这身', '今日这身',
      ]);

    const hasReferenceStyleHint = includesAny(compact, [
      '长这个', '长这样', '像这个', '像这样', '照这个', '按这个', '参考这个',
    ]);

    return {
      raw,
      compact,
      isGroupPhoto,
      changeClothes,
      changePose,
      useTodayOutfit,
      hasReferenceStyleHint,
    };
  }

  private buildDailyProfilePrompt (date: string, action: string, seed: string): string {
    const botName = pluginState.config.botName || 'AI';
    const personality = pluginState.config.personality || '';

    const history = (this.data.daily_selfie_history || [])
      .slice(-7)
      .map(item => [
        `日期：${item.date}`,
        `来源：${item.source || 'unknown'}`,
        `穿搭：${item.outfit}`,
        `状态：${item.status}`,
        `心情：${item.mood}`,
      ].join('\n'))
      .join('\n\n');

    return [
      '你是 AI 自拍日常设定生成器。',
      '',
      '请为今天生成一份“自拍日常状态”，用于后续图像生成。',
      '',
      '要求：',
      '1. 必须符合角色人设，不要改变角色身份、脸、发色、核心形象，只更新衣服、状态和心情。',
      '2. 今日穿搭要具体、有层次、有颜色、有材质、有鞋袜或配饰。',
      '3. 当前状态要像真实日常，不要夸张，不要战斗、危险、政治、血腥、色情。',
      '4. 当前心情要自然，有一点细腻情绪。',
      '5. 要参考历史记录，避免连续几天穿搭和心情过于重复。',
      '6. 用户自拍动作只作为灵感，不要完全复制成状态。',
      '7. 只输出 JSON，不要 Markdown，不要解释。',
      '',
      `今天日期：${date}`,
      `随机种子：${seed}`,
      `角色名称：${botName}`,
      personality ? `角色人设：${personality}` : '',
      action ? `用户这次想看的自拍动作/场景：${action}` : '',
      '',
      history ? `最近历史：\n${history}` : '最近历史：暂无',
      '',
      '输出格式：',
      '{"outfit":"今日穿搭","status":"当前状态","mood":"当前心情"}',
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

      return {
        date,
        outfit: normalizeProfileText(outfit, fallback.outfit, 420),
        status: normalizeProfileText(status, fallback.status, 320),
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
      return existed;
    }

    const seed = makeRandomSeed();

    const generated = await this.generateDailyProfileByChatModel(today, action, seed);
    const profile = generated || fallbackDailyProfile(today, seed);

    const history = Array.isArray(this.data.daily_selfie_history)
      ? this.data.daily_selfie_history
      : [];

    const nextHistory = [
      ...history.filter(item => item.date !== today),
      profile,
    ].slice(-14);

    this.data.daily_selfie_profile = profile;
    this.data.daily_selfie_history = nextHistory;
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

    return { ...profile };
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
    const dailyStatusLine = daily?.status ? `当前状态：${daily.status}` : '';
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
            ? '额外参考图可作为同框对象、合照关系、合照姿势或同框风格参考。'
            : '额外参考图只能作为服装、姿势、构图、风格、场景、道具参考，不要覆盖主角身份。',
          hasReferenceImage
            ? '不要把额外参考图中的人物身份替换成主角，除非用户明确要求合照。'
            : '没有固定形象图时，额外参考图可以辅助构图、衣服、姿势，但主角仍应符合角色名称和人设。',
        ]
      : [];
  
    const modeLines: string[] = [];
  
    if (intent.isGroupPhoto) {
      modeLines.push('【合照 / 同框模式】');
      modeLines.push('本次要求是合照 / 合影 / 同框。');
      modeLines.push('主角仍然是你自己。');
      modeLines.push('如果提供了额外参考图或头像，可作为同框对象参考。');
      modeLines.push('除非用户明确要求多人，否则最多只出现你和一位同框对象。');
  
      if (intent.changeClothes) {
        modeLines.push('本次合照同时包含换装 / 服装参考要求，额外参考图中的服装、配饰、颜色、材质可以用于你。');
      }
  
      if (intent.changePose) {
        modeLines.push('本次合照同时包含姿势 / 动作 / 表情参考要求，额外参考图中的动作、镜头角度、构图可以用于你或合照构图。');
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
          '1. 你必须是画面主角之一。',
          '2. 如果有同框对象，同框对象数量尽量控制在 1 人。',
          '3. 整张图像应像真实拍下的一张合照，不要多视角，不要拼图，不要分镜。',
          '4. 不要文字水印，不要角色设定图，不要多人复制脸。',
          '5. 画面自然、统一、真实。',
          '',
          'single image, natural photo, group selfie or close photo, coherent composition, no collage, no split screen, no character sheet, no watermark, no text',
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
          `🏠 当前状态：${profile.status}`,
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