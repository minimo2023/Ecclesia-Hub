import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    Check,
    CheckCircle2,
    CircleHelp,
    Coins,
    Grid2X2,
    Grid3X3,
    Lightbulb,
    LoaderCircle,
    RotateCcw,
    Timer,
    Trophy,
    X
} from 'lucide-react';
import { BIBLE_BOOKS } from '../member/ScriptureReader';
import { useAuth } from '../../contexts/AuthContext';
import { useCoinSystem } from '../../contexts/CoinSystemContext';
import ScriptureBookChapterSelector from '../scripture-reading/ScriptureBookChapterSelector';
import {
    ScriptureMemoryIntro,
    ScriptureMemoryPassagePicker,
    ScriptureMemoryPrimaryAction,
    ScriptureMemoryModePicker,
    ScriptureMemoryExitMenu,
    ScriptureMemorySourceTabs,
    ScriptureMemoryTopbar,
    ScriptureVoiceModeControl
} from '../scripture-memory/ScriptureMemorySetup';
import {
    abandonScriptureOrderSession,
    createScriptureOrderSession,
    forfeitScriptureOrderSession,
    loadScriptureOrderChapter,
    loadScriptureOrderBootstrap,
    previewScriptureOrderRange,
    requestScriptureOrderHint,
    selectScriptureOrderOption
} from './scriptureOrderApi';
import { arrangeOptionSlots, planOptionRefill } from './optionLayout';
import ScriptureOrderRangePicker from './ScriptureOrderRangePicker';
import { validateScriptureOrderRange } from './scriptureOrderSelection';
import ScriptureMemorySettlement from '../scripture-memory/ScriptureMemorySettlement';
import ScriptureMemoryGameHud from '../scripture-memory/ScriptureMemoryGameHud';
import { recordGuestScriptureMemoryReward } from '../scripture-memory/guestScriptureMemoryEconomy';
import { formatScriptureMemoryCardText } from '../scripture-memory/scriptureMemoryCardText';
import useScriptureVoiceInput from '../scripture-memory/useScriptureVoiceInput';
import { useGuestGameExitGuard } from '../game/components/shared/useGuestGameExitGuard';
import './ScriptureOrderGame.css';

const DIFFICULTY_LABELS = {
    INTRO: '入門',
    STANDARD: '標準',
    CHALLENGE: '挑戰',
    LONG: '長篇'
};

const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

async function runStartCountdown(onTick, isCancelled = () => false) {
    for (const value of [3, 2, 1]) {
        if (isCancelled()) return false;
        onTick(value);
        await wait(1000);
    }
    if (isCancelled()) return false;
    onTick('開始');
    await wait(320);
    return !isCancelled();
}

function formatDuration(milliseconds = 0) {
    return `${(Math.max(0, Number(milliseconds) || 0) / 1000).toFixed(1)} 秒`;
}

function Progress({ current, total }) {
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    return (
        <div
            className="scripture-order-progress"
            role="progressbar"
            aria-label="經文記憶進度"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={current}
            aria-valuetext={`已完成 ${current}，共 ${total} 個片段`}
        >
            <div><span>記憶進度</span><strong>{current} / {total}</strong></div>
            <span className="scripture-order-progress-track"><i style={{ width: `${percent}%` }} /></span>
        </div>
    );
}

function PassageReview({ review }) {
    if (!review) return null;
    return (
        <section className="scripture-order-review">
            <span>完整經文回顧</span>
            <h3>{review.title}</h3>
            <p className="scripture-order-reference">{review.reference}・和合本</p>
            <div className="scripture-order-verses">
                {review.verses?.map(verse => (
                    <p key={verse.verse}><sup>{verse.verse}</sup>{verse.text}</p>
                ))}
            </div>
        </section>
    );
}

