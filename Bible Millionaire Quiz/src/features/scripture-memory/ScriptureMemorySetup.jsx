import React, { useRef } from 'react';
import { ArrowLeft, BookOpen, ChevronDown, Grid2X2, Grid3X3, Home, LoaderCircle, Mic, MicOff, X } from 'lucide-react';
import './ScriptureMemorySetup.css';

export function ScriptureMemoryTopbar({
    variant = 'order',
    icon: Icon,
    title,
    subtitle,
    onBack,
    actions
}) {
    return (
        <header className="scripture-memory-topbar" data-variant={variant}>
            <button type="button" onClick={onBack} aria-label="返回遊戲分類">
                <ArrowLeft size={20} />
                <span>返回</span>
            </button>
            <div className="scripture-memory-topbar__identity">
                {Icon ? <Icon size={22} aria-hidden="true" /> : null}
                <span>
                    <strong>{title}</strong>
                    <small>{subtitle}</small>
                </span>
            </div>
            <div className="scripture-memory-topbar__actions">{actions}</div>
        </header>
    );
}

export function ScriptureMemoryExitMenu({
    open,
    onClose,
    onBack,
    onHome,
    busy = false,
    willForfeit = false,
    variant = 'order'
}) {
    if (!open) return null;

    const choose = async action => {
        if (busy) return;
        const completed = await action?.();
        if (completed !== false) onClose?.();
    };

    return (
        <div className="scripture-memory-exit-backdrop" onMouseDown={event => {
            if (!busy && event.target === event.currentTarget) onClose?.();
        }}>
            <section className="scripture-memory-exit-menu" data-variant={variant} role="dialog" aria-modal="true" aria-labelledby={`${variant}-exit-menu-title`}>
                <header>
                    <div><strong id={`${variant}-exit-menu-title`}>{busy ? '正在結束本局…' : '離開目前遊戲？'}</strong><small>{willForfeit ? '離開會判定本局失敗；已答對片段的金幣保留，不發放通關加成。' : '返回經文記憶，或直接回首頁。'}</small></div>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="繼續留在遊戲"><X size={19} /></button>
                </header>
                <div className="scripture-memory-exit-menu__choices">
                    <button type="button" disabled={busy} onClick={() => choose(onBack)}><ArrowLeft size={21} /><span><strong>返回</strong><small>回到經文記憶</small></span></button>
                    <button type="button" disabled={busy} onClick={() => choose(onHome)}><Home size={21} /><span><strong>回首頁</strong><small>返回聖經智匯首頁</small></span></button>
                </div>
                <button className="scripture-memory-exit-menu__cancel" type="button" disabled={busy} onClick={onClose}>繼續遊戲</button>
            </section>
        </div>
    );
}

export function ScriptureMemoryIntro({ variant = 'order', icon: Icon, badge, title, titleId, description }) {
    return (
        <header className="scripture-memory-intro" data-variant={variant}>
            <span>{Icon ? <Icon size={17} aria-hidden="true" /> : null}{badge}</span>
            <h1 id={titleId}>{title}</h1>
            <p>{description}</p>
        </header>
    );
}

export function ScriptureMemorySourceTabs({ variant = 'order', value, onChange }) {
    return (
        <div className="scripture-memory-source-tabs" data-variant={variant} role="tablist" aria-label="選擇經文來源">
            <button type="button" role="tab" aria-selected={value === 'custom'} onClick={() => onChange('custom')}>
                <Grid2X2 size={18} />自選範圍
            </button>
            <button type="button" role="tab" aria-selected={value === 'featured'} onClick={() => onChange('featured')}>
                <BookOpen size={18} />常用經文
            </button>
        </div>
    );
}

export function ScriptureVoiceModeControl({ voice, compact = false, dark = false }) {
    if (!voice) return null;
    const effectiveStatus = voice.supported ? voice.status : 'unsupported';
    const statusText = {
        off: '需要時才會啟用麥克風',
        requesting: '正在請求麥克風權限…',
        listening: '麥克風已開啟，正在聆聽',
        processing: '正在送出語音選項…',
        ambiguous: '兩個選項太接近，請再說完整一點',
        'no-match': '沒有聽清楚，請再說一次',
        paused: '麥克風暫停中',
        unsupported: '這個瀏覽器不支援語音辨識',
        denied: '麥克風權限未開啟',
        error: voice.error || '語音辨識暫時無法使用'
    }[effectiveStatus] || '語音模式';
    const busy = effectiveStatus === 'requesting' || effectiveStatus === 'processing';

    return (
        <section className={`scripture-voice-mode${compact ? ' is-compact' : ''}${dark ? ' is-dark' : ''}`} aria-label="語音模式">
            <label>
                <input
                    type="checkbox"
                    checked={voice.enabled}
                    disabled={!voice.supported && !voice.enabled}
                    onChange={event => voice.setEnabled(event.target.checked)}
                />
                <span className="scripture-voice-mode__icon">
                    {busy ? <LoaderCircle className="scripture-order-spin" size={18} /> : voice.enabled ? <Mic size={18} /> : <MicOff size={18} />}
                </span>
                <span className="scripture-voice-mode__copy">
                    <strong>語音模式</strong>
                    {!compact ? <small>說出畫面上的經文片段即可作答；仍可直接點選。</small> : null}
                </span>
                <span className="scripture-voice-mode__switch" aria-hidden="true" />
            </label>
            <div className="scripture-voice-mode__status" role="status" aria-live="polite">
                <span>{voice.enabled ? '🎙' : '○'} {statusText}</span>
                {voice.enabled && voice.heardText ? <small>聽到：{voice.heardText}</small> : null}
                {!compact && !voice.enabled ? <small>辨識服務由瀏覽器提供；本站不保存錄音或辨識文字。</small> : null}
            </div>
        </section>
    );
}

