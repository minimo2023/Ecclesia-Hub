import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platformDir = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.resolve(platformDir, '..');
const appRoot = path.join(hubRoot, 'Bible Millionaire Quiz');

const failures = [];

function requirePath(relativePath, type = 'file') {
  const absolutePath = path.join(hubRoot, relativePath);
  const exists = fs.existsSync(absolutePath);
  const validType = exists && (type === 'directory'
    ? fs.statSync(absolutePath).isDirectory()
    : fs.statSync(absolutePath).isFile());
  if (!validType) failures.push(`缺少 ${type === 'directory' ? '資料夾' : '檔案'}：${relativePath}`);
  return absolutePath;
}

function forbidPath(relativePath) {
  if (fs.existsSync(path.join(hubRoot, relativePath))) {
    failures.push(`作用中的開發樹仍含舊版或取消項目：${relativePath}`);
  }
}

function requireText(relativePath, markers) {
  const absolutePath = requirePath(relativePath);
  if (!fs.existsSync(absolutePath)) return;
  const text = fs.readFileSync(absolutePath, 'utf8');
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${relativePath} 缺少必要標記：${marker}`);
  }
}

function requireChunk(directory, prefix, minBytes, maxBytes) {
  if (!fs.existsSync(directory)) {
    failures.push(`缺少建置目錄：${path.relative(hubRoot, directory)}`);
    return;
  }
  const matches = fs.readdirSync(directory)
    .filter(name => name.startsWith(prefix) && name.endsWith('.js'));
  if (matches.length !== 1) {
    failures.push(`${path.relative(hubRoot, directory)} 應只有一個 ${prefix}*.js，實際為 ${matches.length}`);
    return;
  }
  const bytes = fs.statSync(path.join(directory, matches[0])).size;
  if (bytes < minBytes || bytes > maxBytes) {
    failures.push(`${matches[0]} 大小 ${bytes} 不在生產等價範圍 ${minBytes}-${maxBytes}`);
  }
}

requirePath('Bible Millionaire Quiz/src', 'directory');
requirePath('Bible Millionaire Quiz/mobile-app/src', 'directory');
requirePath('Bible Millionaire Quiz/dist', 'directory');
requirePath('Bible Millionaire Quiz/mobile-app/dist', 'directory');

[
  'Bible Millionaire Quiz/src/recovered-production',
  'Bible Millionaire Quiz/src/features/faith-assistant',
  'Bible Millionaire Quiz/src/features/scripture-study',
  'Bible Millionaire Quiz/src/features/scripture-explorer',
  'Bible Millionaire Quiz/mobile-app/src/recovered-production',
  'Bible Millionaire Quiz/mobile-app/src/pages/scripture-study',
  'Bible Millionaire Quiz/public/targeted-replenishment-admin.js',
].forEach(forbidPath);

requireText('Bible Millionaire Quiz/src/features/game/services/questions/QuestionService.js', [
  '/api/quiz/v2/hand',
  'difficultyTargets',
]);
requireText('Bible Millionaire Quiz/src/features/reading-plans/hooks/useReadingPlanWizard.js', [
  '/api/bible/reading-plans/wizard-preview',
  'actualReadingDays',
]);
requireText('Bible Millionaire Quiz/src/features/member/ScriptureReader.jsx', [
  "code: 'unv', name: '和合本'",
  "code: 'ncv', name: '新譯本'",
  "code: 'tcv2019', name: '現代中文2019'",
  "code: 'lcc', name: '呂振中譯本'",
]);
requireText('Bible Millionaire Quiz/mobile-app/src/components/devotion/DevotionNotes.jsx', [
  '/complete',
  'guest_devotional_notes',
]);
requireText('Bible Millionaire Quiz/public/mixed-translation-ui.js', ['四譯本混合出題']);
requireText('Bible Millionaire Quiz/public/question-bank-admin.js', [
  'question-bank-governance',
  '/api/admin/question-bank',
]);
requireText('Bible Millionaire Quiz/mobile-app/public/mixed-translation-ui.js', ['四譯本混合出題']);
requireText('Bible Millionaire Quiz/dist/index.html', [
  './question-bank-admin.js',
  './mixed-translation-ui.js',
]);
requireText('Bible Millionaire Quiz/mobile-app/dist/index.html', ['/mixed-translation-ui.js']);

const mobileLockPath = requirePath('Bible Millionaire Quiz/mobile-app/package-lock.json');
if (fs.existsSync(mobileLockPath)) {
  const lock = JSON.parse(fs.readFileSync(mobileLockPath, 'utf8'));
  const viteVersion = lock.packages?.['node_modules/vite']?.version;
  if (viteVersion !== '8.0.16') failures.push(`手機 Vite 必須固定為 8.0.16，實際為 ${viteVersion || '未安裝'}`);
}

const desktopAssets = path.join(appRoot, 'dist', 'assets');
const mobileAssets = path.join(appRoot, 'mobile-app', 'dist', 'assets');
requireChunk(desktopAssets, 'GameManager-', 88_000, 90_500);
// 2026-08-29 approved source baseline: devotional read-aloud, the compact
// desktop DevotionCard, mobile devotional background music and the separated
// desktop/mobile reading-plan wizards are part of the production candidate.
requireChunk(desktopAssets, 'DevotionCard-', 132_000, 136_000);
requireChunk(desktopAssets, 'ReadingPlansIndex-', 40_500, 42_500);
requireChunk(mobileAssets, 'GamePlayPage-', 94_000, 97_000);
requireChunk(mobileAssets, 'ReadingPlansRouterAdapter-', 42_000, 44_500);
requireChunk(mobileAssets, 'DevotionPage-', 144_000, 149_000);

if (failures.length) {
  console.error('開發基礎碼驗證失敗：');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('開發基礎碼驗證通過：作用樹已去除舊版，桌機與手機產物符合生產等價範圍。');
