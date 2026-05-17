export function getAdminIndexHtml (): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>AI Cat Web管理</title>
<style>
:root{
  --bg:#fff3fb;
  --bg2:#ffe6f4;
  --card:rgba(255,255,255,.86);
  --text:#3b2432;
  --muted:#8a6077;
  --primary:#ff69b4;
  --primary2:#ff8dcc;
  --primary3:#ffd4ec;
  --border:#ffd0e8;
  --soft:#fff7fc;
  --danger:#ff4f7b;
  --green:#35c795;
  --blue:#6aa8ff;
  --yellow:#ffe8a3;
  --shadow:0 16px 45px rgba(255,105,180,.18);
}
*{box-sizing:border-box}
html,body{min-height:100%}
body{
  margin:0;
  background:
    radial-gradient(circle at 7% 6%, rgba(255,255,255,.95) 0 6%, transparent 24%),
    radial-gradient(circle at 92% 10%, rgba(255,185,222,.75) 0 9%, transparent 32%),
    radial-gradient(circle at 50% 100%, rgba(255,210,235,.9) 0 8%, transparent 35%),
    linear-gradient(135deg,var(--bg),var(--bg2));
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;
}
body::before{
  content:"";
  position:fixed;
  inset:0;
  pointer-events:none;
  opacity:.28;
  background-image:
    radial-gradient(circle,#ff9fd0 1.2px,transparent 1.3px),
    radial-gradient(circle,#ffffff 1.2px,transparent 1.3px);
  background-size:34px 34px,47px 47px;
  background-position:0 0,12px 18px;
}
button,input,textarea,select{font:inherit}
button{
  border:0;
  background:linear-gradient(135deg,var(--primary),var(--primary2));
  color:#fff;
  border-radius:999px;
  padding:10px 15px;
  font-weight:800;
  cursor:pointer;
  box-shadow:0 8px 18px rgba(255,105,180,.25);
}
button:disabled{opacity:.55;cursor:not-allowed}
input,textarea,select{
  width:100%;
  border:1px solid var(--border);
  border-radius:15px;
  padding:10px 12px;
  font-size:14px;
  background:#fff;
  color:var(--text);
  outline:none;
}
input:focus,textarea:focus,select:focus{
  border-color:var(--primary);
  box-shadow:0 0 0 4px rgba(255,105,180,.14);
}
textarea{
  min-height:160px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  line-height:1.55;
}
input[type=checkbox]{width:auto;margin-right:8px;transform:scale(1.12)}
label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
header{
  position:sticky;
  top:0;
  z-index:20;
  background:rgba(255,255,255,.82);
  backdrop-filter:blur(16px);
  border-bottom:1px solid var(--border);
  padding:13px 18px;
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:center;
}
h1{font-size:19px;margin:0;display:flex;align-items:center;gap:8px}
h1::after{
  content:"Nya~";
  font-size:11px;
  color:#be185d;
  background:#fce7f3;
  border:1px solid var(--border);
  border-radius:999px;
  padding:3px 8px;
}
main{
  max-width:1240px;
  margin:0 auto;
  padding:16px;
  display:grid;
  grid-template-columns:228px minmax(0,1fr);
  gap:16px;
  position:relative;
  z-index:1;
}
nav{
  position:sticky;
  top:78px;
  align-self:start;
  background:var(--card);
  border:1px solid var(--border);
  border-radius:24px;
  padding:10px;
  box-shadow:var(--shadow);
}
nav button{
  width:100%;
  border:0;
  background:transparent;
  color:var(--text);
  text-align:left;
  padding:11px 12px;
  border-radius:16px;
  cursor:pointer;
  box-shadow:none;
}
nav button.active{
  background:linear-gradient(135deg,#ff70b7,#ff9bd2);
  color:white;
  font-weight:900;
  box-shadow:0 9px 18px rgba(255,105,180,.24);
}
section{
  display:none;
  background:var(--card);
  border:1px solid var(--border);
  border-radius:24px;
  padding:17px;
  margin-bottom:16px;
  box-shadow:var(--shadow);
  backdrop-filter:blur(12px);
}
section.active{display:block}
h2{margin:0 0 14px;font-size:19px}
h3{margin:18px 0 10px;font-size:15px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.right{justify-content:flex-end}
.between{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
.btn.secondary{background:#fff;color:var(--primary);border:1px solid var(--border);box-shadow:none}
.btn.danger{background:linear-gradient(135deg,#ff4f7b,#ff7a9e)}
.btn.green{background:linear-gradient(135deg,#25bd87,#62dbaa)}
.btn.blue{background:linear-gradient(135deg,#5b99ff,#8bb7ff)}
.btn.mini{padding:7px 10px;border-radius:999px;font-size:13px}
.status{
  padding:8px 12px;
  border-radius:999px;
  background:#fff;
  border:1px solid var(--border);
  color:var(--muted);
  font-size:13px;
  white-space:pre-wrap;
}
.status.ok{background:#dffcf0;color:#047857;border-color:#b7f0d6}
.status.err{background:#ffe5eb;color:#be123c;border-color:#ffc0cf}
.status.loading{background:#fff3c4;color:#92400e;border-color:#ffe08a}
.muted{color:var(--muted);font-size:13px}
.tip{font-size:12px;color:var(--muted);line-height:1.5;margin-top:5px}
.card{
  border:1px solid var(--border);
  border-radius:22px;
  padding:14px;
  background:rgba(255,255,255,.72);
  margin-bottom:14px;
}
.soft{background:var(--soft)}
.list{display:grid;gap:10px}
.compact{
  border:1px solid var(--border);
  border-radius:22px;
  padding:13px;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:12px;
  align-items:center;
  background:#fff;
}
.pill{
  display:inline-flex;
  padding:3px 8px;
  border-radius:999px;
  font-size:12px;
  background:#fff0f8;
  border:1px solid var(--border);
  margin:4px 4px 0 0;
}
.pill.green{background:#dffcf0;color:#047857;border-color:#b7f0d6}
.pill.blue{background:#e6f0ff;color:#1d4ed8;border-color:#caddff}
.pill.pink{background:#fce7f3;color:#be185d;border-color:#fac6df}
.list-box{
  border:1px solid var(--border);
  border-radius:18px;
  padding:10px;
  background:var(--soft);
}
.list-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto auto;
  gap:8px;
  margin-bottom:8px;
}
.list-toolbar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:8px}
.arrow{font-size:12px;color:var(--muted);text-align:center;margin:-2px 0 6px}
.modal-mask{
  position:fixed;
  inset:0;
  z-index:99;
  display:none;
  align-items:center;
  justify-content:center;
  padding:18px;
  background:rgba(80,30,58,.38);
  backdrop-filter:blur(10px);
}
.modal-mask.show{display:flex}
.modal{
  width:min(1100px,100%);
  max-height:92vh;
  overflow:auto;
  background:#fff8fc;
  border:1px solid var(--border);
  border-radius:26px;
  padding:17px;
  box-shadow:0 20px 80px rgba(120,30,78,.28);
}
#testImages{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:10px}
#testImages img{width:100%;border-radius:18px;border:1px solid var(--border);background:#fff}
pre{white-space:pre-wrap;word-break:break-all}
.login-mask{
  min-height:100vh;
  display:grid;
  place-items:center;
  padding:22px;
  position:relative;
  z-index:2;
}
.login-card{
  width:min(480px,100%);
  background:rgba(255,255,255,.88);
  border:1px solid var(--border);
  border-radius:30px;
  padding:26px;
  box-shadow:var(--shadow);
  text-align:center;
  backdrop-filter:blur(14px);
}
.login-cat{
  width:88px;
  height:88px;
  margin:0 auto 10px;
  display:grid;
  place-items:center;
  font-size:52px;
  border-radius:50%;
  background:linear-gradient(135deg,#fff,#ffe1f2);
  border:1px solid var(--border);
  box-shadow:0 12px 30px rgba(255,105,180,.22);
}
.login-card h2{font-size:24px;margin-bottom:8px}
.login-card p{color:var(--muted);font-size:13px;line-height:1.6}
.hidden{display:none!important}
.filter-panel{
  border:1px solid var(--border);
  border-radius:16px;
  padding:10px;
  background:#fff;
  margin:10px 0;
}
.model-panel{
  border:1px solid var(--border);
  border-radius:18px;
  padding:12px;
  background:#fff;
  margin-top:10px;
}
.model-panel.collapsed .model-panel-body{
  display:none;
}
.model-panel-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
.model-panel-title{
  font-weight:800;
}
.model-items{
  max-height:320px;
  overflow:auto;
  padding-right:4px;
  margin-top:10px;
}
.model-item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:8px 10px;
  border:1px solid var(--border);
  border-radius:14px;
  background:var(--soft);
  margin-bottom:8px;
}
.model-item-name{
  word-break:break-all;
  font-size:13px;
}
.model-item-actions{
  display:flex;
  gap:8px;
  flex-shrink:0;
}
.model-empty{
  color:var(--muted);
  font-size:13px;
  padding:10px 0;
}
.model-meta{
  color:var(--muted);
  font-size:12px;
}
.priority-item{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto auto;
  gap:8px;
  align-items:center;
  padding:8px 10px;
  border:1px solid var(--border);
  border-radius:14px;
  background:#fff;
  margin-bottom:8px;
}
.priority-name{
  word-break:break-all;
  font-size:13px;
}
@media(max-width:860px){
  header{align-items:flex-start;flex-direction:column}
  header>.row{width:100%;justify-content:space-between}
  main{grid-template-columns:1fr;padding:12px}

  nav{
    position:static;
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px;
    overflow:visible;
    border-radius:20px;
  }

  nav button{
    width:100%;
    min-width:0;
    text-align:center;
    white-space:normal;
    line-height:1.25;
    padding:10px 8px;
  }

  .grid,.grid3{grid-template-columns:1fr}
  .compact{grid-template-columns:1fr}
  .list-row{grid-template-columns:minmax(0,1fr) auto}
  .list-row .move-btn{display:none}
  .priority-item{grid-template-columns:minmax(0,1fr) auto auto auto}
  section{padding:14px;border-radius:20px}
}

@media(min-width:521px) and (max-width:860px){
  nav{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}

@media(min-width:861px) and (max-width:1120px){
  main{
    grid-template-columns:1fr;
  }

  nav{
    position:static;
    display:grid;
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:8px;
    overflow:visible;
    border-radius:22px;
  }

  nav button{
    width:100%;
    min-width:0;
    text-align:center;
    white-space:normal;
  }

  .grid3{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(min-width:861px) and (max-width:1120px){
  .grid3{grid-template-columns:repeat(2,minmax(0,1fr))}
}

#testOutput{
  max-width:100%;
  overflow:auto;
  white-space:pre-wrap;
  word-break:break-word;
  overflow-wrap:anywhere;
}

#testImages{
  max-width:100%;
  overflow:auto;
}

#testImages img{
  max-width:100%;
  height:auto;
}

.monitor-table-wrap{
  width:100%;
  max-width:100%;
  overflow:auto;
  border:1px solid var(--border);
  border-radius:18px;
  background:#fff;
  -webkit-overflow-scrolling:touch;
}

.monitor-table{
  width:100%;
  min-width:980px;
  border-collapse:collapse;
  table-layout:fixed;
}

.monitor-table th,
.monitor-table td{
  padding:10px;
  border-bottom:1px solid var(--border);
  text-align:left;
  vertical-align:middle;
  font-size:13px;
  word-break:break-word;
  overflow-wrap:anywhere;
}

.monitor-table th:nth-child(1),
.monitor-table td:nth-child(1){width:150px}

.monitor-table th:nth-child(2),
.monitor-table td:nth-child(2){width:70px}

.monitor-table th:nth-child(3),
.monitor-table td:nth-child(3){width:90px}

.monitor-table th:nth-child(4),
.monitor-table td:nth-child(4){width:180px}

.monitor-table th:nth-child(5),
.monitor-table td:nth-child(5){width:75px}

.monitor-table th:nth-child(6),
.monitor-table td:nth-child(6){width:75px}

.monitor-table th:nth-child(7),
.monitor-table td:nth-child(7){width:180px}

.monitor-table th:nth-child(8),
.monitor-table td:nth-child(8){width:220px}

.monitor-table th:nth-child(9),
.monitor-table td:nth-child(9){width:120px}

.monitor-table th:nth-child(10),
.monitor-table td:nth-child(10){width:80px}

.monitor-preview{
  width:64px;
  height:64px;
  object-fit:cover;
  border-radius:12px;
  border:1px solid var(--border);
  background:#fff;
  cursor:pointer;
}

.monitor-error{
  max-width:100%;
  white-space:pre-wrap;
  word-break:break-word;
  overflow-wrap:anywhere;
  color:#be123c;
}

.monitor-prompt{
  max-width:100%;
  white-space:pre-wrap;
  word-break:break-word;
  overflow-wrap:anywhere;
}

.monitor-table .row{
  flex-wrap:nowrap;
  overflow:auto;
}

/* 手机端：表格改成卡片，不再横向撑开 */
@media(max-width:860px){
  .monitor-table-wrap{
    border:0;
    background:transparent;
    overflow:visible;
  }

  .monitor-table{
    min-width:0;
    width:100%;
    display:block;
  }

  .monitor-table thead{
    display:none;
  }

  .monitor-table tbody{
    display:block;
    width:100%;
  }

  .monitor-table tr{
    display:block;
    width:100%;
    margin-bottom:12px;
    padding:12px;
    border:1px solid var(--border);
    border-radius:18px;
    background:#fff;
    box-shadow:0 8px 18px rgba(255,105,180,.10);
  }

  .monitor-table td{
    display:grid;
    grid-template-columns:82px minmax(0,1fr);
    gap:8px;
    width:100%!important;
    padding:8px 0;
    border-bottom:1px dashed var(--border);
    font-size:13px;
  }

  .monitor-table td:last-child{
    border-bottom:0;
  }

  .monitor-table td::before{
    font-weight:800;
    color:var(--muted);
    font-size:12px;
  }

  .monitor-table td:nth-child(1)::before{content:"时间"}
  .monitor-table td:nth-child(2)::before{content:"类型"}
  .monitor-table td:nth-child(3)::before{content:"来源"}
  .monitor-table td:nth-child(4)::before{content:"模型"}
  .monitor-table td:nth-child(5)::before{content:"耗时"}
  .monitor-table td:nth-child(6)::before{content:"状态"}
  .monitor-table td:nth-child(7)::before{content:"输入"}
  .monitor-table td:nth-child(8)::before{content:"输出/错误"}
  .monitor-table td:nth-child(9)::before{content:"预览"}
  .monitor-table td:nth-child(10)::before{content:"操作"}

  .monitor-preview{
    width:72px;
    height:72px;
  }

  .monitor-prompt,
  .monitor-error{
    max-width:100%;
    font-size:12px;
  }

  .monitor-table .row{
    gap:6px;
    flex-wrap:wrap;
  }
}

/* AI Cat monitor scheme A mobile override */
.monitor-table-wrap{
  width:100%;
  max-width:100%;
  overflow:auto;
  border:1px solid var(--border);
  border-radius:18px;
  background:#fff;
  -webkit-overflow-scrolling:touch;
}

.monitor-table{
  width:100%;
  min-width:980px;
  border-collapse:collapse;
  table-layout:fixed;
}

.monitor-table th,
.monitor-table td{
  padding:10px;
  border-bottom:1px solid var(--border);
  text-align:left;
  vertical-align:middle;
  font-size:13px;
  word-break:break-word;
  overflow-wrap:anywhere;
}

.monitor-preview{
  width:64px;
  height:64px;
  object-fit:cover;
  border-radius:12px;
  border:1px solid var(--border);
  background:#fff;
  cursor:pointer;
}

.monitor-error,
.monitor-prompt{
  max-width:100%;
  white-space:pre-wrap;
  word-break:break-word;
  overflow-wrap:anywhere;
}

.monitor-error{color:#be123c}

.monitor-table .row{
  flex-wrap:nowrap;
  overflow:auto;
}

@media(max-width:860px){
  .monitor-table-wrap{
    border:0;
    background:transparent;
    overflow:visible;
  }

  .monitor-table{
    min-width:0;
    width:100%;
    display:block;
  }

  .monitor-table thead{
    display:none;
  }

  .monitor-table tbody{
    display:block;
    width:100%;
  }

  .monitor-table tr{
    display:block;
    width:100%;
    margin-bottom:12px;
    padding:12px;
    border:1px solid var(--border);
    border-radius:18px;
    background:#fff;
    box-shadow:0 8px 18px rgba(255,105,180,.10);
  }

  .monitor-table td{
    display:grid;
    grid-template-columns:82px minmax(0,1fr);
    gap:8px;
    width:100%!important;
    padding:8px 0;
    border-bottom:1px dashed var(--border);
    font-size:13px;
  }

  .monitor-table td:last-child{
    border-bottom:0;
  }

  .monitor-table td::before{
    font-weight:800;
    color:var(--muted);
    font-size:12px;
  }

  .monitor-table td:nth-child(1)::before{content:"时间"}
  .monitor-table td:nth-child(2)::before{content:"类型"}
  .monitor-table td:nth-child(3)::before{content:"来源"}
  .monitor-table td:nth-child(4)::before{content:"模型"}
  .monitor-table td:nth-child(5)::before{content:"耗时"}
  .monitor-table td:nth-child(6)::before{content:"状态"}
  .monitor-table td:nth-child(7)::before{content:"输入"}
  .monitor-table td:nth-child(8)::before{content:"输出/错误"}
  .monitor-table td:nth-child(9)::before{content:"预览"}
  .monitor-table td:nth-child(10)::before{content:"操作"}

  .monitor-prompt,
  .monitor-error{
    font-size:12px;
  }

  .monitor-table .row{
    gap:6px;
    flex-wrap:wrap;
  }
}


/* monitor pagination buttons mobile */
@media(max-width:860px){
  #monitor .row button{
    flex:1 1 auto;
  }

  #monitorStatus{
    width:100%;
    border-radius:16px;
  }
}
</style>
</head>
<body>
<div id="loginView" class="login-mask hidden">
  <div class="login-card">
    <div class="login-cat">🐱</div>
    <h2>AI Cat Web管理</h2>
    <p>欢迎回来喵～请输入 Web Token 登录。也可以通过 <b>?token=你的Token</b> 链接直接进入。</p>
    <input id="loginToken" placeholder="请输入 webToken">
    <div style="height:12px"></div>
    <button class="btn" id="loginBtn">登录喵</button>
    <div style="height:8px"></div>
    <button class="btn secondary" id="clearTokenBtn">清除本机Token</button>
    <p id="loginStatus" class="muted"></p>
  </div>
</div>

<div id="appView" class="hidden">
<header>
  <h1>🐱 AI Cat Web管理</h1>
  <div class="row"><span id="topStatus" class="status">未连接</span><button class="btn secondary" id="logoutBtn">退出</button><button class="btn secondary" id="reloadBtn">刷新</button><button class="btn" id="saveBtn">保存</button></div>
</header>
<main>
<nav>
  <button class="active" data-tab="home">🏠 主页</button>
  <button data-tab="basic">⚙️ 基础设置</button>
  <button data-tab="image">🎨 生图设置</button>
  <button data-tab="selfie">🖼️ 形象设置</button>
  <button data-tab="audit">🛡️ 生图审核</button>
  <button data-tab="channels">🧩 渠道管理</button>
  <button data-tab="test">🧪 渠道测试</button>
  <button data-tab="monitor">📊 模型监控</button>
  <button data-tab="advanced">🧬 高级JSON</button>
</nav>
<div>
<section id="home" class="active">
  <h2>主页</h2>
  <div class="grid3">
    <div class="card"><h3>🤖 对话渠道</h3><div id="statChat" style="font-size:30px;font-weight:900">0</div><p class="muted">已配置对话渠道</p></div>
    <div class="card"><h3>🎨 生图渠道</h3><div id="statImage" style="font-size:30px;font-weight:900">0</div><p class="muted">已配置生图渠道</p></div>
    <div class="card"><h3>🌐 Web服务</h3><div id="statWeb" style="font-size:30px;font-weight:900">开启</div><p class="muted" id="statWebText">当前面板已连接</p></div>
  </div>
  <div class="card">
    <h3>快捷说明</h3>
    <p class="muted">这里可以管理基础设置、生图设置、AI 形象设置、渠道、模型缓存、启用模型和优先级。优先级列表支持直接上下调整顺序。</p>
  </div>
</section>

<section id="basic">
  <h2>基础设置</h2>
  <div class="grid">
    <div><label>指令前缀</label><input id="prefix"></div>
    <div><label>机器人名称</label><input id="botName"></div>
    <div><label>上下文轮数</label><input id="maxContextTurns" type="number" min="1"></div>
    <div><label>确认消息</label><input id="confirmMessage"></div>
    <div><label>随机对话(%)</label><input id="randomReplyChancePercent" type="number" min="0" max="100" step="1"><div class="tip">每条普通群消息有多少概率触发 AI 对话。默认 5，填 0 关闭。</div></div>
    <div><label>随机活跃捕捉条数</label><input id="randomActiveMessageCount" type="number" min="1" max="500" step="1"><div class="tip">群里有人发言时缓存最近多少条，用于随机活跃。默认 50。</div></div>
    <div><label>随机活跃间隔(分钟)</label><input id="randomActiveIntervalMinutes" type="number" min="0" max="10080" step="1"><div class="tip">达到间隔后，如果群里有人发言，会从缓存消息中抽一条并结合上下文回复。填 0 关闭随机活跃。</div></div>
    <div><label>随机聊天屏蔽QQ</label><input id="randomIgnoreQQsText"><div class="tip">多个 QQ 用逗号、空格或换行分隔。这些 QQ 的消息不会参与随机回复 / 随机活跃。</div></div>
    <div><label>Web端口</label><input id="webPort" type="number" min="1" max="65535"></div>
    <div><label>Web Token</label><input id="webToken"></div>
  </div>
  <h3>开关</h3>
  <div class="grid">
    <label><input id="enableReply" type="checkbox">启用AI对话回复</label>
    <label><input id="sendConfirmMessage" type="checkbox">发送确认消息</label>
    <label><input id="allowAtTrigger" type="checkbox">艾特触发</label>
    <label><input id="allowPublicPacket" type="checkbox">公开取指令</label>
    <label><input id="safetyFilter" type="checkbox">安全过滤</label>
    <label><input id="autoSwitchModel" type="checkbox">自动切换模型</label>
    <label><input id="debug" type="checkbox">调试日志</label>
    <label><input id="webEnable" type="checkbox">启用Web面板</label>
  </div>
  <h3>核心主人QQ</h3><div id="ownerQQsList" class="list-box"></div>
  <h3>白名单QQ</h3><div id="whitelistQQsList" class="list-box"></div>
  <h3>禁用AI群列表</h3><div id="disabledGroupsList" class="list-box"></div>
  <h3>AI个性</h3><textarea id="personality"></textarea>
</section>

<section id="image">
  <h2>生图设置</h2>
  <div class="grid">
    <div><label>默认宽高比</label><select id="imageDefaultAspectRatio"><option>自动</option><option>1:1</option><option>2:3</option><option>3:2</option><option>3:4</option><option>4:3</option><option>4:5</option><option>5:4</option><option>9:16</option><option>16:9</option><option>21:9</option></select></div>
    <div><label>默认分辨率</label><select id="imageDefaultResolution"><option>1K</option><option>2K</option><option>4K</option></select></div>
    <div><label>全局生图超时(s)</label><input id="imageGlobalTimeoutSeconds" type="number" min="10" max="900" step="1"><div class="tip">正式生图与 Web 生图测试统一使用此超时。默认 180 秒。</div></div>
    <div><label>最大生图并发</label><input id="imageMaxConcurrentTasks" type="number" min="1"></div>
    <div><label>限频秒数</label><input id="imageRateLimitSeconds" type="number" min="0"></div>
    <div><label>每日额度</label><input id="imageDailyLimitCount" type="number" min="1"></div>
    <div><label>参考图最大MB</label><input id="imageMaxImageSizeMB" type="number" min="1"></div>
    <div><label>缓存上限</label><input id="imageMaxCacheCount" type="number" min="1"></div>
  </div>
  <h3>开关</h3>
  <div class="grid">
    <label><input id="imageEnableLLMTool" type="checkbox">启用AI自动生图工具</label>
    <label><input id="imageShowGenerationInfo" type="checkbox">显示生图信息</label>
    <label><input id="imageShowModelInfo" type="checkbox">显示模型信息</label>
    <label><input id="imageEnableDailyLimit" type="checkbox">启用每日额度</label>
  </div>
  <h3>生图黑名单</h3><div id="imageUmoBlacklistList" class="list-box"></div>
  <h3>黑名单提示</h3><input id="imageBlacklistBlockMessage">
</section>

<section id="selfie">
  <h2>形象设置</h2>
  <div class="card soft">
    <p class="muted">这里可以管理 AI 形象参考图与自拍人设。你也可以直接在聊天里使用：</p>
    <pre>/自拍 提示词
/形象查看
/形象设置
/形象清除</pre>
  </div>
  <div class="grid">
    <div><label>机器人名称</label><input id="selfieBotName"></div>
    <div><label>默认自拍比例</label><select id="selfieAspect"><option>自动</option><option>1:1</option><option>2:3</option><option>3:2</option><option>3:4</option><option>4:3</option><option>4:5</option><option>5:4</option><option>9:16</option><option>16:9</option><option>21:9</option></select></div>
  </div>
  <h3>自拍人设</h3>
  <textarea id="selfiePersonality"></textarea>
</section>

<section id="audit">
  <h2>生图审核 / 识图</h2>
  <div class="grid">
    <label><input id="imageEnablePromptAudit" type="checkbox">启用提示词审核</label>
    <label><input id="imageEnableOutputAudit" type="checkbox">启用出图审核</label>
    <div><label>提示词审核模型</label><select id="imagePromptAuditModel"></select></div>
    <div><label>出图审核模型</label><select id="imageOutputAuditModel"></select></div>
    <div>
      <label>OCR识图模型</label>
      <select id="ocrModel"></select>
      <div class="tip">用于引用图片/图文消息时识图。留空则自动使用第一个可用会话模型；识图失败会回退普通 AI 对话。</div>
    </div>
  </div>
  <h3>审核白名单</h3><div id="imageAuditWhitelistList" class="list-box"></div>
  <h3>提示词屏蔽词</h3><div id="imagePromptBlockedWordsList" class="list-box"></div>
  <h3>提示词审核模板</h3><textarea id="imagePromptAuditTemplate"></textarea>
  <h3>出图审核模板</h3><textarea id="imageOutputAuditTemplate"></textarea>
</section>

<section id="channels">
  <div class="card">
    <div class="between"><h2>🤖 对话渠道</h2><button class="btn" id="addChatBtn">添加对话渠道</button></div>
    <div id="chatList" class="list"></div>
    <h3>对话模型优先级</h3>
    <div class="grid3">
      <div><label>选择已启用模型</label><select id="chatPriorityPicker"></select></div>
      <div><label>操作</label><button class="btn green" id="addChatPriority">加入</button></div>
      <div><label>操作</label><button class="btn secondary" id="clearChatPriority">清空</button></div>
    </div>
    <div id="chatPriorityList" class="list-box" style="margin-top:10px"></div>
  </div>
  <div class="card">
    <div class="between"><h2>🎨 生图渠道</h2><button class="btn" id="addImageBtn">添加生图渠道</button></div>
    <div id="imageList" class="list"></div>
    <h3>生图模型优先级</h3>
    <div class="grid3">
      <div><label>选择已启用模型</label><select id="imagePriorityPicker"></select></div>
      <div><label>操作</label><button class="btn green" id="addImagePriority">加入</button></div>
      <div><label>操作</label><button class="btn secondary" id="clearImagePriority">清空</button></div>
    </div>
    <div id="imagePriorityList" class="list-box" style="margin-top:10px"></div>
  </div>
</section>

<section id="test">
  <h2>渠道测试</h2>

  <div class="card">
    <h3>对话测试</h3>
    <div class="grid">
      <div>
        <label>对话模型</label>
        <select id="testChatModel"></select>
      </div>
      <div>
        <label>操作</label>
        <button class="btn green" id="testChatBtn">测试对话</button>
      </div>
    </div>
    <textarea id="testChatPrompt">你好，请用一句话介绍你自己。</textarea>
  </div>

  <div class="card">
    <h3>生图测试</h3>
    <p class="muted">生图测试与群聊正式生图共用「全局生图超时」。</p>

    <div class="grid">
      <div>
        <label>生图模型</label>
        <select id="testImageModel"></select>
      </div>

      <div>
        <label>宽高比</label>
        <select id="testImageAspect">
          <option>自动</option>
          <option>1:1</option>
          <option>2:3</option>
          <option>3:2</option>
          <option>3:4</option>
          <option>4:3</option>
          <option>4:5</option>
          <option>5:4</option>
          <option>9:16</option>
          <option>16:9</option>
          <option>21:9</option>
        </select>
      </div>

      <div>
        <label>分辨率</label>
        <select id="testImageResolution">
          <option>1K</option>
          <option>2K</option>
          <option>4K</option>
        </select>
      </div>

      <div>
        <label>操作</label>
        <button class="btn green" id="testImageBtn">测试生图</button>
      </div>
    </div>

        <textarea id="testImagePrompt">一只可爱的白色猫咪，坐在樱花树下，柔和光线，精致插画风格</textarea>
    
    <div class="card soft" style="margin-top:10px">
      <h3>图生图参考图</h3>
      <p class="muted">可选。上传后会作为图生图 / 参考图传给当前生图模型。</p>
    
      <label style="margin-bottom:10px">
        <input id="testImageUseSelfie" type="checkbox">
        使用 AI 自拍形象参考图
      </label>
    
      <div class="row">
        <input id="testImageReferenceFiles" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple>
        <button class="btn secondary" id="clearTestImageReferences" type="button">取消选择图片</button>
      </div>
    
      <div class="tip">
        支持 PNG / JPG / WEBP / GIF，可多选。若勾选自拍形象图，会自动读取“形象设置”中的参考图并作为第一张参考图。
      </div>
    
      <div id="testImageReferencePreview" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:10px"></div>
    </div>
  </div>

  <div class="card">
    <div id="testStatus" class="status">等待测试</div>
  
  <div class="row" style="margin-top:10px">
    <button class="btn secondary" id="showTestRequestBtn" type="button">查看请求数据</button>
    <button class="btn secondary" id="showTestResponseBtn" type="button">查看响应数据</button>
    <button class="btn secondary" id="showTestResultBtn" type="button">查看测试结果</button>
    <button class="btn secondary" id="clearTestDebugBtn" type="button">清空调试数据</button>
  </div>
  
    <pre id="testOutput" class="list-box" style="margin-top:10px;min-height:120px"></pre>
    <div id="testImages"></div>
  </div>
</section>

<section id="monitor">
  <h2>模型监控</h2>

  <div class="card">
    <div class="grid3">
      <div>
        <label>类型</label>
        <select id="monitorType">
          <option value="">全部</option>
          <option value="chat">会话记录</option>
          <option value="image">生图记录</option>
        </select>
      </div>

      <div>
        <label>状态</label>
        <select id="monitorSuccess">
          <option value="">全部</option>
          <option value="true">成功</option>
          <option value="false">失败</option>
        </select>
      </div>

      <div>
        <label>模型筛选</label>
        <input id="monitorModel" placeholder="输入模型关键字">
      </div>
    </div>

    <div class="row" style="margin-top:10px">
      <button class="btn green" id="monitorRefreshBtn">刷新</button>
      <button class="btn secondary" id="monitorPrevBtn">上一页</button>
      <button class="btn secondary" id="monitorNextBtn">下一页</button>
      <button class="btn danger" id="monitorDeletePageBtn">删除本页</button>
      <button class="btn secondary" id="monitorClearBtn">清空当前类型</button>
      <span id="monitorStatus" class="status">等待刷新</span>
    </div>
  </div>

  <div class="monitor-table-wrap">
    <table class="monitor-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>类型</th>
          <th>来源</th>
          <th>模型</th>
          <th>耗时</th>
          <th>状态</th>
          <th>输入</th>
          <th>输出/错误</th>
          <th>预览</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody id="monitorRows"></tbody>
    </table>
  </div>
</section>

<section id="advanced">
  <h2>高级JSON</h2>
  <p class="muted">只要 JSON 语法正确，就会按内容保存全部配置字段。</p>
  <textarea id="fullConfig" style="min-height:560px"></textarea>
  <div class="row"><button class="btn" id="saveJsonBtn">保存高级JSON</button><button class="btn secondary" id="formatJsonBtn">格式化</button></div>
</section>
</div>
</main>
</div>

<div id="channelModal" class="modal-mask"><div class="modal">
  <div class="between"><h2 id="modalTitle">编辑渠道</h2><button class="btn secondary" id="closeModal">关闭</button></div>
  <div id="modalStatus" class="status" style="display:none;margin-bottom:10px"></div>
  <div id="modalBody"></div>
  <div class="row right"><button class="btn secondary" id="cancelModal">取消</button><button class="btn" id="saveModal">保存渠道</button></div>
</div></div>
<script src="/admin.js"></script>
</body>
</html>`;
}

export function getAdminClientJs (): string {
  return String.raw`(() => {
let CONFIG = {};
let editing = null;
let TOKEN = new URLSearchParams(location.search).get('token') || localStorage.getItem('aicat_token') || '';

/**
 * 仅保存在当前浏览器页面内存。
 * 刷新页面即清空。
 * 不上传、不写入 model_monitor.json。
 */
let LAST_TEST_REQUEST_DATA = null;
let LAST_TEST_RESPONSE_DATA = null;

/**
 * 当前页面内存中的上一次测试结果。
 * 用于查看请求/响应数据后，一键回到测试结果。
 */
let LAST_TEST_RESULT_VIEW = null;

const $ = id => document.getElementById(id);
const clone = v => JSON.parse(JSON.stringify(v ?? null));
const clear = n => { while (n && n.firstChild) n.removeChild(n.firstChild); };
let MONITOR_OFFSET = 0;
const MONITOR_LIMIT = 30;
let MONITOR_TOTAL = 0;
let MONITOR_CURRENT_IDS = [];

function formatTimeText(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || '';
  }
}

function shortText(text, max = 120) {
  const raw = String(text || '');
  return raw.length > max ? raw.slice(0, max) + '...' : raw;
}

function createMonitorPreview(record) {
  const wrap = document.createElement('div');

  if (record.type !== 'image') {
    wrap.textContent = '-';
    return wrap;
  }

  const inputCount = Number(record.input_preview_count || 0);
  const outputCount = Number(record.output_preview_count || 0);

  if (!inputCount && !outputCount) {
    wrap.textContent = '-';
    return wrap;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn mini secondary';
  btn.textContent = '详情查看';
  btn.onclick = () => openMonitorDetail(record.id);

  const info = document.createElement('div');
  info.className = 'model-meta';
  info.textContent = '输入' + inputCount + ' / 输出' + outputCount;

  wrap.append(btn, info);
  return wrap;
}

function ensureMonitorDetailModal() {
  let mask = $('monitorDetailMask');

  if (mask) return mask;

  mask = document.createElement('div');
  mask.id = 'monitorDetailMask';
  mask.className = 'modal-mask';

  mask.innerHTML = [
    '<div class="modal">',
    '  <div class="between">',
    '    <h2>模型记录详情</h2>',
    '    <button class="btn secondary" id="monitorDetailClose" type="button">关闭</button>',
    '  </div>',
    '  <div id="monitorDetailBody"></div>',
    '</div>',
  ].join('');

  document.body.appendChild(mask);

  $('monitorDetailClose').onclick = () => {
    mask.classList.remove('show');
  };

  mask.addEventListener('click', e => {
    if (e.target === mask) mask.classList.remove('show');
  });

  return mask;
}

function createDetailImageGrid(title, list) {
  const wrap = document.createElement('div');
  wrap.className = 'card soft';

  const h = document.createElement('h3');
  h.textContent = title;

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(120px,1fr))';
  grid.style.gap = '10px';

  const arr = Array.isArray(list) ? list : [];

  if (!arr.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '无图片';
    wrap.append(h, empty);
    return wrap;
  }

  arr.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.style.width = '100%';
    img.style.borderRadius = '14px';
    img.style.border = '1px solid var(--border)';
    img.style.background = '#fff';
    img.style.cursor = 'pointer';

    img.onclick = () => {
      const w = window.open('');
      if (w) {
        w.document.write('<img src="' + src + '" style="max-width:100%;height:auto">');
      }
    };

    grid.appendChild(img);
  });

  wrap.append(h, grid);
  return wrap;
}

async function openMonitorDetail(id) {
  const mask = ensureMonitorDetailModal();
  const body = $('monitorDetailBody');

  body.innerHTML = '<div class="status loading">加载详情中...</div>';
  mask.classList.add('show');

  try {
    const res = await api('/api/monitor-records/detail?id=' + encodeURIComponent(id));
    const record = res.data || {};

    body.innerHTML = '';

    const info = document.createElement('div');
    info.className = 'card';

    const modelText = record.type === 'chat'
      ? record.model
      : (record.used_model || record.requested_model || '');

    const outputText = record.success
      ? record.type === 'chat'
        ? (record.response || '')
        : '图片生成成功'
      : mobileSafeError(shortText(record.error || '失败', 500));

    info.innerHTML = [
      '<h3>基本信息</h3>',
      '<p><b>时间：</b>' + escapeHtml(formatTimeText(record.created_at)) + '</p>',
      '<p><b>类型：</b>' + escapeHtml(record.type === 'chat' ? '会话' : '生图') + '</p>',
      '<p><b>来源：</b>' + escapeHtml(record.source || '') + '</p>',
      '<p><b>模型：</b>' + escapeHtml(modelText || '-') + '</p>',
      '<p><b>耗时：</b>' + escapeHtml(String(record.elapsed_seconds || 0)) + ' s</p>',
      '<p><b>状态：</b>' + (record.success ? '成功' : '失败') + '</p>',
      record.aspect_ratio ? '<p><b>比例：</b>' + escapeHtml(record.aspect_ratio) + '</p>' : '',
      record.resolution ? '<p><b>分辨率：</b>' + escapeHtml(record.resolution) + '</p>' : '',
      '<h3>输入</h3>',
      '<pre class="list-box">' + escapeHtml(record.prompt || '') + '</pre>',
      '<h3>输出 / 错误</h3>',
      '<pre class="list-box">' + escapeHtml(outputText || '') + '</pre>',
    ].filter(Boolean).join('');

    body.appendChild(info);

    if (record.type === 'image') {
      body.appendChild(createDetailImageGrid('输入图预览', record.input_previews || []));
      body.appendChild(createDetailImageGrid('输出图预览', record.output_previews || []));
    }
  } catch (e) {
    body.innerHTML = '<div class="status err">' + escapeHtml(e.message || String(e)) + '</div>';
  }
}

async function loadMonitorRecords() {
  const tbody = $('monitorRows');
  const status = $('monitorStatus');
  if (!tbody || !status) return;

  status.textContent = '加载中...';
  status.className = 'status loading';

  const type = $('monitorType').value;
  const success = $('monitorSuccess').value;
  const model = $('monitorModel').value.trim();

  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  if (success) qs.set('success', success);
  if (model) qs.set('model', model);
  qs.set('limit', String(MONITOR_LIMIT));
  qs.set('offset', String(MONITOR_OFFSET));

  try {
    const res = await api('/api/monitor-records?' + qs.toString());
    const rows = res.data || [];

    MONITOR_TOTAL = Number(res.total || 0);
    MONITOR_CURRENT_IDS = rows.map(r => r.id).filter(Boolean);

    tbody.innerHTML = '';

    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="10" class="muted">暂无记录</td>';
      tbody.appendChild(tr);
    }

    rows.forEach(record => {
      const tr = document.createElement('tr');

      const modelText = record.type === 'chat'
        ? record.model
        : (record.used_model || record.requested_model || '');

      const outputText = record.success
        ? record.type === 'chat'
          ? shortText(record.response || '', 160)
          : '图片生成成功'
        : mobileSafeError(shortText(record.error || '失败', 500));

      tr.innerHTML = [
        '<td>' + escapeHtml(formatTimeText(record.created_at)) + '</td>',
        '<td>' + (record.type === 'chat' ? '会话' : '生图') + '</td>',
        '<td><span class="pill blue">' + escapeHtml(record.source || '') + '</span></td>',
        '<td>' + escapeHtml(modelText || '-') + '</td>',
        '<td>' + escapeHtml(String(record.elapsed_seconds || 0)) + ' s</td>',
        '<td>' + (record.success ? '<span class="pill green">成功</span>' : '<span class="pill pink">失败</span>') + '</td>',
        '<td><div class="monitor-prompt">' + escapeHtml(shortText(record.prompt || '', 180)) + '</div></td>',
        '<td><div class="' + (record.success ? 'monitor-prompt' : 'monitor-error') + '">' + escapeHtml(outputText) + '</div></td>',
        '<td class="preview-cell"></td>',
        '<td><div class="row"><button class="btn mini secondary detail-monitor">详情</button><button class="btn mini danger delete-monitor">删除</button></div></td>',
      ].join('');

      tr.querySelector('.preview-cell').appendChild(createMonitorPreview(record));

      tr.querySelector('.detail-monitor').onclick = () => {
        openMonitorDetail(record.id);
      };

      tr.querySelector('.delete-monitor').onclick = async () => {
        if (!confirm('确认删除这条记录？')) return;

        await api('/api/monitor-records/delete', {
          method: 'POST',
          body: JSON.stringify({ id: record.id }),
        });

        await loadMonitorRecords();
      };

      tbody.appendChild(tr);
    });

    const page = Math.floor(MONITOR_OFFSET / MONITOR_LIMIT) + 1;
    const totalPages = Math.max(1, Math.ceil(MONITOR_TOTAL / MONITOR_LIMIT));

    status.textContent =
      '共 ' + MONITOR_TOTAL +
      ' 条，第 ' + page + '/' + totalPages +
      ' 页，当前显示 ' + rows.length + ' 条';
    status.className = 'status ok';
  } catch (e) {
    status.textContent = e.message;
    status.className = 'status err';
  }
}


function monitorGoPrevPage() {
  if (MONITOR_OFFSET <= 0) return;

  MONITOR_OFFSET = Math.max(0, MONITOR_OFFSET - MONITOR_LIMIT);
  loadMonitorRecords();
}

function monitorGoNextPage() {
  if (MONITOR_OFFSET + MONITOR_LIMIT >= MONITOR_TOTAL) return;

  MONITOR_OFFSET += MONITOR_LIMIT;
  loadMonitorRecords();
}

async function deleteCurrentMonitorPage() {
  if (!MONITOR_CURRENT_IDS.length) {
    alert('当前页没有可删除的记录');
    return;
  }

  if (!confirm('确认删除当前页 ' + MONITOR_CURRENT_IDS.length + ' 条记录？')) {
    return;
  }

  const status = $('monitorStatus');

  try {
    if (status) {
      status.textContent = '正在删除当前页...';
      status.className = 'status loading';
    }

    for (const id of MONITOR_CURRENT_IDS) {
      await api('/api/monitor-records/delete', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
    }

    /**
     * 删除后如果当前页已经空了，自动往前翻一页。
     */
    if (MONITOR_OFFSET >= MONITOR_LIMIT && MONITOR_CURRENT_IDS.length >= MONITOR_LIMIT) {
      MONITOR_OFFSET = Math.max(0, MONITOR_OFFSET - MONITOR_LIMIT);
    }

    await loadMonitorRecords();
  } catch (e) {
    if (status) {
      status.textContent = e.message || String(e);
      status.className = 'status err';
    } else {
      alert(e.message || String(e));
    }
  }
}

function showLogin(msg='') {
  $('loginView').classList.remove('hidden');
  $('appView').classList.add('hidden');
  $('loginStatus').textContent = msg;
  $('loginToken').value = TOKEN || '';
}

function showApp() {
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
}

function saveToken(token) {
  TOKEN = String(token || '').trim();
  if (TOKEN) localStorage.setItem('aicat_token', TOKEN);
}

function clearToken() {
  TOKEN = '';
  localStorage.removeItem('aicat_token');
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function timeoutMsToSeconds(value) {
  return clampNumber(Math.round(Number(value || 180000) / 1000), 180, 10, 900);
}

function secondsToTimeoutMs(value) {
  return clampNumber(value, 180, 10, 900) * 1000;
}

function api(path, options = {}) {
  const headers = Object.assign({'Content-Type':'application/json','x-aicat-token':TOKEN}, options.headers || {});
  const url = path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);

  return fetch(url, Object.assign({}, options, {headers})).then(async r => {
    let d = {};

    try {
      d = await r.json();
    } catch {
      d = {};
    }

    if (r.status === 401) {
      clearToken();
      showLogin('Token 不正确或已失效喵～');

      const err = new Error(d.error || d.message || 'Token 不正确');
      err.status = r.status;
      err.payload = d;
      throw err;
    }

    if (!r.ok || d.success === false) {
      const err = new Error(d.error || d.message || '请求失败');
      err.status = r.status;
      err.payload = d;
      throw err;
    }

    return d;
  });
}

function status(text, ok) {
  const n = $('topStatus');
  n.textContent = text;
  n.className = 'status ' + (ok === true ? 'ok' : ok === false ? 'err' : ok === 'loading' ? 'loading' : '');
}

function showTab(id) {
  document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  $(id).classList.add('active');
  document.querySelector('nav button[data-tab="'+id+'"]')?.classList.add('active');

  if (id === 'monitor') {
    MONITOR_OFFSET = 0;
    loadMonitorRecords();
  }
}

function splitList(text) {
  return String(text || '').split(/[,，、\/\s\n\r\t]+/).map(s => s.trim()).filter(Boolean);
}

function uniq(list) {
  return Array.from(new Set((list || []).map(v => String(v || '').trim()).filter(Boolean)));
}

function listBox(id, values) {
  const box = $(id);
  clear(box);

  const toolbar = document.createElement('div');
  toolbar.className = 'list-toolbar';

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn mini secondary';
  add.textContent = '+ 单个';

  const bulk = document.createElement('button');
  bulk.type = 'button';
  bulk.className = 'btn mini secondary';
  bulk.textContent = '++ 批量';

  const delMany = document.createElement('button');
  delMany.type = 'button';
  delMany.className = 'btn mini secondary';
  delMany.textContent = '-- 删除';

  toolbar.append(add, bulk, delMany);
  box.appendChild(toolbar);

  const append = v => {
    const row = document.createElement('div');
    row.className = 'list-row';

    const input = document.createElement('input');
    input.value = v || '';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'btn mini secondary move-btn';
    up.textContent = '↑';

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'btn mini secondary move-btn';
    down.textContent = '↓';

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn mini danger';
    rm.textContent = '删';

    input.oninput = () => drawArrows(box);

    up.onclick = () => {
      const p = row.previousElementSibling;
      if (p && p.classList.contains('list-row')) box.insertBefore(row, p);
      drawArrows(box);
    };

    down.onclick = () => {
      const n = row.nextElementSibling;
      if (n && n.classList.contains('list-row')) box.insertBefore(n, row);
      drawArrows(box);
    };

    rm.onclick = () => {
      if (box.querySelectorAll('.list-row').length <= 1) input.value = '';
      else row.remove();
      drawArrows(box);
    };

    row.append(input, up, down, rm);
    box.appendChild(row);
  };

  add.onclick = () => { append(''); drawArrows(box); };

  bulk.onclick = () => {
    const text = prompt('批量添加，支持逗号 / 顿号 / 斜杠 / 空格 / 换行分割');
    if (text === null) return;
    splitList(text).forEach(append);
    drawArrows(box);
  };

  delMany.onclick = () => {
    const text = prompt('快速删除：留空清空全部；输入多个值可批量删除');
    if (text === null) return;

    const vals = splitList(text);

    if (!vals.length) {
      if (!confirm('确认清空？')) return;
      box.querySelectorAll('.list-row').forEach(r => r.remove());
      append('');
      drawArrows(box);
      return;
    }

    box.querySelectorAll('.list-row').forEach(r => {
      const v = r.querySelector('input')?.value.trim();
      if (vals.includes(v)) r.remove();
    });

    if (!box.querySelector('.list-row')) append('');
    drawArrows(box);
  };

  const list = Array.isArray(values) ? values.map(v => String(v || '').trim()).filter(Boolean) : [];
  (list.length ? list : ['']).forEach(append);
  drawArrows(box);
}

function drawArrows(box) {
  box.querySelectorAll('.arrow').forEach(a => a.remove());
  const rows = [...box.querySelectorAll('.list-row')].filter(r => r.querySelector('input')?.value.trim());
  rows.slice(0, -1).forEach(r => {
    const a = document.createElement('div');
    a.className = 'arrow';
    a.textContent = '↓ 失败或不可用时切换到下一个模型';
    r.after(a);
  });
}

function getListBox(id) {
  return uniq([...(($(id)||{}).querySelectorAll?.('.list-row input') || [])].map(i => i.value.trim()));
}

function getPriorityListBox(id) {
  return uniq([...(($(id)||{}).querySelectorAll?.('.priority-name') || [])].map(i => i.textContent.trim()));
}

function renderPriorityList(id, values) {
  const box = $(id);
  clear(box);

  const list = uniq(values || []);

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'model-empty';
    empty.textContent = '当前为空，可从上方选择模型加入';
    box.appendChild(empty);
    return;
  }

  const moveUp = index => {
    if (index <= 0) return;
    const next = list.slice();
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    renderPriorityList(id, next);
  };

  const moveDown = index => {
    if (index >= list.length - 1) return;
    const next = list.slice();
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    renderPriorityList(id, next);
  };

  const removeAt = index => {
    const next = list.slice();
    next.splice(index, 1);
    renderPriorityList(id, next);
  };

  list.forEach((name, index) => {
    const row = document.createElement('div');
    row.className = 'priority-item';

    const title = document.createElement('div');
    title.className = 'priority-name';
    title.textContent = name;

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'btn mini secondary';
    up.textContent = '↑';
    up.disabled = index === 0;
    up.onclick = () => moveUp(index);

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'btn mini secondary';
    down.textContent = '↓';
    down.disabled = index === list.length - 1;
    down.onclick = () => moveDown(index);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn mini danger';
    del.textContent = '删';
    del.onclick = () => removeAt(index);

    row.append(title, up, down, del);
    box.appendChild(row);
  });
}

function fillSelect(id, list, current = '', empty = '请选择') {
  const s = $(id);
  clear(s);

  const e = document.createElement('option');
  e.value = '';
  e.textContent = empty;
  s.appendChild(e);

  list.forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    s.appendChild(o);
  });

  s.value = current || '';
}

function enabledFull(type) {
  const channels = type === 'chat' ? CONFIG.chatChannels || [] : CONFIG.imageChannels || [];
  const out = [];

  channels.forEach(ch => (ch.enabled_models || []).forEach(m => {
    if (m && m.id && m.enabled !== false) out.push(ch.name + '/' + m.id);
  }));

  return uniq(out);
}

function syncSelects() {
  const chats = enabledFull('chat');
  const imgs = enabledFull('image');

  fillSelect('chatPriorityPicker', chats, '', '选择对话模型');
  fillSelect('imagePriorityPicker', imgs, '', '选择生图模型');

  fillSelect('imagePromptAuditModel', chats, CONFIG.imagePromptAuditModel || '', '自动：第一个对话模型');
  fillSelect('imageOutputAuditModel', chats, CONFIG.imageOutputAuditModel || '', '自动：第一个对话模型');
  fillSelect('ocrModel', chats, CONFIG.ocrModel || '', '自动：第一个对话模型');

  fillSelect('testChatModel', chats, '', chats.length ? '请选择对话模型' : '没有已启用对话模型');
  fillSelect('testImageModel', imgs, '', imgs.length ? '请选择生图模型' : '没有已启用生图模型');
}

function channelCard(ch, i, type) {
  const div = document.createElement('div');
  div.className = 'compact';

  const enabled = (ch.enabled_models || []).filter(m => m.enabled !== false).map(m => m.id);

  div.innerHTML =
    '<div><b>' + escapeHtml(ch.name || '未命名') + '</b>' +
    '<div class="muted">' + escapeHtml(ch.base_url || '未填写') + '</div>' +
    '<span class="pill blue">缓存 ' + ((ch.models_cache || []).length) + '</span>' +
    '<span class="pill green">启用 ' + enabled.length + '</span>' +
    (type === 'image' ? '<span class="pill pink">' + escapeHtml(ch.provider_type || 'openai') + '</span>' : '') +
    '<div class="muted inline"></div></div>';

  const actions = document.createElement('div');
  actions.className = 'row right';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn mini blue';
  edit.textContent = '编辑';

  const pull = document.createElement('button');
  pull.type = 'button';
  pull.className = 'btn mini secondary';
  pull.textContent = '拉取';

  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'btn mini danger';
  rm.textContent = '删除';

  edit.onclick = () => openModal(type, i);

  rm.onclick = () => {
    if (!confirm('确认删除渠道？')) return;
    (type === 'chat' ? CONFIG.chatChannels : CONFIG.imageChannels).splice(i, 1);
    renderChannels();
  };

  pull.onclick = async () => {
    const inline = div.querySelector('.inline');
    pull.disabled = true;
    pull.textContent = '拉取中...';
    inline.textContent = '正在拉取模型...';
  
    try {
      const res = await api(type === 'chat' ? '/api/refresh-chat-models' : '/api/refresh-image-models', {
        method: 'POST',
        body: JSON.stringify({ channel: ch }),
      });
  
      ch.models_cache = res.data || [];
      ch.models_cache_path = res.cache_path || ch.models_cache_path || '';
  
      inline.textContent = '已拉取 ' + ch.models_cache.length + ' 个模型到缓存文件，未自动启用';
      renderChannels();
    } catch (e) {
      inline.textContent = e.message;
      alert(e.message);
    } finally {
      pull.disabled = false;
      pull.textContent = '拉取';
    }
  };

  actions.append(edit, pull, rm);
  div.appendChild(actions);
  return div;
}

function renderChannels() {
  $('statChat').textContent = String((CONFIG.chatChannels || []).length);
  $('statImage').textContent = String((CONFIG.imageChannels || []).length);
  $('statWeb').textContent = CONFIG.webEnable === false ? '关闭' : '开启';
  $('statWebText').textContent = '端口：' + (CONFIG.webPort || 14514);

  const chat = $('chatList');
  clear(chat);
  (CONFIG.chatChannels || []).forEach((c, i) => chat.appendChild(channelCard(c, i, 'chat')));
  if (!(CONFIG.chatChannels || []).length) chat.innerHTML = '<p class="muted">暂无对话渠道</p>';

  const img = $('imageList');
  clear(img);
  (CONFIG.imageChannels || []).forEach((c, i) => img.appendChild(channelCard(c, i, 'image')));
  if (!(CONFIG.imageChannels || []).length) img.innerHTML = '<p class="muted">暂无生图渠道</p>';

  renderPriorityList('chatPriorityList', CONFIG.enabledChatModelPriority || []);
  renderPriorityList('imagePriorityList', CONFIG.enabledImageModelPriority || []);

  syncSelects();
  syncJson();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function mobileSafeError(text) {
  return String(text || '')
    .replace(/(https?:\/\/[^\s]+)/g, url => {
      return url.length > 120 ? url.slice(0, 120) + '...' : url;
    });
}

function renderModelPanel(options) {
  const {
    rootId,
    items,
    enabledItems,
    collapsed,
    title,
    searchValue,
    onlyEnabled,
    onToggleCollapsed,
    onSearch,
    onToggleOnlyEnabled,
    onEnable,
    onRemove,
    onTest,
    addButtonText,
    removeButtonText
  } = options;

  const root = $(rootId);
  if (!root) return;

  clear(root);

  const panel = document.createElement('div');
  panel.className = 'model-panel' + (collapsed ? ' collapsed' : '');

  const keyword = String(searchValue || '').trim().toLowerCase();

  const filtered = items.filter(name => {
    const hitSearch = !keyword || name.toLowerCase().includes(keyword);
    const hitEnabled = !onlyEnabled || enabledItems.includes(name);
    return hitSearch && hitEnabled;
  });

  panel.innerHTML =
    '<div class="model-panel-header">' +
      '<div>' +
        '<div class="model-panel-title">' + escapeHtml(title) + '</div>' +
        '<div class="model-meta">总数 ' + items.length + '，当前显示 ' + filtered.length + '</div>' +
      '</div>' +
      '<div class="row">' +
        '<button type="button" class="btn mini secondary" id="' + rootId + '_toggle">' + (collapsed ? '展开' : '折叠') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="model-panel-body">' +
      '<div class="filter-panel">' +
        '<div class="grid">' +
          '<div>' +
            '<label>搜索模型</label>' +
            '<div class="row">' +
              '<input id="' + rootId + '_search" placeholder="输入模型名关键字，回车或点击搜索" value="' + escapeHtml(searchValue || '') + '">' +
              '<button type="button" class="btn mini secondary" id="' + rootId + '_searchBtn">搜索</button>' +
              '<button type="button" class="btn mini secondary" id="' + rootId + '_clearSearchBtn">清空</button>' +
            '</div>' +
            '<div class="tip">不会边输入边搜索，避免手机输入法被打断。</div>' +
          '</div>' +
          '<div><label>筛选</label><label style="margin:10px 0 0"><input id="' + rootId + '_onlyEnabled" type="checkbox"' + (onlyEnabled ? ' checked' : '') + '>仅看已启用</label></div>' +
        '</div>' +
      '</div>' +
      '<div class="model-items" id="' + rootId + '_items"></div>' +
    '</div>';

  root.appendChild(panel);

  $(rootId + '_toggle').onclick = onToggleCollapsed;

  const searchInput = $(rootId + '_search');
  const doSearch = () => onSearch(searchInput.value || '');

  $(rootId + '_searchBtn').onclick = doSearch;

  $(rootId + '_clearSearchBtn').onclick = () => {
    searchInput.value = '';
    onSearch('');
  };

  searchInput.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  };

  /**
   * 关键修复：
   * 不再 oninput 立即 renderModelPanels。
   * 之前每输入一个字符都会重建 input，手机输入法会被打断 / 关闭。
   */

  $(rootId + '_onlyEnabled').onchange = e => onToggleOnlyEnabled(Boolean(e.target.checked));

  const list = $(rootId + '_items');

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'model-empty';
    empty.textContent = items.length ? '没有匹配的模型' : '当前没有模型';
    list.appendChild(empty);
    return;
  }

  filtered.forEach(name => {
    const row = document.createElement('div');
    row.className = 'model-item';

    const isEnabled = enabledItems.includes(name);

    row.innerHTML =
      '<div class="model-item-name">' + escapeHtml(name) + (isEnabled ? ' <span class="pill green">已启用</span>' : '') + '</div>';

    const actions = document.createElement('div');
    actions.className = 'model-item-actions';

    if (!isEnabled) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn mini green';
      add.textContent = addButtonText || '启用';
      add.onclick = () => onEnable(name);
      actions.appendChild(add);
    } else {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn mini danger';
      del.textContent = removeButtonText || '移除';
      del.onclick = () => onRemove(name);
      actions.appendChild(del);
    }

    if (typeof onTest === 'function') {
      const test = document.createElement('button');
      test.type = 'button';
      test.className = 'btn mini secondary';
      test.textContent = '测试';
      test.onclick = () => onTest(name);
      actions.appendChild(test);
    }

    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function openModal(type, index) {
  const list = type === 'chat' ? CONFIG.chatChannels : CONFIG.imageChannels;

  editing = {
    type,
    index,
    cacheCollapsed: false,
    enabledCollapsed: false,
    cacheSearch: '',
    enabledSearch: '',
    cacheOnlyEnabled: false,
    enabledOnlyEnabled: false,
  };

  /**
   * 兜底修复：
   * 如果当前前端 CONFIG 里的 models_cache 是空的，
   * 先重新拉一次 /api/config。
   * 后端会 merge 独立缓存 JSON，避免进入编辑页看不到缓存。
   */
  try {
    const current = list[index] || {};

    if (!Array.isArray(current.models_cache) || current.models_cache.length === 0) {
      const res = await api('/api/config');
      CONFIG = res.data || CONFIG;
    }
  } catch {}

  const freshList = type === 'chat' ? CONFIG.chatChannels : CONFIG.imageChannels;
  const ch = clone(freshList[index] || {});

  $('modalTitle').textContent = type === 'chat' ? '编辑对话渠道' : '编辑生图渠道';
  $('modalStatus').style.display = 'none';
  $('modalStatus').textContent = '';

  const timeoutBlock = type === 'chat'
    ? '<div><label>渠道超时ms</label><input id="mTimeout" type="number"><div class="tip">对话渠道默认超时为 20000ms，可按需调整。</div></div>'
    : '<div><label>生图超时</label><input id="mImageTimeoutReadonly" type="text" disabled value="由全局生图超时控制"><div class="tip">生图渠道超时已统一由“生图设置 -> 全局生图超时”控制。</div></div>';

  const b = $('modalBody');

  b.innerHTML =
    '<div class="grid">' +
    '<div><label>渠道名</label><input id="mName"></div>' +
    (type === 'image' ? '<div><label>Provider</label><select id="mProvider"><option>openai</option><option>gemini</option><option>gemini_openai</option><option>z_image_gitee</option><option>jimeng2api</option><option>grok</option></select></div>' : '') +
    '<div><label>Base URL</label><input id="mBase"></div>' +
    '<div><label>API Key</label><input id="mKey"></div>' +
    timeoutBlock +
    (type === 'image' ? '<div><label>代理</label><input id="mProxy"></div>' : '') +
    '</div>' +
    (type === 'image' ? '<h3>能力</h3><div class="grid"><label><input id="capText" type="checkbox">文生图</label><label><input id="capImage" type="checkbox">图生图</label><label><input id="capAspect" type="checkbox">宽高比</label><label><input id="capResolution" type="checkbox">分辨率</label></div>' : '') +
    '<h3>模型缓存</h3>' +
    '<div class="row">' +
    '<button class="btn secondary" id="mPull" type="button">拉取模型</button>' +
    '<button class="btn green" id="mEnableAll" type="button">全部启用</button>' +
    '<span id="mPullStatus" class="muted"></span>' +
    '</div>' +
    '<div id="mCachePanel"></div>' +
    '<h3>启用模型</h3>' +
    '<div id="mEnabledPanel"></div>';

  $('mName').value = ch.name || '';
  $('mBase').value = ch.base_url || '';
  $('mKey').value = ch.api_key || '';

  if (type === 'chat') {
    $('mTimeout').value = ch.timeout || 20000;
  }

  if (type === 'image') {
    $('mProvider').value = ch.provider_type || 'openai';
    $('mProxy').value = ch.proxy || '';

    const caps = ch.capability_options || {};

    $('capText').checked = caps.text_to_image !== false;
    $('capImage').checked = caps.image_to_image !== false;
    $('capAspect').checked = caps.aspect_ratio !== false;
    $('capResolution').checked = caps.resolution !== false;
  }

  const ensureEnabledUnique = () => {
    const enabled = uniq(getListBox('mEnabledHidden'));
    listBox('mEnabledHidden', enabled);
  };

  const renderModelPanels = () => {
    const cacheItems = getListBox('mCacheHidden');
    const enabledItems = getListBox('mEnabledHidden');

    renderModelPanel({
      rootId: 'mCachePanel',
      title: '缓存模型',
      items: cacheItems,
      enabledItems,
      collapsed: editing.cacheCollapsed,
      searchValue: editing.cacheSearch,
      onlyEnabled: editing.cacheOnlyEnabled,

      onToggleCollapsed: () => {
        editing.cacheCollapsed = !editing.cacheCollapsed;
        renderModelPanels();
      },

      onSearch: v => {
        editing.cacheSearch = v;
        renderModelPanels();
      },

      onToggleOnlyEnabled: v => {
        editing.cacheOnlyEnabled = v;
        renderModelPanels();
      },

      onEnable: name => {
        const list = enabledItems.slice();

        if (!list.includes(name)) {
          list.push(name);
        }

        listBox('mEnabledHidden', list);
        renderModelPanels();
      },

      onRemove: name => {
        const list = enabledItems.filter(v => v !== name);
        listBox('mEnabledHidden', list);
        renderModelPanels();
      },

      onTest: name => testModalModel(name),
      addButtonText: '启用',
      removeButtonText: '取消启用',
    });

    renderModelPanel({
      rootId: 'mEnabledPanel',
      title: '已启用模型',
      items: enabledItems,
      enabledItems,
      collapsed: editing.enabledCollapsed,
      searchValue: editing.enabledSearch,
      onlyEnabled: editing.enabledOnlyEnabled,

      onToggleCollapsed: () => {
        editing.enabledCollapsed = !editing.enabledCollapsed;
        renderModelPanels();
      },

      onSearch: v => {
        editing.enabledSearch = v;
        renderModelPanels();
      },

      onToggleOnlyEnabled: v => {
        editing.enabledOnlyEnabled = v;
        renderModelPanels();
      },

      onEnable: () => {},

      onRemove: name => {
        const list = enabledItems.filter(v => v !== name);
        listBox('mEnabledHidden', list);
        renderModelPanels();
      },

      onTest: name => testModalModel(name),
      addButtonText: '启用',
      removeButtonText: '移除',
    });
  };

  const hiddenWrap = document.createElement('div');
  hiddenWrap.style.display = 'none';
  hiddenWrap.innerHTML = '<div id="mCacheHidden"></div><div id="mEnabledHidden"></div>';
  b.appendChild(hiddenWrap);

  listBox('mCacheHidden', ch.models_cache || []);
  listBox(
    'mEnabledHidden',
    (ch.enabled_models || [])
      .filter(m => m.enabled !== false)
      .map(m => m.id)
  );

  ensureEnabledUnique();
  renderModelPanels();

  $('mPull').onclick = async () => {
    const now = collectModal();

    $('mPull').disabled = true;
    $('mPull').textContent = '拉取中...';
    $('mPullStatus').textContent = '正在从 Base URL 拉取模型...';

    try {
      const res = await api(type === 'chat' ? '/api/refresh-chat-models' : '/api/refresh-image-models', {
        method: 'POST',
        body: JSON.stringify({ channel: now }),
      });

      listBox('mCacheHidden', res.data || []);

      if (res.cache_path) {
        const targetList = type === 'chat' ? CONFIG.chatChannels : CONFIG.imageChannels;

        if (targetList[editing.index]) {
          targetList[editing.index].models_cache_path = res.cache_path;
          targetList[editing.index].models_cache = res.data || [];
        }
      }

      editing.cacheSearch = '';
      $('mPullStatus').textContent = '已拉取 ' + (res.data || []).length + ' 个模型到缓存文件，未自动启用';

      renderModelPanels();
    } catch (e) {
      $('mPullStatus').textContent = e.message;
      alert(e.message);
    } finally {
      $('mPull').disabled = false;
      $('mPull').textContent = '拉取模型';
    }
  };

  $('mEnableAll').onclick = () => {
    listBox('mEnabledHidden', getListBox('mCacheHidden'));
    editing.enabledSearch = '';
    renderModelPanels();
  };

  $('channelModal').classList.add('show');
}

function collectModal() {
  const type = editing.type;
  const list = type === 'chat' ? (CONFIG.chatChannels || []) : (CONFIG.imageChannels || []);
  const source = clone(list[editing.index] || {});

  const ch = Object.assign({}, source, {
    name: $('mName').value.trim(),
    base_url: $('mBase').value.trim(),
    api_key: $('mKey').value.trim(),
    models_cache: getListBox('mCacheHidden'),
    enabled_models: getListBox('mEnabledHidden').map(id => ({ id, enabled: true })),
    timeout: type === 'chat'
      ? Number($('mTimeout').value || source.timeout || 20000)
      : Number(source.timeout || CONFIG.imageGlobalTimeoutMs || 180000),
  });

  if (type === 'image') {
    ch.provider_type = $('mProvider').value;
    ch.proxy = $('mProxy').value.trim() || undefined;
    ch.capability_options = Object.assign({}, source.capability_options || {}, {
      text_to_image: $('capText').checked,
      image_to_image: $('capImage').checked,
      aspect_ratio: $('capAspect').checked,
      resolution: $('capResolution').checked,
    });

    // 关键修复：保留已有 extra，不要编辑一次就清空
    ch.extra = (source.extra && typeof source.extra === 'object')
      ? clone(source.extra)
      : {};
  }

  return ch;
}

function closeModal() {
  $('channelModal').classList.remove('show');
  editing = null;
}

function saveModal() {
  if (!editing) return;

  const ch = collectModal();

  if (!ch.name || !ch.base_url) {
    alert('渠道名和 Base URL 必填');
    return;
  }

  const list = editing.type === 'chat' ? CONFIG.chatChannels : CONFIG.imageChannels;
  list[editing.index] = ch;

  closeModal();
  renderChannels();
}

function fillForm() {
  $('prefix').value = CONFIG.prefix || '/';
  $('botName').value = CONFIG.botName || '汐雨';
  $('selfieBotName').value = CONFIG.botName || '汐雨';
  $('maxContextTurns').value = CONFIG.maxContextTurns || 30;
  $('confirmMessage').value = CONFIG.confirmMessage || '';
  $('personality').value = CONFIG.personality || '';
  $('selfiePersonality').value = CONFIG.personality || '';

  $('randomReplyChancePercent').value = clampNumber(CONFIG.randomReplyChancePercent, 5, 0, 100);
  $('randomActiveMessageCount').value = clampNumber(CONFIG.randomActiveMessageCount, 50, 1, 500);
  $('randomActiveIntervalMinutes').value = clampNumber(CONFIG.randomActiveIntervalMinutes, 300, 0, 10080);
  $('randomIgnoreQQsText').value = (CONFIG.randomIgnoreQQs || []).join(', ');

  $('webPort').value = CONFIG.webPort || 14514;
  $('webToken').value = CONFIG.webToken || '';

  $('enableReply').checked = CONFIG.enableReply !== false;
  $('sendConfirmMessage').checked = CONFIG.sendConfirmMessage !== false;
  $('allowAtTrigger').checked = CONFIG.allowAtTrigger === true;
  $('allowPublicPacket').checked = CONFIG.allowPublicPacket !== false;
  $('safetyFilter').checked = CONFIG.safetyFilter !== false;
  $('autoSwitchModel').checked = CONFIG.autoSwitchModel !== false;
  $('debug').checked = CONFIG.debug === true;
  $('webEnable').checked = CONFIG.webEnable === true;

  listBox('ownerQQsList', splitList(CONFIG.ownerQQs || ''));
  listBox('whitelistQQsList', CONFIG.whitelistQQs || []);
  listBox('disabledGroupsList', CONFIG.disabledGroups || []);

  $('imageEnableLLMTool').checked = CONFIG.imageEnableLLMTool !== false;
  $('imageDefaultAspectRatio').value = CONFIG.imageDefaultAspectRatio || '自动';
  $('selfieAspect').value = CONFIG.imageDefaultAspectRatio || '自动';
  $('imageDefaultResolution').value = CONFIG.imageDefaultResolution || '1K';
  $('imageGlobalTimeoutSeconds').value = timeoutMsToSeconds(CONFIG.imageGlobalTimeoutMs);
  $('imageMaxConcurrentTasks').value = CONFIG.imageMaxConcurrentTasks || 3;
  $('imageShowGenerationInfo').checked = CONFIG.imageShowGenerationInfo === true;
  $('imageShowModelInfo').checked = CONFIG.imageShowModelInfo === true;
  $('imageRateLimitSeconds').value = CONFIG.imageRateLimitSeconds || 0;
  $('imageEnableDailyLimit').checked = CONFIG.imageEnableDailyLimit === true;
  $('imageDailyLimitCount').value = CONFIG.imageDailyLimitCount || 10;
  $('imageMaxImageSizeMB').value = CONFIG.imageMaxImageSizeMB || 10;
  $('imageMaxCacheCount').value = CONFIG.imageMaxCacheCount || 100;
  $('imageBlacklistBlockMessage').value = CONFIG.imageBlacklistBlockMessage || '';

  listBox('imageUmoBlacklistList', CONFIG.imageUmoBlacklist || []);

  $('imageEnablePromptAudit').checked = CONFIG.imageEnablePromptAudit === true;
  $('imageEnableOutputAudit').checked = CONFIG.imageEnableOutputAudit === true;
  $('imagePromptAuditTemplate').value = CONFIG.imagePromptAuditTemplate || '';
  $('imageOutputAuditTemplate').value = CONFIG.imageOutputAuditTemplate || '';

  listBox('imageAuditWhitelistList', CONFIG.imageAuditWhitelist || []);
  listBox('imagePromptBlockedWordsList', CONFIG.imagePromptBlockedWords || []);

  renderChannels();

  $('imagePromptAuditModel').value = CONFIG.imagePromptAuditModel || '';
  $('imageOutputAuditModel').value = CONFIG.imageOutputAuditModel || '';
  $('ocrModel').value = CONFIG.ocrModel || '';

  syncJson();
}

function collectForm() {
  const botName = $('botName').value.trim() || $('selfieBotName').value.trim() || '汐雨';
  const personality = $('personality').value || $('selfiePersonality').value;
  const aspect = $('imageDefaultAspectRatio').value || $('selfieAspect').value;

  return Object.assign({}, CONFIG, {
    prefix: $('prefix').value.trim() || '/',
    botName,
    maxContextTurns: Number($('maxContextTurns').value || 30),
    confirmMessage: $('confirmMessage').value,
    personality,

    randomReplyChancePercent: clampNumber($('randomReplyChancePercent').value, 5, 0, 100),
    randomActiveMessageCount: clampNumber($('randomActiveMessageCount').value, 50, 1, 500),
    randomActiveIntervalMinutes: clampNumber($('randomActiveIntervalMinutes').value, 300, 0, 10080),
    randomIgnoreQQs: splitList($('randomIgnoreQQsText').value || ''),

    webEnable: $('webEnable').checked,
    webPort: Number($('webPort').value || 14514),
    webToken: $('webToken').value.trim(),

    enableReply: $('enableReply').checked,
    sendConfirmMessage: $('sendConfirmMessage').checked,
    allowAtTrigger: $('allowAtTrigger').checked,
    allowPublicPacket: $('allowPublicPacket').checked,
    safetyFilter: $('safetyFilter').checked,
    autoSwitchModel: $('autoSwitchModel').checked,
    debug: $('debug').checked,

    ownerQQs: getListBox('ownerQQsList').join(','),
    whitelistQQs: getListBox('whitelistQQsList'),
    disabledGroups: getListBox('disabledGroupsList'),

    chatChannels: CONFIG.chatChannels || [],
    imageChannels: CONFIG.imageChannels || [],
    enabledChatModelPriority: getPriorityListBox('chatPriorityList'),
    enabledImageModelPriority: getPriorityListBox('imagePriorityList'),

    imageEnableLLMTool: $('imageEnableLLMTool').checked,
    imageDefaultAspectRatio: aspect,
    imageDefaultResolution: $('imageDefaultResolution').value,
    imageGlobalTimeoutMs: secondsToTimeoutMs($('imageGlobalTimeoutSeconds').value),
    imageMaxConcurrentTasks: Number($('imageMaxConcurrentTasks').value || 3),
    imageShowGenerationInfo: $('imageShowGenerationInfo').checked,
    imageShowModelInfo: $('imageShowModelInfo').checked,
    imageRateLimitSeconds: Number($('imageRateLimitSeconds').value || 0),
    imageEnableDailyLimit: $('imageEnableDailyLimit').checked,
    imageDailyLimitCount: Number($('imageDailyLimitCount').value || 10),
    imageMaxImageSizeMB: Number($('imageMaxImageSizeMB').value || 10),
    imageMaxCacheCount: Number($('imageMaxCacheCount').value || 100),
    imageUmoBlacklist: getListBox('imageUmoBlacklistList'),
    imageBlacklistBlockMessage: $('imageBlacklistBlockMessage').value,

    imageAuditWhitelist: getListBox('imageAuditWhitelistList'),
    imagePromptBlockedWords: getListBox('imagePromptBlockedWordsList'),
    imageEnablePromptAudit: $('imageEnablePromptAudit').checked,
    imageEnableOutputAudit: $('imageEnableOutputAudit').checked,
    imagePromptAuditModel: $('imagePromptAuditModel').value,
    imageOutputAuditModel: $('imageOutputAuditModel').value,
    ocrModel: $('ocrModel').value,
    imagePromptAuditTemplate: $('imagePromptAuditTemplate').value,
    imageOutputAuditTemplate: $('imageOutputAuditTemplate').value,
  });
}

function stripConfigForJson(cfg) {
  const cloned = JSON.parse(JSON.stringify(cfg || {}));

  ['chatChannels', 'imageChannels'].forEach(key => {
    if (!Array.isArray(cloned[key])) return;

    cloned[key] = cloned[key].map(ch => {
      ch.models_cache = [];
      return ch;
    });
  });

  return cloned;
}

function syncJson() {
  $('fullConfig').value = JSON.stringify(stripConfigForJson(CONFIG), null, 2);
}

async function load() {
  if (!TOKEN) {
    showLogin('请先输入 Token 喵～');
    return;
  }

  status('加载中...', 'loading');

  try {
    const res = await api('/api/config');
    CONFIG = res.data || {};
    fillForm();
    showApp();
    status('已连接', true);
  } catch (e) {
    status(e.message, false);
  }
}

async function save(data) {
  status('保存中...', 'loading');

  try {
    const res = await api('/api/config', {
      method: 'POST',
      body: JSON.stringify({ config: data }),
    });

    CONFIG = res.data || data;
    fillForm();
    status('已保存', true);
  } catch (e) {
    status(e.message, false);
    alert(e.message);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getTestImageReferenceDataUrls() {
  const input = $('testImageReferenceFiles');
  const files = input && input.files ? Array.from(input.files) : [];
  const result = [];

  for (const file of files) {
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type || '')) {
      throw new Error('不支持的参考图类型：' + (file.type || file.name || '未知'));
    }

    result.push(await fileToDataUrl(file));
  }

  return result;
}

function renderTestImageReferencePreview() {
  const input = $('testImageReferenceFiles');
  const box = $('testImageReferencePreview');

  if (!input || !box) return;

  box.innerHTML = '';

  const files = input.files ? Array.from(input.files) : [];

  files.forEach(file => {
    const img = document.createElement('img');
    img.style.width = '100%';
    img.style.borderRadius = '14px';
    img.style.border = '1px solid var(--border)';
    img.style.background = '#fff';
    img.style.objectFit = 'cover';
    img.style.aspectRatio = '1 / 1';

    img.src = URL.createObjectURL(file);

    img.onload = () => {
      try {
        URL.revokeObjectURL(img.src);
      } catch {}
    };

    box.appendChild(img);
  });
}

function parseFullModel(value) {
  const text = String(value || '');
  const pos = text.indexOf('/');

  return {
    channel: pos > 0 ? text.slice(0, pos) : '',
    model: pos > 0 ? text.slice(pos + 1) : '',
  };
}

function getFirstSelectValue(id) {
  const select = $(id);
  if (!select) return '';

  const options = Array.from(select.options || []);
  const hit = options.find(o => o.value);

  return hit ? hit.value : '';
}

function setTestStatus(text, mode) {
  const el = $('testStatus');
  if (!el) return;

  el.textContent = text || '';
  el.className = 'status ' + (
    mode === 'ok'
      ? 'ok'
      : mode === 'err'
        ? 'err'
        : mode === 'loading'
          ? 'loading'
          : ''
  );
}

function setLastTestDebugData(requestData, responseData) {
  LAST_TEST_REQUEST_DATA = requestData || null;
  LAST_TEST_RESPONSE_DATA = responseData || null;
}

function setLastTestResultView(statusText, statusMode, outputText, images) {
  LAST_TEST_RESULT_VIEW = {
    statusText: statusText || '',
    statusMode: statusMode || '',
    outputText: outputText || '',
    images: Array.isArray(images) ? images.slice() : [],
  };
}

function showLastTestResultView() {
  if (!LAST_TEST_RESULT_VIEW) {
    setTestOutput('暂无测试结果。请先执行一次对话测试或生图测试。');
    return;
  }

  setTestStatus(
    LAST_TEST_RESULT_VIEW.statusText || '测试结果',
    LAST_TEST_RESULT_VIEW.statusMode || ''
  );

  setTestOutput(LAST_TEST_RESULT_VIEW.outputText || '');

  const box = $('testImages');
  if (box) {
    box.innerHTML = '';

    for (const src of LAST_TEST_RESULT_VIEW.images || []) {
      const img = document.createElement('img');
      img.src = src;
      box.appendChild(img);
    }
  }
}

function showTestJson(title, data) {
  if (!data) {
    setTestOutput(title + '：暂无数据。本数据只保留当前页面内存，刷新后会清空。');
    return;
  }

  try {
    setTestOutput(title + '\n\n' + JSON.stringify(data, null, 2));
  } catch {
    setTestOutput(title + '\n\n' + String(data));
  }
}

function clearTestDebugData() {
  LAST_TEST_REQUEST_DATA = null;
  LAST_TEST_RESPONSE_DATA = null;
  setTestOutput('已清空本页测试调试数据。测试结果仍可通过“查看测试结果”恢复。');
}

function getModalChannelType() {
  return editing && editing.type ? editing.type : '';
}

function getModalChannelData() {
  try {
    return collectModal();
  } catch {
    return null;
  }
}

function setModalStatus(text, mode) {
  const el = $('modalStatus');
  if (!el) return;

  el.style.display = 'block';
  el.textContent = text || '';
  el.className = 'status ' + (
    mode === 'ok'
      ? 'ok'
      : mode === 'err'
        ? 'err'
        : mode === 'loading'
          ? 'loading'
          : ''
  );
}

async function testModalModel(modelName) {
  const type = getModalChannelType();
  const ch = getModalChannelData();

  if (!type || !ch) {
    setModalStatus('当前没有正在编辑的渠道', 'err');
    return;
  }

  if (!ch.name || !ch.base_url) {
    setModalStatus('请先填写渠道名和 Base URL', 'err');
    return;
  }

  if (!modelName) {
    setModalStatus('缺少模型名', 'err');
    return;
  }

  setModalStatus('正在测试模型：' + modelName, 'loading');

  try {
    if (type === 'chat') {
      const res = await api('/api/test-chat-channel', {
        method: 'POST',
        body: JSON.stringify({
          channel: ch.name,
          model: modelName,
          prompt: '你好，请只回复“ok”。',
        }),
      });

      const data = res.data || {};

      setModalStatus(
        '对话模型可用：' +
          modelName +
          '，耗时 ' +
          (data.elapsed_seconds || 0) +
          's',
        'ok'
      );

      return;
    }

    const res = await api('/api/test-image-channel', {
      method: 'POST',
      body: JSON.stringify({
        channel: ch.name,
        model: modelName,
        prompt: '一只白色小猫，简单可爱，干净背景',
        aspect_ratio: CONFIG.imageDefaultAspectRatio || '自动',
        resolution: CONFIG.imageDefaultResolution || '1K',
      }),
    });

    const data = res.data || {};

    setModalStatus(
      '生图模型可用：' +
        modelName +
        '，耗时 ' +
        (data.elapsed_seconds || 0) +
        's，生成 ' +
        ((data.images || []).length) +
        ' 张',
      'ok'
    );
  } catch (e) {
    const payload = e.payload || {};
    const msg = payload.error || e.message || String(e);

    setModalStatus(
      '模型测试失败：' + modelName + '\n' + msg,
      'err'
    );
  }
}

function setTestOutput(text) {
  const el = $('testOutput');
  if (!el) return;

  el.textContent = mobileSafeError(String(text || ''));
}

function setTestError(title, error) {
  setTestStatus(title || '测试失败', 'err');

  const raw = error instanceof Error
    ? error.message
    : String(error || '未知错误');

  setTestOutput(raw);
}

async function testChat() {
  let selected = $('testChatModel').value || getFirstSelectValue('testChatModel');

  if (selected && !$('testChatModel').value) {
    $('testChatModel').value = selected;
  }

  const target = parseFullModel(selected);
  const prompt = $('testChatPrompt').value.trim();

  if (!target.channel || !target.model) {
    const errorText = '当前没有可用的已启用对话模型。请先在“渠道管理”中启用至少一个对话模型。';

    setTestError('对话测试失败', errorText);
    setLastTestResultView('对话测试失败', 'err', errorText, []);

    return;
  }

  if (!prompt) {
    const errorText = '请输入测试提示词';

    setTestError('对话测试失败', errorText);
    setLastTestResultView('对话测试失败', 'err', errorText, []);

    return;
  }

  setTestStatus('对话测试中...', 'loading');
  setTestOutput('');
  $('testImages').innerHTML = '';

  try {
    const res = await api('/api/test-chat-channel', {
      method: 'POST',
      body: JSON.stringify({
        channel: target.channel,
        model: target.model,
        prompt,
      }),
    });

    const data = res.data || {};

    setLastTestDebugData(
      data.request_data || null,
      data.response_data || {
        success: true,
        used_model: data.used_model,
        content: data.content,
        elapsed_ms: data.elapsed_ms,
        elapsed_seconds: data.elapsed_seconds,
      }
    );

    const outputText = [
      '模型: ' + (data.used_model || ''),
      '耗时: ' + (data.elapsed_seconds || 0) + 's',
      '',
      data.content || '',
    ].join('\n');

    setTestStatus('对话测试完成', 'ok');
    setTestOutput(outputText);

    setLastTestResultView('对话测试完成', 'ok', outputText, []);
  } catch (e) {
    const payload = e.payload || {};
    const data = payload.data || {};

    const errorText = payload.error || e.message || String(e);

    setLastTestDebugData(
      data.request_data || null,
      data.response_data || {
        success: false,
        error: errorText,
        raw_payload: payload,
      }
    );

    setTestError('对话测试失败', errorText);
    setLastTestResultView('对话测试失败', 'err', errorText, []);
  }
}

async function testImage() {
  let selected = $('testImageModel').value || getFirstSelectValue('testImageModel');

  if (selected && !$('testImageModel').value) {
    $('testImageModel').value = selected;
  }

  const target = parseFullModel(selected);
  const prompt = $('testImagePrompt').value.trim();

  if (!target.channel || !target.model) {
    const errorText = '当前没有可用的已启用生图模型。请先在“渠道管理”中启用至少一个生图模型。';

    setTestError('生图测试失败', errorText);
    setLastTestResultView('生图测试失败', 'err', errorText, []);

    return;
  }

  if (!prompt) {
    const errorText = '请输入测试提示词';

    setTestError('生图测试失败', errorText);
    setLastTestResultView('生图测试失败', 'err', errorText, []);

    return;
  }

  setTestStatus('正在读取参考图...', 'loading');
  setTestOutput('');
  $('testImages').innerHTML = '';

  try {
    const images = await getTestImageReferenceDataUrls();
    const useSelfie = Boolean($('testImageUseSelfie')?.checked);

    setTestStatus(
      images.length || useSelfie
        ? '图生图测试中...'
        : '生图测试中...',
      'loading'
    );

    const res = await api('/api/test-image-channel', {
      method: 'POST',
      body: JSON.stringify({
        channel: target.channel,
        model: target.model,
        prompt,
        aspect_ratio: $('testImageAspect').value,
        resolution: $('testImageResolution').value,
        images,
        use_selfie_reference: useSelfie,
      }),
    });

    const data = res.data || {};
    const outImages = data.images || [];

    setLastTestDebugData(
      data.request_data || null,
      data.response_data || {
        success: true,
        used_model: data.used_model,
        image_count: outImages.length,
        elapsed_ms: data.elapsed_ms,
        elapsed_seconds: data.elapsed_seconds,
      }
    );

    const statusText = images.length || useSelfie
      ? '图生图测试完成'
      : '生图测试完成';

    const outputText = [
      '模型: ' + (data.used_model || ''),
      '耗时: ' + (data.elapsed_seconds || 0) + 's',
      '参考图: ' + (data.reference_images || images.length || 0) + '张',
      '其中形象图: ' + (data.use_selfie_reference ? '是' : '否'),
      '其他参考图: ' + (data.extra_reference_images || 0) + '张',
      '输出数量: ' + outImages.length + '张',
      '全局超时: ' + clampNumber($('imageGlobalTimeoutSeconds').value, 120, 10, 900) + 's',
      '',
      data.final_prompt ? '最终测试提示词:' : '',
      data.final_prompt || '',
    ].filter(Boolean).join('\n');

    setTestStatus(statusText, 'ok');
    setTestOutput(outputText);

    $('testImages').innerHTML = '';

    outImages.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      $('testImages').appendChild(img);
    });

    setLastTestResultView(statusText, 'ok', outputText, outImages);
  } catch (e) {
    const payload = e.payload || {};
    const data = payload.data || {};

    const errorText = payload.error || e.message || String(e);

    setLastTestDebugData(
      data.request_data || null,
      data.response_data || {
        success: false,
        error: errorText,
        raw_payload: payload,
      }
    );

    setTestError('生图测试失败', errorText);
    setLastTestResultView('生图测试失败', 'err', errorText, []);
  }
}

document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  showTab(b.dataset.tab);

  if (b.dataset.tab === 'monitor') {
    MONITOR_OFFSET = 0;
    loadMonitorRecords();
  }
});
$('reloadBtn').onclick = load;
$('saveBtn').onclick = () => save(collectForm());
$('logoutBtn').onclick = () => { clearToken(); showLogin('已退出登录喵～'); };
$('loginBtn').onclick = () => { saveToken($('loginToken').value); load(); };
$('clearTokenBtn').onclick = () => { clearToken(); $('loginToken').value = ''; showLogin('已清除本机 Token'); };

$('saveJsonBtn').onclick = () => {
  try {
    CONFIG = JSON.parse($('fullConfig').value);
    save(CONFIG);
  } catch (e) {
    alert(e.message);
  }
};

$('formatJsonBtn').onclick = () => {
  try {
    $('fullConfig').value = JSON.stringify(JSON.parse($('fullConfig').value), null, 2);
  } catch (e) {
    alert(e.message);
  }
};

$('fullConfig').addEventListener('input', () => {
  try {
    const obj = JSON.parse($('fullConfig').value || '{}');
    if (obj && typeof obj === 'object') {
      CONFIG = obj;
      fillForm();
    }
  } catch {}
});

$('addChatBtn').onclick = () => {
  CONFIG.chatChannels = CONFIG.chatChannels || [];
  CONFIG.chatChannels.push({
    name: '',
    base_url: '',
    api_key: '',
    models_cache: [],
    enabled_models: [],
    timeout: 20000,
  });
  renderChannels();
  openModal('chat', CONFIG.chatChannels.length - 1);
};

$('addImageBtn').onclick = () => {
  CONFIG.imageChannels = CONFIG.imageChannels || [];
  CONFIG.imageChannels.push({
    name: '',
    base_url: '',
    api_key: '',
    provider_type: 'openai',
    models_cache: [],
    enabled_models: [],
    timeout: Number(CONFIG.imageGlobalTimeoutMs || 180000),
    capability_options: {
      text_to_image: true,
      image_to_image: true,
      aspect_ratio: true,
      resolution: true,
    },
    extra: {},
  });
  renderChannels();
  openModal('image', CONFIG.imageChannels.length - 1);
};

$('addChatPriority').onclick = () => {
  const v = $('chatPriorityPicker').value;
  if (!v) return;

  const list = getPriorityListBox('chatPriorityList');
  if (!list.includes(v)) list.push(v);
  renderPriorityList('chatPriorityList', list);
};

$('addImagePriority').onclick = () => {
  const v = $('imagePriorityPicker').value;
  if (!v) return;

  const list = getPriorityListBox('imagePriorityList');
  if (!list.includes(v)) list.push(v);
  renderPriorityList('imagePriorityList', list);
};

$('clearChatPriority').onclick = () => renderPriorityList('chatPriorityList', []);
$('clearImagePriority').onclick = () => renderPriorityList('imagePriorityList', []);
$('closeModal').onclick = closeModal;
$('cancelModal').onclick = closeModal;
$('saveModal').onclick = saveModal;
$('testChatBtn').onclick = testChat;
$('testImageBtn').onclick = testImage;

if ($('testImageReferenceFiles')) {
  $('testImageReferenceFiles').onchange = renderTestImageReferencePreview;
}

if ($('clearTestImageReferences')) {
  $('clearTestImageReferences').onclick = () => {
    const input = $('testImageReferenceFiles');
    if (!input) return;

    input.value = '';
    renderTestImageReferencePreview();

    setTestStatus('已取消选择参考图', '');
    setTestOutput('');
  };
}

if ($('showTestRequestBtn')) {
  $('showTestRequestBtn').onclick = () => {
    showTestJson('请求数据（仅当前前端页面内存保存）', LAST_TEST_REQUEST_DATA);
  };
}

if ($('showTestResponseBtn')) {
  $('showTestResponseBtn').onclick = () => {
    showTestJson('响应数据（仅当前前端页面内存保存）', LAST_TEST_RESPONSE_DATA);
  };
}

if ($('showTestResultBtn')) {
  $('showTestResultBtn').onclick = showLastTestResultView;
}

if ($('clearTestDebugBtn')) {
  $('clearTestDebugBtn').onclick = clearTestDebugData;
}

if ($('monitorRefreshBtn')) {
  $('monitorRefreshBtn').onclick = () => {
    MONITOR_OFFSET = 0;
    loadMonitorRecords();
  };
}

if ($('monitorPrevBtn')) {
  $('monitorPrevBtn').onclick = monitorGoPrevPage;
}

if ($('monitorNextBtn')) {
  $('monitorNextBtn').onclick = monitorGoNextPage;
}

if ($('monitorDeletePageBtn')) {
  $('monitorDeletePageBtn').onclick = deleteCurrentMonitorPage;
}

if ($('monitorClearBtn')) {
  $('monitorClearBtn').onclick = async () => {
    const type = $('monitorType').value;

    if (!confirm(type ? '确认清空当前类型记录？' : '确认清空全部监控记录？')) return;

    await api('/api/monitor-records/clear', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });

    await loadMonitorRecords();
  };
}

if ($('monitorType')) $('monitorType').onchange = () => {
  MONITOR_OFFSET = 0;
  loadMonitorRecords();
};

if ($('monitorSuccess')) $('monitorSuccess').onchange = () => {
  MONITOR_OFFSET = 0;
  loadMonitorRecords();
};
if ($('monitorModel')) $('monitorModel').onkeydown = e => {
  if (e.key === 'Enter') {
    MONITOR_OFFSET = 0;
    loadMonitorRecords();
  }
};

if (new URLSearchParams(location.search).get('token')) {
  saveToken(new URLSearchParams(location.search).get('token'));
  history.replaceState(null, '', location.pathname);
}

if (TOKEN) load();
else showLogin('请输入 Token 登录喵～');
})();`;
}
