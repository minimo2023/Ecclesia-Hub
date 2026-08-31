const XIT_WORKER_BASE_PATH = (() => {
  const path = window.location.pathname || "/";
  const match = path.match(/^(\/xit-worker)(?:\/|$)/);
  return match ? match[1] : "";
})();

function workerApiUrl(path) {
  if (window.location.protocol === "file:") {
    return `http://127.0.0.1:3105/xit-worker/api${path}`;
  }
  const isLocalDev = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isViteDevServer = ["5173", "5174"].includes(window.location.port);
  if (isLocalDev && isViteDevServer) {
    return `http://${window.location.hostname}:3105/xit-worker/api${path}`;
  }
  if (XIT_WORKER_BASE_PATH) {
    return `${XIT_WORKER_BASE_PATH}/api${path}`;
  }
  if (isLocalDev) {
    return `http://${window.location.host}/xit-worker/api${path}`;
  }
  return `/xit-worker/api${path}`;
}

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const nameInput = document.getElementById('nameInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

const greetingMsg = document.getElementById('greetingMsg');
const switchUserBtn = document.getElementById('switchUserBtn');
const cardsContainer = document.getElementById('cardsContainer');
const emptyState = document.getElementById('emptyState');

const feedbackModal = document.getElementById('feedbackModal');
const openFeedbackBtn = document.getElementById('openFeedbackBtn');
const cancelFeedbackBtn = document.getElementById('cancelFeedbackBtn');
const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
const feedbackText = document.getElementById('feedbackText');
const feedbackError = document.getElementById('feedbackError');

// State
let userName = localStorage.getItem('xit_worker_name') || '';
let scheduleState = null;
let myServices = [];

function isNameMatch(canonicalName, inputName) {
  if (!canonicalName || !inputName) return false;
  if (canonicalName === inputName) return true;
  if (canonicalName.endsWith(inputName) && inputName.length >= 2) return true;
  if (inputName.endsWith(canonicalName) && canonicalName.length >= 2) return true;
  return false;
}

// Return today's date as YYYY-MM-DD in local time
function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Initialize
function init() {
  if (userName) {
    showDashboard();
  } else {
    showLogin();
  }
}

// Show Login
function showLogin() {
  loginScreen.style.display = 'flex';
  dashboardScreen.style.display = 'none';
}

// Show Dashboard
function showDashboard() {
  loginScreen.style.display = 'none';
  dashboardScreen.style.display = 'flex';
  greetingMsg.textContent = `嗨，你好，${userName}`;
  loadSchedule();
}

function clearCurrentUser() {
  localStorage.removeItem('xit_worker_name');
  userName = '';
  scheduleState = null;
  myServices = [];
  cardsContainer.innerHTML = '';
  emptyState.style.display = 'none';
  feedbackModal.style.display = 'none';
  nameInput.value = '';
  loginError.style.display = 'none';
  showLogin();
  nameInput.focus();
}

switchUserBtn.addEventListener('click', () => {
  if (!confirm('確定要切換使用者嗎？')) return;
  clearCurrentUser();
});

// Login Logic — 同時比對本名與暱稱
loginBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) {
    loginError.textContent = '請輸入名字';
    loginError.style.display = 'block';
    return;
  }

  try {
    loginBtn.disabled = true;
    loginBtn.textContent = '驗證中...';

    const res = await fetch(workerApiUrl('/people-state'), { cache: 'no-store' });
    if (!res.ok) throw new Error(`People API returned ${res.status}`);
    const peopleState = await res.json();
    const peopleList = peopleState.people || [];

    const matchedPerson = peopleList.find(p => {
      const pName = typeof p === 'string' ? p : (p.name || '');
      const pNickname = typeof p === 'object' ? (p.nickname || '') : '';
      return isNameMatch(pName, name) || (pNickname && isNameMatch(pNickname, name));
    });

    if (matchedPerson) {
      const canonicalName = typeof matchedPerson === 'string' ? matchedPerson : matchedPerson.name;
      localStorage.setItem('xit_worker_name', canonicalName);
      userName = canonicalName;
      loginError.style.display = 'none';
      showDashboard();
    } else {
      loginError.textContent = '找不到此同工，請確認名字或暱稱是否有誤';
      loginError.style.display = 'block';
    }
  } catch (err) {
    console.error('Login error:', err);
    loginError.textContent = err instanceof TypeError
      ? '連線失敗，請檢查網路後再試'
      : '姓名驗證暫時無法使用，請稍後再試';
    loginError.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = '登入';
  }
});

