const defaultMainRolesText = [
  "講員",
  "領會",
  "司琴",
  "配唱",
  "影音控制",
  "影音播放",
  "1F招待",
  "6F招待",
  "餅杯服事",
].join("\n");
const defaultChildrenRolesText = [
  "兒主敬拜",
  "兒主司琴",
  "兒主中小",
  "兒主大班",
].join("\n");
const fixedMainRoleNames = defaultMainRolesText.split("\n");
const fixedChildrenRoleNames = defaultChildrenRolesText.split("\n");
const defaultUnavailableText = "";
const defaultServiceDetails = [
  "司琴",
  "講員",
  "外請講員",
  "領會",
  "配唱",
  "影音控制",
  "影音播放",
  "招待",
  "餅杯服事",
  "兒主敬拜",
  "兒主司琴",
  "兒主中小",
  "兒主大班",
];
const defaultPeopleList = [];
const serviceSectionOrder = ["講員", "大堂", "招待", "餅杯", "兒主"];
const serviceSectionDetailMap = {
  "講員": ["講員", "外請講員"],
  "大堂": ["領會", "司琴", "配唱", "影音控制", "影音播放"],
  "招待": ["1F招待", "6F招待"],
  "餅杯": ["餅杯服事"],
  "兒主": ["兒主敬拜", "兒主司琴", "兒主中小", "兒主大班"],
};
const serviceSectionExcludedDetails = {
  "招待": ["招待"],
};

const state = {
  childrenRoster: {},
  dates: [],
  sectionDates: { main: [], children: [] },
  roles: [],
  assignments: {},
  locked: {},
  notes: { main: {}, children: {} },
  extraColumns: {
    children: {
      beforeBigClass: [],
      afterBigClass: [],
    },
  },
  extraValues: {},
  people: [],
  serviceDetails: [],
  ruleMemos: [],
  temporaryRules: [],
  attendanceRecords: {},
};

const clientId = crypto.randomUUID();
let remoteMode = false;
let applyingRemote = false;
let syncTimer = null;
let syncRetryTimer = null;
let activeRolePage = "main";
let periodCatalog = { main: [], children: [] };
let selectedPeriodIds = { main: null, children: null };
let selectedPeriodRecords = { main: null, children: null };
let selectedPeriodStates = { main: null, children: null };
let dirtyPeriodSections = new Set();
let periodSwitchInProgress = false;
let periodsReady = false;
let periodSavePromise = null;

let draftDirty = false;
let peopleFilter = "all";
let peopleSortKey = "name";
let peopleSortDirection = "asc";
let personModalMode = "create";
let activeAccountCode = "";
let feedbackPanelListenersReady = false;
let scheduleAbortController = null;

const accountProfiles = {
  A000: {
    label: "最高權限",
    schedule: "all",
    people: "all",
    rules: "all",
    config: "all",
  },
  A001: {
    label: "敬拜服事",
    roles: ["領會", "司琴", "配唱"],
  },
  A002: {
    label: "影音服事",
    roles: ["影音控制", "影音播放"],
  },
  A003: {
    label: "招待服事",
    roles: ["1F招待", "6F招待"],
  },
  A004: {
    label: "兒主權限",
    schedule: "children",
    people: "children",
    rules: "children",
    config: "children",
  },
};

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
    return `http://${window.location.hostname}:3105/xit-worker/api${path}`;
  }
  return `/xit-worker/api${path}`;
}

function activeAccountProfile() {
  return accountProfiles[activeAccountCode] || null;
}

function hasAdminAccess() {
  return activeAccountProfile()?.schedule === "all";
}

function selectedPeriodIsWritable(section) {
  if (!periodsReady) return true;
  return selectedPeriodRecords[section]?.status === "active";
}

function canEditRole(roleName) {
  const profile = activeAccountProfile();
  if (!profile) return false;
  const section = roleSection(roleName);
  if (!selectedPeriodIsWritable(section)) return false;
  if (profile.schedule === "all") return true;
  if (profile.schedule === "children") return section === "children";
  return Array.isArray(profile.roles) && profile.roles.includes(roleName);
}

function canEditPageSchedule(page = activeRolePage) {
  const profile = activeAccountProfile();
  if (!profile) return false;
  if ((page === "main" || page === "children") && !selectedPeriodIsWritable(page)) return false;
  if (profile.schedule === "all") return page === "main" || page === "children";
  if (profile.schedule === "children") return page === "children";
  if (page !== "main") return false;
  return Array.isArray(profile.roles) && profile.roles.length > 0;
}

function canManageSchedulePage(page = activeRolePage) {
  const profile = activeAccountProfile();
  if (!profile) return false;
  if ((page === "main" || page === "children") && !selectedPeriodIsWritable(page)) return false;
  if (profile.schedule === "all") return page === "main" || page === "children";
  if (profile.schedule === "children") return page === "children";
  return false;
}

function canEditExtraColumn() {
  return selectedPeriodIsWritable("children")
    && (activeAccountProfile()?.schedule === "all" || activeAccountProfile()?.schedule === "children");
}

function canEditNote(page = activeRolePage) {
  if ((page === "main" || page === "children") && !selectedPeriodIsWritable(page)) return false;
  if (page === "children") return false;
  const profile = activeAccountProfile();
  if (!profile) return false;
  if (profile.schedule === "all") return page === "main" || page === "children";
  if (profile.schedule === "children") return page === "children";
  return false;
}

function canManagePeople(person = null) {
  const profile = activeAccountProfile();
  if (!profile) return false;
  if (profile.people === "all") return true;
  if (profile.people === "children") {
    if (!person) return true;
    const sections = normalizePerson(person).sections;
    return sections.length === 1 && sections.includes("兒主");
  }
  return false;
}

function canManageRules(scope = activeRolePage) {
  const profile = activeAccountProfile();
  if (!profile) return false;
  if ((scope === "main" || scope === "children") && !selectedPeriodIsWritable(scope)) return false;
  if (profile.rules === "all") return true;
  if (profile.rules === "children") return scope === "children";
  return false;
}

function canViewSettingsTabs() {
  return activeAccountCode === "A000" || activeAccountCode === "A004";
}

function ensureVisibleRolePage() {
  if (!canViewSettingsTabs() && (activeRolePage === "rules" || activeRolePage === "people")) {
    activeRolePage = "main";
  }
}

function canEditConfig(page = activeRolePage) {
  const profile = activeAccountProfile();
  if (!profile) return false;
  if ((page === "main" || page === "children") && !selectedPeriodIsWritable(page)) return false;
  if (profile.config === "all") return true;
  if (profile.config === "children") return page === "children";
  return false;
}

function readonlyTitle() {
  return activeAccountCode ? "此帳號沒有此項目權限" : "請先輸入帳號套用權限";
}

function setDisabledWithTitle(element, disabled, title = readonlyTitle()) {
  if (!element) return;
  element.disabled = Boolean(disabled);
  element.title = disabled ? title : "";
}

function updateAccessUi() {
  ensureVisibleRolePage();
  const isMainOrChildren = activeRolePage === "main" || activeRolePage === "children";
  const isPeople = activeRolePage === "people";
  const isRules = activeRolePage === "rules";
  const isAnalytics = activeRolePage === "analytics";
  const isOutput = activeRolePage === "output";
  const canViewSettings = canViewSettingsTabs();
  document.body.classList.toggle("anonymous-view", !activeAccountProfile());

  document.querySelectorAll('.tab-button[data-role-page="rules"], .tab-button[data-role-page="people"]').forEach((button) => {
    button.hidden = !canViewSettings;
  });

  setDisabledWithTitle(
    el.scheduleTitle,
    !hasAdminAccess() || !selectedPeriodIsWritable(periodSectionForPage())
  );
  setDisabledWithTitle(el.periodYear, periodSwitchInProgress, "正在切換檔期");
  const controlSection = isMainOrChildren ? periodSectionForPage() : null;
  const controlPeriodId = controlSection ? periodIdFromControls(controlSection) : "";
  const controlRecord = controlPeriodId ? periodRecordById(controlPeriodId) : null;
  const controlPeriodCode = controlPeriodId.split("-").at(-1);
  const canLoadOrCreatePeriod = Boolean(controlRecord) || (
    controlSection && accountCanCreatePeriod(controlSection, controlPeriodCode)
  );
  setDisabledWithTitle(
    document.querySelector("#applyPeriodBtn"),
    !(isMainOrChildren) || periodSwitchInProgress || !canLoadOrCreatePeriod,
    periodSwitchInProgress
      ? "正在切換檔期"
      : (!canLoadOrCreatePeriod ? "此檔期尚未建立" : "")
  );
  setDisabledWithTitle(document.querySelector("#generateBtn"), !(activeRolePage === "main" && canManageSchedulePage("main")));
  setDisabledWithTitle(document.querySelector("#clearBtn"), !(isMainOrChildren && canManageSchedulePage(activeRolePage)));
  setDisabledWithTitle(el.openPersonModalBtn, !(isPeople && canManagePeople()));
  setDisabledWithTitle(el.addMainRuleBtn, !(isRules && canManageRules("main")));
  setDisabledWithTitle(el.addChildrenRuleBtn, !(isRules && canManageRules("children")));
  setDisabledWithTitle(el.clearAiPromptBtn, !(isRules && hasAdminAccess()));
  setDisabledWithTitle(el.mainFeedbackReviewBtn, false);

  if (el.unavailableInput) {
    el.unavailableInput.readOnly = !(
      isRules
      && hasAdminAccess()
      && selectedPeriodIsWritable("main")
      && selectedPeriodIsWritable("children")
    );
    el.unavailableInput.title = el.unavailableInput.readOnly ? readonlyTitle() : "";
  }

  el.periodChoices.forEach((button) => {
    button.disabled = periodSwitchInProgress;
    button.title = periodSwitchInProgress ? "正在切換檔期" : "";
  });

  if (isOutput) {
    setDisabledWithTitle(document.querySelector("#generateBtn"), true);
    setDisabledWithTitle(document.querySelector("#clearBtn"), true);
  }
}

const el = {
  layout: document.querySelector(".layout"),
  panel: document.querySelector(".panel"),
  periodYear: document.querySelector("#periodYear"),
  mainHalf: document.querySelector("#mainHalf"),
  childrenQuarter: document.querySelector("#childrenQuarter"),
  periodChoices: document.querySelectorAll(".period-choice"),
  mainPeriodControls: document.querySelector("#mainPeriodControls"),
  childrenPeriodControls: document.querySelector("#childrenPeriodControls"),
  periodHint: document.querySelector("#periodHint"),
  periodStatusBadge: document.querySelector("#periodStatusBadge"),
  openHistoryBtn: document.querySelector("#openHistoryBtn"),
  historyRevertModal: document.querySelector("#historyRevertModal"),
  historyRevertCloseBtn: document.querySelector("#historyRevertCloseBtn"),
  historyRevertSelect: document.querySelector("#historyRevertSelect"),
  revertMainOnlyBtn: document.querySelector("#revertMainOnlyBtn"),
  revertChildrenOnlyBtn: document.querySelector("#revertChildrenOnlyBtn"),
  revertAllBtn: document.querySelector("#revertAllBtn"),
  mainRolesInput: document.querySelector("#mainRolesInput"),
  childrenRolesInput: document.querySelector("#childrenRolesInput"),
  unavailableInput: document.querySelector("#unavailableInput"),
  temporaryRulesList: document.querySelector("#temporaryRulesList"),
  scheduleTitle: document.querySelector("#scheduleTitle"),
  syncStatus: document.querySelector("#syncStatus"),
  accountInput: document.querySelector("#accountInput"),
  applyAccountBtn: document.querySelector("#applyAccountBtn"),
  warnings: document.querySelector("#warnings"),
  mainGroupWarnings: document.querySelector("#mainGroupWarnings"),
  childrenGroupWarnings: document.querySelector("#childrenGroupWarnings"),
  schedulePage: document.querySelector("#schedulePage"),
  personnelPage: document.querySelector("#personnelPage"),
  personForm: document.querySelector("#personForm"),
  personId: document.querySelector("#personId"),
  personName: document.querySelector("#personName"),
  personNickname: document.querySelector("#personNickname"),
  personCategory: document.querySelector("#personCategory"),
  personDetail: document.querySelector("#personDetail"),
  personServiceMatrix: document.querySelector("#personServiceMatrix"),
  personSubmitBtn: document.querySelector("#personSubmitBtn"),
  personCancelBtn: document.querySelector("#personCancelBtn"),
  personToolbarCancelBtn: document.querySelector("#personToolbarCancelBtn"),
  openPersonModalBtn: document.querySelector("#openPersonModalBtn"),
  personModal: document.querySelector("#personModal"),
  personModalTitle: document.querySelector("#personModalTitle"),
  personMessage: document.querySelector("#personMessage"),
  peopleCount: document.querySelector("#peopleCount"),
  peopleTable: document.querySelector("#peopleTable"),
  table: document.querySelector("#scheduleTable"),
  childrenRosterContainer: document.querySelector("#childrenRosterContainer"),
  ruleModal: document.querySelector("#ruleModal"),
  ruleForm: document.querySelector("#ruleForm"),
  ruleId: document.querySelector("#ruleId"),
  ruleText: document.querySelector("#ruleText"),
  ruleRolesMatrix: document.querySelector("#ruleRolesMatrix"),
  ruleModalCancelBtn: document.querySelector("#ruleModalCancelBtn"),
  ruleModalConfirmBtn: document.querySelector("#ruleModalConfirmBtn"),
  addMainRuleBtn: document.querySelector("#addMainRuleBtn"),
  addChildrenRuleBtn: document.querySelector("#addChildrenRuleBtn"),
  mainFeedbackReviewBtn: document.querySelector("#mainFeedbackReviewBtn"),
  feedbackReviewModal: document.querySelector("#feedbackReviewModal"),
  feedbackReviewCloseBtn: document.querySelector("#feedbackReviewCloseBtn"),
  feedbackCountBadges: document.querySelectorAll("[data-feedback-count]"),
  mainRulesList: document.querySelector("#mainRulesList"),
  childrenRulesList: document.querySelector("#childrenRulesList"),
  clearAiPromptBtn: document.querySelector("#clearAiPromptBtn"),
  aiSpinner: document.querySelector("#aiSpinner"),
  addRoleModal: document.querySelector("#addRoleModal"),
  addRoleCustomWrap: document.querySelector("#addRoleCustomWrap"),
  addRoleCustomInput: document.querySelector("#addRoleCustomInput"),
  addRolePositionSelect: document.querySelector("#addRolePositionSelect"),
  addRoleConfirmBtn: document.querySelector("#addRoleConfirmBtn"),
  addRoleCancelBtn: document.querySelector("#addRoleCancelBtn"),
  peopleQuickFilters: document.querySelector("#peopleQuickFilters"),
  downloadModal: document.querySelector("#downloadModal"),
  downloadPdfBtn: document.querySelector("#downloadPdfBtn"),
  downloadJpgBtn: document.querySelector("#downloadJpgBtn"),
  downloadCloseBtn: document.querySelector("#downloadCloseBtn"),

  sidePanel: document.querySelector("#sidePanel"),
  periodHorizontalConfig: document.querySelector("#periodHorizontalConfig"),

  // 回饋面板
  openFeedbackBtn: document.querySelector("#openFeedbackBtn"),
  closeFeedbackBtn: document.querySelector("#closeFeedbackBtn"),
  feedbackPanel: document.querySelector("#feedbackPanel"),
  panelOverlay: document.querySelector("#panelOverlay"),
  feedbackList: document.querySelector("#feedbackList"),
  personSearch: document.querySelector("#personSearch"),
  personDropdown: document.querySelector("#personDropdown"),
  datesSection: document.querySelector("#datesSection"),
  messageSection: document.querySelector("#messageSection"),
  allDatesChips: document.querySelector("#allDatesChips"),
  selectedDatesList: document.querySelector("#selectedDatesList"),
  feedbackMessage: document.querySelector("#feedbackMessage"),
  submitFeedbackBtn: document.querySelector("#submitFeedbackBtn"),
  submitStatus: document.querySelector("#submitStatus"),
  dateHint: document.querySelector("#dateHint"),
  addManualDateBtn: document.querySelector("#addManualDateBtn"),
  manualDateArea: document.querySelector("#manualDateArea"),
  manualDateInput: document.querySelector("#manualDateInput"),
  manualRoleInput: document.querySelector("#manualRoleInput"),
  confirmManualDateBtn: document.querySelector("#confirmManualDateBtn"),

  // 新增：服事防呆提醒視窗
  rolePromptModal: document.querySelector("#rolePromptModal"),
  rolePromptCloseBtn: document.querySelector("#rolePromptCloseBtn"),
  rolePromptOptions: document.querySelector("#rolePromptOptions"),
  rolePromptConfirmBtn: document.querySelector("#rolePromptConfirmBtn"),
  rolePromptSkipBtn: document.querySelector("#rolePromptSkipBtn"),
  scheduleProgressModal: document.querySelector("#scheduleProgressModal"),
  scheduleProgressStage: document.querySelector("#scheduleProgressStage"),
  scheduleProgressMessage: document.querySelector("#scheduleProgressMessage"),
  scheduleProgressBar: document.querySelector("#scheduleProgressBar"),
  scheduleProgressDetails: document.querySelector("#scheduleProgressDetails"),
  scheduleProgressCancelBtn: document.querySelector("#scheduleProgressCancelBtn"),
  scheduleLogBtn: document.querySelector("#scheduleLogBtn"),
  scheduleRunLogModal: document.querySelector("#scheduleRunLogModal"),
  scheduleRunLogList: document.querySelector("#scheduleRunLogList"),
  scheduleRunLogRefreshBtn: document.querySelector("#scheduleRunLogRefreshBtn"),
  scheduleRunLogCloseBtn: document.querySelector("#scheduleRunLogCloseBtn"),
};

const panelSections = document.querySelectorAll(".panel section");
const settingsTabButton = document.querySelector('.tab-button[data-role-page="people"]');
const personnelTitle = document.querySelector("#personnelPage h2");
const personnelHint = document.querySelector("#personnelPage .hint");

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeIsoDate(value) {
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  if (match) return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
  return text;
}

function displayDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${month}月${pad(day)}日`;
}

function parsePeople(value) {
  return value
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPeopleForRole(roleName, section) {
  if (!state.people) return [];
  const mappedSection = section === "main" ? "大堂" : (section === "children" ? "兒主" : "");
  const compatibleRoleNames = roleName === "講員" || roleName === "外請講員"
    ? ["講員", "外請講員"]
    : [roleName];

  const matched = state.people.filter(rawPerson => {
    const person = normalizePerson(rawPerson);
    const sections = person.sections;
    const categories = person.categories;

    // Check if sections matches
    const matchesSection = sections.some(s => {
      if (mappedSection === "大堂") {
        return s === "大堂" || s === "講員" || s === "招待" || s === "餅杯";
      }
      return s === mappedSection;
    });

    const matchesCategory = compatibleRoleNames.some((name) => categories.includes(name));
    return matchesSection && matchesCategory;
  });

  return matched.map(p => normalizePerson(p).name);
}

function buildFixedRoles(roleNames, section) {
  return roleNames.map((name) => ({
    name,
    people: getPeopleForRole(name, section),
    section,
  }));
}

function parseRoles() {
  return [
    ...buildFixedRoles(fixedMainRoleNames, "main"),
    ...buildFixedRoles(fixedChildrenRoleNames, "children"),
  ];
}

function rolesForPage(page = activeRolePage) {
  const roles = parseRoles();
  if (page === "main" || page === "children") {
    return roles.filter((role) => role.section === page);
  }
  if (page === "output") {
    const mainRoles = roles.filter((role) => role.section === "main");
    const childrenRoles = roles.filter((role) => role.section === "children").slice(0, 4);
    return [...mainRoles, ...childrenRoles];
  }
  return roles;
}

function parseUnavailable() {
  const map = new Map();
  el.unavailableInput.value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [name, datesText = ""] = line.split(/[：:]/);
      const person = name.trim();
      parsePeople(datesText).forEach((date) => {
        const normalized = normalizeIsoDate(date);
        if (!map.has(person)) map.set(person, new Set());
        map.get(person).add(normalized);
      });
    });
  return map;
}

function roleGroup(roleName) {
  const name = String(roleName || "");
  if (name.includes("\u5152\u4e3b")) return "children";
  if (name.includes("\u8b1b\u54e1") || name.includes("\u5916\u8acb") || name.includes("\u9905\u676f")) return "speaker";
  if (name.includes("\u9818\u6703") || name.includes("\u4e3b\u9818") || name.includes("\u53f8\u7434") || name.includes("\u914d\u5531")) return "worship";
  if (name.includes("\u5f71\u97f3")) return "media";
  if (name.includes("\u62db\u5f85") || name.includes("1F") || name.includes("6F")) return "usher";
  return "worship";
}

function makeSundaysBetween(start, end) {
  const dates = [];
  const current = new Date(start);
  current.setDate(current.getDate() + ((7 - current.getDay()) % 7));
  while (current <= end) {
    dates.push(toDateInput(current));
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

function periodRange(section) {
  const year = Number(el.periodYear.value) || new Date().getFullYear();
  if (section === "main") {
    const half = Number(el.mainHalf.value);
    const startMonth = half === 1 ? 0 : 6;
    const endMonth = half === 1 ? 5 : 11;
    return {
      start: new Date(year, startMonth, 1),
      end: new Date(year, endMonth + 1, 0),
      label: `${year}年${half === 1 ? "上半年（1-6月）" : "下半年（7-12月）"}`,
    };
  }

  const quarter = Number(el.childrenQuarter.value);
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, endMonth + 1, 0),
    label: `${year}年第${["一", "二", "三", "四"][quarter - 1]}季（${startMonth + 1}-${endMonth + 1}月）`,
  };
}

function combinedDates() {
  return Array.from(new Set([...state.sectionDates.main, ...state.sectionDates.children])).sort();
}

function refreshDates() {
  state.dates = combinedDates();
}

function setSectionDates(section, dates) {
  state.sectionDates[section] = dates;
  refreshDates();
}

function applyActivePeriod() {
  if (activeRolePage === "output" || activeRolePage === "people") return;
  if (!canEditConfig(activeRolePage)) {
    alert(readonlyTitle());
    return;
  }
  const range = periodRange(activeRolePage);
  const previousDates = [...(state.sectionDates[activeRolePage] || [])];
  if (previousDates.length) return;
  const nextDates = makeSundaysBetween(range.start, range.end);
  setSectionDates(activeRolePage, nextDates);
  render();
  syncSoon();
}

function cellKey(date, roleName) {
  return `${date}__${roleName}`;
}

function roleSection(roleName) {
  return roleName.includes("兒主") ? "children" : "main";
}

function isRoleActiveOnDate(role, date) {
  return state.sectionDates[role.section || roleSection(role.name)]?.includes(date);
}

function visibleRoles() {
  return rolesForPage(activeRolePage);
}

function visibleExtraColumns() {
  const builtinColumns = {
    beforeBigClass: [{ key: "children-course-before", title: "課程" }],
    afterBigClass: [{ key: "children-course-after", title: "課程" }],
  };

  if (activeRolePage === "children") {
    const childrenColumns = state.extraColumns?.children;
    if (Array.isArray(childrenColumns)) {
      return {
        beforeBigClass: [
          ...builtinColumns.beforeBigClass,
          ...childrenColumns.map((title) => ({ key: title, title })),
        ],
        afterBigClass: [...builtinColumns.afterBigClass],
      };
    }
    return {
      beforeBigClass: [
        ...builtinColumns.beforeBigClass,
        ...(Array.isArray(childrenColumns?.beforeBigClass) ? childrenColumns.beforeBigClass : []).map((title) => ({ key: title, title })),
      ],
      afterBigClass: [
        ...builtinColumns.afterBigClass,
        ...(Array.isArray(childrenColumns?.afterBigClass) ? childrenColumns.afterBigClass : []).map((title) => ({ key: title, title })),
      ],
    };
  }
  return {
    beforeBigClass: [],
    afterBigClass: [],
  };
}

function orderedVisibleColumns() {
  const roles = visibleRoles();
  const extraColumns = visibleExtraColumns();

  if (activeRolePage !== "children" || (!extraColumns.beforeBigClass.length && !extraColumns.afterBigClass.length)) {
    return [
      ...roles.map((role) => ({ type: "role", role })),
      ...extraColumns.beforeBigClass.map((column) => ({ type: "extra", key: column.key, title: column.title })),
      ...extraColumns.afterBigClass.map((column) => ({ type: "extra", key: column.key, title: column.title })),
    ];
  }

  const middleIndex = roles.findIndex((role) => role.name.includes("兒主中小"));
  const bigClassIndex = roles.findIndex((role) => role.name.includes("兒主大班"));
  if (middleIndex === -1 || bigClassIndex === -1) {
    return [
      ...roles.map((role) => ({ type: "role", role })),
      ...extraColumns.beforeBigClass.map((title) => ({ type: "extra", title })),
      ...extraColumns.afterBigClass.map((title) => ({ type: "extra", title })),
    ];
  }

  return [
    ...roles.slice(0, middleIndex + 1).map((role) => ({ type: "role", role })),
    ...extraColumns.beforeBigClass.map((column) => ({ type: "extra", key: column.key, title: column.title })),
    ...roles.slice(middleIndex + 1, bigClassIndex + 1).map((role) => ({ type: "role", role })),
    ...extraColumns.afterBigClass.map((column) => ({ type: "extra", key: column.key, title: column.title })),
    ...roles.slice(bigClassIndex + 1).map((role) => ({ type: "role", role })),
  ];
}

function visibleDates() {
  if (activeRolePage === "output") return state.dates;
  return state.sectionDates[activeRolePage] || [];
}

function isColumnFullyLocked(roleName) {
  const dates = visibleDates();
  if (!dates.length) return false;
  return dates.every((date) => Boolean(state.locked[cellKey(date, roleName)]));
}

async function setCellLocksRemote(section, updates) {
  const period = selectedPeriodRecords[section];
  if (!period || period.status !== "active") {
    throw new Error("歷史檔期不能變更鎖定");
  }
  await flushPendingPeriodSave();
  const response = await fetch(
    workerApiUrl(`/schedule-periods/${encodeURIComponent(period.id)}/cell-lock`),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
        "X-Account-Code": activeAccountCode
      },
      body: JSON.stringify({
        baseRevision: selectedPeriodRecords[section].revision,
        cells: updates
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "鎖定變更失敗");
  selectedPeriodRecords[section] = payload.period;
  selectedPeriodStates[section] = payload.period?.state || {};
  applySelectedPeriodWorkspace();
}

async function toggleColumnLock(roleName) {
  const dates = visibleDates();
  if (!dates.length) return;
  const shouldLock = !isColumnFullyLocked(roleName);
  await setCellLocksRemote(
    roleSection(roleName),
    dates.map((date) => ({
      cellKey: cellKey(date, roleName),
      locked: shouldLock
    }))
  );
}

function extraColumnKey(date, column) {
  const key = typeof column === "string" ? column : (column?.key || column?.title || "");
  return `${date}__extra__${key}`;
}

function isChildrenPianoRole(roleName) {
  return roleName.includes("兒主") && roleName.includes("司琴");
}

function isChildrenWorshipRole(roleName) {
  return roleName.includes("兒主") && roleName.includes("敬拜");
}

function isChildrenCourseRole(roleName) {
  return roleSection(roleName) === "children" && roleName.includes("課程");
}

function isChildrenPianoException(firstRole, secondRole) {
  const pair = [firstRole, secondRole];
  const pianoRole = pair.find((roleName) => isChildrenPianoRole(roleName));
  const otherRole = pair.find((roleName) => roleName !== pianoRole);
  if (!pianoRole || !otherRole) return false;
  if (isChildrenCourseRole(otherRole)) return true;
  return roleSection(otherRole) === "children"
    && !isChildrenWorshipRole(otherRole)
    && !isChildrenPianoRole(otherRole);
}

function isSpeakerRole(roleName) {
  return roleName.includes("講員");
}

function isPianoRole(roleName) {
  return roleName.includes("司琴");
}

function violatesExclusiveRoleRule(existingRoles, nextRoleName) {
  if (!existingRoles.length) return false;

  const isCrossSection = existingRoles.some(roleName => roleSection(roleName) !== roleSection(nextRoleName));
  if (isCrossSection) {
    if (isPianoRole(nextRoleName) || existingRoles.some(roleName => isPianoRole(roleName))) {
      const violating = existingRoles.some(roleName => {
        if (roleSection(roleName) === roleSection(nextRoleName)) return false;
        return !isChildrenPianoException(roleName, nextRoleName);
      });
      if (violating) return true;
    } else {
      return true;
    }
  }

  if (isSpeakerRole(nextRoleName) || existingRoles.some(roleName => isSpeakerRole(roleName))) return true;

  // 兒主同區允許
  if (roleSection(nextRoleName) === "children" && existingRoles.every(r => roleSection(r) === "children")) {
    return false;
  }

  // 大堂同區一律一個蘿蔔一個坑
  return true;
}

function getAssignedRolesForPersonOnDate(date, person, sectionFilter = null) {
  return parseRoles()
    .filter((role) => isRoleActiveOnDate(role, date))
    .filter((role) => !sectionFilter || role.section === sectionFilter)
    .filter((role) => state.assignments[cellKey(date, role.name)] === person)
    .map((role) => role.name);
}

function hasDisallowedDuplicate(roles) {
  const childrenRoles = roles.filter(r => roleSection(r) === "children");
  if (childrenRoles.length > 2) return true;

  for (let firstIndex = 0; firstIndex < roles.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < roles.length; secondIndex += 1) {
      const firstRole = roles[firstIndex];
      const secondRole = roles[secondIndex];

      // 跨區判斷
      if (roleSection(firstRole) !== roleSection(secondRole)) {
        if (isPianoRole(firstRole) || isPianoRole(secondRole)) {
          if (isChildrenPianoException(firstRole, secondRole)) continue;
        }
        return true;
      }

      // 兒主同區允許（前面已檢查數量限制）
      if (roleSection(firstRole) === "children" && roleSection(secondRole) === "children") {
        continue;
      }

      // 大堂同區一律一個蘿蔔一個坑
      return true;
    }
  }
  return false;
}

function getDuplicateMap(date) {
  const people = new Map();
  rolesForPage(activeRolePage).forEach((role) => {
    if (!isRoleActiveOnDate(role, date)) return;
    const person = state.assignments[cellKey(date, role.name)];
    if (!person) return;
    if (!people.has(person)) people.set(person, []);
    people.get(person).push(role.name);
  });

  const duplicates = new Map();
  people.forEach((roles, person) => {
    if (roles.length > 1 && hasDisallowedDuplicate(roles)) duplicates.set(person, roles);
  });
  return duplicates;
}

function getCrossSectionConflicts(date) {
  const byPerson = new Map();
  state.roles.forEach((role) => {
    if (!isRoleActiveOnDate(role, date)) return;
    const person = state.assignments[cellKey(date, role.name)];
    if (!person) return;
    if (!byPerson.has(person)) byPerson.set(person, { main: [], children: [] });
    byPerson.get(person)[role.section || roleSection(role.name)].push(role.name);
  });

  const conflicts = [];
  byPerson.forEach((groups, person) => {
    if (groups.main.length && groups.children.length) {
      conflicts.push({ date, person, main: groups.main, children: groups.children });
    }
  });
  return conflicts;
}

function getWeekOfMonth(dateString) {
  const [year, month, day] = dateString.split('-');
  const d = new Date(year, month - 1, day);
  return Math.ceil(d.getDate() / 7);
}

function runCoreCSP() {
  if (activeRolePage !== "main" && activeRolePage !== "children") return;
  if (!canManageSchedulePage(activeRolePage)) {
    alert(readonlyTitle());
    return;
  }
  state.roles = parseRoles();
  if (!visibleDates().length) {
    applyActivePeriod();
  }

  const targetRoles = rolesForPage(activeRolePage);
  const targetDates = visibleDates();
  const unavailable = parseUnavailable();

  const assignments = { ...state.assignments };
  const counts = new Map();

  targetDates.forEach(date => {
    targetRoles.forEach(role => {
      const key = cellKey(date, role.name);
      if (!state.locked[key]) {
        delete assignments[key];
      }
    });
  });

  Object.values(assignments).forEach(person => {
    if (person) counts.set(person, (counts.get(person) || 0) + 1);
  });

  const cellsToFill = [];
  targetDates.forEach((date, rowIndex) => {
    targetRoles.forEach(role => {
      const key = cellKey(date, role.name);
      if (state.locked[key]) return;

      const isForced = (state.temporaryRules || []).some(r => r.type === 'force_role' && r.role === role.name && r.date === date);
      const noteText = assignments[cellKey(date, "備註")];
      const hasNote = noteText && noteText.trim() !== "";
      if (role.name.includes("餅杯") && getWeekOfMonth(date) !== 2 && !isForced && !hasNote) return;
      if (!isRoleActiveOnDate(role, date)) return;
      cellsToFill.push({ date, role, key, rowIndex });
    });
  });

  function backtrack(index, strict) {
    if (index === cellsToFill.length) return true;

    const cell = cellsToFill[index];
    const { date, role, key, rowIndex } = cell;

    const rowAssignments = new Map();
    const rowRoles = [];
    state.roles.forEach(r => {
      const p = assignments[cellKey(date, r.name)];
      if (p) {
        rowAssignments.set(p, (rowAssignments.get(p) || 0) + 1);
        rowAssignments.set(`${r.section}:${p}`, true);
        rowRoles.push({ person: p, roleName: r.name });
      }
    });

    const previousDate = targetDates[rowIndex - 1];
    const previous = previousDate ? assignments[cellKey(previousDate, role.name)] : "";
    const otherSection = role.section === "children" ? "main" : "children";

    let candidates = role.people.filter(person => {
      if (unavailable.get(person)?.has(date)) return false;
      const maxAllowed = role.section === "children" ? 2 : 1;
      if ((rowAssignments.get(person) || 0) >= maxAllowed) return false;
      if (rowAssignments.get(`${otherSection}:${person}`)) return false;

      const sameSectionRolesForPerson = rowRoles.filter(r => r.person === person).map(r => r.roleName);
      if (violatesExclusiveRoleRule(sameSectionRolesForPerson, role.name)) return false;

      const getRuleStatus = (person, roleName, date) => {
        const eff = getEffectiveRuleStatus(person, roleName, date);
        return { unavail: eff.unavail, fixed: eff.fixed };
      };

      const ruleStatus = getRuleStatus(person, role.name, date);
      if (ruleStatus.unavail) return false;

      const aiExclusiveRule = (state.temporaryRules || []).find(r => r.type === 'exclusive_role' && r.person === person);
      if (aiExclusiveRule) {
        if (aiExclusiveRule.role) {
          const hasOtherRoles = sameSectionRolesForPerson.some(r => r !== aiExclusiveRule.role);
          if (role.name === aiExclusiveRule.role && hasOtherRoles) return false;
          if (role.name !== aiExclusiveRule.role && sameSectionRolesForPerson.includes(aiExclusiveRule.role)) return false;
        } else {
          if (sameSectionRolesForPerson.length > 0) return false;
        }
      }

      const aiExclusivePersonRule = (state.temporaryRules || []).find(r => r.type === 'exclusive_person' && (r.person === person || r.action?.person === person));
      if (aiExclusivePersonRule) {
        const otherPerson = aiExclusivePersonRule.person === person ? aiExclusivePersonRule.action?.person : aiExclusivePersonRule.person;
        if (otherPerson && rowAssignments.get(otherPerson) > 0) {
          return false;
        }
      }

      const conditionalRules = (state.temporaryRules || []).filter(r =>
        r.type === 'conditional' &&
        ((!r.date && !r.dateRange) || r.date === date || (r.dateRange && date >= r.dateRange.start && date <= r.dateRange.end))
      );
      for (const rule of conditionalRules) {
        if (role.name === rule.condition?.role && person === rule.condition?.person) {
          const actionAssignedPerson = assignments[cellKey(date, rule.action?.role)];
          if (actionAssignedPerson && actionAssignedPerson !== rule.action?.person) return false;
        }
        if (role.name === rule.action?.role && person !== rule.action?.person) {
          const conditionAssignedPerson = assignments[cellKey(date, rule.condition?.role)];
          if (conditionAssignedPerson === rule.condition?.person) return false;
        }
      }

      if (avoidAdjacent && person === previous) {
        const currAdminFixed = getEffectiveRuleStatus(person, role.name, date).fixed && getEffectiveRuleStatus(person, role.name, date).isAdmin;
        const prevAdminFixed = previousDate ? (getEffectiveRuleStatus(person, role.name, previousDate).fixed && getEffectiveRuleStatus(person, role.name, previousDate).isAdmin) : false;
        if (!(currAdminFixed || prevAdminFixed)) return false;
      }
      return true;
    });

    candidates.sort((a, b) => {
      const aFixed = getRuleStatus(a, role.name, date).fixed;
      const bFixed = getRuleStatus(b, role.name, date).fixed;
      if (aFixed && !bFixed) return -1;
      if (bFixed && !aFixed) return 1;

      if (balanceLoad) {
        const loadDiff = (counts.get(a) || 0) - (counts.get(b) || 0);
        if (loadDiff !== 0) return loadDiff;
      }
      return role.people.indexOf(a) - role.people.indexOf(b);
    });

    for (const person of candidates) {
      assignments[key] = person;
      counts.set(person, (counts.get(person) || 0) + 1);

      if (backtrack(index + 1, strict)) return true;

      assignments[key] = "";
      counts.set(person, counts.get(person) - 1);
    }

    if (!strict) {
      assignments[key] = "";
      if (backtrack(index + 1, false)) return true;
    }

    return false;
  }

  // First pass: Strict CSP
  if (!backtrack(0, true)) {
    // If strict fails, clear assignments and fallback to greedy (allow blanks)
    targetDates.forEach(date => {
      targetRoles.forEach(role => {
        const key = cellKey(date, role.name);
        if (!state.locked[key]) delete assignments[key];
      });
    });
    // Re-initialize counts
    counts.clear();
    Object.values(assignments).forEach(person => {
      if (person) counts.set(person, (counts.get(person) || 0) + 1);
    });
    backtrack(0, false);
  }

  state.assignments = assignments;
  render();
  syncSoon();
}

const scheduleStageMeta = {
  "preparing-context": ["整理規則與人力", 10],
  "checking-preflight-conflicts": ["檢查硬性規則", 20],
  "building-candidates": ["建立合法候選名單", 32],
  "planning-global-draft": ["LLM 全局規劃", 52],
  "repairing-llm-draft": ["LLM 修正草稿", 64],
  "validating-llm-draft": ["攔截器驗證草稿", 68],
  "llm-fallback": ["啟用確定性安全引擎", 72],
  "optimizing-schedule": ["最佳化與補正", 82],
  "validating-final-schedule": ["最終完整驗證", 94],
  completed: ["排班完成", 100],
};

Object.assign(scheduleStageMeta, {
  "request-received": ["收到排班請求", 5],
  "preparing-context": ["整理規則與人力", 10],
  "checking-preflight-conflicts": ["檢查硬性衝突", 20],
  "building-candidates": ["建立合法候選名單", 32],
  "candidate-summary": ["候選名單摘要", 38],
  "checking-feasibility": ["排班前可行性檢查", 43],
  "reserving-rule-priority": ["保留規則優先格", 48],
  "llm-context-ready": ["LLM 上下文完成", 50],
  "llm-token-counted": ["LLM Token 統計", 51],
  "planning-global-draft": ["LLM 全局排班", 56],
  "llm-response-received": ["LLM 草稿已回傳", 62],
  "llm-correction-requested": ["請 LLM 修正草稿", 66],
  "llm-correction-response-received": ["LLM 修正已回傳", 70],
  "repairing-llm-draft": ["LLM 草稿修正", 72],
  "validating-llm-draft": ["攔截器驗證", 74],
  "llm-bounded-repair-approved": ["小範圍安全補正", 78],
  "llm-model-fallback": ["切換 Flash 備援模型", 58],
  "llm-quality-gate-failed": ["LLM 品質門檻未通過", 72],
  "llm-fallback": ["確定性安全引擎", 76],
  "smoothing-llm-draft": ["平滑連續排班警告", 80],
  "optimizing-schedule": ["小範圍補正與最佳化", 84],
  "validating-final-schedule": ["最終完整驗證", 94],
  "checking-quality-gates": ["完成標準檢查", 98],
  "run-completed": ["排班完成", 100],
  "run-failed": ["排班失敗", 100],
  completed: ["排班完成", 100],
});

function schedulingInputFingerprint() {
  return JSON.stringify({
    sectionDates: state.sectionDates,
    assignments: state.assignments,
    locked: state.locked,
    temporaryRules: state.temporaryRules,
    people: state.people,
  });
}

function updateScheduleProgress(stage, message = "") {
  const [label, percent] = scheduleStageMeta[stage] || [stage || "處理中", 5];
  if (el.scheduleProgressStage) el.scheduleProgressStage.textContent = label;
  if (el.scheduleProgressMessage) {
    el.scheduleProgressMessage.textContent = message || "請稍候，系統正在建立大堂排班。";
  }
  if (el.scheduleProgressBar) {
    el.scheduleProgressBar.style.width = `${percent}%`;
    el.scheduleProgressBar.setAttribute("aria-valuenow", String(percent));
  }
  if (el.scheduleProgressDetails && stage) {
    const item = document.createElement("li");
    item.textContent = label;
    el.scheduleProgressDetails.append(item);
  }
}

function openScheduleProgress() {
  if (!el.scheduleProgressModal) return;
  el.scheduleProgressModal.hidden = false;
  el.scheduleProgressModal.dataset.status = "running";
  if (el.scheduleProgressDetails) el.scheduleProgressDetails.innerHTML = "";
  if (el.scheduleProgressCancelBtn) {
    el.scheduleProgressCancelBtn.textContent = "取消排班";
    el.scheduleProgressCancelBtn.disabled = false;
  }
  updateScheduleProgress("preparing-context");
}

function finishScheduleProgress({ success, message }) {
  if (!el.scheduleProgressModal) return;
  el.scheduleProgressModal.dataset.status = success ? "success" : "error";
  if (el.scheduleProgressStage) {
    el.scheduleProgressStage.textContent = success ? "大堂排班完成" : "排班未完成";
  }
  if (el.scheduleProgressMessage) el.scheduleProgressMessage.textContent = message;
  if (el.scheduleProgressBar && success) {
    el.scheduleProgressBar.style.width = "100%";
    el.scheduleProgressBar.setAttribute("aria-valuenow", "100");
  }
  if (el.scheduleProgressCancelBtn) {
    el.scheduleProgressCancelBtn.textContent = "關閉";
    el.scheduleProgressCancelBtn.disabled = false;
  }
}

function parseSseBlock(block) {
  let eventName = "message";
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  return { eventName, data: JSON.parse(dataLines.join("\n")) };
}

async function consumeScheduleStream(response, onEvent) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `排班服務回應錯誤 (${response.status})`);
  }
  if (!response.body) throw new Error("瀏覽器不支援排班進度串流。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) onEvent(event.eventName, event.data);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const event = parseSseBlock(buffer);
    if (event) onEvent(event.eventName, event.data);
  }
}

function clearUnlockedMainAssignments() {
  const mainDates = state.sectionDates.main || [];
  for (const date of mainDates) {
    for (const role of rolesForPage("main")) {
      const key = cellKey(date, role.name);
      const legacyKey = `${date}|${role.name}`;
      if (state.locked[key] || state.locked[legacyKey]) continue;
      delete state.assignments[key];
      delete state.assignments[legacyKey];
    }
  }
}

async function applyGeneratedMainAssignments(assignments) {
  clearUnlockedMainAssignments();
  const entries = Object.entries(assignments || {});
  const batchSize = 10;
  for (let index = 0; index < entries.length; index += batchSize) {
    for (const [key, person] of entries.slice(index, index + batchSize)) {
      state.assignments[key] = person;
    }
    if (el.scheduleProgressMessage) {
      el.scheduleProgressMessage.textContent =
        `正在填入排班表：${Math.min(index + batchSize, entries.length)} / ${entries.length}`;
    }
    render();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}


async function runScheduleAudit() {
  if (activeRolePage !== "main" || Object.keys(state.assignments).length === 0) {
    alert("請先產生大堂排班");
    return;
  }

  const originalText = document.querySelector("#auditBtn").textContent;
  try {
    await flushPendingPeriodSave();
    document.querySelector("#auditBtn").textContent = "稽核中...";
    document.querySelector("#auditBtn").disabled = true;

    const response = await fetch(workerApiUrl("/audit-schedule"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
        "X-Account-Code": activeAccountCode
      },
      body: JSON.stringify({
        ...serialize(),
        scheduleId: selectedPeriodIds.main,
        baseRevision: selectedPeriodRecords.main?.revision,
        targetSection: "main",
        people: state.people.map((person) => normalizePerson(person))
      })
    });
    const result = await response.json();

    if (!result.ok) throw new Error(result.error || "稽核失敗");

    if (!result.suggestions || result.suggestions.length === 0) {
      alert("班表目前很平衡，沒有換班建議。");
      return;
    }

    let msg = "💡 AI 換班建議：\n\n";
    result.suggestions.forEach(s => {
      msg += `- [${s.sourceKey}] ${s.sourcePerson} 換成 ${s.targetPerson}\n`
        + `  原因: ${s.reasonCode || "改善全期負載平衡"}\n`;
    });
    alert(msg);
  } catch (err) {
    alert("稽核過程發生錯誤：" + err.message);
  } finally {
    document.querySelector("#auditBtn").textContent = originalText;
    document.querySelector("#auditBtn").disabled = false;
  }
}

async function runAiSchedule() {
  if (activeRolePage !== "main") return;
  if (!canManageSchedulePage("main")) {
    alert(readonlyTitle());
    return;
  }
  if (scheduleAbortController) return;
  if (!selectedPeriodRecords.main || selectedPeriodRecords.main.status !== "active") {
    alert("歷史檔期不能執行 AI 排班。");
    return;
  }

  state.roles = parseRoles();
  if (!(state.sectionDates.main || []).length) applyActivePeriod();
  if (!(state.sectionDates.main || []).length) {
    alert("請先設定大堂排班期間。");
    return;
  }

  const inputFingerprint = schedulingInputFingerprint();
  const controller = new AbortController();
  scheduleAbortController = controller;
  let completedResult = null;
  let failedResult = null;
  let previousAssignments = null;
  openScheduleProgress();

  try {
    await flushPendingPeriodSave();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const response = await fetch(workerApiUrl("/schedule-ai"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
        "X-Account-Code": activeAccountCode,
      },
      body: JSON.stringify({
        ...serialize(),
        scheduleId: selectedPeriodIds.main,
        baseRevision: selectedPeriodRecords.main?.revision,
        targetSection: "main",
        clientId,
        people: state.people.map((person) => normalizePerson(person)),
      }),
      signal: controller.signal,
    });

    await consumeScheduleStream(response, (eventName, data) => {
      if (eventName === "progress") updateScheduleProgress(data.stage, data.message);
      if (eventName === "completed") completedResult = data;
      if (eventName === "failed") failedResult = data;
    });

    if (failedResult) {
      const error = new Error(failedResult.error || "排班服務未能產生結果。");
      error.code = failedResult.code;
      error.details = failedResult.details;
      throw error;
    }
    if (!completedResult?.ok) throw new Error("排班服務沒有回傳完整結果。");
    if (inputFingerprint !== schedulingInputFingerprint()) {
      throw new Error("排班期間資料已被其他操作更新，為避免覆蓋新資料，本次結果未套用。");
    }

    previousAssignments = { ...state.assignments };
    scheduleAbortController = null;
    if (el.scheduleProgressCancelBtn) {
      el.scheduleProgressCancelBtn.textContent = "正在套用";
      el.scheduleProgressCancelBtn.disabled = true;
    }
    updateScheduleProgress("completed", "排班已通過規則與同日重複的最終驗證，正在填入表格。");
    await applyGeneratedMainAssignments(completedResult.assignments);
    await syncNow();

    const metrics = completedResult.qualityMetrics || completedResult;
    const percent = (value) => `${Math.round(Number(value || 0) * 1000) / 10}%`;
    const llmText = completedResult.llmSummary?.used
      ? `排班完成：LLM 排 ${metrics.llmAssignedCount || 0} 格，覆蓋率 ${percent(metrics.llmCoverage)}；`
        + `安全引擎補 ${metrics.cspFilledCount || 0} 格、改 ${metrics.cspChangedCount || 0} 格，`
        + `介入率 ${percent(metrics.cspContributionRate)}；硬衝突 ${metrics.hardConflictCount || 0}。`
      : `排班未採用 LLM 結果：${completedResult.llmSummary?.errorCode || "未知原因"}`;
    finishScheduleProgress({ success: true, message: llmText });
  } catch (error) {
    scheduleAbortController = null;
    if (previousAssignments) {
      state.assignments = previousAssignments;
      render();
    }
    if (error.name === "AbortError") {
      finishScheduleProgress({ success: false, message: "排班已取消，原有排班沒有變更。" });
      return;
    }
    console.error("AI scheduling failed:", error);
    const prefix = error.code ? `[${error.code}] ` : "";
    const normalizationError = error.details?.errors?.[0];
    const ruleHint = normalizationError
      ? `：${normalizationError.rawRule?.reason || normalizationError.message}`
      : "";

    let unsatisfiedNames = "";
    if (error.details?.unsatisfiedPeople?.length) {
      const names = error.details.unsatisfiedPeople.map(id => {
        const p = state.people.find(person => person.id === id);
        return p ? (p.displayName || p.name) : id;
      });
      unsatisfiedNames = ` (衝突人員：${names.join("、")})`;
    }

    finishScheduleProgress({
      success: false,
      message: `${prefix}${error.message || "排班失敗，原有排班沒有變更。"}${ruleHint}${unsatisfiedNames}`,
    });
  }
}

function getEffectiveRuleStatus(person, roleName, date) {
  const relevantRules = (state.temporaryRules || []).filter(r =>
    r.person === person &&
    (r.type === 'fixed' || r.type === 'unavailable') &&
    (!r.role || r.role === roleName) &&
    (r.scope === 'global' || r.scope === activeRolePage) &&
    ((!r.date && !r.dateRange) || r.date === date || (r.dateRange && date >= r.dateRange.start && date <= r.dateRange.end))
  );
  if (relevantRules.length === 0) return { unavail: false, fixed: false, isAdmin: false };
  relevantRules.sort((a, b) => {
    if (a.isAdmin && !b.isAdmin) return -1;
    if (!a.isAdmin && b.isAdmin) return 1;
    if (a.isAdmin) return b.timestamp - a.timestamp;
    return a.timestamp - b.timestamp;
  });
  const eff = relevantRules[0];
  return { unavail: eff.type === 'unavailable', fixed: eff.type === 'fixed', isAdmin: eff.isAdmin };
}

function isConflict(date, person, rowValues, previous, roleName = "") {
  if (!person || person === "空班") return false;
  const unavailable = parseUnavailable();
  const sameDayCount = rowValues.filter((item) => item === person).length;

  if (roleName.includes("餅杯") && getWeekOfMonth(date) !== 2) {
    const noteText = buildNoteDisplayText(date);
    if (!noteText || noteText.trim() === "") {
      return true;
    }
  }

  const isChildren = roleSection(roleName) === "children";
  const sameSectionRoles = getAssignedRolesForPersonOnDate(date, person, roleSection(roleName));
  const otherSectionRoles = getAssignedRolesForPersonOnDate(date, person, roleSection(roleName) === "children" ? "main" : "children");

  const isAiUnavailable = getEffectiveRuleStatus(person, roleName, date).unavail;

  const avoidAdjacent = ["領會", "司琴", "配唱"].includes(roleName);
  let isAdjacentConflict = false;
  if (avoidAdjacent) {
    const isConsecutiveAllowed = (dateToCheck) => {
      return (state.temporaryRules || []).some(r =>
        r.type === 'allow_consecutive' &&
        (!r.person || r.person === person) &&
        (!r.role || r.role === roleName) &&
        (!r.date || r.date === date || r.date === dateToCheck)
      );
    };

    let pairCount = 0;
    for (let i = 1; i < state.dates.length; i++) {
      const pDate = state.dates[i - 1];
      const cDate = state.dates[i];
      const pPerson = state.assignments[cellKey(pDate, roleName)];
      const cPerson = state.assignments[cellKey(cDate, roleName)];
      if (pPerson === person && cPerson === person) {
        const pFixed = getEffectiveRuleStatus(person, roleName, pDate).fixed && getEffectiveRuleStatus(person, roleName, pDate).isAdmin;
        const cFixed = getEffectiveRuleStatus(person, roleName, cDate).fixed && getEffectiveRuleStatus(person, roleName, cDate).isAdmin;
        if (!(pFixed || cFixed) && !isConsecutiveAllowed(pDate) && !isConsecutiveAllowed(cDate)) {
          pairCount++;
        }
      }
    }

    const currAdminFixed = getEffectiveRuleStatus(person, roleName, date).fixed && getEffectiveRuleStatus(person, roleName, date).isAdmin;
    const dateIndex = state.dates.indexOf(date);

    let isPartOfPair = false;
    if (dateIndex >= 0) {
      const prevDate = state.dates[dateIndex - 1];
      const nextDate = state.dates[dateIndex + 1];
      const prevPerson = prevDate ? state.assignments[cellKey(prevDate, roleName)] : null;
      const nextPerson = nextDate ? state.assignments[cellKey(nextDate, roleName)] : null;
      if (prevPerson && prevPerson === person) {
        const prevAdminFixed = getEffectiveRuleStatus(person, roleName, prevDate).fixed && getEffectiveRuleStatus(person, roleName, prevDate).isAdmin;
        if (!(currAdminFixed || prevAdminFixed) && !isConsecutiveAllowed(prevDate)) isPartOfPair = true;
      }
      if (nextPerson && nextPerson === person) {
        const nextAdminFixed = getEffectiveRuleStatus(person, roleName, nextDate).fixed && getEffectiveRuleStatus(person, roleName, nextDate).isAdmin;
        if (!(currAdminFixed || nextAdminFixed) && !isConsecutiveAllowed(nextDate)) isPartOfPair = true;
      }
    } else {
      if (previous && previous === person) {
        if (!currAdminFixed && !isConsecutiveAllowed(null)) isPartOfPair = true;
      }
    }

    if (isPartOfPair && pairCount > 1) {
      isAdjacentConflict = true;
    }
  }

  const aiExclusivePersonRule = (state.temporaryRules || []).find(r => r.type === 'exclusive_person' && (r.person === person || r.action?.person === person));
  let isExclusivePersonConflict = false;
  if (aiExclusivePersonRule) {
    const otherPerson = aiExclusivePersonRule.person === person ? aiExclusivePersonRule.action?.person : aiExclusivePersonRule.person;
    if (otherPerson && rowValues.includes(otherPerson)) {
      isExclusivePersonConflict = true;
    }
  }

  return (
    unavailable.get(person)?.has(date) ||
    isAiUnavailable ||
    isAdjacentConflict ||
    isExclusivePersonConflict ||
    // 大堂：一個蘿蔔一個坑，同人同日超過 1 次即衝突
    (!isChildren && sameDayCount > 1) ||
    // 兒主：同一人同一天兩次
    (isChildren && sameDayCount > 2) ||
    (otherSectionRoles.length > 0 && !otherSectionRoles.every(otherRole => isChildrenPianoException(roleName, otherRole) || isChildrenPianoException(otherRole, roleName))) ||
    (!isChildren && violatesExclusiveRoleRule(sameSectionRoles.filter((name) => name !== roleName), roleName))
  );
}

function makeSelectCell(date, role, rowValues, rowIndex) {
  const td = document.createElement("td");
  td.dataset.roleGroup = roleGroup(role.name);
  if (!isRoleActiveOnDate(role, date)) {
    td.className = "inactive-cell";
    return td;
  }

  const key = cellKey(date, role.name);
  const canEditThisRole = canEditRole(role.name);
  const wrapper = document.createElement("div");
  const select = document.createElement("select");
  const lockBtn = document.createElement("button");
  const currentValue = state.assignments[key] || "";
  const previousDate = state.dates[rowIndex - 1];
  const previous = previousDate ? state.assignments[cellKey(previousDate, role.name)] : "";
  const duplicates = getDuplicateMap(date);

  if (!canEditThisRole) {
    const valueSpan = document.createElement("span");
    valueSpan.className = "read-only-cell-value";
    valueSpan.textContent = currentValue === "/" ? "" : getShortenedName(role.name, currentValue);
    valueSpan.title = currentValue || readonlyTitle();
    td.classList.add("read-only-cell");
    td.append(valueSpan);

    if (state.locked[key]) td.classList.add("locked");
    if (currentValue === "/") td.classList.add("empty-shift");
    if (isConflict(date, currentValue, rowValues, previous, role.name)) td.classList.add("conflict");
    if (duplicates.get(currentValue)?.includes(role.name) && currentValue !== "/") td.classList.add("duplicate");
    return td;
  }
  td.classList.add("editable-scope");

  const unavailableRules = (state.temporaryRules || []).filter(r => r.type === 'unavailable' && (r.scope === 'global' || r.scope === activeRolePage));
  const fixedRules = (state.temporaryRules || []).filter(r => r.type === 'fixed' && (r.scope === 'global' || r.scope === activeRolePage));

  const optionPeople = (currentValue && !role.people.includes(currentValue)
    ? [currentValue, ...role.people]
    : role.people).filter(person => {
      // 保持目前已選中的人，即使不可排也顯示出來（並在標籤加上警告），方便使用者發現並修改
      if (person === currentValue) return true;
      // 過濾掉不可排的人
      const isUnavail = unavailableRules.some(r => r.person === person && (!r.role || r.role === role.name) && ((!r.date && !r.dateRange) || r.date === date || (r.dateRange && date >= r.dateRange.start && date <= r.dateRange.end)));
      if (isUnavail) return false;

      // 過濾掉互斥的人
      const aiExclusivePersonRule = (state.temporaryRules || []).find(r => r.type === 'exclusive_person' && (r.person === person || r.action?.person === person));
      if (aiExclusivePersonRule) {
        const otherPerson = aiExclusivePersonRule.person === person ? aiExclusivePersonRule.action?.person : aiExclusivePersonRule.person;
        if (otherPerson && rowValues.includes(otherPerson)) return false;
      }

      return true;
    });

  const getIsFixed = (person) => fixedRules.some(r => r.person === person && (!r.role || r.role === role.name) && ((!r.date && !r.dateRange) || r.date === date || (r.dateRange && date >= r.dateRange.start && date <= r.dateRange.end)));

  optionPeople.sort((a, b) => {
    if (a === "/") return 1;
    if (b === "/") return -1;
    const aFixed = getIsFixed(a);
    const bFixed = getIsFixed(b);
    if (aFixed && !bFixed) return -1;
    if (!aFixed && bFixed) return 1;
    const aIndex = role.people.indexOf(a);
    const bIndex = role.people.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  const getOptionLabel = (person) => {
    const isUnavail = unavailableRules.some(r => r.person === person && (!r.role || r.role === role.name) && ((!r.date && !r.dateRange) || r.date === date || (r.dateRange && date >= r.dateRange.start && date <= r.dateRange.end)));
    if (isUnavail) return `${person} (不可排)`;

    const aiExclusivePersonRule = (state.temporaryRules || []).find(r => r.type === 'exclusive_person' && (r.person === person || r.action?.person === person));
    if (aiExclusivePersonRule) {
      const otherPerson = aiExclusivePersonRule.person === person ? aiExclusivePersonRule.action?.person : aiExclusivePersonRule.person;
      if (otherPerson && rowValues.includes(otherPerson)) return `${person} (與${otherPerson}互斥)`;
    }

    if (getIsFixed(person)) return `[推薦] ${person}`;

    return person;
  };

  wrapper.className = "cell-control";
  lockBtn.type = "button";
  lockBtn.textContent = state.locked[key] ? "解" : "鎖";

  // 保留原本選擇的人（例如 "/"），即使不在 role.people 內也能顯示
  const hasEmptyOption = optionPeople.includes("/") || currentValue === "/";
  const emptyOptionHtml = hasEmptyOption ? "" : `<option value="/">/ (空班)</option>`;

  select.innerHTML = `<option value=""></option>${emptyOptionHtml}${optionPeople
    .map((person) => {
      let label = person === "/" ? "/ (空班)" : getOptionLabel(person);
      if (person === currentValue) {
        label = label.replace("[推薦] ", "");
      }
      return `<option value="${person}">${label}</option>`;
    })
    .join("")}`;
  select.value = currentValue;
  select.disabled = Boolean(state.locked[key]);
  if (select.disabled) select.title = "此格已鎖定，請先解除鎖定";

  select.addEventListener("change", () => {
    if (!canEditRole(role.name)) return;
    const newValue = select.value;
    state.assignments[key] = newValue;

    // 自動核銷：排入該人員時，消除該人員對應的可排(fixed)提示
    if (typeof consumeFixedRule === 'function') {
      if (consumeFixedRule(date, role.name, newValue)) {
        rebuildTemporaryRules();
        renderRuleMemos();
      }
    }

    render();
    syncSoon();
  });
  lockBtn.addEventListener("click", async () => {
    if (!canEditRole(role.name)) return;
    lockBtn.disabled = true;
    try {
      await setCellLocksRemote(role.section || roleSection(role.name), [{
        cellKey: key,
        locked: !state.locked[key]
      }]);
    } catch (error) {
      alert(error.message || "鎖定變更失敗");
      render();
    }
  });

  wrapper.append(select, lockBtn);
  td.append(wrapper);

  if (state.locked[key]) td.classList.add("locked");
  if (select.value === "/") td.classList.add("empty-shift");
  if (isConflict(date, select.value, rowValues, previous, role.name)) td.classList.add("conflict");
  if (duplicates.get(select.value)?.includes(role.name) && select.value !== "/") td.classList.add("duplicate");
  return td;
}

function makeExtraTextCell(date, column) {
  const td = document.createElement("td");
  td.className = "extra-text-cell";
  td.dataset.roleGroup = "extra";
  const input = document.createElement("textarea");
  input.rows = 1;
  input.placeholder = "輸入文字";
  input.value = state.extraValues[extraColumnKey(date, column)] || "";
  input.readOnly = !canEditExtraColumn();
  input.title = input.readOnly ? readonlyTitle() : "";
  if (!input.readOnly) td.classList.add("editable-scope");
  input.addEventListener("input", () => {
    if (!canEditExtraColumn()) return;
    state.extraValues[extraColumnKey(date, column)] = input.value;
    syncSoon();
  });
  td.append(input);
  return td;
}

function setWarningBox(box, messages, title) {
  box.classList.toggle("active", messages.length > 0);
  box.innerHTML = messages.length
    ? `<strong>${title}</strong><br>${messages.slice(0, 8).join("<br>")}${messages.length > 8 ? "<br>..." : ""}`
    : "";
}

function updateWarnings() {
  const messages = [];
  const mainMessages = [];
  const childrenMessages = [];

  if (true) {
    state.dates.forEach((date) => {
      getDuplicateMap(date).forEach((roles, person) => {
        messages.push({ date, text: `${displayDate(date)}：${person} 重複排在「${roles.join("、")}」` });
      });
    });
  }

  // 檢查跨區衝突
  state.dates.forEach((date) => {
    getCrossSectionConflicts(date).forEach((conflict) => {
      mainMessages.push({ date, text: `${displayDate(date)}：${conflict.person} 已在兒主「${conflict.children.join("、")}」服事，大堂不可再排「${conflict.main.join("、")}」` });
      childrenMessages.push({ date, text: `${displayDate(date)}：${conflict.person} 已在大堂「${conflict.main.join("、")}」服事，兒主不可再排「${conflict.children.join("、")}」` });
    });
  });

  // 檢查連週排班
  const adjacentRoles = ["領會", "司琴", "配唱"];
  adjacentRoles.forEach(roleName => {
    const isConsecutiveAllowed = (person, dateToCheck) => {
      return (state.temporaryRules || []).some(r =>
        r.type === 'allow_consecutive' &&
        (!r.person || r.person === person) &&
        (!r.role || r.role === roleName) &&
        (!r.date || r.date === dateToCheck)
      );
    };

    const personPairs = {};
    for (let i = 0; i < state.dates.length - 1; i++) {
      const date1 = state.dates[i];
      const date2 = state.dates[i + 1];
      const person1 = state.assignments[cellKey(date1, roleName)];
      const person2 = state.assignments[cellKey(date2, roleName)];

      if (person1 && person2 && person1 === person2 && person1 !== "/" && person1 !== "空班") {
        const adminFixed1 = getEffectiveRuleStatus(person1, roleName, date1).fixed && getEffectiveRuleStatus(person1, roleName, date1).isAdmin;
        const adminFixed2 = getEffectiveRuleStatus(person2, roleName, date2).fixed && getEffectiveRuleStatus(person2, roleName, date2).isAdmin;
        if (!(adminFixed1 || adminFixed2) && !isConsecutiveAllowed(person1, date1) && !isConsecutiveAllowed(person1, date2)) {
          personPairs[person1] = (personPairs[person1] || 0) + 1;
        }
      }
    }

    for (let i = 0; i < state.dates.length - 1; i++) {
      const date1 = state.dates[i];
      const date2 = state.dates[i + 1];
      const person1 = state.assignments[cellKey(date1, roleName)];
      const person2 = state.assignments[cellKey(date2, roleName)];

      if (person1 && person2 && person1 === person2 && person1 !== "/" && person1 !== "空班") {
        const adminFixed1 = getEffectiveRuleStatus(person1, roleName, date1).fixed && getEffectiveRuleStatus(person1, roleName, date1).isAdmin;
        const adminFixed2 = getEffectiveRuleStatus(person2, roleName, date2).fixed && getEffectiveRuleStatus(person2, roleName, date2).isAdmin;
        if (!(adminFixed1 || adminFixed2) && !isConsecutiveAllowed(person1, date1) && !isConsecutiveAllowed(person1, date2)) {
          if (personPairs[person1] > 1) {
            const warnText = `🛑 [連週警告] ${person1} 連續兩週 (${displayDate(date1)}, ${displayDate(date2)}) 擔任「${roleName}」`;
            mainMessages.push({ date: date1, text: warnText });
          }
        }
      }
    }
  });

  const aiRules = state.temporaryRules || [];

  // 檢查 AI 規則的 exclusive_person 衝突
  const exclusivePersonRules = aiRules.filter(r => r.type === 'exclusive_person');
  state.dates.forEach((date) => {
    exclusivePersonRules.forEach(r => {
      const p1 = r.person;
      const p2 = r.action?.person;
      if (p1 && p2) {
        const rowValues = state.roles
          .filter((role) => isRoleActiveOnDate(role, date))
          .map((role) => state.assignments[cellKey(date, role.name)])
          .filter(Boolean);

        if (rowValues.includes(p1) && rowValues.includes(p2)) {
          const warnText = `🛑 [互斥警告] ${displayDate(date)} ${p1} 與 ${p2} 被排在同一天`;
          messages.push({ date, text: warnText });
        }
      }
    });
  });

  // 檢查 AI 規則本身的互斥情況
  state.dates.forEach((date) => {
    const rulesOnDate = aiRules.filter(r => {
      if (r.date === date) return true;
      if (r.dateRange && date >= r.dateRange.start && date <= r.dateRange.end) return true;
      if (!r.date && !r.dateRange) return true;
      return false;
    });

    const rulesByPerson = {};
    rulesOnDate.forEach(r => {
      if (!rulesByPerson[r.person]) rulesByPerson[r.person] = [];
      rulesByPerson[r.person].push(r);
    });

    Object.entries(rulesByPerson).forEach(([person, personRules]) => {
      const unavailableRules = personRules.filter(r => r.type === 'unavailable');
      const fixedRules = personRules.filter(r => r.type === 'fixed');

      if (unavailableRules.length > 0 && fixedRules.length > 0) {
        const warnText = `🛑 [規則互斥] ${displayDate(date)} ${person} 同時被設定為「不可排」與「固定指派(${fixedRules.map(r => r.role || '某職位').join('、')})」`;
        messages.push({ date, text: warnText });
      }

      if (fixedRules.length > 1) {
        const assignedSections = new Set(fixedRules.map(r => {
          const roleObj = state.roles.find(sr => sr.name === r.role);
          return roleObj ? roleObj.section : r.scope;
        }));
        if (assignedSections.has('main') && assignedSections.has('children')) {
          const warnText = `🛑 [規則互斥] ${displayDate(date)} ${person} 同時被指定跨區服事 (${fixedRules.map(r => r.role || r.scope).join(' 與 ')})`;
          messages.push({ date, text: warnText });
        }
      }
    });
  });

  // 檢查推薦規則
  aiRules.forEach(rule => {
    if (rule.type !== 'fixed') return;
    const targetRole = state.roles.find(r => r.name === rule.role);
    if (!targetRole) return;

    state.dates.forEach(date => {
        const inDateRange = (!rule.date && !rule.dateRange) || rule.date === date || (rule.dateRange && date >= rule.dateRange.start && date <= rule.dateRange.end);
        if (inDateRange) {
          // Rule 2: 如果該格已經被排定 (不管是誰)，排班提醒就消除
          const slotValue = state.assignments[cellKey(date, rule.role)];
          const isSlotFilled = slotValue && slotValue !== "/";
          if (isSlotFilled) return;

          // Rule 1: 如果該人當月已經被排定過任何服事，當月份的其他推薦就消除
          const monthPrefix = date.substring(0, 7);
          let monthAssignedCount = 0;
          state.dates.forEach(d => {
            if (d.startsWith(monthPrefix)) {
              state.roles.forEach(r => {
                if (state.assignments[cellKey(d, r.name)] === rule.person) {
                  monthAssignedCount++;
                }
              });
            }
          });
          // 但如果 AI 規則是「明確指定這一天」而不是「區間」，我們還是保留提示，以免漏掉他特別指明的日期
          // 這裡我們採用您的規則：只要當月有排，就全消。
          if (monthAssignedCount > 0) return;

          const warnText = `💡 [推薦] ${displayDate(date)} ${rule.role} 可由 ${rule.person} 負責${rule.reason ? `：${rule.reason}` : ''}`;
          if (targetRole.section === 'main') mainMessages.push({ date, text: warnText });
          else if (targetRole.section === 'children') childrenMessages.push({ date, text: warnText });
          else messages.push({ date, text: warnText });
        }
    });
  });

  // 將跨區衝突也加入當前頁面的警告中
  if (activeRolePage === "main" && mainMessages.length > 0) {
    messages.push(...mainMessages);
  } else if (activeRolePage === "children" && childrenMessages.length > 0) {
    messages.push(...childrenMessages);
  } else if (activeRolePage === "output") {
    messages.push(...mainMessages, ...childrenMessages);
  }

  const finalMessages = messages.sort((a, b) => a.date.localeCompare(b.date)).map(m => m.text);
  const finalMain = mainMessages.sort((a, b) => a.date.localeCompare(b.date)).map(m => m.text);
  const finalChildren = childrenMessages.sort((a, b) => a.date.localeCompare(b.date)).map(m => m.text);

  setWarningBox(el.warnings, activeAccountCode ? finalMessages : [], "排班提醒");
  setWarningBox(el.mainGroupWarnings, finalMain, "大堂衝突");
  setWarningBox(el.childrenGroupWarnings, finalChildren, "兒主衝突");
}

function renderSchedule() {
  state.roles = parseRoles();
  refreshDates();
  el.table.innerHTML = "";
  const columnsToShow = orderedVisibleColumns();
  const datesToShow = visibleDates();
  const isMainPage = activeRolePage === "main";
  const extraHeaders = isMainPage ? ["實體人數", "線上人數"] : [];

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["日期", ...columnsToShow.map((column) => column.type === "role" ? column.role.name : column.title), ...extraHeaders, "備註"].forEach((name, columnIndex) => {
    const th = document.createElement("th");
    const isNoteColumn = columnIndex === (columnsToShow.length + extraHeaders.length + 1);
    const matchedColumn = columnsToShow.find((column) =>
      column.type === "role" ? column.role.name === name : column.title === name
    );
    th.dataset.roleGroup = name === "備註" ? "note" : (extraHeaders.includes(name) ? "attendance" : (matchedColumn?.type === "extra" ? "extra" : roleGroup(name)));
    const canEditColumn = matchedColumn?.type === "role"
      ? canEditRole(matchedColumn.role.name)
      : matchedColumn?.type === "extra"
        ? canEditExtraColumn()
        : isNoteColumn && canEditNote();
    if (canEditColumn) th.classList.add("editable-scope");

    if (matchedColumn?.type === "role") {
      const headerInner = document.createElement("div");
      const label = document.createElement("span");
      const button = document.createElement("button");
      const fullyLocked = isColumnFullyLocked(matchedColumn.role.name);

      th.classList.add("lockable-column");
      headerInner.className = "column-header-inner";
      label.textContent = name;
      button.type = "button";
      button.className = "column-lock-btn";
      if (fullyLocked) button.classList.add("active");
      button.disabled = !canEditRole(matchedColumn.role.name);
      button.textContent = fullyLocked ? "解" : "鎖";
      button.title = fullyLocked
        ? `解除「${name}」整欄鎖定`
        : `鎖定「${name}」整欄`;
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!canEditRole(matchedColumn.role.name)) return;
        button.disabled = true;
        try {
          await toggleColumnLock(matchedColumn.role.name);
        } catch (error) {
          alert(error.message || "整欄鎖定變更失敗");
          render();
        }
      });

      headerInner.append(label, button);
      th.append(headerInner);
    } else {
      th.textContent = name;
    }
    headerRow.append(th);
  });
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  datesToShow.forEach((date, rowIndex) => {
    const tr = document.createElement("tr");
    const dateCell = document.createElement("td");
    const rowValues = state.roles
      .filter((role) => isRoleActiveOnDate(role, date))
      .map((role) => state.assignments[cellKey(date, role.name)]);

    dateCell.className = "date-cell";
    dateCell.textContent = displayDate(date);
    tr.append(dateCell);

    columnsToShow.forEach((column) => {
      tr.append(
        column.type === "role"
          ? makeSelectCell(date, column.role, rowValues, rowIndex)
          : makeExtraTextCell(date, column)
      );
    });

    if (isMainPage) {
      const record = state.attendanceRecords?.[date] || {};
      const canEditAttendance = (
        activeAccountCode === "A000" || activeAccountCode === "A003"
      ) && selectedPeriodIsWritable("main");

      const pTd = document.createElement("td");
      pTd.dataset.roleGroup = "attendance";
      const pInput = document.createElement("input");
      pInput.type = "number";
      pInput.min = "0";
      pInput.placeholder = canEditAttendance ? "-" : "";
      pInput.value = record.physical_count !== undefined && record.physical_count !== null ? record.physical_count : "";
      pInput.readOnly = !canEditAttendance;
      pInput.addEventListener("change", () => updateAttendance(date, pInput.value, null));
      pTd.append(pInput);
      tr.append(pTd);

      const oTd = document.createElement("td");
      oTd.dataset.roleGroup = "attendance";
      const oInput = document.createElement("input");
      oInput.type = "number";
      oInput.min = "0";
      oInput.placeholder = canEditAttendance ? "-" : "";
      oInput.value = record.online_count !== undefined && record.online_count !== null ? record.online_count : "";
      oInput.readOnly = !canEditAttendance;
      oInput.addEventListener("change", () => updateAttendance(date, null, oInput.value));
      oTd.append(oInput);
      tr.append(oTd);
    }

    const noteCell = document.createElement("td");
    const noteInput = document.createElement("textarea");
    noteInput.rows = 1;
    const isOutputPage = activeRolePage === "output";
    const linkedNoteText = getLinkedNotesForDate(date).join(" | ");
    noteCell.className = "note-cell";
    noteInput.type = "text";
    noteInput.placeholder = isOutputPage
      ? "合併備註"
      : (linkedNoteText || "手動備註");
    noteInput.value = isOutputPage ? buildNoteDisplayText(date, "output") : getManualNote(date);
    noteInput.readOnly = isOutputPage || !canEditNote(activeRolePage);
    noteInput.title = noteInput.readOnly ? readonlyTitle() : linkedNoteText;
    if (!noteInput.readOnly) noteCell.classList.add("editable-scope");
    if (!isOutputPage && canEditNote(activeRolePage)) {
      noteInput.addEventListener("input", () => {
        setManualNote(date, noteInput.value);
        noteInput.placeholder = getLinkedNotesForDate(date).join(" | ") || "手動備註";
        noteInput.title = getLinkedNotesForDate(date).join(" | ");
        noteCell.classList.toggle("note-highlight", Boolean(buildNoteDisplayText(date)));
        syncSoon();
      });
    }
    noteCell.classList.toggle("note-highlight", Boolean(buildNoteDisplayText(date, isOutputPage ? "output" : activeRolePage)));
    noteCell.append(noteInput);
    tr.append(noteCell);
    tbody.append(tr);
  });

  el.table.append(thead, tbody);
  updatePeriodUi();
  updateAccessUi();
  updateWarnings();
}

function renderPublicSchedule() {
  // 只顯示 output 模式
  state.roles = parseRoles();
  refreshDates();
  el.table.innerHTML = "";
  const columnsToShow = orderedVisibleColumns();
  const datesToShow = visibleDates();

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["日期", ...columnsToShow.map((column) => column.type === "role" ? column.role.name : column.title), "備註"].forEach((name) => {
    const th = document.createElement("th");
    th.textContent = name;
    headerRow.append(th);
  });
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  datesToShow.forEach((date) => {
    const tr = document.createElement("tr");
    const dateCell = document.createElement("td");
    dateCell.className = "date-cell";
    dateCell.textContent = displayDate(date);
    tr.append(dateCell);

    columnsToShow.forEach((column) => {
      const td = document.createElement("td");
      td.className = "schedule-cell public-cell";
      td.dataset.date = date;

      if (column.type === "role") {
        td.dataset.role = column.role.name;
        if (!isRoleActiveOnDate(column.role, date)) {
          td.className = "inactive-cell";
        } else {
          let person = state.assignments[cellKey(date, column.role.name)] || "";
          if (typeof person === 'string') person = person.trim();
          if (person) {
            // 用 person-tag 包起來，方便反饋系統選取與高亮
            const tag = document.createElement('span');
            tag.className = 'person-tag';
            tag.dataset.person = person;
            tag.textContent = person;
            td.append(tag);
          }
        }
      } else {
        // extra (isText) columns
        td.dataset.role = column.title;
        const key = `${date}_${column.type}_${column.title}`;
        td.textContent = state.extraValues[key] || "";
      }
      tr.append(td);
    });

    const noteCell = document.createElement("td");
    noteCell.className = "note-cell public-note-cell";
    const noteText = buildNoteDisplayText(date, "output");
    noteCell.textContent = noteText;
    noteCell.title = noteText;
    noteCell.classList.toggle("note-highlight", Boolean(noteText));
    tr.append(noteCell);
    tbody.append(tr);
  });

  el.table.append(thead, tbody);
  updatePeriodUi();
}

function normalizePerson(person) {
  let categories = Array.isArray(person.categories)
    ? person.categories
    : (Array.isArray(person.details) ? person.details : []);
  categories = Array.from(new Set(categories.map(c => c === "主領" ? "領會" : c)));

  return {
    id: person.id || crypto.randomUUID(),
    name: person.name || "",
    nickname: person.nickname || "",
    sections: Array.isArray(person.sections)
      ? person.sections
      : (person.category ? [person.category] : ["大堂"]),
    categories: categories,
    note: String(person.note || person.detailNote || "").trim(),
  };
}

function allServiceDetails() {
  const details = new Set([...(state.serviceDetails || []), ...defaultServiceDetails]);
  state.people.forEach((person) => {
    const categories = person.categories || person.details || [];
    categories.forEach((detail) => details.add(detail));
  });
  return Array.from(details).filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function selectedPersonDetails() {
  return Array.from(document.querySelectorAll("#personServiceMatrix .detail-check:checked")).map((input) => input.value);
}

function setSelectedPersonDetails(details) {
  const selected = new Set(details);
  document.querySelectorAll("#personServiceMatrix .detail-check").forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function selectedPersonSections() {
  return Array.from(document.querySelectorAll("#personServiceMatrix .section-check:checked")).map((input) => input.value);
}

function setSelectedPersonSections(sections) {
  const selected = new Set(sections || []);
  document.querySelectorAll("#personServiceMatrix .section-check").forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function inferSectionForDetail(detail) {
  if (detail === "講員" || detail === "外請講員") return "講員";
  if (detail.includes("兒主")) return "兒主";
  if (detail.includes("招待")) return "招待";
  if (detail.includes("餅杯")) return "餅杯";
  return "大堂";
}

function groupedServiceDetails(selectedDetails = []) {
  const grouped = Object.fromEntries(
    serviceSectionOrder.map((section) => [section, [...(serviceSectionDetailMap[section] || [])]])
  );
  const selectedSet = new Set(selectedDetails);

  allServiceDetails().forEach((detail) => {
    const section = inferSectionForDetail(detail);
    if ((serviceSectionExcludedDetails[section] || []).includes(detail) && !selectedSet.has(detail)) return;
    if (!grouped[section]) grouped[section] = [];
    if (!grouped[section].includes(detail)) grouped[section].push(detail);
  });

  selectedSet.forEach((detail) => {
    const section = inferSectionForDetail(detail);
    if (!grouped[section]) grouped[section] = [];
    if (!grouped[section].includes(detail)) grouped[section].push(detail);
  });

  return serviceSectionOrder.map((section) => ({
    section,
    details: grouped[section] || [],
  }));
}

function renderServiceDetailChoices(selected = [], selectedSections = null) {
  const selectedSet = new Set(selected);
  const container = el.personServiceMatrix;
  if (!container) return;
  const sectionsSet = selectedSections
    ? new Set(selectedSections)
    : new Set(selectedPersonSections());
  container.innerHTML = "";

  groupedServiceDetails(selected).forEach(({ section, details }) => {
    const row = document.createElement("div");
    const sectionLabel = document.createElement("label");
    const sectionInput = document.createElement("input");
    const detailsWrap = document.createElement("div");
    const isSectionChecked = sectionsSet.has(section);

    row.className = "service-matrix-row";
    sectionLabel.className = "service-matrix-section";
    detailsWrap.className = "service-matrix-details";

    sectionInput.type = "checkbox";
    sectionInput.value = section;
    sectionInput.className = "section-check";
    sectionInput.checked = isSectionChecked;
    sectionLabel.append(sectionInput, document.createTextNode(` ${section}`));

    const syncSectionRowState = () => {
      const enabled = sectionInput.checked;
      detailsWrap.classList.toggle("disabled", !enabled);
      row.classList.toggle("inactive", !enabled);
      detailsWrap.querySelectorAll(".detail-check").forEach((input) => {
        input.disabled = !enabled;
        if (!enabled) input.checked = false;
      });
    };

    details.forEach((detail) => {
      const detailLabel = document.createElement("label");
      const detailInput = document.createElement("input");
      detailLabel.className = "detail-choice";
      detailInput.type = "checkbox";
      detailInput.value = detail;
      detailInput.className = "detail-check";
      detailInput.checked = selectedSet.has(detail);
      detailInput.disabled = !isSectionChecked;
      detailInput.addEventListener("change", () => {
        if (detailInput.checked && !sectionInput.checked) {
          sectionInput.checked = true;
          syncSectionRowState();
        }
      });
      detailLabel.append(detailInput, document.createTextNode(` ${detail}`));
      detailsWrap.append(detailLabel);
    });

    sectionInput.addEventListener("change", () => {
      syncSectionRowState();
    });

    row.append(sectionLabel, detailsWrap);
    container.append(row);
    syncSectionRowState();
  });
}

function clearPersonForm() {
  el.personId.value = "";
  el.personName.value = "";
  if (el.personNickname) el.personNickname.value = "";
  setSelectedPersonSections([]);
  el.personDetail.value = "";
  renderServiceDetailChoices();
  el.personSubmitBtn.textContent = "確認";
  if (el.personModalTitle) el.personModalTitle.textContent = "新增同工";
  if (el.personToolbarCancelBtn) el.personToolbarCancelBtn.hidden = true;
  personModalMode = "create";
  setWarningBox(el.personMessage, [], "");
}

function openPersonModal(mode = "create") {
  if (mode === "create" && !canManagePeople()) {
    alert(readonlyTitle());
    return;
  }
  personModalMode = mode;
  if (el.personModalTitle) {
    el.personModalTitle.textContent = mode === "edit" ? "編輯同工" : "新增同工";
  }
  if (el.personSubmitBtn) {
    el.personSubmitBtn.textContent = mode === "edit" ? "確認修改" : "確認";
  }
  if (el.personToolbarCancelBtn) {
    el.personToolbarCancelBtn.hidden = mode !== "edit";
  }
  if (el.personModal) {
    el.personModal.hidden = false;
  }
  setTimeout(() => {
    el.personName?.focus();
  }, 0);
}

function closePersonModal() {
  if (el.personModal) {
    el.personModal.hidden = true;
  }
  clearPersonForm();
}

function normalizeNotesState(notes) {
  if (notes && typeof notes === "object" && !Array.isArray(notes)) {
    const hasScopedNotes = "main" in notes || "children" in notes;
    if (hasScopedNotes) {
      return {
        main: notes.main && typeof notes.main === "object" ? notes.main : {},
        children: notes.children && typeof notes.children === "object" ? notes.children : {},
      };
    }
    return {
      main: { ...notes },
      children: { ...notes },
    };
  }
  return { main: {}, children: {} };
}

function noteSectionForPage(page = activeRolePage) {
  if (page === "children") return "children";
  return "main";
}

function scopedRoleNamesForPage(page = activeRolePage) {
  if (page !== "main" && page !== "children") return [];
  return parseRoles()
    .filter((role) => role.section === page)
    .map((role) => role.name);
}

async function clearScheduleForPage(page = activeRolePage) {
  if (!canManageSchedulePage(page)) {
    alert(readonlyTitle());
    return false;
  }
  await flushPendingPeriodSave();
  const period = selectedPeriodRecords[page];
  if (!period || period.status !== "active") {
    alert("歷史檔期不能清空排班");
    return false;
  }
  const response = await fetch(
    workerApiUrl(`/schedule-periods/${encodeURIComponent(period.id)}/clear-unlocked`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
        "X-Account-Code": activeAccountCode
      },
      body: JSON.stringify({ baseRevision: period.revision })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "清空排班失敗");
  selectedPeriodRecords[page] = payload.period;
  selectedPeriodStates[page] = payload.period?.state || {};
  applySelectedPeriodWorkspace();
  alert(`已清除 ${payload.clearedCount || 0} 格未鎖定排班，保留 ${payload.preservedLockedCount || 0} 格鎖定排班。`);
  return true;
}


function getChildrenAutoNoteForDate(date) {
  const childrenPeople = new Set();
  rolesForPage("children").forEach(role => {
    if (role.people) role.people.forEach(p => childrenPeople.add(p));
  });

  const mainRoles = rolesForPage("main");
  const hints = [];
  mainRoles.forEach(role => {
    if (!isRoleActiveOnDate(role, date)) return;
    const assignedPerson = state.assignments[cellKey(date, role.name)];
    if (assignedPerson && childrenPeople.has(assignedPerson)) {
      let displayRole = role.name;
      if (displayRole.startsWith("主日")) displayRole = displayRole.substring(2);
      hints.push(`${assignedPerson}大堂${displayRole}`);
    }
  });
  return hints.join("、");
}

function getManualNote(date, page = activeRolePage) {
  if (page === "output") {
    return String(state.notes?.main?.[date] || "").trim();
  }
  if (page === "children") {
    return getChildrenAutoNoteForDate(date);
  }
  const section = noteSectionForPage(page);
  return String(state.notes?.[section]?.[date] || "").trim();
}

function setManualNote(date, value, page = activeRolePage) {
  const section = noteSectionForPage(page);
  if (!state.notes[section]) state.notes[section] = {};
  state.notes[section][date] = value;
}

function getPersonByName(name) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return null;
  return state.people
    .map((person) => normalizePerson(person))
    .find((person) => person.name === normalizedName) || null;
}

function getLinkedNotesForDate(date, page = activeRolePage) {
  const linkedNotes = [];
  const seen = new Set();
  const targetSection = page === "output" ? "main" : noteSectionForPage(page);

  parseRoles()
    .filter((role) => isRoleActiveOnDate(role, date))
    .filter((role) => !targetSection || role.section === targetSection)
    .forEach((role) => {
      const assignedName = state.assignments[cellKey(date, role.name)];
      const person = getPersonByName(assignedName);
      if (!person?.note) return;
      const item = person.note;
      if (seen.has(item)) return;
      seen.add(item);
      linkedNotes.push(item);
    });

  return linkedNotes;
}

function buildNoteDisplayText(date, page = activeRolePage) {
  const manualNote = getManualNote(date, page);
  const linkedNotes = getLinkedNotesForDate(date, page);
  return [manualNote, ...linkedNotes].filter(Boolean).join(" | ");
}

function closeAddRoleModal() {
  if (!el.addRoleModal) return;
  el.addRoleModal.hidden = true;
  el.addRoleCustomInput.value = "";
  el.addRolePositionSelect.value = "beforeBigClass";
}

function matchesPeopleFilter(person) {
  if (peopleFilter === "all") return true;
  if (peopleFilter === "speaker") return (person.sections || []).includes("講員");
  if (peopleFilter === "worship_leader") return (person.categories || []).includes("領會");
  if (peopleFilter === "pianist") return (person.categories || []).includes("司琴");
  if (peopleFilter === "vocalist") return (person.categories || []).includes("配唱");
  if (peopleFilter === "usher") return (person.sections || []).includes("招待");
  if (peopleFilter === "communion") return (person.sections || []).includes("餅杯");
  if (peopleFilter === "children") return (person.sections || []).includes("兒主");
  return true;
}

function comparePeople(left, right) {
  if (peopleSortKey === "manual") return 0;
  const getValue = (person) => {
    if (peopleSortKey === "sections") return (person.sections || []).join("、");
    if (peopleSortKey === "categories") return (person.categories || []).join("、");
    return person.name || "";
  };

  const comparison = getValue(left).localeCompare(getValue(right), "zh-Hant");
  return peopleSortDirection === "asc" ? comparison : -comparison;
}

function togglePeopleSort(nextKey) {
  if (peopleSortKey === nextKey) {
    peopleSortDirection = peopleSortDirection === "asc" ? "desc" : "asc";
  } else {
    peopleSortKey = nextKey;
    peopleSortDirection = "asc";
  }
  renderPeople();
}

function sortIndicator(key) {
  if (peopleSortKey !== key) return "";
  return peopleSortDirection === "asc" ? " ▲" : " ▼";
}

function updatePeopleQuickFilterUi() {
  el.peopleQuickFilters?.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === peopleFilter);
  });
}

function openAddRoleModal() {
  if (!canEditExtraColumn()) {
    alert(readonlyTitle());
    return;
  }
  if (activeRolePage !== "children") {
    alert("新增欄位僅供兒主頁面的非排班文字內容使用。");
    return;
  }
  el.addRoleModal.hidden = false;
  el.addRoleCustomInput.focus();
}

function confirmAddRole() {
  if (!canEditExtraColumn()) {
    alert(readonlyTitle());
    return;
  }
  const roleName = el.addRoleCustomInput.value.trim();
  const position = el.addRolePositionSelect.value;

  if (!roleName) {
    alert("請先輸入欄位標題。");
    return;
  }
  if (activeRolePage !== "children") {
    alert("新增欄位僅供兒主頁面的非排班文字內容使用。");
    return;
  }

  const allExtraColumns = [
    ...(state.extraColumns?.children?.beforeBigClass || []),
    ...(state.extraColumns?.children?.afterBigClass || []),
  ];
  const exists = allExtraColumns.includes(roleName);
  if (exists) {
    alert("這個欄位已經存在。");
    return;
  }

  if (!state.extraColumns.children) {
    state.extraColumns.children = { beforeBigClass: [], afterBigClass: [] };
  }
  state.extraColumns.children[position] = [
    ...(state.extraColumns.children[position] || []),
    roleName,
  ];
  closeAddRoleModal();
  render();
  syncSoon();
}

function renderPeople() {
  renderServiceDetailChoices(selectedPersonDetails());
  updatePeopleQuickFilterUi();
  const visiblePeople = state.people
    .map((person) => normalizePerson(person))
    .filter(matchesPeopleFilter)
    .sort(comparePeople);

  el.peopleCount.textContent = `${visiblePeople.length} 人`;

  if (!el.peopleTable) return;
  el.peopleTable.innerHTML = "";

  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  [
    { key: "manual", text: "排序", sortable: false },
    { key: "name", text: `姓名${sortIndicator("name")}`, sortable: false },
    { key: "sections", text: `服事區塊${sortIndicator("sections")}`, sortable: true },
    { key: "categories", text: `服事類別${sortIndicator("categories")}`, sortable: true },
    { key: "note", text: "補充說明", sortable: false },
    { key: "actions", text: "操作", sortable: false },
  ].forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.text;
    if (column.sortable) {
      th.className = "sortable";
      th.addEventListener("click", () => togglePeopleSort(column.key));
    }
    header.append(th);
  });
  thead.append(header);

  const tbody = document.createElement("tbody");
  if (visiblePeople.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "尚無人員資料";
    td.style.color = "var(--muted)";
    td.style.padding = "12px";
    tr.append(td);
    tbody.append(tr);
  } else {
    let dragSrcId = null;

    visiblePeople.forEach((normalized, index) => {
      const tr = document.createElement("tr");
      const canManageThisPerson = canManagePeople(normalized);
      tr.draggable = canManageThisPerson;
      tr.style.cursor = canManageThisPerson ? "move" : "default";

      tr.addEventListener("dragstart", (e) => {
        if (!canManageThisPerson) {
          e.preventDefault();
          return;
        }
        dragSrcId = normalized.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", normalized.id);
        tr.style.opacity = "0.4";
      });

      tr.addEventListener("dragover", (e) => {
        if (!canManageThisPerson) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        tr.style.outline = "2px dashed var(--primary)";
      });

      tr.addEventListener("dragleave", () => {
        tr.style.outline = "none";
      });

      tr.addEventListener("drop", (e) => {
        if (!canManageThisPerson) return;
        e.stopPropagation();
        tr.style.outline = "none";
        const fromId = e.dataTransfer.getData("text/plain");
        const toId = normalized.id;
        if (fromId && fromId !== toId) {
          const fromIndex = visiblePeople.findIndex(p => p.id === fromId);
          const toIndex = index;
          const actualFrom = state.people.findIndex(p => p.id === fromId);
          if (actualFrom > -1) {
            const [item] = state.people.splice(actualFrom, 1);
            const insertIndex = state.people.findIndex(p => p.id === toId);
            if (fromIndex < toIndex) {
              state.people.splice(insertIndex + 1, 0, item);
            } else {
              state.people.splice(insertIndex, 0, item);
            }
            peopleSortKey = "manual";
            renderPeople();
            syncSoon();
          }
        }
      });

      tr.addEventListener("dragend", () => {
        tr.style.opacity = "1";
        tr.style.outline = "none";
      });

      const dragTd = document.createElement("td");
      dragTd.innerHTML = '<span style="color:#aaa; cursor:move; padding:4px;">☰</span>';

      const nameTd = document.createElement("td");
      nameTd.textContent = normalized.name;

      const sectionsTd = document.createElement("td");
      sectionsTd.textContent = normalized.sections.join("、");

      const categoriesTd = document.createElement("td");
      categoriesTd.textContent = normalized.categories.join("、");

      const noteTd = document.createElement("td");
      noteTd.textContent = normalized.note || "";

      const actionTd = document.createElement("td");
      const editButton = document.createElement("button");
      const deleteButton = document.createElement("button");
      editButton.type = "button";
      deleteButton.type = "button";
      editButton.textContent = "編輯";
      editButton.className = "edit-btn";
      editButton.disabled = !canManageThisPerson;
      editButton.title = canManageThisPerson ? "" : readonlyTitle();
      editButton.addEventListener("click", () => editPerson(normalized.id));

      deleteButton.textContent = "刪除";
      deleteButton.className = "delete-btn";
      deleteButton.disabled = !canManageThisPerson;
      deleteButton.title = canManageThisPerson ? "" : readonlyTitle();
      deleteButton.addEventListener("click", () => deletePerson(normalized.id));

      const actionWrapper = document.createElement("div");
      actionWrapper.className = "person-table-actions";
      actionWrapper.append(editButton, deleteButton);
      actionTd.append(actionWrapper);

      tr.append(dragTd, nameTd, sectionsTd, categoriesTd, noteTd, actionTd);
      tbody.append(tr);
    });
  }
  el.peopleTable.append(thead, tbody);
  updateAccessUi();
}

function editPerson(id) {
  const person = state.people.find((item) => item.id === id);
  if (!person) return;
  const normalized = normalizePerson(person);
  if (!canManagePeople(normalized)) {
    alert(readonlyTitle());
    return;
  }
  el.personId.value = normalized.id;
  el.personName.value = normalized.name;
  if (el.personNickname) el.personNickname.value = normalized.nickname || "";
  setSelectedPersonSections(normalized.sections);
  el.personDetail.value = normalized.note || "";
  renderServiceDetailChoices(normalized.categories, normalized.sections);
  openPersonModal("edit");
  setWarningBox(el.personMessage, [], "");
}

function deletePerson(id) {
  const person = state.people.find((p) => p.id === id);
  if (!person) return;
  if (!canManagePeople(person)) {
    alert(readonlyTitle());
    return;
  }
  if (confirm(`確定要刪除「${person.name}」嗎？`)) {
    state.people = state.people.filter((p) => p.id !== id);
    renderPeople();
    syncPeopleNow().catch(() => { });
  }
}

function submitPerson(event) {
  event.preventDefault();
  const name = el.personName.value.trim();
  const nickname = el.personNickname ? el.personNickname.value.trim() : "";
  const sections = selectedPersonSections();
  const note = el.personDetail.value.trim();
  const categories = Array.from(new Set(selectedPersonDetails()));
  const existingPerson = el.personId.value
    ? state.people.find((item) => item.id === el.personId.value)
    : null;

  if (!canManagePeople(existingPerson ? normalizePerson(existingPerson) : null)) {
    setWarningBox(el.personMessage, [readonlyTitle()], "權限不足");
    return;
  }

  if (!name) {
    setWarningBox(el.personMessage, ["請先輸入姓名。"], "無法新增");
    return;
  }
  if (!sections.length) {
    setWarningBox(el.personMessage, ["請至少選擇一個服事區塊。"], "無法新增");
    return;
  }
  if (!categories.length) {
    setWarningBox(el.personMessage, ["請至少選擇或新增一個服事類別。"], "無法新增");
    return;
  }

  if (activeAccountProfile()?.people === "children" && !(sections.length === 1 && sections[0] === "兒主")) {
    setWarningBox(el.personMessage, ["兒主帳號只能新增或編輯兒主區塊人員"], "權限不足");
    return;
  }

  const id = el.personId.value || crypto.randomUUID();
  const person = { id, name, nickname, sections, categories, note };
  const index = state.people.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.people[index] = person;
  } else {
    state.people.push(person);
  }

  clearPersonForm();
  if (el.personToolbarCancelBtn) {
    el.personToolbarCancelBtn.hidden = true;
  }
  if (el.personModal) {
    el.personModal.hidden = true;
  }
  renderPeople();
  syncPeopleNow().catch(() => { });
}

function render() {

  ensureVisibleRolePage();
  if (activeRolePage === "people") {
    updatePeriodUi();
    renderPeople();
    return;
  }
  if (activeRolePage === "analytics") {
    updatePeriodUi();
    renderAnalytics();
    return;
  }
  renderSchedule();
  renderChildrenRoster();
}

function splitLegacyRoles(rolesText) {
  const lines = String(rolesText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    main: lines.filter((line) => !line.includes("兒主")).join("\n"),
    children: lines.filter((line) => line.includes("兒主")).join("\n"),
  };
}

function sanitizeRoleText(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name] = line.split(/[：:]/);
      return name.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function sanitizeChildrenRoleText(value) {
  return sanitizeRoleText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      return line !== "新欄位";
    })
    .join("\n");
}

function normalizeExtraColumns(rawExtraColumns) {
  const childrenColumns = rawExtraColumns?.children;
  if (Array.isArray(childrenColumns)) {
    return {
      children: {
        beforeBigClass: Array.from(new Set(childrenColumns.map((item) => String(item).trim()).filter(Boolean))),
        afterBigClass: [],
      },
    };
  }

  return {
    children: {
      beforeBigClass: Array.from(new Set((childrenColumns?.beforeBigClass || []).map((item) => String(item).trim()).filter(Boolean))),
      afterBigClass: Array.from(new Set((childrenColumns?.afterBigClass || []).map((item) => String(item).trim()).filter(Boolean))),
    },
  };
}

function defaultPeriods() {
  const today = new Date();
  const planningSecondHalf = today.getMonth() < 6;
  const year = planningSecondHalf ? today.getFullYear() : today.getFullYear() + 1;
  const mainHalf = planningSecondHalf ? "2" : "1";
  const childrenQuarter = planningSecondHalf ? "3" : "1";
  return { year, mainHalf, childrenQuarter };
}

function periodIdFromControls(section = activeRolePage) {
  const year = Number(el.periodYear.value);
  if (!Number.isInteger(year)) return "";
  if (section === "children") {
    return `children-${year}-Q${Number(el.childrenQuarter.value || 1)}`;
  }
  return `main-${year}-H${Number(el.mainHalf.value || 1)}`;
}

function periodSectionForPage(page = activeRolePage) {
  return page === "children" ? "children" : "main";
}

function periodRecordById(scheduleId) {
  for (const section of ["main", "children"]) {
    const found = periodCatalog[section].find((period) => period.id === scheduleId);
    if (found) return found;
  }
  return null;
}

function setPeriodControlsForSection(section) {
  const record = selectedPeriodRecords[section];
  if (!record) return;
  el.periodYear.value = String(record.year);
  if (section === "children") {
    el.childrenQuarter.value = String(Number(record.periodCode.slice(1)));
  } else {
    el.mainHalf.value = String(Number(record.periodCode.slice(1)));
  }
  syncPeriodChoiceUi();
}

function updatePeriodStatusBadge() {
  if (!el.periodStatusBadge) return;
  const section = periodSectionForPage();
  const selectedId = periodIdFromControls(section);
  const record = periodRecordById(selectedId);
  const applyButton = document.querySelector("#applyPeriodBtn");
  el.periodStatusBadge.hidden = false;
  el.periodStatusBadge.classList.toggle("read-only", record?.status === "archived");
  el.periodStatusBadge.classList.toggle("missing", !record);
  if (!record) {
    el.periodStatusBadge.textContent = "尚未建立";
    if (applyButton) {
      const periodCode = selectedId.split("-").at(-1);
      applyButton.textContent = accountCanCreatePeriod(section, periodCode)
        ? "建立檔期"
        : "尚未建立";
    }
  } else if (record.status === "archived") {
    el.periodStatusBadge.textContent = "歷史唯讀";
    if (applyButton) applyButton.textContent = "載入檔期";
  } else {
    el.periodStatusBadge.textContent = "編輯中檔期";
    if (applyButton) applyButton.textContent = "載入檔期";
  }
}

function mergeSelectedPeriodStates() {
  const main = selectedPeriodStates.main || {};
  const children = selectedPeriodStates.children || {};
  const ruleMemos = new Map();
  for (const memo of [...(main.ruleMemos || []), ...(children.ruleMemos || [])]) {
    ruleMemos.set(memo?.id || JSON.stringify(memo), memo);
  }
  return {
    ...main,
    periodYear: String(
      selectedPeriodRecords[periodSectionForPage()]?.year
      || selectedPeriodRecords.main?.year
      || selectedPeriodRecords.children?.year
      || new Date().getFullYear()
    ),
    mainHalf: String(Number(selectedPeriodRecords.main?.periodCode?.slice(1) || 1)),
    childrenQuarter: String(Number(selectedPeriodRecords.children?.periodCode?.slice(1) || 1)),
    title: main.title || children.title || "",
    sectionDates: {
      main: [...(main.sectionDates?.main || [])],
      children: [...(children.sectionDates?.children || [])]
    },
    dates: [...new Set([
      ...(main.sectionDates?.main || []),
      ...(children.sectionDates?.children || [])
    ])].sort(),
    assignments: {
      ...(main.assignments || {}),
      ...(children.assignments || {})
    },
    locked: {
      ...(main.locked || {}),
      ...(children.locked || {})
    },
    notes: {
      main: { ...(main.notes?.main || {}) },
      children: { ...(children.notes?.children || {}) }
    },
    extraColumns: children.extraColumns || {
      beforeBigClass: [],
      afterBigClass: []
    },
    extraValues: { ...(main.extraValues || {}), ...(children.extraValues || {}) },
    childrenRoster: { ...(children.childrenRoster || {}) },
    ruleMemos: [...ruleMemos.values()],
    temporaryRules: [
      ...(main.temporaryRules || []),
      ...(children.temporaryRules || [])
    ]
  };
}

function applySelectedPeriodWorkspace() {
  applyingRemote = true;
  applySnapshot(mergeSelectedPeriodStates());
  setPeriodControlsForSection(periodSectionForPage());
  applyingRemote = false;
  updatePeriodStatusBadge();
  updateAccessUi();
  render();
  fetchAttendance(selectedPeriodIds.main);
}

async function refreshPeriodCatalog() {
  const response = await fetch(workerApiUrl("/schedule-periods"), { cache: "no-store" });
  if (!response.ok) throw new Error("無法讀取排班檔期清單");
  const payload = await response.json();
  const periods = Array.isArray(payload.periods) ? payload.periods : [];
  periodCatalog = {
    main: periods.filter((period) => period.section === "main"),
    children: periods.filter((period) => period.section === "children")
  };
  const selectedYear = el.periodYear.value;
  populateYearOptions(selectedYear);
}

async function fetchPeriod(scheduleId) {
  const response = await fetch(
    workerApiUrl(`/schedule-periods/${encodeURIComponent(scheduleId)}`),
    { cache: "no-store" }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("無法讀取指定檔期");
  const payload = await response.json();
  return payload.period || null;
}

async function loadPeriod(section, scheduleId) {
  const period = await fetchPeriod(scheduleId);
  if (!period) return false;
  selectedPeriodIds[section] = period.id;
  selectedPeriodRecords[section] = period;
  selectedPeriodStates[section] = period.state || {};
  applySelectedPeriodWorkspace();
  return true;
}

function accountCanCreatePeriod(section, periodCode) {
  if (activeAccountCode === "A000") return true;
  return section === "children"
    && activeAccountCode === "A004"
    && ["Q2", "Q4"].includes(periodCode);
}

function createPeriodConfirmMessage(scheduleId) {
  const [, section, year, periodCode] = scheduleId.match(/^(main|children)-(\d{4})-(H[12]|Q[1-4])$/) || [];
  if (section === "main") {
    const childQuarter = periodCode === "H1" ? "第一季" : "第三季";
    return `即將建立「大堂 ${year} ${periodCode === "H1" ? "上半年" : "下半年"}」及「兒主 ${year} ${childQuarter}」。確認後，目前的大堂與兒主編輯中檔期將封存為唯讀，且無法恢復編輯。確定繼續嗎？`;
  }
  return `即將建立「兒主 ${year} 第${periodCode?.slice(1)}季」。確認後，目前的兒主編輯中檔期將封存為唯讀，且無法恢復編輯。確定繼續嗎？`;
}

async function handlePeriodConfirm() {
  if (!["main", "children"].includes(activeRolePage) || periodSwitchInProgress) return;
  const section = activeRolePage;
  const scheduleId = periodIdFromControls(section);
  if (!scheduleId) return;

  periodSwitchInProgress = true;
  updateAccessUi();
  setSyncStatus("正在切換檔期…", true);
  try {
    await flushPendingPeriodSave();
    const existing = periodRecordById(scheduleId) || await fetchPeriod(scheduleId);
    if (existing) {
      selectedPeriodIds[section] = existing.id;
      selectedPeriodRecords[section] = existing;
      selectedPeriodStates[section] = existing.state || (await fetchPeriod(existing.id))?.state || {};
      applySelectedPeriodWorkspace();
      setSyncStatus(existing.status === "archived" ? "歷史唯讀" : "共同編輯中", true);
      return;
    }

    const periodCode = scheduleId.split("-").at(-1);
    if (!accountCanCreatePeriod(section, periodCode)) {
      alert("此檔期尚未建立，且目前帳號沒有建立權限。");
      setPeriodControlsForSection(section);
      updatePeriodStatusBadge();
      return;
    }
    if (!confirm(createPeriodConfirmMessage(scheduleId))) {
      setPeriodControlsForSection(section);
      updatePeriodStatusBadge();
      return;
    }

    const response = await fetch(workerApiUrl("/schedule-periods"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
        "X-Account-Code": activeAccountCode
      },
      body: JSON.stringify({ scheduleId })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "建立檔期失敗");

    await refreshPeriodCatalog();
    for (const period of payload.created || []) {
      selectedPeriodIds[period.section] = period.id;
      selectedPeriodRecords[period.section] = period;
      selectedPeriodStates[period.section] = period.state || {};
    }
    applySelectedPeriodWorkspace();
    setSyncStatus("新檔期已建立", true);
  } catch (error) {
    console.error("Period switch failed:", error);
    alert(error.message || "切換檔期失敗");
    setPeriodControlsForSection(section);
    setSyncStatus("檔期切換失敗", false);
  } finally {
    periodSwitchInProgress = false;
    updateAccessUi();
    syncPeriodChoiceUi();
    updatePeriodStatusBadge();
  }
}

function populateYearOptions(selectedYear) {
  if (!el.periodYear) return;
  const baseYear = new Date().getFullYear();
  const years = new Set();
  for (let year = baseYear - 5; year <= baseYear + 10; year += 1) {
    years.add(String(year));
  }
  if (selectedYear) years.add(String(selectedYear));
  for (const period of [...periodCatalog.main, ...periodCatalog.children]) {
    years.add(String(period.year));
  }

  el.periodYear.innerHTML = Array.from(years)
    .sort((left, right) => Number(left) - Number(right))
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");
}

function syncPeriodChoiceUi() {
  el.periodChoices.forEach((button) => {
    const target = button.dataset.periodTarget;
    const value = button.dataset.value;
    button.dataset.periodDisabled = "";
    button.disabled = periodSwitchInProgress;
    button.classList.toggle("active", String(el[target]?.value || "") === value);
  });
}

function getActivePromptSection() {
  return activeRolePage === "children" ? "children" : "main";
}

function getRelatedPromptSection() {
  return getActivePromptSection() === "main" ? "children" : "main";
}


function serialize() {
  const mainRolesText = defaultMainRolesText;
  const childrenRolesText = defaultChildrenRolesText;
  const rolesText = [mainRolesText, childrenRolesText].filter(Boolean).join("\n");
  return {
    periodYear: el.periodYear.value,
    mainHalf: el.mainHalf.value,
    childrenQuarter: el.childrenQuarter.value,
    title: el.scheduleTitle.value,
    mainRolesText,
    childrenRolesText,
    rolesText,
    unavailableText: el.unavailableInput.value,
    dates: state.dates,
    sectionDates: state.sectionDates,
    assignments: state.assignments,
    locked: state.locked,
    notes: normalizeNotesState(state.notes),
    extraColumns: state.extraColumns,
    extraValues: state.extraValues,
    childrenRoster: state.childrenRoster,
    ruleMemos: state.ruleMemos || [],
    temporaryRules: state.temporaryRules || [],
  };
}

function serializePeopleState() {
  return {
    people: state.people.map((person) => normalizePerson(person)),
    serviceDetails: Array.from(new Set(state.serviceDetails || [])),
  };
}

function formatHistoryTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function cleanLegacyPeopleAndAssignments(state) {
  if (!state) return;
  // Person-specific aliases belong to private schedule data, not source code.
  const SHORT_NAME_MAP = {};

  if (Array.isArray(state.people)) {
    const peopleMap = new Map();

    state.people.forEach(p => {
      if (!p || !p.name) return;
      const originalName = p.name.trim();
      const targetName = SHORT_NAME_MAP[originalName] || originalName;

      const sections = Array.isArray(p.sections)
        ? p.sections
        : (p.category ? [p.category] : ["大堂"]);
      const categories = Array.isArray(p.categories)
        ? p.categories
        : (Array.isArray(p.details) ? p.details : (p.detail ? p.detail.split(/[、,，]/).map(x => x.trim()).filter(Boolean) : []));

      if (categories.includes("餅杯服事") && !sections.includes("餅杯")) {
        sections.push("餅杯");
      }

      if (peopleMap.has(targetName)) {
        const existing = peopleMap.get(targetName);
        existing.sections = Array.from(new Set([...existing.sections, ...sections]));
        existing.categories = Array.from(new Set([...existing.categories, ...categories]));
      } else {
        peopleMap.set(targetName, {
          id: p.id || crypto.randomUUID(),
          name: targetName,
          sections: [...sections],
          categories: [...categories]
        });
      }
    });

    state.people = Array.from(peopleMap.values());
  }

  if (state.assignments && typeof state.assignments === "object") {
    Object.keys(state.assignments).forEach(key => {
      const assigned = state.assignments[key];
      if (typeof assigned === "string") {
        const trimmed = assigned.trim();
        if (SHORT_NAME_MAP[trimmed]) {
          state.assignments[key] = SHORT_NAME_MAP[trimmed];
        }
      }
    });
  }
}

function applySnapshot(saved) {
  const defaults = defaultPeriods();
  const selectedYear = saved?.periodYear || defaults.year;

  populateYearOptions(selectedYear);
  el.periodYear.value = String(selectedYear);
  el.mainHalf.value = saved?.mainHalf || defaults.mainHalf;
  el.childrenQuarter.value = saved?.childrenQuarter || defaults.childrenQuarter;
  syncPeriodChoiceUi();
  el.scheduleTitle.value = saved?.title || `台中基督徒西屯禮拜堂 ${el.periodYear.value}年主日服事輪值表`;
  el.mainRolesInput.value = defaultMainRolesText;
  el.childrenRolesInput.value = defaultChildrenRolesText;
  el.unavailableInput.value = saved?.unavailableText || defaultUnavailableText;

  state.sectionDates = saved?.sectionDates || {
    main: saved?.dates?.length ? saved.dates : makeSundaysBetween(periodRange("main").start, periodRange("main").end),
    children: saved?.dates?.length ? saved.dates : makeSundaysBetween(periodRange("children").start, periodRange("children").end),
  };
  state.assignments = saved?.assignments || {};
  state.locked = saved?.locked || {};
  state.notes = normalizeNotesState(saved?.notes);
  state.extraColumns = normalizeExtraColumns(saved?.extraColumns);
  state.extraValues = saved?.extraValues || {};
  state.childrenRoster = saved?.childrenRoster || {};

  state.ruleMemos = saved?.ruleMemos || [];
  rebuildTemporaryRules();

  cleanLegacyPeopleAndAssignments(state);

  refreshDates();
  if (typeof renderTemporaryRules === 'function') renderTemporaryRules();
  render();
}

function applyPeopleState(saved) {
  state.people = Array.isArray(saved?.people)
    ? saved.people.map(normalizePerson)
    : [];
  state.serviceDetails = Array.from(new Set(saved?.serviceDetails || []));
  if (activeRolePage === "people") {
    renderPeople();
    return;
  }
  render();
  setupFeedbackPanelListeners();
}

// ----------------------------------------------------
// 公告頁回饋功能邏輯
// ----------------------------------------------------

function setupFeedbackPanelListeners() {
  if (feedbackPanelListenersReady || !el.openFeedbackBtn) return;

  el.openFeedbackBtn.addEventListener('click', openFeedbackPanel);
  el.closeFeedbackBtn?.addEventListener('click', closeFeedbackPanel);
  el.panelOverlay?.addEventListener('click', closeFeedbackPanel);

  el.mainFeedbackReviewBtn?.addEventListener('click', openFeedbackReviewModal);
  el.feedbackReviewCloseBtn?.addEventListener('click', closeFeedbackReviewModal);
  el.feedbackMessage?.addEventListener('input', validateFeedbackForm);
  el.submitFeedbackBtn?.addEventListener('click', () => submitFeedbackData(false));

  el.rolePromptCloseBtn?.addEventListener('click', () => {
    if (el.rolePromptModal) el.rolePromptModal.hidden = true;
  });
  el.rolePromptSkipBtn?.addEventListener('click', () => {
    if (!el.rolePromptModal) return;
    el.rolePromptModal.hidden = true;
    submitFeedbackData(true);
  });
  el.rolePromptConfirmBtn?.addEventListener('click', () => {
    if (!el.rolePromptOptions || !el.rolePromptModal) return;
    const checked = Array.from(el.rolePromptOptions.querySelectorAll('input:checked')).map(cb => cb.value);
    if (checked.length > 0) {
      el.feedbackMessage.value = el.feedbackMessage.value.trim() + `\n[服事項目: ${checked.join(', ')}]`;
    }
    el.rolePromptModal.hidden = true;
    submitFeedbackData(true);
  });

  feedbackPanelListenersReady = true;
}

function openFeedbackPanel() {
  el.feedbackPanel.classList.add('open');
  el.panelOverlay.classList.add('show');
  document.body.classList.add('feedback-mode');
  setTimeout(() => el.feedbackMessage.focus(), 300);
}

function closeFeedbackPanel() {
  el.feedbackPanel.classList.remove('open');
  el.panelOverlay.classList.remove('show');
  document.body.classList.remove('feedback-mode');
}

async function openFeedbackReviewModal() {
  await fetchFeedbacks();
  renderFeedbacks();
  el.feedbackReviewModal.hidden = false;
}

function closeFeedbackReviewModal() {
  el.feedbackReviewModal.hidden = true;
}

function validateFeedbackForm() {
  const msg = el.feedbackMessage.value.trim();
  el.submitFeedbackBtn.disabled = msg.length === 0;
}

async function submitFeedbackData(force = false) {
  if (el.submitFeedbackBtn.disabled) return;
  const msg = el.feedbackMessage.value.trim();

  if (force !== true && msg.length > 0) {
    const roleList = activeRolePage === "children" ? fixedChildrenRoleNames : fixedMainRoleNames;
    const hasRole = roleList.some(role => msg.includes(role));

    if (!hasRole) {
      if (!el.rolePromptOptions || !el.rolePromptModal) {
        console.warn('[Feedback] Role prompt is unavailable; submitting without role selection.');
        return submitFeedbackData(true);
      }
      el.rolePromptOptions.innerHTML = '';
      roleList.forEach(role => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '8px';
        label.style.cursor = 'pointer';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = role;

        label.appendChild(cb);
        label.appendChild(document.createTextNode(role));
        el.rolePromptOptions.appendChild(label);
      });
      el.rolePromptModal.hidden = false;
      return;
    }
  }

  // 將回饋綁定到送出時的頁籤（大堂或兒主）
  const payload = {
    person: '排班回饋',
    sections: [activeRolePage === "children" ? "children" : "main"],
    dates: [],
    message: msg
  };

  el.submitFeedbackBtn.disabled = true;
  el.submitFeedbackBtn.textContent = '送出中...';
  el.submitStatus.style.display = 'none';

  try {
    const res = await fetch(workerApiUrl('/feedbacks'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('送出失敗');

    await fetchFeedbacks();
    el.submitFeedbackBtn.style.display = 'none';
    el.submitStatus.style.display = 'block';
    el.submitStatus.style.color = 'var(--success-600)';
    el.submitStatus.innerHTML = '✅ 已收到您的回饋，等待管理者確認。<br><span style="color:#666">將自動關閉此視窗</span>';

    // 自動復位
    setTimeout(() => {
      closeFeedbackPanel();
      // 復原狀態供下次使用
      el.submitFeedbackBtn.style.display = 'block';
      el.submitFeedbackBtn.textContent = '送出回饋';
      el.submitStatus.style.display = 'none';
      el.feedbackMessage.value = '';
      validateFeedbackForm();
    }, 2000);
  } catch (error) {
    el.submitFeedbackBtn.disabled = false;
    el.submitFeedbackBtn.textContent = '重新送出';
    el.submitStatus.style.display = 'block';
    el.submitStatus.style.color = 'var(--danger-600)';
    el.submitStatus.textContent = '❌ 送出失敗，請重試。';
  }
}

async function save() {
  if (!remoteMode) {
    setSyncStatus("後端未連線，無法儲存", false);
    throw new Error("後端未連線，無法儲存");
  }
  if (periodSavePromise) await periodSavePromise;
  const sections = [...dirtyPeriodSections];
  if (!sections.length) {
    draftDirty = false;
    return;
  }
  sections.forEach((section) => dirtyPeriodSections.delete(section));
  const snapshot = serialize();

  periodSavePromise = (async () => {
    try {
      for (const section of sections) {
        const period = selectedPeriodRecords[section];
        if (!period) throw new Error(`目前沒有可儲存的${section === "main" ? "大堂" : "兒主"}檔期`);
        if (period.status !== "active") throw new Error("歷史檔期為唯讀，不能儲存");
        const response = await fetch(
          workerApiUrl(`/schedule-periods/${encodeURIComponent(period.id)}/state`),
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "X-Client-Id": clientId,
              "X-Account-Code": activeAccountCode
            },
            body: JSON.stringify({
              baseRevision: period.revision,
              state: snapshot,
              saveType: "draft"
            })
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload.error || payload.message || "後端儲存失敗");
          error.code = payload.code;
          throw error;
        }
        selectedPeriodRecords[section] = payload.period;
        selectedPeriodStates[section] = payload.period?.state || {};
      }
      clearTimeout(syncRetryTimer);
      setSyncStatus("草稿已同步", true);
    } catch (error) {
      sections.forEach((section) => dirtyPeriodSections.add(section));
      throw error;
    } finally {
      periodSavePromise = null;
      draftDirty = dirtyPeriodSections.size > 0;
    }
  })();

  return periodSavePromise;
}

async function savePeopleState() {
  if (!remoteMode) {
    throw new Error("後端未連線，無法儲存服事人員");
  }

  const response = await fetch(workerApiUrl("/people-state"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
      "X-Account-Code": activeAccountCode
    },
    body: JSON.stringify(serializePeopleState()),
  });

  if (!response.ok) {
    let errorMessage = "服事人員儲存失敗";
    try {
      const payload = await response.json();
      errorMessage = payload?.error || payload?.message || errorMessage;
    } catch {
      const text = await response.text().catch(() => "");
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }
}

function closeDownloadModal() {
  if (!el.downloadModal) return;
  el.downloadModal.hidden = true;
}

function openDownloadModal() {
  if (!el.downloadModal) return;
  el.downloadModal.hidden = false;
}

async function loadLatestDraft() {
  try {
    if (!remoteMode) throw new Error("後端未連線，無法讀取最新草稿");
    const [mainPeriod, childrenPeriod] = await Promise.all([
      selectedPeriodIds.main ? fetchPeriod(selectedPeriodIds.main) : Promise.resolve(null),
      selectedPeriodIds.children ? fetchPeriod(selectedPeriodIds.children) : Promise.resolve(null)
    ]);
    if (mainPeriod) {
      selectedPeriodRecords.main = mainPeriod;
      selectedPeriodStates.main = mainPeriod.state || {};
    }
    if (childrenPeriod) {
      selectedPeriodRecords.children = childrenPeriod;
      selectedPeriodStates.children = childrenPeriod.state || {};
    }
    applySelectedPeriodWorkspace();
    setSyncStatus("已讀取最新草稿", true);
  } catch (error) {
    alert(error.message);
  }
}

function setToolbarBusy(button, busy, busyText = "處理中...") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    return;
  }
  button.disabled = false;
  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}


function openDownloadChooser() {
  openDownloadModal();
}

function scheduleDraftRetry() {
  clearTimeout(syncRetryTimer);
  syncRetryTimer = setTimeout(() => {
    if (!draftDirty) return;
    save().catch((retryError) => {
      console.error("Draft sync retry failed:", retryError);
      setSyncStatus("草稿同步失敗", false);
    });
  }, 1500);
}

function handleDraftSyncError(error) {
  console.error("Draft sync failed:", error);
  if (error?.code === "REVISION_CONFLICT") {
    setSyncStatus("檔期已有遠端更新，請重新讀取後再編輯", false);
    return;
  }
  setSyncStatus("草稿同步失敗，將自動重試", false);
  scheduleDraftRetry();
}

function inferredDirtySections() {
  if (activeRolePage === "main" || activeRolePage === "children") {
    return [activeRolePage];
  }
  if (activeRolePage === "rules") {
    return ["main", "children"].filter((section) => (
      selectedPeriodRecords[section]?.status === "active"
      && canManageRules(section)
    ));
  }
  return [];
}

function markPeriodDirty(section = null) {
  const sections = section ? [section] : inferredDirtySections();
  sections.forEach((value) => {
    if (selectedPeriodRecords[value]?.status === "active") {
      dirtyPeriodSections.add(value);
    }
  });
  draftDirty = dirtyPeriodSections.size > 0;
}

function syncSoon(section = null) {
  if (applyingRemote) return;
  markPeriodDirty(section);
  if (!draftDirty) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    save().catch(handleDraftSyncError);
  }, 1500);
}

function syncNow(section = null) {
  if (applyingRemote) return Promise.resolve();
  if (!draftDirty) markPeriodDirty(section);
  if (!draftDirty) return Promise.resolve();
  clearTimeout(syncTimer);
  return save().catch((error) => {
    handleDraftSyncError(error);
    throw error;
  });
}

async function flushPendingPeriodSave() {
  clearTimeout(syncTimer);
  if (!periodSavePromise && !draftDirty) return;
  await save();
}

function syncPeopleNow() {
  if (applyingRemote) return Promise.resolve();
  return savePeopleState().catch((error) => {
    console.error("People sync failed:", error);
    setSyncStatus("服事人員同步失敗", false);
    throw error;
  });
}

function flushDraftOnPageExit() {
  if (!remoteMode || !draftDirty) return;
  const snapshot = serialize();
  const sections = [...dirtyPeriodSections];
  dirtyPeriodSections.clear();
  draftDirty = false;
  for (const section of sections) {
    const period = selectedPeriodRecords[section];
    if (!period || period.status !== "active") continue;
    fetch(workerApiUrl(`/schedule-periods/${encodeURIComponent(period.id)}/state`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
        "X-Account-Code": activeAccountCode
      },
      body: JSON.stringify({
        baseRevision: period.revision,
        state: snapshot,
        saveType: "page-exit"
      }),
      keepalive: true
    }).catch(() => { });
  }
}

function setSyncStatus(text, online = false) {
  el.syncStatus.textContent = text;
  el.syncStatus.classList.toggle("online", online);
}

function applyAccountCode() {
  activeAccountCode = String(el.accountInput?.value || "").trim().toUpperCase();
  if (el.accountInput) el.accountInput.value = activeAccountCode;
  if (!activeAccountCode) {
    setSyncStatus("公告模式", false);
    if (el.applyAccountBtn) el.applyAccountBtn.textContent = "套用";
    render();
    return;
  }
  const profile = activeAccountProfile();
  if (!profile) {
    setSyncStatus(`未知帳號 ${activeAccountCode}（公告模式）`, false);
    if (el.applyAccountBtn) el.applyAccountBtn.textContent = "套用";
    render();
    return;
  }
  setSyncStatus(`帳號 ${activeAccountCode}：${profile.label}`, true);
  if (el.applyAccountBtn) el.applyAccountBtn.textContent = "清除";
  render();
}

function buildPrintDocument() {
  if (activeRolePage === "people") {
    return null;
  }
  const isCompactPrint = activeRolePage === "output";
  const pageOrientation = activeRolePage === "children" ? "portrait" : "landscape";
  const printColumns = activeRolePage === "children"
    ? orderedVisibleColumns()
    : visibleRoles().map((role) => ({ type: "role", role }));
  const printDates = visibleDates();
  const title = el.scheduleTitle.value || "主日服事排班表";
  const contentHeightMm = isCompactPrint ? 118.8 : 99;
  const bodyRowHeightMm = Math.max(
    isCompactPrint ? 4.98 : 4.15,
    Number((contentHeightMm / Math.max(printDates.length + 1, 1)).toFixed(2))
  );
  const headerRowHeightMm = isCompactPrint ? 6.6 : 5.5;
  const dateWidthPercent = isCompactPrint ? 8.5 : 10.5;
  const baseNoteWidthPercent = isCompactPrint ? 3.5 : 14;
  const distributableWidthPercent = 100 - dateWidthPercent - baseNoteWidthPercent;
  const baseColumnWidthPercent = printColumns.length > 0
    ? distributableWidthPercent / printColumns.length
    : distributableWidthPercent;
  const narrowedColumnWidthPercent = Number((baseColumnWidthPercent * 0.9).toFixed(3));
  const noteWidthPercent = Number(
    (100 - dateWidthPercent - narrowedColumnWidthPercent * printColumns.length).toFixed(3)
  );

  const printGroupForColumn = (column) => {
    if (column === "日期") return "date";
    if (column === "備註") return "note";
    if (column.type === "extra") return "extra";
    return roleGroup(column.role.name);
  };

  const headerHtml = [
    { type: "system", label: "日期" },
    ...printColumns,
    { type: "system", label: "備註" }
  ].map((column) => {
    const label = column.type === "system"
      ? column.label
      : (column.type === "role" ? column.role.name : column.title);
    const group = column.type === "system" ? printGroupForColumn(column.label) : printGroupForColumn(column);
    const widthClass = column.type === "system"
      ? (column.label === "日期" ? "date-col" : "note-col")
      : (column.type === "role"
        ? (isCompactPrint && column.role.name.includes("餅杯") ? "role-col communion-col" : "role-col")
        : "extra-col");
    return `<th class="group-${group} ${widthClass}">${label}</th>`;
  }).join("");

  const bodyHtml = printDates.map((date) => {
    const cells = [
      `<td class="date-col">${displayDate(date)}</td>`,
      ...printColumns.map((column) => (
        column.type === "role"
          ? `<td class="role-col${isCompactPrint && column.role.name.includes("餅杯") ? " communion-col" : ""}">${getShortenedName(column.role.name, state.assignments[cellKey(date, column.role.name)] || "")}</td>`
          : `<td class="extra-col">${(state.extraValues[extraColumnKey(date, column)] || "").replace(/\n/g, '<br>')}</td>`
      )),
      `<td class="note-col">${(buildNoteDisplayText(date, activeRolePage === "output" ? "output" : activeRolePage) || "").replace(/\n/g, '<br>')}</td>`
    ].join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  const printMarkup = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page {
      size: A4 ${pageOrientation};
      margin: ${isCompactPrint ? "6mm" : "6mm"};
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: "Microsoft JhengHei", "PingFang TC", sans-serif;
      padding: 0;
    }
    h1 {
      margin: 0 0 ${isCompactPrint ? "4px" : "8px"};
      font-size: ${isCompactPrint ? "15px" : "20px"};
      text-align: center;
      line-height: 1.2;
    }
    .sheet {
      width: ${isCompactPrint ? "98%" : "100%"};
      margin: 0 auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #222;
      padding: ${isCompactPrint ? "1px 2px" : "4px 3px"};
      font-size: ${isCompactPrint ? "10.8px" : "12px"};
      text-align: center;
      vertical-align: middle;
      word-break: break-word;
      line-height: ${isCompactPrint ? "1.02" : "1.15"};
    }
    th {
      font-weight: 700;
      height: ${headerRowHeightMm}mm;
    }
    .group-date,
    .group-note {
      background: #fff45c;
    }
    .group-speaker { background: #fff176; }
    .group-worship { background: #d9f0f7; }
    .group-media { background: #d8f3dc; }
    .group-usher { background: #fbcfe8; }
    .group-children { background: #d9f0f7; }
    .group-extra { background: #fde68a; }
    .date-col {
      background: #fffdf6;
      font-weight: 700;
      white-space: nowrap;
      width: ${dateWidthPercent}%;
    }
    .role-col {
      width: ${activeRolePage === "children" ? "8%" : narrowedColumnWidthPercent + "%"};
    }
    .extra-col {
      width: ${activeRolePage === "children" ? "30%" : narrowedColumnWidthPercent + "%"};
    }
    .communion-col {
      width: ${(narrowedColumnWidthPercent + 2).toFixed(3)}%;
    }
    .note-col {
      background: #fffdf6;
      width: ${noteWidthPercent}%;
      font-size: ${isCompactPrint ? "11.2px" : "12.4px"};
      overflow: hidden;
      text-overflow: ellipsis;
    }
    tbody td {
      height: ${bodyRowHeightMm}mm;
    }
          tbody td:not(.date-col):not(.note-col) {
        white-space: nowrap;
        font-size: ${isCompactPrint ? "11.2px" : "12.4px"};
      }
      .children-roster-table {
        table-layout: fixed;
        margin-top: 10px;
      }
      .children-roster-table th, .children-roster-table tbody td {
        white-space: pre-wrap !important;
        word-break: break-word !important;
      }
      .children-roster-table th:first-child, .children-roster-table td:first-child {
          width: 9%;
        }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${title}</h1>
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
      </table>
      ${activeRolePage === "children" && el.childrenRosterContainer ? el.childrenRosterContainer.innerHTML.replace(/<textarea[^>]*>([\s\S]*?)<\/textarea>/g, '$1').replace(/border:\s*1px\s*solid\s*transparent;/g, '') : ""}
    </div>
  </body>
</html>`;

  return { title, printMarkup, isCompactPrint, printColumns, printDates };
}