export default function ScriptureOrderGame({ onExit, onBack, onHome }) {
    const { isLoggedIn, refreshUser } = useAuth();
    const coinSystem = useCoinSystem();
    const { requestGuestGameExit, guestGameExitDialog } = useGuestGameExitGuard();
    const [screen, setScreen] = useState('loading');
    const [bootstrap, setBootstrap] = useState(null);
    const [previousSession, setPreviousSession] = useState(null);
    const [showHelp, setShowHelp] = useState(false);
    const [showExitMenu, setShowExitMenu] = useState(false);
    const [exitPending, setExitPending] = useState(false);
    const [sourceType, setSourceType] = useState('custom');
    const [modeStage, setModeStage] = useState(false);
    const [passageId, setPassageId] = useState('');
    const [featuredStage, setFeaturedStage] = useState('select');
    const [featuredPreview, setFeaturedPreview] = useState(null);
    const [gridSize, setGridSize] = useState(4);
    const [challengeDifficulty, setChallengeDifficulty] = useState('SIMPLE');
    const [testament, setTestament] = useState('old');
    const [customStage, setCustomStage] = useState('location');
    const [expandedBook, setExpandedBook] = useState(null);
    const [customBook, setCustomBook] = useState(null);
    const [customChapter, setCustomChapter] = useState(null);
    const [chapterData, setChapterData] = useState(null);
    const [chapterLoading, setChapterLoading] = useState(false);
    const [customSelection, setCustomSelection] = useState(null);
    const [customPreview, setCustomPreview] = useState(null);
    const [session, setSession] = useState(null);
    const [completedFragments, setCompletedFragments] = useState([]);
    const [optionSlots, setOptionSlots] = useState([]);
    const [mistakes, setMistakes] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [countdown, setCountdown] = useState(3);
    const [feedback, setFeedback] = useState(null);
    const [optionPhase, setOptionPhase] = useState('idle');
    const [incomingOptionKeys, setIncomingOptionKeys] = useState([]);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [hintPending, setHintPending] = useState(false);
    const [hintedToken, setHintedToken] = useState(null);
    const mounted = useRef(true);
    const startCancelled = useRef(false);
    const chapterRequest = useRef(0);
    const hintTimer = useRef(null);
    const helpDialog = useRef(null);
    const helpCloseButton = useRef(null);

    useEffect(() => {
        mounted.current = true;
        loadScriptureOrderBootstrap()
            .then(data => {
                if (!mounted.current) return;
                setBootstrap(data);
                setPreviousSession(data.resumeSession || null);
                setPassageId(data.passages?.[0]?.id || '');
                setScreen('select');
            })
            .catch(error => {
                if (!mounted.current) return;
                setMessage(error.message);
                setScreen('unavailable');
            });
        return () => {
            mounted.current = false;
            window.clearTimeout(hintTimer.current);
        };
    }, []);

    useEffect(() => {
        if (!showHelp) return undefined;
        const previousFocus = document.activeElement;
        const focusFrame = window.requestAnimationFrame(() => helpCloseButton.current?.focus());
        const handleDialogKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setShowHelp(false);
                return;
            }
            if (event.key !== 'Tab' || !helpDialog.current) return;
            const focusable = Array.from(helpDialog.current.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleDialogKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleDialogKeyDown);
            previousFocus?.focus?.();
        };
    }, [showHelp]);

    const selectedPassage = useMemo(
        () => bootstrap?.passages?.find(passage => passage.id === passageId) || null,
        [bootstrap, passageId]
    );
    const selectedFragmentCount = sourceType === 'custom'
        ? Number(customPreview?.passage?.fragmentCount || 0)
        : Number(featuredPreview?.passage?.fragmentCount || selectedPassage?.fragmentCount || 0);
    const selectedHasEnoughFragments = selectedFragmentCount >= 4;
    const selectedPreview = sourceType === 'custom' ? customPreview : featuredPreview;
    const selectedHasSafeFragmentLengths = !selectedPreview || selectedPreview.withinMemoryLimit === true;

    useEffect(() => {
        if (gridSize === 9 && selectedFragmentCount > 0 && selectedFragmentCount < 12) setGridSize(4);
    }, [gridSize, selectedFragmentCount]);
    const customRange = useMemo(() => {
        const valid = validateScriptureOrderRange(customSelection, { min: 1, max: 20 });
        if (!valid.valid || !customBook || !customChapter) return null;
        return {
            book: customBook.name,
            chapter: customChapter,
            verseStart: valid.range.start,
            verseEnd: valid.range.end
        };
    }, [customBook, customChapter, customSelection]);
    const currentRecord = useMemo(
        () => bootstrap?.personalHistory?.records?.find(record => record.passage?.id === session?.passage?.id) || null,
        [bootstrap, session?.passage?.id]
    );
    const resultDurationMs = Number(session?.lastStageResult?.durationMs || elapsedMs || 0);
    const isPersonalBest = Boolean(Number(session?.hintCount || 0) === 0
        && currentRecord?.bestDurationMs
        && resultDurationMs > 0
        && resultDurationMs <= currentRecord.bestDurationMs);

    useEffect(() => {
        const startedAt = session?.timer?.startedAt;
        if (screen !== 'playing' || !startedAt) return undefined;
        const started = new Date(startedAt).getTime();
        const tick = () => setElapsedMs(Math.max(0, Date.now() - started));
        tick();
        const timer = window.setInterval(tick, 50);
        return () => window.clearInterval(timer);
    }, [screen, session?.timer?.startedAt]);

    const switchTestament = nextTestament => {
        setTestament(nextTestament);
        setExpandedBook(null);
        setMessage('');
    };

    const chooseCustomChapter = async (book, chapter) => {
        if (customBook?.code === book.code
            && Number(customChapter) === Number(chapter)
            && chapterData) {
            setExpandedBook(book);
            setCustomStage('verses');
            setMessage('');
            return;
        }
        const requestId = chapterRequest.current + 1;
        chapterRequest.current = requestId;
        setCustomBook(book);
        setCustomChapter(chapter);
        setCustomSelection(null);
        setCustomPreview(null);
        setChapterData(null);
        setChapterLoading(true);
        setCustomStage('verses');
        setMessage('');
        try {
            const data = await loadScriptureOrderChapter(book.name, chapter);
            if (!mounted.current || chapterRequest.current !== requestId) return;
            setChapterData(data);
        } catch (error) {
            if (!mounted.current || chapterRequest.current !== requestId) return;
            setMessage(error.message);
            setCustomStage('location');
        } finally {
            if (mounted.current && chapterRequest.current === requestId) setChapterLoading(false);
        }
    };

    const updateCustomSelection = next => {
        setCustomSelection(next);
        setCustomPreview(null);
        setMessage('');
    };

    const previewCustomRange = async () => {
        if (!customRange || busy) return;
        setBusy(true);
        setMessage('');
        try {
            const preview = await previewScriptureOrderRange(customRange);
            if (!preview.exactReassembly) throw new Error('這段經文目前無法安全切分，請改選其他範圍');
            setCustomPreview(preview);
            setCustomStage('preview');
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    };

    const previewFeaturedPassage = async () => {
        if (!selectedPassage || busy) return;
        setBusy(true);
        setMessage('');
        try {
            const data = await previewScriptureOrderRange({
                book: selectedPassage.book,
                chapter: selectedPassage.chapter,
                verseStart: selectedPassage.verseStart,
                verseEnd: selectedPassage.verseEnd
            });
            if (!mounted.current) return;
            setFeaturedPreview({
                ...data,
                passage: { ...data.passage, title: selectedPassage.title, reference: selectedPassage.reference }
            });
            setFeaturedStage('preview');
        } catch (error) {
            if (mounted.current) setMessage(error.message || '暫時無法預覽經文');
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    const startGame = async () => {
        if (busy
            || (sourceType === 'featured' && !passageId)
            || (sourceType === 'custom' && (!customRange || !customPreview || !customHasEnoughFragments))) return;
        setBusy(true);
        startCancelled.current = false;
        setMessage('');
        try {
            if (previousSession?.id) {
                await abandonScriptureOrderSession(previousSession.id);
                setPreviousSession(null);
            }
            setScreen('countdown');
            const ready = await runStartCountdown(setCountdown, () => startCancelled.current || !mounted.current);
            if (!ready) return;
            setScreen('starting');
            const next = await createScriptureOrderSession({
                passageId: sourceType === 'featured' ? passageId : undefined,
                customRange: sourceType === 'custom' ? customRange : undefined,
                gridSize,
                challengeDifficulty
            });
            if (startCancelled.current || !mounted.current) {
                await forfeitScriptureOrderSession(next.id).catch(() => {});
                return;
            }
            setSession(next);
            setPreviousSession(null);
            setOptionSlots(arrangeOptionSlots({ nextOptions: next.options, slotCount: next.gridSize }));
            setCompletedFragments([]);
            setMistakes(0);
            setElapsedMs(next.timer?.elapsedMs || 0);
            setFeedback(null);
            setOptionPhase('idle');
            setIncomingOptionKeys([]);
            setScreen('playing');
        } catch (error) {
            setMessage(error.message);
            setScreen('select');
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    const chooseOption = async option => {
        if (busy || option.disabled || session?.status !== 'active') return;
        setBusy(true);
        setHintedToken(null);
        window.clearTimeout(hintTimer.current);
        setMessage('');
        setFeedback({ token: option.token, kind: 'pending' });
        try {
            const beforeIndex = session.fragmentIndex;
            const next = await selectScriptureOrderOption(session.id, option.token);
            const correct = next.fragmentIndex > beforeIndex;
            if (correct) {
                setFeedback({ token: option.token, kind: 'correct' });
                setCompletedFragments(next.completedFragments || []);
                await wait(90);
            } else {
                setFeedback({ token: option.token, kind: 'wrong' });
                setMistakes(value => value + 1);
                await wait(110);
            }
            if (!isLoggedIn) {
                const guestReward = recordGuestScriptureMemoryReward({
                    session: next,
                    game: 'order',
                    elapsedMs,
                    balance: coinSystem.coins
                });
                next.reward = guestReward;
                if (guestReward.awardedCoins > 0) {
                    coinSystem.earnCoins(guestReward.awardedCoins, 'scripture_order_guest_reward');
                }
            }
            setSession(next);
            if (isLoggedIn && next.reward?.awardedNow) refreshUser(true).catch(() => {});
            if (correct && next.status === 'active') {
                const refill = planOptionRefill(optionSlots, next.options, next.gridSize);
                setIncomingOptionKeys([]);
                setOptionPhase('shuffling');
                setOptionSlots(refill.shuffledSlots);
                await wait(80);
                setIncomingOptionKeys(refill.incomingKeys);
                setOptionPhase('filling');
                setOptionSlots(refill.finalSlots);
                await wait(90);
                setIncomingOptionKeys([]);
                setOptionPhase('idle');
            } else {
                setOptionSlots(current => arrangeOptionSlots({
                    previousSlots: current,
                    nextOptions: next.options,
                    slotCount: next.gridSize,
                    transition: correct ? 'correct' : 'wrong'
                }));
            }
            if (next.status !== 'active') {
                setElapsedMs(next.lastStageResult?.durationMs || elapsedMs);
                setScreen('result');
                loadScriptureOrderBootstrap().then(data => {
                    setBootstrap(data);
                    setResumableSession(data.resumeSession || null);
                }).catch(() => {});
            }
        } catch (error) {
            setMessage(error.message);
        } finally {
            setFeedback(null);
            setBusy(false);
        }
    };

    const voiceOptions = useMemo(() => optionSlots.filter(Boolean), [optionSlots]);
    const voiceContextKey = useMemo(() => [
        session?.id || '',
        session?.fragmentIndex ?? -1,
        ...voiceOptions.map(option => option.token || option.key || '')
    ].join(':'), [session?.id, session?.fragmentIndex, voiceOptions]);
    const voice = useScriptureVoiceInput({
        active: screen === 'playing'
            && session?.status === 'active'
            && !busy
            && !feedback
            && optionPhase === 'idle',
        contextKey: voiceContextKey,
        options: voiceOptions,
        onSelect: chooseOption,
        paused: showExitMenu || showHelp,
        terminal: screen === 'result' || screen === 'unavailable'
    });

    const useHint = async () => {
        if (!session?.id || hintPending || busy || session.status !== 'active') return;
        const cost = Number(session.hintCost || bootstrap?.hintCost || 5);
        if (!isLoggedIn && coinSystem.coins < cost) {
            setMessage(`智匯金幣不足，高光提示需要 ${cost} 枚。`);
            return;
        }
        setHintPending(true);
        setMessage('');
        try {
            const result = await requestScriptureOrderHint(session.id);
            if (result.hint?.guestDebitRequired) {
                const debit = await coinSystem.spendCoins(result.hint.cost, 'scripture_order_hint');
                if (!debit.success) throw new Error(debit.error || '無法扣除提示金幣');
            } else if (isLoggedIn && result.hint?.charged) {
                await refreshUser(true);
            }
            setSession(result.session);
            setHintedToken(result.hint?.optionToken || null);
            setMessage(result.hint?.alreadyRevealed
                ? '這一片已提示過，未重複扣除金幣。'
                : `已扣除 ${result.hint?.cost ?? cost} 枚金幣，請留意短暫高光。`);
            window.clearTimeout(hintTimer.current);
            hintTimer.current = window.setTimeout(() => setHintedToken(null), 1600);
        } catch (error) {
            if (isLoggedIn && error.code === 'INSUFFICIENT_COINS') await refreshUser(true);
            setMessage(error.message || '提示暫時無法使用');
        } finally {
            setHintPending(false);
        }
    };

    const handleGameKeyDown = event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const tag = event.target?.tagName?.toLowerCase();
        if (event.target?.isContentEditable || ['input', 'select', 'textarea'].includes(tag)) return;
        if (!/^[1-9]$/.test(event.key)) return;
        const option = optionSlots[Number(event.key) - 1];
        if (!option || option.disabled || busy) return;
        event.preventDefault();
        chooseOption(option);
    };

    const resetGame = () => {
        setSession(null);
        setCompletedFragments([]);
        setOptionSlots([]);
        setMistakes(0);
        setElapsedMs(0);
        setFeedback(null);
        setOptionPhase('idle');
        setIncomingOptionKeys([]);
        setMessage('');
        if (sourceType === 'custom' && customPreview) setCustomStage('preview');
        setScreen('select');
    };

    const leave = () => {
        setShowExitMenu(true);
    };

    const leaveTo = async destination => {
        if (exitPending) return false;
        startCancelled.current = true;
        const mustForfeit = screen === 'playing' && session?.status === 'active';
        if (mustForfeit) {
            setExitPending(true);
            setMessage('');
            try {
                await forfeitScriptureOrderSession(session.id);
            } catch (error) {
                startCancelled.current = false;
                if (mounted.current) {
                    setMessage(error.message || '暫時無法結束本局，請稍後再試');
                    setExitPending(false);
                }
                return false;
            }
        }
        destination?.();
        return true;
    };

    const playing = screen === 'playing' && session;
    const immersive = ['countdown', 'starting', 'playing'].includes(screen);

    return (
        <main className={`scripture-order-root${immersive ? ' is-immersive' : ''}`}>
            {!immersive ? <ScriptureMemoryTopbar
                variant="order"
                icon={Grid2X2}
                title="經文四宮格"
                subtitle={session?.gridSize === 9 ? '九宮格・記憶排序' : session?.gridSize === 4 ? '四宮格・記憶排序' : '四／九宮格・記憶排序'}
                onBack={leave}
                actions={(
                    <>
                    <button type="button" onClick={() => setShowHelp(true)} aria-label="查看玩法說明"><CircleHelp size={19} /></button>
                    <span className="scripture-order-version">和合本</span>
                    </>
                )}
            /> : null}

            {screen === 'loading' || screen === 'starting' ? (
                <section className="scripture-order-state" role="status">
                    {screen === 'starting' ? <button type="button" className="scripture-order-game-leave" onClick={leave}><ArrowLeft size={17} />離開</button> : null}
                    <LoaderCircle className="scripture-order-spin" size={34} />
                    <strong>{screen === 'starting' ? '正在建立切片…' : '正在準備經文…'}</strong>
                    <span>經文內容已預先準備，遊戲期間不使用 AI。</span>
                </section>
            ) : null}

            {screen === 'countdown' ? (
                <section className="scripture-order-state scripture-order-countdown" role="status" aria-live="assertive">
                    <button type="button" className="scripture-order-game-leave" onClick={leave}><ArrowLeft size={17} />離開</button>
                    <strong key={countdown} className="scripture-order-countdown-number">{countdown}</strong>
                    <span>正在配置選項，倒數結束後開始計時</span>
                </section>
            ) : null}

            {screen === 'unavailable' ? (
                <section className="scripture-order-state scripture-order-error" role="alert">
                    <X size={34} /><strong>目前無法開始經文四宮格</strong><span>{message}</span>
                    <button type="button" onClick={leave}>返回遊戲分類</button>
                </section>
            ) : null}

            {screen === 'select' && bootstrap ? (
                <section className="scripture-order-setup">
                    <ScriptureMemoryIntro
                        variant="order"
                        icon={Grid2X2}
                        badge="經文記憶"
                        title="把經文片段排回正確次序"
                        description="先選擇要記憶的經文，再依照經文順序完成整段挑戰。完成時間會保留，供自己回顧與比較。"
                    />

                    <ScriptureMemorySourceTabs variant="order" value={sourceType} onChange={nextSource => {
                        setSourceType(nextSource);
                        setModeStage(false);
                        setFeaturedStage('select');
                        setMessage('');
                    }} />

                    {modeStage ? (
                        <section className="scripture-order-mode-step" aria-labelledby="scripture-order-mode-step-title">
                            <div className="scripture-order-step-copy">
                                <span>下一步</span>
                                <div>
                                    <strong id="scripture-order-mode-step-title">選擇遊戲模式</strong>
                                    <p>{sourceType === 'custom'
                                        ? customPreview?.passage?.reference
                                        : `${selectedPassage?.title || '常用經文'}・${selectedPassage?.reference || ''}`}</p>
                                </div>
                            </div>
                            <button type="button" className="scripture-order-mode-back" onClick={() => {
                                setModeStage(false);
                                setMessage('');
                            }}><ArrowLeft size={16} />上一步：返回經文</button>
                        </section>
                    ) : sourceType === 'featured' ? (
                        featuredStage === 'select' ? (
                            <ScriptureMemoryPassagePicker
                                variant="order"
                                passages={bootstrap.passages}
                                selectedId={passageId}
                                onSelect={nextId => {
                                    setPassageId(nextId);
                                    setFeaturedPreview(null);
                                    setMessage('');
                                }}
                                getBadge={passage => DIFFICULTY_LABELS[passage.difficulty] || '記憶'}
                                getMeta={passage => `${passage.reference}・共 ${passage.fragmentCount} 片`}
                            />
                        ) : featuredPreview ? (
                            <section className="scripture-order-custom-preview" aria-labelledby="scripture-order-featured-preview-title">
                                <span>步驟二・預覽經文</span>
                                <h2 id="scripture-order-featured-preview-title">{selectedPassage?.title}</h2>
                                <p>{selectedPassage?.reference}・共 {featuredPreview.passage.fragmentCount} 個片段</p>
                                <div className="scripture-order-text-preview" aria-label="完整經文預覽">
                                    {featuredPreview.verses?.map(verse => (
                                        <p key={verse.verse}><sup>{verse.verse}</sup>{verse.text}</p>
                                    ))}
                                </div>
                                <div className="scripture-order-custom-preview-meta">
                                    <strong>常用經文</strong><span>和合本</span><span>逐字重組已通過</span>
                                </div>
                                <button type="button" onClick={() => {
                                    setFeaturedStage('select');
                                    setMessage('');
                                }}><ArrowLeft size={15} />上一步：選擇經文</button>
                            </section>
                        ) : null
                    ) : (
                        <section className="scripture-order-picker-card">
                            <nav className="scripture-order-step-nav" aria-label="經文選擇步驟">
                                <button
                                    type="button"
                                    className={customStage === 'location' ? 'is-current' : 'is-complete'}
                                    aria-current={customStage === 'location' ? 'step' : undefined}
                                    onClick={() => {
                                        chapterRequest.current += 1;
                                        setChapterLoading(false);
                                        setCustomStage('location');
                                        setMessage('');
                                    }}
                                ><span>1</span><strong>書卷章節</strong></button>
                                <button
                                    type="button"
                                    className={customStage === 'verses' ? 'is-current' : customStage === 'preview' ? 'is-complete' : ''}
                                    aria-current={customStage === 'verses' ? 'step' : undefined}
                                    disabled={!chapterData}
                                    onClick={() => {
                                        setCustomStage('verses');
                                        setMessage('');
                                    }}
                                ><span>2</span><strong>選擇經節</strong></button>
                                <button
                                    type="button"
                                    className={customStage === 'preview' ? 'is-current' : ''}
                                    aria-current={customStage === 'preview' ? 'step' : undefined}
                                    disabled={!customPreview}
                                    onClick={() => {
                                        setCustomStage('preview');
                                        setMessage('');
                                    }}
                                ><span>3</span><strong>確認經文</strong></button>
                            </nav>
                            {customStage === 'location' ? (
                                <div className="scripture-order-location-step">
                                    <div className="scripture-order-step-copy">
                                        <span>步驟一</span>
                                        <div><strong>先選書卷與章節</strong><p>選章後才會載入經文，不會直接開始遊戲。</p></div>
                                    </div>
                                    <ScriptureBookChapterSelector
                                        books={BIBLE_BOOKS}
                                        activeTestament={testament}
                                        expandedBook={expandedBook}
                                        currentBook={customBook}
                                        currentChapter={customChapter}
                                        onTestamentChange={switchTestament}
                                        onBookToggle={book => setExpandedBook(current => current?.code === book.code ? null : book)}
                                        onChapterSelect={chooseCustomChapter}
                                        variant={typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop'}
                                    />
                                </div>
                            ) : null}

                            {customStage === 'verses' ? (
                                <ScriptureOrderRangePicker
                                    chapterData={chapterData}
                                    loading={chapterLoading}
                                    selection={customSelection}
                                    onSelectionChange={updateCustomSelection}
                                    minimumVerses={1}
                                    maximumVerses={20}
                                    onBack={() => {
                                        chapterRequest.current += 1;
                                        setChapterLoading(false);
                                        setCustomStage('location');
                                        setMessage('');
                                    }}
                                />
                            ) : null}

                            {customStage === 'preview' && customPreview ? (
                                <section className="scripture-order-custom-preview" aria-labelledby="scripture-order-custom-preview-title">
                                    <span>步驟三・確認經文</span>
                                    <h2 id="scripture-order-custom-preview-title">{customPreview.passage.reference}</h2>
                                    <p>{selectedHasEnoughFragments
                                        ? `共 ${customPreview.passage.fragmentCount} 個片段；遊戲會從四個候選片段中依序選取。`
                                        : `已成功讀取，但健康切片只有 ${customPreview.passage.fragmentCount} 片；四宮格至少需要 4 片，請多選一節或改選較長經文。`}</p>
                                    <div className="scripture-order-text-preview" aria-label="完整經文預覽">
                                        {customPreview.verses?.map(verse => (
                                            <p key={verse.verse}><sup>{verse.verse}</sup>{verse.text}</p>
                                        ))}
                                    </div>
                                    {!selectedHasSafeFragmentLengths ? (
                                        <p className="scripture-order-fragment-warning" role="alert">
                                            有片段超過 {customPreview.maximumVisibleLength || 10} 字，請先重新切片後再開始。
                                        </p>
                                    ) : null}
                                    <div className="scripture-order-custom-preview-meta">
                                        <strong>{customSelection?.count} 節</strong>
                                        <span>和合本</span>
                                        <span>逐字重組已通過</span>
                                    </div>
                                    <button type="button" onClick={() => {
                                        setCustomStage('verses');
                                    }}><ArrowLeft size={15} />上一步：選擇經節</button>
                                </section>
                            ) : null}

                            {customStage === 'verses' ? (
                                <p className="scripture-order-helper">同一章可選擇 1 至 20 節；選擇多節時須連續，切片預覽通過後才可開始。</p>
                            ) : null}
                        </section>
                    )}

                    {modeStage ? (
                        <>
                        <ScriptureMemoryModePicker
                            variant="order"
                            difficulty={challengeDifficulty}
                            onDifficultyChange={setChallengeDifficulty}
                            gridSize={gridSize}
                            onGridSizeChange={setGridSize}
                            fragmentCount={selectedFragmentCount}
                        />
                        <ScriptureVoiceModeControl voice={voice} />
                        </>
                    ) : null}

                    {message ? <div className="scripture-order-message scripture-order-message-error" role="alert">{message}</div> : null}
                    {modeStage || sourceType === 'featured' || customStage !== 'location' ? (
                        <ScriptureMemoryPrimaryAction
                            variant="order"
                            type="button"
                            aria-label="確認經文與遊戲設定"
                            onClick={modeStage
                                ? startGame
                                : sourceType === 'custom' && customStage === 'verses'
                                    ? previewCustomRange
                                    : sourceType === 'featured' && featuredStage === 'select'
                                        ? previewFeaturedPassage
                                        : () => setModeStage(true)}
                            disabled={busy
                                || (sourceType === 'featured' && !passageId)
                                || (sourceType === 'custom' && (!customRange || chapterLoading))
                                || ((modeStage || customStage === 'preview' || featuredStage === 'preview')
                                    && (!selectedHasEnoughFragments || !selectedHasSafeFragmentLengths))}
                        >
                            {busy ? <LoaderCircle className="scripture-order-spin" size={19} /> : gridSize === 9 ? <Grid3X3 size={19} /> : <Grid2X2 size={19} />}
                            {modeStage
                                ? '開始挑戰'
                                : sourceType === 'custom' && customStage === 'verses'
                                ? customRange ? '下一步：預覽經文' : '請先選擇經文範圍'
                                : sourceType === 'featured' && featuredStage === 'select'
                                ? '下一步：預覽經文'
                                : '下一步：遊戲模式'}
                        </ScriptureMemoryPrimaryAction>
                    ) : null}

                    {bootstrap.practiceRankings?.length > 0 ? (
                        <details className="scripture-order-secondary-section">
                            <summary><Trophy size={17} />常用經文<span>查看完成次數排行</span></summary>
                        <section className="scripture-order-rankings" aria-labelledby="scripture-order-ranking-title">
                            <div className="scripture-order-rankings-heading">
                                <span><Trophy size={18} /></span>
                                <div><h2 id="scripture-order-ranking-title">常用經文</h2><p>依所有玩家完成挑戰的次數排列</p></div>
                            </div>
                            <ol>
                                {bootstrap.practiceRankings.slice(0, 5).map((item, index) => (
                                    <li key={item.passage.id}>
                                        <span>{index + 1}</span>
                                        <div>
                                            <strong>{item.passage.title}</strong>
                                            <small>{item.passage.reference}</small>
                                        </div>
                                        <div><strong>{item.playCount} 次完成</strong><small>依完成次數排列</small></div>
                                    </li>
                                ))}
                            </ol>
                        </section>
                        </details>
                    ) : null}

                    {bootstrap.personalHistory?.recent?.length > 0 ? (
                        <details className="scripture-order-secondary-section">
                            <summary><RotateCcw size={17} />我的挑戰紀錄<span>查看最近完成紀錄</span></summary>
                        <section className="scripture-order-history" aria-labelledby="scripture-order-history-title">
                            <div className="scripture-order-history-heading">
                                <div><RotateCcw size={18} /><span><h2 id="scripture-order-history-title">我的挑戰紀錄</h2><p>完成 {bootstrap.personalHistory.totalCompleted} 次・{bootstrap.personalHistory.uniquePassages} 段經文</p></span></div>
                            </div>
                            <ul>
                                {bootstrap.personalHistory.recent.slice(0, 5).map((item, index) => (
                                    <li key={`${item.passage.id}-${item.completedAt}-${index}`}>
                                        <div><strong>{item.passage.title}</strong><small>{item.passage.reference}</small></div>
                                        <div><strong>{formatDuration(item.durationMs)}</strong><small>錯誤 {item.mistakes} 次</small></div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                        </details>
                    ) : null}
                </section>
            ) : null}

            {playing ? (
                <>
                <ScriptureMemoryGameHud
                    onLeave={leave}
                    lives={session.lives}
                    multiplier={session.multiplier}
                    streak={session.streak}
                    elapsedMs={elapsedMs}
                    coins={coinSystem.coins}
                />
                <section className="scripture-order-game" onKeyDown={handleGameKeyDown}>
                    <div className="scripture-order-game-heading">
                        <div><div className="scripture-order-game-kicker"><span>{session.gridSize === 9 ? '九宮格' : '四宮格'}・隨機洗牌</span></div><h1>{session.passage?.title}</h1><p>{session.passage?.reference}</p></div>
                    </div>

                    <Progress current={session.fragmentIndex} total={session.fragmentCount} />

                    <section className="scripture-order-built" aria-live="polite">
                        <span>已排好的經文</span>
                        {completedFragments.length > 0
                            ? <p>{completedFragments.join('')}</p>
                            : <p className="is-empty">從下方選出第一個片段</p>}
                    </section>

                    <div className={`scripture-order-options is-${optionPhase} is-grid-${session.gridSize || 4}`} role="group" aria-label={`下一片經文選項，可按數字鍵 1 至 ${session.gridSize || 4} 選擇`}>
                        {optionSlots.map((option, index) => {
                            if (!option) return <span key={`empty-${index}`} className="scripture-order-empty-slot" aria-hidden="true" />;
                            const state = feedback?.token === option.token ? feedback.kind : '';
                            const isHinted = hintedToken === option.token && !state;
                            return (
                                <button
                                    key={option.key || option.token}
                                    type="button"
                                    disabled={busy || option.disabled}
                                    aria-keyshortcuts={String(index + 1)}
                                    aria-label={`${index + 1} ${option.text}${isHinted ? '，提示高光' : ''}`}
                                    className={`${state ? `is-${state}` : ''}${option.disabled ? ' is-disabled' : ''}${incomingOptionKeys.includes(option.key || option.token) ? ' is-filling' : ''}${isHinted ? ' is-hinted' : ''}`}
                                    onClick={() => chooseOption(option)}
                                >
                                    <span>{index + 1}</span>
                                    <strong>{formatScriptureMemoryCardText(option.text)}</strong>
                                    {state === 'correct' ? <i><CheckCircle2 size={20} />正確</i> : null}
                                    {state === 'wrong' ? <i><X size={20} />順序不對</i> : null}
                                </button>
                            );
                        })}
                    </div>
                    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                        {feedback?.kind === 'correct' ? '順序正確' : feedback?.kind === 'wrong' ? '順序不對，請再試一次' : ''}
                    </span>
                    <ScriptureVoiceModeControl voice={voice} compact />
                    <div className="scripture-order-game-actions">
                        <div className="scripture-order-tip"><Check size={17} />答錯會扣 1 顆愛心；愛心歸零即挑戰失敗。</div>
                        <button type="button" onClick={useHint} disabled={busy || hintPending}>
                            {hintPending ? <LoaderCircle className="scripture-order-spin" size={17} /> : <Lightbulb size={17} />}
                            高光提示 <span>{session.hintCost || bootstrap?.hintCost || 5}<Coins size={14} /></span>
                        </button>
                    </div>
                    {message ? <div className={`scripture-order-message ${hintedToken ? 'scripture-order-message-success' : 'scripture-order-message-error'}`} role="status">{message}</div> : null}
                </section>
                </>
            ) : null}

            {screen === 'result' && session ? (
                <section className="scripture-order-result">
                    <div className={`scripture-order-result-title ${session.status === 'failed' ? 'is-failed' : ''}`}>
                        {session.status === 'failed' ? <X size={42} /> : <CheckCircle2 size={42} />}
                        <span><strong>{session.status === 'failed' ? '本次挑戰未完成' : '經文次序完成'}</strong><small>{session.passage?.title}・{session.passage?.reference}</small></span>
                    </div>
                    <div className="scripture-order-result-metrics">
                        <article><Timer size={20} /><span><small>完成時間</small><strong>{formatDuration(resultDurationMs)}</strong></span></article>
                        <article><X size={20} /><span><small>嘗試錯誤</small><strong>{mistakes} 次</strong></span></article>
                        <article className={session.status === 'completed' && isPersonalBest ? 'is-best' : ''}><Trophy size={20} /><span><small>{session.status === 'failed' ? '挑戰結果' : session.hintCount > 0 ? '輔助完成' : isPersonalBest ? '本次成績' : '個人最佳'}</small><strong>{session.status === 'failed' ? '尚未完成' : session.hintCount > 0 ? `提示 ${session.hintCount} 次` : isPersonalBest ? '新的最佳' : currentRecord?.bestDurationMs ? formatDuration(currentRecord.bestDurationMs) : '首次無提示完成'}</strong></span></article>
                    </div>
                    <ScriptureMemorySettlement
                        completed={session.status === 'completed'}
                        reward={session.reward}
                    />
                    <PassageReview review={session.review} />
                    <div className="scripture-order-result-actions">
                        <button className="scripture-order-primary" type="button" onClick={session.status === 'failed' ? startGame : resetGame} disabled={busy}><RotateCcw size={18} />{session.status === 'failed' ? '重新挑戰' : '再挑戰一段'}</button>
                        <button className="scripture-order-secondary" type="button" onClick={leave}><ArrowLeft size={18} />離開遊戲</button>
                    </div>
                </section>
            ) : null}

            <ScriptureMemoryExitMenu
                open={showExitMenu}
                onClose={() => setShowExitMenu(false)}
                onBack={() => leaveTo(onBack || onExit)}
                onHome={() => requestGuestGameExit(() => leaveTo(onHome || onExit))}
                busy={exitPending}
                willForfeit={screen === 'playing' && session?.status === 'active'}
                variant="order"
            />
            {guestGameExitDialog}

            {showHelp ? (
                <div className="scripture-order-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget) setShowHelp(false);
                }}>
                    <section ref={helpDialog} className="scripture-order-help-dialog" role="dialog" aria-modal="true" aria-labelledby="scripture-order-help-title">
                        <header><div><Grid2X2 size={22} /><h2 id="scripture-order-help-title">經文四宮格怎麼玩</h2></div><button ref={helpCloseButton} type="button" onClick={() => setShowHelp(false)} aria-label="關閉玩法說明"><X size={20} /></button></header>
                        <ol>
                            <li><strong>依序選片段</strong><span>每一步的正確下一片一定在畫面上的選項中。</span></li>
                            <li><strong>答對就洗牌</strong><span>正解不會連續出現在同一格，避免只記位置。</span></li>
                            <li><strong>三次錯誤失敗</strong><span>錯誤片段會快速替換；第三次錯誤會結束本次挑戰。</span></li>
                            <li><strong>失敗就重來</strong><span>未完成的舊局不會續玩，下一次挑戰會從第一片重新開始。</span></li>
                        </ol>
                        <button type="button" onClick={() => setShowHelp(false)}>知道了</button>
                    </section>
                </div>
            ) : null}
        </main>
    );
}
