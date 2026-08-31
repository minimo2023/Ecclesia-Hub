import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const dbConfig = {
    user: 'dev', host: 'localhost', database: 'bible_quiz_v3',
    password: 'dev123', port: 5432,
};

async function exportAIReport() {
    const client = new Client(dbConfig);
    await client.connect();
    
    const res = await client.query(`
        SELECT name_zh, content_raw, content_ai, quiz_pool, image_local 
        FROM lexicons 
        WHERE content_ai IS NOT NULL 
        ORDER BY id ASC
    `);

    let md = '# 聖經百科 AI 提純實驗報告 (Alpha Trial)\n\n';
    md += `本報告展示前 ${res.rowCount} 筆數據的脫水成果與自動生成之問答庫。\n\n`;

    for (const row of res.rows) {
        md += `--- \n\n`;
        md += `## 📘 百科主權：【${row.name_zh}】\n\n`;
        
        md += `### ✨ [AI 精煉百科] (content_ai)\n`;
        md += `${row.content_ai}\n\n`;

        md += `### ❓ [自動生成題庫] (quiz_pool)\n`;
        let quiz = [];
        try {
            quiz = (typeof row.quiz_pool === 'string') ? JSON.parse(row.quiz_pool) : row.quiz_pool;
            if (!Array.isArray(quiz)) quiz = [];
        } catch (e) {
            md += `> [!WARNING]\n> 題庫解析失敗: ${e.message}\n\n`;
        }
        
        quiz.forEach((q, idx) => {
            md += `**Q${idx+1}: ${q.question}**  \n`;
            md += `選項: ${q.options.join(' / ')}  \n`;
            md += `💡 正確答案: Index ${q.answerIndex} (${q.options[q.answerIndex]})  \n`;
            md += `📖 解析: ${q.explanation}\n\n`;
        });

        md += `<details>\n<summary>🔍 查看原始採集文本 (RAW Content)</summary>\n\n`;
        md += `${row.content_raw}\n\n`;
        md += `</details>\n\n`;
    }

    fs.writeFileSync('docs/lexicon_ai_trial_report.md', md);
    console.log('✅ AI 樣測報告已物理生成至: docs/lexicon_ai_trial_report.md');
    
    await client.end();
}

exportAIReport();
