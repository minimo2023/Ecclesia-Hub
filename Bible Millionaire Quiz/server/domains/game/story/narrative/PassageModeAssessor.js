import { dbOps } from '../../../../database/index.js';
import { LogosEngine } from '../../../../infrastructure/ai/LogosEngine.js';

class PassageModeAssessor {
    /**
     * @param {string} scriptureRef e.g. "Mark 5:25-34"
     * @param {string} passageText The actual text content
     * @returns {Promise<Object>} The assessment result
     */
    static async assessPassage(scriptureRef, passageText) {
        console.log(`\n[PassageModeAssessor] 🔍 評估經文屬性: ${scriptureRef}`);

        try {
            // Check cache
            const existingRes = await dbOps.query('narrative_passage_assessments', { scripture_reference: scriptureRef });
            if (existingRes && existingRes.length > 0) {
                console.log(`[PassageModeAssessor] ⚡ 使用既有評估記錄`);
                return existingRes[0];
            }

            `您是世界頂級的『聖經遊戲設計分析師』。
請評估以下經文是否適合製作為「回合制角色扮演的互動故事 (playable_narrative)」。
或者它更適合「輕量情境體驗 (scene_lite)」或單純的「知識反思 (lore_reflection)」。

經文範圍：【${scriptureRef}】
經文內容：
${passageText}

### 評分基準 (Dramatic Score，滿分 12)
1. 具體角色與對齊的目標 (Agency & Goal) [+0~3]
2. 明確的時間/空間推移與轉折 (Plot Engine) [+0~3]
3. 戲劇張力 (危機、奇蹟、衝突) [+0~3]
4. 明確的對話或行動反應 (Interaction) [+0~3]

### 分類原則 (Recommended Mode)
- playable_narrative: 得分 8~12，具備強烈敘事性與角色互動，適合切分多場景。（例如血漏婦人、約拿書）
- scene_lite: 得分 5~7，只有單一場景氛圍或短暫動作，適合單一畫面沉浸與體驗。（例如耶穌在客西馬尼園禱告）
- lore_reflection: 得分 2~4，論述、保羅書信、箴言。無具體情節，適合反思與學習。
- non_story_content: 得分 0~1，家譜、條例、建築指示。不適合任何敘事遊戲。

請回傳預期的 JSON 格式，且無冗餘文字。`;

            console.log(`[PassageModeAssessor] 🧠 呼叫 LogosEngine (Task: passage_assessment)...`);
            const assessment = await LogosEngine.askBrain('scene_assessor', { scriptureRef, passageText }, {
                temperature: 0.1
            });

            if (!assessment || !assessment.recommended_mode) {
                throw new Error("AI failed to assess passage properly.");
            }

            const recordId = `assessment_${Date.now()}`;

            // Build the record explicitly for Postgres mapping
            const record = {
                id: recordId,
                scripture_reference: scriptureRef,
                text_type: assessment.text_type,
                dramatic_score: assessment.dramatic_score,
                signals_positive_json: JSON.stringify(assessment.signals_positive || []),
                signals_negative_json: JSON.stringify(assessment.signals_negative || []),
                recommended_mode: assessment.recommended_mode,
                reason: assessment.reason
            };

            await dbOps.add('narrative_passage_assessments', record);
            console.log(`[PassageModeAssessor] ✅ 評估完成！推薦模式: ${assessment.recommended_mode} (Score: ${assessment.dramatic_score})`);

            return record;
        } catch (error) {
            console.error('[PassageModeAssessor] Error assessing passage:', error);
            throw error;
        }
    }
}

export default PassageModeAssessor;
