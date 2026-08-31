import { useCallback, useRef, useState } from 'react';
import { fetchChapter } from '../../api.js';

export function useScripturePassage(initialSelection) {
    const [selection, setSelection] = useState(initialSelection);
    const [draftSelection, setDraftSelection] = useState(initialSelection);
    const [passage, setPassage] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const requestIdRef = useRef(0);

    const load = useCallback(async nextSelection => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError('');
        try {
            const nextPassage = await fetchChapter(nextSelection);
            if (requestId !== requestIdRef.current) return false;
            setPassage(nextPassage);
            setSelection(nextSelection);
            setDraftSelection(nextSelection);
            return true;
        } catch (loadError) {
            if (requestId === requestIdRef.current) setError(loadError.message);
            return false;
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, []);

    return {
        selection,
        draftSelection,
        passage,
        loading,
        error,
        setDraftSelection,
        load
    };
}
