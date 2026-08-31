import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const keys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : [process.env.GEMINI_API_KEY];
let keyIndex = 0;

let totalTokensUsed = 0;
let totalPromptsTokens = 0;
let totalCandidatesTokens = 0;

function getNextGenAI() {
    const key = keys[keyIndex];
    keyIndex = (keyIndex + 1) % keys.length;
    return new GoogleGenerativeAI(key);
}

// --- Scoring Logic ---
function includesAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

function looksLikeVerseFill(text) {
  return text.includes('＿＿') || text.includes('____') || text.includes('空格') || text.includes('填');
}

function calculateRuleBasedScore(q) {
  const diff = String(q.difficulty || '').toUpperCase();
  const cat = String(q.category || '').toLowerCase();
  const text = String(q.question || '');
  const ans = String(q.answer || '');
  const combined = `${text} ${ans}`;

  let baseScore = 40; 
  if (diff === 'EASY') baseScore = 15;
  else if (diff === 'HARD') baseScore = 60;

  let familiarity = 0;
  let context = 0;
  let obscurity = 0;
  let categoryScore = 0;
  let wording = 0;
  let confusion = 0;
  let discount = 0;

  const commonKeywords = ['耶穌', '十字架', '復活', '摩西', '大衛', '保羅', '彼得', '愛', '信心', '神', '天國', '約翰'];
  const commonAnswers = [
    '耶穌', '基督', '聖所', '詭計', '恩典', '平安', '信心', '愛', '盼望', '摩西', '大衛',
    '彼得', '保羅', '約翰', '該隱', '亞伯', '挪亞', '亞伯拉罕', '以撒', '雅各', '約瑟',
    '伯利恆', '耶路撒冷', '聖殿', '會堂', '偶像', '禱告', '悔改', '赦免'
  ];
  const lexicalSignals = ['原文', '字義', '希臘', '希伯來', '亞蘭', '詞彙', '雙關', '語根', '意思', '意義'];
  const theologySignals = ['神學', '預表', '救贖', '稱義', '成聖', '獻祭', '祭司職分', '聖約', '末世', '基督論'];
  const geographySignals = ['哪裡', '何處', '地方', '地區', '城市', '城', '行省', '首府', '位於', '產地', '方位', '東方', '西方', '南方', '北方', '巴比倫', '埃及', '耶路撒冷', '伯利恆', '馬其頓'];
  const directQuestionSignals = ['誰', '哪一', '哪個', '哪位', '哪種', '哪裡', '何處', '什麼', '何時', '幾', '多久', '名叫'];
  const reasoningSignals = ['為什麼', '代表什麼', '根據上下文', '核心區別', '如何', '為何', '象徵', '說明', '比較'];
  const backgroundSignals = [
    '背景', '文化', '古近東', '律法', '潔淨', '可食用', '保護功能', '習俗',
    '上下文', '神學意義', '歷史脈絡', '比喻', '象徵'
  ];

  const hasCommonKeyword = includesAny(combined, commonKeywords);
  const hasCommonAnswer = commonAnswers.includes(ans.trim());
  const hasLexicalSignal = includesAny(combined, lexicalSignals);
  const hasTheologySignal = includesAny(combined, theologySignals);
  const hasGeographySignal = includesAny(combined, geographySignals);
  const hasReasoningSignal = includesAny(text, reasoningSignals);
  const hasBackgroundSignal = includesAny(combined, backgroundSignals);
  const isDirectQuestion = includesAny(text, directQuestionSignals) && !hasReasoningSignal && !hasLexicalSignal && !hasBackgroundSignal;
  const isFillBlank = looksLikeVerseFill(text);
  const isShortAnswer = ans.trim().length <= 3;
  const isCommonDirectRecall = (hasCommonAnswer || (isFillBlank && isShortAnswer)) && isDirectQuestion && !hasTheologySignal;

  if (hasCommonKeyword) {
    familiarity -= 5;
    discount += 5;
  }

  if (hasCommonAnswer) {
    familiarity -= 10;
    discount += 10;
  }

  if (isCommonDirectRecall) {
    familiarity -= 10;
    discount += 8;
    if (diff === 'MEDIUM') baseScore = Math.min(baseScore, 30);
  }

  if (isFillBlank && hasCommonAnswer) {
    familiarity -= 8;
    discount += 7;
    if (diff === 'MEDIUM') baseScore = Math.min(baseScore, 28);
  } else if (isFillBlank && isShortAnswer && !hasBackgroundSignal && !hasLexicalSignal) {
    familiarity -= 3;
    discount += 2;
    if (diff === 'MEDIUM') baseScore = Math.min(baseScore, 36);
  }

  if (text.length > 100) wording = 10;
  else if (text.length > 50) wording = 5;
  else if (text.length < 20 && !text.includes('為什麼') && !text.includes('意義')) wording = -5;

  if (cat === 'verse_fill') categoryScore = 5;
  else if (cat === 'verse_fact') categoryScore = 8;
  else if (cat === 'geography') categoryScore = hasGeographySignal ? 10 : 4;
  else if (cat === 'person') categoryScore = 12;
  else if (cat === 'theology') categoryScore = hasTheologySignal || hasReasoningSignal || hasBackgroundSignal ? 15 : 8;
  else if (cat === 'lexicon') categoryScore = hasLexicalSignal ? 18 : 8;
  else categoryScore = 5;

  if (hasReasoningSignal || hasBackgroundSignal || (hasLexicalSignal && (text.includes('意思') || text.includes('意義')))) {
    context += 10;
  }
  
  if (ans.length <= 2 && cat !== 'lexicon') {
    if (/\d/.test(ans)) obscurity = 5; 
  }

  if (cat === 'lexicon' && hasLexicalSignal) {
    obscurity += 10;
    familiarity += 10;
  }

  if (hasCommonAnswer && !hasLexicalSignal) {
    obscurity -= 5;
  }

  if (hasBackgroundSignal && !hasCommonAnswer) {
    obscurity += 5;
  }

  const rawModifier = familiarity + context + obscurity + categoryScore + wording + confusion - discount;
  const cappedModifier = Math.max(-20, Math.min(30, rawModifier));
  
  let finalScore = baseScore + cappedModifier;
  finalScore = Math.max(0, Math.min(100, finalScore));

  let scoreBand = '0-20';
  if (finalScore > 20 && finalScore <= 40) scoreBand = '21-40';
  else if (finalScore > 40 && finalScore <= 60) scoreBand = '41-60';
  else if (finalScore > 60 && finalScore <= 80) scoreBand = '61-80';
  else if (finalScore > 80) scoreBand = '81-100';

  const flags = [];
  if (diff === 'EASY' && finalScore > 40) flags.push('score_too_high_for_easy');
  if (diff === 'HARD' && finalScore < 60) flags.push('score_too_low_for_hard');
  if (diff === 'MEDIUM' && finalScore <= 25) flags.push('medium_extreme_low');
  if (diff === 'MEDIUM' && finalScore >= 85) flags.push('medium_extreme_high');
  if (!cat || cat === 'unknown') flags.push('missing_category');
  if (Number(q.chapter) > 150) flags.push('suspicious_chapter');
  if (/^[a-z]{2,4}$/i.test(String(q.book || ''))) flags.push('book_code_unstandardized');
  if (!['verse_fill', 'verse_fact', 'person', 'geography', 'theology', 'lexicon'].includes(cat)) flags.push('category_not_whitelisted');

  return {
    id: q.id,
    book: q.book,
    chapter: q.chapter,
    difficulty: q.difficulty,
    category: q.category,
    question: q.question,
    answer: q.answer,
    rule_score: finalScore,
    score_band: scoreBand,
    score_breakdown: {
      base_difficulty_score: baseScore,
      raw_modifier_score: rawModifier,
      capped_modifier_score: cappedModifier,
      knowledge_familiarity_score: familiarity,
      context_reasoning_score: context,
      answer_obscurity_score: obscurity,
      category_complexity_score: categoryScore,
      wording_complexity_score: wording,
      distractor_confusion_score: confusion,
      common_faith_memory_discount: discount
    },
    flags
  };
}

