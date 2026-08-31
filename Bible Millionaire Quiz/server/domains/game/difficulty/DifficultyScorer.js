/**
 * DifficultyScorer
 * 聖經問答：難易度動態演算與權重評估模組
 * 負責根據題目的文本特徵（如關鍵字、長度、題型、分類）計算出客觀的權重分數。
 */

function includesAny(text, keywords) {
  if (!text) return false;
  return keywords.some(keyword => text.includes(keyword));
}

function looksLikeVerseFill(text) {
  if (!text) return false;
  return text.includes('＿＿') || text.includes('____') || text.includes('空格') || text.includes('填');
}

/**
 * 計算純 Rule-Based 的難易度分數 (0~100+)
 * @param {Object} q 題目物件 (需包含 difficulty, category, question, answer 等)
 * @returns {Object} 包含 finalScore, rawScore, breakdown, flags
 */
export function calculateRuleBasedScore(q) {
  const diff = String(q.difficulty || '').toUpperCase();
  const cat = String(q.category || '').toLowerCase();
  const text = String(q.question || q.stem || '');
  const ans = String(q.answer || '');
  const combined = `${text} ${ans}`;

  let baseScore = 40; 
  if (diff === 'EASY') baseScore = 15;
  if (diff === 'HARD') baseScore = 75;
  if (diff === 'VERY_HARD') baseScore = 90;

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
  const isDirectQuestion = includesAny(text, directQuestionSignals) && !hasReasoningSignal && !hasLexicalSignal && !hasBackgroundSignal && !text.includes('看哪');
  const isFillBlank = looksLikeVerseFill(text);
  const isShortAnswer = ans.trim().length <= 3;
  const isCommonDirectRecall = (hasCommonAnswer || (isFillBlank && isShortAnswer)) && isDirectQuestion && !hasTheologySignal;

  if (hasCommonKeyword) {
    familiarity -= 5;
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
  
  if (q.options && typeof q.options === 'object') {
    if (Object.keys(q.options).length > 4) confusion = 5;
  }

  if (ans && ans.length > 20) obscurity = 10;
  else {
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

  if (finalScore < 0) finalScore = 0;
  if (finalScore > 100) finalScore = 100;

  const flags = [];
  if (diff === 'EASY' && finalScore >= 50) flags.push('easy_extreme_high');
  if (diff === 'MEDIUM' && finalScore <= 25) flags.push('medium_extreme_low');
  if (diff === 'MEDIUM' && finalScore >= 85) flags.push('medium_extreme_high');
  if (!cat || cat === 'unknown') flags.push('missing_category');
  if (Number(q.chapter) > 150) flags.push('suspicious_chapter');
  if (/^[a-z]{2,4}$/i.test(String(q.book || ''))) flags.push('book_code_unstandardized');
  if (!['verse_fill', 'verse_fact', 'person', 'geography', 'theology', 'lexicon'].includes(cat)) flags.push('category_not_whitelisted');

  return {
    rawScore: finalScore,
    baseScore,
    breakdown: {
      base: baseScore,
      modifiers: { familiarity, context, obscurity, categoryScore, wording, confusion, discount },
      rawModifier,
      cappedModifier
    },
    flags
  };
}

/**
 * 將 0~100 的分數轉換為難度帶 (Band)
 */
export function getDifficultyBand(score) {
  if (score <= 30) return 'EASY';
  if (score <= 65) return 'MEDIUM';
  if (score <= 85) return 'HARD';
  return 'VERY_HARD';
}

const STORED_BANDS = new Set(['EASY', 'MEDIUM', 'HARD', 'VERY_HARD']);
const LEGACY_DIFFICULTY_SCORES = {
  easy: 15,
  medium: 48,
  hard: 75,
  very_hard: 92,
  veryhard: 92
};

function toFiniteScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : null;
}

/**
 * 讀取已入庫題目的權威難度分數。
 *
 * PostgreSQL adapter 會把 snake_case 轉成 camelCase；生成管線與部分舊程式
 * 仍可能傳入 snake_case。這裡是兩種資料形狀之間唯一的相容邊界。
 */
export function getStoredDifficultyScore(question = {}) {
  const finalScore = toFiniteScore(
    question.finalDifficultyScore ?? question.final_difficulty_score
  );
  if (finalScore !== null) return finalScore;

  const ruleScore = toFiniteScore(
    question.ruleDifficultyScore ?? question.rule_difficulty_score
  );
  if (ruleScore !== null) return ruleScore;

  const aiScore = toFiniteScore(
    question.aiDifficultyScore ?? question.ai_difficulty_score
  );
  if (aiScore !== null) return aiScore;

  const legacyKey = String(question.difficulty || 'medium')
    .toLowerCase()
    .replace(/[^a-z_]/g, '');
  return LEGACY_DIFFICULTY_SCORES[legacyKey] ?? 50;
}

export function getStoredDifficultySource(question = {}) {
  if (toFiniteScore(question.finalDifficultyScore ?? question.final_difficulty_score) !== null) return 'final';
  if (toFiniteScore(question.ruleDifficultyScore ?? question.rule_difficulty_score) !== null) return 'rule';
  if (toFiniteScore(question.aiDifficultyScore ?? question.ai_difficulty_score) !== null) return 'ai';
  return 'fallback';
}

export function getStoredDifficultyBand(question = {}) {
  const source = getStoredDifficultySource(question);
  if (source !== 'fallback') return getDifficultyBand(getStoredDifficultyScore(question));

  const storedBand = String(
    question.difficultyBand ?? question.difficulty_band ?? question.difficulty ?? ''
  ).toUpperCase().replace(/[^A-Z_]/g, '');
  return STORED_BANDS.has(storedBand)
    ? storedBand
    : getDifficultyBand(getStoredDifficultyScore(question));
}

/**
 * 將一局題數轉成固定的庫存需求。採最大餘數法，確保各難度數量總和恰好等於 count。
 */
export function getDifficultyTargets(count = 15) {
  const total = Math.max(0, Number.parseInt(count, 10) || 0);
  const ratios = { EASY: 0.35, MEDIUM: 0.35, HARD: 0.20, VERY_HARD: 0.10 };
  const targets = {};
  const remainders = [];
  let assigned = 0;

  for (const [band, ratio] of Object.entries(ratios)) {
    const exact = total * ratio;
    targets[band] = Math.floor(exact);
    assigned += targets[band];
    remainders.push({ band, remainder: exact - targets[band] });
  }

  remainders.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; assigned < total; i++, assigned++) {
    targets[remainders[i % remainders.length].band]++;
  }

  return targets;
}

