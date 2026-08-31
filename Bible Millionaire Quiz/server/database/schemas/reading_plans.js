/**
 * 讀經計畫系統 Schema (reading_plans)
 * [V3 Sovereign Proxy]
 * Optimized for PostgreSQL 1.2
 */

export async function createReadingPlansTables(db) {
    // 1. reading_plans (讀經計畫目錄 / 經文範圍定義)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.reading_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title TEXT NOT NULL,
            description TEXT,
            target_ranges JSONB NOT NULL,
            default_duration_days INTEGER NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. user_reading_plans (使用者訂閱與偏好)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.user_reading_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
            status TEXT DEFAULT 'active', -- active, completed, paused, abandoned
            schedule_algorithm TEXT DEFAULT 'chronological',
            schedule_version TEXT DEFAULT 'v4.2',
            reading_days JSONB DEFAULT '["1", "2", "3", "4", "5", "6", "0"]',
            target_end_date DATE,
            last_resync_summary JSONB,
            resync_notice_pending BOOLEAN DEFAULT false,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP WITH TIME ZONE
        );
    `);
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_reading_plans_user ON public.user_reading_plans(user_id);
    `);
    await db.exec(`
        ALTER TABLE public.user_reading_plans
            ADD COLUMN IF NOT EXISTS target_end_date DATE,
            ADD COLUMN IF NOT EXISTS schedule_version TEXT,
            ADD COLUMN IF NOT EXISTS last_resync_summary JSONB,
            ADD COLUMN IF NOT EXISTS resync_notice_pending BOOLEAN DEFAULT false;
        ALTER TABLE public.user_reading_plans ALTER COLUMN schedule_version SET DEFAULT 'v4.2';
    `);

    // 3. user_reading_schedule (排程與彈性重排紀錄)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.user_reading_schedule (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_plan_id UUID NOT NULL REFERENCES user_reading_plans(id) ON DELETE CASCADE,
            day_number INTEGER NOT NULL,
            assigned_date DATE NOT NULL,
            scripture_references JSONB NOT NULL,
            completed_at TIMESTAMP WITH TIME ZONE,
            UNIQUE(user_plan_id, day_number)
        );
    `);
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_reading_schedule_assigned_date ON public.user_reading_schedule(assigned_date);
    `);

    // 舊資料若同一使用者存在多個 active，只保留最新一筆；不刪除歷史。
    await db.exec(`
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY started_at DESC, id DESC) AS rank
            FROM public.user_reading_plans
            WHERE status = 'active'
        )
        UPDATE public.user_reading_plans AS plans
        SET status = 'abandoned'
        FROM ranked
        WHERE plans.id = ranked.id AND ranked.rank > 1;
    `);
    await db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_reading_plans_one_active
        ON public.user_reading_plans(user_id)
        WHERE status = 'active';
    `);
    await db.exec(`
        UPDATE public.user_reading_plans AS plans
        SET target_end_date = summary.last_date
        FROM (
            SELECT user_plan_id, MAX(assigned_date) AS last_date
            FROM public.user_reading_schedule
            GROUP BY user_plan_id
        ) AS summary
        WHERE plans.id = summary.user_plan_id AND plans.target_end_date IS NULL;
    `);
}
