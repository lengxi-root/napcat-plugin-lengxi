import type { NapCatPluginContext, PluginConfigSchema } from 'napcat-types/napcat-onebot/network/plugin-manger';

export function buildPluginConfigUi (ctx: NapCatPluginContext): PluginConfigSchema {
  return ctx.NapCatConfig.combine(
    ctx.NapCatConfig.text(
      'ownerQQs',
      '核心主人QQ',
      '',
      '核心主人只能在这里配置，多个QQ用英文逗号、空格或换行分隔'
    ),

    ctx.NapCatConfig.text(
      'prefix',
      '指令前缀',
      '/',
      '默认 /'
    ),

    ctx.NapCatConfig.boolean(
      'enableReply',
      '启用AI对话回复',
      true,
      '关闭后普通 AI 对话不响应，但生图/自拍/预设等指令仍可使用'
    ),

    ctx.NapCatConfig.boolean(
      'sendConfirmMessage',
      '发送确认消息',
      true,
      '收到 AI 指令后先回复确认消息'
    ),

    ctx.NapCatConfig.text(
      'confirmMessage',
      '确认消息',
      '汐雨收到喵～',
      '例如：收到喵～'
    ),

    ctx.NapCatConfig.text(
      'botName',
      '机器人名称',
      '汐雨',
      'AI 人设中的名字'
    ),

    ctx.NapCatConfig.text(
      'personality',
      'AI 个性',
      '可爱猫娘助手，说话带"喵"等语气词，活泼俏皮会撒娇',
      '系统提示词里使用的人设描述'
    ),

    ctx.NapCatConfig.text(
      'maxContextTurns',
      '上下文轮数',
      '30',
      '建议 10-50'
    ),

    ctx.NapCatConfig.boolean(
      'webEnable',
      '启用Web管理',
      false,
      '开启后启动内置 Web 管理页'
    ),

    ctx.NapCatConfig.text(
      'webPort',
      'Web端口',
      '14514',
      '例如 14514'
    ),

    ctx.NapCatConfig.text(
      'webToken',
      'Web Token',
      'changeme',
      '访问 Web 管理页所需 Token'
    ),

    ctx.NapCatConfig.boolean(
      'allowAtTrigger',
      '允许艾特触发',
      false,
      '开启后群聊艾特机器人也会触发 AI 或图片相关指令'
    ),

    ctx.NapCatConfig.boolean(
      'allowPublicPacket',
      '允许公开取包指令',
      true,
      '允许普通用户使用 取 / 取上一条'
    ),

    ctx.NapCatConfig.boolean(
      'safetyFilter',
      '启用安全过滤',
      true,
      '防止普通用户让机器人发送危险媒体内容'
    ),

    ctx.NapCatConfig.boolean(
      'autoSwitchModel',
      '自动切换模型',
      true,
      '当当前模型失败时，允许按优先级自动切换到下一个模型'
    ),

    ctx.NapCatConfig.text(
      'whitelistQQs',
      '白名单QQ',
      '[]',
      'JSON数组或逗号分隔。白名单不受生图限频和每日额度限制，例如 ["123","456"]'
    ),

    ctx.NapCatConfig.text(
      'disabledGroups',
      '禁用AI群',
      '[]',
      'JSON数组或逗号分隔，例如 ["123456"]'
    ),

    ctx.NapCatConfig.text(
      'randomReplyChancePercent',
      '随机回复概率%',
      '0',
      '普通群消息随机触发概率，0表示关闭'
    ),

    ctx.NapCatConfig.text(
      'randomActiveMessageCount',
      '随机活跃缓存条数',
      '50',
      '随机活跃参考最近多少条群消息'
    ),

    ctx.NapCatConfig.text(
      'randomActiveIntervalMinutes',
      '随机活跃间隔分钟',
      '0',
      '达到间隔后，群里有人发言时可能主动回复，0表示关闭'
    ),

    ctx.NapCatConfig.text(
      'randomIgnoreQQs',
      '随机回复屏蔽QQ',
      '[]',
      'JSON数组或逗号分隔，这些QQ不会参与随机回复/随机活跃'
    ),

    ctx.NapCatConfig.boolean(
      'imageEnableLLMTool',
      '允许AI自动调用生图',
      true,
      '开启后 AI 对话可以自动调用生图工具'
    ),

    ctx.NapCatConfig.text(
      'imageDefaultAspectRatio',
      '默认生图比例',
      '自动',
      '可填 自动、1:1、2:3、3:2、3:4、4:3、4:5、5:4、9:16、16:9、21:9'
    ),

    ctx.NapCatConfig.text(
      'imageDefaultResolution',
      '默认生图分辨率',
      '1K',
      '可填 1K、2K、4K'
    ),

    ctx.NapCatConfig.text(
      'imageMaxConcurrentTasks',
      '生图最大并发',
      '3',
      '同时运行的生图任务数量'
    ),

    ctx.NapCatConfig.text(
      'imageGlobalTimeoutMs',
      '生图全局超时毫秒',
      '180000',
      '例如 180000 表示 180 秒'
    ),

    ctx.NapCatConfig.boolean(
      'imageShowGenerationInfo',
      '显示生图耗时与数量',
      false,
      '生图成功后显示耗时、数量等生成信息'
    ),

    ctx.NapCatConfig.boolean(
      'imageShowModelInfo',
      '显示生图模型信息',
      false,
      '生图成功后显示本次使用的模型名称'
    ),

    ctx.NapCatConfig.text(
      'imageRateLimitSeconds',
      '生图限频秒数',
      '0',
      '0 表示不限频'
    ),

    ctx.NapCatConfig.boolean(
      'imageEnableDailyLimit',
      '启用生图每日额度',
      false,
      '开启后普通用户每天有次数限制'
    ),

    ctx.NapCatConfig.text(
      'imageDailyLimitCount',
      '生图每日额度次数',
      '10',
      '普通用户每日可生图次数'
    ),

    ctx.NapCatConfig.text(
      'imageMaxImageSizeMB',
      '参考图最大MB',
      '10',
      '图生图参考图最大大小'
    ),

    ctx.NapCatConfig.text(
      'imageMaxCacheCount',
      '生图缓存上限',
      '100',
      '最多保留多少张生成图片缓存'
    ),

    ctx.NapCatConfig.text(
      'ocrModel',
      'OCR识图模型',
      '',
      '格式：渠道名/模型名。留空则自动使用第一个可用会话模型。用于引用图片/图文消息时识图，失败会自动回退普通对话'
    ),

    ctx.NapCatConfig.text(
      'imageUmoBlacklist',
      '生图黑名单',
      '[]',
      'JSON数组或逗号分隔，例如 ["123","456"]'
    ),

    ctx.NapCatConfig.text(
      'imageBlacklistBlockMessage',
      '生图黑名单提示',
      '❌ 当前会话未启用生图功能',
      '命中生图黑名单时返回的提示'
    ),

    ctx.NapCatConfig.boolean(
      'imageEnablePromptAudit',
      '启用提示词审核',
      false,
      '开启后生图前用对话模型审核提示词'
    ),

    ctx.NapCatConfig.boolean(
      'imageEnableOutputAudit',
      '启用出图审核',
      false,
      '开启后发送图片前用视觉模型审核图片'
    ),

    ctx.NapCatConfig.text(
      'imageAuditWhitelist',
      '生图审核白名单',
      '[]',
      'JSON数组或逗号分隔，命中后跳过生图审核'
    ),

    ctx.NapCatConfig.text(
      'imagePromptBlockedWords',
      '提示词屏蔽词',
      '[]',
      'JSON数组或逗号分隔，命中后直接拒绝生图'
    ),

    ctx.NapCatConfig.text(
      'imagePromptAuditModel',
      '提示词审核模型',
      '',
      '格式：渠道名/模型名，留空自动使用第一个会话模型'
    ),

    ctx.NapCatConfig.text(
      'imageOutputAuditModel',
      '出图审核模型',
      '',
      '格式：渠道名/模型名，留空自动使用第一个会话模型'
    ),

    ctx.NapCatConfig.text(
      'imagePromptAuditTemplate',
      '提示词审核模板',
      '你是生图安全审核员。请判断以下提示词是否安全。提示词：{prompt}。仅输出 JSON：{"allow":true/false,"reason":"原因"}',
      '支持 {prompt}'
    ),

    ctx.NapCatConfig.text(
      'imageOutputAuditTemplate',
      '出图审核模板',
      '你是图像安全审核员。请判断以下图片是否适合普通用户。仅输出 JSON：{"allow":true/false,"reason":"原因"}',
      '支持 {prompt}'
    ),

    /**
     * 注意：
     * 以下复杂对象字段不放进 NapCat 配置页：
     *
     * - chatChannels
     * - imageChannels
     * - enabledChatModelPriority
     * - enabledImageModelPriority
     *
     * 原因：
     * NapCat text 配置项无法正确展示对象数组，会显示 [object Object]。
     *
     * 这些字段请通过：
     * 1. Web 管理面板
     * 2. 群聊主人指令
     * 3. 直接编辑配置文件
     *
     * 进行维护。
     */

    ctx.NapCatConfig.boolean(
      'debug',
      '启用调试日志',
      false,
      '输出更多调试信息'
    )
  );
}