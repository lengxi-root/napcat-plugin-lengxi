# 🐱 AI Cat - NapCat 智能助手插件

AI Cat 是一个适用于 **NapCat** 的智能助手插件，支持 AI 对话、群管理、渠道模型管理、联网搜索、历史消息查询、定时任务、用户检测器、点歌、AI 生图、图生图、AI 自拍形象等功能。

项目地址：

```text
https://github.com/liyw0205/napcat-plugin-aicat
```

---

## ✨ 功能特性

- 🤖 **AI 对话**
  - 支持 OpenAI 兼容接口
  - 支持多渠道、多模型优先级
  - 支持上下文记忆
  - 支持工具调用
  - 支持引用图片识图 / OCR

- 🎨 **AI 生图**
  - 支持文生图
  - 支持图生图 / 参考图
  - 支持多生图渠道
  - 支持生图队列和并发限制
  - 支持生图限频、每日额度、黑名单
  - 支持提示词审核和出图审核

- 📸 **AI 自拍形象**
  - 可设置 AI 自拍参考图
  - 支持 `/自拍`
  - 支持换衣服、换姿势、按参考图自拍
  - 支持今日自拍设定
  - 支持 Web 面板上传形象参考图

- 🔧 **群管理**
  - 禁言
  - 解禁
  - 踢人
  - 撤回
  - 设置管理员
  - 查询群成员信息

- 🧾 **渠道与模型管理**
  - 主人指令新增渠道
  - 拉取模型缓存
  - 查看模型缓存
  - 启用 / 禁用模型
  - 设置会话模型优先级
  - 设置生图模型优先级

- 📝 **消息记录**
  - 自动记录群聊 / 私聊消息
  - 支持历史消息查询
  - 支持正则搜索
  - 支持消息统计

- ⏰ **定时任务**
  - 定时发送消息
  - 定时调用 API
  - 支持立即执行
  - 支持启用 / 禁用

- 👀 **用户检测器**
  - 监控指定用户或全部用户
  - 支持关键词正则过滤
  - 支持自动回复、撤回、禁言、踢人、自定义 API 调用

- 🌐 **网络工具**
  - 搜索互联网
  - 获取网页内容

- 🎵 **点歌**
  - 支持网易云 / QQ 音乐搜索
  - 支持候选列表选择播放
  - 支持切换平台

- 📦 **Packet 调试**
  - OneBot API 调用
  - ProtoBuf 元素发送
  - 原始包发送
  - 消息 ProtoBuf 获取

- 🌸 **Web 管理面板**
  - 基础配置
  - 生图配置
  - 自拍形象上传
  - 渠道管理
  - 模型测试
  - 模型监控
  - 高级 JSON 配置

---

## 📦 安装教程

> 以下路径以你的 NapCat 安装目录为准。  
> 本插件需要安装到 NapCat 的 `plugins` 目录中。

### 1. 进入 NapCat 插件目录

```bash
cd /root/Napcat/opt/QQ/resources/app/app_launcher/napcat/plugins/
```

---

### 2. 克隆项目

```bash
git clone https://github.com/liyw0205/napcat-plugin-aicat napcat-plugin-aicat
```

克隆完成后的目录应为：

```text
/root/Napcat/opt/QQ/resources/app/app_launcher/napcat/plugins/napcat-plugin-aicat
```

---

### 3. 进入插件目录

```bash
cd napcat-plugin-aicat
```

---

### 4. 安装依赖

```bash
npm install
```

---

### 5. 构建插件

```bash
npm run build
```

构建完成后会生成：

```text
dist/index.mjs
```

---

### 6. 移动构建产物

将构建出来的入口文件移动到插件根目录：

```bash
mv dist/index.mjs index.mjs
```

最终插件目录中应存在：

```text
napcat-plugin-aicat/index.mjs
napcat-plugin-aicat/package.json
```

---

### 7. 重启 NapCat

