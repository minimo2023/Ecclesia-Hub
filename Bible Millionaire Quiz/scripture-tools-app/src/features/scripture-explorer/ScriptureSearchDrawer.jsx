import { useEffect, useState } from 'react';
import { ArrowRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { searchScripture } from '../../api.js';
import { BIBLE_GROUPS, VERSIONS } from '../../data.js';

export function ScriptureSearchDrawer({ open, onClose, activeSelection, onNavigate }) {
    const [query, setQuery] = useState('');
    const [version, setVersion] = useState(activeSelection.version);
    const [book, setBook] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) setVersion(activeSelection.version);
    }, [activeSelection.version, open]);

    if (!open) return null;

    const submit = async event => {
        event.preventDefault();
        if ([...query.trim()].length < 2) {
            setError('請至少輸入 2 個字。');
            return;
        }
        setLoading(true);
        setError('');
        setSearched(false);
        try {
            setResults(await searchScripture({ query: query.trim(), version, book }));
            setSearched(true);
        } catch (searchError) {
            setResults([]);
            setError(searchError.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <aside className="explorer-drawer search-drawer" aria-labelledby="search-panel-title">
            <div className="explorer-drawer-heading">
                <div>
                    <span className="status-pill status-live">正式經文庫</span>
                    <h2 id="search-panel-title">搜尋經文</h2>
                </div>
                <button type="button" className="text-button icon-button" onClick={onClose} aria-label="關閉搜尋面板"><X size={20} /></button>
            </div>
            <form className="explorer-search-form" onSubmit={submit}>
                <div className="search-field"><Search size={19} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="例如：不要懼怕、恩典、曠野" maxLength={100} autoFocus /></div>
                <div className="explorer-search-filters">
                    <span><SlidersHorizontal size={15} /> 篩選</span>
                    <label>譯本<select value={version} onChange={event => setVersion(event.target.value)}>{VERSIONS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <label>書卷<select value={book} onChange={event => setBook(event.target.value)}><option value="">全部書卷</option>{BIBLE_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.books.map(([name]) => <option key={name}>{name}</option>)}</optgroup>)}</select></label>
                    <button className="primary-button" disabled={loading}>{loading ? '搜尋中…' : '搜尋'}</button>
                </div>
            </form>
            {error && <div className="notice notice-error" role="alert">{error}</div>}
            {searched && !results.length && <div className="empty-state compact-empty">沒有找到符合的經文。</div>}
            {results.length > 0 && (
                <div className="explorer-search-results" aria-live="polite">
                    <strong>找到 {results.length} 筆結果</strong>
                    {results.map(result => (
                        <button
                            type="button"
                            className="explorer-search-result"
                            key={result.id || `${result.book}-${result.chapter}-${result.verse}`}
                            onClick={() => onNavigate({ version, book: result.bookName || result.book, chapter: result.chapter, verse: result.verse })}
                        >
                            <span>{result.bookName || result.book} {result.chapter}:{result.verse}</span>
                            {(result.sectionHeadings || []).map((heading, index) => <small className="search-result-heading" key={`${result.id}-heading-${index}`}>{heading}</small>)}
                            <p>{result.text}</p>
                            <ArrowRight size={17} />
                        </button>
                    ))}
                </div>
            )}
        </aside>
    );
}
