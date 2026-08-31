const { Pool } = require('pg');
const Database = require('better-sqlite3');
require('dotenv').config();

const pool = new Pool({
    host: '127.0.0.1', port: 5433,
    user: 'dev', password: 'dev123', database: 'bible_quiz_dev'
});

async function migrateAssets() {
    const dbUsers = new Database('data/users.db');
    const dbGames = new Database('data/games.db');
    const dbNotes = new Database('data/notes.db');

    const pgUsers = await pool.query("SELECT id, username FROM users");
    console.log(`💰 Calculating assets for ${pgUsers.rows.length} users...`);

    for (const user of pgUsers.rows) {
        const uid = user.id;
        console.log(`   🪙 Processing [${user.username}]...`);

        // 1. Achievements (from users.db)
        const achRewards = dbUsers.prepare(`
            SELECT SUM(a.coin_reward) as total 
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = ?
        `).get(uid).total || 0;

        // 2. Games (from games.db)
        const gameResults = dbGames.prepare(`
            SELECT SUM(coins_earned) as coins, SUM(xp_earned) as xp 
            FROM game_sessions 
            WHERE user_id = ?
        `).get(uid);
        const gameCoins = gameResults.coins || 0;
        const totalXp = gameResults.xp || 0;

        // 3. Notes (from notes.db)
        const noteRewards = dbNotes.prepare(`
            SELECT SUM(read_coins_awarded + note_coins_awarded) as total 
            FROM devotional_checkins 
            WHERE user_id = ?
        `).get(uid).total || 0;

        const totalCoins = achRewards + gameCoins + noteRewards;
        console.log(`      -> Ach: ${achRewards}, Games: ${gameCoins}, Notes: ${noteRewards} | Total: ${totalCoins}`);

        // Update Postgres Users Table
        await pool.query("UPDATE users SET coins = $1, metadata = jsonb_set(COALESCE(metadata, '{}'), '{total_xp}', $2::text::jsonb) WHERE id = $3", [totalCoins, totalXp.toString(), uid]);

        // Insert into Coin Ledger
        await pool.query(`
            INSERT INTO coin_ledger (user_id, amount, reason, balance_after)
            VALUES ($1, $2, $3, $4)
        `, [uid, totalCoins, 'Legacy Data Migration (Wave 2)', totalCoins]);
    }

    console.log('✅ Asset aggregation completed.');
    dbUsers.close(); dbGames.close(); dbNotes.close();
    await pool.end();
}

migrateAssets().catch(console.error);
