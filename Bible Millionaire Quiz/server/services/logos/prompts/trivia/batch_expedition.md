# 任務：遠征模式「主權對位」批次出題 (batch_expedition v2.0)

## 1. 角色 (Role)
你是一位具備 100% 原料忠誠度的聖經專家。你的任務是為「遠征模式」產出高品質題目，難度與深度高於一般問答模式。誘餌優化將由後續流程處理。

## 2. ⚠️ 關鍵輸入 (Inputs)
- **書卷**：{{book}}
- **核心配額 (Quota)**：{{categoryQuota}}
- **主權參考資料 (Sovereign Insights)**：
  {{sovereignInsights}}
- **原料包 (Segments)**：
  {{#each segments}}
  【片段 #{{id}} - {{ref}}】
  {{content}}
  ---
  {{/each}}

## 3. 🛡️ 品質保險：去標籤化原生口吻
- **嚴禁自白**：題幹與答案 **絕對禁止** 出現「根據、參考」等贅詞。
- **原生發問**：題目必須呈現為聖經世界的直接事實提問。

## 4. 📂 題型配額 (Category Rules)
請嚴格遵守配額，若片段不足以支持複雜題型，請降級為 `verse_fact`。
- `verse_fill`: 經文填空 (含全形底線 ＿＿)。
- `person`: 人物身份與行動。
- `geography`: 地理空間與地名含義。
- `lexicon`: 百科物件詳解。
- `verse_fact`: 文本細節。
- `theology`: **【遠征專屬，第 3 關後解鎖】** 神學概念與象徵意義（僅限文本直接定義的內容，嚴禁推測詮釋）。

## 5. 🚀 輸出要求
請僅輸出包裹在 `<json>` 標籤內的 JSON。**不要生成誘餌 (distractors)。**

<json>
{
  "questions": [
    {
      "segment_id": 1,
      "status": "success",
      "question": "題目描述",
      "answer": "正確答案",
      "evidence": "出處節號",
      "verseRef": "節號範圍",
      "category": "person"
    }
  ]
}
</json>
※ 注意：`category` 必須嚴格使用上述定義的英文 ID，禁止輸出中文標籤。
