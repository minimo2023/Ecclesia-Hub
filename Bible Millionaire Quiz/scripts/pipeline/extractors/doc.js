/**
 * DOC 提取器（舊版 Word）
 * 策略：Word 將 .doc 另存為 .docx，然後用 mammoth 提取
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';
import mammoth from 'mammoth';

export const name = 'doc';
export const extensions = ['.doc'];

export async function extract(filePath) {
    const tempDir = tmpdir();
    const id = crypto.randomUUID().substring(0, 8);
    const localDocPath = join(tempDir, `temp_${id}.doc`);
    const localDocxPath = join(tempDir, `temp_${id}.docx`);

    try {
        // 1. 複製到本地
        copyFileSync(filePath, localDocPath);

        // 2. Word 將 .doc 另存為 .docx (wdFormatXMLDocument = 12)
        const ps1Path = join(tempDir, `convert_${id}.ps1`);
        const script = `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open("${localDocPath.replace(/\\/g, '\\\\')}")
    $doc.SaveAs("${localDocxPath.replace(/\\/g, '\\\\')}", 12)
    $doc.Close()
    "SUCCESS"
} catch {
    "ERROR: $_"
} finally {
    $word.Quit()
}
`;
        const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
        writeFileSync(ps1Path, Buffer.concat([BOM, Buffer.from(script, 'utf-8')]));

        const result = execSync(`powershell -ExecutionPolicy Bypass -File "${ps1Path}"`, {
            encoding: 'utf-8',
            timeout: 120000
        });

        try { unlinkSync(ps1Path); } catch { }

        if (result.includes('SUCCESS') && existsSync(localDocxPath)) {
            // 3. 用 mammoth 提取 docx
            const buffer = readFileSync(localDocxPath);
            const extracted = await mammoth.extractRawText({ buffer });
            return extracted.value;
        }

        throw new Error('Word conversion failed: ' + result.trim());
    } finally {
        try { unlinkSync(localDocPath); } catch { }
        try { unlinkSync(localDocxPath); } catch { }
    }
}

export function isAvailable() {
    return true;
}
