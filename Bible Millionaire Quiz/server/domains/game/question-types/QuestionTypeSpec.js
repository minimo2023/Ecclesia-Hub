/**
 * 題型導向出題機制 - 基礎規格定義 (Phase 8)
 * 定義每種題型所需的生成規則、審核規則、答案限制、難度提示與防呆限制。
 * 下一步 QuestionSourcePlanner 將基於這些定義來精準要求 AI 產生特定題型。
 */

export const QuestionTypeSpecs = {
    // 1. 經文填空題
    verse_fill: {
        category: 'verse_fill',
        label: '經文填空',
        generationRules: [
            '必須精準引用整段經文。',
            '從經文中挖空一個關鍵字詞作為題目。',
            '挖空處必須使用底線「___」表示。',
            '答案必須與挖空的字詞完全一致。'
        ],
        auditRules: [
            '題目字串內必須包含「___」',
            '題目不可出現暗示答案的相近字眼。'
        ],
        answerConstraints: {
            maxLength: 8,
            requireExactMatch: true,
            distractorRules: '干擾項必須是同詞性、常在聖經中出現的詞彙，不可過於現代或荒謬。'
        },
        difficultyHints: {
            easy: '挖空極為常見的字詞（如：神、愛、光）。',
            medium: '挖空稍微特定的名詞或動詞。',
            hard: '挖空冷門名詞或連結詞。'
        },
        forbiddenPatterns: ['現代用語', '過長子句挖空'],
        evidenceRequirement: 'MUST_BE_EXACT_VERSE'
    },

    // 2. 經文事實題
    verse_fact: {
        category: 'verse_fact',
        label: '經文事實',
        generationRules: [
            '針對經文所描述的具體事件、數量、順序或原因提問。',
            '問句必須清晰，結尾應為問號。'
        ],
        auditRules: [
            '問題不可過於主觀或充滿神學爭議。',
            '必須能從單一章節中找到明確依據。'
        ],
        answerConstraints: {
            maxLength: 15,
            requireExactMatch: false,
            distractorRules: '干擾項必須在邏輯上合理，最好是同一故事中其他不正確的細節。'
        },
        difficultyHints: {
            easy: '詢問事件的核心主角或最明顯的結果。',
            medium: '詢問事件的次要人物、具體地點或數量。',
            hard: '詢問細微的前因後果或特定物品的材質/數量。'
        },
        forbiddenPatterns: ['主觀解讀', '跨書卷統整'],
        evidenceRequirement: 'MUST_CITE_VERSE'
    },

    // 3. 人物題
    person: {
        category: 'person',
        label: '聖經人物',
        generationRules: [
            '針對特定聖經人物的背景、事蹟、親屬關係或身分提問。',
            '必須提供足夠的線索以唯一鎖定該人物。'
        ],
        auditRules: [
            '若有多人同名（如：約翰、瑪利亞），必須在題目中給予明確的區分條件。'
        ],
        answerConstraints: {
            maxLength: 10,
            requireExactMatch: true,
            distractorRules: '干擾項必須是同時代或相關聯的其他聖經人物。'
        },
        difficultyHints: {
            easy: '知名人物的標誌性事件（如：摩西分紅海）。',
            medium: '知名人物的次要事蹟或次要人物的標誌性事件。',
            hard: '冷門人物或家譜中的細節。'
        },
        forbiddenPatterns: ['含糊不清的代名詞', '未給足條件導致多解'],
        evidenceRequirement: 'MUST_CITE_VERSE'
    },

    // 4. 地理題
    geography: {
        category: 'geography',
        label: '聖經地理',
        generationRules: [
            '針對聖經中的城市、山脈、河流、國家或特定地理特徵提問。',
            '可詢問事件發生的地點或地點的特徵。'
        ],
        auditRules: [
            '地點名稱必須符合所選聖經譯本的翻譯。'
        ],
        answerConstraints: {
            maxLength: 12,
            requireExactMatch: true,
            distractorRules: '干擾項必須是聖經中真實存在的其他地名。'
        },
        difficultyHints: {
            easy: '極具代表性的地點（如：耶路撒冷、埃及）。',
            medium: '特定事件發生的城市或區域（如：迦百農、西奈山）。',
            hard: '保羅傳道旅程中的小城或舊約冷門地名。'
        },
        forbiddenPatterns: ['現代地名（如：伊拉克）'],
        evidenceRequirement: 'MUST_CITE_VERSE'
    },

    // 5. 神學/教義題
    theology: {
        category: 'theology',
        label: '神學與教義',
        generationRules: [
            '針對經文中所揭示的教義、原則、比喻的含義或屬靈意義提問。',
            '必須基於經文的明確宣告，而非後世宗派的延伸解釋。'
        ],
        auditRules: [
            '不可涉及現代教派爭議。',
            '答案必須能在提供的證據經文中找到直接支持。'
        ],
        answerConstraints: {
            maxLength: 20,
            requireExactMatch: false,
            distractorRules: '干擾項應為常見的誤解或稍微偏離經文核心的相似概念。'
        },
        difficultyHints: {
            easy: '核心福音信息或基礎信仰原則（如：因信稱義）。',
            medium: '保羅書信中的特定論點或耶穌比喻的核心解釋。',
            hard: '舊約預表或啟示錄象徵的具體含義（需經文直接支持）。'
        },
        forbiddenPatterns: ['宗派專有名詞', '過度靈意解經'],
        evidenceRequirement: 'MUST_CITE_VERSE_AND_EXPLAIN'
    },

    // 6. 詞彙解釋題
    lexicon: {
        category: 'lexicon',
        label: '詞彙解釋',
        generationRules: [
            '針對聖經中特定的專有名詞、節期、度量衡、或特殊風俗習慣提問。',
            '題目應給出情境或原意，要求回答該詞彙。'
        ],
        auditRules: [
            '不可要求回答希伯來文或希臘文原文字（除非音譯已是中文常用詞，如：阿們、哈利路亞）。'
        ],
        answerConstraints: {
            maxLength: 10,
            requireExactMatch: true,
            distractorRules: '干擾項必須是同類別的其他專有名詞或度量衡。'
        },
        difficultyHints: {
            easy: '常見宗教詞彙（如：安息日、逾越節）。',
            medium: '特定的度量衡或舊約風俗（如：舍客勒、一俄梅珥）。',
            hard: '冷門的祭祀名稱或特殊服飾物件（如：烏陵和土明）。'
        },
        forbiddenPatterns: ['要求拼寫原文原文'],
        evidenceRequirement: 'MUST_EXPLAIN_CONTEXT'
    }
};

/**
 * 取得指定題型的規格
 * @param {string} category 
 * @returns {Object|null}
 */
export function getQuestionTypeSpec(category) {
    return QuestionTypeSpecs[category] || null;
}

/**
 * 取得所有支援的題型清單
 * @returns {string[]}
 */
export function getSupportedCategories() {
    return Object.keys(QuestionTypeSpecs);
}
