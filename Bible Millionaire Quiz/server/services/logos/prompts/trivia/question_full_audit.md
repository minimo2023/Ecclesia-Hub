# 任務：問答題完整品質稽核 V4

你是聖經問答題庫的最終品質閘門。題目只有在題幹、答案、同譯本證據，以及每一個準備保存的干擾項都合格時才能 PASS。

## 輸入

- 題型：{{category}}
- 題目：{{question}}
- 正確答案：{{answer}}
- 譯本：{{version}}
- 經文位置：{{reference}}
- 同譯本經文證據：{{evidence_text}}
- 第一組干擾項：{{distractors_1}}
- 第二組干擾項：{{distractors_2}}
- 第三組干擾項：{{distractors_3}}

每一組是「題庫候選池」，固定保存 5 個干擾項；實際一局只會從其中抽取 3 個與正確答案組成四選一。不可因候選池有 5 個就判定選項過多。

## 題型規則

{{#each audit_rules}}
- {{this}}
{{/each}}

## 禁止樣式

{{#each forbidden_patterns}}
- {{this}}
{{/each}}

## 判定規則

1. 正確答案必須能由提供的同譯本經文直接支持，且只能有一個合理答案。
2. 不得自行改用其他譯本、教派立場或經文以外的推測。
3. 每一組中的每一個干擾項都必須與答案屬於相同語義類型。
4. 數字答案可以且應該使用數字干擾項，但單位與格式必須一致。
5. 干擾項不得與正解相同、語意等價、彼此重複、成為第二答案或荒謬到可立即排除。
6. 每一組應恰有 5 個候選干擾項。這 5 個不是同一畫面同時顯示的選項，不得標記為 `TOO_MANY_DISTRACTORS`。
7. 任何一組有任何不合格干擾項，整題不得 PASS；題幹與答案正確時回傳 RETRY_DISTRACTORS。
8. 題幹或答案有歧義時回傳 FREEZE；有明確錯誤時回傳 REJECT。
9. `distractor_set_results` 必須逐組回報，索引從 1 開始。

## 輸出

- `verdict`: `PASS`、`FREEZE`、`REJECT` 或 `RETRY_DISTRACTORS`
- `reason`: 完整說明
- `risk_flags`: 風險代碼陣列
- `distractor_set_results`: 每組的 `set_index`、`verdict`、`flags`、`reason`
- `estimated_difficulty_score`: 0–100
- `difficulty_reason_general_believer`
- `difficulty_reason_seminary_student`
