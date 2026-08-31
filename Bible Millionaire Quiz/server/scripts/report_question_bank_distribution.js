import 'dotenv/config';
import { dbOps, initializeInfrastructure } from '../database/index.js';
import fs from 'fs';
import path from 'path';

/**
 * 題庫分布報告產生器 (Phase 7)
 * 用於分析目前題庫的結構，產出 summary.md 與 distribution.json
 */
async function generateReport() {
    console.log('=== Bible Millionaire Quiz: Question Bank Distribution Report ===');
    console.log('Initializing database...');

    try {
        await initializeInfrastructure();
        
        if (!dbOps.gamesDb) {
            console.error('❌ Failed to connect to gamesDb.');
            process.exit(1);
        }

        const query = async (sql) => await dbOps.gamesDb.query(sql);
        const countOf = (row) => parseInt(row.count ?? row.questionCount ?? 0, 10);

        // 1. 總數統計 (PASS / RETIRED)
        const statusRes = await query(`SELECT status, COUNT(*) as count FROM questions GROUP BY status`);
        const statusCounts = statusRes.reduce((acc, row) => {
            acc[row.status] = countOf(row);
            return acc;
        }, {});
        const passCount = statusCounts['PASS'] || 0;
        const retiredCount = statusCounts['RETIRED'] || 0;

        // 2. 書卷分布 (僅計算 PASS)
        const bookRes = await query(`SELECT book, COUNT(*) as count FROM questions WHERE status = 'PASS' GROUP BY book ORDER BY count DESC`);
        const bookCounts = bookRes.reduce((acc, row) => {
            acc[row.book] = countOf(row);
            return acc;
        }, {});

        // 3. 題型分布 (僅計算 PASS)
        const categoryRes = await query(`SELECT category, COUNT(*) as count FROM questions WHERE status = 'PASS' GROUP BY category ORDER BY count DESC`);
        const categoryCounts = categoryRes.reduce((acc, row) => {
            const cat = row.category || 'undefined';
            acc[cat] = countOf(row);
            return acc;
        }, {});

        // 4. 難度帶分布 (僅計算 PASS)
        const bandRes = await query(`SELECT difficulty_band, COUNT(*) as count FROM questions WHERE status = 'PASS' GROUP BY difficulty_band ORDER BY count DESC`);
        const bandCounts = bandRes.reduce((acc, row) => {
            const band = row.difficulty_band ?? row.difficultyBand ?? 'unassigned';
            acc[band] = countOf(row);
            return acc;
        }, {});

        // 5. 分數區間與無分數題數
        const scoreRes = await query(`SELECT final_difficulty_score FROM questions WHERE status = 'PASS'`);
        let unscoredCount = 0;
        const scoreBuckets = {
            '0-20': 0,
            '21-40': 0,
            '41-60': 0,
            '61-80': 0,
            '81-100': 0
        };

        for (const row of scoreRes) {
            const score = row.final_difficulty_score ?? row.finalDifficultyScore;
            if (score == null) {
                unscoredCount++;
            } else {
                if (score <= 20) scoreBuckets['0-20']++;
                else if (score <= 40) scoreBuckets['21-40']++;
                else if (score <= 60) scoreBuckets['41-60']++;
                else if (score <= 80) scoreBuckets['61-80']++;
                else scoreBuckets['81-100']++;
            }
        }

        // 6. 高風險 flags 題數
        const flagsRes = await query(`
            SELECT COUNT(*) as count 
            FROM questions 
            WHERE status = 'PASS' 
              AND difficulty_flags IS NOT NULL 
              AND difficulty_flags != '[]' 
              AND difficulty_flags != 'null'
        `);
        const flaggedCount = countOf(flagsRes[0] ?? {});

        // 7. 交叉分布: book/chapter x category x difficulty_band (僅計算 PASS)
        const crossRes = await query(`
            SELECT book, chapter, category, difficulty_band, COUNT(*) as count 
            FROM questions 
            WHERE status = 'PASS' 
            GROUP BY book, chapter, category, difficulty_band 
            ORDER BY book, chapter ASC
        `);
        
        // 整理交叉分布資料
        // 格式: { [book]: { [chapter]: { [category]: { [band]: count } } } }
        const crossDistribution = {};
        for (const row of crossRes) {
            const b = row.book || 'undefined';
            const c = row.chapter || 0;
            const cat = row.category || 'undefined';
            const band = row.difficulty_band ?? row.difficultyBand ?? 'unassigned';
            const count = countOf(row);

            if (!crossDistribution[b]) crossDistribution[b] = {};
            if (!crossDistribution[b][c]) crossDistribution[b][c] = {};
            if (!crossDistribution[b][c][cat]) crossDistribution[b][c][cat] = {};
            crossDistribution[b][c][cat][band] = count;
        }

        // 彙整 JSON 資料
        const distributionData = {
            timestamp: new Date().toISOString(),
            totals: {
                pass: passCount,
                retired: retiredCount
            },
            score_metrics: {
                unscored: unscoredCount,
                flagged_risk: flaggedCount,
                score_buckets: scoreBuckets
            },
            categories: categoryCounts,
            difficulty_bands: bandCounts,
            books: bookCounts,
            cross_distribution: crossDistribution
        };

        // 建立目錄結構 reports/question-bank/YYYY-MM-DD/
        const today = new Date().toISOString().split('T')[0];
        const dirPath = path.join(process.cwd(), 'reports', 'question-bank', today);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // 寫入 JSON
        const jsonPath = path.join(dirPath, 'distribution.json');
        fs.writeFileSync(jsonPath, JSON.stringify(distributionData, null, 2), 'utf-8');

        // 寫入 Markdown
        const mdPath = path.join(dirPath, 'summary.md');
        let mdContent = `# 題庫分布報告 (${today})\n\n`;
        mdContent += `## 1. 總體庫存狀態\n`;
        mdContent += `- **PASS 題總數**: ${passCount} 題\n`;
        mdContent += `- **RETIRED 題總數**: ${retiredCount} 題\n\n`;

        mdContent += `## 2. 難度分數健康度 (PASS 題)\n`;
        mdContent += `- **無分數題數 (Legacy)**: ${unscoredCount} 題\n`;
        mdContent += `- **具備高風險 Flags 題數**: ${flaggedCount} 題\n`;
        mdContent += `\n**分數區間分布**:\n`;
        mdContent += `| 區間 | 題數 |\n|------|------|\n`;
        for (const [bucket, count] of Object.entries(scoreBuckets)) {
            mdContent += `| ${bucket} | ${count} |\n`;
        }
        mdContent += `\n`;

        mdContent += `## 3. 難度帶分布 (PASS 題)\n`;
        mdContent += `| 難度帶 (Band) | 題數 |\n|------|------|\n`;
        for (const [band, count] of Object.entries(bandCounts)) {
            mdContent += `| ${band} | ${count} |\n`;
        }
        mdContent += `\n`;

        mdContent += `## 4. 題型分布 (PASS 題)\n`;
        mdContent += `| 題型 (Category) | 題數 |\n|------|------|\n`;
        for (const [cat, count] of Object.entries(categoryCounts)) {
            mdContent += `| ${cat} | ${count} |\n`;
        }
        mdContent += `\n`;

        mdContent += `## 5. 書卷分布 (PASS 題)\n`;
        mdContent += `| 書卷 | 題數 |\n|------|------|\n`;
        for (const [book, count] of Object.entries(bookCounts)) {
            mdContent += `| ${book} | ${count} |\n`;
        }
        mdContent += `\n`;

        mdContent += `## 6. 交叉分布 (Cross Distribution)\n`;
        mdContent += `> 詳細的 \`Book -> Chapter -> Category -> Difficulty Band\` 交叉分布資料已輸出至 [distribution.json](./distribution.json)，提供下一步 \`QuestionSourcePlanner\` 進行精準補題計畫使用。\n\n`;

        fs.writeFileSync(mdPath, mdContent, 'utf-8');

        console.log(`✅ Report successfully generated at:`);
        console.log(`   - ${jsonPath}`);
        console.log(`   - ${mdPath}`);
        
        process.exit(0);

    } catch (error) {
        console.error('❌ Failed to generate report:', error);
        process.exit(1);
    }
}

generateReport();
