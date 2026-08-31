import pg from 'pg';
import { config } from '../utils/config.js';

const { Pool } = pg;
const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    max: 1,
    connectionTimeoutMillis: 10_000
});

const checks = {
    brokenLedgerChains: `
        WITH ordered AS (
            SELECT id, user_id, asset_type, delta, balance_after,
                   LAG(balance_after) OVER (
                       PARTITION BY user_id, asset_type ORDER BY id
                   ) AS previous_balance
            FROM asset_ledger
        )
        SELECT id, user_id, asset_type, delta, balance_after, previous_balance
        FROM ordered
        WHERE previous_balance IS NOT NULL
          AND previous_balance + delta <> balance_after
        ORDER BY id
        LIMIT 100
    `,
    coinWalletMismatches: `
        WITH latest AS (
            SELECT DISTINCT ON (user_id) user_id, balance_after
            FROM asset_ledger
            WHERE asset_type = 'COIN'
            ORDER BY user_id, id DESC
        )
        SELECT users.id AS user_id, users.coins AS wallet_balance,
               latest.balance_after AS ledger_balance
        FROM latest
        JOIN users ON users.id = latest.user_id
        WHERE users.coins <> latest.balance_after
        ORDER BY users.id
        LIMIT 100
    `,
    aiWalletMismatches: `
        WITH latest AS (
            SELECT DISTINCT ON (user_id) user_id, balance_after
            FROM asset_ledger
            WHERE asset_type = 'AI_CREDIT'
            ORDER BY user_id, id DESC
        )
        SELECT wallet.user_id,
               wallet.bonus_ai_credits + wallet.exchange_ai_credits + wallet.paid_ai_credits AS wallet_balance,
               latest.balance_after AS ledger_balance
        FROM latest
        JOIN ai_gov.user_ai_credit_wallet wallet ON wallet.user_id = latest.user_id
        WHERE wallet.bonus_ai_credits + wallet.exchange_ai_credits + wallet.paid_ai_credits
              <> latest.balance_after
        ORDER BY wallet.user_id
        LIMIT 100
    `
};

try {
    const results = {};
    for (const [name, sql] of Object.entries(checks)) {
        const { rows } = await pool.query(sql);
        results[name] = rows;
    }

    const issueCount = Object.values(results).reduce((sum, rows) => sum + rows.length, 0);
    console.log(JSON.stringify({
        checkedAt: new Date().toISOString(),
        status: issueCount === 0 ? 'ok' : 'mismatch',
        issueCount,
        results
    }, null, 2));
    if (issueCount > 0) process.exitCode = 2;
} catch (error) {
    console.error(JSON.stringify({ status: 'error', code: error.code || 'RECONCILIATION_FAILED' }));
    process.exitCode = 1;
} finally {
    await pool.end();
}
