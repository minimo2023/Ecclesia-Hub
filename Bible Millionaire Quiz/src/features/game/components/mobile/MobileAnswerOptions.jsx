import React from 'react';

const optionLabels = ['A', 'B', 'C', 'D'];

export default function MobileAnswerOptions({
    currentQuestion,
    hiddenOptions,
    fiftyFiftyAnimating,
    focusedOptionIndex,
    selectedOption,
    gameState,
    showOptions,
    onSelectOption,
    lastAnimationAmt = 0,
    fillHeight = false
}) {
    if (!currentQuestion) return null;

    const renderOption = (option, index) => {
        // 50:50 Logic: Use opacity instead of unmounting for smoother animation
        const isHidden = hiddenOptions.includes(index);
        const isFading = fiftyFiftyAnimating && isHidden;

        // If hidden and not animating, keep it in DOM but invisible to maintain layout stability
        const visibilityClass = isHidden && !isFading ? 'invisible pointer-events-none' : '';

        // Use slide-down animation for entry as requested
        const fadeClass = isFading
            ? 'animate-fade-out pointer-events-none'
            : showOptions
                ? 'animate-slide-down'
                : 'opacity-0 pointer-events-none';

        // Stagger delay for entry animation
        const animationDelay = `${index * 60}ms`;

        const isFocused = focusedOptionIndex === index;
        const isSelected = selectedOption === index;
        const isAnswered = gameState === 'answered';

        // Find the index of the correct answer
        const correctAnswerIndex = currentQuestion.options.findIndex(opt => opt === currentQuestion.answer);
        const isCorrect = isAnswered && correctAnswerIndex === index;
        const isWrong = isAnswered && isSelected && !isCorrect;
        const label = optionLabels[index];

        // Base styles for Earth Tone
        let bgClass = 'bg-[#FDF8EE] border-[#EFE5D0] hover:bg-[#F5EDDD] hover:border-[#D1BFAE]';
        let textClass = 'text-[#6B4E31]';
        let labelBgClass = 'bg-[#A88B70] text-white';
        let transformClass = '';

        // State-based styles overrides
        if (isSelected && !isAnswered) {
            bgClass = 'bg-[#EFE5D0] border-[#C2B099] shadow-md';
            labelBgClass = 'bg-[#8B6B4A] text-white';
            transformClass = 'scale-[1.02]';
        } else if (isCorrect) {
            bgClass = 'bg-gradient-to-r from-green-500 to-emerald-400 border-green-300 animate-correct-celebration shadow-lg ring-2 ring-green-300';
            textClass = 'text-white';
            labelBgClass = 'bg-green-600 text-white';
            transformClass = '';
        } else if (isWrong) {
            bgClass = 'bg-red-500 border-red-400 shadow-md';
            textClass = 'text-white';
            labelBgClass = 'bg-red-700 text-white';
            transformClass = 'scale-[1.02] animate-shake';
        } else if (!isSelected && isAnswered && !isCorrect) {
            bgClass = 'bg-[#FDF8EE] border-[#EFE5D0] opacity-50';
            labelBgClass = 'bg-[#D1BFAE] text-white';
        } else if (isFocused) {
            transformClass = 'scale-[1.02] ring-2 ring-[#8B6B4A]';
        }

        return (
            <button
                key={`${currentQuestion.id}-${index}`}
                onClick={() => !isAnswered && !isHidden && onSelectOption(index)}
                disabled={isAnswered || isHidden}
                style={{ animationDelay, animationFillMode: 'both' }}
                className={`w-full p-3 rounded-xl text-left font-bold transition-all duration-300 border active:scale-95
                    ${visibilityClass}
                    ${fadeClass}
                    ${bgClass}
                    ${textClass}
                    ${transformClass}
                `}
            >
                <div className="flex items-center gap-3">
                    {/* Option Label */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-black text-base transition-colors ${labelBgClass}`}>
                        {label}
                    </div>

                    {/* Option Text */}
                    <div className="flex-1 text-[16px] leading-snug break-words">
                        {option}
                    </div>

                    {/* 獎勵漂浮文字：僅在答對且選擇正確時於選項上方顯示 */}
                    {isCorrect && isSelected && lastAnimationAmt > 0 && (
                        <div className="reward-float-text -top-10 right-0">
                            +{lastAnimationAmt} 智匯金幣
                        </div>
                    )}
                </div>
            </button>
        );
    };

    return (
        <div className={`flex flex-col gap-3 ${fillHeight ? 'h-full justify-center' : ''}`}>
            {currentQuestion.options.map((option, index) => renderOption(option, index))}
        </div>
    );
}
