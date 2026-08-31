import { HubPage } from './pages/HubPage.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { VerseOrderPage } from './pages/VerseOrderPage.jsx';
import { BoundaryPage } from './pages/BoundaryPage.jsx';
import { ScriptureExplorerPage } from './pages/ScriptureExplorerPage.jsx';
import { SharePage } from './pages/SharePage.jsx';
import { RedirectPage } from './pages/RedirectPage.jsx';
import { UNIFIED_EXPLORER_ENABLED } from './data.js';

const pages = {
    'index.html': <HubPage />,
    'explore.html': UNIFIED_EXPLORER_ENABLED ? <ScriptureExplorerPage /> : <HubPage />,
    'read.html': <RedirectPage />,
    'order.html': <VerseOrderPage />,
    'record.html': <RedirectPage />,
    'search.html': <SearchPage />,
    'records.html': <RedirectPage tab="mine" />,
    'share.html': new URLSearchParams(window.location.search).has('token') ? <SharePage /> : <RedirectPage tab="community" />,
    'groups.html': <RedirectPage tab="community" />,
    'churches.html': <BoundaryPage type="churches" />
};

export function AppRouter() {
    const filename = window.location.pathname.split('/').pop() || 'index.html';
    return pages[filename] || pages['index.html'];
}
