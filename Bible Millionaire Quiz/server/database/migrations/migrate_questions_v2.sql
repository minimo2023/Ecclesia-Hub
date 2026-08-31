-- ============================================================
-- migrate_questions_v2.sql
-- Phase 2: 資料庫架構大一統
-- 目標：欄位更名 + 冗餘清理 + 存量智慧修補
-- ============================================================

-- Step 1: 欄位更名（question_text → question, correct_answer → answer）
-- 使用 IF EXISTS 防止資料庫已執行過遷移時的錯誤
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'question_text'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'question'
    ) THEN
        ALTER TABLE questions RENAME COLUMN question_text TO question;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'correct_answer'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'answer'
    ) THEN
        ALTER TABLE questions RENAME COLUMN correct_answer TO answer;
    END IF;
END $$;

-- Step 2: 清理冗餘欄位（審計確認這些欄位在代碼中已棄用）
ALTER TABLE questions DROP COLUMN IF EXISTS difficulty_detected;
ALTER TABLE questions DROP COLUMN IF EXISTS stem;
ALTER TABLE questions DROP COLUMN IF EXISTS type;
ALTER TABLE questions DROP COLUMN IF EXISTS question_type;

-- Step 3: 確保 category 與 difficulty 欄位及全新難度積分欄位存在（容錯）
ALTER TABLE questions ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'MEDIUM';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_difficulty_score INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_score INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_breakdown JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_flags JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_score_source TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_source TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_confidence NUMERIC;

-- Step 4: 智慧修補現有舊題的 category（不一刀切）
-- 4a. EASY 難度的題：標記為 verse_fill（填空題）
UPDATE questions
SET category = 'verse_fill'
WHERE category IS NULL
  AND (difficulty = 'EASY' OR difficulty = 'easy');

-- 4b. HARD 難度的題：依題目 ID 奇偶交替分配地理/綜合
UPDATE questions
SET category = CASE
    WHEN ABS(HASHTEXT(id)) % 2 = 0 THEN 'geography'
    ELSE 'lexicon'
END
WHERE category IS NULL
  AND (difficulty = 'HARD' OR difficulty = 'hard');

-- 4c. 其餘（medium 或未設定）：依題目 ID 奇偶交替分配事實/人物
UPDATE questions
SET category = CASE
    WHEN ABS(HASHTEXT(id)) % 2 = 0 THEN 'verse_fact'
    ELSE 'person'
END
WHERE category IS NULL;

-- Step 5: 確保 status 欄位的一致性（只保留 PASS 狀態的題目用於遊戲）
-- 如果有 'active' 狀態的舊題，轉換為 PASS 以讓引擎能撈到它們
UPDATE questions SET status = 'PASS' WHERE status = 'active';

-- Step 6: 確認結果
SELECT category, difficulty, COUNT(*) as count
FROM questions
GROUP BY category, difficulty
ORDER BY difficulty, category;