// --- AI Judge Logic ---
const delay = ms => new Promise(res => setTimeout(res, ms));

async function callAIJudge(q, role, retries = 3) {
  let systemPrompt = "";
  if (role === 'lay_believer') {
    systemPrompt = `你是一位熟悉教會教育現場的聖經問答難度評審。
你的判斷基準是「一般固定聚會的信徒」與「主日學/講道常見知識」。
你不是神學院教授，也不要用神學生標準降低難度。`;
  } else {
    systemPrompt = `你是一位受過神學訓練、熟悉聖經背景與釋經方法的聖經問答難度評審。
你的判斷基準是「神學生、聖經教師、長期深入查經者」。
你需要指出哪些題目對一般信徒困難，但對進深讀者只是中等。`;
  }

  const prompt = `
    請評估以下題目的難度：
    題目: ${q.question}
    答案: ${q.answer}
    分類: ${q.category}

    評審規則：
    - 不可查外部資料，只能根據題目、答案、分類判斷。
    - 不可只因分類是神學或原文就直接給高分；必須說明實際知識門檻。
    - 不可只因題目包含「耶穌、保羅、摩西」等常見詞就直接給低分；需判斷問題問的是常識還是進深細節。

    請輸出 JSON 格式，包含：
    - ai_judge_score: 0 到 100 分 (整數，越高越難，這是你對這題客觀難度的最終評價)
    - lay_believer_score: 1 到 5 分 (1:主日學可答, 2:固定聚會者易答, 3:熟悉該卷者可答, 4:需背景推論, 5:需神學訓練)
    - seminary_score: 1 到 5 分 (同上，但從神學生視角評估)
    - difficulty_label: "easy" / "medium" / "hard" / "very_hard"
    - reason: 用一句話說明給這個分數的理由
    - confidence: 0.0 到 1.0 的信心水準
  `;

  for (let i = 0; i < retries; i++) {
    try {
      const genAI = getNextGenAI();
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite", generationConfig: { responseMimeType: "application/json" } });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt + "\\n\\n" + prompt }] }]
      });
      const response = result.response;
      
      if (response.usageMetadata) {
        totalTokensUsed += response.usageMetadata.totalTokenCount;
        totalPromptsTokens += response.usageMetadata.promptTokenCount;
        totalCandidatesTokens += response.usageMetadata.candidatesTokenCount;
      }
      
      const text = response.text();
      return JSON.parse(text);
    } catch (e) {
      console.error(`AI evaluation failed (Attempt ${i+1}/${retries}) for role ${role} on question ${q.id}:`, e.message);
      if (i < retries - 1) {
        console.log(`Waiting ${5000 * (i + 1)} ms before retrying with next key...`);
        await delay(5000 * (i + 1));
      }
    }
  }
  return null;
}

