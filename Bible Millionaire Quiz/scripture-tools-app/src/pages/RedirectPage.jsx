import { useEffect } from 'react';

export function RedirectPage({ tab = 'reading' }) {
    useEffect(() => {
        const target = new URL('explore.html', window.location.href);
        if (tab !== 'reading') target.searchParams.set('tab', tab);
        window.location.replace(target);
    }, [tab]);
    return <div className="empty-state">正在前往經文探索…</div>;
}

export default RedirectPage;
