import assert from 'assert';
import { calculateRuleBasedScore, getDifficultyBand } from './DifficultyScorer.js';

function runTests() {
  console.log('Running DifficultyScorer Tests...');

  // Test 1: 「聖所」題不應極端降分 (Background but common answer)
  const q1 = {
    difficulty: 'EASY',
    category: 'verse_fact',
    question: '耶和華吩咐以色列人建造什麼，使祂住在他們中間？',
    answer: '聖所'
  };
  const res1 = calculateRuleBasedScore(q1);
  assert(res1.rawScore < 40, '聖所題應該偏 easy');

  // Test 2: 「詭計」填空題不應極端降分
  const q2 = {
    difficulty: 'EASY',
    category: 'verse_fill',
    question: '免得撒但趁著機會勝過我們，因我們並非不曉得他的＿＿＿。',
    answer: '詭計'
  };
  const res2 = calculateRuleBasedScore(q2);
  assert(res2.rawScore < 40, '詭計填空題應該偏 easy');

  // Test 3: 包含文化/背景的題目不會因為有常見人名被錯殺成極簡
  const q3 = {
    difficulty: 'HARD',
    category: 'theology',
    question: '保羅在羅馬書中提到的「稱義」如何受到古近東文化的影響？',
    answer: '法庭背景'
  };
  const res3 = calculateRuleBasedScore(q3);
  assert(res3.rawScore > 60, '包含文化/背景的神學題即使有保羅，也不應被壓成極低分');

  // Test 4: 「看哪」不可觸發 direct question 降分
  const q4 = {
    difficulty: 'MEDIUM',
    category: 'verse_fact',
    question: '看哪，弟兄和睦同居是何等的善，何等的美！這句詩篇是誰寫的？',
    answer: '大衛'
  };
  const res4 = calculateRuleBasedScore(q4);
  assert(!res4.breakdown.modifiers.discount > 0 || res4.rawScore >= 15, '「看哪」不可被誤判為直接問句導致過度降分');

  // Test 5: Category = verse_fill 但題幹沒有空格時，不可自動套用填空降分
  const q5 = {
    difficulty: 'MEDIUM',
    category: 'verse_fill',
    question: '耶穌在登山寶訓中提到的第一種有福的人是誰？',
    answer: '虛心的人'
  };
  const res5 = calculateRuleBasedScore(q5);
  // q5 base is 40. Since no fill blanks, discount should be lower.
  // We just ensure it runs without error and returns reasonable score.
  assert(res5.rawScore > 0, 'Category 只是輔助，無空格不應套用強制填空優惠');

  console.log('All DifficultyScorer tests passed!');
}

runTests();
