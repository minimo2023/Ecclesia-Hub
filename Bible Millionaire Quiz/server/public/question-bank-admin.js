(() => {
  const ROOT_ID = 'question-bank-governance';
  const routePattern = /^#\/content(?:[/?#]|$)/;
  const legacySections = new Set(['objects', 'locations', 'backup']);
  const bankToStorage = { TCV2019_TRAD: 'TCV2010_TRAD' };
  const labels = {
    PUBLISHED: '正式可玩', IN_REVIEW: '待審查', SUSPENDED: '已停用', DRAFT: '草稿', ARCHIVED: '已封存',
    EASY: '簡單', MEDIUM: '中等', HARD: '困難', VERY_HARD: '極難'
  };
  const state = {
    activeTab: 'overview', activeVersion: 'CUV_TRAD', metadata: null, corpus: [], overview: [],
    questions: [], pagination: null, queue: [], loading: false, error: null, policyPreview: null,
    filters: { search: '', book: '', state: '', difficulty: '' }
  };
  const canonicalBooks = [
    '創世記','出埃及記','利未記','民數記','申命記','約書亞記','士師記','路得記','撒母耳記上','撒母耳記下',
    '列王紀上','列王紀下','歷代志上','歷代志下','以斯拉記','尼希米記','以斯帖記','約伯記','詩篇','箴言',
    '傳道書','雅歌','以賽亞書','耶利米書','耶利米哀歌','以西結書','但以理書','何西阿書','約珥書','阿摩司書',
    '俄巴底亞書','約拿書','彌迦書','那鴻書','哈巴谷書','西番雅書','哈該書','撒迦利亞書','瑪拉基書','馬太福音',
    '馬可福音','路加福音','約翰福音','使徒行傳','羅馬書','哥林多前書','哥林多後書','加拉太書','以弗所書','腓立比書',
    '歌羅西書','帖撒羅尼迦前書','帖撒羅尼迦後書','提摩太前書','提摩太後書','提多書','腓利門書','希伯來書','雅各書','彼得前書',
    '彼得後書','約翰一書','約翰二書','約翰三書','猶大書','啟示錄'
  ];
  const bookIndex = new Map(canonicalBooks.map((book, index) => [book, index]));
  const byBibleOrder = (a, b) => (bookIndex.get(a.book) ?? 999) - (bookIndex.get(b.book) ?? 999) || String(a.book).localeCompare(String(b.book), 'zh-Hant');

  const h = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  const getToken = () => localStorage.getItem('adminToken') || sessionStorage.getItem('authToken');
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
    return payload;
  };

  const toast = message => {
    document.querySelector('.qbg-toast')?.remove();
    const node = h('div', { class: 'qbg-toast', text: message });
    document.body.append(node);
    setTimeout(() => node.remove(), 4200);
  };

  const activeCorpus = () => state.corpus.find(item => item.id === state.activeVersion);
  const activeRows = () => state.overview.filter(item => item.versionId === state.activeVersion).sort(byBibleOrder);

  const shouldMount = () => {
    if (!routePattern.test(location.hash) || !getToken()) return false;
    const query = location.hash.split('?')[1] || '';
    const tab = new URLSearchParams(query).get('tab');
    return !tab || !legacySections.has(tab);
  };

  const findHost = () => {
    const candidates = [...document.querySelectorAll('main > div')];
    return candidates.find(node => node.className.includes('overflow-auto')) || document.querySelector('main') || document.body;
  };

  const mount = async () => {
    const existing = document.getElementById(ROOT_ID);
    if (!shouldMount()) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const host = findHost();
    if (!host) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(h('section', { id: ROOT_ID, 'aria-label': '題庫治理中心' }));
    render();
    await loadInitial();
  };

  const loadInitial = async () => {
    state.loading = true; state.error = null; render();
    try {
      const [metadata, corpus, overview] = await Promise.all([
        api('/api/admin/question-bank/metadata'),
        api('/api/admin/question-bank/corpus-status'),
        api('/api/admin/question-bank/overview')
      ]);
      state.metadata = metadata;
      state.corpus = corpus.versions || [];
      state.overview = overview.rows || [];
      if (!state.corpus.some(item => item.id === state.activeVersion)) state.activeVersion = state.corpus[0]?.id || 'CUV_TRAD';
    } catch (error) { state.error = error.message; }
    state.loading = false; render();
  };

  const loadQuestions = async (page = 1) => {
    state.loading = true; renderBody();
    const params = new URLSearchParams({ page, limit: 30, version: state.activeVersion });
    for (const [key, value] of Object.entries(state.filters)) if (value) params.set(key, value);
    try {
      const payload = await api(`/api/admin/question-bank/questions?${params}`);
      state.questions = payload.questions || [];
      state.pagination = payload.pagination;
      state.error = null;
    } catch (error) { state.error = error.message; }
    state.loading = false; renderBody();
  };

  const loadQueue = async () => {
    state.loading = true; renderBody();
    try { state.queue = (await api('/api/admin/question-bank/work-queue?limit=80')).items || []; state.error = null; }
    catch (error) { state.error = error.message; }
    state.loading = false; renderBody();
  };

  const switchTab = tab => {
    state.activeTab = tab;
    render();
    if (tab === 'questions' && state.questions.length === 0) loadQuestions();
    if (tab === 'queue' && state.queue.length === 0) loadQueue();
    if (tab === 'replenishment') loadReplenishment();
    if (tab === 'policy') loadPolicy();
  };

  const render = () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.replaceChildren();
    const shell = h('div', { class: 'qbg-shell' });
    shell.append(
      h('header', { class: 'qbg-header' },
        h('div', { class: 'qbg-title-wrap' },
          h('div', { class: 'qbg-mark', text: '▦' }),
          h('div', {}, h('h1', { class: 'qbg-title', text: '題庫治理中心' }), h('p', { class: 'qbg-subtitle', text: '以完整經文庫為核心，管理庫存、品質與自動補題' }))
        ),
        h('div', { class: 'qbg-live', text: '治理資料即時同步' })
      )
    );
    if (state.error) shell.append(h('div', { class: 'qbg-error', text: `讀取失敗：${state.error}` }));
    shell.append(renderCorpusStrip(), renderTabs(), h('div', { id: 'qbg-body' }));
    root.append(shell);
    renderBody();
  };

  const renderCorpusStrip = () => h('div', { class: 'qbg-corpus-strip' },
    (state.corpus.length ? state.corpus : (state.metadata?.versions || [])).map(item => {
      const ready = item.ready !== false;
      return h('button', {
        class: `qbg-corpus ${state.activeVersion === item.id ? 'active' : ''}`,
        onclick: () => { state.activeVersion = item.id; state.questions = []; render(); if (state.activeTab === 'questions') loadQuestions(); if (state.activeTab === 'policy') loadPolicy(); }
      },
        h('div', { class: 'qbg-corpus-top' },
          h('span', { class: 'qbg-corpus-name', text: item.label || item.displayName }),
          h('span', { class: `qbg-pill ${ready ? 'good' : 'warn'}`, text: ready ? '經文完整' : '待修復' })
        ),
        h('div', { class: 'qbg-corpus-meta', text: item.verseCount !== undefined ? `${Number(item.verseCount).toLocaleString()} 節・${item.bookCount || 0} 卷・${item.chapterCount || 0} 章` : item.id })
      );
    })
  );

  const renderTabs = () => {
    const items = [
      ['overview', '庫存總覽'], ['queue', '待辦匣'], ['questions', '題目庫'],
      ['replenishment', '補題中心'], ['policy', '規則設定']
    ];
    return h('nav', { class: 'qbg-tabs', 'aria-label': '題庫功能' }, items.map(([id, label]) =>
      h('button', { class: `qbg-tab ${state.activeTab === id ? 'active' : ''}`, onclick: () => switchTab(id), text: label })
    ));
  };

  const renderBody = () => {
    const body = document.getElementById('qbg-body');
    if (!body) return;
    body.replaceChildren();
    if (state.loading && !state.overview.length) { body.append(h('div', { class: 'qbg-loading', text: '正在整理題庫資料…' })); return; }
    if (state.activeTab === 'overview') body.append(renderOverview());
    if (state.activeTab === 'queue') body.append(renderQueue());
    if (state.activeTab === 'questions') body.append(renderQuestions());
    if (state.activeTab === 'replenishment') body.append(renderReplenishment());
    if (state.activeTab === 'policy') body.append(renderPolicy());
  };

  const renderOverview = () => {
    const rows = activeRows();
    const playable = rows.reduce((sum, row) => sum + row.playable, 0);
    const shortage = rows.reduce((sum, row) => sum + row.shortage, 0);
    const readyBooks = rows.filter(row => row.shortage === 0).length;
    const actionRequired = rows.reduce((sum, row) => sum + Number(row.stateCounts?.SUSPENDED || 0) + Number(row.stateCounts?.IN_REVIEW || 0), 0);
    return h('div', {},
      h('div', { class: 'qbg-kpis' },
        kpi('正式可玩', playable.toLocaleString(), `${activeCorpus()?.label || ''}目前可直接開局`),
        kpi('已達最低門檻', `${readyBooks} / ${rows.length || 66}`, '每卷最低 15 題'),
        kpi('最低缺口', shortage.toLocaleString(), '優先補足後才進入下一階段'),
        kpi('需要處理', actionRequired.toLocaleString(), '待修與待審題目')
      ),
      panel('66 卷庫存地圖', '點選書卷可直接查看該卷題目',
        h('div', { class: 'qbg-matrix' }, rows.length ? rows.map(renderBook) : h('div', { class: 'qbg-empty', text: '尚未取得書卷庫存' }))
      )
    );
  };

  const kpi = (label, value, note) => h('div', { class: 'qbg-kpi' },
    h('div', { class: 'qbg-kpi-label', text: label }), h('div', { class: 'qbg-kpi-value', text: value }), h('div', { class: 'qbg-kpi-note', text: note })
  );

  const renderBook = row => {
    const percent = Math.min(100, Math.round((row.playable / Math.max(1, row.target)) * 100));
    const tone = percent >= 100 ? '' : percent >= 50 ? 'warn' : 'bad';
    return h('button', { class: 'qbg-book', onclick: () => { state.filters.book = row.book; switchTab('questions'); loadQuestions(); } },
      h('div', { class: 'qbg-book-top' }, h('span', { text: row.book }), h('span', { text: `${row.playable}/${row.target}` })),
      h('div', { class: `qbg-progress ${tone}` }, h('span', { style: `width:${percent}%` })),
      h('div', { class: 'qbg-book-meta' }, h('span', { text: row.shortage ? `缺 ${row.shortage} 題` : '已達標' }), h('span', { text: `待處理 ${Number(row.stateCounts?.SUSPENDED || 0) + Number(row.stateCounts?.IN_REVIEW || 0)}` }))
    );
  };

  const panel = (title, hint, content, actions = null) => h('section', { class: 'qbg-panel' },
    h('div', { class: 'qbg-panel-head' }, h('div', {}, h('h2', { class: 'qbg-panel-title', text: title }), h('p', { class: 'qbg-panel-hint', text: hint })), actions || h('span')),
    content
  );

  const renderQueue = () => panel('需要處理的題目', '已停用、待審查與草稿會集中在這裡',
    state.loading ? h('div', { class: 'qbg-loading', text: '讀取待辦中…' })
      : state.queue.length ? questionTable(state.queue) : h('div', { class: 'qbg-empty', text: '目前沒有需要處理的題目' }),
    h('button', { class: 'qbg-btn', onclick: loadQueue, text: '重新整理' })
  );

  const renderQuestions = () => panel('題目庫', '日常只顯示辨識所需資訊，點選題目查看完整證據與歷史',
    h('div', {}, renderFilters(), state.loading ? h('div', { class: 'qbg-loading', text: '讀取題目中…' }) : questionTable(state.questions), renderPagination()),
    h('button', { class: 'qbg-btn', onclick: () => loadQuestions(1), text: '套用篩選' })
  );

  const renderFilters = () => h('div', { class: 'qbg-filters' },
    h('input', { class: 'qbg-input', placeholder: '搜尋題目、答案或經文…', value: state.filters.search, oninput: e => state.filters.search = e.target.value }),
    selectControl(state.filters.book, [['', '全部書卷'], ...activeRows().map(row => [row.book, row.book])], value => state.filters.book = value),
    selectControl(state.filters.state, [['', '全部狀態'], ...['PUBLISHED','IN_REVIEW','SUSPENDED','DRAFT','ARCHIVED'].map(value => [value, labels[value]])], value => state.filters.state = value),
    selectControl(state.filters.difficulty, [['', '全部難度'], ...['EASY','MEDIUM','HARD','VERY_HARD'].map(value => [value, labels[value]])], value => state.filters.difficulty = value)
  );

  const selectControl = (value, options, onchange) => {
    const select = h('select', { class: 'qbg-select', onchange: event => onchange(event.target.value) });
    options.forEach(([id, label]) => select.append(h('option', { value: id, text: label, selected: value === id })));
    return select;
  };

  const questionTable = rows => {
    if (!rows?.length) return h('div', { class: 'qbg-empty', text: '找不到符合條件的題目' });
    return h('div', { class: 'qbg-table-wrap' }, h('table', { class: 'qbg-table' },
      h('thead', {}, h('tr', {}, ['狀態','經文','題型','題目','難度','更新時間'].map(text => h('th', { text })))),
      h('tbody', {}, rows.map(item => h('tr', { onclick: () => openQuestion(item.id) },
        h('td', {}, h('span', { class: `qbg-state ${item.publicationState}`, text: labels[item.publicationState] || item.publicationState || '未分類' })),
        h('td', { text: `${item.book || ''} ${item.verseRef || ''}`.trim() }),
        h('td', { text: item.category || '—' }),
        h('td', { class: 'qbg-question', text: item.question || '—' }),
        h('td', { text: labels[item.difficultyBand] || item.difficultyBand || '—' }),
        h('td', { class: 'qbg-muted', text: item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('zh-TW') : '—' })
      )))
    ));
  };

  const renderPagination = () => {
    if (!state.pagination) return h('span');
    return h('div', { class: 'qbg-panel-head' },
      h('span', { class: 'qbg-panel-hint', text: `共 ${state.pagination.total} 題・第 ${state.pagination.page}/${state.pagination.totalPages} 頁` }),
      h('div', { class: 'qbg-actions' },
        h('button', { class: 'qbg-btn', disabled: state.pagination.page <= 1, onclick: () => loadQuestions(state.pagination.page - 1), text: '上一頁' }),
        h('button', { class: 'qbg-btn', disabled: state.pagination.page >= state.pagination.totalPages, onclick: () => loadQuestions(state.pagination.page + 1), text: '下一頁' })
      )
    );
  };

  const openQuestion = async id => {
    try {
      const payload = await api(`/api/admin/question-bank/questions/${encodeURIComponent(id)}`);
      const q = payload.question;
      const modal = h('div', { class: 'qbg-modal', onclick: event => { if (event.target === modal) modal.remove(); } },
        h('article', { class: 'qbg-modal-card' },
          h('div', { class: 'qbg-modal-head' },
            h('div', {}, h('span', { class: `qbg-state ${q.publicationState}`, text: labels[q.publicationState] || q.publicationState }), h('h2', { class: 'qbg-panel-title', text: q.question })),
            h('button', { class: 'qbg-btn', onclick: () => modal.remove(), text: '關閉' })
          ),
          h('div', { class: 'qbg-modal-body' },
            h('dl', { class: 'qbg-detail-grid' },
              h('dt', { text: '譯本' }), h('dd', { text: q.canonicalVersion }),
              h('dt', { text: '經文位置' }), h('dd', { text: `${q.book} ${q.verseRef || ''}` }),
              h('dt', { text: '正確答案' }), h('dd', { text: q.answer }),
              h('dt', { text: '題型／難度' }), h('dd', { text: `${q.category || '—'}／${labels[q.difficultyBand] || q.difficultyBand || '—'}` }),
              h('dt', { text: '來源' }), h('dd', { text: q.source || '—' }),
              h('dt', { text: '狀態原因' }), h('dd', { text: q.publicationStateReason || '—' })
            ),
            h('section', { class: 'qbg-section' }, h('h3', { text: '證據與說明' }), h('p', { text: q.evidenceQuote || q.evidence || q.explanation || '尚無說明' })),
            h('section', { class: 'qbg-section' }, h('h3', { text: '治理紀錄' }), h('p', { class: 'qbg-muted', text: `${payload.revisions.length} 個修訂版本・${payload.audits.length} 次品質稽核・${payload.checks.length} 個分項檢查` })),
            h('div', { class: 'qbg-actions qbg-section' },
              h('button', { class: 'qbg-btn amber', onclick: () => questionAction(id, 'recheck', modal), text: '重新檢查' }),
              q.publicationState !== 'SUSPENDED' && h('button', { class: 'qbg-btn danger', onclick: () => questionAction(id, 'suspend', modal), text: '停止使用' }),
              q.publicationState === 'SUSPENDED' && h('button', { class: 'qbg-btn primary', onclick: () => questionAction(id, 'publish', modal), text: '恢復發布' }),
              h('button', { class: 'qbg-btn', onclick: () => questionAction(id, 'archive', modal), text: '封存' })
            )
          )
        )
      );
      document.body.append(modal);
    } catch (error) { toast(`無法讀取題目：${error.message}`); }
  };

  const questionAction = async (id, action, modal) => {
    if (['suspend','archive'].includes(action) && !confirm(action === 'archive' ? '確定封存這題嗎？' : '確定立即停止使用這題嗎？')) return;
    try {
      await api(`/api/admin/question-bank/questions/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify({ reason: '管理中心操作' }) });
      modal.remove(); toast(action === 'recheck' ? '已加入重新檢查佇列' : '題目狀態已更新');
      state.questions = []; state.queue = []; await loadInitial();
    } catch (error) { toast(`操作失敗：${error.message}`); }
  };

  const renderReplenishment = () => {
    const rows = activeRows();
    return panel('自動補題中心', '只使用免費金鑰；完整經文庫、遊戲狀態及飽和條件都會先檢查',
      h('div', { class: 'qbg-policy-grid' },
        h('div', { class: 'qbg-policy-side' },
          h('div', { class: `qbg-pill ${activeCorpus()?.ready ? 'good' : 'warn'}`, text: activeCorpus()?.ready ? '經文庫可出題' : '經文庫暫停出題' }),
          h('p', { class: 'qbg-panel-hint', text: '選擇書卷後可啟動單卷補題；全站巡航依創世記至啟示錄順序推進。' }),
          h('label', { class: 'qbg-field' }, h('span', { text: '書卷' }), selectControl('', [['', '請選擇'], ...rows.map(row => [row.book, `${row.book}（缺 ${row.shortage}）`])], value => state.replenishmentBook = value)),
          h('button', { class: 'qbg-btn primary', disabled: !activeCorpus()?.ready, onclick: startReplenishment, text: '開始單卷免費補題' })
        ),
        h('div', { class: 'qbg-policy-main', id: 'qbg-replenishment-status' }, h('div', { class: 'qbg-loading', text: '讀取補題狀態中…' }))
      )
    );
  };

  const loadReplenishment = async () => {
    try {
      const payload = await api('/api/admin/question-bank/replenishment/status');
      const target = document.getElementById('qbg-replenishment-status');
      if (!target) return;
      const service = payload.service || {};
      const run = payload.targeted || {};
      target.replaceChildren(
        h('h3', { class: 'qbg-panel-title', text: run.state === 'running' ? '單卷補題執行中' : '補題服務狀態' }),
        h('p', { class: 'qbg-panel-hint', text: run.message || '目前待命' }),
        h('div', { class: 'qbg-impact', text: `全站目標 ${service.globalPlan?.targetCount || 15} 題｜本次啟動已入庫 ${service.totalStoredThisSession || 0} 題｜上次巡航 ${service.lastPulseAt ? new Date(service.lastPulseAt).toLocaleString('zh-TW') : '尚未執行'}` }),
        h('p', { class: 'qbg-panel-hint', text: `單卷批次 ${run.completedBatches || 0}/${run.maxBatches || 0}・通過 ${run.stored || 0}・淘汰 ${run.rejected || 0}` })
      );
    } catch (error) { toast(`補題狀態讀取失敗：${error.message}`); }
  };

  const startReplenishment = async () => {
    if (!state.replenishmentBook) return toast('請先選擇書卷');
    if (!confirm(`確定為「${state.replenishmentBook}」啟動免費補題嗎？`)) return;
    try {
      await api('/api/admin/patrol/targeted/start', {
        method: 'POST',
        body: JSON.stringify({ book: state.replenishmentBook, version: bankToStorage[state.activeVersion] || state.activeVersion, maxBatches: 12, freeOnly: true })
      });
      toast('已啟動，達標或遇到安全條件時會自動暫停'); loadReplenishment();
    } catch (error) { toast(`無法啟動：${error.message}`); }
  };

  const renderPolicy = () => panel('規則設定', '目前顯示譯本層設定；預覽不會改變正式環境',
    h('div', { class: 'qbg-policy-grid' },
      h('div', { class: 'qbg-policy-side' },
        h('label', { class: 'qbg-field' }, h('span', { text: '第一階段最低題數' }), h('input', { id: 'qbg-policy-target', class: 'qbg-input', type: 'number', min: 1, value: 15 })),
        h('label', { class: 'qbg-field' }, h('span', { text: '每次最高批數' }), h('input', { id: 'qbg-policy-batch', class: 'qbg-input', type: 'number', min: 1, max: 12, value: 12 })),
        h('label', { class: 'qbg-field' }, h('span', { text: '題型策略' }), selectControl('AUTO_BALANCE', [['AUTO_BALANCE','自動補最缺類型'],['CUSTOM_WEIGHTS','自訂比例']], value => state.policyCategoryMode = value)),
        h('button', { class: 'qbg-btn amber', onclick: previewPolicy, text: '預覽影響' })
      ),
      h('div', { class: 'qbg-policy-main', id: 'qbg-policy-result' }, h('div', { class: 'qbg-loading', text: '正在讀取有效規則…' }))
    )
  );

  const loadPolicy = async () => {
    try {
      const [payload, historyPayload] = await Promise.all([
        api(`/api/admin/question-bank/policies/effective?version=${encodeURIComponent(state.activeVersion)}`),
        api(`/api/admin/question-bank/policies/history?version=${encodeURIComponent(state.activeVersion)}&limit=8`)
      ]);
      const policy = payload.policy || {};
      const history = historyPayload.policies || [];
      const targetInput = document.getElementById('qbg-policy-target');
      const batchInput = document.getElementById('qbg-policy-batch');
      if (targetInput) targetInput.value = policy.milestones?.[0] || 15;
      if (batchInput) batchInput.value = policy.batchLimit || 12;
      const result = document.getElementById('qbg-policy-result');
      if (result) result.replaceChildren(
        h('h3', { class: 'qbg-panel-title', text: '目前有效規則' }),
        h('div', { class: 'qbg-impact', text: `里程碑 ${(policy.milestones || []).join(' → ')}，之後每次增加 ${policy.milestoneIncrement || 50} 題；難度比例 ${Object.entries(policy.difficultyRatios || {}).map(([key,value]) => `${labels[key] || key} ${value}`).join('、')}` }),
        h('section', { class: 'qbg-section' },
          h('h3', { text: '版本紀錄' }),
          history.length ? h('div', { class: 'qbg-history' }, history.map(item =>
            h('div', { class: 'qbg-history-row' },
              h('div', {}, h('strong', { text: `第 ${item.revision} 版${item.isActive ? '（目前）' : ''}` }), h('div', { class: 'qbg-muted', text: `${item.createdBy || 'admin'}・${item.createdAt ? new Date(item.createdAt).toLocaleString('zh-TW') : ''}` })),
              h('button', { class: 'qbg-btn', disabled: item.isActive, onclick: () => rollbackPolicy(item.id), text: item.isActive ? '使用中' : '還原此版' })
            )
          )) : h('p', { class: 'qbg-muted', text: '尚無自訂版本；目前使用系統預設值。' })
        )
      );
    } catch (error) {
      const result = document.getElementById('qbg-policy-result');
      if (result) result.replaceChildren(h('div', { class: 'qbg-error', text: `無法讀取規則：${error.message}` }));
    }
  };

  const rollbackPolicy = async id => {
    if (!confirm('確定還原此版本嗎？目前設定仍會保留在歷史紀錄中。')) return;
    try {
      await api(`/api/admin/question-bank/policies/${encodeURIComponent(id)}/rollback`, { method: 'POST', body: '{}' });
      toast('已還原規則版本'); await loadInitial(); switchTab('policy');
    } catch (error) { toast(`無法還原：${error.message}`); }
  };

  const previewPolicy = async () => {
    try {
      const first = Math.max(1, Number(document.getElementById('qbg-policy-target')?.value || 15));
      const batchLimit = Math.min(12, Math.max(1, Number(document.getElementById('qbg-policy-batch')?.value || 12)));
      const milestones = [...new Set([first, 30, 50, 100].filter(value => value >= first))].sort((a, b) => a - b);
      const payload = await api('/api/admin/question-bank/policies/preview', {
        method: 'POST', body: JSON.stringify({ scopeType: 'VERSION', versionId: state.activeVersion, config: { milestones, batchLimit, categoryMode: state.policyCategoryMode || 'AUTO_BALANCE' } })
      });
      const { success, previewToken, ...preview } = payload;
      state.policyPreview = { preview, previewToken };
      const target = document.getElementById('qbg-policy-result');
      target?.replaceChildren(
        h('h3', { class: 'qbg-panel-title', text: '預覽結果' }),
        h('div', { class: 'qbg-impact', text: `影響 ${preview.impact.affectedQuestions} 題、${preview.impact.groups} 個書卷群組；估計最低缺口 ${preview.impact.estimatedMinimumShortage} 題。此預覽尚未生效。` }),
        h('div', { class: 'qbg-actions qbg-section' }, h('button', { class: 'qbg-btn primary', onclick: applyPolicy, text: '確認並立即生效' }))
      );
    } catch (error) { toast(`無法預覽：${error.message}`); }
  };

  const applyPolicy = async () => {
    if (!state.policyPreview || !confirm('確定套用這項規則嗎？系統會保留舊版本供還原。')) return;
    try {
      await api('/api/admin/question-bank/policies/apply', { method: 'POST', body: JSON.stringify(state.policyPreview) });
      state.policyPreview = null; toast('規則已生效並保存版本'); await loadInitial(); switchTab('policy');
    } catch (error) { toast(`無法套用：${error.message}`); }
  };

  window.addEventListener('hashchange', mount);
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
