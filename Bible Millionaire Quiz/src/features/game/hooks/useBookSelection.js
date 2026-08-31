import { useState, useMemo } from 'react';
import { BIBLE_BOOKS, BOOK_CHAPTERS } from '../data/constants';

/**
 * Custom hook for managing book selection logic
 */
const SCOPE_KEY = 'bible_book_selection_scope';
const BOOKS_KEY = 'bible_book_selection_books';

export function useBookSelection() {
    const [selectedScope, setSelectedScope] = useState(() => {
        try {
            const saved = sessionStorage.getItem(SCOPE_KEY);
            // 授權的 scope 値：full, 舊約, 新約, 或各類別名（移除舊版 custom）
            return (saved && saved !== 'custom') ? saved : 'full';
        } catch { return 'full'; }
    });
    const [selectedBooks, setSelectedBooks] = useState(() => {
        try {
            const saved = sessionStorage.getItem(BOOKS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [showBookPanel, setShowBookPanel] = useState(() => {
        try {
            const scope = sessionStorage.getItem(SCOPE_KEY) || 'full';
            return scope !== 'full';
        } catch { return false; }
    });

    // Helper to get all categories
    const allCategories = useMemo(() => {
        const categories = [];
        Object.entries(BIBLE_BOOKS).forEach(([testament, cats]) => {
            Object.keys(cats).forEach(cat => categories.push({ name: cat, testament }));
        });
        return categories;
    }, []);

    // Helper to get books for the current scope
    const availableBooks = useMemo(() => {
        if (selectedScope === 'full') {
            // For 'full' or 'custom', return all books
            let books = [];
            Object.values(BIBLE_BOOKS).forEach(testament => {
                Object.values(testament).forEach(catBooks => {
                    books = [...books, ...catBooks];
                });
            });
            return books;
        } else if (selectedScope === '舊約' || selectedScope === '新約') {
            let books = [];
            if (BIBLE_BOOKS[selectedScope]) {
                Object.values(BIBLE_BOOKS[selectedScope]).forEach(catBooks => {
                    books = [...books, ...catBooks];
                });
            }
            return books;
        } else {
            // Specific category
            let foundBooks = [];
            Object.values(BIBLE_BOOKS).forEach(testament => {
                if (testament[selectedScope]) {
                    foundBooks = testament[selectedScope];
                }
            });
            return foundBooks;
        }
    }, [selectedScope]);

    // Handle Scope Selection
    const handleScopeSelect = (scope) => {
        if (scope === 'full') {
            setSelectedScope('full');
            setShowBookPanel(false);
            try { sessionStorage.setItem(SCOPE_KEY, 'full'); } catch {}
        } else {
            setSelectedScope(scope);
            setShowBookPanel(true);
            try { sessionStorage.setItem(SCOPE_KEY, scope); } catch {}
        }
    };

    const toggleBook = (bookName) => {
        setSelectedBooks(prev => {
            const existing = prev.find(b => b.book === bookName);
            let next;
            if (existing) {
                next = prev.filter(b => b.book !== bookName);
            } else {
                const maxChapters = BOOK_CHAPTERS[bookName] || 1;
                next = [...prev, { book: bookName, startChapter: 1, endChapter: maxChapters }];
            }
            try { sessionStorage.setItem(BOOKS_KEY, JSON.stringify(next)); } catch {}
            return next;
        });
    };

    const selectAllInScope = () => {
        setSelectedBooks(prev => {
            const newBooks = [...prev];
            availableBooks.forEach(book => {
                if (!newBooks.find(b => b.book === book)) {
                    newBooks.push({ book, startChapter: 1, endChapter: BOOK_CHAPTERS[book] || 1 });
                }
            });
            try { sessionStorage.setItem(BOOKS_KEY, JSON.stringify(newBooks)); } catch {}
            return newBooks;
        });
    };

    const clearAllInScope = () => {
        setSelectedBooks(prev => {
            const next = prev.filter(b => !availableBooks.includes(b.book));
            try { sessionStorage.setItem(BOOKS_KEY, JSON.stringify(next)); } catch {}
            return next;
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

    // Helper to get final book list for game start
    const getSelectedBooksForGame = () => {
        let bookSelections = [];

        if (selectedScope === 'full') {
            // If full scope is selected but user hasn't manually selected specific books (which is the default for 'full'),
            // we return all books.
            // However, the logic in StartScreen checks if selectedBooks.length === 0 for non-full scopes.
            // For 'full', we usually assume "All books".

            // Wait, if selectedScope is 'full', showBookPanel is false, so selectedBooks might be empty.
            // If selectedBooks is empty and scope is full, we return ALL books.
            if (selectedBooks.length === 0) {
                Object.values(BIBLE_BOOKS).forEach(testament => {
                    Object.values(testament).forEach(books => {
                        books.forEach(book => {
                            const maxChapters = BOOK_CHAPTERS[book] || 1;
                            bookSelections.push({
                                book: book,
                                startChapter: 1,
                                endChapter: maxChapters
                            });
                        });
                    });
                });
            } else {
                bookSelections = selectedBooks;
            }
        } else {
            bookSelections = selectedBooks;
        }

        return bookSelections;
    };

    return {
        selectedScope,
        selectedBooks,
        showBookPanel,
        availableBooks, // New export
        allCategories,  // New export
        handleScopeSelect,
        toggleBook,
        selectAllInScope,
        clearAllInScope,
        updateBookChapterRange,
        isBookSelected,
        getSelectedBooksForGame
    };
}