function printCurrentTable() {
  const doc = buildPrintDocument();
  if (!doc) {
    alert("目前頁面沒有可列印的排班表格。");
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      iframe.remove();
    }, 1000);
  };

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    frameWindow.focus();
    setTimeout(() => {
      frameWindow.print();
      cleanup();
    }, 150);
  };

  const frameDocument = iframe.contentDocument || iframe.contentWindow?.document;
  if (!frameDocument) {
    cleanup();
    return;
  }
  frameDocument.open();
  frameDocument.write(doc.printMarkup);
  frameDocument.close();
}

async function downloadCurrentTableAsJpg() {
  const doc = buildPrintDocument();
  if (!doc) {
    alert("目前頁面沒有可下載的排班表格。");
    return;
  }

  const rowCount = doc.printDates.length + 2;
  const colCount = doc.printColumns.length + 2;
  const isPortrait = activeRolePage === "children";
  let baseWidth = isPortrait ? 1000 : Math.max(1400, colCount * 150);
  let baseHeight = isPortrait ? Math.max(1414, rowCount * 52 + 500) : Math.max(900, rowCount * 52);

  if (isPortrait) {
    baseHeight = Math.max(baseHeight, baseWidth * 1.414);
  } else {
    baseWidth = Math.max(baseWidth, baseHeight * 1.414);
  }
  const width = baseWidth;
  const height = baseHeight;

  const parser = new DOMParser();
  const docHtml = parser.parseFromString(doc.printMarkup, "text/html");
  const sheetNode = docHtml.querySelector(".sheet");

  // Inject style block into the serialized XML so it applies inside the SVG
  const styleNode = docHtml.querySelector("style");
  if (styleNode) sheetNode.prepend(styleNode);

  const xmlSerializer = new XMLSerializer();
  const validXml = xmlSerializer.serializeToString(sheetNode);

  const padding = 40;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject x="${padding}" y="${padding}" width="${width - padding * 2}" height="${height - padding * 2}">
        ${validXml}
      </foreignObject>
    </svg>
  `;

  const svgData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = (e) => reject(new Error("Image load error"));
    });
    image.src = svgData;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0);

    const jpgUrl = canvas.toDataURL("image/jpeg", 0.96);
    const link = document.createElement("a");
    link.href = jpgUrl;
    link.download = `${doc.title || "主日服事排班表"}.jpg`;
    link.click();
  } catch (e) {
    alert("JPG 下載失敗: " + (e.message || e));
  }
}

async function downloadCurrentTableAsPdf() {
  closeDownloadModal();
  alert("將開啟列印視窗，請在目的地選擇「另存為 PDF」。");
  printCurrentTable();
}

function updatePeriodUi() {
  const isSchedulePage = ["main", "children", "output"].includes(activeRolePage);
  const isOutput = activeRolePage === "output";
  const isPeople = activeRolePage === "people";
  const isRules = activeRolePage === "rules";
  const isAnalytics = activeRolePage === "analytics";
  const isMainOrChildren = activeRolePage === "main" || activeRolePage === "children";
  syncPeriodChoiceUi();
  el.layout.classList.toggle("settings-mode", !isOutput);

  // 所有分頁全面取消側邊欄，改為 100% 全版面
  el.layout.classList.add("full-width");

  if (el.sidePanel) {
    el.sidePanel.style.display = "none";
  }

  // 控制頂部新橫式時間配置列的顯隱
  if (el.periodHorizontalConfig) {
    el.periodHorizontalConfig.style.display = isMainOrChildren ? "flex" : "none";
  }
  if (el.openFeedbackBtn) {
    el.openFeedbackBtn.style.display = activeRolePage === "main" ? "" : "none";
  }

  el.mainPeriodControls.classList.toggle("active", activeRolePage === "main");
  el.childrenPeriodControls.classList.toggle("active", activeRolePage === "children");

  document.querySelector("#applyPeriodBtn").disabled = !isMainOrChildren || periodSwitchInProgress;
  const canManage = canManageSchedulePage(activeRolePage);
  document.querySelector("#generateBtn").disabled = activeRolePage !== "main" || !canManage;
  document.querySelector("#generateBtn").style.display = (activeRolePage === "main" && canManage) ? "" : "none";
  if (el.scheduleLogBtn) {
    el.scheduleLogBtn.disabled = activeRolePage !== "main" || !canManage;
    el.scheduleLogBtn.style.display =
      (activeRolePage === "main" && canManage) ? "" : "none";
  }
  document.querySelector("#auditBtn").style.display = (activeRolePage === "main" && Object.keys(state.assignments).length > 0 && canManage) ? "" : "none";
  el.schedulePage.style.display = isSchedulePage && !isRules ? "block" : "none";
  el.personnelPage.style.display = isPeople ? "block" : "none";
  const rulesPage = document.querySelector("#rulesPage");
  if (rulesPage) rulesPage.style.display = isRules ? "block" : "none";
  const analyticsPage = document.querySelector("#analyticsPage");
  if (analyticsPage) analyticsPage.style.display = isAnalytics ? "block" : "none";
  document.querySelector("#clearBtn").style.display = activeRolePage === "output" || isPeople || isRules || isAnalytics || !canManage ? "none" : "";
  const stickyToolbar = document.querySelector(".sticky-toolbar");
  if (stickyToolbar) stickyToolbar.style.display = (isPeople || isRules || isAnalytics) ? "none" : "flex";

  if (isOutput) {
    el.periodHint.textContent = "目前設定：合併輸出";
  } else if (isPeople) {
    el.periodHint.textContent = "目前設定：服事人員設定";
  } else if (isRules) {
    el.periodHint.textContent = "目前設定：規則設定";
  } else if (isAnalytics) {
    el.periodHint.textContent = "目前設定：主日人數統計與趨勢";
  } else {
    const range = periodRange(activeRolePage);
    el.periodHint.textContent = `目前設定：${activeRolePage === "main" ? "大堂" : "兒主"} ${range.label}`;
    updatePeriodStatusBadge();
  }
}

if (settingsTabButton) {
  settingsTabButton.textContent = "服事人員設定";
}

if (personnelTitle) {
  personnelTitle.textContent = "服事人員設定";
}

if (personnelHint) {
  personnelHint.textContent = "管理同工資料與可服事項目。";
}

async function setRolePage(page) {
  if ((page === "rules" || page === "people") && !canViewSettingsTabs()) {
    page = "main";
  }
  if (page === activeRolePage || periodSwitchInProgress) return;
  try {
    await flushPendingPeriodSave();
  } catch (error) {
    alert(`草稿尚未儲存，無法切換頁面：${error.message}`);
    return;
  }
  activeRolePage = page;
  if (page === "main" || page === "children") {
    setPeriodControlsForSection(page);
  }
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.rolePage === page);
  });
  document.querySelector("#mainRolePage").classList.toggle("active", page === "main");
  document.querySelector("#childrenRolePage").classList.toggle("active", page === "children");
  document.querySelector("#outputRolePage").classList.toggle("active", page === "output");
  document.querySelector("#peopleRolePage").classList.toggle("active", page === "people");
  document.querySelector("#rulesPage").classList.toggle("active", page === "rules");
  document.querySelector("#analyticsPage")?.classList.toggle("active", page === "analytics");
  if (typeof renderRuleMemos === 'function') renderRuleMemos();
  updatePeriodStatusBadge();
  updateAccessUi();
  render();
}

async function initRemoteSync() {
  try {
    const peopleResponse = await fetch(workerApiUrl("/people-state"), { cache: "no-store" });
    await refreshPeriodCatalog();
    remoteMode = true;
    const peopleSnapshot = peopleResponse.ok ? await peopleResponse.json() : { people: [], serviceDetails: [] };
    const activeMain = periodCatalog.main.find((period) => period.status === "active") || null;
    const activeChildren = periodCatalog.children.find((period) => period.status === "active") || null;
    const [mainPeriod, childrenPeriod] = await Promise.all([
      activeMain ? fetchPeriod(activeMain.id) : Promise.resolve(null),
      activeChildren ? fetchPeriod(activeChildren.id) : Promise.resolve(null)
    ]);

    selectedPeriodIds = {
      main: mainPeriod?.id || null,
      children: childrenPeriod?.id || null
    };
    selectedPeriodRecords = {
      main: mainPeriod,
      children: childrenPeriod
    };
    selectedPeriodStates = {
      main: mainPeriod?.state || null,
      children: childrenPeriod?.state || null
    };
    periodsReady = true;
    applyingRemote = true;
    applySnapshot(mergeSelectedPeriodStates());
    setPeriodControlsForSection(periodSectionForPage());
    applyPeopleState(peopleSnapshot);
    applyingRemote = false;
    await fetchAttendance();
    updatePeriodStatusBadge();
    updateAccessUi();
    setSyncStatus("共同編輯中", true);

    const events = new EventSource(`${workerApiUrl("/events")}?client=${clientId}`);
    events.addEventListener("schedule", (event) => {
      if (periodsReady) return;
      const payload = JSON.parse(event.data);
      if (payload.clientId === clientId) return;
      applyingRemote = true;
      applySnapshot(payload.state);
      applyingRemote = false;
      setSyncStatus("已收到更新", true);
    });
    events.addEventListener("schedule-period", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.clientId === clientId) return;
      const period = payload.state?.period;
      if (!period || selectedPeriodIds[period.section] !== period.id) return;
      if (dirtyPeriodSections.has(period.section) || periodSavePromise) {
        setSyncStatus("偵測到遠端更新，請先完成目前編輯", false);
        return;
      }
      selectedPeriodRecords[period.section] = period;
      selectedPeriodStates[period.section] = period.state || {};
      applySelectedPeriodWorkspace();
      setSyncStatus("已收到檔期更新", true);
    });
    events.addEventListener("schedule-periods", async () => {
      try {
        await refreshPeriodCatalog();
        for (const section of ["main", "children"]) {
          const refreshed = periodRecordById(selectedPeriodIds[section]);
          if (refreshed) {
            selectedPeriodRecords[section] = {
              ...selectedPeriodRecords[section],
              ...refreshed
            };
          }
        }
        updateAccessUi();
        render();
        updatePeriodStatusBadge();
      } catch (error) {
        console.error("Period catalog refresh failed:", error);
      }
    });

    // 監聽回饋通知更新
    events.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'feedback_update') {
          fetchFeedbacks();
        }
        if (
          payload.type === 'attendance_update'
          && payload.scheduleId === selectedPeriodIds.main
        ) {
          fetchAttendance(payload.scheduleId);
        }
      } catch (e) { }
    });
    events.addEventListener("people", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.clientId === clientId) return;
      applyingRemote = true;
      applyPeopleState(payload.state);
      applyingRemote = false;
      setSyncStatus("已收到更新", true);
    });
    events.addEventListener("open", () => setSyncStatus("共同編輯中", true));
    events.addEventListener("error", () => setSyncStatus("重新連線中", false));

  } catch {
    remoteMode = false;
    periodsReady = false;
    applySnapshot(null);
    setSyncStatus("後端未連線", false);
  }
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    setRolePage(button.dataset.rolePage).catch(console.error);
  });
});

// --- 回饋通知抽屜邏輯 ---
let pendingFeedbacks = [];

async function fetchFeedbacks() {
  try {
    const res = await fetch(workerApiUrl('/feedbacks'));
    if (res.ok) {
      pendingFeedbacks = await res.json();
      renderFeedbacks();
      updateBells();
    }
  } catch (err) {
    console.error('Failed to fetch feedbacks', err);
  }
}

function updateBells() {
  const totalCount = pendingFeedbacks.length;
  el.feedbackCountBadges?.forEach((badge) => {
    badge.textContent = totalCount;
    badge.hidden = totalCount === 0;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFeedbacks() {
  if (!el.feedbackList) return;

  if (pendingFeedbacks.length === 0) {
    el.feedbackList.innerHTML = '<p class="hint" style="text-align:center; padding: 2rem;">目前沒有新通知</p>';
    return;
  }

  let html = '';
  pendingFeedbacks.forEach(f => {
    const dateStr = new Date(f.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    html += `
      <div class="feedback-item" data-id="${f.id}">
        <div class="feedback-item-header">
          <span class="feedback-item-name">排班回饋</span>
          <span class="feedback-item-date">${dateStr}</span>
        </div>
        <div class="feedback-item-body">
          ${escapeHtml(f.message).replace(/\n/g, '<br>')}
        </div>
        <div class="feedback-item-actions">
          <button type="button" class="dismiss-btn" data-id="${f.id}">❌ 略過</button>
          <button type="button" class="primary confirm-feedback-btn" data-id="${f.id}">✅ 確認建立規則</button>
        </div>
      </div>
    `;
  });

  el.feedbackList.innerHTML = html;

  // 綁定按鈕事件
  el.feedbackList.querySelectorAll('.confirm-feedback-btn').forEach(btn => {
    btn.disabled = !hasAdminAccess();
    btn.title = hasAdminAccess() ? "" : readonlyTitle();
    btn.addEventListener('click', async (e) => {
      if (!hasAdminAccess()) {
        alert(readonlyTitle());
        return;
      }
      const id = e.currentTarget.dataset.id;
      const feedback = pendingFeedbacks.find(f => f.id == id);
      if (!feedback) return;

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = '解析中...';

      try {
        await createRuleMemoFromText({
          text: feedback.message,
          scope: (feedback.sections && feedback.sections.length > 0 && feedback.sections[0] !== 'global') ? feedback.sections[0] : 'main',
          selectedRoles: [],
          source: 'feedback'
        });
        await fetch(workerApiUrl(`/feedbacks/${id}/apply`), { method: 'POST' });
        await fetchFeedbacks();
      } catch (err) {
        console.error('Error confirming feedback', err);
        alert('回饋解析失敗，尚未建立規則：' + err.message);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });

  el.feedbackList.querySelectorAll('.dismiss-btn').forEach(btn => {
    btn.disabled = !hasAdminAccess();
    btn.title = hasAdminAccess() ? "" : readonlyTitle();
    btn.addEventListener('click', async (e) => {
      if (!hasAdminAccess()) {
        alert(readonlyTitle());
        return;
      }
      const id = e.currentTarget.dataset.id;
      try {
        await fetch(workerApiUrl(`/feedbacks/${id}/dismiss`), { method: 'POST' });
        fetchFeedbacks();
      } catch (err) { console.error('Error dismissing', err); }
    });
  });
}

// 初始載入
setupFeedbackPanelListeners();
fetchFeedbacks();

el.periodChoices.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    const target = button.dataset.periodTarget;
    const value = button.dataset.value;
    if (!target || !value || !el[target]) return;
    el[target].value = value;
    syncPeriodChoiceUi();
    updatePeriodUi();
    updatePeriodStatusBadge();
  });
});

document.querySelector("#applyPeriodBtn").addEventListener("click", handlePeriodConfirm);
document.querySelector("#generateBtn").addEventListener("click", runAiSchedule);
document.querySelector("#auditBtn").addEventListener("click", runScheduleAudit);
document.querySelector("#refreshAnalyticsBtn")?.addEventListener("click", renderAnalytics);
el.scheduleProgressCancelBtn?.addEventListener("click", () => {
  if (scheduleAbortController) {
    el.scheduleProgressCancelBtn.disabled = true;
    scheduleAbortController.abort();
    return;
  }
  if (el.scheduleProgressModal) el.scheduleProgressModal.hidden = true;
});
document.querySelector("#exportBtn").addEventListener("click", openDownloadChooser);
document.querySelector("#printBtn").addEventListener("click", printCurrentTable);
document.querySelector("#personForm").addEventListener("submit", submitPerson);
document.querySelector("#personCancelBtn").addEventListener("click", closePersonModal);
el.openPersonModalBtn?.addEventListener("click", () => {
  clearPersonForm();
  openPersonModal("create");
});
el.personToolbarCancelBtn?.addEventListener("click", closePersonModal);

el.addRoleConfirmBtn.addEventListener("click", confirmAddRole);
el.addRoleCancelBtn.addEventListener("click", closeAddRoleModal);
el.addRoleModal.addEventListener("click", (event) => {
  if (event.target === el.addRoleModal) closeAddRoleModal();
});
el.downloadModal?.addEventListener("click", (event) => {
  if (event.target === el.downloadModal) closeDownloadModal();
});
el.personModal?.addEventListener("click", (event) => {
  if (event.target === el.personModal) closePersonModal();
});
el.downloadCloseBtn?.addEventListener("click", closeDownloadModal);
el.downloadPdfBtn?.addEventListener("click", downloadCurrentTableAsPdf);
el.downloadJpgBtn?.addEventListener("click", downloadCurrentTableAsJpg);
el.accountInput?.addEventListener("input", () => {
  el.accountInput.value = el.accountInput.value.toUpperCase();
  if (el.accountInput.value === "") {
    applyAccountCode();
  } else {
    if (el.applyAccountBtn) el.applyAccountBtn.textContent = "套用";
  }
});
el.accountInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyAccountCode();
});
el.applyAccountBtn?.addEventListener("click", () => {
  if (el.applyAccountBtn.textContent === "清除") {
    if (el.accountInput) el.accountInput.value = "";
  }
  applyAccountCode();
});
el.peopleQuickFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  peopleFilter = button.dataset.filter;
  renderPeople();
});

// Table click delegations
el.table.addEventListener("click", (e) => {
  // existing edit logic
  const contentEl = e.target.closest(".text-cell-content");
  if (!contentEl) return;
  const date = contentEl.parentElement.dataset.date;
  const role = contentEl.parentElement.dataset.role;
  if (!canEditRole(role)) {
    alert(readonlyTitle());
    return;
  }
  const key = cellKey(date, role);
  const currentVal = state.assignments[key] || "";
  const newVal = prompt("請輸入服事人員姓名：", currentVal);
  if (newVal !== null) {
    state.assignments[key] = newVal.trim();
    render();
    syncSoon();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.addRoleModal.hidden) {
    closeAddRoleModal();
    return;
  }
  if (event.key === "Escape" && el.personModal && !el.personModal.hidden) {
    closePersonModal();
    return;
  }
  if (event.key === "Escape" && el.downloadModal && !el.downloadModal.hidden) {
    closeDownloadModal();
  }
});

window.addEventListener("pagehide", flushDraftOnPageExit);
window.addEventListener("beforeunload", flushDraftOnPageExit);


document.querySelector("#clearBtn").addEventListener("click", async () => {
  if (!canManageSchedulePage(activeRolePage)) {
    alert(readonlyTitle());
    return;
  }
  const pageName = activeRolePage === "children" ? "兒主" : "大堂";
  if (confirm(`確定要清空 ${pageName} 未鎖定的排班人員嗎？鎖定格、備註、規則及額外資料都會保留。`)) {
    try {
      await clearScheduleForPage(activeRolePage);
    } catch (error) {
      alert(error.message || "清空排班失敗");
    }
  }
});

[
  "periodYear",
  "mainHalf",
  "childrenQuarter",
  "scheduleTitle",
  "unavailableInput",
].forEach((id) => {
  const input = document.querySelector(`#${id}`);
  const update = () => {
    if (id === "scheduleTitle" && !hasAdminAccess()) return;
    if (id === "unavailableInput" && !hasAdminAccess()) return;
    if (id === "scheduleTitle" || id === "unavailableInput") {
      render();
      syncSoon();
    } else {
      updatePeriodUi();
      updatePeriodStatusBadge();
    }
  };
  input.addEventListener("input", update);
  input.addEventListener("change", update);
});



