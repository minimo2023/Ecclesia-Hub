import { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { BIBLE_GROUPS, VERSIONS } from '../data.js';
import { searchScripture } from '../api.js';

export function SearchPage() {
    const [query, setQuery] = useState('');
    const [version, setVersion] = useState('CUV_TRAD');
    const [book, setBook] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);

    const submit = async event => {
        event.preventDefault();
        if ([...query.trim()].length < 2) { setError('請至少輸入 2 個字。'); return; }
        setLoading(true); setError(''); setSearched(false);
        try { setResults(await searchScripture({ query: query.trim(), version, book })); setSearched(true); }
        catch (searchError) { setResults([]); setError(searchError.message); }
        finally { setLoading(false); }
    };

    return (
        <AppShell title="經文搜尋" eyebrow="經文工具・零 AI 搜尋">
            <p className="page-intro">直接搜尋正式經文庫。結果不是 AI 生成，不消耗模型額度或智匯點數。</p>
            <form className="search-panel" onSubmit={submit}>
                <div className="search-field"><Search size={20} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="例如：不要懼怕、恩典、曠野" maxLength={100} /></div>
                <div className="search-filters">
                    <span><SlidersHorizontal size={16} /> 篩選</span>
                    <label>譯本<select value={version} onChange={e => setVersion(e.target.value)}>{VERSIONS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <label>書卷<select value={book} onChange={e => setBook(e.target.value)}><option value="">全部書卷</option>{BIBLE_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.books.map(([name]) => <option key={name}>{name}</option>)}</optgroup>)}</select></label>
                    <button className="primary-button" disabled={loading}>{loading ? '搜尋中…' : '搜尋經文'}</button>
                </div>
            </form>
            {error && <div className="notice notice-error">{error}</div>}
            {searched && !results.length && <div className="empty-state">沒有找到符合的經文，可以縮短關鍵字或改選全部書卷。</div>}
            {results.length > 0 && <section className="results-list" aria-live="polite">
                <div className="results-heading"><strong>找到 {results.length} 筆結果</strong><span>最多顯示 30 筆</span></div>
                {results.map(result => <article className="result-card" key={result.id || `${result.book}-${result.chapter}-${result.verse}`}>
                    <div className="result-reference">{result.bookName || result.book} {result.chapter}:{result.verse}</div>
                    <p>{result.text}</p>
                    <small>{result.versionName || result.version}</small>
                </article>)}
            </section>}
        </AppShell>
    );
}
