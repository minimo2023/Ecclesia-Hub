import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const CONFIG = {
    user: 'weien',
    host: 'Weien-WEBS',
    keyPath: path.join(os.homedir(), '.ssh', 'id_ed25519')
};

function run(cmd) {
    console.log(`\n🚀 Executing: ${cmd}`);
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
        console.error(`❌ Command failed: ${cmd}`);
        process.exit(1);
    }
}

console.log('🧹 準備清除正式機 (Weien-WEBS) 題庫中所有的錯項 (options)...');

// psql 命令：將題庫中所有的選項重置為 '[]'，並將正確解答索引重置為 NULL
// 這樣遊戲引擎就會在下次遇到該題時，自動呼叫 AI 重新生成！
const sql = "UPDATE questions SET options = '''[]''', correct_index = NULL WHERE options::text != '''[]''';";

// Docker exec 命令 (處理引號逃脫)
const remoteCmd = `docker exec bible-quiz-db psql -U bibleuser -d bibledb -c "${sql}"`;

// 透過 SSH 執行
console.log('📡 連線至正式機並執行清除指令...');
run(`ssh -i "${CONFIG.keyPath}" ${CONFIG.user}@${CONFIG.host} 'docker exec bible-quiz-db psql -U bibleuser -d bibledb -c "UPDATE questions SET options = ''[]'', correct_index = NULL WHERE options::text != ''[]'';"'`);

console.log('✅ 正式機題庫錯項已全數清除成功！');
console.log('遊戲在運行時，會自動在背景將這些缺失錯項的題目交由 AI 重新補齊。');
