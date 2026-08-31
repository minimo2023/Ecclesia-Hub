BEGIN;

CREATE TABLE IF NOT EXISTS question_corpus_reaudit_runs (
    id TEXT PRIMARY KEY,
    standard_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PREPARING',
    corpus_fingerprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_questions INTEGER NOT NULL DEFAULT 0,
    evidence_ready_count INTEGER NOT NULL DEFAULT 0,
    evidence_unavailable_count INTEGER NOT NULL DEFAULT 0,
    structural_failure_count INTEGER NOT NULL DEFAULT 0,
    ai_pending_count INTEGER NOT NULL DEFAULT 0,
    ai_completed_count INTEGER NOT NULL DEFAULT 0,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prepared_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_corpus_reaudit_items (
    run_id TEXT NOT NULL REFERENCES question_corpus_reaudit_runs(id) ON DELETE RESTRICT,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    original_status TEXT,
    original_quality_state TEXT,
    version_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence_status TEXT NOT NULL,
    evidence_reason TEXT,
    evidence_snapshot JSONB,
    structural_status TEXT NOT NULL,
    structural_reason TEXT,
    answer_literal_in_evidence BOOLEAN,
    ai_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    audit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    pass_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    priority INTEGER NOT NULL DEFAULT 100,
    final_result TEXT,
    last_error TEXT,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_question_corpus_reaudit_runs_status
    ON question_corpus_reaudit_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_corpus_reaudit_items_queue
    ON question_corpus_reaudit_items(run_id, ai_status, priority, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_question_corpus_reaudit_items_question
    ON question_corpus_reaudit_items(question_id, created_at DESC);

COMMIT;
