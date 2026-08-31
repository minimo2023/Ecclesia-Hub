import React from 'react';
import { FastForward, BookOpen } from 'lucide-react';
import bibleTranslator from '../../../../utils/bibleTranslator';

// [Mobile Only] 針對手機螢幕動態調整字體與行距
function getQuestionTypography(text) {
    const len = (text || '').length;
    // 極短句：超大字體，強調重點
    if (len <= 20) return 'text-3xl font-black leading-tight tracking-wide';
    // 短句：大字體，舒適閱讀
    if (len <= 35) return 'text-2xl font-black leading-snug tracking-wide';
    // 中等長度：適中字體，增加行距
    if (len <= 55) return 'text-[22px] font-bold leading-relaxed';
    // 長句：縮小字體，確保不需過度捲動
    if (len <= 80) return 'text-lg font-bold leading-[1.8]';
    // 超長經文：基礎字體，最大化行距
    return 'text-[16px] font-medium leading-[1.85]';
}

export default function MobileQuestionDisplay({ displayedQuestion, currentQuestion, isReading, onSkip, isSpeedMode }) {
    const questionText = displayedQuestion || currentQuestion?.question || '';
    const typographyClass = getQuestionTypography(currentQuestion?.question || questionText);
    
    // 取得書卷並翻譯成中文
    const rawBook = currentQuestion?.book || currentQuestion?.reference?.book;
    const translatedBook = rawBook ? bibleTranslator.toChinese(rawBook) : '';
    const chapter = currentQuestion?.chapter || currentQuestion?.reference?.chapter;

    return (
        <div className="h-full flex flex-col w-full relative">
            {/* 主要讀題卡片區塊 */}
            <div className={`flex-1 relative flex flex-col justify-center w-full rounded-3xl overflow-hidden shadow-sm border ${
                isSpeedMode 
                    ? 'bg-[#FDF8EE] border-rose-300' 
                    : 'bg-[#FDF8EE] border-[#EFE5D0]'
            }`}>
                
                {/* 裝飾性引號浮水印 */}
                <div className="absolute top-[-20px] left-2 text-[120px] font-serif leading-none select-none pointer-events-none opacity-40 text-[#EFE5D0]">
                    "
                </div>

                <div className="relative z-10 px-6 py-8 flex-1 flex items-center justify-center min-h-[160px]">
                    <p className={`text-[#4A3B32] w-full ${typographyClass} ${isSpeedMode ? 'text-center' : 'text-justify'}`}>
                        {questionText}
                        {/* 打字機游標效果 (若正在閱讀中) */}
                        {isReading && (
                            <span className="inline-block w-1.5 h-[1em] bg-[#8B6B4A] ml-1 align-middle animate-pulse"></span>
                        )}
                    </p>
                </div>

                {/* 跳過閱讀按鈕 (懸浮於卡片右下角) */}
                {isReading && (
                    <button
                        onClick={onSkip}
                        className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-[#EFE5D0]/50 hover:bg-[#EFE5D0] text-[#6B4E31] text-sm font-bold rounded-full transition-all active:scale-95"
                    >
                        <span>跳過</span>
                        <FastForward className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* 經文出處 (Reference) - 獨立於卡片下方 */}
            {translatedBook && (
                <div className="mt-3 text-center shrink-0 flex items-center justify-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#8B6B4A]" />
                    <span className="text-sm font-bold text-[#8B6B4A] tracking-wider">
                        {translatedBook}
                        {chapter && ` 第${chapter}章`}
                        {(currentQuestion?.verse || currentQuestion?.reference?.verse) ? `:${currentQuestion?.verse || currentQuestion?.reference?.verse}` : ''}
                        {currentQuestion?.versionLabel && ` · ${currentQuestion.versionLabel}`}
                    </span>
                </div>
            )}
        </div>
    );
}
