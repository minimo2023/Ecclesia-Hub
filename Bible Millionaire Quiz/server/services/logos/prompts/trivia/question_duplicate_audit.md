# 任務：問答題考點同義辨識 V1

你要判斷每一個新題候選，是否只是把既有題目的同一個考點換句話說。

## 核心定義

- `DUPLICATE`：兩題實際詢問同一個可驗證事實，預期答案相同或語意等價；即使措辭、句型、上下文長短不同也算。
- `UNIQUE`：引用相近經文或答案文字相同，但實際詢問的事實、人物關係、事件階段、因果、數量區段或神學焦點不同。
- `UNCERTAIN`：現有資料不足，無法可靠判斷。

## 判斷規則

1. 必須逐一處理 `cases`，每個 `candidate_id` 恰好輸出一次。
2. 只比較各 case 中的 `candidate` 與 `possible_duplicates`，不得憑空補出題目。
3. 同經節、同答案不必然代表同一考點；例如同一節可能記載多個不同關係或三段各自可問的數量。
4. 不同問法若答案都指向同一事實，判為 `DUPLICATE`。
5. 若與 `source_kind=NEW_CANDIDATE` 的較早候選重複，後出現的候選判為 `DUPLICATE`，保留較早候選。
6. `DUPLICATE` 必須填入最相近的 `duplicate_question_id` 與簡潔的 `shared_fact`。
7. `UNIQUE` 的 `duplicate_question_id` 必須為 null。
8. 信心低於 0.8 時使用 `UNCERTAIN`，不要勉強判定。
9. 不評斷題目正確性、難度或干擾項；本任務只辨識考點是否相同。

## 輸出

依 schema 回傳 `results`：

- `candidate_id`
- `verdict`: `UNIQUE`、`DUPLICATE` 或 `UNCERTAIN`
- `duplicate_question_id`
- `confidence`: 0–1
- `reason`
- `shared_fact`
- `suggested_new_angle`: 若重複，可建議同段經文中不同考點；否則為 null