function openRuleModal(defaultScope = 'main') {
  if (!canManageRules(defaultScope)) {
    alert(readonlyTitle());
    return;
  }
  el.ruleId.value = crypto.randomUUID();
  el.ruleText.value = '';
  document.querySelector(`input[name="ruleScope"][value="${defaultScope}"]`).checked = true;

  // Render roles matrix
  const allRoles = [...rolesForPage("main"), ...rolesForPage("children")];
  el.ruleRolesMatrix.innerHTML = allRoles.map(r => `
    <label style="display:inline-flex; align-items:center; margin-right:8px; margin-bottom:8px; font-size:13px;">
      <input type="checkbox" value="${r.name}" /> ${r.name}
    </label>
  `).join('');

  el.ruleModal.hidden = false;
  el.ruleText.focus();
}

function closeRuleModal() {
  el.ruleModal.hidden = true;
}

el.addMainRuleBtn?.addEventListener('click', () => openRuleModal('main'));
el.addChildrenRuleBtn?.addEventListener('click', () => openRuleModal('children'));
el.ruleModalCancelBtn?.addEventListener('click', closeRuleModal);

function buildRuleParsingContext(scope) {
  const peopleListWithRoles = state.people.map(p => {
    const mainRoles = p.categories.filter(c => inferSectionForDetail(c) === "大堂" || inferSectionForDetail(c) === "招待" || inferSectionForDetail(c) === "餅杯" || inferSectionForDetail(c) === "講員");
    const childrenRoles = p.categories.filter(c => inferSectionForDetail(c) === "兒主");
    const nicknameStr = p.nickname ? ` (暱稱: ${p.nickname})` : "";
    return `${p.name}${nicknameStr} [大堂指定: ${mainRoles.length ? mainRoles.join(',') : '(無)'}] [兒主指定: ${childrenRoles.length ? childrenRoles.join(',') : '(無)'}]`;
  });

  const activeRolesInfo = {
    "大堂現有項目": rolesForPage("main").map(r => r.name),
    "兒主現有項目": rolesForPage("children").map(r => r.name)
  };

  const sections = scope === "global" ? ["main", "children"] : [scope === "children" ? "children" : "main"];
  const datesWithNotes = sections.flatMap(section => Array.from(state.sectionDates[section] || [])
    .sort((a, b) => a.localeCompare(b))
    .map(date => {
      const note = getManualNote(date, section);
      const sectionText = section === "children" ? "兒主" : "大堂";
      return note ? `${date} ${sectionText}備註: ${note}` : `${date} ${sectionText}`;
    }));

  return { peopleListWithRoles, activeRolesInfo, datesWithNotes };
}

