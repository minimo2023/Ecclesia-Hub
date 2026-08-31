import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowRight, CheckCircle2, Clock3, Crown, Eye, Heart, Infinity,
    LoaderCircle, RotateCcw, Share2, Sparkles, Volume2, VolumeX, X
} from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { BIBLE_GROUPS, CHAPTER_COUNTS } from '../data.js';
import {
    abandonOrderSession,
    createOrderSession,
    createOrderShare,
    createRequestKey,
    fetchOrderBootstrap,
    fetchOrderLeaderboard,
    previewOrderCustomPassage,
    publishOrderScore,
    requestOrderDemo,
    selectOrderOption
} from '../api.js';

const MODE_COPY = {
    practice: { icon: CheckCircle2, name: '單關練習', description: '選一段或隨機練習，不淘汰、不進榜。' },
    endless: { icon: Infinity, name: '無盡闖關', description: '三顆心持續挑戰，每五關補一顆心。' },
    daily: { icon: Crown, name: '模擬每日挑戰', description: '入門、標準、挑戰共三關，每天三次模擬正式機會。' }
};

const DIFFICULTY_LABELS = { INTRO: '入門', STANDARD: '標準', CHALLENGE: '挑戰', LONG: '長篇' };
const newClientKey = () => createRequestKey('order-session');

