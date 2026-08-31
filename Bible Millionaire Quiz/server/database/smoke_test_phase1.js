/**
 * Phase 1.1 — Migration Verification & Smoke Test Script
 * 
 * Usage:  node server/database/smoke_test_phase1.js
 * 
 * This script validates that all Phase 1.1 schema changes are correctly applied
 * and creates a test user with full data across all new tables.
 * 
 * ⚠️  Run against a DEV/TEST database only.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { usersDb } from './index.js';
import { crypto } from './core.js';
import bcrypt from 'bcryptjs';

const TEST_USER_PREFIX = '__smoke_test_';
let passed = 0;
let failed = 0;

function ok(label) { passed++; console.log(`  ✅ ${label}`); }
function fail(label, err) { failed++; console.error(`  ❌ ${label}:`, err); }

async function cleanup(userId) {
    // Delete test user (cascading will handle session/scene/character/wallet/lore)
    // Ledger/audit/membership/dialogue should SET NULL (not disappear)
    await usersDb.run('DELETE FROM users WHERE id = $1', [userId]);
}

async function run() {
    console.log('\n🧪 Phase 1.1 Migration Verification & Smoke Test\n');
    console.log('='.repeat(55));

    // ── 1. Create a test user ──
    console.log('\n📌 1. Creating test user...');
    const userId = crypto.randomUUID();
    const username = TEST_USER_PREFIX + Date.now();
    const hash = bcrypt.hashSync('test123456', 10);
    await usersDb.run(
        `INSERT INTO users (id, username, password_hash, display_name, coins) VALUES ($1, $2, $3, $4, 100)`,
        [userId, username, hash, 'Smoke Tester']
    );
    ok('Test user created: ' + username);

    // ── 2. Verify admin_roles default ──
    console.log('\n📌 2. Checking admin_roles default...');
    const user = await usersDb.get('SELECT admin_roles FROM users WHERE id = $1', [userId]);
    if (user && Array.isArray(user.admin_roles) && user.admin_roles.length === 0) {
        ok('admin_roles defaults to empty array');
    } else {
        fail('admin_roles default', `Got: ${JSON.stringify(user?.admin_roles)}`);
    }

    // ── 3. Verify AI wallet auto-backfill ──
    console.log('\n📌 3. Checking AI wallet backfill...');
    // Manually trigger backfill for new user (simulating startup)
    await usersDb.run(`
        INSERT INTO user_ai_credit_wallet (user_id, bonus_ai_credits, exchange_ai_credits, paid_ai_credits)
        VALUES ($1, 0, 0, 0) ON CONFLICT (user_id) DO NOTHING
    `, [userId]);
    const wallet = await usersDb.get('SELECT * FROM user_ai_credit_wallet WHERE user_id = $1', [userId]);
    if (wallet && wallet.bonus_ai_credits === 0 && wallet.exchange_ai_credits === 0 && wallet.paid_ai_credits === 0) {
        ok('AI wallet created with all zeros');
    } else {
        fail('AI wallet creation', wallet);
    }

    // Run backfill again — should be idempotent
    await usersDb.run(`
        INSERT INTO user_ai_credit_wallet (user_id, bonus_ai_credits, exchange_ai_credits, paid_ai_credits)
        SELECT id, 0, 0, 0 FROM users WHERE id = $1
        AND id NOT IN (SELECT user_id FROM user_ai_credit_wallet)
    `, [userId]);
    const walletCount = await usersDb.get(
        'SELECT COUNT(*) as c FROM user_ai_credit_wallet WHERE user_id = $1', [userId]
    );
    if (parseInt(walletCount.c) === 1) {
        ok('Backfill idempotent — no duplicate wallets');
    } else {
        fail('Backfill idempotency', `Count: ${walletCount.c}`);
    }

    // ── 4. Verify CHECK constraints on wallet ──
    console.log('\n📌 4. Checking wallet CHECK constraints...');
    try {
        await usersDb.run('UPDATE user_ai_credit_wallet SET bonus_ai_credits = -1 WHERE user_id = $1', [userId]);
        fail('CHECK constraint', 'Negative balance was allowed!');
    } catch (e) {
        ok('CHECK constraint blocks negative balance');
    }

    // ── 5. Verify membership partial unique index ──
    console.log('\n📌 5. Checking membership partial unique index...');
    await usersDb.run(
        `INSERT INTO user_memberships (user_id, plan_code, status) VALUES ($1, 'free', 'active')`, [userId]
    );
    ok('First active membership inserted');
    try {
        await usersDb.run(
            `INSERT INTO user_memberships (user_id, plan_code, status) VALUES ($1, 'vip', 'active')`, [userId]
        );
        fail('Partial unique index', 'Duplicate active membership was allowed!');
    } catch (e) {
        ok('Partial unique index blocks second active membership');
    }

    // ── 6. Seed narrative session chain ──
    console.log('\n📌 6. Creating narrative engine test data...');
    // Story Progress
    await usersDb.run(`
        INSERT INTO user_story_progress (user_id, story_id, current_scene_id)
        VALUES ($1, 'jonah', 'joppa_port_intro')
    `, [userId]);
    ok('user_story_progress row created');

    // Game Session
    const sessionId = crypto.randomUUID();
    await usersDb.run(`
        INSERT INTO narrative_game_sessions (session_id, user_id, story_id, current_scene_id, session_status)
        VALUES ($1, $2, 'jonah', 'joppa_port_intro', 'active')
    `, [sessionId, userId]);
    ok('narrative_game_sessions row created');

    // Scene State
    await usersDb.run(`
        INSERT INTO narrative_scene_states (session_id, story_id, scene_id, goal_progress)
        VALUES ($1, 'jonah', 'joppa_port_intro', 0)
    `, [sessionId]);
    ok('narrative_scene_states row created');

    // Character State
    await usersDb.run(`
        INSERT INTO narrative_character_states (session_id, scene_id, character_id, trust_level, memory_summary)
        VALUES ($1, 'joppa_port_intro', 'jonah', 0, '初次見面，尚未交談')
    `, [sessionId]);
    ok('narrative_character_states row created');

    // Dialogue Log
    await usersDb.run(`
        INSERT INTO narrative_dialogue_logs (session_id, user_id, story_id, scene_id, character_id, speaker, message, message_type)
        VALUES ($1, $2, 'jonah', 'joppa_port_intro', 'jonah', 'character', '我只是要離開。別問那麼多。', 'character_reply')
    `, [sessionId, userId]);
    ok('narrative_dialogue_logs row created');

    // Lore Unlock
    await usersDb.run(`
        INSERT INTO narrative_lore_unlocks (user_id, story_id, lore_key)
        VALUES ($1, 'jonah', 'joppa')
    `, [userId]);
    ok('narrative_lore_unlocks row created');

    // ── 7. Verify UNIQUE constraints ──
    console.log('\n📌 7. Checking UNIQUE constraints...');
    try {
        await usersDb.run(`
            INSERT INTO user_story_progress (user_id, story_id, current_scene_id)
            VALUES ($1, 'jonah', 'boarding_ship')
        `, [userId]);
        fail('user_story_progress UNIQUE', 'Duplicate user+story was allowed!');
    } catch (e) {
        ok('user_story_progress UNIQUE(user_id, story_id) enforced');
    }
    try {
        await usersDb.run(`
            INSERT INTO narrative_lore_unlocks (user_id, story_id, lore_key)
            VALUES ($1, 'jonah', 'joppa')
        `, [userId]);
        fail('lore_unlocks UNIQUE', 'Duplicate lore unlock was allowed!');
    } catch (e) {
        ok('narrative_lore_unlocks UNIQUE(user_id, story_id, lore_key) enforced');
    }

    // ── 8. Verify CASCADE on session delete ──
    console.log('\n📌 8. Checking CASCADE behavior (session tables)...');
    // Delete the session — scene_states + character_states should cascade
    await usersDb.run('DELETE FROM narrative_game_sessions WHERE session_id = $1', [sessionId]);
    const sceneAfter = await usersDb.get('SELECT COUNT(*) as c FROM narrative_scene_states WHERE session_id = $1', [sessionId]);
    const charAfter = await usersDb.get('SELECT COUNT(*) as c FROM narrative_character_states WHERE session_id = $1', [sessionId]);
    if (parseInt(sceneAfter.c) === 0) ok('scene_states CASCADE on session delete');
    else fail('scene_states CASCADE', sceneAfter);
    if (parseInt(charAfter.c) === 0) ok('character_states CASCADE on session delete');
    else fail('character_states CASCADE', charAfter);

    // Dialogue log should still exist (SET NULL)
    const dialogueAfter = await usersDb.get(
        `SELECT COUNT(*) as c FROM narrative_dialogue_logs WHERE user_id = $1 AND story_id = 'jonah'`, [userId]
    );
    if (parseInt(dialogueAfter.c) > 0) ok('dialogue_logs preserved after session delete (SET NULL)');
    else fail('dialogue_logs preservation', dialogueAfter);

    // ── 9. Write audit log ──
    console.log('\n📌 9. Checking audit log...');
    await usersDb.run(`
        INSERT INTO admin_audit_logs (admin_user_id, action_type, target_type, target_id, reason)
        VALUES ($1, 'smoke_test', 'user', $2, 'Phase 1.1 验证')
    `, [userId, userId]);
    ok('admin_audit_logs row created');

    // ── 10. Verify ledger/audit/membership survive user deletion ──
    console.log('\n📌 10. Checking SET NULL on user delete (ledger/audit/membership)...');
    // Write an AI credit ledger entry
    await usersDb.run(`
        INSERT INTO ai_credit_ledger (user_id, amount, credit_pool, reason, balance_after)
        VALUES ($1, 20, 'bonus', 'smoke_test_bonus', 20)
    `, [userId]);
    ok('ai_credit_ledger row created');

    // Now delete the user
    await cleanup(userId);
    ok('Test user deleted');

    // Check that ledger/audit/membership records still exist (with NULL user_id)
    const ledgerSurvived = await usersDb.get(
        `SELECT COUNT(*) as c FROM ai_credit_ledger WHERE reason = 'smoke_test_bonus' AND user_id IS NULL`
    );
    if (parseInt(ledgerSurvived.c) > 0) ok('ai_credit_ledger preserved with NULL user_id');
    else fail('ai_credit_ledger preservation', ledgerSurvived);

    const auditSurvived = await usersDb.get(
        `SELECT COUNT(*) as c FROM admin_audit_logs WHERE action_type = 'smoke_test' AND admin_user_id IS NULL`
    );
    if (parseInt(auditSurvived.c) > 0) ok('admin_audit_logs preserved with NULL user_id');
    else fail('admin_audit_logs preservation', auditSurvived);

    const membershipSurvived = await usersDb.get(
        `SELECT COUNT(*) as c FROM user_memberships WHERE plan_code = 'free' AND user_id IS NULL`
    );
    if (parseInt(membershipSurvived.c) > 0) ok('user_memberships preserved with NULL user_id');
    else fail('user_memberships preservation', membershipSurvived);

    // Clean up orphan test records
    await usersDb.run(`DELETE FROM ai_credit_ledger WHERE reason = 'smoke_test_bonus'`);
    await usersDb.run(`DELETE FROM admin_audit_logs WHERE action_type = 'smoke_test'`);
    await usersDb.run(`DELETE FROM user_memberships WHERE user_id IS NULL AND plan_code = 'free'`);
    await usersDb.run(`DELETE FROM narrative_dialogue_logs WHERE user_id IS NULL AND story_id = 'jonah'`);

    // ── Summary ──
    console.log('\n' + '='.repeat(55));
    console.log(`\n🧪 Results: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
    process.exit(0);
}

run().catch(err => {
    console.error('💥 Smoke test crashed:', err);
    process.exit(1);
});