完成后重启 NapCat，插件会被自动加载。

---

## 🔄 更新插件

进入插件目录：

```bash
cd /root/Napcat/opt/QQ/resources/app/app_launcher/napcat/plugins/napcat-plugin-aicat
```

拉取最新代码：

```bash
git pull
```

重新安装依赖并构建：

```bash
npm install
npm run build
mv dist/index.mjs index.mjs
```

然后重启 NapCat。

---

## ⚙️ 基础配置

插件基础配置可以在 **NapCat 插件配置页** 中修改。

常用配置项：

| 配置项 | 说明 |
|---|---|
| `ownerQQs` | 核心主人 QQ，多个可用逗号、空格、换行、斜杠分隔 |
| `prefix` | 指令前缀，默认 `/` |
| `enableReply` | 是否启用 AI 对话回复 |
| `sendConfirmMessage` | AI 请求前是否发送确认消息 |
| `confirmMessage` | 确认消息文本 |
| `botName` | 机器人名称 |
| `personality` | AI 人设 |
| `maxContextTurns` | 上下文轮数 |
| `allowAtTrigger` | 是否允许艾特触发 AI |
| `allowPublicPacket` | 是否允许公开使用取包指令 |
| `safetyFilter` | 是否启用安全过滤 |
| `whitelistQQs` | 白名单 QQ |
| `disabledGroups` | 禁用 AI 的群 |
| `webEnable` | 是否启用 Web 管理面板 |
| `webPort` | Web 管理面板端口 |
| `webToken` | Web 管理面板访问 Token |

---

## 🌐 Web 管理面板

如果启用了 Web 管理面板：

```text
webEnable = true
webPort = 14514
webToken = changeme
```

访问：

```text
http://服务器IP:14514
```

或本机访问：

```text
http://127.0.0.1:14514
```

登录时填写 `webToken`。

也可以通过 URL 携带 Token：

```text
http://127.0.0.1:14514/?token=你的Token
```

Web 面板支持：

- 基础设置
- 生图设置
- 自拍形象设置
- 生图审核
- 渠道管理
- 模型测试
- 模型监控
- 高级 JSON 配置

---

## 🧩 列表配置写法

以下配置支持多种写法：

- `ownerQQs`
- `whitelistQQs`
- `disabledGroups`
- `imageUmoBlacklist`
- `imageAuditWhitelist`
- `imagePromptBlockedWords`
- `randomIgnoreQQs`

支持逗号：

```text
123456,234567
```

支持中文逗号：

```text
123456，234567
```

支持斜杠：

```text
123456/234567
```

支持顿号：

```text
123456、234567
```

支持空格或换行：

```text
123456 234567
```

也支持 JSON 数组：

```json
["123456","234567"]
```

---

## 🚀 基础指令

假设前缀为 `/`。

| 指令 | 说明 |
|---|---|
| `/帮助` | 查看帮助 |
| `/内容` | 与 AI 对话 |
| `/上下文` | 查看当前上下文状态 |
| `/清除上下文` | 清除当前上下文 |
| `/AI状态` | 查看本群 AI 状态 |
| `/生图 提示词` | 生成图片 |
| `/生图模型` | 查看已启用生图模型 |
| `/预设` | 查看生图预设 |
| `/自拍` | 生成 AI 自拍 |
| `/自拍 动作或场景` | 指定动作或场景自拍 |
| `/形象查看` | 查看当前 AI 自拍形象 |
| `/形象设置` | 设置 AI 自拍参考图 |
| `/形象清除` | 清除 AI 自拍参考图 |
| `加白` | 申请加入白名单 |
| `加白 验证码` | 验证加入白名单 |

---

## 👑 主人指令

以下指令仅核心主人可用。

### 主人和白名单

