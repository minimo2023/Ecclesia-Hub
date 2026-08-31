import React from 'react';
import {
    ArrowLeft,
    BookOpen,
    Check,
    CloudRain,
    Coins,
    Grid2X2,
    Heart,
    Lightbulb,
    Mic,
    MousePointer2,
    Play,
    Settings2,
    Sparkles
} from 'lucide-react';
import './ScriptureMemoryGuide.css';

const IMAGE_ROOT = '/images/game-guides/scripture-memory';

const guides = [
    {
        id: 'choose',
        eyebrow: '步驟 1',
        title: '先選擇想玩的方式',
        description: '進入「經文記憶」分類後，可以選擇固定選項的經文四宮格，或讓片段動起來的經文雨。',
        desktop: `${IMAGE_ROOT}/desktop-selection.png`,
        mobile: `${IMAGE_ROOT}/mobile-selection.png`,
        alt: '經文記憶遊戲選擇畫面',
        markers: [
            { number: 1, label: '切換到經文記憶', x: '50%', y: '37%', mx: '50%', my: '21%' },
            { number: 2, label: '經文四宮格', x: '27%', y: '68%', mx: '13%', my: '39%' },
            { number: 3, label: '經文雨', x: '73%', y: '68%', mx: '13%', my: '59%' }
        ]
    },
    {
        id: 'setup',
        eyebrow: '步驟 2',
        title: '確認經文與挑戰設定',
        description: '可使用自選範圍或常用經文。確認全文後，再選擇版面、難度、速度與是否開啟語音模式。',
        desktop: `${IMAGE_ROOT}/desktop-setup.png`,
        mobile: `${IMAGE_ROOT}/mobile-setup.png`,
        alt: '經文記憶遊戲設定畫面',
        markers: [
            { number: 1, label: '選擇版面與難度', x: '50%', y: '48%', mx: '50%', my: '38%' },
            { number: 2, label: '需要時開啟語音', x: '75%', y: '66%', mx: '50%', my: '66%' },
            { number: 3, label: '確認後開始挑戰', x: '50%', y: '82%', mx: '50%', my: '89%' }
        ]
    }
];

function ResponsiveGuideImage({ guide }) {
    return (
        <figure className="scripture-guide-shot">
            <picture>
                <source media="(min-width: 761px)" srcSet={guide.desktop} />
                <img src={guide.mobile} alt={guide.alt} loading="lazy" />
            </picture>
            {guide.markers.map(marker => (
                <span
                    key={marker.number}
                    className="scripture-guide-marker"
                    style={{
                        '--marker-x': marker.x,
                        '--marker-y': marker.y,
                        '--marker-mobile-x': marker.mx,
                        '--marker-mobile-y': marker.my
                    }}
                    aria-hidden="true"
                >
                    {marker.number}
                </span>
            ))}
            <figcaption>
                {guide.markers.map(marker => (
                    <span key={marker.number}><b>{marker.number}</b>{marker.label}</span>
                ))}
            </figcaption>
        </figure>
    );
}

function GameRuleCard({ variant, title, icon: Icon, description, desktop, mobile, points, onStart }) {
    return (
        <article className="scripture-guide-game" data-variant={variant}>
            <header>
                <span><Icon size={24} /></span>
                <div>
                    <small>{variant === 'order' ? '靜態排序' : '動態挑戰'}</small>
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
            </header>
            <figure>
                <picture>
                    <source media="(min-width: 761px)" srcSet={desktop} />
                    <img src={mobile} alt={`${title}實際遊戲畫面`} loading="lazy" />
                </picture>
                <span className="scripture-guide-game__badge">實際遊戲畫面</span>
            </figure>
            <ol>
                {points.map((point, index) => (
                    <li key={point}><span>{index + 1}</span><p>{point}</p></li>
                ))}
            </ol>
            <button type="button" onClick={onStart}><Play size={17} />前往{title}</button>
        </article>
    );
}

