export function getAdminSelfieUploadJs (): string {
  return String.raw`
(() => {
  function $(id) { return document.getElementById(id); }

  function getToken() {
    return new URLSearchParams(location.search).get('token') ||
      localStorage.getItem('aicat_token') ||
      '';
  }

  function api(path, options = {}) {
    const token = getToken();
    const headers = Object.assign(
      { 'Content-Type': 'application/json', 'x-aicat-token': token },
      options.headers || {}
    );

    const url = path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);

    return fetch(url, Object.assign({}, options, { headers }))
      .then(async r => {
        let d = {};
        try { d = await r.json(); } catch {}
        if (!r.ok || d.success === false) {
          throw new Error(d.error || d.message || '请求失败');
        }
        return d;
      });
  }

  function waitReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function toDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function bytesToSize(n) {
    if (!Number.isFinite(n)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  async function refreshSelfiePreview() {
    const img = $('selfieUploadPreview');
    const status = $('selfieUploadStatus');
    if (!img || !status) return;

    try {
      const res = await api('/api/selfie-reference');
      const data = res.data || {};

      if (data.has_image && data.image) {
        img.src = data.image;
        img.style.display = 'block';
        status.textContent = '当前已设置自拍参考图' + (data.updated_at ? '，更新时间：' + data.updated_at : '');
        status.className = 'status ok';
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        status.textContent = '当前还没有设置自拍参考图';
        status.className = 'status';
      }
    } catch (e) {
      status.textContent = '读取自拍参考图失败：' + e.message;
      status.className = 'status err';
    }
  }

  function injectSelfieUploadUi() {
    const section = $('selfie');
    if (!section || $('selfieUploadCard')) return;

    const card = document.createElement('div');
    card.className = 'card soft';
    card.id = 'selfieUploadCard';
    card.innerHTML = [
      '<h3>直接上传自拍参考图</h3>',
      '<p class="muted">这里可以直接在 Web 面板上传 AI 自拍形象参考图，无需再通过 QQ 指令发送图片。</p>',
      '<div class="grid">',
      '  <div>',
      '    <label>选择图片</label>',
      '    <input id="selfieUploadFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">',
      '    <div class="tip">支持 PNG / JPG / WEBP / GIF。建议使用清晰单人形象图。</div>',
      '  </div>',
      '  <div>',
      '    <label>操作</label>',
      '    <div class="row">',
      '      <button class="btn green" id="selfieUploadBtn" type="button">上传并保存</button>',
      '      <button class="btn secondary" id="selfieRefreshBtn" type="button">刷新预览</button>',
      '      <button class="btn danger" id="selfieClearBtn" type="button">清除参考图</button>',
      '    </div>',
      '  </div>',
      '</div>',
      '<div id="selfieUploadStatus" class="status" style="margin-top:10px">等待读取状态</div>',
      '<div style="margin-top:12px">',
      '  <img id="selfieUploadPreview" style="display:none;max-width:260px;width:100%;border-radius:18px;border:1px solid var(--border);background:#fff">',
      '</div>',
    ].join('');

    const firstCard = section.querySelector('.card');
    if (firstCard && firstCard.nextSibling) {
      section.insertBefore(card, firstCard.nextSibling);
    } else {
      section.appendChild(card);
    }

    $('selfieRefreshBtn').onclick = refreshSelfiePreview;

    $('selfieClearBtn').onclick = async () => {
      if (!confirm('确认清除自拍参考图？')) return;
      const status = $('selfieUploadStatus');
      try {
        status.textContent = '正在清除...';
        status.className = 'status loading';
        await api('/api/selfie-reference/clear', { method: 'POST', body: JSON.stringify({}) });
        await refreshSelfiePreview();
      } catch (e) {
        status.textContent = '清除失败：' + e.message;
        status.className = 'status err';
      }
    };

    $('selfieUploadBtn').onclick = async () => {
      const fileInput = $('selfieUploadFile');
      const file = fileInput && fileInput.files && fileInput.files[0];
      const status = $('selfieUploadStatus');

      if (!file) {
        alert('请先选择图片');
        return;
      }

      if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type || '')) {
        alert('不支持的图片类型：' + (file.type || '未知'));
        return;
      }

      try {
        status.textContent = '正在读取图片：' + file.name + ' (' + bytesToSize(file.size) + ')';
        status.className = 'status loading';

        const dataUrl = await toDataUrl(file);

        status.textContent = '正在上传保存...';
        status.className = 'status loading';

        await api('/api/selfie-reference', {
          method: 'POST',
          body: JSON.stringify({
            image: dataUrl,
            mime_type: file.type || 'image/png',
            filename: file.name || 'selfie.png',
          }),
        });

        status.textContent = '上传成功';
        status.className = 'status ok';

        await refreshSelfiePreview();
      } catch (e) {
        status.textContent = '上传失败：' + e.message;
        status.className = 'status err';
      }
    };

    refreshSelfiePreview();
  }

  waitReady(() => {
    injectSelfieUploadUi();

    const observer = new MutationObserver(() => injectSelfieUploadUi());
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
`;
}