| 指令 | 说明 |
|---|---|
| `/主人列表` | 查看核心主人 |
| `/白名单列表` | 查看白名单 |
| `/白名单` | 查看白名单 |
| `/加白 QQ号` | 添加白名单 |
| `/加白名单 QQ号` | 添加白名单 |
| `/移除白 QQ号` | 移除动态白名单 |
| `/移除白名单 QQ号` | 移除动态白名单 |

---

### 群 AI 开关

| 指令 | 说明 |
|---|---|
| `/开启AI` | 开启本群 AI |
| `/关闭AI` | 关闭本群 AI |
| `/AI状态` | 查看本群 AI 状态 |

---

## 🧾 渠道管理

本插件使用统一渠道管理。

一个渠道可以同时加入：

- 会话渠道
- 生图渠道

---

### 新增渠道

```text
/新增渠道 渠道名 渠道域名 sk
```

可选指定生图 Provider：

```text
/新增渠道 渠道名 渠道域名 sk provider
```

示例：

```text
/新增渠道 openai https://api.openai.com sk-xxx
```

```text
/新增渠道 gemini https://generativelanguage.googleapis.com sk-xxx gemini
```

支持的 Provider：

| Provider | 说明 |
|---|---|
| `openai` | OpenAI 兼容生图接口 |
| `gemini` | Google Gemini 原生接口 |
| `gemini_openai` | Gemini OpenAI 兼容接口 |
| `z_image_gitee` | Gitee AI Z-Image |
| `jimeng2api` | Jimeng2API |
| `grok` | xAI Grok 生图 |

---

### 拉取模型

拉取指定渠道：

```text
/拉取渠道 openai
```

拉取全部渠道：

```text
/拉取渠道
```

---

### 查看渠道缓存

查看全部渠道：

```text
/查看渠道
```

查看指定渠道：

```text
/查看渠道 openai
```

查看会话模型缓存：

```text
/查看会话缓存
```

查看生图模型缓存：

```text
/查看生图缓存
```

---

### 删除渠道

```text
/删除渠道 渠道名
```

删除渠道会同时清理：

- 会话渠道
- 生图渠道
- 对应模型缓存
- 对应模型优先级

---

## 🤖 会话模型管理

### 查看已启用会话模型

```text
/查看会话模型
```

### 启用会话模型

使用完整模型名：

```text
/启用会话模型 渠道/模型名
```

示例：

```text
/启用会话模型 openai/gpt-4o
```

也可以使用缓存序号：

```text
/启用会话模型 1 2 3
```

> 序号来自 `/查看会话缓存`。

---

### 禁用会话模型

```text
/禁用会话模型 渠道/模型名
```

或使用已启用模型序号：

```text
/禁用会话模型 1 2
```

---

### 设置会话模型优先级

```text
/设置会话模型 渠道/模型名 渠道/模型名
```

或使用已启用模型序号：

```text
/设置会话模型 4 3 12
```

没有写到的已启用模型，会自动排在后面。

---

## 🎨 生图模型管理

### 查看已启用生图模型

```text
/查看生图模型
```

### 启用生图模型

```text
/启用生图模型 渠道/模型名
```

示例：

```text
/启用生图模型 openai/gpt-image-1
```

也可以使用缓存序号：

```text
/启用生图模型 1 2 3
```

> 序号来自 `/查看生图缓存`。

---

### 禁用生图模型

```text
/禁用生图模型 渠道/模型名
```

或使用已启用模型序号：

```text
/禁用生图模型 1 2
```

---

### 设置生图模型优先级

```text
/设置生图模型 渠道/模型名 渠道/模型名
```

或使用已启用模型序号：

```text
/设置生图模型 4 3 12
```

---

## 🎨 生图指令

### 文生图

```text
/生图 一只白色猫咪，坐在樱花树下，柔和光线，精致插画风格
```

---

### 图生图 / 参考图

以下情况会自动读取参考图：

- 指令消息中包含图片
- 回复一条带图片的消息再发送生图指令
- 指令中艾特用户时，会尝试读取被艾特用户头像作为参考图

