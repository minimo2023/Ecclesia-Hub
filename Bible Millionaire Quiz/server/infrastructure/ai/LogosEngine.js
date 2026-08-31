/**
 * [SOVEREIGN UNIT] Logos Engine Service
 * v3.6 - Central AI Orchestrator with Resilience Recovery
 * Pursuing "Stable and Accurate" theological alignment.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { ScriptureResolver } from './logos/ScriptureResolver.js';
import { SegmentationEngine } from './logos/SegmentationEngine.js';
import { ChronicleAnchor } from './logos/ChronicleAnchor.js';
import { NarrativeRenderer } from './logos/NarrativeRenderer.js';
import { LogosAuditor } from './logos/LogosAuditor.js';
import { ContentManager } from '../../domains/content/bible/ContentManager.js';
import { callGeminiRaw, DEFAULT_MODEL, GlobalAIState } from './gemini-client.js';
import { parseAIJSON } from '../../utils/ai-parser.js';
import { TASK_SCHEMAS } from './logos/schemas.js';
import { getGenre } from './logos/assets/specialty_assets.js';
import { promptRoot } from '../../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function isStructuredLogosTask(taskType = '') {
    const type = String(taskType).toLowerCase();
    return type.includes('trivia')
        || type.includes('distractor')
        || type.includes('expedition')
        || type.includes('duplicate')
        || type.includes('generation')
        || type.includes('lexicon')
        || type.includes('scene')
        || type.includes('batch')
        || type.includes('devotional')
        || type.includes('audit')
        || type.includes('fix')
        || ['scripture_selector', 'theology_extractor', 'prose_formatter', 'layout_formatter'].includes(type);
}

/**
 * LogosEngine - 系統 AI 智能中樞
 */
class LogosEngineService {
    constructor() {
        this.promptBaseDir = promptRoot;

        // 子組件注入
        this.resolver = new ScriptureResolver(this);
        this.renderer = new NarrativeRenderer(this);
        this.segmenter = new SegmentationEngine(this);
        this.anchor = new ChronicleAnchor(this);
        this.auditor = new LogosAuditor(this);
    }

    _resolveModuleName(taskType) {
        const type = taskType.toLowerCase();
        if (type.includes('trivia') || type.includes('expedition') || type.includes('distractor') || type.includes('duplicate')) return 'game_engine';
        if (type.includes('story') || type.includes('scene') || type.includes('interaction') || type.includes('epilogue')) return 'story_mode';
        if (type.includes('devotional') || type.includes('note')) return 'devotional_service';
        return 'logos_core';
    }

    _getPrompt(moduleName) {
        const fullPath = this._findPromptPath(moduleName);
        try {
            if (fs.existsSync(fullPath)) {
                return fs.readFileSync(fullPath, 'utf-8');
            }
            return "";
        } catch (e) {
            return "";
        }
    }

    _hydratePrompt(template, contextData = {}) {
        let hydrated = template || '';
        Object.keys(contextData).forEach(key => {
            const value = typeof contextData[key] === 'object'
                ? JSON.stringify(contextData[key])
                : contextData[key];
            hydrated = hydrated.replace(new RegExp(`{{${key}}}`, 'g'), value ?? '');
        });
        return hydrated;
    }

    _findPromptPath(moduleName) {
        const CATEGORIES = ['foundation', 'trivia', 'genre', 'expedition', 'devotional', 'lexicon', 'archive'];
        for (const category of CATEGORIES) {
            const categoryPath = path.join(this.promptBaseDir, category, `${moduleName}.md`);
            if (fs.existsSync(categoryPath)) return categoryPath;
        }
        return path.join(this.promptBaseDir, `${moduleName}.md`);
    }

    _buildSystemInstruction(taskType, contextData) {
        const core = this._getPrompt('core_rules');
        const silence = this._getPrompt('guardrails');
        const roles = this._getPrompt('expert_personas'); // 專家性格庫

        const isTrivia = taskType.includes('trivia') || taskType.includes('distractor') || taskType.includes('expedition') || taskType.includes('duplicate')
            || taskType === 'fun_facts' || taskType === 'fact_extractor' || taskType === 'lexicon_formatter';
        const isDevotional = taskType.includes('devotional')
            || taskType === 'theology_extractor' || taskType === 'prose_formatter'
            || taskType === 'scripture_selector' || taskType === 'layout_formatter';
        const isStructured = isStructuredLogosTask(taskType);

        let style = "";
        if (isTrivia) style = this._getPrompt('style_guide');
        else if (taskType.includes('interaction') || taskType.includes('observation') || taskType.includes('director') || taskType.includes('expert')) {
            style = this._getPrompt('expedition_style');
        }
        else if (isDevotional) style = this._getPrompt('devotional_style');

        // 靈修模組：載入作者人設庫與牧養守則
        let devotionalLayer = "";
        if (isDevotional) {
            const pastoral = this._getPrompt('pastoral_guardrails');
            // V2 的正式單次生成只接收 ContentManager 選出的今日作者卡，
            // 避免把其餘 20 位作者人設一併送入模型而造成文風混合。
            if (taskType !== 'unified_devotional') {
                const authors = this._getPrompt('author_personas');
                if (authors) devotionalLayer += `\n\n## AUTHOR PERSONAS\n${authors}`;
            }
            if (pastoral) devotionalLayer += `\n\n## PASTORAL GUARDRAILS\n${pastoral}`;
        }

        const taskLayer = this._getPrompt(taskType);
        const schema = isStructured ? `\n\n## SCHEMA\n${JSON.stringify(TASK_SCHEMAS[taskType] || {})}` : "";

        let specialtyLayer = "";
        const genre = getGenre(contextData?.book || "");
        if (genre) {
            const specialtyPrompt = this._getPrompt(`genre/${genre}`);
            if (specialtyPrompt) specialtyLayer = `\n\n## ${genre.toUpperCase()} Specialty\n${specialtyPrompt}`;
        }

        let finalInstruction = `# LOGOS RULES\n${core}\n\n${style}${specialtyLayer}${devotionalLayer}\n\n## PERSONALITY LIBRARY\n${roles}\n\n## LOGIC\n${silence}\n\n## TASK: ${taskType}\n${taskLayer}${schema}\n`;

        // [V4.2] 動態排除機制
        if (contextData?.excludeList && contextData.excludeList.length > 0) {
            const excludeText = contextData.excludeList.join('\n- ');
            finalInstruction += `\n## IMPORTANT: EXCLUDE THESE QUESTIONS (DO NOT REPEAT TOPICS)\n- ${excludeText}\n`;
        }

        return this._hydratePrompt(finalInstruction, contextData);
    }