export default function ScriptureMemoryGuide({ onBack, onStartOrder, onStartRain }) {
    return (
        <main className="scripture-guide-root">
            <header className="scripture-guide-topbar">
                <button type="button" onClick={onBack} aria-label="返回經文記憶">
                    <ArrowLeft size={20} /><span>返回經文記憶</span>
                </button>
                <div><BookOpen size={21} /><strong>經文記憶玩法</strong></div>
                <span>和合本</span>
            </header>

            <section className="scripture-guide-hero">
                <div className="scripture-guide-hero__copy">
                    <span><Sparkles size={16} />看圖就會玩</span>
                    <h1>把經文順序，<br />一步一步記在心裡</h1>
                    <p>先選一段經文，再用四宮格或經文雨依序完成片段。你可以直接點選，也能選擇開啟語音模式。</p>
                    <nav aria-label="本頁內容">
                        <a href="#guide-start">開始前</a>
                        <a href="#guide-order">四宮格</a>
                        <a href="#guide-rain">經文雨</a>
                        <a href="#guide-rules">共同規則</a>
                    </nav>
                </div>
                <div className="scripture-guide-hero__flow" aria-label="遊戲流程">
                    <span><BookOpen size={20} /><b>1</b><strong>選經文</strong></span>
                    <i />
                    <span><Settings2 size={20} /><b>2</b><strong>調整設定</strong></span>
                    <i />
                    <span><MousePointer2 size={20} /><b>3</b><strong>依序作答</strong></span>
                </div>
            </section>

            <section id="guide-start" className="scripture-guide-section">
                <div className="scripture-guide-section__heading">
                    <span>開始挑戰前</span>
                    <h2>從遊戲選擇到開始挑戰</h2>
                    <p>桌面版會使用較寬的操作畫面；手機版則使用直式畫面，標記位置會跟著裝置調整。</p>
                </div>
                <div className="scripture-guide-steps">
                    {guides.map(guide => (
                        <article key={guide.id}>
                            <div><small>{guide.eyebrow}</small><h3>{guide.title}</h3><p>{guide.description}</p></div>
                            <ResponsiveGuideImage guide={guide} />
                        </article>
                    ))}
                </div>
            </section>

            <section className="scripture-guide-section is-games">
                <div className="scripture-guide-section__heading">
                    <span>兩種玩法</span>
                    <h2>規則不同，目標相同</h2>
                    <p>都要依照和合本原文順序，找出下一個正確片段。</p>
                </div>
                <div className="scripture-guide-games">
                    <div id="guide-order">
                        <GameRuleCard
                            variant="order"
                            title="經文四宮格"
                            icon={Grid2X2}
                            description="畫面固定顯示四個或九個選項，適合專心思考經文次序。"
                            desktop={`${IMAGE_ROOT}/desktop-order-play.png`}
                            mobile={`${IMAGE_ROOT}/mobile-order-play.png`}
                            points={[
                                '從選項中找出整段經文的第一個片段。',
                                '答對後片段會加入上方，接著繼續選下一片。',
                                '答錯扣一顆愛心；愛心歸零時本局結束。'
                            ]}
                            onStart={onStartOrder}
                        />
                    </div>
                    <div id="guide-rain">
                        <GameRuleCard
                            variant="rain"
                            title="經文雨"
                            icon={CloudRain}
                            description="片段會循環落下，適合訓練觀察力與快速回想經文順序。"
                            desktop={`${IMAGE_ROOT}/desktop-rain-play.png`}
                            mobile={`${IMAGE_ROOT}/mobile-rain-play.png`}
                            points={[
                                '觀察正在落下的片段，找到正確的下一片。',
                                '沒有點到不算錯；只有點錯片段才會失去愛心。',
                                '可調整下降速度，快速模式完成時有額外獎勵。'
                            ]}
                            onStart={onStartRain}
                        />
                    </div>
                </div>
            </section>

            <section id="guide-rules" className="scripture-guide-section is-rules">
                <div className="scripture-guide-section__heading">
                    <span>共同規則</span>
                    <h2>開始前先知道這四件事</h2>
                </div>
                <div className="scripture-guide-rule-grid">
                    <article><Heart /><div><h3>三顆愛心</h3><p>每次點錯扣一顆；愛心歸零即挑戰失敗。</p></div></article>
                    <article><Coins /><div><h3>提示會花金幣</h3><p>高光或下一片提示會顯示需要的智匯金幣。</p></div></article>
                    <article><Mic /><div><h3>語音自由開關</h3><p>預設關閉。開啟後可說出畫面上的完整片段作答，仍能直接點選。</p></div></article>
                    <article><Lightbulb /><div><h3>先讀全文</h3><p>開始前會先預覽完整經文，熟悉內容後再進入挑戰。</p></div></article>
                </div>
                <aside><Check size={20} /><p><strong>小提醒：</strong>語音辨識不確定時不會替你作答，畫面會請你再說一次。</p></aside>
            </section>

            <section className="scripture-guide-cta">
                <div><span>準備好了嗎？</span><h2>選一種玩法，開始記憶經文</h2></div>
                <div>
                    <button type="button" onClick={onStartOrder}><Grid2X2 size={19} />玩經文四宮格</button>
                    <button type="button" onClick={onStartRain}><CloudRain size={19} />玩經文雨</button>
                </div>
            </section>
        </main>
    );
}