示例：

```text
/生图 把这张图改成赛博朋克风格
```

---

## 📸 AI 自拍

### 查看形象

```text
/形象查看
```

### 设置形象

发送图片并配文：

```text
/形象设置
```

或引用一张图片：

```text
/形象设置
```

也可以使用图片链接：

```text
/形象设置 https://example.com/image.png
```

### 清除形象

```text
/形象清除
```

### 自拍

```text
/自拍
```

```text
/自拍 坐在窗边看着镜头微笑
```

也支持自然语言：

```text
看看你
```

```text
你穿这个
```

```text
换成这张图的衣服和姿势
```

---

## 📌 生图预设

### 查看预设

```text
/预设
```

### 添加预设

仅主人可用：

```text
/预设 添加 名称:提示词
```

示例：

```text
/预设 添加 二次元:精致二次元插画，高质量，柔和光线
```

也支持 JSON：

```text
/预设 添加 壁纸:{"prompt":"超清壁纸，电影感光影","aspect_ratio":"16:9","resolution":"2K","description":"横屏壁纸"}
```

### 删除预设

```text
/预设 删除 名称
```

### 使用预设

```text
/生图 二次元 一只猫娘
```

或直接：

```text
/二次元 一只猫娘
```

---

## 🎵 点歌

### 搜索歌曲

```text
点歌 歌名
```

```text
QQ点歌 歌名
```

```text
网易云点歌 歌名
```

### 选择歌曲

```text
选歌 3
```

### 切换平台

```text
换平台
```

---

## 👀 用户检测器

### 查看检测器

```text
/检测器列表
```

用户检测器也可以通过 AI 工具添加、删除、启用、禁用。

支持动作：

| 动作 | 说明 |
|---|---|
| `reply` | 自动回复 |
| `recall` | 撤回消息 |
| `ban` | 禁言 |
| `kick` | 踢人 |
| `api_call` | 自定义 OneBot API 调用 |

---

## ⏰ 定时任务

AI 可以通过工具创建定时任务。

支持任务类型：

| 类型 | 说明 |
|---|---|
| `send_message` | 定时发送消息 |
| `api_call` | 定时调用 API |

支持：

- 每日定时
- 间隔执行
- 立即执行
- 启用 / 禁用
- 删除任务

---

## 📝 历史消息查询

AI 可以查询插件记录的历史消息。

支持：

- 按群查询
- 按用户查询
- 按关键词查询
- 按正则搜索
- 查询消息统计
- 根据消息 ID 查询详情

---

## 🌐 网络工具

AI 可调用网络工具：

| 工具 | 说明 |
|---|---|
| `web_search` | 搜索互联网 |
| `fetch_url` | 获取网页内容 |

搜索引擎支持：

- 自动
- 百度
- Bing
- 搜狗

---

## 📦 Packet 指令

### 公开取包指令

如果开启：

```text
allowPublicPacket = true
```

普通用户可用：

| 指令 | 说明 |
|---|---|
| `取` | 获取回复消息的 OneBot / ProtoBuf 数据 |
| `取上一条` | 获取上一条消息 |
| `取 RealSeq` | 按 Real Seq 获取消息 |

---

### 主人 Packet 指令

仅主人可用：

| 指令 | 说明 |
|---|---|
| `api <OneBot API>` | 直接调用 OneBot API |
| `pb <json>` | 发送 ProtoBuf 元素 |
| `pbl <json>` | 发送长 ProtoBuf 消息 |
| `raw <cmd>\n<json>` | 发送原始数据包 |
| `模式取1` | 切换平铺取包模式 |
| `模式取2` | 切换嵌套取包模式 |

---

## 🔐 权限说明

