const fs = require('fs');
const content = fs.readFileSync('XIT-Worker/app.js', 'utf8');

const target = `
  document.querySelector("#generateBtn").disabled = activeRolePage !== "main";
  document.querySelector("#generateBtn").style.display = activeRolePage === "main" ? "" : "none";
  if (el.scheduleLogBtn) {
    el.scheduleLogBtn.style.display =
      (activeRolePage === "main" && hasAdminAccess()) ? "" : "none";
  }
  document.querySelector("#auditBtn").style.display =
    (activeRolePage === "main" && hasCompleteMainSchedule()) ? "" : "none";
  updateAuditButton();
  el.schedulePage.style.display = isSchedulePage && !isRules ? "block" : "none";
  el.personnelPage.style.display = isPeople ? "block" : "none";
  const rulesPage = document.querySelector("#rulesPage");
  if (rulesPage) rulesPage.style.display = isRules ? "block" : "none";
  const analyticsPage = document.querySelector("#analyticsPage");
  if (analyticsPage) analyticsPage.style.display = isAnalytics ? "block" : "none";
  document.querySelector("#clearBtn").style.display = activeRolePage === "output" || isPeople || isRules || isAnalytics ? "none" : "";
`;

const replacement = `
  const canManage = canManageSchedulePage(activeRolePage);
  document.querySelector("#generateBtn").disabled = activeRolePage !== "main" || !canManage;
  document.querySelector("#generateBtn").style.display = (activeRolePage === "main" && canManage) ? "" : "none";
  if (el.scheduleLogBtn) {
    el.scheduleLogBtn.style.display =
      (activeRolePage === "main" && hasAdminAccess()) ? "" : "none";
  }
  document.querySelector("#auditBtn").style.display =
    (activeRolePage === "main" && hasCompleteMainSchedule() && canManage) ? "" : "none";
  updateAuditButton();
  el.schedulePage.style.display = isSchedulePage && !isRules ? "block" : "none";
  el.personnelPage.style.display = isPeople ? "block" : "none";
  const rulesPage = document.querySelector("#rulesPage");
  if (rulesPage) rulesPage.style.display = isRules ? "block" : "none";
  const analyticsPage = document.querySelector("#analyticsPage");
  if (analyticsPage) analyticsPage.style.display = isAnalytics ? "block" : "none";
  document.querySelector("#clearBtn").style.display = activeRolePage === "output" || isPeople || isRules || isAnalytics || !canManage ? "none" : "";
`;

if (content.includes(target.trim())) {
    fs.writeFileSync('XIT-Worker/app.js', content.replace(target.trim(), replacement.trim()), 'utf8');
    console.log('Successfully replaced content.');
} else {
    console.log('Target content not found.');
}
