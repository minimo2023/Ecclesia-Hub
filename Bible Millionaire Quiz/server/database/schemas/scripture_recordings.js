/**
 * Scripture Explorer member recordings and passage-scoped community.
 * Binary audio remains outside PostgreSQL; only governed metadata is stored.
 */
export async function createScriptureRecordingTables(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS scripture_recordings (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_request_id TEXT NOT NULL,
            version TEXT NOT NULL,
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL CHECK (chapter > 0),
            verse_start INTEGER NOT NULL CHECK (verse_start > 0),
            verse_end INTEGER NOT NULL CHECK (verse_end >= verse_start AND verse_end - verse_start < 30),
            passage_hash TEXT NOT NULL,
            recording_kind TEXT NOT NULL DEFAULT 'READING'
                CHECK (recording_kind IN ('READING', 'VOICE_BLESSING')),
            visibility TEXT NOT NULL DEFAULT 'PRIVATE'
                CHECK (visibility IN ('PRIVATE', 'UNLISTED', 'PUBLIC')),
            status TEXT NOT NULL DEFAULT 'UPLOADING'
                CHECK (status IN ('UPLOADING', 'READY', 'HIDDEN_PENDING_REVIEW', 'REMOVED', 'DELETED')),
            active_asset_id TEXT,
            display_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
            comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMPTZ,
            UNIQUE(user_id, client_request_id)
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_recordings_owner
            ON scripture_recordings(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scripture_recordings_community
            ON scripture_recordings(version, book, chapter, verse_start, verse_end, published_at DESC)
            WHERE visibility = 'PUBLIC' AND status = 'READY';

        CREATE TABLE IF NOT EXISTS scripture_recording_assets (
            id TEXT PRIMARY KEY,
            recording_id TEXT NOT NULL REFERENCES scripture_recordings(id) ON DELETE CASCADE,
            client_request_id TEXT,
            storage_key TEXT NOT NULL UNIQUE,
            mime_type TEXT NOT NULL,
            extension TEXT NOT NULL,
            byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
            duration_ms INTEGER NOT NULL CHECK (duration_ms > 0 AND duration_ms <= 300000),
            sha256 TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'STAGING'
                CHECK (state IN ('STAGING', 'READY', 'SUPERSEDED', 'DELETED')),
            delete_after TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_recording_assets_recording
            ON scripture_recording_assets(recording_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scripture_recording_assets_cleanup
            ON scripture_recording_assets(state, delete_after)
            WHERE state IN ('SUPERSEDED', 'DELETED');

        CREATE TABLE IF NOT EXISTS scripture_recording_shares (
            id TEXT PRIMARY KEY,
            recording_id TEXT NOT NULL REFERENCES scripture_recordings(id) ON DELETE CASCADE,
            creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_request_id TEXT,
            token_hash TEXT NOT NULL UNIQUE,
            share_kind TEXT NOT NULL DEFAULT 'RECORDING'
                CHECK (share_kind IN ('RECORDING', 'VOICE_BLESSING')),
            recipient_label TEXT CHECK (recipient_label IS NULL OR char_length(recipient_label) <= 60),
            card_title TEXT CHECK (card_title IS NULL OR char_length(card_title) <= 80),
            card_message TEXT CHECK (card_message IS NULL OR char_length(card_message) <= 500),
            card_theme TEXT CHECK (card_theme IS NULL OR card_theme IN ('dawn', 'peace', 'hope')),
            signature_mode TEXT CHECK (signature_mode IS NULL OR signature_mode IN ('custom', 'member', 'anonymous')),
            signature_text TEXT CHECK (signature_text IS NULL OR char_length(signature_text) <= 60),
            expires_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_recording_shares_recording
            ON scripture_recording_shares(recording_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS scripture_recording_reactions (
            id TEXT PRIMARY KEY,
            recording_id TEXT NOT NULL REFERENCES scripture_recordings(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reaction_type TEXT NOT NULL
                CHECK (reaction_type IN ('THANKS', 'AMEN', 'HELPED', 'GROWING')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(recording_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS scripture_recording_comments (
            id TEXT PRIMARY KEY,
            recording_id TEXT NOT NULL REFERENCES scripture_recordings(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            idempotency_key TEXT NOT NULL,
            content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
            status TEXT NOT NULL DEFAULT 'VISIBLE'
                CHECK (status IN ('VISIBLE', 'HIDDEN', 'REMOVED')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMPTZ,
            UNIQUE(user_id, idempotency_key)
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_recording_comments_recording
            ON scripture_recording_comments(recording_id, created_at);

        CREATE TABLE IF NOT EXISTS scripture_recording_reports (
            id TEXT PRIMARY KEY,
            recording_id TEXT NOT NULL REFERENCES scripture_recordings(id) ON DELETE CASCADE,
            reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reason TEXT NOT NULL,
            detail TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(recording_id, reporter_user_id)
        );

        CREATE TABLE IF NOT EXISTS scripture_recording_blocks (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(user_id, blocked_user_id),
            CHECK (user_id <> blocked_user_id)
        );

        CREATE TABLE IF NOT EXISTS scripture_recording_notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            recording_id TEXT REFERENCES scripture_recordings(id) ON DELETE CASCADE,
            notification_type TEXT NOT NULL
                CHECK (notification_type IN ('REACTION', 'COMMENT', 'MODERATION')),
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            read_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_scripture_recording_notifications_user
            ON scripture_recording_notifications(user_id, read_at, created_at DESC);

        CREATE TABLE IF NOT EXISTS scripture_recording_moderation_events (
            id TEXT PRIMARY KEY,
            recording_id TEXT REFERENCES scripture_recordings(id) ON DELETE SET NULL,
            comment_id TEXT REFERENCES scripture_recording_comments(id) ON DELETE SET NULL,
            actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            reason TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'scripture_recording_assets'
                  AND column_name = 'client_request_id'
            ) THEN
                ALTER TABLE scripture_recording_assets ADD COLUMN client_request_id TEXT;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_scripture_recordings_active_asset'
            ) THEN
                ALTER TABLE scripture_recordings
                    ADD CONSTRAINT fk_scripture_recordings_active_asset
                    FOREIGN KEY (active_asset_id)
                    REFERENCES scripture_recording_assets(id)
                    ON DELETE SET NULL
                    DEFERRABLE INITIALLY DEFERRED;
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_scripture_recording_asset_request
            ON scripture_recording_assets(recording_id, client_request_id)
            WHERE client_request_id IS NOT NULL;

        ALTER TABLE scripture_recording_shares ADD COLUMN IF NOT EXISTS client_request_id TEXT;
        ALTER TABLE scripture_recording_shares ADD COLUMN IF NOT EXISTS share_kind TEXT NOT NULL DEFAULT 'RECORDING';
        ALTER TABLE scripture_recording_shares ADD COLUMN IF NOT EXISTS recipient_label TEXT;
        ALTER TABLE scripture_recording_shares ADD COLUMN IF NOT EXISTS card_title TEXT;
        ALTER TABLE scripture_recording_shares ADD COLUMN IF NOT EXISTS card_message TEXT;
        ALTER TABLE scripture_recording_shares ADD COLUMN IF NOT EXISTS card_theme TEXT;
        ALTER TABLE scripture_recording_shares ADD COLUMN IF NOT EXISTS signature_mode TEXT;
        ALTER TABLE scripture_recording_shares ADD COLUMN IF NOT EXISTS signature_text TEXT;

        ALTER TABLE scripture_recordings
            ADD COLUMN IF NOT EXISTS recording_kind TEXT NOT NULL DEFAULT 'READING';

        UPDATE scripture_recordings r
        SET recording_kind = 'VOICE_BLESSING'
        WHERE recording_kind <> 'VOICE_BLESSING'
          AND EXISTS (
              SELECT 1
              FROM scripture_recording_shares s
              WHERE s.recording_id = r.id
                AND s.share_kind = 'VOICE_BLESSING'
          );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'chk_scripture_recordings_kind'
            ) THEN
                ALTER TABLE scripture_recordings
                    ADD CONSTRAINT chk_scripture_recordings_kind
                    CHECK (recording_kind IN ('READING', 'VOICE_BLESSING'));
            END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS idx_scripture_recordings_owner_kind
            ON scripture_recordings(user_id, recording_kind, created_at DESC)
            WHERE status <> 'DELETED';

        CREATE UNIQUE INDEX IF NOT EXISTS uq_scripture_recording_share_request
            ON scripture_recording_shares(creator_user_id, client_request_id)
            WHERE client_request_id IS NOT NULL;
    `);
}

export default createScriptureRecordingTables;
