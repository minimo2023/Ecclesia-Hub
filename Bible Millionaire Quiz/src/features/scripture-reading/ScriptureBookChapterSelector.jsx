import React from 'react';
import { ChevronDown } from 'lucide-react';

const TESTAMENTS = [
    { id: 'old', label: '舊約聖經', count: 39 },
    { id: 'new', label: '新約聖經', count: 27 }
];

function chunkBooks(books, size) {
    return Array.from({ length: Math.ceil(books.length / size) }, (_, index) => (
        books.slice(index * size, index * size + size)
    ));
}

export default function ScriptureBookChapterSelector({
    books,
    activeTestament,
    expandedBook,
    currentBook,
    currentChapter,
    onTestamentChange,
    onBookToggle,
    onChapterSelect,
    variant = 'desktop'
}) {
    const desktop = variant === 'desktop';
    const visibleBooks = books[activeTestament] || [];
    const booksPerRow = desktop ? 4 : 5;

    return (
        <div className={desktop ? 'mx-auto w-full max-w-6xl' : 'w-full'}>
            <div className={`${desktop ? 'mx-auto max-w-2xl' : ''} mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5`} role="tablist" aria-label="選擇新約或舊約">
                {TESTAMENTS.map(testament => (
                    <button
                        key={testament.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTestament === testament.id}
                        onClick={() => onTestamentChange(testament.id)}
                        className={`min-h-12 rounded-xl px-3 py-2.5 text-[15px] font-black leading-none transition-all sm:min-h-[52px] sm:text-base ${activeTestament === testament.id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        {testament.label}<span className="ml-1.5 text-xs font-bold opacity-65 sm:text-[13px]">{testament.count}卷</span>
                    </button>
                ))}
            </div>

            <div className="space-y-2" role="tabpanel">
                {chunkBooks(visibleBooks, booksPerRow).map(row => {
                    const expandedInRow = row.find(book => expandedBook?.code === book.code);
                    return (
                        <React.Fragment key={row[0].code}>
                            <div className={desktop ? 'grid grid-cols-4 gap-2' : 'grid grid-cols-5 gap-2'}>
                                {row.map(book => {
                                    const expanded = expandedBook?.code === book.code;
                                    const current = currentBook?.code === book.code;
                                    return (
                                        <button
                                            key={book.code}
                                            type="button"
                                            title={book.name}
                                            onClick={() => onBookToggle(book)}
                                            aria-expanded={expanded}
                                            className={`flex min-h-12 min-w-0 items-center justify-center rounded-xl border py-2.5 font-black leading-none transition-colors ${desktop ? 'gap-1.5 px-2 text-[15px]' : 'gap-1 px-1 text-sm'} ${expanded ? 'border-indigo-300 bg-indigo-100 text-indigo-800 shadow-sm' : current ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100'}`}
                                        >
                                            <span className={desktop ? 'whitespace-nowrap' : 'truncate'}>{desktop ? book.name : book.code}</span>
                                            <ChevronDown className={`${desktop ? 'h-[17px] w-[17px]' : 'h-4 w-4'} shrink-0 stroke-[2.25] text-slate-500 transition-transform ${expanded ? 'rotate-180 text-indigo-600' : ''}`} />
                                        </button>
                                    );
                                })}
                            </div>

                            {expandedInRow ? (
                                <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3.5 shadow-inner sm:p-4" aria-label={`選擇${expandedInRow.name}章節`}>
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <strong className="text-base text-indigo-950">{expandedInRow.name}</strong>
                                        <span className="text-sm font-bold text-indigo-600">選擇章節</span>
                                    </div>
                                    <div className={`${desktop ? 'grid-cols-10' : 'grid-cols-5'} grid max-h-56 gap-2 overflow-y-auto pr-1`}>
                                        {Array.from({ length: expandedInRow.chapters }, (_, index) => {
                                            const chapter = index + 1;
                                            const current = currentBook?.code === expandedInRow.code && currentChapter === chapter;
                                            return (
                                                <button
                                                    type="button"
                                                    key={chapter}
                                                    onClick={() => onChapterSelect(expandedInRow, chapter)}
                                                    aria-current={current ? 'true' : undefined}
                                                    className={`flex min-h-12 items-center justify-center rounded-xl text-base font-black transition-colors ${current ? 'bg-indigo-600 text-white shadow-md' : 'border border-indigo-200 bg-white text-slate-800 hover:bg-indigo-100 active:bg-indigo-100'}`}
                                                >
                                                    {chapter}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ) : null}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