async function parseRuleMemoText({ text, scope, selectedRoles }) {
  const context = buildRuleParsingContext(scope);
  const response = await fetch(workerApiUrl("/parse-rules-ai"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      aiPrompt: text,
      scope,
      selectedRoles,
      peopleListWithRoles: context.peopleListWithRoles,
      activeRolesInfo: context.activeRolesInfo,
      datesWithNotes: context.datesWithNotes,
      year: el.periodYear.value || new Date().getFullYear()
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "API 錯誤");
  return Array.isArray(data) ? data : [];
}

async function createRuleMemoFromText({ id = crypto.randomUUID(), text, scope, selectedRoles = [], source = "manual" }) {
  const parsedRules = await parseRuleMemoText({ text, scope, selectedRoles });
  const newMemo = {
    id,
    source,
    scope,
    text,
    roles: selectedRoles,
    parsedRules,
    timestamp: Date.now(),
    creator: activeAccountCode
  };

  state.ruleMemos = state.ruleMemos.filter(m => m.id !== id);
  state.ruleMemos.push(newMemo);

  rebuildTemporaryRules();
  renderRuleMemos();
  render();
  syncSoon();
  return newMemo;
}

function normalizeRuleMemoScopes() {
  state.ruleMemos = (state.ruleMemos || []).map((memo) => {
    // 修正舊有全區回饋，或在規則頁籤點選確認產生的 'rules' scope
    if ((memo?.source === "feedback" && memo.scope === "global") || memo.scope === "rules") {
      return {
        ...memo,
        scope: "main",
        parsedRules: (memo.parsedRules || []).map((rule) => ({
          ...rule,
          scope: (rule.scope === "global" || rule.scope === "rules") ? "main" : rule.scope,
        })),
      };
    }
    return memo;
  });
}

async function submitRuleMemo() {
  const text = el.ruleText.value.trim();
  if (!text) return;

  const scope = document.querySelector('input[name="ruleScope"]:checked').value;
  if (!canManageRules(scope)) {
    alert(readonlyTitle());
    return;
  }
  const selectedRoles = Array.from(el.ruleRolesMatrix.querySelectorAll('input:checked')).map(cb => cb.value);
  const memoId = el.ruleId.value || crypto.randomUUID();

  const originalBtnText = el.ruleModalConfirmBtn.textContent;
  el.ruleModalConfirmBtn.disabled = true;
  el.ruleModalConfirmBtn.textContent = "AI 解析中...";

  try {
    await createRuleMemoFromText({ id: memoId, text, scope, selectedRoles, source: "manual" });
    closeRuleModal();
  } catch (error) {
    console.error("Failed to parse AI rule:", error);
    alert("AI 解析失敗，請稍後再試: " + error.message);
  } finally {
    el.ruleModalConfirmBtn.disabled = false;
    el.ruleModalConfirmBtn.textContent = originalBtnText;
  }
}

el.ruleModalConfirmBtn?.addEventListener('click', submitRuleMemo);

function rebuildTemporaryRules() {
  normalizeRuleMemoScopes();
  state.temporaryRules = state.ruleMemos.flatMap(m => {
    const rules = m.parsedRules || [];
    return rules.map(r => {
      let ruleScope = r.scope;
      if (ruleScope === 'section' || !ruleScope) {
        ruleScope = m.scope;
      }
      return {
        ...r,
        scope: ruleScope,
        timestamp: m.timestamp,
        isAdmin: m.creator === "A000"
      };
    });
  });
  state.temporaryRules.sort((a, b) => a.timestamp - b.timestamp);
  if (typeof renderTemporaryRules === 'function') renderTemporaryRules();
}

// 自動核銷「可排(fixed)」規則
function consumeFixedRule(date, roleName, person) {
  if (!person || person === "/") return false;
  let ruleDeleted = false;

  state.ruleMemos.forEach(memo => {
    if (!memo.parsedRules) return;
    const initialLen = memo.parsedRules.length;

    memo.parsedRules = memo.parsedRules.filter(r => {
      if (r.type !== 'fixed') return true; // 僅核銷可排(fixed)
      if (r.person !== person) return true;

      // 沒有日期限制的規則不自動核銷（需手動刪除）
      const hasDateConstraint = r.date || r.dateRange;
      if (!hasDateConstraint) return true;

      if (r.date && r.date !== date) return true;
      if (r.dateRange && (date < r.dateRange.start || date > r.dateRange.end)) return true;
      if (r.role && r.role !== roleName) return true;

      // 條件符合（有日期且當天），核銷此規則
      return false;
    });

    if (memo.parsedRules.length < initialLen) {
      ruleDeleted = true;
    }
  });

  const beforeLen = state.ruleMemos.length;
  // 若該備忘的所有規則都被核銷光了，就直接刪除整筆備忘
  state.ruleMemos = state.ruleMemos.filter(memo => {
    if (memo.parsedRules && memo.parsedRules.length === 0) return false;
    return true;
  });

  if (state.ruleMemos.length < beforeLen) {
    ruleDeleted = true;
  }

  return ruleDeleted;
}

function renderTemporaryRules() {
  const section = activeRolePage;
  const rules = (state.temporaryRules || []).filter(r => r.scope === section);

  if (!el.temporaryRulesList) return;

  if (rules.length === 0) {
    el.temporaryRulesList.innerHTML = '<p class="hint">暫無生效的臨時規則</p>';
    return;
  }

  el.temporaryRulesList.innerHTML = rules.map(rule => {
    let scopeText = rule.scope === 'global' ? '全域' : '區域';
    let typeText = rule.type === 'unavailable' ? '不可排' : (rule.type === 'fixed' ? '固定指派' : (rule.type === 'force_role' ? '強制開啟職位' : (rule.type === 'conditional' ? '連動排班' : rule.type)));
    let titleText = '';
    if (rule.type === 'force_role') titleText = `[欄位] ${rule.role}`;
    else if (rule.type === 'conditional') titleText = `若 ${rule.condition?.person} 為 ${rule.condition?.role}`;
    else titleText = rule.person || '(未指定同工)';

    return `
      <div class="temporary-rule-item" style="border: 1px solid #ccc; padding: 6px; margin-bottom: 6px; border-radius: 4px; background: #fff;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <strong>${titleText}</strong>
          <span style="font-size: 11px; padding: 2px 6px; background: #e2e8f0; border-radius: 12px;">${scopeText} - ${typeText}</span>
        </div>
        <div style="font-size: 12px; color: #555;">
          ${rule.type === 'conditional' ? `則 ${rule.action?.person} 必為 ${rule.action?.role}<br>` : ''}
          ${rule.reason || ''}
          ${rule.date ? `<br>日期: ${rule.date}` : ''}
          ${rule.dateRange ? `<br>期間: ${rule.dateRange.start} ~ ${rule.dateRange.end}` : ''}
        </div>
      </div>
    `;
  }).join("");
}

function getRuleMemoRole(rule) {
  return rule?.role || rule?.condition?.role || rule?.action?.role || "(未指定職務)";
}

function getRuleMemoPerson(rule) {
  return rule?.person || rule?.condition?.person || "(未指定同工)";
}

function encodeRuleMemoActionValue(value) {
  return encodeURIComponent(value).replace(/'/g, "%27");
}

function renderRuleMemos() {
  if (!el.mainRulesList || !el.childrenRulesList) return;
  normalizeRuleMemoScopes();

  const renderCard = (memo) => {
    const roleGroups = new Map();
    (memo.parsedRules || []).forEach((r, index) => {
      const role = getRuleMemoRole(r);
      const person = getRuleMemoPerson(r);
      if (!roleGroups.has(role)) roleGroups.set(role, new Map());
      const personGroups = roleGroups.get(role);
      if (!personGroups.has(person)) personGroups.set(person, []);
      personGroups.get(person).push({ ...r, originalIndex: index });
    });

    const groupsHtml = Array.from(roleGroups.entries()).map(([role, personGroups]) => {
      const peopleHtml = Array.from(personGroups.entries()).map(([person, groupRules]) => {
        const rulesHtml = groupRules.map(r => {
          let typeText = r.type === 'unavailable' ? '不可排' : (r.type === 'fixed' ? '固定指派' : (r.type === 'force_role' ? '強制開啟職位' : (r.type === 'conditional' ? '連動排班' : (r.type === 'exclusive_person' ? '人員互斥' : r.type))));
          let detailText = '';
          if (r.type === 'force_role') detailText = `[欄位] ${r.role}`;
          else if (r.type === 'conditional') detailText = `若 ${r.condition?.person} 為 ${r.condition?.role}，則 ${r.action?.person} 必為 ${r.action?.role}`;
          else if (r.type === 'exclusive_person') detailText = `與 ${r.action?.person} 不可同日`;
          else detailText = r.person || '(未指定同工)';
          return `<div class="rule-card-ai" style="margin-bottom:4px; display:flex; justify-content:space-between; margin-left:8px;">
            <div>
              <strong>${detailText}</strong> <span style="font-size:10px;color:#666;">(${typeText})</span>
              <div style="font-size: 11px; margin-top:2px;">
                ${r.reason || ''} ${r.date ? `[${r.date}]` : ''} ${r.dateRange ? `[${r.dateRange.start} ~ ${r.dateRange.end}]` : ''}
              </div>
            </div>
            <div>
              <button type="button" class="danger" style="padding:2px 6px; font-size:10px;" onclick="deleteSingleRule('${memo.id}', ${r.originalIndex})">單筆刪除</button>
            </div>
          </div>`;
        }).join('');

        return `
          <div class="rule-card-person-group">
            <div class="rule-card-person-header">
              <strong>▶ 人員：${person}</strong>
              <button type="button" class="danger" style="padding:2px 6px; font-size:10px;" onclick="deletePersonRoleRules('${memo.id}', '${encodeRuleMemoActionValue(role)}', '${encodeRuleMemoActionValue(person)}')">刪除此職務規則</button>
            </div>
            ${rulesHtml}
          </div>
        `;
      }).join('');

      return `
        <section class="rule-card-role-group">
          <div class="rule-card-role-header">職務：${role}</div>
          ${peopleHtml}
        </section>
      `;
    }).join('');

    return `
      <div class="rule-card">
        <div class="rule-card-header">
          <span class="rule-card-scope">${memo.scope === 'global' ? '全域' : (memo.scope === 'main' ? '大堂' : '兒主')}</span>
          <span style="font-size:11px; color:#888;">${new Date(memo.timestamp).toLocaleString()}</span>
        </div>
        <div class="rule-card-text">${memo.text}</div>
        ${memo.roles && memo.roles.length ? `<div class="rule-card-roles">指定職位: ${memo.roles.join(', ')}</div>` : ''}
        ${groupsHtml}
        <div class="rule-card-actions" style="margin-top: 8px;">
          <button type="button" onclick="editRuleMemo('${memo.id}')">修改</button>
          <button type="button" class="danger" onclick="deleteRuleMemo('${memo.id}')">刪除整包</button>
        </div>
      </div>
    `;
  };

  const getMemoTime = (memo) => {
    if (memo.parsedRules && memo.parsedRules.length > 0) {
      for (const r of memo.parsedRules) {
        let t;
        if (r.date) t = new Date(r.date).getTime();
        else if (r.dateRange && r.dateRange.start) t = new Date(r.dateRange.start).getTime();
        if (t && !isNaN(t)) return t;
      }
    }
    return memo.timestamp || Number.MAX_SAFE_INTEGER;
  };

  const mainMemos = state.ruleMemos.filter(m => m.scope === 'main' || m.scope === 'global').sort((a, b) => getMemoTime(a) - getMemoTime(b));
  const childrenMemos = state.ruleMemos.filter(m => m.scope === 'children' || m.scope === 'global').sort((a, b) => getMemoTime(a) - getMemoTime(b));

  el.mainRulesList.innerHTML = mainMemos.length ? mainMemos.map(renderCard).join('') : '<p class="hint">暫無規則</p>';
  el.childrenRulesList.innerHTML = childrenMemos.length ? childrenMemos.map(renderCard).join('') : '<p class="hint">暫無規則</p>';
}

window.editRuleMemo = function (id) {
  const memo = state.ruleMemos.find(m => m.id === id);
  if (!memo) return;
  if (!canManageRules(memo.scope)) {
    alert(readonlyTitle());
    return;
  }
  openRuleModal(memo.scope);
  el.ruleId.value = memo.id;
  el.ruleText.value = memo.text;
  document.querySelector(`input[name="ruleScope"][value="${memo.scope}"]`).checked = true;
  memo.roles.forEach(r => {
    const cb = el.ruleRolesMatrix.querySelector(`input[value="${r}"]`);
    if (cb) cb.checked = true;
  });
};

window.deleteRuleMemo = function (id) {
  const memo = state.ruleMemos.find(m => m.id === id);
  if (!memo) return;
  if (!canManageRules(memo.scope)) {
    alert(readonlyTitle());
    return;
  }
  if (!confirm("確定要刪除這筆規則備忘嗎？")) return;
  state.ruleMemos = state.ruleMemos.filter(m => m.id !== id);
  rebuildTemporaryRules();
  renderRuleMemos();
  render();
  syncSoon();
};

window.deleteSingleRule = function (memoId, ruleIndex) {
  const memo = state.ruleMemos.find(m => m.id === memoId);
  if (!memo) return;
  if (!canManageRules(memo.scope)) {
    alert(readonlyTitle());
    return;
  }
  if (!confirm("確定要刪除這筆單獨的規則嗎？")) return;

  if (memo.parsedRules && memo.parsedRules.length > ruleIndex) {
    memo.parsedRules.splice(ruleIndex, 1);
    if (memo.parsedRules.length === 0) {
      state.ruleMemos = state.ruleMemos.filter(m => m.id !== memoId);
    }
    rebuildTemporaryRules();
    renderRuleMemos();
    render();
    syncSoon();
  }
};

window.deletePersonRoleRules = function (memoId, encodedRole, encodedPerson) {
  const memo = state.ruleMemos.find(m => m.id === memoId);
  if (!memo) return;
  if (!canManageRules(memo.scope)) {
    alert(readonlyTitle());
    return;
  }
  const role = decodeURIComponent(encodedRole);
  const person = decodeURIComponent(encodedPerson);
  if (!confirm(`確定要刪除 ${person} 在「${role}」職務下的所有規則嗎？`)) return;

  memo.parsedRules = memo.parsedRules.filter(r => (
    getRuleMemoRole(r) !== role || getRuleMemoPerson(r) !== person
  ));
  if (memo.parsedRules.length === 0) {
    state.ruleMemos = state.ruleMemos.filter(m => m.id !== memoId);
  }
  rebuildTemporaryRules();
  renderRuleMemos();
  render();
  syncSoon();
};

el.clearAiPromptBtn?.addEventListener("click", () => {
  if (!hasAdminAccess()) {
    alert(readonlyTitle());
    return;
  }
  if (!confirm("確定要清空全部規則嗎？")) return;
  state.ruleMemos = [];
  rebuildTemporaryRules();
  renderRuleMemos();
  syncSoon();
});

initRemoteSync();

function getShortenedName(roleName, personName) {
  if (!personName || personName === "/") return personName;
  const isUsher = roleName && roleName.includes("招待") && (roleName.includes("1F") || roleName.includes("6F"));
  const isChildren = roleSection(roleName) === "children";

  if (isUsher || isChildren) {
    // 支援多個人名在同一個儲存格（例如：同工A、同工B）
    const delimiters = /([、,/＋+&＆\s]+)/;
    const parts = personName.split(delimiters);

    return parts.map(part => {
      if (delimiters.test(part)) return part; // 保留分隔符號
      if (part.length <= 2) return part;      // 名字長度小於等於2不切
      return part.slice(-2);                  // 保留後面2個字(通常是不顯示姓氏)
    }).join('');
  }
  return personName;
}

function renderChildrenRoster() {
  if (!el.childrenRosterContainer) return;
  if (activeRolePage !== "children") {
    el.childrenRosterContainer.style.display = "none";
    return;
  }

  el.childrenRosterContainer.style.display = "block";
  let html = '<div style="margin: 20px 0; text-align: center; font-weight: bold; font-size: 1.1em;">各班名單</div><table class="children-roster-table"><thead><tr><th>年級</th>';
  for (let i = 1; i <= 11; i++) {
    html += `<th>${i}</th>`;
  }
  html += '</tr></thead><tbody>';

  const rows = ['小六~高二', '幼中~小五', '0~4歲'];
  rows.forEach((rowLabel, rowIndex) => {
    html += `<tr><td>${rowLabel}</td>`;
    for (let col = 1; col <= 11; col++) {
      const key = `roster_${rowIndex}_${col}`;
      const value = state.childrenRoster[key] || '';
      html += `<td><textarea data-key="${key}" rows="1" placeholder="輸入名單" style="width: 100%; height: 100%; box-sizing: border-box; resize: vertical; text-align: center; border: 1px solid transparent;" ${!canEditExtraColumn() ? "disabled title=\"" + readonlyTitle() + "\"" : ""}>${value}</textarea></td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table>';

  el.childrenRosterContainer.innerHTML = html;

  el.childrenRosterContainer.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', (e) => {
      if (!canEditExtraColumn()) {
        e.target.value = state.childrenRoster[e.target.dataset.key] || '';
        return;
      }
      state.childrenRoster[e.target.dataset.key] = e.target.value;
      syncSoon();
    });
    ta.addEventListener('focus', (e) => {
      e.target.style.border = "1px solid #4ade80";
    });
    ta.addEventListener('blur', (e) => {
      e.target.style.border = "1px solid transparent";
    });
  });
}

document.addEventListener("focusout", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
    if (draftDirty) {
      syncNow().catch(console.error);
    }
  }
});


// --- History Revert Feature ---
let historyRevisionsCache = [];

async function openHistoryModal() {
  if (activeAccountCode !== "A000") return;
  el.historyRevertModal.hidden = false;
  el.historyRevertSelect.innerHTML = '<option value="">載入中...</option>';
  el.revertMainOnlyBtn.disabled = true;
  el.revertChildrenOnlyBtn.disabled = true;
  el.revertAllBtn.disabled = true;

  try {
    const res = await fetch(workerApiUrl("/history"));
    if (!res.ok) throw new Error("Failed to fetch history");
    historyRevisionsCache = await res.json();

    if (historyRevisionsCache.length === 0) {
      el.historyRevertSelect.innerHTML = '<option value="">目前沒有歷史存檔</option>';
      return;
    }

    el.historyRevertSelect.innerHTML = '<option value="">-- 請選擇要還原的版本 --</option>';
    historyRevisionsCache.slice(0, 10).forEach(rev => {
      const option = document.createElement("option");
      option.value = rev.id;
      const date = new Date(rev.created_at).toLocaleString('zh-TW');
      option.textContent = `[${date}] ${rev.save_type === "ai_auto" ? "AI 自動排班" : "手動儲存"} (ID: ${rev.id})`;
      el.historyRevertSelect.appendChild(option);
    });

    el.historyRevertSelect.addEventListener('change', () => {
      const hasValue = !!el.historyRevertSelect.value;
      el.revertMainOnlyBtn.disabled = !hasValue;
      el.revertChildrenOnlyBtn.disabled = !hasValue;
      el.revertAllBtn.disabled = !hasValue;
    });
  } catch (err) {
    console.error(err);
    el.historyRevertSelect.innerHTML = '<option value="">載入失敗</option>';
  }
}

function closeHistoryModal() {
  if (el.historyRevertModal) el.historyRevertModal.hidden = true;
}

async function performSmartMergeRevert(mode) {
  const revId = el.historyRevertSelect.value;
  if (!revId) return;

  if (!confirm("確定要執行還原嗎？這將會覆蓋目前的排班資料。")) return;

  try {
    const res = await fetch(workerApiUrl(`/history/${revId}`));
    if (!res.ok) throw new Error("無法讀取歷史版本");
    const revData = await res.json();
    let oldState = revData.state;
    if (typeof oldState === 'string') oldState = JSON.parse(oldState);

    if (mode === "all") {
      state = oldState;
    } else if (mode === "main") {
      // Restore ONLY main
      const mainRoles = [
        "講員", "領會", "司琴", "敬拜主唱", "影音控制", "影音播放", "1F招待", "6F招待", "餅杯服事"
      ];
      // 1. Restore assignments for main roles
      for (const key of Object.keys(state.assignments)) {
        if (mainRoles.some(r => key.endsWith(`|${r}`))) {
          delete state.assignments[key];
        }
      }
      if (oldState.assignments) {
        for (const [key, val] of Object.entries(oldState.assignments)) {
          if (mainRoles.some(r => key.endsWith(`|${r}`))) {
            state.assignments[key] = val;
          }
        }
      }
      // 2. Restore notes for main
      for (const key of Object.keys(state.notes)) {
        if (key.endsWith("|main")) delete state.notes[key];
      }
      if (oldState.notes) {
        for (const [key, val] of Object.entries(oldState.notes)) {
          if (key.endsWith("|main")) state.notes[key] = val;
        }
      }
    } else if (mode === "children") {
      // Restore ONLY children
      const mainRoles = [
        "講員", "領會", "司琴", "敬拜主唱", "影音控制", "影音播放", "1F招待", "6F招待", "餅杯服事"
      ];
      // 1. Restore assignments for children roles (anything not main)
      for (const key of Object.keys(state.assignments)) {
        if (!mainRoles.some(r => key.endsWith(`|${r}`))) {
          delete state.assignments[key];
        }
      }
      if (oldState.assignments) {
        for (const [key, val] of Object.entries(oldState.assignments)) {
          if (!mainRoles.some(r => key.endsWith(`|${r}`))) {
            state.assignments[key] = val;
          }
        }
      }
      // 2. Restore extraValues (Course)
      state.extraValues = oldState.extraValues || {};
      // 3. Restore childrenRoster
      state.childrenRoster = oldState.childrenRoster || {};
      // 4. Restore notes for children
      for (const key of Object.keys(state.notes)) {
        if (key.endsWith("|children")) delete state.notes[key];
      }
      if (oldState.notes) {
        for (const [key, val] of Object.entries(oldState.notes)) {
          if (key.endsWith("|children")) state.notes[key] = val;
        }
      }
    }

    closeHistoryModal();
    render();
    draftDirty = true;
    await syncNow();
    alert("還原成功並已同步至伺服器！");
  } catch (err) {
    console.error(err);
    alert("還原失敗：" + err.message);
  }
}

if (el.openHistoryBtn) el.openHistoryBtn.addEventListener("click", openHistoryModal);
if (el.historyRevertCloseBtn) el.historyRevertCloseBtn.addEventListener("click", closeHistoryModal);
if (el.revertMainOnlyBtn) el.revertMainOnlyBtn.addEventListener("click", () => performSmartMergeRevert("main"));
if (el.revertChildrenOnlyBtn) el.revertChildrenOnlyBtn.addEventListener("click", () => performSmartMergeRevert("children"));
if (el.revertAllBtn) el.revertAllBtn.addEventListener("click", () => performSmartMergeRevert("all"));
function makeDraggable(element) {
  let isDragging = false;
  let hasDetached = false;
  let offsetX, offsetY;
  let initialRect;

  element.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;

    isDragging = true;
    hasDetached = element.classList.contains('detached-warning');
    initialRect = element.getBoundingClientRect();
    offsetX = e.clientX - initialRect.left;
    offsetY = e.clientY - initialRect.top;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    if (!hasDetached) {
      element.classList.add('detached-warning');
      element.style.width = initialRect.width + 'px';
      element.style.left = initialRect.left + 'px';
      element.style.top = initialRect.top + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      hasDetached = true;
    }

    let newX = e.clientX - offsetX;
    let newY = e.clientY - offsetY;

    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    element.style.left = newX + 'px';
    element.style.top = newY + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

if (el.warnings) {
  makeDraggable(el.warnings);
}

// Attendance and Analytics functions
async function fetchAttendance(scheduleId = selectedPeriodIds.main) {
  try {
    if (!scheduleId) {
      state.attendanceRecords = {};
      render();
      return;
    }
    const requestedScheduleId = scheduleId;
    const res = await fetch(
      workerApiUrl(`/attendance?scheduleId=${encodeURIComponent(requestedScheduleId)}`),
      { cache: "no-store" }
    );
    if (res.ok) {
      const payload = await res.json();
      const records = Array.isArray(payload) ? payload : (payload.data || []);
      if (selectedPeriodIds.main !== requestedScheduleId) return;
      state.attendanceRecords = {};
      for (const rec of records) {
        const date = rec.date || rec.service_date;
        if (date) state.attendanceRecords[date] = rec;
      }
      render();
    }
  } catch (err) {
    console.error("fetchAttendance error:", err);
  }
}

async function updateAttendance(date, pCount, oCount) {
  try {
    const record = state.attendanceRecords[date] || {};
    const payload = {
      scheduleId: selectedPeriodIds.main,
      physical_count: record.physical_count !== undefined ? record.physical_count : null,
      online_count: record.online_count !== undefined ? record.online_count : null
    };
    if (pCount !== null) payload.physical_count = pCount === "" ? null : parseInt(pCount, 10);
    if (oCount !== null) payload.online_count = oCount === "" ? null : parseInt(oCount, 10);
    payload.recorded_by = activeAccountCode || "web";

    const res = await fetch(workerApiUrl(`/attendance/${date}`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Account-Code": activeAccountCode
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const result = await res.json();
      state.attendanceRecords[date] = result.record || {
        ...state.attendanceRecords[date],
        ...payload,
        date
      };
      render();
    }
  } catch (err) {
    console.error("updateAttendance error:", err);
  }
}

async function renderAnalytics() {
  const container = document.getElementById("analyticsPage");
  if (!container) return;
  const period = selectedPeriodRecords.main;
  const hint = document.getElementById("analyticsPeriodHint");
  const refreshButton = document.getElementById("refreshAnalyticsBtn");
  const physicalAverage = document.getElementById("recentPhysicalAvg");
  const onlineAverage = document.getElementById("recentOnlineAvg");
  const totalAverage = document.getElementById("recentTotalAvg");
  const chart = document.getElementById("attendanceChart");
  const tableBody = document.querySelector("#analyticsTable tbody");

  if (hint) {
    hint.textContent = period
      ? `目前統計檔期：${period.displayLabel}${period.status === "archived" ? "（歷史唯讀）" : ""}`
      : "目前沒有可統計的大堂檔期。";
  }
  if (!period) {
    if (physicalAverage) physicalAverage.textContent = "0";
    if (onlineAverage) onlineAverage.textContent = "0";
    if (totalAverage) totalAverage.textContent = "0";
    if (chart) chart.innerHTML = '<p class="empty-hint">目前沒有可統計的檔期。</p>';
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="5">目前沒有可統計的檔期。</td></tr>';
    }
    return;
  }

  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = "載入中…";
  }
  try {
    const res = await fetch(
      workerApiUrl(
        `/analytics/growth?scheduleId=${encodeURIComponent(period.id)}&months=6`
      ),
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("Failed to fetch analytics");
    const response = await res.json();
    if (!response.ok || !response.data) throw new Error("Invalid analytics data");

    const { trends, summary } = response.data;
    if (physicalAverage) physicalAverage.textContent = String(summary.recent_physical_avg || 0);
    if (onlineAverage) onlineAverage.textContent = String(summary.recent_online_avg || 0);
    if (totalAverage) totalAverage.textContent = String(summary.recent_total_avg || 0);

    const chartTrends = [...trends].slice(-12);
    if (chart) {
      if (!chartTrends.length) {
        chart.innerHTML = '<p class="empty-hint">此檔期尚無人數紀錄。</p>';
      } else {
        const maxCount = Math.max(
          ...chartTrends.map((item) => (
            Number(item.physical_count || 0) + Number(item.online_count || 0)
          )),
          1
        );
        chart.innerHTML = chartTrends.map((item) => {
          const date = item.date || item.service_date || "";
          const physical = Number(item.physical_count || 0);
          const online = Number(item.online_count || 0);
          return `
            <div class="chart-bar-group"
              title="${escapeHtml(`${date}：實體 ${physical}、線上 ${online}`)}">
              <div class="chart-bars">
                <div class="chart-bar-physical"
                  style="height:${(physical / maxCount) * 100}%"></div>
                <div class="chart-bar-online"
                  style="height:${(online / maxCount) * 100}%"></div>
              </div>
              <div class="chart-label">${escapeHtml(date.slice(5))}</div>
            </div>
          `;
        }).join("");
      }
    }

    if (tableBody) {
      tableBody.innerHTML = trends.length
        ? [...trends].reverse().map((item) => {
          const date = item.date || item.service_date || "";
          const physical = Number(item.physical_count || 0);
          const online = Number(item.online_count || 0);
          const noteText = [item.special_event, item.note].filter(Boolean).join("／");
          return `
            <tr>
              <td>${escapeHtml(displayDate(date))}</td>
              <td>${physical}</td>
              <td>${online}</td>
              <td>${physical + online}</td>
              <td>${escapeHtml(noteText)}</td>
            </tr>
          `;
        }).join("")
        : '<tr><td colspan="5">此檔期尚無人數紀錄。</td></tr>';
    }
  } catch (err) {
    if (chart) {
      chart.innerHTML = `<p class="error-hint">載入統計失敗：${escapeHtml(err.message)}</p>`;
    }
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="5">人數統計載入失敗。</td></tr>';
    }
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "重新整理";
    }
  }
}


// ==================== 程序紀錄 (Schedule Run Log) ====================
function formatRunDuration(ms) {
  if (!ms || ms < 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderScheduleRunLog(runs) {
  if (!runs || !runs.length) {
    el.scheduleRunLogList.innerHTML = '<div class="empty-hint">目前沒有任何排班紀錄。</div>';
    return;
  }

  el.scheduleRunLogList.innerHTML = runs.map(run => {
    const statusLabels = {
      completed: '成功',
      failed: '失敗',
      cancelled: '已取消',
      running: '執行中'
    };
    const statusClass = ['completed', 'failed', 'cancelled', 'running']
      .includes(run.status)
      ? run.status
      : 'failed';
    const startedAt = run.startedAt || run.startTime;
    const errorMessage = run.errorMessage
      || run.error?.message
      || run.errorCode
      || run.error?.code;
    const hasSteps = run.steps && run.steps.length > 0;

    let html = `
      <div class="schedule-run-log-item status-${statusClass}">
        <div class="schedule-run-log-heading">
          <time>${escapeHtml(formatHistoryTime(startedAt) || '時間未記錄')}</time>
          <span class="badge ${statusClass === 'completed' ? 'badge-success' : 'badge-error'}">
            ${escapeHtml(statusLabels[run.status] || run.status || '未知')}
          </span>
        </div>
        <div class="schedule-run-log-summary">
          <span>連線識別: ${escapeHtml(run.clientId || run.actorId || '未知')}</span>
          <span>耗時: ${formatRunDuration(run.durationMs)}</span>
        </div>
        `;

    if (errorMessage) {
      html += `<div class="schedule-run-log-error">${escapeHtml(errorMessage)}</div>`;
    }

    if (hasSteps) {
      html += `<div style="margin-top: 8px; font-size: 0.9em; max-height: 150px; overflow-y: auto; padding-right: 4px; border-top: 1px dashed #ccc; padding-top: 8px;"><ul>`;
      html += run.steps.map(step => {
        const stepTime = step.createdAt || step.timestamp;
        const formattedStepTime = stepTime
          ? new Date(stepTime).toLocaleTimeString('zh-TW', { hour12: false })
          : '--:--:--';
        return `<li style="margin-bottom: 4px;">
          <span style="color: #666; font-size: 0.85em;">${escapeHtml(formattedStepTime)}</span>
          <strong style="color: var(--primary-color);">[${escapeHtml(step.stage)}]</strong>
          <span>${escapeHtml(step.message)}</span>
        </li>`;
      }).join('');
      html += `</ul></div>`;
    }

    html += `</div>`;
    return html;
  }).join('');
}

async function loadScheduleRunLog() {
  try {
    el.scheduleRunLogList.innerHTML = '<div class="spinner"></div> 載入中...';
    const response = await fetch(workerApiUrl('/schedule-runs?limit=10'));
    const result = await response.json();
    if (result.ok) {
      renderScheduleRunLog(result.runs);
    } else {
      el.scheduleRunLogList.innerHTML = `<div class="error-hint">載入失敗：${result.error}</div>`;
    }
  } catch (err) {
    el.scheduleRunLogList.innerHTML = `<div class="error-hint">連線錯誤：${err.message}</div>`;
  }
}

if (el.scheduleLogBtn) {
  el.scheduleLogBtn.addEventListener('click', () => {
    el.scheduleRunLogModal.hidden = false;
    loadScheduleRunLog();
  });
}

if (el.scheduleRunLogCloseBtn) {
  el.scheduleRunLogCloseBtn.addEventListener('click', () => {
    el.scheduleRunLogModal.hidden = true;
  });
}

if (el.scheduleRunLogRefreshBtn) {
  el.scheduleRunLogRefreshBtn.addEventListener('click', () => {
    loadScheduleRunLog();
  });
}
