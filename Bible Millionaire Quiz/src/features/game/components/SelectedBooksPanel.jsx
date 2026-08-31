import React, { useEffect } from 'react';
import { BOOK_CHAPTERS, BIBLE_BOOKS } from '../data/constants';
import { VERSE_COUNTS } from '../../../data/verse_counts';
import { bibleTranslator } from '../../../utils/bibleTranslator'; // 確保路徑正確

export default function SelectedBooksPanel({
    selectedScope,
    selectedBooks,
    onToggleBook,
    onUpdateChapterRange,
    onStartGame,
    isCasualMode,
    questionCount,
    onQuestionCountChange,
    bibleVersion = 'CUV_TRAD',
    onVersionChange,
    includeGeography = true,
    onToggleGeography,
    includeEncyclopedia = true,
    onToggleEncyclopedia,
    gameMode = 'classic',
    onShortRangeChange // 💡 新增回傳狀態
}) {
    const isSpeedMode = gameMode === 'speed';

    // 💡 [Precision Calculation] 累計所選範圍的總節數
    const totalVerses = selectedBooks.reduce((acc, selection) => {
        const bookEn = bibleTranslator.toEnglish(selection.book);
        const bookData = VERSE_COUNTS[bookEn] || VERSE_COUNTS[selection.book];
        if (!bookData) return acc;

        let versesInRange = 0;
        for (let ch = selection.startChapter; ch <= selection.endChapter; ch++) {
            versesInRange += (bookData[ch] || 0);
        }
        return acc + versesInRange;
    }, 0);

    const totalChapters = selectedBooks.reduce((acc, b) => acc + (b.endChapter - b.startChapter + 1), 0);
    const isUnderThreshold = selectedBooks.length > 0 && totalVerses < 45;

    // 💡 通知父組件目前是否處於短經文狀態
    useEffect(() => {
        if (onShortRangeChange) {
            onShortRangeChange(isUnderThreshold);
        }
    }, [isUnderThreshold, onShortRangeChange]);

    return (
        <div className="w-full md:w-64 lg:w-72 flex flex-col gap-2 flex-shrink-0 items-center h-full overflow-hidden">
            {/* 🛠️ [Settings Area] Compact toggles for Versions and Resources */}
            <div className="w-full bg-white p-[1vh] rounded-2xl border border-slate-300 shadow-sm">
                <div className="flex justify-between items-center mb-[1vh]">
                    <h2 className="text-[2.2vmin] font-bold text-slate-700 flex items-center gap-1">
                        📚 範圍
                        <span className="bg-slate-100 text-slate-900 text-[1.4vmin] px-1.5 py-0.5 rounded-full">
                            {selectedScope === 'full' ? '全' : selectedBooks.length}
                        </span>
                    </h2>
                    
                    {/* Version Selector (Mutual Exclusive) */}
                    <div className="flex gap-1">
                        {['unv', 'ncv', 'tcv95'].map((v) => (
                            <button
                                key={v}
                                onClick={() => onVersionChange(v)}
                                className={`px-2 py-0.5 rounded-md text-[1.2vmin] font-bold transition-all ${
                                    bibleVersion === v 
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 scale-105' 
                                    : (isSpeedMode 
                                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' 
                                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300')
                                }`}
                                title={v === 'unv' ? '和合本' : v === 'ncv' ? '新譯本' : '現代中文'}
                            >
                                {v === 'unv' ? '和' : v === 'ncv' ? '新' : '現'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Resource Toggles (Geography & Encyclopedia) */}
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onToggleGeography}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[1.3vmin] font-bold transition-all border ${
                            (includeGeography || isSpeedMode)
                            ? 'bg-blue-100 border-blue-300 text-blue-700' 
                            : 'bg-slate-200 border-slate-300 text-slate-600'
                        }`}
                        title="開啟/關閉 地景資料"
                    >
                        <span>📍</span> 地理
                    </button>
                    <button
                        onClick={onToggleEncyclopedia}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[1.3vmin] font-bold transition-all border ${
                            (includeEncyclopedia || isSpeedMode)
                            ? 'bg-violet-100 border-violet-300 text-violet-700' 
                            : 'bg-slate-200 border-slate-300 text-slate-600'
                        }`}
                        title="開啟/關閉 百科辭典"
                    >
                        <span>📖</span> 百科
                    </button>
                </div>
            </div>

            <button
                onClick={onStartGame}
                className={`w-full py-[2vh] text-white text-[2.5vmin] font-bold rounded-2xl shadow-lg transform transition hover:scale-[1.02] active:scale-[0.98] border-2 flex items-center justify-center gap-2 ${
                    isUnderThreshold 
                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 border-amber-500/50' 
                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-green-500 hover:to-green-600 border-green-500/50'
                }`}
            >
                <span>{isUnderThreshold ? '🚧' : '🚀'}</span> {isUnderThreshold ? '仍要開始' : '啟動'}
            </button>

            {/* 💡 [Scope Warning] Enhanced with Verse Precision */}
            {(() => {
                if (selectedScope !== 'full' && isUnderThreshold && selectedBooks.length > 0) {
                    return (
                        <div className="w-full px-3 py-2 bg-amber-500/15 border border-amber-500/40 rounded-xl animate-fade-in shadow-inner">
                            <div className="flex items-start gap-2">
                                <span className="text-amber-500 text-[2vmin]">💡</span>
                                <div className="flex flex-col">
                                    <p className="text-amber-400 text-[1.4vmin] font-bold leading-tight">
                                        建議擴大範圍
                                    </p>
                                    <p className="text-amber-200/80 text-[1.2vmin] leading-tight mt-1">
                                        選擇經文少於系統合理出題數量，可能會有重複題意的情況發生，為避免降低遊戲體驗，建議增加經文範圍
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                }
                return null;
            })()}

            {/* Casual Mode Slider - Positioned below Start Button */}
            {isCasualMode && (
                <div className="w-full bg-white p-[1vh] rounded-xl border border-blue-500/30 animate-fade-in flex flex-col gap-1 items-center">
                    <span className="text-indigo-600 text-[1.5vmin] font-bold">題目數量: {questionCount}</span>
                    <input
                        type="range"
                        min="10"
                        max="50"
                        step="5"
                        value={questionCount}
                        onChange={(e) => onQuestionCountChange(parseInt(e.target.value))}
                        className="w-full h-[1vh] bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>
            )}

            <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-[1vh] flex flex-col overflow-hidden w-full">
                <div key={`${selectedScope}-${selectedBooks.length}`} className="flex-1 flex flex-col animate-fade-in">
                    {(() => {
                        // Helper to check if a specific category is fully selected
                        const isCategoryFullySelected = () => {
                            if (selectedScope === 'full') return false;
                            if (selectedScope === '舊約' || selectedScope === '新約') {
                                const totalBooks = selectedScope === '舊約' ? 39 : 27;
                                return selectedBooks.length === totalBooks;
                            }

                            // Check specific categories
                            let categoryBooks = [];
                            if (BIBLE_BOOKS['舊約'][selectedScope]) {
                                categoryBooks = BIBLE_BOOKS['舊約'][selectedScope];
                            } else if (BIBLE_BOOKS['新約'][selectedScope]) {
                                categoryBooks = BIBLE_BOOKS['新約'][selectedScope];
                            }

                            return categoryBooks.length > 0 && selectedBooks.length === categoryBooks.length;
                        };

                        const fullySelected = isCategoryFullySelected();

                        if (selectedScope === 'full') {
                            return (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center animate-pulse-green">
                                    <p className="text-[2vmin] mb-2">已選擇</p>
                                    <p className="text-[3vmin] font-bold text-orange-500 mb-2">整本</p>
                                    <p className="text-[1.5vmin] opacity-70">舊+新</p>
                                </div>
                            );
                        } else if (fullySelected) {
                            return (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center animate-pulse-green">
                                    <p className="text-[2vmin] mb-2">已選擇</p>
                                    <p className="text-[3vmin] font-bold text-indigo-600 mb-2">{selectedScope}</p>
                                    <p className="text-[1.5vmin] opacity-70">共{selectedBooks.length}卷</p>
                                </div>
                            );
                        } else if (selectedBooks.length === 0) {
                            return (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center">
                                    <p className="text-[2vmin]">請選擇<br />書卷</p>
                                </div>
                            );
                        } else {
                            return (
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                                    {selectedBooks.map((selection) => (
                                        <div key={selection.book} className="p-[1vh] bg-slate-50 rounded-lg group hover:bg-slate-100 transition animate-slide-in-right">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-slate-900 font-bold text-[1.8vmin] truncate max-w-[80%]">{selection.book}</span>
                                                <button
                                                    onClick={() => onToggleBook(selection.book)}
                                                    className="text-slate-500 hover:text-rose-600 transition"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1 text-sm flex-wrap justify-center">
                                                <select
                                                    value={selection.startChapter}
                                                    onChange={(e) => onUpdateChapterRange(selection.book, parseInt(e.target.value), Math.max(parseInt(e.target.value), selection.endChapter))}
                                                    className="bg-slate-100 rounded px-1 py-0.5 text-slate-900 w-12 text-[1.5vmin] font-bold cursor-pointer hover:bg-slate-200 transition"
                                                >
                                                    {Array.from({ length: BOOK_CHAPTERS[selection.book] }, (_, i) => i + 1).map(num => (
                                                        <option key={num} value={num}>{num}</option>
                                                    ))}
                                                </select>
                                                <span className="text-slate-500 text-[1.2vmin]">-</span>
                                                <select
                                                    value={selection.endChapter}
                                                    onChange={(e) => onUpdateChapterRange(selection.book, Math.min(parseInt(e.target.value), selection.startChapter), parseInt(e.target.value))}
                                                    className="bg-slate-100 rounded px-1 py-0.5 text-slate-900 w-12 text-[1.5vmin] font-bold cursor-pointer hover:bg-slate-200 transition"
                                                >
                                                    {Array.from({ length: BOOK_CHAPTERS[selection.book] }, (_, i) => i + 1).map(num => (
                                                        <option key={num} value={num}>{num}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        }
                    })()}
                </div>
            </div>
        </div>
    );
}
