import React, { useState, useEffect } from 'react';
import { database } from '../../../services/database/DatabaseAdapter';
import {
    Trash2,
    Plus,
    Save,
    Edit2,
    Check,
    RefreshCw,
    Search,
    Gamepad2
} from 'lucide-react';

export default function GameCenter() {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLevel, setFilterLevel] = useState('all');

    // Form State
    const [formData, setFormData] = useState({
        question: '',
        answer: '',
        options: ['', '', '', ''],
        correctIndex: 0,
        difficulty: 'medium',
        verseRef: '',
        category: 'verse_fact'
    });

    useEffect(() => {
        fetchQuestions();
    }, []);

    const fetchQuestions = async () => {
        try {
            // Use DatabaseAdapter to query
            // Note: DatabaseAdapter.query currently supports simple equality checks.
            // For sorting, we might need to enhance it or sort client-side for now to keep it generic.
            const docs = await database.query('questions');

            // Client-side sort by createdAt desc (since generic adapter might not support complex sorts yet)
            docs.sort((a, b) => {
                const dateA = a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(a.createdAt || 0);
                const dateB = b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            setQuestions(docs);
        } catch (error) {
            console.error("Error fetching questions:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                // Update
                await database.save('questions', editingId, formData);
            } else {
                // Add
                await database.add('questions', {
                    ...formData,
                    // createdAt is handled by adapter
                });
            }

            // Reset form
            setFormData({
                question: '',
                answer: '',
                options: ['', '', '', ''],
                correctIndex: 0,
                difficulty: 'medium',
                verseRef: '',
                category: 'verse_fact'
            });
            setEditingId(null);
            fetchQuestions();
        } catch (error) {
            console.error("Error saving question:", error);
            alert('儲存失敗');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('確定要刪除這題嗎？')) {
            try {
                await database.delete('questions', id);
                fetchQuestions();
            } catch (error) {
                console.error("Error deleting question:", error);
                alert('刪除失敗');
            }
        }
    };

    const handleEdit = (q) => {
        setEditingId(q.id);
        setFormData({
            question: q.question,
            answer: q.answer || '',
            options: q.options || ['', '', '', ''],
            correctIndex: q.correctIndex ?? 0,
            difficulty: q.difficulty || 'medium',
            verseRef: q.verseRef || q.verse_ref || '',
            category: q.category || 'verse_fact'
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const filteredQuestions = questions.filter(q => {
        const matchesSearch = q.question.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLevel = filterLevel === 'all' || q.difficulty === filterLevel;
        return matchesSearch && matchesLevel;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-stone-800">遊戲中心</h2>
                <p className="text-stone-500">管理題庫、錯題與排行榜</p>
            </div>

            {/* Editor Form */}
            <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-stone-700">
                    {editingId ? <Edit2 size={20} className="text-amber-500" /> : <Plus size={20} className="text-green-500" />}
                    {editingId ? '編輯題目' : '新增題目'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-stone-500 mb-1">題目內容</label>
                        <input
                            type="text"
                            value={formData.question}
                            onChange={e => setFormData({ ...formData, question: e.target.value })}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                            required
                            placeholder="請輸入題目..."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {formData.options.map((opt, idx) => (
                            <div key={idx}>
                                <label className="block text-sm font-medium text-stone-500 mb-1">選項 {idx + 1}</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={opt}
                                        onChange={e => {
                                            const newOptions = [...formData.options];
                                            newOptions[idx] = e.target.value;
                                            // Auto-update answer if this was the correct one
                                            const update = { options: newOptions };
                                            if (formData.correctIndex === idx) {
                                                update.answer = e.target.value;
                                            }
                                            setFormData({ ...formData, ...update });
                                        }}
                                        className={`w-full bg-stone-50 border ${formData.correctIndex === idx ? 'border-green-500 ring-2 ring-green-500/20' : 'border-stone-200'} rounded-xl p-3 focus:border-amber-500 outline-none transition-all`}
                                        required
                                        placeholder={`選項 ${String.fromCharCode(65 + idx)}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, correctIndex: idx, answer: opt })}
                                        className={`p-3 rounded-xl transition-colors ${formData.correctIndex === idx ? 'bg-green-500 text-white shadow-sm' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
                                    >
                                        <Check size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-stone-500 mb-1">難度</label>
                            <select
                                value={formData.difficulty}
                                onChange={e => setFormData({ ...formData, difficulty: e.target.value })}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 focus:border-amber-500 outline-none"
                            >
                                <option value="easy">Easy (1-5)</option>
                                <option value="medium">Medium (6-10)</option>
                                <option value="hard">Hard (11-14)</option>
                                <option value="very_hard">Very Hard (15)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-stone-500 mb-1">相關經文</label>
                            <input
                                type="text"
                                value={formData.verseRef}
                                onChange={e => setFormData({ ...formData, verseRef: e.target.value })}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 focus:border-amber-500 outline-none"
                                placeholder="例如：約翰福音 3:16"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-stone-500 mb-1">題型分類</label>
                            <select
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 focus:border-amber-500 outline-none"
                            >
                                <option value="verse_fill">經文填空</option>
                                <option value="verse_fact">經文事實</option>
                                <option value="person">人物相關</option>
                                <option value="geography">地理背景</option>
                                <option value="theology">神學道理</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-stone-100 mt-4">
                        {editingId && (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingId(null);
                                    setFormData({
                                        question: '',
                                        options: ['', '', '', ''],
                                        correctAnswer: 0,
                                        difficulty: 1,
                                        bibleVerse: '',
                                        category: 'history'
                                    });
                                }}
                                className="px-6 py-3 bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 rounded-xl font-medium transition"
                            >
                                取消編輯
                            </button>
                        )}
                        <button
                            type="submit"
                            className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition shadow-sm flex items-center justify-center gap-2"
                        >
                            <Save size={20} />
                            {editingId ? '更新題目' : '儲存題目'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Question List */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center bg-stone-50/50">
                    <div className="flex items-center gap-2 text-stone-500 font-medium">
                        <Gamepad2 size={20} />
                        <span>共 {questions.length} 題</span>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <select
                            value={filterLevel}
                            onChange={e => setFilterLevel(e.target.value)}
                            className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-stone-600 outline-none focus:border-amber-500"
                        >
                            <option value="all">所有難度</option>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                            <option value="very_hard">Very Hard</option>
                        </select>
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                            <input
                                type="text"
                                placeholder="搜尋題目..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl focus:border-amber-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-stone-400">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        載入題庫中...
                    </div>
                ) : (
                    <div className="divide-y divide-stone-100">
                        {filteredQuestions.length === 0 ? (
                            <div className="p-12 text-center text-stone-400">
                                沒有找到符合的題目
                            </div>
                        ) : (
                            filteredQuestions.map(q => (
                                <div key={q.id} className="p-6 hover:bg-stone-50 transition flex justify-between items-start gap-4 group">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                                                q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                {q.difficulty?.toUpperCase()}
                                            </span>
                                            <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
                                                {q.category === 'verse_fill' ? '經文填空' :
                                                    q.category === 'person' ? '人物相關' :
                                                        q.category === 'verse_fact' ? '經文事實' :
                                                            q.category === 'geography' ? '地理背景' : q.category}
                                            </span>
                                        </div>
                                        <h3 className="font-bold text-lg text-stone-800 mb-3">{q.question}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                            {q.options.map((opt, idx) => (
                                                <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${idx === q.correctIndex
                                                    ? 'bg-green-50 text-green-700 font-medium border border-green-100'
                                                    : 'text-stone-500'
                                                    }`}>
                                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${idx === q.correctIndex ? 'bg-green-200 text-green-800' : 'bg-stone-200 text-stone-500'
                                                        }`}>
                                                        {String.fromCharCode(65 + idx)}
                                                    </span>
                                                    {opt}
                                                </div>
                                            ))}
                                        </div>
                                        {(q.verseRef || q.verse_ref) && (
                                            <p className="text-xs text-stone-400 mt-3 flex items-center gap-1">
                                                📖 {q.verseRef || q.verse_ref}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-row md:flex-col gap-2 mt-4 md:mt-0 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleEdit(q)}
                                            className="flex-1 md:flex-none p-2 text-stone-600 bg-stone-100 md:bg-transparent md:text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition flex items-center justify-center gap-2"
                                            title="編輯"
                                        >
                                            <Edit2 size={18} />
                                            <span className="md:hidden text-sm">編輯</span>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(q.id)}
                                            className="flex-1 md:flex-none p-2 text-stone-600 bg-stone-100 md:bg-transparent md:text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition flex items-center justify-center gap-2"
                                            title="刪除"
                                        >
                                            <Trash2 size={18} />
                                            <span className="md:hidden text-sm">刪除</span>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
