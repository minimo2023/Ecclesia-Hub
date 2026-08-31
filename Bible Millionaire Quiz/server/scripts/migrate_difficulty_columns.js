import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

// Parse arguments for custom DB URL
const args = process.argv.slice(2);
let dbUrl = process.env.DATABASE_URL || null;
for (const arg of args) {
  if (arg.startsWith('--db-url=')) dbUrl = arg.split('=')[1];
}

const poolConfig = dbUrl 
  ? { connectionString: dbUrl, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'dev',
      password: process.env.DB_PASSWORD || 'dev123',
      database: process.env.DB_NAME || 'bible_quiz_v3'
    };

const pool = new Pool(poolConfig);

async function main() {
  console.log('Running Difficulty Columns Migration...');
  
  const queries = `
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_difficulty_score INTEGER;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_band VARCHAR(20);
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_flags JSONB;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_breakdown JSONB;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_score_source VARCHAR(50);
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_scored_at TIMESTAMP;
    
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS judge_prompt_version TEXT;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS judge_roles JSONB;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_a_score INTEGER;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_a_role TEXT;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_b_score INTEGER;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_b_role TEXT;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_avg INTEGER;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_judge_delta INTEGER;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_ai_delta INTEGER;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_consistency TEXT;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS rule_validity TEXT;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_score INTEGER;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_source TEXT;
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS final_difficulty_confidence REAL;
  `;

  try {
    await pool.query(queries);
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

main();