// --- Main Script ---
async function run() {
    const args = process.argv.slice(2);
    let sampleSize = 200;
    let runAiJudge = false;
    let aiLimit = 200;
    
    args.forEach(arg => {
        if (arg.startsWith('--sample-size=')) {
            sampleSize = parseInt(arg.split('=')[1]);
        }
        if (arg.startsWith('--ai-judge=')) {
            runAiJudge = arg.split('=')[1] === 'true';
        }
        if (arg.startsWith('--ai-limit=')) {
            aiLimit = parseInt(arg.split('=')[1]);
        }
    });

    console.log(`Starting difficulty sampling simulation...`);
    console.log(`Sample Size: ${sampleSize}, AI Judge: ${runAiJudge}, AI Limit: ${aiLimit}`);
    console.log(`Using ${keys.length} Gemini API Keys in rotation.`);

    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: String(process.env.DB_PASSWORD),
        database: process.env.DB_NAME,
    });
    
    try {
        const query = `
            WITH eligible AS (
              SELECT * FROM questions
              WHERE status = 'PASS'
            ),
            ranked AS (
              SELECT
                *,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(category, 'unknown'), COALESCE(LOWER(difficulty), 'unknown')
                  ORDER BY RANDOM()
                ) AS rn
              FROM eligible
            )
            SELECT *
            FROM ranked
            WHERE rn <= 50
            ORDER BY RANDOM()
            LIMIT $1;
        `;
        
        console.log('Querying database...');
        const res = await pool.query(query, [sampleSize]);
        const questions = res.rows;
        console.log(`Retrieved ${questions.length} questions.`);

        const results = questions.map(calculateRuleBasedScore);

        const scores = results.map(r => r.rule_score);
        const avg = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
        scores.sort((a, b) => a - b);
        const median = scores.length > 0 ? scores[Math.floor(scores.length / 2)] : 0;
        const stdDev = Math.sqrt(scores.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / (scores.length || 1));

        const bands = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
        const categories = {};
        const difficulties = {};
        let flaggedCount = 0;

        results.forEach(r => {
            bands[r.score_band]++;
            categories[r.category || 'unknown'] = (categories[r.category || 'unknown'] || 0) + 1;
            difficulties[r.difficulty || 'unknown'] = (difficulties[r.difficulty || 'unknown'] || 0) + 1;
            if (r.flags.length > 0) flaggedCount++;
        });

        const today = new Date().toISOString().split('T')[0];
        const reportDir = path.join(process.cwd(), 'reports', 'difficulty-sampling', today);
        fs.mkdirSync(reportDir, { recursive: true });

        fs.writeFileSync(path.join(reportDir, 'rule_scores.json'), JSON.stringify(results, null, 2));

        let aiScores = [];
        let ruleAiAlignedCount = 0;
        let highlyConsistentAiCount = 0;
        let aiSampleCount = 0;

        if (runAiJudge && results.length > 0) {
            console.log(`Running AI double-judge on up to ${aiLimit} questions...`);
            const aiSample = results.slice(0, aiLimit);
            aiSampleCount = aiSample.length;
            
            for (let i = 0; i < aiSample.length; i++) {
                const q = aiSample[i];
                console.log(`[${i+1}/${aiSample.length}] AI judging question ID: ${q.id}`);
                const judgeA = await callAIJudge(q, 'lay_believer');
                await delay(1000); 
                const judgeB = await callAIJudge(q, 'seminary');
                await delay(1000);

                if (judgeA && judgeB) {
                    const avgAi = (judgeA.ai_judge_score + judgeB.ai_judge_score) / 2;
                    const aiDelta = Math.abs(judgeA.ai_judge_score - judgeB.ai_judge_score);
                    const ruleAiDelta = Math.abs(q.rule_score - avgAi);

                    let consistency = 'acceptable';
                    if (aiDelta <= 10) consistency = 'high_consistency';
                    else if (aiDelta > 15) consistency = 'low_confidence';

                    let validity = 'rule_aligned';
                    if (ruleAiDelta > 18) validity = 'needs_rubric_review';
                    else if (ruleAiDelta > 10) validity = 'needs_weight_tuning';

                    if (aiDelta <= 15) highlyConsistentAiCount++;
                    if (ruleAiDelta <= 18) ruleAiAlignedCount++;

                    aiScores.push({
                        id: q.id,
                        question: q.question,
                        answer: q.answer,
                        category: q.category,
                        original_difficulty: q.difficulty,
                        rule_score: q.rule_score,
                        ai_judge_a: judgeA,
                        ai_judge_b: judgeB,
                        ai_judge_avg: avgAi,
                        ai_judge_delta: aiDelta,
                        rule_ai_delta: ruleAiDelta,
                        ai_consistency: consistency,
                        rule_validity: validity
                    });
                }
            }

            fs.writeFileSync(path.join(reportDir, 'ai_judge_scores.json'), JSON.stringify(aiScores, null, 2));
        }

        let aiReportSection = '';
        if (runAiJudge) {
            const successfulAiCount = aiScores.length;
            const consistencyRate = successfulAiCount > 0 ? ((highlyConsistentAiCount / successfulAiCount) * 100).toFixed(1) : 0;
            const validityRate = successfulAiCount > 0 ? ((ruleAiAlignedCount / successfulAiCount) * 100).toFixed(1) : 0;
            
            // Assuming approx $0.075 / 1M input tokens and $0.30 / 1M output tokens for gemini-2.5-flash
            const costEstimate = (totalPromptsTokens / 1000000) * 0.075 + (totalCandidatesTokens / 1000000) * 0.30;
            
            aiReportSection = `
## 7. AI 雙盲評審一致性與效度分析
- **AI 嘗試評審題數**: ${aiSampleCount}
- **AI 成功寫入題數**: ${successfulAiCount}
- **AI 失敗/未寫入題數**: ${aiSampleCount - successfulAiCount}
- **信度 (AI 一致性 <= 15分比例)**: ${consistencyRate}% (${highlyConsistentAiCount}/${successfulAiCount})
- **效度 (Rule vs AI 平均誤差 <= 18分比例)**: ${validityRate}% (${ruleAiAlignedCount}/${successfulAiCount})

### Token Usage & Cost Estimation
- Total Prompts Tokens: ${totalPromptsTokens}
- Total Candidates Tokens: ${totalCandidatesTokens}
- Total Tokens Used: ${totalTokensUsed}
- Estimated Cost (Gemini 2.5 Flash): $${costEstimate.toFixed(5)} USD

**明顯不一致案例 (Rule vs AI Delta > 18):**
${aiScores.filter(a => a.rule_ai_delta > 18).slice(0, 5).map(a => `- [${a.id}] Rule: ${a.rule_score}, AI_Avg: ${a.ai_judge_avg} (Delta: ${a.rule_ai_delta})\\n  - AI A 理由: ${a.ai_judge_a.reason}\\n  - AI B 理由: ${a.ai_judge_b.reason}`).join('\n')}
`;
        }

        const summaryMd = `# Difficulty Sampling Simulation Summary (${today})

## 1. 抽樣總數
- 總計: ${results.length} 題
- 帶有異常 Flag 題數: ${flaggedCount} 題

## 2. 各 Category 題數
${Object.entries(categories).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## 3. 各 Difficulty 題數
${Object.entries(difficulties).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## 4. Rule-Score 統計數據
- 平均值 (Average): ${avg.toFixed(2)}
- 中位數 (Median): ${median}
- 標準差 (StdDev): ${stdDev.toFixed(2)}

## 5. 各分數區間題數量分佈
${Object.entries(bands).map(([k, v]) => `- ${k}: ${v} (${results.length > 0 ? ((v/results.length)*100).toFixed(1) : 0}%)`).join('\n')}

## 6. 原 Difficulty 與 Rule Score 明顯不一致範例 (Top 5)
${results.filter(r => r.flags.length > 0).slice(0, 5).map(r => `- [ID: ${r.id}] ${r.question} (原標: ${r.difficulty}, 新分: ${r.rule_score}) - Flags: ${r.flags.join(', ')}`).join('\n')}
${aiReportSection}
`;

        fs.writeFileSync(path.join(reportDir, 'summary.md'), summaryMd);

        console.log(`Reports generated successfully at ${reportDir}`);
        if (runAiJudge) {
             console.log(`Token Usage - Prompts: ${totalPromptsTokens}, Output: ${totalCandidatesTokens}, Total: ${totalTokensUsed}`);
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

run();