function playFeedbackTone(enabled, kind) {
    if (!enabled || typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'correct' ? 660 : 220;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    oscillator.addEventListener('ended', () => context.close().catch(() => {}), { once: true });
}

function ModeCard({ mode, selected, onClick }) {
    const item = MODE_COPY[mode];
    const Icon = item.icon;
    return (
        <button type="button" className={`lab-mode-card${selected ? ' is-selected' : ''}`} onClick={onClick} aria-pressed={selected}>
            <span className="lab-mode-icon"><Icon size={22} /></span>
            <span><strong>{item.name}</strong><small>{item.description}</small></span>
        </button>
    );
}

function Progress({ current, total }) {
    if (total > 16) {
        return (
            <div className="lab-progress-long" aria-label={`已完成 ${current}，共 ${total} 個片段`}>
                <div><span style={{ width: `${Math.min(100, (current / total) * 100)}%` }} /></div>
                <strong>剩餘 {Math.max(0, total - current)} 片</strong>
            </div>
        );
    }
    return (
        <div className="lab-progress-dots" aria-label={`已完成 ${current}，共 ${total} 個片段`}>
            <span>Next:</span>
            {Array.from({ length: total }, (_, index) => <i className={index < current ? 'is-done' : ''} key={index} />)}
        </div>
    );
}

function Hearts({ lives }) {
    if (lives === null) return <span className="lab-practice-life">練習</span>;
    return (
        <span className="lab-hearts" aria-label={`剩餘 ${lives} 顆心`}>
            {Array.from({ length: 3 }, (_, index) => <Heart key={index} size={19} fill={index < lives ? 'currentColor' : 'none'} className={index < lives ? '' : 'is-empty'} />)}
        </span>
    );
}

function PassageReview({ review }) {
    if (!review) return null;
    return (
        <section className="lab-review" aria-labelledby="review-title">
            <div className="lab-review-heading">
                <span>完整經文回顧</span>
                <strong id="review-title">{review.reference}</strong>
            </div>
            <div className="lab-review-text">
                {(review.verses || []).map(verse => <p key={verse.verse}><sup>{verse.verse}</sup>{verse.text}</p>)}
            </div>
        </section>
    );
}

export function VerseOrderPage() {
    const [bootstrap, setBootstrap] = useState(null);
    const [mode, setMode] = useState('practice');
    const [practiceSource, setPracticeSource] = useState('official');
    const [passageId, setPassageId] = useState('');
    const [custom, setCustom] = useState({ book: '馬太福音', chapter: 6, verseStart: 9, verseEnd: 13 });
    const [preview, setPreview] = useState(null);
    const [session, setSession] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [soundEnabled, setSoundEnabled] = useState(false);
    const [optionFeedback, setOptionFeedback] = useState(null);
    const [demo, setDemo] = useState(null);
    const [nickname, setNickname] = useState('');
    const [tag, setTag] = useState('勇敢');
    const [published, setPublished] = useState(false);
    const [sharePath, setSharePath] = useState('');
    const timeoutSent = useRef(false);
    const demoTimer = useRef(null);

    const loadLab = useCallback(async () => {
        setBusy(true);
        setError('');
        try {
            const data = await fetchOrderBootstrap();
            setBootstrap(data);
            setPassageId(current => current || data.passages.find(passage => passage.title === '主禱文')?.id || data.passages[0]?.id || '');
            const board = await fetchOrderLeaderboard('daily');
            setLeaderboard(board.results || []);
        } catch (loadError) {
            setError(loadError.message);
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => { loadLab(); }, [loadLab]);
    useEffect(() => () => { if (demoTimer.current) window.clearInterval(demoTimer.current); }, []);

    useEffect(() => {
        if (!session?.timer?.deadlineAt || session.status !== 'active' || demo) return undefined;
        timeoutSent.current = false;
        const tick = () => {
            const milliseconds = new Date(session.timer.deadlineAt).getTime() - Date.now();
            const value = Math.max(0, Math.ceil(milliseconds / 100) / 10);
            setRemainingSeconds(value);
            if (value === 0 && session.mode !== 'practice' && !timeoutSent.current) {
                timeoutSent.current = true;
                selectOrderOption(session.id, { action: 'timeout', idempotencyKey: createRequestKey('timeout') })
                    .then(setSession).catch(timeoutError => setError(timeoutError.message));
            }
        };
        tick();
        const interval = window.setInterval(tick, 100);
        return () => window.clearInterval(interval);
    }, [session?.id, session?.timer?.deadlineAt, session?.status, session?.mode, demo]);

    const officialPassage = useMemo(() => bootstrap?.passages?.find(passage => passage.id === passageId), [bootstrap, passageId]);
    const chapterOptions = CHAPTER_COUNTS[custom.book] || 1;
    const resetMessages = () => { setError(''); setFeedback(''); };

    const updateCustom = (field, value) => {
        setCustom(current => {
            const next = { ...current, [field]: value };
            if (field === 'book') next.chapter = 1;
            return next;
        });
        setPreview(null);
    };

    const start = async () => {
        resetMessages();
        setBusy(true);
        setPublished(false);
        setSharePath('');
        try {
            let customRange;
            if (mode === 'practice' && practiceSource === 'custom') {
                const checked = await previewOrderCustomPassage(custom);
                setPreview(checked);
                customRange = custom;
            }
            const next = await createOrderSession({
                mode,
                passageId: mode === 'practice' && practiceSource === 'official' ? passageId : undefined,
                customRange,
                clientSessionKey: newClientKey()
            });
            setSession(next);
        } catch (startError) {
            setError(startError.message);
        } finally {
            setBusy(false);
        }
    };

    const select = async option => {
        if (busy || option.disabled || session?.status !== 'active') return;
        resetMessages();
        setOptionFeedback({ token: option.token, kind: 'pending' });
        setBusy(true);
        try {
            const beforeLives = session.lives;
            const beforeIndex = session.fragmentIndex;
            const next = await selectOrderOption(session.id, { action: 'select', optionToken: option.token, idempotencyKey: createRequestKey('pick') });
            if (next.fragmentIndex > beforeIndex) {
                setOptionFeedback({ token: option.token, kind: 'correct' });
                playFeedbackTone(soundEnabled, 'correct');
                setFeedback('正確，下一片。');
                await new Promise(resolve => window.setTimeout(resolve, 480));
            } else if (beforeLives === null || next.lives < beforeLives) {
                setOptionFeedback({ token: option.token, kind: 'wrong' });
                playFeedbackTone(soundEnabled, 'wrong');
                setFeedback('順序不對，再看一次上下文。');
                await new Promise(resolve => window.setTimeout(resolve, 650));
            }
            setSession(next);
        } catch (selectError) {
            setError(selectError.message);
        } finally {
            setOptionFeedback(null);
            setBusy(false);
        }
    };

    const showDemo = async () => {
        resetMessages();
        setBusy(true);
        try {
            const data = await requestOrderDemo(session.id, { idempotencyKey: createRequestKey('demo') });
            setSession(data.session);
            const fragments = data.demonstration.fragments;
            setDemo({ fragments, visible: 1 });
            demoTimer.current = window.setInterval(() => {
                setDemo(current => {
                    if (!current || current.visible >= current.fragments.length) {
                        window.clearInterval(demoTimer.current);
                        demoTimer.current = null;
                        window.setTimeout(() => setDemo(null), 800);
                        return current;
                    }
                    return { ...current, visible: current.visible + 1 };
                });
            }, Math.max(300, Math.floor(data.demonstration.durationMs / fragments.length)));
        } catch (demoError) {
            setError(demoError.message);
        } finally {
            setBusy(false);
        }
    };

    const continueStage = async () => {
        setBusy(true);
        resetMessages();
        try {
            setSession(await selectOrderOption(session.id, { action: 'continue', idempotencyKey: createRequestKey('continue') }));
        } catch (continueError) {
            setError(continueError.message);
        } finally {
            setBusy(false);
        }
    };

    const leaveGame = async () => {
        if (session?.id && ['active', 'stage_complete'].includes(session.status)) {
            abandonOrderSession(session.id, { idempotencyKey: createRequestKey('abandon') }).catch(() => {});
        }
        setSession(null);
        setDemo(null);
        setPreview(null);
        setOptionFeedback(null);
        resetMessages();
    };

    const submitScore = async event => {
        event.preventDefault();
        setBusy(true);
        resetMessages();
        try {
            await publishOrderScore(session.id, { nickname, tag, idempotencyKey: createRequestKey('publish') });
            setPublished(true);
            const board = await fetchOrderLeaderboard(session.mode === 'daily' ? 'daily' : 'endless');
            setLeaderboard(board.results || []);
        } catch (publishError) {
            setError(publishError.message);
        } finally {
            setBusy(false);
        }
    };

    const share = async () => {
        setBusy(true);
        setError('');
        try {
            const data = await createOrderShare(session.id);
            setSharePath(data.path);
            await navigator.clipboard?.writeText(new URL(data.path, window.location.origin).href);
        } catch (shareError) {
            setError(shareError.message);
        } finally {
            setBusy(false);
        }
    };

    const playing = session?.status === 'active';
    const result = session && session.status !== 'active';
    const rankable = result && session.ranked && !session.assisted && ['completed', 'failed'].includes(session.status) && session.mode !== 'practice';

    return (
        <AppShell title="經文排序挑戰" eyebrow="經文工具・實驗功能" actions={session ? <button className="text-button lab-exit" type="button" onClick={leaveGame} disabled={busy}><X size={16} /> 離開</button> : null}>
            <div className="lab-banner"><Sparkles size={18} /><span><strong>實驗功能</strong> 分數、英雄榜與獎勵皆為模擬資料，不會影響正式帳號或智匯點數。</span></div>

            {!session && (
                <>
                    <p className="page-intro">依正確次序選出和合本經文片段。每一步最多四個選項；遊戲中不呼叫 AI，也不產生費用。</p>
                    {error && <div className="notice notice-error" role="alert">{error}</div>}
                    {busy && !bootstrap && <div className="empty-state"><LoaderCircle className="spin" size={23} /> 正在準備實驗經文…</div>}
                    {bootstrap && (
                        <div className="lab-setup-grid">
                            <section className="lab-setup-card">
                                <span className="lab-step-label">01　選擇模式</span>
                                <div className="lab-mode-grid">{Object.keys(MODE_COPY).map(value => <ModeCard key={value} mode={value} selected={mode === value} onClick={() => setMode(value)} />)}</div>
                                {mode === 'daily' && <div className="lab-daily-note">今日模擬正式機會剩餘 <strong>{bootstrap.daily.rankedAttemptsRemaining}</strong> 次；超過後仍可練習，但不進實驗榜。</div>}
                            </section>

                            {mode === 'practice' && (
                                <section className="lab-setup-card">
                                    <span className="lab-step-label">02　選擇經文</span>
                                    <div className="lab-source-tabs" role="tablist" aria-label="練習來源">
                                        <button type="button" role="tab" aria-selected={practiceSource === 'official'} onClick={() => setPracticeSource('official')}>20 段實驗題</button>
                                        <button type="button" role="tab" aria-selected={practiceSource === 'custom'} onClick={() => setPracticeSource('custom')}>自選 5–20 節</button>
                                    </div>
                                    {practiceSource === 'official' ? (
                                        <label className="lab-passage-select">實驗經文
                                            <select value={passageId} onChange={event => setPassageId(event.target.value)}>
                                                {bootstrap.passages.map(passage => <option value={passage.id} key={passage.id}>{passage.title}｜{passage.reference}｜{DIFFICULTY_LABELS[passage.difficulty]}</option>)}
                                            </select>
                                            {officialPassage && <small>共 {officialPassage.fragmentCount} 片，完成後可回顧完整經節。</small>}
                                        </label>
                                    ) : (
                                        <div className="lab-custom-grid">
                                            <label>書卷<select value={custom.book} onChange={event => updateCustom('book', event.target.value)}>{BIBLE_GROUPS.map(group => <optgroup label={group.label} key={group.label}>{group.books.map(([book]) => <option key={book}>{book}</option>)}</optgroup>)}</select></label>
                                            <label>章<select value={custom.chapter} onChange={event => updateCustom('chapter', Number(event.target.value))}>{Array.from({ length: chapterOptions }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select></label>
                                            <label>起節<input type="number" min="1" value={custom.verseStart} onChange={event => updateCustom('verseStart', Number(event.target.value))} /></label>
                                            <label>迄節<input type="number" min="1" value={custom.verseEnd} onChange={event => updateCustom('verseEnd', Number(event.target.value))} /></label>
                                            <small>必須為同一章、連續 5 至 20 節。自選題只供練習，不呼叫 AI、不進榜。</small>
                                            {preview && <span className="lab-preview-ok"><CheckCircle2 size={15} /> 已驗證逐字重組，共 {preview.passage.fragmentCount} 片</span>}
                                        </div>
                                    )}
                                </section>
                            )}

                            <section className="lab-start-card">
                                <div><strong>{MODE_COPY[mode].name}</strong><p>{mode === 'practice' ? '答錯不淘汰，適合熟悉操作。' : mode === 'endless' ? '完成五關補一心，看看能走多遠。' : '固定三關；完整完成僅顯示預計獎勵。'}</p></div>
                                <button className="primary-button" type="button" onClick={start} disabled={busy || (mode === 'practice' && practiceSource === 'official' && !passageId)}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />} 開始挑戰</button>
                            </section>

                            {leaderboard.length > 0 && <section className="lab-board-card"><div className="lab-board-title"><Crown size={19} /><strong>今日模擬英雄榜</strong><small>實驗資料</small></div><ol>{leaderboard.slice(0, 5).map((entry, index) => <li key={`${entry.nickname}-${index}`}><b>{index + 1}</b><span>{entry.tag}・{entry.nickname}</span><strong>{Number(entry.score).toLocaleString()}</strong></li>)}</ol></section>}
                        </div>
                    )}
                </>
            )}

            {playing && (
                <section className="lab-game" aria-labelledby="lab-passage-title">
                    <header className="lab-hud">
                        <button type="button" className="lab-hud-button" onClick={showDemo} disabled={busy || demo || (session.lives !== null && session.lives < 2)}><Eye size={17} /> 示範</button>
                        <Hearts lives={session.lives} />
                        <span className="lab-multiplier">⚡ {session.multiplier}x</span>
                        <span className="lab-score" aria-label={`分數 ${session.score}`}>{String(session.score).padStart(6, '0')}</span>
                        <span className={`lab-clock${remainingSeconds <= 10 ? ' is-low' : ''}`}><Clock3 size={17} /> {demo ? '暫停' : `${remainingSeconds.toFixed(1)}s`}</span>
                        <button type="button" className="lab-sound" aria-label={soundEnabled ? '關閉音效' : '開啟音效'} aria-pressed={soundEnabled} onClick={() => setSoundEnabled(value => !value)}>{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
                    </header>
                    <div className="lab-stage-meta"><div><span>第 {session.stageNumber} 關・{DIFFICULTY_LABELS[session.passage.difficulty]}</span><h2 id="lab-passage-title">{session.passage.title}</h2><p>{session.passage.reference}</p></div><small>依正確順序選出下一片經文</small></div>
                    {demo ? (
                        <div className="lab-demo" role="status" aria-live="polite"><span>完整次序示範</span><div>{demo.fragments.slice(0, demo.visible).map((fragment, index) => <p key={index}><b>{index + 1}</b>{fragment}</p>)}</div></div>
                    ) : (
                        <div className="lab-option-grid" aria-label="經文片段選項">{session.options.map((option, index) => {
                            const feedbackKind = optionFeedback?.token === option.token ? optionFeedback.kind : null;
                            return (
                                <button
                                    type="button"
                                    key={option.token}
                                    className={[feedbackKind ? `is-${feedbackKind}` : '', option.disabled ? 'is-used' : ''].filter(Boolean).join(' ')}
                                    disabled={busy || option.disabled}
                                    aria-busy={feedbackKind === 'pending'}
                                    onClick={() => select(option)}
                                >
                                    <span className="lab-option-number">{index + 1}</span>
                                    <strong>{option.text}</strong>
                                    {feedbackKind && (
                                        <span className="lab-option-verdict" role="status">
                                            {feedbackKind === 'pending' && <><LoaderCircle className="spin" size={19} /> 判定中</>}
                                            {feedbackKind === 'correct' && <><CheckCircle2 size={20} /> 正確</>}
                                            {feedbackKind === 'wrong' && <><X size={20} /> 順序不對</>}
                                        </span>
                                    )}
                                </button>
                            );
                        })}</div>
                    )}
                    <div className="lab-live-message" aria-live="polite">{feedback || (demo ? '倒數暫停；示範結束後繼續。' : '正確下一片一定在選項中。')}</div>
                    <Progress current={session.fragmentIndex} total={session.fragmentCount} />
                </section>
            )}

            {result && (
                <div className="lab-result-layout">
                    <section className="lab-result-card">
                        <span className="lab-result-crown">{session.status === 'failed' ? '再接再厲' : session.assisted ? '輔助完成' : '挑戰完成'}</span>
                        <h2>{session.status === 'failed' ? '生命值用完了' : '經文次序完成！'}</h2>
                        <div className="lab-final-score"><small>最終得分</small><strong>{Number(session.score).toLocaleString()}</strong></div>
                        {session.lastStageResult && <dl className="lab-score-breakdown"><div><dt>片段得分</dt><dd>{session.lastStageResult.fragmentScore.toLocaleString()}</dd></div><div><dt>通關基礎分</dt><dd>{session.lastStageResult.completionBonus.toLocaleString()}</dd></div><div><dt>時間獎勵</dt><dd>{session.lastStageResult.timeBonus.toLocaleString()}</dd></div></dl>}
                        {session.rewardPreview > 0 && <div className="lab-reward-preview">正式版預計獲得 1 金幣；本次實驗不會發放。</div>}
                        {session.assisted && <div className="notice">本局使用過示範，已標記為輔助完成，不進模擬英雄榜。</div>}
                        <div className="order-actions">
                            {session.status === 'stage_complete' && <button className="primary-button" type="button" onClick={continueStage} disabled={busy}>下一關 <ArrowRight size={17} /></button>}
                            <button className="secondary-button" type="button" onClick={leaveGame}><RotateCcw size={17} /> 回到模式選擇</button>
                            {session.review && <button className="secondary-button" type="button" onClick={share} disabled={busy}><Share2 size={17} /> 實驗分享</button>}
                        </div>
                        {sharePath && <p className="lab-share-ok">分享連結已複製：{sharePath}</p>}
                        {error && <div className="notice notice-error" role="alert">{error}</div>}
                    </section>
                    <PassageReview review={session.review} />
                    {rankable && (
                        <section className="lab-publish-card">
                            <div><Crown size={22} /><span><strong>登上模擬英雄榜</strong><small>只保存本實驗暱稱與分數，不影響正式排行榜。</small></span></div>
                            {published ? <p className="lab-published"><CheckCircle2 size={18} /> 已送出實驗成績</p> : <form onSubmit={submitScore}><div className="lab-tags">{(bootstrap?.tags || []).map(value => <button type="button" className={tag === value ? 'is-selected' : ''} aria-pressed={tag === value} onClick={() => setTag(value)} key={value}>{value}</button>)}</div><label>你的雷雨暱稱<input value={nickname} maxLength="12" onChange={event => setNickname(event.target.value)} placeholder="2–12 個字" /></label><button className="primary-button" type="submit" disabled={busy}>送出實驗榜</button></form>}
                        </section>
                    )}
                </div>
            )}
        </AppShell>
    );
}
