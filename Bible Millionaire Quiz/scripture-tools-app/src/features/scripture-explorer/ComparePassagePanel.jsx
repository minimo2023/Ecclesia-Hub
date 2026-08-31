import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchChapter } from '../../api.js';
import { VERSIONS } from '../../data.js';
import { PassageDisplay } from '../../components/PassageDisplay.jsx';

export function ComparePassagePanel({ open, selection, focusVerse, onClose }) {
    const alternatives = VERSIONS.filter(version => version.id !== selection.version);
    const [version, setVersion] = useState(alternatives[0]?.id || 'CNV_TRAD');
    const [passage, setPassage] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (version === selection.version) setVersion(alternatives[0]?.id || '');
    }, [alternatives, selection.version, version]);

    useEffect(() => {
        if (!open || !version || version === selection.version) return undefined;
        let cancelled = false;
        setLoading(true);
        setError('');
        fetchChapter({ ...selection, version })
            .then(data => { if (!cancelled) setPassage(data); })
            .catch(loadError => { if (!cancelled) { setPassage([]); setError(loadError.message); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, selection.book, selection.chapter, selection.version, version]);

    if (!open) return null;
    const versionName = VERSIONS.find(item => item.id === version)?.name || version;
    return (
        <section className="explorer-compare-column" aria-label="比較譯本">
            <div className="explorer-compare-toolbar">
                <label>比較譯本
                    <select value={version} onChange={event => setVersion(event.target.value)}>
                        {alternatives.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </label>
                <button type="button" className="text-button icon-button" onClick={onClose} aria-label="關閉譯本比較"><X size={19} /></button>
            </div>
            {error && <div className="notice notice-error">{error}</div>}
            {loading ? <div className="empty-state">正在載入比較譯本…</div> : (
                <PassageDisplay passage={passage} reference={`${selection.book} ${selection.chapter} 章・${versionName}`} focusVerse={focusVerse} />
            )}
        </section>
    );
}
