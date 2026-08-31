import React, { useState, useEffect } from 'react';
import EntryPortal from './EntryPortal';
import NarrativeUI from './NarrativeUI';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function TimeTravelerEngine({ onExit }) {
    const { isLoggedIn } = useAuth();
    const [phase, setPhase] = useState('checking'); // 'checking', 'entry', 'resume-prompt', 'loading', 'playing'
    const [evaluationData, setEvaluationData] = useState(null);
    const [topicData, setTopicData] = useState('');
    const [sessionData, setSessionData] = useState(null);

    const handleEvaluationSuccess = async (parsedResult, topic) => {
        setEvaluationData(parsedResult);
        setTopicData(topic);
        setPhase('loading');

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/time-traveler/start-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    topic: topic,
                    scripture_reference: parsedResult.scripture_reference,
                    canonical_anchor: parsedResult.canonical_anchor
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to start session');

            setSessionData({
                session_id: data.session_id,
                scene: data.scene,
                sync_rate: 100,
                ai_credits: data.ai_credits_remaining
            });
            setPhase('playing');
        } catch (error) {
            console.error('[TimeTravelerEngine] start-session failed:', error);
            alert('啟動時空跳躍失敗：' + error.message);
            setPhase('entry');
        }
    };

    useEffect(() => {
        const checkActiveSession = async () => {
            if (!isLoggedIn) {
                setPhase('guest-locked');
                return;
            }

            try {
                const token = localStorage.getItem('authToken');
                const response = await fetch('/api/time-traveler/resume', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                
                if (data.has_active_session) {
                    setSessionData({
                        session_id: data.session_id,
                        scene: data.scene,
                        sync_rate: data.sync_rate,
                        ai_credits: data.ai_credits_remaining || 0,
                        history: data.history
                    });
                    setPhase('resume-prompt');
                } else {
                    setPhase('entry');
                }
            } catch (error) {
                console.error('Failed to check resume status', error);
                setPhase('entry');
            }
        };

        checkActiveSession();
    }, [isLoggedIn]);

    if (phase === 'guest-locked') {
        return (
            <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
                <div className="bg-slate-800/80 p-8 rounded-3xl border border-slate-700 max-w-md text-center shadow-2xl">
                    <LogIn className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">註冊會員專屬</h2>
                    <p className="text-slate-400 mb-6">時空旅人引擎需消耗專屬 AI 額度。請先登入或註冊會員以開啟您的聖經見證之旅。</p>
                    <button onClick={onExit} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors font-medium">返回主選單</button>
                </div>
            </div>
        );
    }

    if (phase === 'checking') {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
            </div>
        );
    }

    if (phase === 'resume-prompt') {
        return (
            <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
                <div className="bg-slate-800/80 p-8 rounded-3xl border border-indigo-500/30 max-w-md text-center shadow-2xl">
                    <h2 className="text-2xl font-bold text-amber-500 mb-2">偵測到時空殘留訊號</h2>
                    <p className="text-slate-300 mb-6">您在「{sessionData.scene.title}」的見證之旅尚未結束 (同步率 {sessionData.sync_rate}%)。</p>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => setPhase('playing')}
                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/20"
                        >
                            恢復時空連接
                        </button>
                        <button 
                            onClick={() => setPhase('entry')}
                            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-all"
                        >
                            放棄該次旅程並展開新探索
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === 'entry') {
        return <EntryPortal onEvaluateSuccess={handleEvaluationSuccess} onCancel={onExit} />;
    }

    if (phase === 'loading') {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <h2 className="text-2xl font-bold animate-pulse text-indigo-400">正在生成時空座標...</h2>
                <p className="text-slate-400 mt-2">首次穿越可能需要數十秒以建立穩固的歷史錨點</p>
                <div className="mt-6 w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-1/2 animate-[progress_2s_ease-in-out_infinite]"></div>
                </div>
            </div>
        );
    }

    if (phase === 'playing') {
        return (
            <NarrativeUI 
                initialSession={sessionData} 
                onExit={onExit}
            />
        );
    }

    return null;
}