async function loadTodayAttendance() {
  if (!scheduleState) return;
  scheduleState.attendanceRecords = {};
  try {
    const today = todayLocal();
    const scheduleId = scheduleState.activePeriods?.main?.id;
    if (!scheduleId) return;
    const response = await fetch(
      workerApiUrl(
        `/attendance?scheduleId=${encodeURIComponent(scheduleId)}`
        + `&start=${encodeURIComponent(today)}&end=${encodeURIComponent(today)}`
      ),
      { cache: 'no-store' }
    );
    if (!response.ok) return;
    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : (payload.data || []);
    for (const record of records) {
      const date = record.date || record.service_date;
      if (date) scheduleState.attendanceRecords[date] = record;
    }
  } catch (error) {
    console.error('Error loading attendance:', error);
  }
}

// Load Schedule
async function loadSchedule() {
  try {
    const res = await fetch(workerApiUrl('/mobile/current-schedule'), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch schedule');
    const payload = await res.json();
    scheduleState = payload.state || {};
    scheduleState.activePeriods = payload.periods || { main: null, children: null };
    await loadTodayAttendance();

    const periodMsg = document.getElementById('periodMsg');
    const dates = scheduleState.dates || [];
    if (dates.length > 0) {
      const [y1, m1] = dates[0].split('-');
      const [y2, m2] = dates[dates.length - 1].split('-');
      const month1 = parseInt(m1, 10);
      const month2 = parseInt(m2, 10);
      if (y1 === y2) {
        periodMsg.textContent = month1 === month2
          ? `以下是 ${y1}年 ${month1}月 服事表：`
          : `以下是 ${y1}年 ${month1}~${month2}月 服事表：`;
      } else {
        periodMsg.textContent = `以下是 ${y1}年${month1}月 ~ ${y2}年${month2}月 服事表：`;
      }
    }

    renderCards();
    checkAttendanceButton();
  } catch (err) {
    console.error('Error loading schedule:', err);
    cardsContainer.innerHTML = '<p class="error-msg">載入失敗，請稍後再試</p>';
  }
}

// Render Cards
function renderCards() {
  if (!scheduleState || !scheduleState.assignments) return;

  const assignments = scheduleState.assignments;
  myServices = [];

  for (const key in assignments) {
    const person = assignments[key];
    if (isNameMatch(person, userName)) {
      const parts = key.split('__');
      if (parts.length === 2) {
        myServices.push({ date: parts[0], role: parts[1] });
      }
    }
  }

  myServices.sort((a, b) => a.date.localeCompare(b.date));
  cardsContainer.innerHTML = '';

  if (myServices.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    myServices.forEach(s => {
      const card = document.createElement('div');
      card.className = 'service-card';

      const dateParts = s.date.split('-');
      const dateText = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : s.date;

      let gcalLink = '#';
      if (dateParts.length === 3) {
        const y = dateParts[0];
        const m = dateParts[1].padStart(2, '0');
        const d = dateParts[2].padStart(2, '0');
        const startDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        startDate.setDate(startDate.getDate() + 1);
        const endDateStr = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}${String(startDate.getDate()).padStart(2, '0')}`;
        gcalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(s.role)}&dates=${y}${m}${d}/${endDateStr}&details=${encodeURIComponent('西屯禮拜堂服事')}`;
      }

      let conflictMsg = null;
      if (scheduleState.ruleMemos) {
        for (const memo of scheduleState.ruleMemos) {
          if (!memo.parsedRules) continue;
          for (const rule of memo.parsedRules) {
            if (rule.type !== 'unavailable') continue;
            if (!isNameMatch(rule.person, userName)) continue;
            if (rule.role && rule.role !== s.role) continue;
            if (rule.date && rule.date === s.date) {
              conflictMsg = rule.reason || '已設定此日不可排';
            } else if (rule.dateRange?.start && rule.dateRange?.end) {
              if (s.date >= rule.dateRange.start && s.date <= rule.dateRange.end) {
                conflictMsg = rule.reason || '已設定此期間不可排';
              }
            }
          }
        }
      }

      const conflictHtml = conflictMsg
        ? `<div style="color: var(--danger-600); font-size: 12px; margin-top: 6px; font-weight: 500; display: flex; align-items: center; gap: 4px;">⚠️ ${conflictMsg}</div>`
        : '';

      card.innerHTML = `
        <div class="card-info">
          <div class="card-date">${dateText}</div>
          <div class="card-role">${s.role}</div>
          ${conflictHtml}
        </div>
        <a href="${gcalLink}" target="_blank" class="add-calendar-btn" title="加入行事曆">➕</a>
      `;
      cardsContainer.appendChild(card);
    });
  }
}

