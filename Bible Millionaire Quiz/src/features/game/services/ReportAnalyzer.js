import { getAIModel } from '../config/ai';
import { COLLECTIONS } from '../config/collections';
import { database } from './database/DatabaseAdapter';

/**
 * Service for intelligent report analysis using AI
 */
class ReportAnalyzer {
    constructor() {
        this.model = getAIModel('REPORT_ANALYSIS');
    }

    /**
     * Analyze a question report to determine severity and action
     * @param {Object} report - Report object
     * @returns {Promise<Object>} Analysis result
     */
    async analyzeReport(report) {
        try {
            const prompt = `
分析以下題目回報：

題目：${report.questionContent}
書卷：${report.book} ${report.chapter}章
回報原因：${report.reason.join(', ')}
補充說明：${report.comment || '無'}

判斷：
1. 嚴重度 (low/medium/high)
   - low: 建議性質，題目本身沒問題
   - medium: 有爭議，需要進一步確認
   - high: 明顯錯誤，應立即處理

2. 分類 (obvious_error/controversial/suggestion)
   - obvious_error: 明顯的答案錯誤或選項問題
   - controversial: 可能有爭議的解釋
   - suggestion: 改進建議

3. 建議動作 (suspend/flag/none)
   - suspend: 立即暫停使用此題
   - flag: 標記待審核
   - none: 記錄但繼續使用

4. 信心度 (0-1)
   - 你對此判斷的信心程度

請以 JSON 格式回覆：
{
  "severity": "low/medium/high",
  "category": "obvious_error/controversial/suggestion",
  "autoAction": "suspend/flag/none",
  "confidence": 0.0-1.0,
  "reasoning": "判斷理由"
}

只回傳 JSON，不要其他文字。
`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                return {
                    severity: analysis.severity || 'low',
                    category: analysis.category || 'suggestion',
                    autoAction: analysis.autoAction || 'none',
                    confidence: analysis.confidence || 0.5,
                    reasoning: analysis.reasoning || ''
                };
            }

            // Fallback
            return {
                severity: 'low',
                category: 'suggestion',
                autoAction: 'none',
                confidence: 0.3,
                reasoning: '無法解析 AI 回應'
            };

        } catch (error) {
            console.error('Report analysis error:', error);
            return {
                severity: 'low',
                category: 'suggestion',
                autoAction: 'none',
                confidence: 0.1,
                reasoning: 'AI 分析失敗',
                error: error.message
            };
        }
    }

    /**
     * Process a report and take automatic action if needed
     * @param {string} reportId - Report document ID
     * @param {Object} report - Report data
     * @returns {Promise<Object>} Processing result
     */
    async processReport(reportId, report) {
        try {
            // Analyze report
            const analysis = await this.analyzeReport(report);

            // Update report with AI analysis
            await database.save(COLLECTIONS.REPORTS, reportId, {
                ...report,
                aiAnalysis: analysis,
                reviewedBy: 'ai',
                reviewedAt: Date.now(),
                status: analysis.autoAction === 'suspend' ? 'auto_suspended' : 'pending'
            });

            // If high severity, take auto action
            if (analysis.severity === 'high' && analysis.autoAction === 'suspend') {
                await database.save(COLLECTIONS.QUESTION_STATS, report.questionId, {
                    needsReview: true,
                    autoSuspended: true,
                    suspendReason: analysis.reasoning,
                    suspendedAt: Date.now()
                });

                console.log(`⚠️ Auto-suspended question ${report.questionId}: ${analysis.reasoning}`);
            }

            return {
                success: true,
                analysis,
                action: analysis.autoAction
            };

        } catch (error) {
            console.error('Report processing error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export const reportAnalyzer = new ReportAnalyzer();
