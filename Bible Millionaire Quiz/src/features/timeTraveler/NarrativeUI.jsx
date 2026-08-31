import React, { useState, useEffect, useRef } from 'react';
import { Compass, Book, ShieldAlert, Send, ArrowLeft, MoreHorizontal, MessageSquare, Hand, Eye } from 'lucide-react';

export default function NarrativeUI({ initialSession, onExit }) {
    const { session_id, scene, sync_rate: initialSyncRate, ai_credits: initialCredits } = initialSession;
    
    // UI State
    const [history, setHistory] = useState([
        { type: 'narrative', content: scene.initial_narrative }
    ]);
    const [currentButtons, setCurrentButtons] = useState(scene.initial_buttons || []);
    const [syncRate, setSyncRate] = useState(initialSyncRate);
    const [aiCredits, setAiCredits] = useState(initialCredits);
    const [isProcessing, setIsProcessing] = useState(false);
    const [freeText, setFreeText] = useState('');
    const [isGameOver, setIsGameOver] = useState(false);
    const [showLogbook, setShowLogbook] = useState(false);
    const [witnessLogs, setWitnessLogs] = useState([]); // This would realistically be fetched from DB, but we keep it local for MVP Session

    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom of narrative
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [history]);

    const handleAction = async (actionText, intent = 'interaction', isFreeText = false) => {
        if (isProcessing || isGameOver) return;
        
        // Optimistic UI updates
        setHistory(prev => [...prev, { type: 'action', content: actionText, intent }]);
        setFreeText('');
        setIsProcessing(true);

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/time-traveler/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    session_id, 
                    action_text: actionText, 
                    is_free_text: isFreeText 
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Server error');

            setHistory(prev => [...prev, { 
                type: 'narrative', 
                content: data.turn.narrative_response,
                isViolation: data.turn.intent === 'violation'
            }]);

            setSyncRate(data.sync_rate);
            setAiCredits(data.ai_credits_remaining);
            window.dispatchEvent(new Event('refresh-ai-wallet'));

            if (data.turn.witness_fragment) {
                setWitnessLogs(prev => [...prev, data.turn.witness_fragment]);
            }

            if (data.status === 'failed') {
                setIsGameOver(true);
                setCurrentButtons([]);
            } else {
                setCurrentButtons(data.turn.new_buttons || []);
            }

        } catch (error) {
            console.error('Action failed:', error);
            setHistory(prev => [...prev, { type: 'system', content: '系統錯誤：連接時空通道失敗。' }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const getIntentIcon = (intent) => {
        switch (intent) {
            case 'observation': return <Eye className="w-4 h-4" />;
            case 'conversation': return <MessageSquare className="w-4 h-4" />;
            case 'interaction': return <Hand className="w-4 h-4" />;
            default: return <MoreHorizontal className="w-4 h-4" />;
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden relative">
            
            {/* HUD / Header */}
            <div className="flex-none p-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={onExit} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-amber-500 flex items-center gap-2">
                            <Compass className="w-5 h-5" />
                            {scene.title}
                        </h2>
                        <span className="text-xs text-slate-500">歷史錨點: {scene.canonical_anchor}</span>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* Sync Rate Meter */}
                    <div className="flex items-center gap-2">
                        <ShieldAlert className={`w-5 h-5 ${syncRate > 50 ? 'text-emerald-400' : syncRate > 20 ? 'text-amber-400' : 'text-rose-500 animate-pulse'}`} />
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Sync Rate</span>
                            <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden mt-1">
                                <div 
                                    className={`h-full transition-all duration-1000 ${syncRate > 50 ? 'bg-emerald-500' : syncRate > 20 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                    style={{ width: `${syncRate}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">智匯點數 (BI point)</div>
                        <div className="text-indigo-400 font-mono">{aiCredits}</div>
                    </div>

                    <button 
                        onClick={() => setShowLogbook(!showLogbook)}
                        className={`p-2 rounded-xl transition-all ${showLogbook ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-amber-100'}`}
                    >
                        <Book className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-grow flex relative overflow-hidden">
                
                {/* Narrative Scroll Area */}
                <div className="flex-grow overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
                    {history.map((msg, idx) => (
                        <div key={idx} className={`max-w-3xl mx-auto flex ${msg.type === 'action' ? 'justify-end' : 'justify-start'}`}>
                            {msg.type === 'action' ? (
                                <div className="bg-slate-800 text-amber-100 px-5 py-3 rounded-2xl rounded-tr-sm shadow-md border border-slate-700/50">
                                    <div className="text-xs text-amber-500/70 mb-1 flex items-center gap-1">
                                        {getIntentIcon(msg.intent)}
                                        <span className="uppercase">{msg.intent}</span>
                                    </div>
                                    <p className="text-base">{msg.content}</p>
                                </div>
                            ) : msg.type === 'narrative' ? (
                                <div className={`bg-transparent ${msg.isViolation ? 'text-rose-200 border-l-2 border-rose-500 pl-4 py-2' : 'text-slate-300'}`}>
                                    {msg.isViolation && <div className="text-xs text-rose-500 font-bold mb-2 uppercase tracking-widest flex items-center gap-2"><ShieldAlert className="w-4 h-4"/> 命運阻擋</div>}
                                    <p className="text-lg leading-relaxed">{msg.content}</p>
                                </div>
                            ) : (
                                <div className="text-center w-full my-4">
                                    <span className="text-sm text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">{msg.content}</span>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {isProcessing && (
                        <div className="max-w-3xl mx-auto text-slate-500 animate-pulse text-lg pl-4 border-l-2 border-indigo-500/50">
                            時空正在演算中...
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Logbook Overlay Panel */}
                {showLogbook && (
                    <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-800 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right z-20">
                        <div className="flex items-center gap-3 mb-6 text-amber-500 border-b border-slate-800 pb-4">
                            <Book className="w-6 h-6" />
                            <h3 className="font-bold text-lg tracking-wide">見證紀錄本</h3>
                        </div>
                        {witnessLogs.length === 0 ? (
                            <p className="text-slate-500 text-sm">尚無任何見證紀錄發生。在場景中互動以擷取歷史碎片。</p>
                        ) : (
                            <ul className="space-y-4">
                                {witnessLogs.map((log, i) => (
                                    <li key={i} className="text-slate-300 text-sm italic border-l-2 border-amber-500/30 pl-3 py-1">
                                        "{log}"
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {/* Input / Control Area (Bottom) */}
            <div className="flex-none bg-slate-900 border-t border-slate-800 p-6 md:px-8 shadow-2xl z-10">
                <div className="max-w-4xl mx-auto">
                    
                    {isGameOver ? (
                        <div className="text-center py-4">
                            <h3 className="text-xl text-rose-500 font-bold mb-2">時空連結已斷絕</h3>
                            <button onClick={onExit} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300">返回主選單</button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {/* Dynamic Buttons */}
                            <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
                                {currentButtons.map((btn, idx) => (
                                    <button
                                        key={idx}
                                        disabled={isProcessing}
                                        onClick={() => handleAction(btn.action, btn.intent, false)}
                                        className="px-4 py-2 border border-slate-700 bg-slate-800/80 hover:bg-indigo-600/20 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-200 rounded-xl text-sm md:text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 group"
                                    >
                                        <span className="text-slate-500 group-hover:text-indigo-400">{getIntentIcon(btn.intent)}</span>
                                        {btn.action}
                                    </button>
                                ))}
                            </div>

                            {/* Free Text Input */}
                            <form 
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (freeText.trim()) handleAction(freeText, 'unknown', true);
                                }}
                                className="relative flex items-center mt-2 group"
                            >
                                <input
                                    type="text"
                                    value={freeText}
                                    onChange={(e) => setFreeText(e.target.value)}
                                    disabled={isProcessing}
                                    placeholder="以自由意志行動 (輸入你想做的事情會消耗 AI 額度並記錄)"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-2xl py-3 pl-5 pr-12 text-slate-200 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                                />
                                <button
                                    type="submit"
                                    disabled={!freeText.trim() || isProcessing}
                                    className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                        </div>
                    )}

                </div>
            </div>
            
        </div>
    );
}
