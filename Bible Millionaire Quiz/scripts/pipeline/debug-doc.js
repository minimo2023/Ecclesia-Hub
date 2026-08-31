/**
 * 調試 DOC 提取 - 直接測試 Word COM
 */
import initSqlJs from 'sql.js';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join, basename } from 'path';

const db = new (await initSqlJs()).Database(readFileSync('data/content.db'));

// 取得一個 .doc 檔案路徑
const result = db.exec(`SELECT file_path FROM resources WHERE file_type = 'doc' LIMIT 1`);
const docPath = result[0].values[0][0];

console.log('📄 調試 DOC 提取');
console.log('='.repeat(50));
console.log('路徑:', docPath);
console.log('存在:', existsSync(docPath));

if (!existsSync(docPath)) {
    console.log('❌ 檔案不存在');
    process.exit(1);
}

// 測試 Word COM
console.log('\n嘗試 Word COM 轉換...');

const tempDir = tmpdir();
const outPath = join(tempDir, 'test_doc_output.txt');

// 正確的 PowerShell 腳本（使用單引號避免跳脫問題）
const ps1 = `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open('${docPath}')
    $doc.SaveAs('${outPath}', 2)
    $doc.Close()
    Write-Output 'SUCCESS'
} catch {
    Write-Output "ERROR: $_"
} finally {
    $word.Quit()
}
`;

try {
    const stdout = execSync(`powershell -Command "${ps1.replace(/\n/g, ' ')}"`, {
        encoding: 'utf-8',
        timeout: 60000
    });
    console.log('PowerShell 輸出:', stdout.trim());

    if (existsSync(outPath)) {
        const content = readFileSync(outPath, 'utf-8');
        console.log('✅ 成功！字數:', content.replace(/\s/g, '').length);
        console.log('預覽:', content.substring(0, 100).replace(/\n/g, ' '));
    }
} catch (err) {
    console.log('❌ 錯誤:', err.message);
}
