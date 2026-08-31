import { ArrowRight, ShieldCheck } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { FEATURES } from '../data.js';

export function HubPage() {
    return (
        <AppShell title="經文工具實驗區">
            <section className="hero-card">
                <div>
                    <span className="status-pill status-live">獨立模組</span>
                    <h2>先把每個想法做成可以單獨檢驗的工具</h2>
                    <p>經文仍是主體；朗讀、錄音、搜尋、排序挑戰與社群功能各自獨立。移除其中一項不會影響原網站或既有問答遊戲。</p>
                </div>
                <div className="privacy-summary"><ShieldCheck size={24} /><span><strong>預設不公開</strong><small>錄音先留在裝置，定位按次授權，分享與共讀尚未啟用。</small></span></div>
            </section>
            <div className="feature-grid">
                {FEATURES.map(feature => (
                    <a className="feature-card" href={feature.href} key={feature.id}>
                        <div className="feature-card-top">
                            <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
                            <span className={`status-pill ${['可試用', '整合試用'].includes(feature.status) ? 'status-live' : 'status-wait'}`}>{feature.status}</span>
                        </div>
                        <h2>{feature.title}</h2>
                        <p>{feature.description}</p>
                        <span className="card-link">開啟模組 <ArrowRight size={16} /></span>
                    </a>
                ))}
            </div>
        </AppShell>
    );
}
