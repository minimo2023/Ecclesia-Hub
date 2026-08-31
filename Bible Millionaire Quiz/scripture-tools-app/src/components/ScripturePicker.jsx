import { useEffect, useState } from 'react';
import { BIBLE_GROUPS, CHAPTER_COUNTS, VERSIONS } from '../data.js';

export function ScripturePicker({ value, onChange, onLoad, loading, submitLabel = '載入經文' }) {
    const [draft, setDraft] = useState(value);

    useEffect(() => setDraft(value), [value]);

    const update = patch => {
        const next = { ...draft, ...patch };
        if (patch.book) next.chapter = 1;
        setDraft(next);
        onChange?.(next);
    };

    return (
        <form className="picker-card" onSubmit={event => { event.preventDefault(); onLoad?.(draft); }}>
            <label>譯本
                <select value={draft.version} onChange={e => update({ version: e.target.value })}>
                    {VERSIONS.map(version => <option key={version.id} value={version.id}>{version.name}</option>)}
                </select>
            </label>
            <label>書卷
                <select value={draft.book} onChange={e => update({ book: e.target.value })}>
                    {BIBLE_GROUPS.map(group => (
                        <optgroup key={group.label} label={group.label}>
                            {group.books.map(([book]) => <option key={book}>{book}</option>)}
                        </optgroup>
                    ))}
                </select>
            </label>
            <label>章
                <select value={draft.chapter} onChange={e => update({ chapter: Number(e.target.value) })}>
                    {Array.from({ length: CHAPTER_COUNTS[draft.book] || 1 }, (_, index) => (
                        <option key={index + 1} value={index + 1}>{index + 1}</option>
                    ))}
                </select>
            </label>
            <button className="primary-button" disabled={loading}>{loading ? '載入中…' : submitLabel}</button>
        </form>
    );
}
