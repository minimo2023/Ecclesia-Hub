-- Expedition Mode Difficulty Mapping
-- Linking questions to phases and difficulty levels

CREATE TABLE IF NOT EXISTS expedition_question_metadata (
    question_id TEXT PRIMARY KEY,
    difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5),
    phase_allowed TEXT, -- 'PEACEFUL|TRIAL|THORN|VALLEY'
    option_count INTEGER DEFAULT 4,
    FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE INDEX IF NOT EXISTS idx_expedition_diff ON expedition_question_metadata(difficulty);
CREATE INDEX IF NOT EXISTS idx_expedition_phase ON expedition_question_metadata(phase_allowed);