export function ScriptureMemoryPassagePicker({
    variant = 'order',
    passages = [],
    selectedId,
    onSelect,
    getBadge = passage => passage.level || '記憶',
    getMeta = passage => passage.reference
}) {
    const selected = passages.find(passage => passage.id === selectedId) || passages[0] || null;
    const menu = useRef(null);

    if (!selected) return null;

    return (
        <section className="scripture-memory-passage-picker" data-variant={variant}>
            <div className="scripture-memory-passage-picker__heading">
                <div>
                    <span>目前經文</span>
                    <strong>點選下方卡片即可切換</strong>
                </div>
                <small>共 {passages.length} 段</small>
            </div>

            <details ref={menu} className="scripture-memory-passage-picker__menu">
                <summary className="scripture-memory-passage-picker__selected" aria-label={`目前選擇：${selected.title}，點選切換經文`}>
                    <span>{getBadge(selected)}</span>
                    <div><h2>{selected.title}</h2><p>{getMeta(selected)}</p></div>
                    <ChevronDown size={20} aria-hidden="true" />
                </summary>
                <div id={`${variant}-featured-passages`} className="scripture-memory-passage-picker__options" aria-label="選擇常用經文">
                    {passages.map(passage => {
                        const active = passage.id === selected.id;
                        return (
                            <button
                                type="button"
                                key={passage.id}
                                aria-pressed={active}
                                onClick={() => {
                                    onSelect(passage.id);
                                    if (menu.current) menu.current.open = false;
                                }}
                            >
                                <span>{getBadge(passage)}</span>
                                <strong>{passage.title}</strong>
                                <small>{getMeta(passage)}</small>
                            </button>
                        );
                    })}
                </div>
            </details>
        </section>
    );
}

export function ScriptureMemoryPrimaryAction({ variant = 'order', children, ...props }) {
    return <button className="scripture-memory-primary" data-variant={variant} {...props}>{children}</button>;
}

const DIFFICULTY_OPTIONS = [
    { value: 'SIMPLE', label: '簡易', copy: '只使用本段經文' },
    { value: 'MEDIUM', label: '中等', copy: '混入少量外部經文' },
    { value: 'HARD', label: '困難', copy: '混入更多外部經文' }
];

const SPEED_OPTIONS = [
    { value: 'SLOW', label: '慢速', copy: '每秒 75% 速度，容易觀察' },
    { value: 'MEDIUM', label: '中速', copy: '現有速度（標準）' },
    { value: 'FAST', label: '快速', copy: '每秒 125% 速度，金幣 +20%' }
];

export function ScriptureMemoryModePicker({
    variant = 'order',
    difficulty,
    onDifficultyChange,
    speed,
    onSpeedChange,
    gridSize,
    onGridSizeChange,
    fragmentCount = 0,
    rain = false
}) {
    const fourAllowed = Number(fragmentCount) >= 4;
    const nineAllowed = Number(fragmentCount) >= 12;
    return (
        <section className="scripture-memory-mode-picker" data-variant={variant} aria-label="挑戰設定">
            {!rain ? (
                <div>
                    <span>版面</span>
                    <div className="scripture-memory-mode-picker__choices is-grid">
                        <button type="button" aria-pressed={gridSize === 4} disabled={!fourAllowed} onClick={() => onGridSizeChange(4)}>
                            <Grid2X2 size={18} /><strong>四宮格</strong><small>{fourAllowed ? '4 個選項' : '至少需 4 片'}</small>
                        </button>
                        <button
                            type="button"
                            aria-pressed={gridSize === 9}
                            disabled={!nineAllowed}
                            onClick={() => onGridSizeChange(9)}
                        >
                            <Grid3X3 size={18} /><strong>九宮格</strong><small>{nineAllowed ? '9 個選項' : '至少需 12 片'}</small>
                        </button>
                    </div>
                    {gridSize === 9 && fragmentCount < 15 ? <p>目前可以遊玩；15 片以上的九宮格體驗更完整。</p> : null}
                </div>
            ) : null}
            <div>
                <span>難度</span>
                <div className="scripture-memory-mode-picker__choices is-difficulty">
                    {DIFFICULTY_OPTIONS.map(option => (
                        <button
                            type="button"
                            key={option.value}
                            aria-pressed={difficulty === option.value}
                            onClick={() => onDifficultyChange(option.value)}
                        >
                            <strong>{option.label}</strong><small>{option.copy}</small>
                        </button>
                    ))}
                </div>
            </div>
            {rain ? (
                <div>
                    <span>速度</span>
                    <div className="scripture-memory-mode-picker__choices is-difficulty">
                        {SPEED_OPTIONS.map(option => (
                            <button
                                type="button"
                                key={option.value}
                                aria-pressed={speed === option.value}
                                onClick={() => onSpeedChange?.(option.value)}
                            >
                                <strong>{option.label}</strong><small>{option.copy}</small>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