// Show/hide attendance button based on whether user has 招待 service today
function checkAttendanceButton() {
  const btn = document.getElementById('openAttendanceBtn');
  if (!btn) return;
  const today = todayLocal();
  const hasUsherToday = myServices.some(s => s.date === today && s.role.includes('招待'));
  btn.style.display = hasUsherToday ? 'flex' : 'none';

  // Pre-fill existing counts if already entered
  if (hasUsherToday) {
    const physEl = document.getElementById('physicalCount');
    const onlEl = document.getElementById('onlineCount');
    const record = scheduleState?.attendanceRecords?.[today] || {};
    if (physEl) {
      physEl.value = record.physical_count !== undefined
        && record.physical_count !== null
        ? String(record.physical_count)
        : '';
    }
    if (onlEl) {
      onlEl.value = record.online_count !== undefined
        && record.online_count !== null
        ? String(record.online_count)
        : '';
    }
  }
}

// Feedback Modal Logic
openFeedbackBtn.addEventListener('click', () => {
  feedbackText.value = '';
  feedbackError.style.display = 'none';
  feedbackModal.style.display = 'flex';
});

cancelFeedbackBtn.addEventListener('click', () => {
  feedbackModal.style.display = 'none';
});

submitFeedbackBtn.addEventListener('click', async () => {
  let text = feedbackText.value.trim();
  if (!text) {
    feedbackError.textContent = '請輸入回饋內容';
    feedbackError.style.display = 'block';
    return;
  }

  const assignedRoles = Array.from(new Set(myServices.map(s => s.role)));
  if (assignedRoles.length > 0) {
    const hasRole = assignedRoles.some(role => text.includes(role));
    if (!hasRole) {
      const rolePromptSection = document.getElementById('rolePromptSection');
      const rolePromptOptions = document.getElementById('rolePromptOptions');
      if (rolePromptSection.style.display === 'none') {
        rolePromptOptions.innerHTML = '';
        assignedRoles.forEach(role => {
          const label = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = role;
          label.appendChild(cb);
          label.appendChild(document.createTextNode(role));
          rolePromptOptions.appendChild(label);
        });
        rolePromptSection.style.display = 'block';
        feedbackError.textContent = '';
        feedbackError.style.display = 'none';
        return;
      } else {
        const checked = Array.from(rolePromptOptions.querySelectorAll('input:checked')).map(cb => cb.value);
        if (checked.length === 0) {
          feedbackError.textContent = '請至少勾選一項服事，或直接寫在留言中。';
          feedbackError.style.display = 'block';
          return;
        }
        text += `\n[服事項目: ${checked.join(', ')}]`;
        rolePromptSection.style.display = 'none';
      }
    }
  }

  const messageWithPerson = `同工：${userName}\n${text}`;
  try {
    submitFeedbackBtn.disabled = true;
    submitFeedbackBtn.textContent = '傳送中...';
    const res = await fetch(workerApiUrl('/feedbacks'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person: userName, sections: ['main'], dates: '未指定', message: messageWithPerson })
    });
    if (!res.ok) throw new Error('Failed to submit feedback');
    const feedbackSuccess = document.getElementById('feedbackSuccess');
    if (feedbackSuccess) {
      feedbackSuccess.style.display = 'block';
      feedbackSuccess.textContent = '✅ 已收到您的回饋，等待管理者確認。';
    }
    setTimeout(() => {
      feedbackModal.style.display = 'none';
      submitFeedbackBtn.disabled = false;
      submitFeedbackBtn.textContent = '送出';
      if (feedbackSuccess) feedbackSuccess.style.display = 'none';
      document.getElementById('rolePromptSection').style.display = 'none';
    }, 2000);
  } catch (err) {
    console.error('Submit feedback error:', err);
    feedbackError.textContent = '傳送失敗，請稍後再試';
    feedbackError.style.display = 'block';
    submitFeedbackBtn.disabled = false;
    submitFeedbackBtn.textContent = '重新送出';
  }
});

