import React from 'react';
import { Timer } from 'lucide-react';
import Avatar from '../../../components/common/Avatar';

export default function ExpeditionGameView({
    phase,
    question,
    timeLeft,
    countdown,
    myAnswer,
    judgement,
    onSelectAnswer,
    team,
    teammateAnswers = {},
    disabledOptions = [],
    isMobile = false
}) {
    if (!question && phase !== 'judging') return (
        <div className="flex flex-col items-center justify-center h-full text-white animate-pulse">
            <h2 className="text-2xl font-bold mb-2">準備中...</h2>
            <p>正在探索前方道路...</p>
        </div>
    );

    const isAnswering = phase === 'answering';
    const isJudging = phase === 'judging';
    const displayTime = isAnswering ? countdown : timeLeft;
    const correctCount = team?.currentQuestion || 0;

    /* ── PC: h-full fixed layout, question centered, no scroll
       ── Mobile: scrollable column                              */
    const containerClass = isMobile
        ? 'w-full h-full overflow-y-auto flex flex-col p-3 gap-3'
        : 'w-full h-full overflow-hidden flex flex-col p-5 gap-4';

    return (
        <div className={containerClass}>

            {/* Top Bar: Timer | Count | Phase */}
            <div className="shrink-0 flex items-center justify-between bg-slate-900/60 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-700/50">
                <div className={`flex items-center gap-2 font-mono font-bold ${isMobile ? 'text-base' : 'text-lg'} ${isAnswering ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                    <Timer className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                    <span>{displayTime ?? '--'}s</span>
                </div>
                <span className={`text-sky-300 font-bold tracking-wide ${isMobile ? 'text-sm' : 'text-base'}`}>
                    第 {correctCount + 1} 關
                </span>
                <div className={`px-3 py-1 bg-blue-600/30 text-blue-300 rounded-full font-bold border border-blue-500/30 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    {phase === 'thinking' ? '思考' : isAnswering ? '搶答' : '判定'}
                </div>
            </div>

            {/* Question Card — flex-1 on PC so it fills space and centers the question */}
            <div className={`${isMobile ? 'shrink-0' : 'flex-1 flex flex-col justify-center'}`}>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl relative overflow-hidden p-5 md:p-8">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />
                    <h2 className={`font-bold text-white text-center leading-relaxed relative z-10 ${isMobile ? 'text-base' : 'text-xl lg:text-3xl xl:text-4xl 2xl:text-5xl'}`}>
                        {question?.question || judgement?.currentQuestion?.question}
                    </h2>
                    {question?.source && (
                        <div className="mt-3 text-center">
                            <span className="inline-block px-3 py-1 bg-emerald-900/40 text-emerald-400 text-xs rounded-full border border-emerald-500/20">
                                {question.source.book} {question.source.chapter}:{question.source.verse}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Options Grid */}
            <div className={`shrink-0 grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {question?.options?.map((opt, idx) => {
                    const isSelected = myAnswer === idx;
                    const isCorrectIdx = judgement?.correctIndex != null && Number(judgement.correctIndex) === Number(idx);
                    const showCorrect = isJudging && isCorrectIdx;
                    const isWrong = isJudging && isSelected && !isCorrectIdx;
                    const isDisabled = disabledOptions.includes(idx);

                    const pad = isMobile ? 'p-3' : 'p-4 lg:p-6 2xl:p-8';
                    let btnClass = `relative ${pad} rounded-xl border-2 text-left transition-all hover:scale-[1.01] active:scale-[0.99] w-full `;
                    if (isDisabled) {
                        btnClass += 'bg-slate-900/50 border-slate-800 text-slate-600 opacity-30 cursor-not-allowed pointer-events-none';
                    } else if (isJudging) {
                        if (showCorrect) btnClass += 'bg-green-500/20 border-green-500 text-green-100';
                        else if (isWrong) btnClass += 'bg-red-500/20 border-red-500 text-red-100 opacity-80';
                        else btnClass += 'bg-slate-800/40 border-slate-700 text-slate-400 opacity-50';
                    } else if (isSelected) {
                        btnClass += 'bg-amber-500/20 border-amber-500 text-amber-100 ring-2 ring-amber-500/30';
                    } else {
                        btnClass += 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-700/80 hover:border-slate-500';
                    }

                    const canAnswer = !isJudging && !isDisabled && (phase === 'answering' || phase === 'thinking');

                    return (
                        <button
                            key={idx}
                            onClick={() => canAnswer && onSelectAnswer(idx)}
                            disabled={!canAnswer}
                            className={btnClass}
                        >
                            <div className="flex items-center gap-3">
                                <span className={`shrink-0 flex items-center justify-center rounded-full font-bold ${isMobile ? 'w-7 h-7 text-sm' : 'w-8 h-8 text-base lg:w-10 lg:h-10 lg:text-xl'} ${isSelected || showCorrect ? 'bg-white/20' : 'bg-slate-700'}`}>
                                    {String.fromCharCode(65 + idx)}
                                </span>
                                <span className={`font-medium leading-snug ${isMobile ? 'text-sm' : 'text-base lg:text-xl 2xl:text-2xl'}`}>
                                    {isDisabled ? <s className="opacity-50">{opt}</s> : opt}
                                </span>
                            </div>
                            <div className="absolute top-2 right-2 flex -space-x-1.5 overflow-hidden pointer-events-none">
                                {Object.entries(teammateAnswers || {}).map(([name, optIdx]) => {
                                    if (optIdx !== idx) return null;
                                    // 若能從 team.members 取得真實頭像更好，但目前只有 name 作為 key
                                    // 這裡先傳入 name 給 Avatar，若有對應機制 Avatar 內部會處理
                                    const member = team?.members?.find(m => m.displayName === name);
                                    const avatarId = member?.avatar || name;

                                    return (
                                        <div key={name} className="w-5 h-5 lg:w-6 lg:h-6 rounded-full border border-slate-600 flex items-center justify-center shadow" title={name}>
                                            <Avatar avatarId={avatarId} size="full" />
                                        </div>
                                    );
                                })}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
