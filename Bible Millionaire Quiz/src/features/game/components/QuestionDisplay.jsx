import React from 'react';

export default function QuestionDisplay({ displayedQuestion, currentQuestion, isReading, onSkip, isSpeedMode = false }) {
    // Speed mode uses smaller font sizes for more consistent layout
    const getFontSizeClass = () => {
        if (isSpeedMode) {
            // Smaller base sizes for speed mode
            if (displayedQuestion.length > 60) return 'text-lg md:text-xl lg:text-2xl';
            if (displayedQuestion.length > 40) return 'text-xl md:text-2xl lg:text-3xl';
            return 'text-xl md:text-2xl lg:text-3xl';
        }
        // Reduced sizes for better balance with answer options
        if (displayedQuestion.length > 60) return 'text-xl md:text-2xl lg:text-3xl';
        if (displayedQuestion.length > 40) return 'text-2xl md:text-3xl lg:text-4xl';
        return 'text-3xl md:text-4xl lg:text-5xl';
    };

    const getDifficultyColor = (diff) => {
        switch (diff?.toUpperCase()) {
            case 'EASY': return 'bg-green-500/20 text-green-300 border-green-500/30';
            case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
            case 'HARD': return 'bg-red-500/20 text-red-300 border-red-500/30';
            default: return 'bg-slate-500/20 text-slate-700 border-slate-300/30';
        }
    };

    return (
        <div
            className={`bg-white ${isSpeedMode ? 'p-6 md:p-8' : 'p-8 md:p-10 lg:p-12'} rounded-2xl border-2 border-slate-200 shadow-2xl mb-4 md:mb-6 text-center relative overflow-hidden group hover:border-blue-500/50 transition-colors cursor-pointer flex flex-col items-center justify-center`}
            onClick={onSkip}
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>

            {/* Difficulty Badge removed - AI difficulty accuracy needs improvement */}

            {/* Quoted Verse removed - should only show AFTER answering to avoid spoilers */}

            <h2 className={`leading-relaxed ${isSpeedMode ? 'h-auto' : 'min-h-[4rem]'} flex items-center justify-center transition-all duration-300 text-slate-900 ${getFontSizeClass()}`}>
                {displayedQuestion}
                {isReading && <span className="animate-pulse ml-1">|</span>}
            </h2>

            <div className="mt-6 flex gap-4 text-slate-500 text-sm font-medium">
                <span>📖 {currentQuestion.book}</span>
                {currentQuestion.chapter && <span>第 {currentQuestion.chapter} 章</span>}
                {currentQuestion.versionLabel && <span>· {currentQuestion.versionLabel}</span>}
            </div>
        </div>
    );
}
