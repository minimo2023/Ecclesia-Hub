/**
 * Question Generator Module  
 * 
 * 職責：
 * - 構建 AI 提示詞
 * - 調用後端 API 生成題目
 * - 解析和驗證 AI 響應
 */

import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const getAuthHeaders = () => {
    const token = sessionStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * 生成聖經問答題（使用後端 AI API）
 */
export async function generateQuestions(bookSelections, difficulty, count, excludeQuestions = []) {
    try {
        console.log(`[Generator] Requesting ${count} ${difficulty} questions via backend...`);

        // Add timeout to prevent infinite loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout

        const response = await fetch(`${API_BASE_URL}/api/generate/quiz-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
                bookSelections,
                difficulty,
                count,
                // Note: prompt is built on backend using V2 RAG approach
                excludeQuestions: excludeQuestions.map(q => q.question || '')
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Backend generation failed');
        }

        console.log(`[Generator] Received ${result.data?.length || 0} questions from backend`);

        // Parse and validate the questions
        const questions = (result.data || []).map(q => ({
            id: q.id || uuidv4(),
            question: q.question,
            options: q.options,
            answer: q.answer,
            difficulty: q.difficulty || difficulty,
            book: q.book || bookSelections[0]?.book,
            chapter: q.chapter
        }));

        return questions;
    } catch (error) {
        console.error(`[Generator] Failed to generate ${difficulty} questions:`, error);
        throw error;
    }
}

/**
 * 解析 AI 響應
 */
export function parseAIResponse(response) {
    const text = response.text();
    let jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');

    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch (parseError) {
        console.warn('[Parser] JSON parse failed, attempting cleanup');
        const firstBracket = jsonStr.indexOf('[');
        const lastBracket = jsonStr.lastIndexOf(']');

        if (firstBracket !== -1 && lastBracket !== -1) {
            const cleaned = jsonStr.substring(firstBracket, lastBracket + 1)
                .replace(/,(\s*[\]}])/g, '$1');
            data = JSON.parse(cleaned);
        } else {
            throw parseError;
        }
    }

    if (!Array.isArray(data)) {
        throw new Error("AI response is not an array");
    }

    return data.map(q => ({
        ...q,
        id: uuidv4(),
        source: 'ai',
        createdAt: new Date().toISOString()
    }));
}
