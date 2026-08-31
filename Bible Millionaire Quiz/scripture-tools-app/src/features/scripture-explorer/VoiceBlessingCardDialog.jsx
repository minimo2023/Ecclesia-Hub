import { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    Check,
    CircleStop,
    CircleX,
    Globe2,
    LockKeyhole,
    Mic,
    Play,
    RotateCcw,
    Send,
    Sparkles,
    UserRound,
    X
} from 'lucide-react';

const THEMES = [
    { id: 'dawn', name: '晨光', description: '米白與暖金', className: 'theme-dawn' },
    { id: 'peace', name: '平安', description: '霧藍與青綠', className: 'theme-peace' },
    { id: 'hope', name: '盼望', description: '靛藍與淡紫', className: 'theme-hope' }
];

function formatSeconds(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function VoiceBlessingCardDialog({
    open,
    onClose,
    controller,
    passage,
    selection,
    versionName,
    onStart,
    previewAudioRef,
    onPreviewPlay
}) {
    const firstVerse = Number(passage?.[0]?.verse || 1);
    const lastVerse = Number(passage?.at(-1)?.verse || firstVerse);
    const [verseStart, setVerseStart] = useState(firstVerse);
    const [verseEnd, setVerseEnd] = useState(Math.min(lastVerse, firstVerse + 2));
    const [visibility, setVisibility] = useState('UNLISTED');
    const [recipient, setRecipient] = useState('');
    const [title, setTitle] = useState('給此刻需要平安的你');
    const [message, setMessage] = useState('願這段經文，在今天成為你的安慰與力量。');
    const [theme, setTheme] = useState('peace');
    const [signature, setSignature] = useState('custom');
    const [customSignature, setCustomSignature] = useState('');
    const [currentStep, setCurrentStep] = useState(1);

    const selectedPassage = useMemo(() => passage.filter(item => (
        Number(item.verse) >= verseStart && Number(item.verse) <= verseEnd
    )), [passage, verseEnd, verseStart]);
    const reference = `${selection.book} ${selection.chapter}:${verseStart}-${verseEnd}・${versionName}`;
    const selectedTheme = THEMES.find(item => item.id === theme) || THEMES[1];
    const rangeValid = verseEnd >= verseStart && verseEnd - verseStart < 30;
    const signatureLabel = signature === 'anonymous'
        ? '匿名祝福'
        : signature === 'custom'
            ? customSignature.trim() || '你的署名'
            : '會員名稱';

    useEffect(() => {
        setVerseStart(firstVerse);
        setVerseEnd(Math.min(lastVerse, firstVerse + 2));
        setCurrentStep(1);
    }, [firstVerse, lastVerse, selection.book, selection.chapter, selection.version]);

    useEffect(() => {
        if (!open) setCurrentStep(1);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const closeOnEscape = event => {
            if (event.key === 'Escape' && !controller.isRecording) onClose();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [controller.isRecording, onClose, open]);

    if (!open) return null;

    const { supported, isRecording, seconds, result, error, stop, clearResult } = controller;

    const start = async () => {
        await onStart({ verseStart, verseEnd, visibility, title, message, theme, signature, customSignature, recipient });
    };

    const resetRecording = () => {
        clearResult();
        setCurrentStep(2);
    };

    const cancelBlessing = () => {
        clearResult();
        setCurrentStep(1);
        onClose();
    };

    return (
        <div className="blessing-dialog-backdrop" role="presentation" onMouseDown={event => {
            if (event.target === event.currentTarget && !isRecording) cancelBlessing();
        }}>
            <section className="blessing-dialog" role="dialog" aria-modal="true" aria-labelledby="blessing-dialog-title">
                <header className="blessing-dialog-heading">
                    <div className="blessing-dialog-title">
                        <span className="blessing-icon"><Sparkles size={19} /></span>
                        <div>
                            <span>經文探索</span>
                            <h2 id="blessing-dialog-title">製作語音經文祝福卡</h2>
                        </div>
                    </div>
                    <div className="blessing-dialog-header-actions">
                        <button type="button" className="text-button" onClick={cancelBlessing} disabled={isRecording} aria-label="取消製作語音祝福卡">
                            <CircleX size={16} /> 取消
                        </button>
                        <button type="button" className="text-button icon-button" onClick={cancelBlessing} disabled={isRecording} aria-label="關閉語音祝福卡"><X size={20} /></button>
                    </div>
                </header>

                <div className="blessing-dialog-body blessing-wizard">
                    <nav className="blessing-wizard-progress" aria-label="語音祝福卡製作進度">
                        {[
                            ['經文與對象', 1],
                            ['錄製祝福', 2],
                            ['卡片內容', 3],
                            ['預覽送出', 4]
                        ].map(([label, step]) => <button
                            type="button"
                            key={step}
                            className={currentStep === step ? 'is-current' : currentStep > step ? 'is-complete' : ''}
                            disabled={step > currentStep || isRecording}
                            onClick={() => setCurrentStep(step)}
                        ><span>{currentStep > step ? <Check size={14} /> : step}</span>{label}</button>)}
                    </nav>

                    <div className="blessing-wizard-stage">
                        {currentStep === 1 && <section className="blessing-wizard-panel" aria-labelledby="blessing-step-one-title">
                            <div className="blessing-wizard-panel-heading">
                                <span>步驟 1／4</span>
                                <h3 id="blessing-step-one-title">選擇經文與祝福對象</h3>
                                <p>先決定要分享的經文，以及這張祝福卡的可見範圍。</p>
                            </div>
                            <div className="blessing-step-one-grid">
                                <div className="blessing-wizard-field-group">
                                    <div className="blessing-step-heading"><span>1</span><div><strong>要分享的經文</strong><small>同一章連續 1 至 30 節</small></div></div>
                                    <div className="blessing-range-grid">
                                        <label>起始節
                                            <select value={verseStart} disabled={Boolean(result)} onChange={event => {
                                                const next = Number(event.target.value);
                                                setVerseStart(next);
                                                setVerseEnd(current => Math.max(next, Math.min(current, next + 29)));
                                            }}>
                                                {passage.map(item => <option key={item.verse} value={item.verse}>第 {item.verse} 節</option>)}
                                            </select>
                                        </label>
                                        <label>結束節
                                            <select value={verseEnd} disabled={Boolean(result)} onChange={event => setVerseEnd(Number(event.target.value))}>
                                                {passage.filter(item => Number(item.verse) >= verseStart && Number(item.verse) < verseStart + 30).map(item => (
                                                    <option key={item.verse} value={item.verse}>第 {item.verse} 節</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                    <div className="blessing-selected-reference"><Check size={15} /> {reference}</div>
                                </div>

                                <div className="blessing-wizard-field-group">
                                    <div className="blessing-step-heading"><span>2</span><div><strong>這張卡要送給誰？</strong><small>預設只有收到連結的人能開啟</small></div></div>
                                    <div className="blessing-visibility-grid">
                                        <button type="button" className={visibility === 'UNLISTED' ? 'is-selected' : ''} onClick={() => setVisibility('UNLISTED')}>
                                            <LockKeyhole size={19} /><span><strong>傳給某人</strong><small>不出現在公開區域</small></span>
                                        </button>
                                        <button type="button" className={visibility === 'PUBLIC' ? 'is-selected' : ''} onClick={() => setVisibility('PUBLIC')}>
                                            <Globe2 size={19} /><span><strong>公開祝福</strong><small>可出現在經文祝福區</small></span>
                                        </button>
                                    </div>
                                    {visibility === 'UNLISTED' && <label className="blessing-recipient-field">收件人稱呼（選填）
                                        <input value={recipient} maxLength={30} placeholder="例如：給媽媽、給正在預備考試的你" onChange={event => setRecipient(event.target.value)} />
                                    </label>}
                                </div>
                            </div>
                        </section>}

                        {currentStep === 2 && <section className="blessing-wizard-panel blessing-record-step" aria-labelledby="blessing-step-two-title">
                            <div className="blessing-wizard-panel-heading">
                                <span>步驟 2／4</span>
                                <h3 id="blessing-step-two-title">錄下想說的話與經文</h3>
                                <p>可以先說對收件人的祝福，再朗讀 {reference}；整段會保存成一個音檔。</p>
                            </div>
                            <div className={`blessing-recorder blessing-recorder-large ${isRecording ? 'is-recording' : ''}`}>
                                <div className="blessing-recorder-orb"><Mic size={29} /></div>
                                <div><strong>{isRecording ? '錄音中' : result ? '錄音已完成' : '準備錄音'}</strong><small>{isRecording ? '說完祝福與經文後按下停止' : result ? '請先試聽，確認內容後再繼續' : '最長 5 分鐘；錄音不會成為系統朗讀聲音'}</small></div>
                                <time>{formatSeconds(seconds)}</time>
                            </div>
                            {!supported && <div className="notice notice-error">這個瀏覽器不支援錄音，請改用新版 Chrome、Edge 或 Safari。</div>}
                            {error && <div className="notice notice-error" role="alert">{error}</div>}
                            <div className="blessing-record-actions blessing-record-actions-centered">
                                {!isRecording ? <button type="button" className="primary-button" onClick={start} disabled={!supported || !rangeValid || !selectedPassage.length}>
                                    <Mic size={17} /> {result ? '重新錄音' : '開始錄音'}
                                </button> : <button type="button" className="danger-button" onClick={() => stop()}>
                                    <CircleStop size={17} /> 停止錄音
                                </button>}
                                {result && <button type="button" className="text-button" onClick={resetRecording}><RotateCcw size={16} /> 清除重來</button>}
                            </div>
                            {result && <div className="blessing-audio-preview blessing-audio-preview-large">
                                <span><Play size={16} /> 試聽語音祝福</span>
                                <audio ref={previewAudioRef} controls controlsList="nodownload" src={result.url} onPlay={onPreviewPlay} />
                            </div>}
                        </section>}

                        {currentStep === 3 && <section className="blessing-wizard-panel blessing-card-editor" aria-labelledby="blessing-step-three-title">
                            <div className="blessing-wizard-panel-heading">
                                <span>步驟 3／4</span>
                                <h3 id="blessing-step-three-title">整理卡片內容</h3>
                                <p>補上標題、文字祝福、卡片主題與署名；音檔不會自動播放。</p>
                            </div>
                            <div className="blessing-card-fields">
                                <label>卡片標題
                                    <input value={title} maxLength={50} onChange={event => setTitle(event.target.value)} />
                                </label>
                                <label>文字祝福（選填）
                                    <textarea value={message} maxLength={300} rows={4} onChange={event => setMessage(event.target.value)} />
                                </label>
                                <fieldset className="blessing-theme-fieldset">
                                    <legend>卡片主題</legend>
                                    <div className="blessing-theme-options">
                                        {THEMES.map(item => <button type="button" key={item.id} className={`${item.className} ${theme === item.id ? 'is-selected' : ''}`} onClick={() => setTheme(item.id)}>
                                            <i aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.description}</small></span>
                                        </button>)}
                                    </div>
                                </fieldset>
                                <div className="blessing-signature-row">
                                    <label>署名方式
                                        <select value={signature} onChange={event => setSignature(event.target.value)}>
                                            <option value="custom">自行填寫署名</option>
                                            <option value="member">使用會員名稱</option>
                                            <option value="anonymous">匿名祝福</option>
                                        </select>
                                    </label>
                                    {signature === 'custom' && <label>署名內容
                                        <input value={customSignature} maxLength={30} placeholder="例如：偉恩、愛你的媽媽" onChange={event => setCustomSignature(event.target.value)} />
                                    </label>}
                                </div>
                            </div>
                        </section>}

                        {currentStep === 4 && <section className="blessing-wizard-panel blessing-preview-step" aria-labelledby="blessing-step-four-title">
                            <div className="blessing-wizard-panel-heading">
                                <span>步驟 4／4</span>
                                <h3 id="blessing-step-four-title">預覽收件人看到的祝福卡</h3>
                                <p>正式版本會在確認後產生可撤銷的分享連結；目前只供試看。</p>
                            </div>
                            <article className={`blessing-card-preview blessing-card-final ${selectedTheme.className}`}>
                                <span className="blessing-card-kicker">語音經文祝福</span>
                                <p className="blessing-card-recipient">{recipient || (visibility === 'PUBLIC' ? '給此刻讀到這張卡的你' : '給親愛的你')}</p>
                                <h3>{title}</h3>
                                <div className="blessing-card-reference">{reference}</div>
                                <div className="blessing-final-audio">
                                    <span>一段為你錄下的祝福</span>
                                    <audio ref={previewAudioRef} controls controlsList="nodownload" src={result?.url} onPlay={onPreviewPlay} />
                                </div>
                                <blockquote>{selectedPassage.map(item => <p key={item.verse}><sup>{item.verse}</sup>{item.text}</p>)}</blockquote>
                                {message && <p className="blessing-card-message">{message}</p>}
                                <footer><UserRound size={14} /> {signatureLabel}</footer>
                            </article>
                            <div className="blessing-prototype-summary">
                                <strong>{visibility === 'PUBLIC' ? '公開祝福卡' : '不公開分享連結'}</strong>
                                <span>試作不會保存、上傳或公開任何內容。</span>
                            </div>
                        </section>}
                    </div>

                    <footer className="blessing-wizard-actions">
                        <button type="button" className="text-button" onClick={cancelBlessing} disabled={isRecording}>
                            <CircleX size={16} /> 取消
                        </button>
                        <button type="button" className="text-button" onClick={() => setCurrentStep(step => Math.max(1, step - 1))} disabled={currentStep === 1 || isRecording}>
                            <ArrowLeft size={16} /> 上一步
                        </button>
                        {currentStep === 1 && <button type="button" className="primary-button" disabled={!rangeValid || !selectedPassage.length} onClick={() => setCurrentStep(2)}>下一步：錄製祝福</button>}
                        {currentStep === 2 && <button type="button" className="primary-button" disabled={!result || isRecording} onClick={() => setCurrentStep(3)}>下一步：設計卡片</button>}
                        {currentStep === 3 && <button type="button" className="primary-button" disabled={!title.trim() || (signature === 'custom' && !customSignature.trim())} onClick={() => setCurrentStep(4)}><Send size={17} /> 預覽並準備分享</button>}
                        {currentStep === 4 && <button type="button" className="primary-button" onClick={onClose}><Check size={17} /> 完成試看</button>}
                    </footer>
                </div>
            </section>
        </div>
    );
}
