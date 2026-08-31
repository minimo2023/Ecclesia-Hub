/**
 * AI Response Parser Utility
 * v3.12 [REPAIRED] - Highly Resilient JSON Recoverer
 * 
 * 專門處理：
 * 1. AI 輸出截斷 (Truncation)
 * 2. 經文內容包含 {} 或未轉義引號造成的語法報錯
 * 3. 智能回溯至最後一個有效物件
 */

export function parseAIJSON(rawText) {
    if (!rawText) return null;

    // 清理函數：移除雜訊並修復 JSON 結構
    const sanitizeForJSON = (str) => {
        // Step 0: [SOVEREIGN V3.16] XML Tag Extraction (JIT Support - Loose Mode)
        let clean = str;
        const startTagMatch = str.match(/<(?:json|result|output)>/i);
        if (startTagMatch) {
            const startIdx = startTagMatch.index + startTagMatch[0].length;
            const endTagMatch = str.match(/<\/(?:json|result|output)>/i);
            if (endTagMatch) {
                clean = str.substring(startIdx, endTagMatch.index).trim();
            } else {
                // 如果沒有結尾標籤，抓取從開始標籤後的所有內容
                clean = str.substring(startIdx).trim();
            }
        }

        // Step 1: 基礎清理
        clean = clean
            .replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1') // 提取 Markdown Block
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // 移除非法控制符

        // Step 1.5: 修復常見的 JSON 結構缺失 (如陣列中物件之間忘記加逗號)
        clean = clean.replace(/\}\s*\{/g, '}, {')
                     .replace(/"\s*"/g, '", "')
                     .replace(/"\s*\{/g, '", {')
                     .replace(/\}\s*"/g, '}, "');

        // Step 2: 深度引號修復 (防止經文內含未轉義引號)
        // 使用回溯忽略已被轉義的引號
        clean = clean.replace(/:\s*"([\s\S]*?)"(?=\s*[,}\]])/g, (match, content) => {
            const repairedContent = content.replace(/(?<!\\)"/g, '\\"');
            return `: "${repairedContent}"`;
        });

        // Step 3: [SOVEREIGN V3.12] 字串感應括號補全器 (Quote-Aware)
        // 解決經文內含有 {} 被統計成 JSON 語法結構的問題
        let openBraces = 0, closeBraces = 0;
        let openBrackets = 0, closeBrackets = 0;
        let inQuote = false;
        let lastValidChar = '';

        for (let i = 0; i < clean.length; i++) {
            const char = clean[i];
            const nextChar = clean[i+1] || '';
            
            // 處理轉義引號
            if (char === '\\' && nextChar === '"') {
                i++; // 跳過下一個字元
                continue;
            }

            if (char === '"') {
                inQuote = !inQuote;
                continue;
            }

            // 僅在非字串內部統計括號
            if (!inQuote) {
                if (char === '{') openBraces++;
                if (char === '}') closeBraces++;
                if (char === '[') openBrackets++;
                if (char === ']') closeBrackets++;
                if (/\S/.test(char)) lastValidChar = char;
            }
        }

        // 如果在字串內部結束（截斷），先補齊引號
        if (inQuote) clean += '"';

        // 移除末尾懸掛的逗號
        if (lastValidChar === ',') {
            clean = clean.trim().replace(/,$/, '');
        }

        // 智能補全
        let suffix = "";
        if (openBraces > closeBraces) suffix += '}'.repeat(openBraces - closeBraces);
        if (openBrackets > closeBrackets) suffix += ']'.repeat(openBrackets - closeBrackets);
        
        return clean + suffix;
    };

    let text = sanitizeForJSON(rawText);
    
    // [V3.13] Pre-parse check: If it doesn't start with { or [, try to find them
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        const startIdx = Math.min(
            text.indexOf('{') === -1 ? Infinity : text.indexOf('{'),
            text.indexOf('[') === -1 ? Infinity : text.indexOf('[')
        );
        const endIdx = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
        
        if (startIdx !== Infinity && endIdx !== -1 && endIdx > startIdx) {
            console.log('🛡️ [AI Parser] Non-standard JSON shell detected, extracting core data...');
            text = text.substring(startIdx, endIdx + 1);
        }
    }

    try {
        return JSON.parse(text);
    } catch (firstError) {
        console.log('🛡️ [AI Parser] Standard parse failed, initiating Multi-Strategy Recovery...');

        // 策略 A: 最長平衡括號提取 (Longest Balanced Substring)
        const findBalancedJSON = (s) => {
            const start = s.indexOf('{');
            if (start === -1) return null;
            let netBraces = 0;
            let inQuote = false;
            for (let i = start; i < s.length; i++) {
                if (s[i] === '"' && s[i-1] !== '\\') inQuote = !inQuote;
                if (!inQuote) {
                    if (s[i] === '{') netBraces++;
                    if (s[i] === '}') {
                        netBraces--;
                        if (netBraces === 0) return s.substring(start, i + 1);
                    }
                }
            }
            // 若未閉合但有開頭，嘗試補全
            if (netBraces > 0) {
                let partial = s.substring(start);
                if (inQuote) partial += '"';
                return partial + '}'.repeat(netBraces);
            }
            return null;
        };

        const balanced = findBalancedJSON(text);
        if (balanced) {
            try {
                return JSON.parse(balanced);
            } catch (e) { /* 繼續嘗試策略 B */ }
        }
        
        // 策略 B: 逐字回溯 (Legacy Strong)
        let searchIndex = text.length;
        let attempts = 0;
        while (attempts < 20) {
            attempts++;
            const lastBrace = text.lastIndexOf('}', searchIndex - 1);
            if (lastBrace === -1) break;
            let backtracked = text.substring(0, lastBrace + 1).trim();
            // 基礎修復
            if ((backtracked.match(/(?<!\\)"/g) || []).length % 2 !== 0) backtracked += '"';
            const openB = (backtracked.match(/\{/g) || []).length;
            const closeB = (backtracked.match(/\}/g) || []).length;
            if (openB > closeB) backtracked += '}'.repeat(openB - closeB);
            
            try {
                return JSON.parse(backtracked);
            } catch (retryError) {
                searchIndex = lastBrace;
            }
        }

        // [AUTO-BOXING FALLBACK] 終極防線
        if (text.indexOf('{') === -1 && text.indexOf('[') === -1) {
            console.warn('🛡️ [AI Parser] No JSON structure found, applying auto-boxing fallback.');
            return { response: text.trim() };
        }
        
        console.error('❌ [AI Parser] Critical failure: All recovery attempts exhausted.');
        throw new Error('Critical JSON corruption: ' + firstError.message);
    }
}

export function safeParseJSON(val, fallback = []) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch (e) { return fallback; }
}