| 用户类型 | 权限 |
|---|---|
| 核心主人 | 最高权限，可管理渠道、模型、白名单、检测器、定时任务等 |
| 白名单用户 | 不受生图限频和每日额度限制 |
| 群管理员 | 可让 AI 执行部分群管理操作 |
| 普通用户 | 可使用 AI 对话、生图、点歌等普通功能 |

核心主人只能在 NapCat 配置页或配置文件的 `ownerQQs` 中配置。

---

## 🛡️ 安全策略

插件包含多层安全限制：

- 普通用户不能通过 AI 发送危险媒体 CQ 码
- 普通用户不能跨群操作
- 普通用户不能调用主人专属 API
- 群管理 API 需要管理员权限
- 生图支持黑名单、限频、每日额度
- 生图支持提示词审核和出图审核

---

## 📁 数据文件

插件会在数据目录中保存运行数据，例如：

| 文件 / 目录 | 说明 |
|---|---|
| `whitelist.json` | 动态白名单 |
| `custom_commands.json` | 自定义指令 |
| `scheduled_tasks.json` | 定时任务 |
| `user_watchers.json` | 用户检测器 |
| `image_usage.json` | 生图使用记录 |
| `image_presets.json` | 生图预设 |
| `image_persona.json` | AI 自拍形象配置 |
| `image-persona/` | AI 自拍参考图 |
| `image-cache/` | 生图缓存 |
| `model-cache/` | 模型缓存 |
| `model_monitor.json` | 模型调用监控 |
| `log/` | 消息记录 |

---

## 🧪 常见配置流程

### 1. 配置主人

在 NapCat 插件配置页设置：

```text
ownerQQs = 123456
```

多个主人可以写：

```text
123456,234567
```

或：

```text
123456/234567
```

---

### 2. 新增渠道

```text
/新增渠道 openai https://api.openai.com sk-xxx
```

---

### 3. 拉取模型

```text
/拉取渠道 openai
```

---

### 4. 查看缓存

```text
/查看渠道 openai
```

---

### 5. 启用会话模型

```text
/启用会话模型 openai/gpt-4o
```

或：

```text
/启用会话模型 1
```

---

### 6. 启用生图模型

```text
/启用生图模型 openai/gpt-image-1
```

---

### 7. 设置优先级

```text
/设置会话模型 openai/gpt-4o
```

```text
/设置生图模型 openai/gpt-image-1
```

---

### 8. 开始使用

```text
/你好
```

```text
/生图 一只可爱的猫娘
```

```text
/自拍 看着镜头微笑
```

---

## 🔧 开发

### 安装依赖

```bash
npm install
```

### 构建

```bash
npm run build
```

### 构建产物

```text
dist/index.mjs
```

NapCat 实际加载入口建议放在插件根目录：

```bash
mv dist/index.mjs index.mjs
```

---

## ❓ 常见问题

### 1. 插件没有加载？

检查插件目录是否正确：

```text
/root/Napcat/opt/QQ/resources/app/app_launcher/napcat/plugins/napcat-plugin-aicat
```

并确认存在：

```text
index.mjs
package.json
```

---

### 2. 修改代码后不生效？

重新构建并移动入口文件：

```bash
npm run build
mv dist/index.mjs index.mjs
```

然后重启 NapCat。

---

### 3. Web 面板打不开？

检查配置：

```text
webEnable = true
webPort = 14514
webToken = changeme
```

然后访问：

```text
http://127.0.0.1:14514
```

如果是服务器，请检查防火墙和端口放行。

---

### 4. 生图没有参考图片？

请确认：

1. 使用的生图模型支持图生图；
2. 引用消息中确实包含图片；
3. 图片没有超过 `imageMaxImageSizeMB`；
4. 当前生图 Provider 支持参考图。

推荐使用支持图生图的模型，例如：

- OpenAI `gpt-image` 系列
- Gemini 原生图像模型
- Gemini OpenAI 兼容图像模型

---

## 📄 License

请以项目仓库实际 License 为准。