    /**
     * 中央 AI 調度器 (Sovereign Dispatcher)
     * [UPGRADED V3.12] 支援優先權分流與全域彈性解析
     * @param {string} taskType 任務類型
     * @param {Object} contextData 上下文數據
     * @param {Object} options 額外選項
     */
    async askBrain(taskType, contextData, options = {}) {
        const startTime = Date.now();

        // --- [GOVERNANCE] 全域治理檢查 ---
        const isInteractive = taskType.includes('chat') || taskType.includes('interaction') || taskType.includes('suggest') || taskType.includes('expert');
        const isPriority = options.priority || isInteractive;

        const health = GlobalAIState.checkHealth();
        if (health !== 'green' && !isPriority) {
            console.warn(`🛡️ [Logos] System is in ${health.toUpperCase()} state. Yielding background task: ${taskType}`);
            return { error: 'Quota Busy (Yielding to priority traffic)', yielded: true };
        }

        console.log(`🌉 [Logos] Brain Dispatcher calling: ${taskType}`);

        const isBatch = taskType.includes('batch');
        const isStructured = isStructuredLogosTask(taskType);

        const finalOptions = {
            priority: isPriority,
            ...options
        };

        const systemInstruction = contextData.systemInstruction || (
            finalOptions.compactSystemInstruction
                ? this._hydratePrompt(this._getPrompt(taskType), contextData)
                : this._buildSystemInstruction(taskType, contextData)
        );
        let prompt = contextData.rawPrompt;
        if (!prompt) {
            const contextStr = JSON.stringify(contextData, null, 2);
            prompt = isStructured
                ? `【輸入資料】\n${contextStr}\n\n【指令】\n分析資料並回傳指定 JSON。`
                : `【內容】\n${contextStr}\n\n請根據以上內容提供詳細建議或回覆（使用 Markdown 格式）。`;
        }

        try {
            const moduleName = this._resolveModuleName(taskType);

            const rawResponse = await callGeminiRaw(prompt, {
                model: finalOptions.allowModelFallback ? undefined : (finalOptions.model || DEFAULT_MODEL),
                systemInstruction,
                moduleName,
                json: isStructured,
                priority: finalOptions.priority,
                paidOnly: finalOptions.paidOnly === true,
                freeOnly: finalOptions.freeOnly === true,
                freePreferred: finalOptions.freePreferred === true,
                temperature: contextData.temperature || (isBatch ? 0.4 : (isStructured ? 0.7 : 0.9)),
                thinkingBudget: finalOptions.thinkingBudget,
                maxAttempts: finalOptions.maxAttempts,
                maxQueueWaitMs: finalOptions.maxQueueWaitMs,
                requestTimeoutMs: finalOptions.requestTimeoutMs,
                // [SOVEREIGN] 明確的 Token 配額策略（依任務等級分配）
                maxOutputTokens: (
                    taskType === 'unified_devotional' ? 8192 :  // 靈修文章：最大輸出
                    isBatch ? 4096 :                            // 批次出題：充足上限
                    contextData.maxTokens || (isStructured ? 2048 : 2048)  // 其他結構：預設 2048
                ),
                correlationId: finalOptions.correlationId || null,
                userId: finalOptions.userId || null
            });

            // 3. 智慧解析分流
            if (isStructured) {
                const result = parseAIJSON(rawResponse);
                if (isBatch && (!result || !result.questions || result.questions.length === 0) && !options._isRetry) {
                    console.warn(`🛡️ [Logos] Truncation detected. Retrying...`);
                    return this.askBrain(taskType, contextData, { ...options, _isRetry: true });
                }
                return result;
            } else {
                // 自然對話直接回傳原始文本
                console.log(`✨ [Logos] Brain responded naturally for ${taskType} in ${Date.now() - startTime}ms.`);
                return rawResponse;
            }

        } catch (e) {
            if (!options._isRetry && options.retry !== false) {
                console.warn(`🌀 [Logos] Error on ${taskType}, initiating recovery...`);
                return this.askBrain(taskType, contextData, { ...options, _isRetry: true });
            }
            console.error(`❌ [Logos] Brain failed for ${taskType}:`, e.message);
            return { error: e.message };
        }
    }
}

const logosEngine = new LogosEngineService();

/**
 * [SOVEREIGN UNIT] EXPORTS
 */
export { LogosEngineService, logosEngine as LogosEngine };
export default logosEngine;
