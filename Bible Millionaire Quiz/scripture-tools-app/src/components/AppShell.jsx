import { ArrowLeft, BookOpen, ExternalLink, FlaskConical } from 'lucide-react';

export function AppShell({ title, eyebrow = '經文工具實驗區', children, actions }) {
    const isHome = window.location.pathname.endsWith('/scripture-tools/') || window.location.pathname.endsWith('/index.html');
    const isOfficialExplorer = /\/(?:explore|share)\.html$/u.test(window.location.pathname);
    const returnTarget = new URLSearchParams(window.location.search).get('return');
    const mainSiteUrl = returnTarget || import.meta.env.VITE_MAIN_SITE_URL || (import.meta.env.DEV ? 'http://localhost:5173/' : '/');
    return (
        <div className={`app-shell ${isOfficialExplorer ? 'official-scripture-shell' : ''}`}>
            <header className="topbar">
                <div className="topbar-inner">
                    <a className="brand" href={isOfficialExplorer ? 'explore.html' : 'index.html'} aria-label={isOfficialExplorer ? '返回經文探索' : '返回經文工具'}>
                        <span className="brand-mark">E</span>
                        <span><strong>Ecclesia Hub</strong><small>聖經智匯</small></span>
                    </a>
                    <div className="topbar-actions">
                        {actions}
                        <a className="quiet-link" href={mainSiteUrl} title="返回原網站">
                            原網站 <ExternalLink size={15} />
                        </a>
                    </div>
                </div>
            </header>
            <main className="page-wrap">
                {!isHome && !isOfficialExplorer && <a className="back-link" href="index.html"><ArrowLeft size={16} /> 全部經文工具</a>}
                <section className="page-heading">
                    <div>
                        <p className="eyebrow">{isOfficialExplorer ? <BookOpen size={15} /> : <FlaskConical size={15} />} {eyebrow}</p>
                        <h1>{title}</h1>
                    </div>
                </section>
                {children}
            </main>
            <footer className="footer-note">經文探索與遊戲模組分開；錄音只有在會員主動保存後才會上傳。</footer>
        </div>
    );
}
