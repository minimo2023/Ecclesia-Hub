import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import { BIBLE_BOOKS } from '../../data/constants';

const BOOK_SHORT_NAMES = {
    '創世記': '創', '出埃及記': '出', '利未記': '利', '民數記': '民', '申命記': '申',
    '約書亞記': '書', '士師記': '士', '路得記': '得', '撒母耳記上': '撒上', '撒母耳記下': '撒下',
    '列王紀上': '王上', '列王紀下': '王下', '歷代志上': '代上', '歷代志下': '代下', '以斯拉記': '拉',
    '尼希米記': '尼', '以斯帖記': '斯', '約伯記': '伯', '詩篇': '詩', '箴言': '箴',
    '傳道書': '傳', '雅歌': '歌', '以賽亞書': '賽', '耶利米書': '耶', '耶利米哀歌': '哀',
    '以西結書': '結', '但以理書': '但', '何西阿書': '何', '約珥書': '珥', '阿摩司書': '摩',
    '俄巴底亞書': '俄', '約拿書': '拿', '彌迦書': '彌', '那鴻書': '鴻', '哈巴谷書': '哈',
    '西番雅書': '番', '哈該書': '該', '撒迦利亞書': '亞', '瑪拉基書': '瑪',
    '馬太福音': '太', '馬可福音': '可', '路加福音': '路', '約翰福音': '約', '使徒行傳': '徒',
    '羅馬書': '羅', '哥林多前書': '林前', '哥林多後書': '林後', '加拉太書': '加', '以弗所書': '弗',
    '腓立比書': '腓', '歌羅西書': '西', '帖撒羅尼迦前書': '帖前', '帖撒羅尼迦後書': '帖後', '提摩太前書': '提前',
    '提摩太後書': '提後', '提多書': '多', '腓利門書': '門', '希伯來書': '來', '雅各書': '雅',
    '彼得前書': '彼前', '彼得後書': '彼後', '約翰一書': '約一', '約翰二書': '約二', '約翰三書': '約三',
    '猶大書': '猶', '啟示錄': '啟'
};

const TESTAMENTS = [
    { id: '舊約', label: '舊約聖經', count: 39 },
    { id: '新約', label: '新約聖經', count: 27 }
];

export default function ReadingPlanBookSelector({ selectedBooks, onChange, completedBooks = [], variant = 'mobile' }) {
    const desktop = variant === 'desktop';
    const [activeTestament, setActiveTestament] = useState(() => {
        const otBooks = Object.values(BIBLE_BOOKS['舊約']).flat();
        return selectedBooks.length > 0 && selectedBooks.every(book => !otBooks.includes(book)) ? '新約' : '舊約';
    });

    const booksByTestament = useMemo(() => ({
        '舊約': Object.values(BIBLE_BOOKS['舊約']).flat(),
        '新約': Object.values(BIBLE_BOOKS['新約']).flat()
    }), []);
    const allBooks = useMemo(() => [...booksByTestament['舊約'], ...booksByTestament['新約']], [booksByTestament]);
    const visibleBooks = booksByTestament[activeTestament];
    const visibleSelectedCount = visibleBooks.filter(book => selectedBooks.includes(book)).length;
    const isVisibleTestamentSelected = visibleBooks.every(book => selectedBooks.includes(book));
    const isAllSelected = allBooks.every(book => selectedBooks.includes(book));

    const toggleBook = bookName => {
        if (selectedBooks.includes(bookName)) {
            onChange(selectedBooks.filter(book => book !== bookName));
            return;
        }
        onChange([...selectedBooks, bookName]);
    };

    const toggleVisibleTestament = () => {
        if (isVisibleTestamentSelected) {
            onChange(selectedBooks.filter(book => !visibleBooks.includes(book)));
            return;
        }
        onChange(Array.from(new Set([...selectedBooks, ...visibleBooks])));
    };

    const toggleAllBooks = () => onChange(isAllSelected ? [] : allBooks);

    return (
        <section className="flex min-h-0 w-full flex-1 flex-col" aria-label="選擇讀經計畫書卷">
            <div className="shrink-0 rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-black text-slate-900 sm:text-base">選擇書卷</h3>
                    <p className="text-[10px] font-medium text-slate-500 sm:text-xs">可跨新舊約複選，不需選擇章節</p>
                </div>
                <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">
                    已選 {selectedBooks.length} 卷
                </span>
              </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="選擇新約或舊約">
                {TESTAMENTS.map(testament => {
                    const selectedCount = booksByTestament[testament.id].filter(book => selectedBooks.includes(book)).length;
                    return (
                        <button
                            key={testament.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTestament === testament.id}
                            onClick={() => setActiveTestament(testament.id)}
                            className={`min-h-9 rounded-lg px-2 py-1.5 text-xs font-black transition-all sm:text-sm ${activeTestament === testament.id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500'}`}
                        >
                            {testament.label}
                            <span className="ml-1 text-[10px] font-bold opacity-60">{selectedCount}/{testament.count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500">本頁 {visibleSelectedCount} 卷</span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={toggleVisibleTestament}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition ${isVisibleTestamentSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                    >
                        {isVisibleTestamentSelected ? `清除${activeTestament}` : `全選${activeTestament}`}
                    </button>
                    <button
                        type="button"
                        onClick={toggleAllBooks}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition ${isAllSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                    >
                        {isAllSelected ? '清除全部' : '全本聖經'}
                    </button>
                </div>
            </div>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-2xl bg-white p-2" style={{ WebkitOverflowScrolling: 'touch', scrollbarGutter: 'stable' }}>
              <div className={`${desktop ? 'grid-cols-4 xl:grid-cols-5' : 'grid-cols-5'} grid gap-2`} role="tabpanel" aria-label={`${activeTestament}書卷`}>
                {visibleBooks.map(book => {
                    const isSelected = selectedBooks.includes(book);
                    const isCompleted = completedBooks.includes(book);
                    return (
                        <button
                            key={book}
                            type="button"
                            onClick={() => toggleBook(book)}
                            aria-pressed={isSelected}
                            aria-label={`${isSelected ? '取消' : '選擇'}${book}${isCompleted ? '，曾完成閱讀' : ''}`}
                            title={book}
                            className={`relative flex min-h-10 items-center justify-center rounded-xl border px-1 py-1.5 font-black transition-colors ${desktop ? 'text-xs' : 'text-[13px]'} ${isSelected ? 'border-indigo-300 bg-indigo-100 text-indigo-800 shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-600 active:bg-slate-100'}`}
                        >
                            <span>{desktop ? book : (BOOK_SHORT_NAMES[book] || book)}</span>
                            {isSelected ? <Check className="absolute right-0.5 top-0.5 h-3 w-3" aria-hidden="true" /> : null}
                            {isCompleted && !isSelected ? <CheckCircle2 className="absolute right-0.5 top-0.5 h-3 w-3 text-emerald-500" aria-hidden="true" /> : null}
                        </button>
                    );
                })}
              </div>
            </div>
        </section>
    );
}
