(() => {
  const ROOT_ID = 'targeted-replenishment-admin';
  const adminHash = /^#\/(?:dashboard|content|knowledge|users|devotions|economy|ai-gov|expedition|patrol|support|audit|system)(?:[/?#]|$)/;
  let pollTimer = null;
  let coverage = [];

  const getToken = () => localStorage.getItem('adminToken') || sessionStorage.getItem('authToken');
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    return payload;
  };

  const renderRun = (run) => {
    const status = document.getElementById('tr-status');
    if (!status || !run) return;
    const labels = {
      idle: '待命', running: '執行中', completed: '已完成', cancelled: '已停止',
      paused: '已暫停', blocked: '已阻擋', failed: '失敗'
    };
    const inventory = run.readiness?.inventory || {};
    const initialInventory = run.initialReadiness?.inventory || {};
    const shortageParts = Object.entries(run.readiness?.shortages || {})
      .map(([band, item]) => `${band} 缺 ${item.missing ?? item}`);
    const progressLabels = {
      inventory: '檢查庫存', generation: 'AI 生成候選題', generated: '候選題生成完成',
      pruned: '去重完成', audit: '品質審核中', audited: '品質審核中',
      batch_complete: '批次完成', blocked: '補題條件未通過'
    };
    status.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = `${labels[run.state] || run.state}${run.book ? `｜${run.book}` : ''}`;
    const detail = document.createElement('div');
    detail.textContent = run.message || '';
    const counts = document.createElement('div');
    counts.textContent = `批次 ${run.completedBatches || 0}/${run.maxBatches || 0}　通過 ${run.stored || 0}　淘汰 ${run.rejected || 0}`;
    const stock = document.createElement('div');
    stock.textContent = run.readiness
      ? `目前庫存：易 ${inventory.EASY || 0}／中 ${inventory.MEDIUM || 0}／難 ${(inventory.HARD || 0) + (inventory.VERY_HARD || 0)}${shortageParts.length ? `；${shortageParts.join('、')}` : '；已可開局'}`
      : '尚未讀取可玩庫存';
    const baseline = document.createElement('div');
    baseline.textContent = run.initialReadiness
      ? `開始前：易 ${initialInventory.EASY || 0}／中 ${initialInventory.MEDIUM || 0}／難 ${(initialInventory.HARD || 0) + (initialInventory.VERY_HARD || 0)}`
      : '';
    const progress = document.createElement('div');
    const progressState = run.progress || {};
    progress.textContent = progressState.stage
      ? `目前階段：${progressLabels[progressState.stage] || progressState.stage}${progressState.total ? `（${progressState.current || 0}/${progressState.total}）` : ''}`
      : '';
    const updated = document.createElement('div');
    updated.textContent = run.lastUpdatedAt
      ? `最後更新：${new Date(run.lastUpdatedAt).toLocaleString('zh-TW')}`
      : '';
    status.append(title, detail, progress, counts, baseline, stock, updated);
    if (Array.isArray(run.latestQuestions) && run.latestQuestions.length > 0) {
      const listTitle = document.createElement('strong');
      listTitle.textContent = '本次實際入庫題目';
      const list = document.createElement('ol');
      list.className = 'tr-question-list';
      run.latestQuestions.forEach(item => {
        const row = document.createElement('li');
        row.textContent = `${item.question}（${item.difficulty || '未標示'}）`;
        list.append(row);
      });
      status.append(listTitle, list);
    }
    document.getElementById('tr-start').disabled = run.state === 'running';
    document.getElementById('tr-cancel').disabled = run.state !== 'running';
  };

  const renderAutomatic = (automatic) => {
    const element = document.getElementById('tr-auto-status');
    if (!element || !automatic) return;
    const exhausted = Array.isArray(automatic.exhaustedBooks) ? automatic.exhaustedBooks.length : 0;
    const pulse = automatic.lastPulseAt
      ? new Date(automatic.lastPulseAt).toLocaleString('zh-TW')
      : '尚未執行';
    element.textContent = automatic.enabled
      ? `全站自動補題：已啟用｜目前階段 ${automatic.targetCount || 15} 題｜本次啟動已入庫 ${automatic.totalStoredThisSession || 0} 題｜飽和書卷 ${exhausted} 卷｜上次巡航 ${pulse}`
      : '全站自動補題：尚未啟用';
  };

  const refreshStatus = async () => {
    try {
      const payload = await api('/api/admin/patrol/targeted/status');
      renderRun(payload.run);
      renderAutomatic(payload.automatic);
      if (payload.run?.state !== 'running' && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
        await loadCoverage();
      }
    } catch (error) {
      const status = document.getElementById('tr-status');
      if (status) status.textContent = `狀態讀取失敗：${error.message}`;
    }
  };

  const updateSelectedBook = () => {
    const select = document.getElementById('tr-book');
    const summary = document.getElementById('tr-book-summary');
    const item = coverage.find(entry => entry.book === select?.value);
    if (!summary) return;
    summary.textContent = item
      ? `可用 ${item.total} 題｜易 ${item.byBand.EASY}／中 ${item.byBand.MEDIUM}／難 ${item.byBand.HARD + item.byBand.VERY_HARD}｜原始難度缺口 ${item.shortageTotal}`
      : '載入題庫資料中…';
  };

  const loadCoverage = async () => {
    const select = document.getElementById('tr-book');
    if (!select) return;
    try {
      const selected = select.value;
      const payload = await api('/api/admin/patrol/inventory?version=CUV_TRAD&targetCount=15');
      coverage = payload.coverage || [];
      select.replaceChildren();
      coverage.forEach(item => {
        const option = document.createElement('option');
        option.value = item.book;
        option.textContent = `${item.book}（${item.total} 題／缺口 ${item.shortageTotal}）`;
        select.append(option);
      });
      if (coverage.some(item => item.book === selected)) select.value = selected;
      updateSelectedBook();
    } catch (error) {
      document.getElementById('tr-book-summary').textContent = `題庫讀取失敗：${error.message}`;
    }
  };

  const start = async () => {
    const book = document.getElementById('tr-book').value;
    const batches = 12;
    if (!book || !window.confirm(`確定使用免費金鑰為「${book}」持續補題嗎？\n可開局後會自動停止，不需要重複按開始。`)) return;
    try {
      const payload = await api('/api/admin/patrol/targeted/start', {
        method: 'POST',
        body: JSON.stringify({ book, version: 'CUV_TRAD', maxBatches: batches, freeOnly: true })
      });
      renderRun(payload.run);
      if (!pollTimer) pollTimer = setInterval(refreshStatus, 5000);
    } catch (error) {
      window.alert(`無法啟動：${error.message}`);
      await refreshStatus();
    }
  };

  const cancel = async () => {
    if (!window.confirm('目前批次會先完成，之後停止。確定要停止嗎？')) return;
    try {
      const payload = await api('/api/admin/patrol/targeted/cancel', { method: 'POST', body: '{}' });
      renderRun(payload.run);
    } catch (error) {
      window.alert(`無法停止：${error.message}`);
    }
  };

  const mount = () => {
    const shouldShow = adminHash.test(location.hash) && Boolean(getToken());
    const existing = document.getElementById(ROOT_ID);
    if (!shouldShow) {
      if (existing) existing.style.display = 'none';
      return;
    }
    if (existing) {
      existing.style.display = '';
      return;
    }

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <style>
        #tr-launcher{position:fixed;right:22px;bottom:22px;z-index:9000;border:0;border-radius:16px;padding:13px 18px;background:#292524;color:white;font-weight:800;box-shadow:0 12px 30px #0003;cursor:pointer}
        #tr-modal{position:fixed;inset:0;z-index:9100;display:none;align-items:center;justify-content:center;background:#1c1917aa;padding:18px}
        #tr-card{width:min(560px,100%);max-height:90vh;overflow:auto;background:white;border-radius:24px;padding:24px;box-shadow:0 24px 70px #0005;color:#292524;font-family:system-ui,sans-serif}
        #tr-card h2{margin:0 0 6px;font-size:22px} #tr-card p{margin:5px 0;color:#78716c;font-size:14px;line-height:1.55}
        #tr-card label{display:block;margin-top:16px;margin-bottom:6px;font-size:13px;font-weight:800}
        #tr-card select{width:100%;padding:11px;border:1px solid #d6d3d1;border-radius:12px;background:white}
        #tr-auto-status{margin-top:12px;padding:10px;border-radius:12px;background:#eff6ff;color:#1d4ed8;font-size:13px;font-weight:700;line-height:1.55}
        #tr-status{margin-top:16px;padding:14px;border-radius:14px;background:#f5f5f4;font-size:13px;line-height:1.65}
        #tr-status strong{display:block;font-size:15px;color:#292524}
        .tr-question-list{margin:6px 0 0;padding-left:20px;max-height:180px;overflow:auto}.tr-question-list li{margin:4px 0;color:#44403c}
        .tr-actions{display:flex;gap:9px;margin-top:18px}.tr-actions button{flex:1;border:0;border-radius:12px;padding:12px;font-weight:800;cursor:pointer}
        .tr-actions button:disabled{opacity:.4;cursor:not-allowed}#tr-start{background:#047857;color:white}#tr-cancel{background:#fee2e2;color:#b91c1c}#tr-close{background:#e7e5e4;color:#44403c}
        #tr-free{margin-top:14px;padding:10px;border-radius:12px;background:#ecfdf5;color:#047857;font-size:13px;font-weight:700}
      </style>
      <button id="tr-launcher" type="button">單卷免費補題</button>
      <div id="tr-modal" role="dialog" aria-modal="true" aria-label="單卷免費補題">
        <div id="tr-card">
          <h2>單卷免費補題</h2>
          <p>單卷補題與全站自動巡航都只使用免費 Gemini 金鑰，不會借用付費金鑰。</p>
          <div id="tr-auto-status">讀取全站自動補題狀態中…</div>
          <div id="tr-free">按一次即持續補到可開局；免費額度不足、有人遊戲、按下停止或達安全上限時才會暫停。</div>
          <label for="tr-book">選擇書卷</label>
          <select id="tr-book"></select>
          <p id="tr-book-summary">載入題庫資料中…</p>
          <div id="tr-status">讀取執行狀態中…</div>
          <div class="tr-actions"><button id="tr-start" type="button">開始補題</button><button id="tr-cancel" type="button" disabled>停止</button><button id="tr-close" type="button">關閉</button></div>
        </div>
      </div>`;
    document.body.append(root);
    const modal = document.getElementById('tr-modal');
    document.getElementById('tr-launcher').onclick = () => {
      modal.style.display = 'flex';
      loadCoverage();
      refreshStatus();
    };
    document.getElementById('tr-close').onclick = () => { modal.style.display = 'none'; };
    document.getElementById('tr-start').onclick = start;
    document.getElementById('tr-cancel').onclick = cancel;
    document.getElementById('tr-book').onchange = updateSelectedBook;
    modal.onclick = event => { if (event.target === modal) modal.style.display = 'none'; };
  };

  window.addEventListener('hashchange', mount);
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
