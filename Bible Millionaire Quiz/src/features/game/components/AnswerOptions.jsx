import React from 'react';

export default function AnswerOptions({
    currentQuestion,
    hiddenOptions,
    fiftyFiftyAnimating,
    focusedOptionIndex,
    selectedOption,
    gameState,
    showOptions,
    onSelectOption,
    lastAnimationAmt = 0
}) {
    return (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-full ${showOptions ? '' : 'pointer-events-none'}`}>
            {currentQuestion?.options?.map((option, index) => {
                const isHidden = hiddenOptions.includes(index);
                const isCorrect = option === currentQuestion.answer;
                const isSelected = selectedOption === index;

                let stateClass = 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300';

                if (fiftyFiftyAnimating && index === focusedOptionIndex) {
                    stateClass = 'bg-yellow-600/50 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.5)] scale-105 z-10 transition-all duration-50';
                } else if (gameState === 'answered' && isCorrect) {
                    // Correct answer - strong celebration effect
                    stateClass = 'bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-300 animate-correct-celebration shadow-[0_0_35px_rgba(16,185,129,0.45)] ring-4 ring-emerald-200 text-white';
                } else if (gameState === 'answered' && isSelected && !isCorrect) {
                    // Wrong answer - red
                    stateClass = 'bg-rose-600 border-rose-300 text-white animate-shake';
                } else if (isSelected) {
                    // Selected but not yet answered - yellow
                    stateClass = 'bg-orange-500 border-orange-300 text-white animate-pulse';
                }

                return (
                    <button
                        key={`${currentQuestion.id}-${index}`}
                        onClick={() => onSelectOption(index)}
                        disabled={gameState === 'answered' || fiftyFiftyAnimating || isHidden}
                        className={`p-3 md:p-4 lg:p-6 rounded-xl border-2 text-left text-base sm:text-lg md:text-2xl lg:text-3xl transition-all duration-200 flex items-start group ${stateClass} ${showOptions ? 'animate-slide-down' : 'opacity-0'} w-full relative ${isHidden ? 'opacity-50 bg-slate-50/80' : ''}`}
                        style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
                    >
                        {/* 獎勵漂浮文字：僅在答對且選擇正確時於選項上方顯示 */}
                        {gameState === 'answered' && isCorrect && isSelected && lastAnimationAmt > 0 && (
                            <div className="reward-float-text -top-12 left-1/2 -translate-x-1/2">
                                +{lastAnimationAmt} 智匯金幣
                            </div>
                        )}

                        {/* 被排除的答案：顯示大紅叉 */}
                        {isHidden && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-50/90 rounded-xl z-10">
                                <svg className="w-24 h-24 md:w-32 md:h-32 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                        )}

                        <span className="text-orange-500 mr-4 md:mr-5 text-3xl md:text-4xl group-hover:text-orange-600 flex-shrink-0">
                            {String.fromCharCode(65 + index)}:
                        </span>
                        <span className="flex-1 break-words whitespace-normal leading-snug">{option}</span>
                    </button>
                );
            })}
        </div>
    );
}
