import React, { useState } from 'react';
import { BIBLE_BOOKS, BOOK_CHAPTERS } from '../../data/constants';
import { questionService } from '../../services/questions';
import { Zap, Loader2, Trash2 } from 'lucide-react';

export default function ManualGeneration() {
    const [selectedTestament, setSelectedTestament] = useState('舊約');
    const [selectedBooks, setSelectedBooks] = useState([]); // Array of { book, startChapter, endChapter }
    const [quantity, setQuantity] = useState(10);
    const [difficulties, setDifficulties] = useState({
        easy: true,
        medium: true,
        hard: true
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [logs, setLogs] = useState([]);
    const [progress, setProgress] = useState(0);

    const addLog = (message, type = 'info') => {
        setLogs(prev => [...prev, { message, type, time: new Date().toLocaleTimeString() }]);
    };

    const toggleBook = (bookName) => {
        setSelectedBooks(prev => {
            const existing = prev.find(b => b.book === bookName);
            if (existing) {
                return prev.filter(b => b.book !== bookName);
            } else {
                const maxChapters = BOOK_CHAPTERS[bookName] || 1;
                return [...prev, {
                    book: bookName,
                    startChapter: 1,
                    endChapter: maxChapters
                }];
            }
        });
    };

    const updateBookChapterRange = (bookName, startChapter, endChapter) => {
        setSelectedBooks(prev => prev.map(b =>
            b.book === bookName
                ? { ...b, startChapter, endChapter }
                : b
        ));
    };

    const isBookSelected = (bookName) => {
        return selectedBooks.some(b => b.book === bookName);
    };

    const handleGenerate = async () => {
        if (selectedBooks.length === 0) {
            alert('請至少選擇一卷書！');
            return;
        }
        if (!difficulties.easy && !difficulties.medium && !difficulties.hard) {
            alert('請至少選擇一種難度！');
            return;
        }

        setIsGenerating(true);
        setLogs([]);
        setProgress(0);
        setProgress(0);
        console.log("Starting generation process..."); // Debug log
        addLog(`開始生成任務：共 ${selectedBooks.length} 卷書`, 'info');

        try {
            const selectedDiffs = Object.keys(difficulties).filter(d => difficulties[d]);
            const totalRequests = selectedBooks.length * selectedDiffs.length;
            const countPerRequest = Math.max(1, Math.ceil(quantity / totalRequests));

            let completedRequests = 0;
            let totalSaved = 0;

            for (const bookSel of selectedBooks) {
                for (const diff of selectedDiffs) {
                    addLog(`正在生成 ${bookSel.book} (${bookSel.startChapter}-${bookSel.endChapter}章) - ${diff}...`, 'info');

                    const questions = await questionService.generateBatch(
                        [bookSel],
                        diff,
                        countPerRequest
                    );

                    if (questions.length > 0) {
                        const result = await questionService.saveGeneratedQuestions(questions);
                        addLog(`[${bookSel.book}] 新增 ${result.saved} 題，重複 ${result.duplicates} 題`, result.saved > 0 ? 'success' : 'warning');
                        totalSaved += result.saved;
                    } else {
                        addLog(`[${bookSel.book}] ${diff} 生成失敗或是空的`, 'error');
                    }

                    completedRequests++;
                    setProgress((completedRequests / totalRequests) * 100);
                }
            }

            addLog(`任務完成！共新增 ${totalSaved} 題有效題目。`, 'success');

        } catch (error) {
            console.error(error);
            addLog(`發生錯誤：${error.message}`, 'error');
        } finally {
            setIsGenerating(false);
            setProgress(100);
        }
    };

    return (
        <div className="p-4 text-white h-full flex flex-col gap-4">
            {/* Top Controls: Compact Bar */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-300 text-sm">範圍：</span>
                    <select
                        value={selectedTestament}
                        onChange={(e) => setSelectedTestament(e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm"
                    >
                        <option value="舊約">舊約</option>
                        <option value="新約">新約</option>
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-300 text-sm">總數：</span>
                    <input
                        type="number"
                        min="1"
                        max="100"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value))}
                        className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm"
                    />
                </div>

                <div className="flex items-center gap-3 border-l border-slate-600 pl-3">
                    {['easy', 'medium', 'hard'].map(diff => (
                        <label key={diff} className="flex items-center gap-1 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={difficulties[diff]}
                                onChange={(e) => setDifficulties(prev => ({ ...prev, [diff]: e.target.checked }))}
                                className="w-3 h-3 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                            />
                            <span className="capitalize text-xs text-slate-300">{diff}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-hidden">
                {/* Left: Compact Book List */}
                <div className="bg-slate-800/30 rounded-lg border border-slate-700 flex flex-col overflow-hidden">
                    <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700 font-bold text-slate-300 text-sm">
                        書卷列表 (勾選以加入)
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {Object.entries(BIBLE_BOOKS[selectedTestament]).map(([category, books]) => (
                                <React.Fragment key={category}>
                                    {books.map(book => {
                                        const selected = isBookSelected(book);
                                        return (
                                            <label
                                                key={book}
                                                className={`
                                                    flex items-center gap-2 p-2 rounded cursor-pointer border transition-all
                                                    ${selected
                                                        ? 'bg-blue-900/20 border-blue-500/50'
                                                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-700'
                                                    }
                                                `}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleBook(book)}
                                                    className="w-3 h-3 rounded border-slate-500 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                                />
                                                <span className={`text-xs truncate ${selected ? 'text-blue-300 font-bold' : 'text-slate-400'}`}>
                                                    {book}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Selected & Logs */}
                <div className="flex flex-col gap-4 overflow-hidden">
                    {/* Selected Books Config */}
                    <div className="flex-1 bg-slate-800/30 rounded-lg border border-slate-700 flex flex-col overflow-hidden min-h-[200px]">
                        <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700 font-bold text-slate-300 text-sm flex justify-between items-center">
                            <span>已選書卷設定</span>
                            <span className="text-xs bg-blue-900 px-2 py-0.5 rounded text-blue-300">
                                {selectedBooks.length} 卷
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {selectedBooks.length === 0 && (
                                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                                    請從左側勾選書卷
                                </div>
                            )}
                            {selectedBooks.map((selection) => (
                                <div key={selection.book} className="flex items-center gap-2 p-1.5 bg-slate-700/30 rounded border border-slate-700">
                                    <span className="font-bold text-blue-300 text-xs w-20 truncate">{selection.book}</span>
                                    <div className="flex items-center gap-1 text-xs flex-1">
                                        <input
                                            type="number"
                                            min="1"
                                            max={BOOK_CHAPTERS[selection.book]}
                                            value={selection.startChapter}
                                            onChange={(e) => updateBookChapterRange(selection.book, parseInt(e.target.value), Math.max(parseInt(e.target.value), selection.endChapter))}
                                            className="w-10 bg-slate-900 border border-slate-600 rounded px-1 text-center"
                                        />
                                        <span className="text-slate-500">-</span>
                                        <input
                                            type="number"
                                            min={selection.startChapter}
                                            max={BOOK_CHAPTERS[selection.book]}
                                            value={selection.endChapter}
                                            onChange={(e) => updateBookChapterRange(selection.book, Math.min(parseInt(e.target.value), selection.startChapter), parseInt(e.target.value))}
                                            className="w-10 bg-slate-900 border border-slate-600 rounded px-1 text-center"
                                        />
                                        <span className="text-[10px] text-slate-500">
                                            (Max: {BOOK_CHAPTERS[selection.book]})
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => toggleBook(selection.book)}
                                        className="text-slate-500 hover:text-red-400 p-1"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Generation Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || selectedBooks.length === 0}
                        className={`w-full py-3 rounded-lg font-bold transition flex items-center justify-center gap-2 text-sm ${isGenerating || selectedBooks.length === 0
                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                            }`}
                    >
                        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                        {isGenerating ? '正在生成題目...' : '開始生成題目'}
                    </button>

                    {/* Logs */}
                    <div className="h-40 bg-black/30 rounded-lg border border-slate-800 p-3 flex flex-col">
                        <div className="text-xs font-bold text-slate-500 mb-1 flex justify-between">
                            <span>執行日誌</span>
                            {isGenerating && <span className="text-blue-400">{Math.round(progress)}%</span>}
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-0.5 font-mono text-[10px] custom-scrollbar">
                            {logs.map((log, index) => (
                                <div key={index} className={`flex gap-2 ${log.type === 'error' ? 'text-red-400' :
                                    log.type === 'success' ? 'text-green-400' :
                                        log.type === 'warning' ? 'text-yellow-400' : 'text-slate-400'
                                    }`}>
                                    <span>[{log.time}]</span>
                                    <span>{log.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