/**
 * 一次性給出完整的 Difficulty 物件結構，以便後續寫入資料庫
 * @param {Object} question 
 */
export function scoreQuestionDifficulty(question) {
  const result = calculateRuleBasedScore(question);
  const ruleScore = Math.round(result.rawScore);

  let finalScore = ruleScore;
  let source = 'rule_v1_fallback';
  let confidence = 0.80; // Fallback confidence
  
  const aiScoreRaw = question.ai_difficulty_score;
  const hasAiScore = aiScoreRaw !== undefined && aiScoreRaw !== null && !isNaN(Number(aiScoreRaw));
  
  if (hasAiScore) {
    const aiScore = Math.min(100, Math.max(0, Number(aiScoreRaw)));
    
    // [Phase 14] Hybrid Scoring (AI 0.6 / rule 0.4)
    finalScore = Math.round((aiScore * 0.6) + (ruleScore * 0.4));
    source = 'hybrid_v1';
    confidence = 0.85; // Hybrid confidence

    // 檢測 AI 與 Rule 判斷是否落差過大
    if (Math.abs(aiScore - ruleScore) >= 25) {
      result.flags.push('ai_rule_misaligned');
      if (aiScore > ruleScore) {
        result.flags.push('ai_much_harder_than_rule');
      } else {
        result.flags.push('ai_much_easier_than_rule');
      }
    }
  }

  return {
    rule_difficulty_score: ruleScore,
    ai_difficulty_score: hasAiScore ? Number(aiScoreRaw) : null,
    difficulty_band: getDifficultyBand(finalScore),
    difficulty_flags: result.flags,
    difficulty_breakdown: result.breakdown,
    difficulty_score_source: 'rule_v1',
    difficulty_scored_at: new Date().toISOString(),
    
    final_difficulty_score: finalScore,
    final_difficulty_source: source,
    final_difficulty_confidence: confidence
  };
}
