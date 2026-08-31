/**
 * [SOVEREIGN UNIT] Sovereignty Auditor
 * v1.1 - Detect naming violations (camelCase leaks)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// 排除目錄
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'backups', 'public', '.agent', 'scripts'];
// 排除檔案
const EXCLUDE_FILES = ['sovereignty-audit.js', 'package.json', 'package-lock.json', 'audit_report_raw.txt'];

// 已知合法或標準 JS 駝峰命名 (白名單)
const ALLOW_LIST = [
  'console', 'process', 'window', 'localStorage', 'sessionStorage', 'document',
  'JSON', 'Array', 'Object', 'Math', 'Date', 'Promise', 'Error',
  'innerHTML', 'textContent', 'id', 'className', 'classList',
  'req', 'res', 'next', 'socket', 'io', 'app', 'router', 'express',
  'userId', 'username', 'role',
  'useEffect', 'useState', 'useContext', 'useRef', 'useCallback', 'useMemo',
  'AuthContext', 'QuizEngine', 'QuestionCore', 'LogosEngine', 'ExpeditionService',
  'DatabaseFactory', 'PostgresAdapter', 'SqliteAdapter',
  'toString', 'toJSON', 'toLocaleString', 'hasOwnProperty', 'addEventListener', 'removeEventListener'
];

const camelPattern = /\b[a-z]+[A-Z][a-z0-9]+\b/g;

function scanFile(filePath) {
  let content;
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > 1024 * 512) return []; // 跳過大於 512KB 的檔案
    
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return [];
  }
  
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    // 1. 偵測通用 camelCase
    const matches = line.match(camelPattern);
    if (matches) {
      matches.forEach(word => {
        if (!ALLOW_LIST.includes(word) && !word.startsWith('on')) {
          violations.push({
            line: index + 1,
            word,
            type: 'CAMEL_CASE',
            context: line.trim().substring(0, 100)
          });
        }
      });
    }

    // 2. 偵測 API 邊界
    const apiMatch = line.match(/req\.(body|query)\.([a-zA-Z0-9_]+)/);
    if (apiMatch) {
      const field = apiMatch[2];
      if (/[A-Z]/.test(field)) {
        violations.push({
          line: index + 1,
          word: field,
          type: 'API_PARAMETER',
          context: line.trim().substring(0, 100)
        });
      }
    }
  });

  return violations;
}

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const relPath = path.relative(ROOT_DIR, dirPath);
    
    if (EXCLUDE_DIRS.some(d => relPath.startsWith(d))) return;
    if (EXCLUDE_FILES.includes(f)) return;

    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      if (f.endsWith('.js') || f.endsWith('.jsx')) {
        callback(dirPath);
      }
    }
  });
}

console.log('🔍 [Sovereignty Auditor] Starting scan...');
let totalViolations = 0;
const report = {};

walkDir(ROOT_DIR, (filePath) => {
  const fileViolations = scanFile(filePath);
  if (fileViolations.length > 0) {
    const relPath = path.relative(ROOT_DIR, filePath);
    report[relPath] = fileViolations;
    totalViolations += fileViolations.length;
  }
});

if (totalViolations > 0) {
  console.log(`\n❌ Found ${totalViolations} violations across ${Object.keys(report).length} files:`);
  Object.keys(report).forEach(file => {
    console.log(`\n📄 ${file}:`);
    report[file].forEach(v => {
      console.log(`  [L${v.line}] [${v.type}] ${v.word} -> ${v.context}`);
    });
  });
  process.exit(1);
} else {
  console.log('\n✅ 0 violations found. Sovereignty is maintained.');
  process.exit(0);
}
