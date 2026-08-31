import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Plus, RefreshCw, Save, Trash2, X, Zap } from 'lucide-react';
import { API_BASE_URL } from '../../../config/api';
import { useAuth } from '../../../contexts/AuthContext';
import bibleTranslator from '../../../utils/bibleTranslator';

const CATEGORY_OPTIONS = [
    { value: 'verse_fill', label: '經文填空' },
    { value: 'verse_fact', label: '經文事實' },
    { value: 'person', label: '聖經人物' },
    { value: 'geography', label: '地理背景' },
    { value: 'theology', label: '神學教義' },
    { value: 'lexicon', label: '詞彙解釋' }
];

const DIFFICULTY_OPTIONS = [
    { value: 'easy', label: '簡單' },
    { value: 'medium', label: '中等' },
    { value: 'hard', label: '困難' },
    { value: 'very_hard', label: '極難' }
];

function parseJsonish(value, fallback) {
    if (Array.isArray(value)) return value;
    if (value == null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch {
            return fallback;
        }
    }
    return fallback;
}

function normalizeTextList(values) {
    return (Array.isArray(values) ? values : [])
        .map(v => String(v ?? '').trim())
        .filter(Boolean);
}

function getDistractors(question) {
    const pool = parseJsonish(question?.distractors_pool ?? question?.distractorsPool, null);
    
    if (Array.isArray(pool) && pool.length > 0) {
        if (Array.isArray(pool[0])) {
            return normalizeTextList(pool[0]);
        }
        return normalizeTextList(pool);
    }

    const options = parseJsonish(question?.options, []);
    const answer = String(question?.answer ?? '').trim();
    return normalizeTextList(options).filter(opt => opt !== answer);
}

