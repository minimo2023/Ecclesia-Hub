import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, ChevronRight, Info, BookOpen, Eye, MessageCircle, Sparkles, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import TypewriterText from '../../shared/components/TypewriterText';

/**
 * BibleStoryAdventure — Phase 2.0 回合制文字冒險遊戲
 * 
 * 三個視圖：intro (主題搜尋) → confirm (確認啟動) → playing (遊戲中)
 * 三個 API：/classify, /start, /turn
 */
const BibleStoryAdventure = ({ onBack }) => {
    const { user, isLoggedIn } = useAuth();

    // ─── State ───
    const [view, setView] = useState('intro');       // 'intro' | 'confirm' | 'playing'
    const [sessionId, setSessionId] = useState(null);
    const [feedBlocks, setFeedBlocks] = useState([]);
    const [actions, setActions] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [chatInput, setChatInput] = useState('');

    // Topic search state
    const [topicInput, setTopicInput] = useState('');
    const [classification, setClassification] = useState(null);

    // Auto-scroll
    useEffect(() => {
        if (feedBlocks.length > 0) {
            setTimeout(() => document.getElementById('story-bottom')?.scrollIntoView({ behavior: 'smooth' }), 200);
        }
    }, [feedBlocks]);

    // ─── API: 搜尋主題 ───
    const handleSearchTopic = async () => {
        if (!topicInput.trim() || loading) return;
        setLoading(true);
        setError(null);
        setClassification(null);
        try {
            const res = await fetch('/api/narrative/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: topicInput.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setClassification(data.classification);
                setView('confirm');
            } else {
                setError(data.message || '搜尋失敗');
            }
        } catch (err) {
            setError('連線伺服器失敗，請確認伺服器已啟動');
        } finally {
            setLoading(false);
        }
    };

    // ─── API: 開新局 ───
    const handleStartGame = async (storyId, title, scriptureRefs) => {
        if (!isLoggedIn) { setError('請先登入'); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/narrative/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    storyId: storyId || 'dynamic_story',
                    title: title || topicInput,
                    scriptureRefs: scriptureRefs || []
                })
            });
            const data = await res.json();
            if (data.success) {
                setSessionId(data.state.sessionId);
                setFeedBlocks(data.state.feedBlocks);
                setActions(data.state.actions);
                setView('playing');
            } else {
                setError(data.message || '啟動失敗');
            }
        } catch (err) {
            setError('連線伺服器失敗');
        } finally {
            setLoading(false);
        }
    };

    // ─── API: 執行回合 ───
    const executeTurn = async (action) => {
        if (!action || loading) return;
        setLoading(true);
        setError(null);

        // Optimistic UI
        const tempId = `temp_${Date.now()}`;
        if (action.type === 'free_input') {
            setFeedBlocks(prev => [...prev, { id: tempId, type: 'character_speech', speaker: '你（觀察者）', text: action.text }]);
        } else {
            setFeedBlocks(prev => [...prev, { id: tempId, type: 'system_note', text: `— ${action.label} —` }]);
        }

        try {
            const res = await fetch('/api/narrative/turn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, sessionId, action })
            });
            const data = await res.json();
            if (data.success) {
                setFeedBlocks(data.state.feedBlocks);
                setActions(data.state.actions);
            } else {
                setFeedBlocks(prev => prev.filter(b => b.id !== tempId));
                setError(data.message || '行動失敗');
            }
        } catch (err) {
            setFeedBlocks(prev => prev.filter(b => b.id !== tempId));
            setError('連線伺服器失敗');
        } finally {
            setLoading(false);
        }
    };

    // ─── 自由輸入 ───
    const handleSendFreeInput = () => {
        if (!chatInput.trim() || loading) return;
        const text = chatInput.trim();
        setChatInput('');
        executeTurn({ type: 'free_input', text });
    };

    // ═══════════════════════════════════════════════
    // 渲染：intro — 主題搜尋畫面
    // ═══════════════════════════════════════════════
    const renderIntro = () => (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8">
            <div className="space-y-4 max-w-2xl">
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent leading-tight pb-1">
                    聖經歷史體驗
                </h1>
                <p className="text-lg text-slate-400 leading-relaxed">
                    輸入任何聖經人物、事件或主題，AI 將為您建構沉浸式的歷史現場
                </p>
            </div>

            <div className="w-full max-w-lg space-y-4">
                {error && (
                    <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-xl text-red-200 text-sm">{error}</div>
                )}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchTopic()}
                        placeholder="例如：血漏的婦人、出埃及記、大衛與歌利亞..."
                        disabled={loading}
                        className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-500/60 rounded-xl px-4 py-4 text-slate-100 placeholder-slate-500 outline-none transition-all text-lg"
                    />
                    <button onClick={handleSearchTopic} disabled={!topicInput.trim() || loading}
                        className="px-6 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-bold transition-all flex items-center gap-2">
                        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    </button>
                </div>
                {!isLoggedIn && <p className="text-sm text-slate-500">請先登入以開始冒險</p>}
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════
    // 渲染：confirm — 確認啟動畫面
    // ═══════════════════════════════════════════════
    const renderConfirm = () => {
        const c = classification;
        if (!c) return null;

        const isValid = c.is_bible_related && c.availability_status !== 'invalid';

        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 max-w-2xl mx-auto">
                {/* AI 回應訊息 */}
                <div className="p-6 bg-slate-900/80 border border-slate-700 rounded-2xl w-full text-left space-y-3">
                    <p className="text-xl text-amber-200 font-serif italic leading-relaxed">
                        「{c.ai_confirmation_message}」
                    </p>
                    {c.matched_scripture_refs?.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                            {c.matched_scripture_refs.map((ref, i) => (
                                <span key={i} className="px-3 py-1 bg-amber-900/40 text-amber-300 text-xs rounded-full border border-amber-800/50">
                                    {ref.book_id} {ref.chapter}:{ref.verse_start}-{ref.verse_end}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-xl text-red-200 text-sm w-full">{error}</div>
                )}

                {isValid ? (
                    <div className="space-y-3 w-full">
                        <button
                            onClick={() => handleStartGame(
                                c.matched_story_id || `dynamic_${Date.now()}`,
                                c.normalized_intent || topicInput,
                                c.matched_scripture_refs
                            )}
                            disabled={loading || !isLoggedIn}
                            className="w-full rounded-2xl p-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 font-bold text-white text-lg shadow-xl shadow-amber-900/30 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <span className="flex items-center justify-center gap-2">
                                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                {loading ? 'AI 正在建構歷史現場...' : '踏入歷史現場'}
                            </span>
                        </button>
                        <button onClick={() => { setView('intro'); setClassification(null); }}
                            className="w-full py-3 text-slate-400 hover:text-white text-sm underline underline-offset-4 transition-colors">
                            選擇其他主題
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3 w-full">
                        <p className="text-slate-400">此主題目前無法建立互動故事，請嘗試其他聖經相關主題。</p>
                        <button onClick={() => { setView('intro'); setClassification(null); }}
                            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors">
                            重新搜尋
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // ═══════════════════════════════════════════════
    // 渲染：Feed Block
    // ═══════════════════════════════════════════════
    const renderFeedBlock = (block) => {
        switch (block.type) {
            case 'divider':
                return (
                    <div className="flex items-center gap-4 py-4">
                        <div className="h-px flex-1 bg-slate-800" />
                        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">{block.label}</span>
                        <div className="h-px flex-1 bg-slate-800" />
                    </div>
                );
            case 'narration':
                return (
                    <p className="text-lg md:text-xl text-slate-200 leading-relaxed font-serif tracking-wide py-2">
                        <TypewriterText text={block.text} delay={25} />
                    </p>
                );
            case 'character_speech':
                return (
                    <div className="pl-4 border-l-2 border-amber-600/50 py-2 my-2">
                        <span className="block text-xs font-bold text-amber-500 uppercase tracking-wider mb-1">{block.speaker || '角色'}</span>
                        <p className="text-lg text-amber-50 leading-relaxed italic">「{block.text}」</p>
                    </div>
                );
            case 'system_note':
                return (
                    <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-900/80 p-3 rounded-lg border border-slate-800 my-2">
                        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{block.text}</span>
                    </div>
                );
            case 'npc_perspective':
                return (
                    <div className="p-4 bg-blue-950/20 border border-blue-900/40 rounded-xl my-2">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-2">內心獨白</span>
                        <p className="text-blue-100 leading-relaxed font-serif italic">{block.text}</p>
                    </div>
                );
            default:
                return null;
        }
    };

    // ═══════════════════════════════════════════════
    // 渲染：playing — 遊戲畫面
    // ═══════════════════════════════════════════════
    const renderPlaying = () => (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* ── 上半部：故事文字區（可捲動） ── */}
            <div className="flex-1 overflow-y-auto min-h-0">
                <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-3">
                    {feedBlocks.map((block, idx) => (
                        <div key={block.id || idx}
                            className={
                                block.type === 'narration'
                                    ? 'p-4 md:p-5 bg-slate-900/70 border border-slate-800/60 rounded-2xl'
                                    : block.type === 'character_speech'
                                        ? 'p-4 md:p-5 bg-amber-950/20 border border-amber-900/30 rounded-2xl'
                                        : ''
                            }>
                            {renderFeedBlock(block)}
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-center py-8">
                            <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                        </div>
                    )}
                    {error && (
                        <div className="p-4 bg-red-950/80 border border-red-500/40 rounded-xl text-red-200 text-sm">
                            <span className="font-bold flex items-center gap-2"><Info className="w-4 h-4" /> 系統異常</span>
                            <span className="block mt-1 opacity-90">{error}</span>
                        </div>
                    )}
                    <div id="story-bottom" className="h-4" />
                </div>
            </div>

            {/* ── 下半部：行動面板（固定在底部，不遮擋文字） ── */}
            <div className="shrink-0 border-t border-slate-800/60 bg-slate-950">
                <div className="max-w-2xl mx-auto p-3 md:p-4">
                    <div className="flex flex-col gap-2">

                        {/* 💬 Dialogue */}
                        {actions?.dialogue?.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                                {actions.dialogue.map((act, i) => (
                                    <button key={`d${i}`} onClick={() => executeTurn({ type: 'dialogue', ...act })} disabled={loading}
                                        className="p-2.5 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-900/50 text-amber-200 rounded-xl text-sm text-left font-medium transition-all flex items-center gap-2.5 disabled:opacity-40">
                                        <MessageCircle className="w-4 h-4 shrink-0" />
                                        <span className="truncate">{act.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* 👁️ Interaction */}
                        {actions?.interaction?.length > 0 && (
                            <div className="grid grid-cols-2 gap-1.5">
                                {actions.interaction.map((act, i) => (
                                    <button key={`i${i}`} onClick={() => executeTurn({ type: 'interaction', ...act })} disabled={loading}
                                        className="p-2.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs text-left transition-all flex items-center gap-2 group disabled:opacity-40">
                                        <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-400 shrink-0" />
                                        <span className="truncate text-slate-300 group-hover:text-white">{act.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* 📖 System */}
                        {actions?.system?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {actions.system.map((act, i) => (
                                    <button key={`s${i}`} onClick={() => executeTurn({ type: 'system', ...act })} disabled={loading}
                                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-40">
                                        <BookOpen className="w-3 h-3" />
                                        <span>{act.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ▶️ Mainline */}
                        {actions?.mainline?.map((act, i) => (
                            <button key={`m${i}`} onClick={() => executeTurn({ type: 'mainline', ...act })} disabled={loading}
                                className="w-full p-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 text-white rounded-xl font-bold text-base shadow-lg flex items-center justify-between group transition-all">
                                <span>{act.label}</span>
                                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </button>
                        ))}

                        {/* Fallback */}
                        {(!actions?.mainline?.length && !actions?.dialogue?.length && !actions?.interaction?.length) && !loading && (
                            <button onClick={() => executeTurn({ type: 'mainline', actionId: 'fallback', label: '繼續探索' })}
                                className="w-full p-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold">
                                繼續探索
                            </button>
                        )}

                        {/* ✨ Free Input */}
                        {actions?.freeInputEnabled && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text" value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendFreeInput()}
                                    placeholder="發起自由對話，或做出任何行動..."
                                    disabled={loading}
                                    className="flex-1 bg-slate-900 border border-slate-800 focus:border-amber-600/50 rounded-xl px-3 py-2.5 text-slate-200 placeholder-slate-600 outline-none transition-all text-sm"
                                />
                                <button onClick={handleSendFreeInput} disabled={!chatInput.trim() || loading}
                                    className="p-2.5 text-amber-500 hover:text-amber-400 disabled:text-slate-700 transition-colors">
                                    <Sparkles className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════
    // 主渲染
    // ═══════════════════════════════════════════════
    return (
        <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden selection:bg-amber-500/30">
            {/* Header */}
            <div className="shrink-0 p-4 flex items-center z-10 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
                <button
                    onClick={() => {
                        if (view === 'playing') { setView('intro'); setSessionId(null); setFeedBlocks([]); setActions(null); }
                        else if (view === 'confirm') { setView('intro'); setClassification(null); }
                        else { onBack(); }
                    }}
                    className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all flex items-center gap-2 group"
                >
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-slate-400 group-hover:text-slate-200 font-medium pr-2 text-sm">
                        {view === 'playing' ? '中止探索' : view === 'confirm' ? '重新搜尋' : '返回'}
                    </span>
                </button>
            </div>

            {view === 'intro' && renderIntro()}
            {view === 'confirm' && renderConfirm()}
            {view === 'playing' && renderPlaying()}
        </div>
    );
};

export default BibleStoryAdventure;
