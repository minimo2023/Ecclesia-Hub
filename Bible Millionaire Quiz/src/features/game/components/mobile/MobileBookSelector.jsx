import React, { useState, useMemo, useRef } from 'react';
import { BIBLE_BOOKS, BOOK_SHORT_NAMES } from '../../data/constants';

export default function MobileBookSelector({
    availableBooks = [],
    isBookSelected,
    selectedBooks,
    onToggleBook,
    onClearAll,
    onProceed,
    variant = 'default'
}) {
    const isLandscape = variant === 'landscape-left';
    const [activeMainTab, setActiveMainTab] = useState('old');
    const scrollRef = useRef(null);

    const safeAvailableBooks = Array.isArray(availableBooks) ? availableBooks : [];

    const displayCategories = useMemo(() => ({
        old: [
            { id: 'law', name: '五經', books: BIBLE_BOOKS['舊約']['摩西五經'] },
            { id: 'history', name: '歷史', books: BIBLE_BOOKS['舊約']['歷史書'] },
            { id: 'wisdom', name: '智慧', books: BIBLE_BOOKS['舊約']['智慧書'] },
            { id: 'prophets', name: '先知', books: BIBLE_BOOKS['舊約']['先知書'] }
        ],
        new: [
            { id: 'gospels', name: '福音', books: BIBLE_BOOKS['新約']['福音書(含使徒行傳)'].slice(0, 5) },
            { id: 'paul', name: '保羅', books: BIBLE_BOOKS['新約']['保羅書信'] },
            { id: 'epistles', name: '書信', books: BIBLE_BOOKS['新約']['其他書信'] }
        ]
    }), []);

    const currentCategories = activeMainTab === 'old' ? displayCategories.old : displayCategories.new;
    const selectedCount = selectedBooks.length;

    const isCategorySelected = (categoryBooks) => {
        const availableInCat = categoryBooks.filter(b => safeAvailableBooks.includes(b));
        return availableInCat.length > 0 && availableInCat.every(b => isBookSelected(b));
    };

    const handleToggleCategory = (categoryBooks) => {
        const availableInCat = categoryBooks.filter(b => safeAvailableBooks.includes(b));
        const allSelected = availableInCat.every(b => isBookSelected(b));
        availableInCat.forEach(book => {
            if (allSelected) { if (isBookSelected(book)) onToggleBook(book); }
            else { if (!isBookSelected(book)) onToggleBook(book); }
        });
        // 捲動到該分類的第一本書
        if (availableInCat.length > 0 && scrollRef.current) {
            const firstBook = availableInCat[0];
            const el = scrollRef.current.querySelector(`[data-book="${firstBook}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div className={`flex flex-col h-full bg-slate-900 ${isLandscape ? 'p-0' : 'p-4'}`}>
            {!isLandscape && (
                <div className="shrink-0 pb-3 border-b border-slate-700 mb-4">
                    <h2 className="text-xl font-bold text-center text-white mb-4">選擇出題範圍</h2>
                </div>
            )}

            {/* Main Tabs (Old/New Testament) */}
            <div className="mb-3 grid shrink-0 grid-cols-2 gap-2">
                {['old', 'new'].map(id => (
                    <button
                        key={id}
                        onClick={() => setActiveMainTab(id)}
                        className={`min-h-11 rounded-xl px-3 py-2 text-sm font-black transition-all ${activeMainTab === id ? 'bg-yellow-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400'}`}
                    >
                        {id === 'old' ? '舊約聖經' : '新約聖經'}
                    </button>
                ))}
            </div>

            {/* Category Quick Filters */}
            <div className="mb-3 flex shrink-0 gap-1 sm:mb-4">
                <button
                    onClick={() => {
                        const allBooksInTab = currentCategories.flatMap(c => c.books).filter(b => safeAvailableBooks.includes(b));
                        const allSelected = allBooksInTab.every(b => isBookSelected(b));
                        allBooksInTab.forEach(book => {
                            if (allSelected) { if (isBookSelected(book)) onToggleBook(book); }
                            else { if (!isBookSelected(book)) onToggleBook(book); }
                        });
                    }}
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-0.5 py-1.5 text-[10px] font-bold leading-tight text-blue-400"
                >
                    全選／取消
                </button>
                {currentCategories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => handleToggleCategory(cat.books)}
                        className={`min-h-10 min-w-0 flex-1 rounded-lg border px-0.5 py-1.5 text-[10px] font-bold leading-tight transition-all ${isCategorySelected(cat.books) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                    >
                        {cat.name}
                    </button>
                ))}
                <button
                    onClick={onClearAll}
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-red-800/50 bg-red-900/40 px-0.5 py-1.5 text-[10px] font-bold leading-tight text-red-400"
                >
                    清除全部
                </button>
            </div>

            {/* Book Scroll Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <div className="grid grid-cols-5 gap-1.5">
                    {currentCategories.flatMap(cat => cat.books)
                        .filter(book => safeAvailableBooks.includes(book))
                        .map(book => {
                            const selected = isBookSelected(book);
                            return (
                                <button
                                    key={book}
                                    data-book={book}
                                    onClick={() => onToggleBook(book)}
                                    aria-label={book}
                                    title={book}
                                    className={`min-h-10 rounded-xl border-2 px-1 py-1.5 text-center text-[13px] font-black leading-tight transition-all ${selected ? 'bg-yellow-600/20 border-yellow-500 text-yellow-400 shadow-lg' : 'bg-slate-800/40 border-slate-700 text-slate-400'}`}
                                >
                                    <span aria-hidden="true">{BOOK_SHORT_NAMES[book] || book}</span>
                                </button>
                            );
                        })
                    }
                </div>
            </div>

            {!isLandscape && (
                <div className="shrink-0 pt-4 mt-auto">
                    <button
                        onClick={onProceed}
                        disabled={selectedCount === 0}
                        className={`w-full py-4 rounded-2xl text-xl font-bold shadow-xl ${selectedCount === 0 ? 'bg-slate-800 text-slate-600' : 'bg-green-600 text-white'}`}
                    >
                        開始遊戲 ({selectedCount})
                    </button>
                </div>
            )}
        </div>
    );
}