// Attendance Modal Logic
const openAttendanceBtn = document.getElementById('openAttendanceBtn');
const attendanceModal = document.getElementById('attendanceModal');
const cancelAttendanceBtn = document.getElementById('cancelAttendanceBtn');
const submitAttendanceBtn = document.getElementById('submitAttendanceBtn');

if (openAttendanceBtn) {
  openAttendanceBtn.addEventListener('click', () => {
    document.getElementById('attendanceError').style.display = 'none';
    document.getElementById('attendanceSuccess').style.display = 'none';
    const today = todayLocal();
    const todayDisplay = today.slice(5).replace('-', '/');
    const todayService = myServices.find(s => s.date === today && s.role.includes('招待'));
    const subtitle = document.getElementById('attendanceSubtitle');
    if (subtitle) subtitle.textContent = `${todayDisplay}（今天）· ${todayService ? todayService.role : '招待'}`;
    attendanceModal.style.display = 'flex';
  });
}

if (cancelAttendanceBtn) {
  cancelAttendanceBtn.addEventListener('click', () => {
    attendanceModal.style.display = 'none';
  });
}

if (submitAttendanceBtn) {
  submitAttendanceBtn.addEventListener('click', async () => {
    const physVal = document.getElementById('physicalCount').value.trim();
    const onlVal = document.getElementById('onlineCount').value.trim();
    const errEl = document.getElementById('attendanceError');
    const sucEl = document.getElementById('attendanceSuccess');

    if (physVal === '' && onlVal === '') {
      errEl.textContent = '請至少填寫實體人數或線上人數。';
      errEl.style.display = 'block';
      return;
    }

    const today = todayLocal();
    const body = { person: userName, date: today };
    if (physVal !== '') body.physical_count = Number(physVal);
    if (onlVal !== '') body.online_count = Number(onlVal);

    submitAttendanceBtn.disabled = true;
    submitAttendanceBtn.textContent = '送出中...';
    errEl.style.display = 'none';

    try {
      const res = await fetch(workerApiUrl('/mobile/attendance'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '登記失敗');

      sucEl.textContent = '✅ 人數已登記成功！';
      sucEl.style.display = 'block';
      if (scheduleState) {
        scheduleState.attendanceRecords = scheduleState.attendanceRecords || {};
        scheduleState.attendanceRecords[today] = data.record || {
          date: today,
          physical_count: physVal === '' ? null : Number(physVal),
          online_count: onlVal === '' ? null : Number(onlVal)
        };
      }
      setTimeout(() => { attendanceModal.style.display = 'none'; }, 1800);
    } catch (err) {
      errEl.textContent = err.message || '登記失敗，請稍後再試。';
      errEl.style.display = 'block';
    } finally {
      submitAttendanceBtn.disabled = false;
      submitAttendanceBtn.textContent = '確認送出';
    }
  });
}

// Start app
init();
