/**
 * 經文選取專用 Prompt
 *
 * 任務：根據今日主題/節日，僅選取一段合適的經文引用
 */

import { BIBLE_BOOKS } from './core.js';

export const SELECTION_SYSTEM_PROMPT = `你是一個精通聖經的神學助手。
你的唯一任務是：根據給定的主題、節日或範圍，選取一段最合適的經文引用。

請嚴格遵守以下規則：
1. 僅輸出 JSON 格式。
2. 經文長度適中（約 1-3 節）。
3. 必須在指定的「書籍範圍」內選擇（若有指定）。
4. 若為節日（如聖誕節），必須選擇高度相關的經文。
5. 【重要】必須避開 "exclusions" 列表中的經文引用，以免重複。
6. 若有 "suggestion" 提示，請優先考慮其中的書卷以增加多樣性。

輸出格式範例：
{
  "book": "馬太福音",
  "chapter": 11,
  "verseStart": 28,
  "verseEnd": 30,
  "reason": "這段經文呼應了今日關於安息的主題..."
}`;

/**
 * 建構選取用的 User Prompt
 */
export function buildSelectionPrompt({ date, isSunday, holiday, topicFocus, excludeList = [], diversitySuggestion = '' }) {
    return JSON.stringify({
        date,
        isSunday,
        holiday: holiday ? { name: holiday.name, theme: holiday.theme } : null,
        topicFocus: topicFocus ? {
            name: topicFocus.name,
            description: topicFocus.description,
            allowedBooks: topicFocus.suggestedBooks // 重點：限制 AI 選書範圍
        } : { name: '自由選擇', allowedBooks: '全本聖經' },
        exclusions: excludeList, // 明確列出最近已使用過的經文
        suggestion: diversitySuggestion ? `建議優先考慮以下較少使用的書卷：${diversitySuggestion}` : ''
    });
}