export default function QuestionEditDrawer({ question, isOpen, onClose, onSave }) {
    const { getToken } = useAuth();
    const [formData, setFormData] = useState({
        question: '',
        answer: '',
        difficulty: 'medium',
        category: 'verse_fact',
        distractors: ['', '', '']
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!question || !isOpen) return;

        const distractors = getDistractors(question);
        while (distractors.length < 3) distractors.push('');

        setFormData({
            question: question.question || '',
            answer: question.answer || '',
            difficulty: (question.difficulty || 'medium').toLowerCase(),
            category: question.category || 'verse_fact',
            distractors
        });
    }, [question, isOpen]);

    const cleanDistractors = useMemo(() => {
        const answer = formData.answer.trim();
        const seen = new Set();
        return normalizeTextList(formData.distractors).filter(item => {
            if (item === answer || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
    }, [formData.answer, formData.distractors]);

    if (!isOpen || !question) return null;

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleDistractorChange = (index, value) => {
        setFormData(prev => {
            const next = [...prev.distractors];
            next[index] = value;
            return { ...prev, distractors: next };
        });
    };

    const addDistractor = () => {
        setFormData(prev => ({ ...prev, distractors: [...prev.distractors, ''] }));
    };

    const removeDistractor = (index) => {
        setFormData(prev => ({
            ...prev,
            distractors: prev.distractors.filter((_, i) => i !== index)
        }));
    };

    const handleAction = async (action = 'save') => {
        if (action === 'delete') {
            if (!confirm('確定要刪除這題嗎？此操作無法復原。')) return;
            setSaving(true);
            try {
                const token = getToken();
                const res = await fetch(`${API_BASE_URL}/api/admin/questions/${question.id}`, {
                    method: 'DELETE',
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });

                if (!res.ok) throw new Error('刪除失敗');
                onSave?.(question.id, { deleted: true });
                onClose();
            } catch (error) {
                console.error('Delete error:', error);
                alert(error.message || '刪除時發生錯誤');
            } finally {
                setSaving(false);
            }
            return;
        }

        if (!formData.question.trim()) {
            alert('題目內容不可為空');
            return;
        }
        if (!formData.answer.trim()) {
            alert('正確答案不可為空');
            return;
        }
        if (cleanDistractors.length < 3) {
            alert('至少需要 3 個有效錯項，且不可與正確答案重複。');
            return;
        }

        setSaving(true);
        try {
            const token = getToken();
            const endpoint = action === 'approve'
                ? `${API_BASE_URL}/api/admin/questions/${question.id}/approve`
                : `${API_BASE_URL}/api/admin/questions/${question.id}`;

            const options = [formData.answer.trim(), ...cleanDistractors];
            const payload = {
                question: formData.question.trim(),
                answer: formData.answer.trim(),
                difficulty: formData.difficulty,
                category: formData.category,
                options,
                correct_index: 0,
                distractors_pool: [cleanDistractors]
            };

            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });

            const result = await res.json().catch(() => ({}));
            if (!res.ok || result.success === false) {
                throw new Error(result.error || '儲存失敗');
            }

            onSave?.(question.id, {
                ...payload,
                distractors_pool: payload.distractors_pool,
                status: action === 'approve' ? 'PASS' : 'flagged'
            });
            onClose();
        } catch (error) {
            console.error('Save error:', error);
            alert(error.message || '儲存時發生錯誤');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
            <div className="absolute inset-0 overflow-hidden">
                <div
                    className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                    onClick={onClose}
                    aria-hidden="true"
                />

                <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                    <div className="pointer-events-auto w-screen max-w-md transform transition-all">
                        <div className="flex h-full flex-col bg-white shadow-xl">
                            <div className="px-4 py-6 sm:px-6 bg-stone-50 border-b border-stone-200">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h2 className="text-lg font-medium text-stone-900" id="slide-over-title">
                                            快速編輯題目
                                        </h2>
                                        <p className="mt-1 text-sm text-stone-500">
                                            {bibleTranslator.toChinese(question.book)} 第 {question.chapter} 章
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="rounded-md bg-white text-stone-400 hover:text-stone-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                        onClick={onClose}
                                    >
                                        <span className="sr-only">關閉</span>
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>

                            <div className="relative mt-6 flex-1 px-4 sm:px-6 overflow-y-auto">
                                <div className="space-y-6">
                                    <div>
                                        <label htmlFor="question-text" className="block text-sm font-medium text-stone-900">
                                            題目內容
                                        </label>
                                        <textarea
                                            id="question-text"
                                            rows={4}
                                            className="mt-2 block w-full resize-y rounded-md border-0 py-2 px-3 text-stone-900 shadow-sm ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                                            value={formData.question}
                                            onChange={(e) => handleChange('question', e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="answer" className="block text-sm font-medium text-stone-900">
                                            正確答案
                                        </label>
                                        <input
                                            type="text"
                                            id="answer"
                                            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-stone-900 shadow-sm ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                                            value={formData.answer}
                                            onChange={(e) => handleChange('answer', e.target.value)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="difficulty" className="block text-sm font-medium text-stone-900">
                                                難度
                                            </label>
                                            <select
                                                id="difficulty"
                                                className="mt-2 block w-full rounded-md border-0 py-2 pl-3 pr-10 text-stone-900 ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm"
                                                value={formData.difficulty}
                                                onChange={(e) => handleChange('difficulty', e.target.value)}
                                            >
                                                {DIFFICULTY_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="category" className="block text-sm font-medium text-stone-900">
                                                題型
                                            </label>
                                            <select
                                                id="category"
                                                className="mt-2 block w-full rounded-md border-0 py-2 pl-3 pr-10 text-stone-900 ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm"
                                                value={formData.category}
                                                onChange={(e) => handleChange('category', e.target.value)}
                                            >
                                                {CATEGORY_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between">
                                            <label className="block text-sm font-medium text-stone-900">
                                                錯項
                                            </label>
                                            <button
                                                type="button"
                                                onClick={addDistractor}
                                                className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-200"
                                            >
                                                <Plus size={14} />
                                                新增
                                            </button>
                                        </div>
                                        <div className="mt-2 space-y-2">
                                            {formData.distractors.map((opt, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        className="block w-full rounded-md border-0 py-2 px-3 text-sm text-stone-900 shadow-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
                                                        value={opt}
                                                        placeholder={`錯項 ${i + 1}`}
                                                        onChange={(e) => handleDistractorChange(i, e.target.value)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeDistractor(i)}
                                                        className="rounded-md p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                                                        aria-label={`刪除錯項 ${i + 1}`}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="mt-2 text-xs text-stone-500">
                                            儲存時會同步更新實體選項與錯項池；進遊戲時系統仍會重新洗牌。
                                        </p>
                                    </div>

                                    <div className="rounded-md bg-amber-50 p-4">
                                        <div className="flex">
                                            <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden="true" />
                                            <div className="ml-3">
                                                <h3 className="text-sm font-medium text-amber-800">系統自動行為</h3>
                                                <p className="mt-2 text-sm text-amber-700">
                                                    一般儲存會將題目標為待審核；「儲存並核准」會直接恢復為 PASS。
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-shrink-0 border-t border-stone-200 px-4 py-6 sm:px-6 bg-stone-50">
                                <div className="flex justify-between items-center gap-3">
                                    <button
                                        type="button"
                                        className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                        onClick={() => handleAction('delete')}
                                        disabled={saving}
                                    >
                                        <Trash2 size={16} />
                                        刪除題目
                                    </button>

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-stone-900 shadow-sm ring-1 ring-inset ring-stone-300 hover:bg-stone-50"
                                            onClick={onClose}
                                            disabled={saving}
                                        >
                                            取消
                                        </button>

                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-md bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800 shadow-sm hover:bg-amber-200 border border-amber-300 disabled:opacity-50"
                                            onClick={async () => {
                                                if (saving) return;
                                                setSaving(true);
                                                try {
                                                    const token = getToken();
                                                    const res = await fetch(`${API_BASE_URL}/api/admin/questions/${question.id}/autofix`, {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            ...(token ? { Authorization: `Bearer ${token}` } : {})
                                                        },
                                                        body: JSON.stringify({ instruction: '去除答案或選項中多餘的引號(「」)，修正不合理的誘導性提問，並確保所有選項的長度、格式與類別完全一致。' })
                                                    });
                                                    const result = await res.json();
                                                    if (result.success && result.data) {
                                                        const d = result.data;
                                                        // Update the form
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            question: d.question,
                                                            answer: d.answer,
                                                            distractors: d.options ? d.options.filter(o => o !== d.answer) : prev.distractors
                                                        }));
                                                        alert('✨ AI 智能潤飾完成！請確認修改後再按儲存。');
                                                    } else {
                                                        throw new Error(result.error);
                                                    }
                                                } catch (e) {
                                                    alert('修復失敗: ' + e.message);
                                                } finally {
                                                    setSaving(false);
                                                }
                                            }}
                                            disabled={saving}
                                            title="自動修正多餘引號、不合理的誘導與錯項同質性"
                                        >
                                            <span className="flex items-center gap-2">
                                                <Zap className="h-4 w-4" />
                                                AI 智能潤飾
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                                            onClick={() => handleAction('approve')}
                                            disabled={saving}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Check className="h-4 w-4" />
                                                儲存並核准
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                                            onClick={() => handleAction('save')}
                                            disabled={saving}
                                        >
                                            {saving ? (
                                                <span className="flex items-center gap-2">
                                                    <RefreshCw className="animate-spin h-4 w-4" />
                                                    儲存中
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-2">
                                                    <Save className="h-4 w-4" />
                                                    僅儲存
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
