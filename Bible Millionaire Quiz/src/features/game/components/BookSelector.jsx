import React from 'react';
import { BIBLE_BOOKS } from '../data/constants';

export default function BookSelector({
    showBookPanel,
    selectedScope,
    availableBooks,
    isBookSelected,
    onToggleBook,
    onSelectAll,
    onClearAll,
    allCategories,
    selectedBooks,
    gameMode
}) {
    // Helper: Get categories for current testament
    const getCurrentCategories = () => {
        if (selectedScope === '舊約' || selectedScope === '新約') {
            return allCategories.filter(c => c.testament === selectedScope);
        }
        return [];
    };

    // Helper: Check if all books in a category are selected
    const isCategoryFullySelected = (categoryName) => {
        // Get books for this category from BIBLE_BOOKS
        let categoryBooks = [];
        if (BIBLE_BOOKS['舊約'][categoryName]) {
            categoryBooks = BIBLE_BOOKS['舊約'][categoryName];
        } else if (BIBLE_BOOKS['新約'][categoryName]) {
            categoryBooks = BIBLE_BOOKS['新約'][categoryName];
        }

        if (categoryBooks.length === 0) return false;
        return categoryBooks.every(book => isBookSelected(book));
    };

    // Helper: Toggle all books in a category
    const handleCategoryToggle = (categoryName) => {
        // Get books for this category from BIBLE_BOOKS
        let categoryBooks = [];
        if (BIBLE_BOOKS['舊約'][categoryName]) {
            categoryBooks = BIBLE_BOOKS['舊約'][categoryName];
        } else if (BIBLE_BOOKS['新約'][categoryName]) {
            categoryBooks = BIBLE_BOOKS['新約'][categoryName];
        }

        if (categoryBooks.length === 0) return;

        const allSelected = isCategoryFullySelected(categoryName);
        categoryBooks.forEach(book => {
            const isCurrentlySelected = isBookSelected(book);
            if (allSelected && isCurrentlySelected) {
                // Deselect all
                onToggleBook(book);
            } else if (!allSelected && !isCurrentlySelected) {
                // Select all
                onToggleBook(book);
            }
        });
    };

    const categories = getCurrentCategories();
    const showCategories = categories.length > 0;

    // (Removed Infinite Mode toggle logic)

    return (
        <div className={`bg-white/90 rounded-2xl border backdrop-blur-md overflow-hidden flex flex-col transition-all duration-700 h-full ${showBookPanel
            ? 'opacity-100 border-slate-200 mx-2 flex-1'
            : 'opacity-0 border-transparent max-w-0 mx-0 pointer-events-none'
            }`} style={{
                width: showBookPanel ? '100%' : '0px',
                minWidth: showBookPanel ? '280px' : '0px'
            }}>
            <div className="h-full flex flex-col p-[2vh] min-w-[300px]">
                <div className="flex justify-between items-center mb-[2vh] border-b border-slate-200 pb-[2vh] flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                        <h3 className="text-[3vmin] font-bold text-orange-500 truncate max-w-[200px]" title={selectedScope}>
                            {selectedScope}
                        </h3>
                    </div>
                    <div className="flex gap-[1vw] flex-shrink-0 items-center">

                        <button
                            onClick={onSelectAll}
                            className="px-[1.5vw] py-[0.8vh] bg-slate-100 hover:bg-slate-100 rounded-lg text-[1.8vmin] font-bold transition whitespace-nowrap"
                        >
                            全選
                        </button>
                        <button
                            onClick={onClearAll}
                            className="text-[1.8vmin] text-slate-500 hover:text-slate-900 transition"
                        >
                            取消
                        </button>
                    </div>
                </div>



                {/* Animated Content Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    <div key={selectedScope} className="animate-fade-in space-y-[2vh]">
                        {showCategories && (
                            // Category Quick-Select Buttons (above books)
                            <div>
                                <h4 className="text-[2vmin] font-bold text-slate-700 mb-[1vh] px-1">類別快選</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1.5vh]">
                                    {categories.map(category => {
                                        const fullySelected = isCategoryFullySelected(category.name);
                                        return (
                                            <button
                                                key={category.name}
                                                onClick={() => handleCategoryToggle(category.name)}
                                                className={`
                                                    py-[1.5vh] px-[1vw] rounded-xl text-[2vmin] font-bold transition-all duration-200 
                                                    h-auto min-h-[5vh] flex items-center justify-center text-center whitespace-normal break-words leading-tight
                                                    ${fullySelected
                                                        ? 'bg-green-600 text-slate-900 shadow-md ring-2 ring-green-400'
                                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-slate-300'
                                                    }
                                                `}
                                                title={`快選：${category.name}`}
                                            >
                                                {category.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Book Buttons */}
                        <div>
                            {showCategories && <h4 className="text-[2vmin] font-bold text-slate-700 mb-[1vh] px-1">選擇經卷</h4>}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-[1.5vh]">
                                {availableBooks.map(book => {
                                    const selected = isBookSelected(book);
                                    return (
                                        <button
                                            key={book}
                                            onClick={() => onToggleBook(book)}
                                            className={`
                                                py-[2vh] px-[1vw] rounded-xl text-[2.2vmin] font-bold transition-all duration-200 
                                                h-auto min-h-[6vh] flex items-center justify-center text-center whitespace-normal break-words leading-tight
                                                ${selected
                                                    ? 'bg-blue-600 text-slate-900 shadow-md ring-2 ring-blue-400 scale-105'
                                                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                                }
                                            `}
                                            title={book}
                                        >
                                            {book}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
