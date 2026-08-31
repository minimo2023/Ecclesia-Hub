import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    CheckCircle2,
    CloudRain,
    Coins,
    Lightbulb,
    RotateCcw,
    Trophy,
    XCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCoinSystem } from '../../contexts/CoinSystemContext';
import {
    createScriptureRainSession,
    forfeitScriptureRainSession,
    loadScriptureRainBootstrap,
    recordScriptureRainEvent,
    startScriptureRainSession,
    spendScriptureRainHint
} from './scriptureRainApi';
import ScriptureRainPreview from './ScriptureRainPreview';
import ScriptureRainSetup from './ScriptureRainSetup';
import { ScriptureMemoryExitMenu, ScriptureMemoryTopbar } from '../scripture-memory/ScriptureMemorySetup';
import ScriptureMemorySettlement from '../scripture-memory/ScriptureMemorySettlement';
import ScriptureMemoryGameHud from '../scripture-memory/ScriptureMemoryGameHud';
import { recordGuestScriptureMemoryReward } from '../scripture-memory/guestScriptureMemoryEconomy';
import { formatScriptureMemoryCardText } from '../scripture-memory/scriptureMemoryCardText';
import useScriptureVoiceInput from '../scripture-memory/useScriptureVoiceInput';
import { useGuestGameExitGuard } from '../game/components/shared/useGuestGameExitGuard';
import {
    buildContinuousRainFragments,
    rainCardMotion,
    rainExpectedReentryDelayMs,
    rainLaunchGapMs,
    rainOpeningDelayMs,
    rainVisibleCapacity,
    visibleRainText
} from './scriptureRainMotion';
import './ScriptureRainGame.css';

function requestId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `rain_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const countdownPause = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

async function runStartCountdown(onTick, isCancelled = () => false) {
    for (const value of [3, 2, 1]) {
        if (isCancelled()) return false;
        onTick(value);
        await countdownPause(1000);
    }
    if (isCancelled()) return false;
    onTick('開始');
    await countdownPause(320);
    return !isCancelled();
}

export default function ScriptureRainGame({ onExit, onBack, onHome }) {
    const { isLoggedIn, getToken, refreshUser } = useAuth();
    const coinSystem = useCoinSystem();
    const { requestGuestGameExit, guestGameExitDialog } = useGuestGameExitGuard();
    const [screen, setScreen] = useState('loading');
    const [bootstrap, setBootstrap] = useState(null);
    const [setupRequest, setSetupRequest] = useState(null);
    const [session, setSession] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [lives, setLives] = useState(3);
    const [streak, setStreak] = useState(0);
    const [multiplier, setMultiplier] = useState(1);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [rainCards, setRainCards] = useState([]);
    const [feedback, setFeedback] = useState(null);
    const [hintedFragmentId, setHintedFragmentId] = useState(null);
    const [hintPending, setHintPending] = useState(false);
    const [message, setMessage] = useState('');
    const [countdown, setCountdown] = useState(3);
    const [resultReason, setResultReason] = useState('');
    const [showExitMenu, setShowExitMenu] = useState(false);
    const [exitPending, setExitPending] = useState(false);
    const finishedRef = useRef(false);
    const eventPendingRef = useRef(false);
    const mountedRef = useRef(true);
    const exitRequestedRef = useRef(false);
    const feedbackTimerRef = useRef(null);
    const hintTimerRef = useRef(null);
    const cardSequenceRef = useRef(0);
    const rainSpawnOrdinalRef = useRef(0);
    const nextRainSpawnAtRef = useRef(0);
    const rootRef = useRef(null);
    const stageRef = useRef(null);
    const assemblyPanelRef = useRef(null);
    const assembledRef = useRef(null);
    const [stageMetrics, setStageMetrics] = useState(() => {
        const width = Math.max(1, window.innerWidth);
        const compact = width <= 640;
        return {
            width,
            height: Math.max(1, window.innerHeight),
            reservedTop: compact ? 170 : 125
        };
    });
    const compactStage = stageMetrics.width <= 640;
    const visibleRainCapacity = useMemo(() => rainVisibleCapacity(
        stageMetrics.width,
        stageMetrics.height,
        stageMetrics.reservedTop
    ), [stageMetrics.height, stageMetrics.reservedTop, stageMetrics.width]);
    const rainLayoutRef = useRef({ compact: compactStage, capacity: visibleRainCapacity });

    useEffect(() => {
        let cancelled = false;
        loadScriptureRainBootstrap()
            .then(data => {
                if (cancelled) return;
                setBootstrap(data);
                setScreen('select');
            })
            .catch(error => {
                if (cancelled) return;
                setMessage(error.message);
                setScreen('unavailable');
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            clearTimeout(feedbackTimerRef.current);
            clearTimeout(hintTimerRef.current);
        };
    }, []);

    useLayoutEffect(() => {
        if (!['select', 'preview', 'result', 'playing'].includes(screen)) return;
        rootRef.current?.scrollTo({ top: 0, left: 0 });
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [screen]);

    useLayoutEffect(() => {
        if (!['countdown', 'playing'].includes(screen) || !stageRef.current) return undefined;
        const stage = stageRef.current;
        const assembly = assemblyPanelRef.current;
        const updateStageMetrics = () => {
            const stageRect = stage.getBoundingClientRect();
            const assemblyRect = assembly?.getBoundingClientRect();
            const next = {
                width: Math.max(1, Math.round(stageRect.width)),
                height: Math.max(1, Math.round(stageRect.height)),
                reservedTop: Math.max(0, Math.round((assemblyRect?.bottom || stageRect.top) - stageRect.top + 12))
            };
            setStageMetrics(previous => (
                previous.width === next.width
                && previous.height === next.height
                && previous.reservedTop === next.reservedTop
                    ? previous
                    : next
            ));
        };
        updateStageMetrics();
        if (!globalThis.ResizeObserver) return undefined;
        const observer = new ResizeObserver(updateStageMetrics);
        observer.observe(stage);
        if (assembly) observer.observe(assembly);
        return () => observer.disconnect();
    }, [screen]);

    const finishGame = useCallback((reason, finalSession = null) => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        if (finalSession) setSession(finalSession);
        setResultReason(reason);
        setScreen('result');
    }, []);

    useEffect(() => {
        if (screen !== 'playing' || !session) return undefined;
        const started = new Date(session.startedAt).getTime();
        const tick = () => setElapsedMs(Math.max(0, Date.now() - started));
        tick();
        const timer = setInterval(tick, 50);
        return () => clearInterval(timer);
    }, [screen, session?.startedAt]);

    useLayoutEffect(() => {
        const assembled = assembledRef.current;
        if (!assembled || currentIndex < 1) return;
        assembled.scrollTo({ top: assembled.scrollHeight, behavior: 'smooth' });
    }, [currentIndex]);

    const createRainCard = useCallback((fragment, slotIndex = 0, enterFromTop = false, motionGroup = null, entryDelayMs = 0, challengeSpeed = 'MEDIUM') => {
        const sequence = cardSequenceRef.current;
        cardSequenceRef.current += 1;
        const motionSeed = motionGroup || `${Date.now()}:${Math.random()}:${sequence}`;
        const rainMotion = rainCardMotion(fragment, slotIndex, motionSeed, compactStage, challengeSpeed);
        return {
            ...fragment,
            challengeSpeed,
            rainCycle: 0,
            rainInstanceId: `${fragment.id}:${sequence}:${requestId()}`,
            rainMotion: enterFromTop
                ? { ...rainMotion, '--rain-delay': `${(entryDelayMs / 1000).toFixed(2)}s` }
                : rainMotion
        };
    }, [compactStage]);

    const rainWindowPolicy = useCallback((difficulty) => {
        const visibleCapacity = visibleRainCapacity;
        const externalCount = difficulty === 'HARD' ? 2 : difficulty === 'MEDIUM' ? 1 : 0;
        return {
            visibleCapacity,
            sourceCapacity: Math.max(1, visibleCapacity - externalCount)
        };
    }, [visibleRainCapacity]);

    const launchGapMs = useMemo(() => rainLaunchGapMs(
        stageMetrics.height,
        stageMetrics.reservedTop,
        visibleRainCapacity,
        compactStage,
        session?.challengeSpeed || 'MEDIUM'
    ), [compactStage, session?.challengeSpeed, stageMetrics.height, stageMetrics.reservedTop, visibleRainCapacity]);

    const createRainWindowCards = useCallback((nextSession, nextIndex = 0) => {
        const randomSeed = `${nextSession.id}:${Date.now()}:${Math.random()}`;
        const { sourceCapacity } = rainWindowPolicy(nextSession.difficulty);
        const windowFragments = nextSession.fragments.slice(nextIndex, nextIndex + sourceCapacity);
        const speed = nextSession.challengeSpeed || 'MEDIUM';
        const openingGapLimit = rainLaunchGapMs(
            stageMetrics.height,
            stageMetrics.reservedTop,
            visibleRainCapacity,
            compactStage,
            speed
        );
        return buildContinuousRainFragments(
            windowFragments,
            nextSession.externalFragments,
            nextSession.difficulty,
            randomSeed
        ).map((fragment, slotIndex) => createRainCard(
            fragment,
            slotIndex,
            true,
            randomSeed,
            rainOpeningDelayMs(slotIndex, randomSeed, compactStage, speed, openingGapLimit),
            speed
        ));
    }, [compactStage, createRainCard, rainWindowPolicy, stageMetrics.height, stageMetrics.reservedTop, visibleRainCapacity]);

    const reserveRainLaunch = useCallback((challengeSpeed = 'MEDIUM') => {
        const now = performance.now();
        const scheduledAt = Math.max(now, nextRainSpawnAtRef.current);
        nextRainSpawnAtRef.current = scheduledAt + rainLaunchGapMs(
            stageMetrics.height,
            stageMetrics.reservedTop,
            visibleRainCapacity,
            compactStage,
            challengeSpeed
        );
        return Math.max(0, scheduledAt - now);
    }, [compactStage, stageMetrics.height, stageMetrics.reservedTop, visibleRainCapacity]);

    const replenishRainWindow = useCallback((previous, nextSession, nextIndex, removedInstanceId) => {
        const { sourceCapacity } = rainWindowPolicy(nextSession.difficulty);
        const surviving = previous.filter(card => card.rainInstanceId !== removedInstanceId);
        const targetSources = nextSession.fragments.slice(nextIndex, nextIndex + sourceCapacity);
        const existingIds = new Set(surviving.map(card => card.id));
        const missingSources = targetSources.filter(fragment => !existingIds.has(fragment.id));
        const speed = nextSession.challengeSpeed || 'MEDIUM';
        return [
            ...surviving,
            ...missingSources.map(fragment => {
                const spawnOrdinal = rainSpawnOrdinalRef.current;
                rainSpawnOrdinalRef.current += 1;
                return createRainCard(
                    fragment,
                    spawnOrdinal,
                    true,
                    nextSession.id,
                    reserveRainLaunch(speed),
                    speed
                );
            })
        ];
    }, [createRainCard, rainWindowPolicy, reserveRainLaunch]);

    useEffect(() => {
        const previousLayout = rainLayoutRef.current;
        const layoutChanged = previousLayout.compact !== compactStage;
        const capacityChanged = previousLayout.capacity !== visibleRainCapacity;
        rainLayoutRef.current = { compact: compactStage, capacity: visibleRainCapacity };
        if ((!layoutChanged && !capacityChanged) || !['countdown', 'playing'].includes(screen)) return;
        if (capacityChanged && session) {
            const replacement = createRainWindowCards(session, currentIndex);
            rainSpawnOrdinalRef.current = replacement.length;
            setRainCards(replacement);
            nextRainSpawnAtRef.current = performance.now() + launchGapMs;
            return;
        }
        const motionGroup = `${Date.now()}:responsive:${compactStage}`;
        setRainCards(previous => previous.length ? previous.map((card, slotIndex) => {
            const nextMotion = rainCardMotion(card, slotIndex, motionGroup, compactStage, card.challengeSpeed || 'MEDIUM');
            const entryDelay = card.rainMotion?.['--rain-delay'];
            return {
                ...card,
                rainMotion: entryDelay && !entryDelay.startsWith('-')
                    ? { ...nextMotion, '--rain-delay': entryDelay }
                    : nextMotion
            };
        }) : previous);
    }, [compactStage, createRainWindowCards, currentIndex, launchGapMs, screen, session, visibleRainCapacity]);

    const prepareGame = async (request) => {
        exitRequestedRef.current = false;
        setMessage('');
        setScreen('preparing');
        setSetupRequest(request);
        try {
            const data = await createScriptureRainSession(request);
            setSession(data.session);
            await beginGame(data.session);
        } catch (error) {
            setMessage(error.message);
            setScreen('select');
        }
    };

    const beginGame = async (preparedSession = session) => {
        if (!preparedSession) return;
        exitRequestedRef.current = false;
        setCurrentIndex(preparedSession.currentIndex || 0);
        setScreen('countdown');
        cardSequenceRef.current = 0;
        rainSpawnOrdinalRef.current = 0;
        nextRainSpawnAtRef.current = 0;
        const openingCards = createRainWindowCards(preparedSession, preparedSession.currentIndex || 0);
        rainSpawnOrdinalRef.current = openingCards.length;
        setRainCards(openingCards);
        try {
            const ready = await runStartCountdown(setCountdown, () => exitRequestedRef.current || !mountedRef.current);
            if (!ready) return;
            const result = await startScriptureRainSession(preparedSession.id);
            const next = result.session;
            if (exitRequestedRef.current || !mountedRef.current) {
                await forfeitScriptureRainSession(next.id).catch(() => {});
                return;
            }
            setSession(next);
            setCurrentIndex(next.currentIndex || 0);
            setLives(next.lives || 3);
            setStreak(0);
            setMultiplier(1);
            setFeedback(null);
            setHintedFragmentId(null);
            setResultReason('');
            finishedRef.current = false;
            eventPendingRef.current = false;
            setElapsedMs(next.elapsedMs || 0);
            const lastOpeningDelayMs = openingCards.reduce((maximum, card) => {
                const delaySeconds = Number.parseFloat(card.rainMotion?.['--rain-delay']) || 0;
                return Math.max(maximum, delaySeconds * 1000);
            }, 0);
            nextRainSpawnAtRef.current = performance.now()
                + lastOpeningDelayMs
                + rainLaunchGapMs(
                    stageMetrics.height,
                    stageMetrics.reservedTop,
                    visibleRainCapacity,
                    compactStage,
                    next.challengeSpeed || 'MEDIUM'
                );
            rootRef.current?.scrollTo({ top: 0, left: 0 });
            setScreen('playing');
        } catch (error) {
            setMessage(error.message);
            setScreen('select');
        }
    };

    const leaveTo = async destination => {
        if (exitPending) return false;
        exitRequestedRef.current = true;
        const mustForfeit = screen === 'playing' && session?.status === 'active';
        if (mustForfeit) {
            setExitPending(true);
            setMessage('');
            try {
                await forfeitScriptureRainSession(session.id);
            } catch (error) {
                exitRequestedRef.current = false;
                if (mountedRef.current) {
                    setMessage(error.message || '暫時無法結束本局，請稍後再試');
                    setExitPending(false);
                }
                return false;
            }
        }
        destination?.();
        return true;
    };

    const submitRainEvent = async (fragment) => {
        if (screen !== 'playing' || eventPendingRef.current || !session) return;
        eventPendingRef.current = true;
        const expected = session.fragments[currentIndex];
        const anticipatedCorrect = fragment?.id === expected?.id
            || visibleRainText(fragment?.text) === visibleRainText(expected?.text);
        setFeedback({ instanceId: fragment.rainInstanceId, type: anticipatedCorrect ? 'correct' : 'wrong' });
        setMessage(anticipatedCorrect ? '順序正確' : '順序不對，失去一顆心。');
        try {
            const result = await recordScriptureRainEvent(session.id, {
                type: 'select',
                fragmentId: fragment?.id
            });
            const next = result.session;
            if (result.outcome.correct) {
                const nextStreak = streak + 1;
                setStreak(nextStreak);
                setMultiplier(nextStreak % 3 === 0 ? Math.min(5, multiplier + 1) : multiplier);
            } else {
                setStreak(0);
                setMultiplier(1);
            }
            await new Promise(resolve => {
                clearTimeout(feedbackTimerRef.current);
                feedbackTimerRef.current = setTimeout(resolve, result.outcome.correct ? 220 : 260);
            });
            if (!isLoggedIn) {
                const guestReward = recordGuestScriptureMemoryReward({
                    session: next,
                    game: 'rain',
                    elapsedMs,
                    balance: coinSystem.coins
                });
                next.reward = guestReward;
                if (guestReward.awardedCoins > 0) {
                    coinSystem.earnCoins(guestReward.awardedCoins, 'scripture_rain_guest_reward');
                }
            }
            setSession(next);
            if (isLoggedIn && next.reward?.awardedNow) refreshUser(true).catch(() => {});
            setCurrentIndex(next.currentIndex || 0);
            setLives(next.lives);
            setFeedback(null);
            if (result.outcome.correct) {
                const previousVerse = Number(session.fragments[currentIndex]?.verse);
                const nextVerse = Number(next.fragments[next.currentIndex]?.verse);
                if (!result.outcome.completed) {
                    setRainCards(previous => replenishRainWindow(
                        previous,
                        next,
                        next.currentIndex || 0,
                        fragment.rainInstanceId
                    ));
                }
                if (!result.outcome.completed && Number.isFinite(nextVerse) && nextVerse !== previousVerse) {
                    setMessage(`第 ${previousVerse} 節完成，接著進入第 ${nextVerse} 節。`);
                }
            }
            if (result.outcome.completed) {
                finishGame('complete', next);
            }
            else if (result.outcome.failed) finishGame('lives', next);
        } catch (error) {
            setMessage(error.message || '這次操作沒有成功，請再試一次。');
            setFeedback(null);
        } finally {
            eventPendingRef.current = false;
        }
    };

    const handleFragment = fragment => submitRainEvent(fragment);

    const recycleRainCard = useCallback((instanceId) => {
        if (screen !== 'playing') return;
        const challengeSpeed = session?.challengeSpeed || 'MEDIUM';
        const expectedFragment = session?.fragments?.[currentIndex];
        const expectedText = visibleRainText(expectedFragment?.text);
        const recycledCard = rainCards.find(card => card.rainInstanceId === instanceId);
        const isExpectedCard = Boolean(expectedFragment && recycledCard) && (
            recycledCard.id === expectedFragment.id
            || (expectedText && visibleRainText(recycledCard.text) === expectedText)
        );
        const spawnOrdinal = rainSpawnOrdinalRef.current;
        rainSpawnOrdinalRef.current += 1;
        const entryDelayMs = isExpectedCard
            ? rainExpectedReentryDelayMs(compactStage, challengeSpeed)
            : reserveRainLaunch(challengeSpeed);
        const motionGroup = session?.id || 'scripture-rain-cycle';
        setRainCards(previous => previous.map(card => {
            if (card.rainInstanceId !== instanceId) return card;
            const rainCycle = Number(card.rainCycle || 0) + 1;
            return {
                ...card,
                rainCycle,
                rainMotion: {
                    ...rainCardMotion(
                        card,
                        spawnOrdinal,
                        isExpectedCard ? `${motionGroup}:expected:${rainCycle}` : motionGroup,
                        compactStage,
                        challengeSpeed
                    ),
                    '--rain-delay': `${(entryDelayMs / 1000).toFixed(2)}s`
                }
            };
        }));
    }, [compactStage, currentIndex, rainCards, reserveRainLaunch, screen, session?.challengeSpeed, session?.fragments, session?.id]);

    const voiceOptions = useMemo(() => rainCards.filter(Boolean), [rainCards]);
    const voiceContextKey = useMemo(() => [
        session?.id || '',
        currentIndex,
        ...voiceOptions.map(fragment => fragment.rainInstanceId || fragment.id || '')
    ].join(':'), [session?.id, currentIndex, voiceOptions]);
    const voice = useScriptureVoiceInput({
        active: screen === 'playing'
            && session?.status === 'active'
            && !feedback
            && !hintPending
            && !eventPendingRef.current,
        contextKey: voiceContextKey,
        options: voiceOptions,
        onSelect: handleFragment,
        paused: showExitMenu,
        terminal: screen === 'result' || screen === 'unavailable'
    });

    const useHint = async () => {
        if (!session || hintPending || screen !== 'playing') return;
        const cost = Number(session.hintCost || bootstrap?.hintCost || 5);
        if (coinSystem.coins < cost) {
            setMessage(`智匯金幣不足，提示需要 ${cost} 枚。`);
            return;
        }

        setHintPending(true);
        setMessage('');
        try {
            if (isLoggedIn) {
                await spendScriptureRainHint({
                    sessionId: session.id,
                    requestId: requestId(),
                    token: getToken()
                });
                await refreshUser(true);
            } else {
                const result = await coinSystem.spendCoins(cost, 'scripture_rain_hint');
                if (!result.success) throw new Error(result.error || '無法扣除提示金幣');
            }
            const correct = session.fragments[currentIndex];
            setHintedFragmentId(correct.id);
            setMessage(`已扣除 ${cost} 枚金幣，下一片已標示。`);
            clearTimeout(hintTimerRef.current);
            hintTimerRef.current = setTimeout(() => setHintedFragmentId(null), 2200);
        } catch (error) {
            setMessage(error.message || '提示暫時無法使用');
        } finally {
            setHintPending(false);
        }
    };

    const exitButton = (
        <button
            type="button"
            onClick={() => setShowExitMenu(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/15"
        >
            <ArrowLeft className="h-4 w-4" />
            返回遊戲
        </button>
    );
    const exitMenu = (
        <>
            <ScriptureMemoryExitMenu
                open={showExitMenu}
                onClose={() => setShowExitMenu(false)}
                onBack={() => leaveTo(onBack || onExit)}
                onHome={() => requestGuestGameExit(() => leaveTo(onHome || onExit))}
                busy={exitPending}
                willForfeit={screen === 'playing' && session?.status === 'active'}
                variant="rain"
            />
            {guestGameExitDialog}
        </>
    );

    if (screen === 'loading' || screen === 'preparing') {
        return (
            <div ref={rootRef} className="scripture-rain">
                <div className="scripture-rain__rain" aria-hidden="true" />
                <div className="scripture-rain__shell items-center justify-center gap-4">
                    <CloudRain className="h-14 w-14 animate-pulse text-sky-300" />
                    <p className="font-black text-white">{screen === 'preparing' ? '正在整理完整經文與健康切片…' : '正在準備經文雨…'}</p>
                </div>
            </div>
        );
    }

    if (screen === 'unavailable') {
        return (
            <div ref={rootRef} className="scripture-rain">
                <div className="scripture-rain__shell items-center justify-center p-6 text-center">
                    <XCircle className="mb-4 h-12 w-12 text-rose-300" />
                    <h1 className="text-2xl font-black">經文雨目前無法使用</h1>
                    <p className="mt-3 max-w-md text-slate-300">{message}</p>
                    <div className="mt-6">{exitButton}</div>
                </div>
                {exitMenu}
            </div>
        );
    }

    if (screen === 'select') {
        return (
            <div ref={rootRef} className="scripture-rain scripture-rain--setup scripture-rain--scrollable">
                <div className="scripture-rain__shell min-h-full">
                    <ScriptureMemoryTopbar
                        variant="rain"
                        icon={CloudRain}
                        title="經文雨"
                        subtitle="落下片段・記憶排序"
                        onBack={() => setShowExitMenu(true)}
                        actions={<span className="scripture-rain__setup-version">和合本</span>}
                    />
                    <ScriptureRainSetup bootstrap={bootstrap} preparing={false} onPrepare={prepareGame} voice={voice} />
                    {message && <p className="scripture-rain__floating-message" role="alert">{message}</p>}
                </div>
                {exitMenu}
            </div>
        );
    }

    if (screen === 'preview' && session) {
        return (
            <div ref={rootRef} className="scripture-rain scripture-rain--scrollable">
                <div className="scripture-rain__rain" aria-hidden="true" />
                <div className="scripture-rain__shell min-h-full">
                    <div className="scripture-rain__topbar">{exitButton}<span className="text-sm font-black text-slate-300">熟悉經文順序</span></div>
                    <ScriptureRainPreview
                        session={session}
                        onBack={() => {
                            setSession(null);
                            setMessage('');
                            setScreen('select');
                        }}
                        onStart={beginGame}
                    />
                </div>
                {exitMenu}
            </div>
        );
    }

    if (screen === 'result') {
        const completed = resultReason === 'complete';
        return (
            <div ref={rootRef} className="scripture-rain scripture-rain--scrollable">
                <div className="scripture-rain__rain" aria-hidden="true" />
                <div className="scripture-rain__shell min-h-full">
                    <div className="scripture-rain__topbar">{exitButton}<span className="text-sm font-black text-slate-300">經文雨結果</span></div>
                    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-8 text-center sm:px-6">
                        {completed ? <Trophy className="h-16 w-16 text-amber-300" /> : <CloudRain className="h-16 w-16 text-sky-300" />}
                        <h1 className="mt-4 text-3xl font-black">{completed ? '經文重組完成！' : '三次選擇錯誤'}</h1>
                        <p className="mt-2 text-slate-300">{session.passage.title} · {session.passage.reference}</p>
                        <div className="mt-5 text-4xl font-black text-amber-300">{(Number(session.elapsedMs || elapsedMs) / 1000).toFixed(1)} 秒</div>
                        <p className="mt-2 text-sm font-bold text-slate-400">完成 {session.currentIndex || currentIndex} / {session.fragmentCount} 片</p>
                        <ScriptureMemorySettlement
                            completed={completed}
                            reward={session.reward}
                            variant="dark"
                        />

                        <section className="scripture-rain__glass mt-7 w-full rounded-3xl p-5 text-left sm:p-7">
                            <h2 className="text-lg font-black text-white">完整經文回顧</h2>
                            <div className="mt-4 space-y-3 text-base font-medium leading-8 text-slate-100">
                                {session.verses.map(verse => (
                                    <p key={verse.verse}><sup className="mr-1 text-xs font-black text-sky-300">{verse.verse}</sup>{verse.text}</p>
                                ))}
                            </div>
                        </section>

                        <div className="mt-6 flex flex-wrap justify-center gap-3">
                            <button type="button" onClick={() => setupRequest && prepareGame(setupRequest)} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-indigo-500 px-6 font-black text-white hover:bg-indigo-400">
                                <RotateCcw className="h-5 w-5" /> 再玩一次
                            </button>
                            <button type="button" onClick={() => setScreen('select')} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 font-black text-white hover:bg-white/15">
                                選擇其他經文
                            </button>
                        </div>
                        <p className="mt-6 text-xs font-bold text-slate-400">相同經文範圍每日首次完成可獲得一次金幣；重玩仍會保留完成時間。</p>
                    </main>
                </div>
                {exitMenu}
            </div>
        );
    }

    const progress = Math.round((currentIndex / session.fragmentCount) * 100);
    const currentVerse = session.fragments[currentIndex]?.verse;
    const assembledFragments = session.fragments.slice(0, currentIndex);
    return (
        <div ref={rootRef} className="scripture-rain">
            <div className="scripture-rain__rain" aria-hidden="true" />
            <div className="scripture-rain__shell">
                <ScriptureMemoryGameHud
                    onLeave={() => setShowExitMenu(true)}
                    lives={lives}
                    multiplier={multiplier}
                    streak={streak}
                    elapsedMs={elapsedMs}
                    coins={coinSystem.coins}
                />
                <div
                    ref={stageRef}
                    className="scripture-rain__stage"
                    aria-label="依序點選循環落下的經文片段"
                    style={{ '--rain-entry-top': `${stageMetrics.reservedTop}px` }}
                >
                    <section ref={assemblyPanelRef} className="scripture-rain__assembly" aria-label="已組合的經文">
                        <header>
                            <span className="scripture-rain__assembly-title"><strong>{session.passage.title}</strong><small>{session.passage.reference}・已組合經文</small></span>
                            <strong>{currentIndex} / {session.fragmentCount}</strong>
                        </header>
                        <div ref={assembledRef} className="scripture-rain__assembly-text" aria-live="polite">
                            {assembledFragments.length ? assembledFragments.map((fragment, index) => {
                                const previousVerse = assembledFragments[index - 1]?.verse;
                                const startsVerse = index === 0 || Number(fragment.verse) !== Number(previousVerse);
                                return (
                                    <span key={fragment.id} className="scripture-rain__assembled-fragment">
                                        {startsVerse && Number.isFinite(Number(fragment.verse)) ? <sup>{fragment.verse}</sup> : null}
                                        <span className={index === assembledFragments.length - 1 ? 'scripture-rain__assembled-fragment--latest' : ''}>{fragment.text}</span>
                                    </span>
                                );
                            }) : (
                                <span className="scripture-rain__assembly-placeholder">依序點選，答對的片段會在這裡組合</span>
                            )}
                        </div>
                    </section>
                    {screen === 'countdown' ? (
                        <div className="scripture-rain__countdown-overlay" role="status" aria-live="assertive">
                            <span key={countdown} className="scripture-rain__countdown-number">{countdown}</span>
                            <strong>正在預備經文雨</strong>
                            <small>倒數結束後，片段才會從上方依序落下</small>
                        </div>
                    ) : null}
                    {screen === 'playing' ? rainCards.map((fragment) => {
                        const stateClass = feedback?.instanceId === fragment.rainInstanceId ? `scripture-rain__card--${feedback.type}` : '';
                        const hintClass = hintedFragmentId === fragment.id ? 'scripture-rain__card--hint' : '';
                        return (
                            <button
                                type="button"
                                key={`${fragment.rainInstanceId}:${fragment.rainCycle || 0}`}
                                onClick={() => handleFragment(fragment)}
                                onAnimationEnd={(event) => {
                                    if (event.target === event.currentTarget) recycleRainCard(fragment.rainInstanceId);
                                }}
                                className={`scripture-rain__card ${stateClass} ${hintClass}`}
                                style={{
                                    ...fragment.rainMotion,
                                    animationIterationCount: '1'
                                }}
                                disabled={screen !== 'playing' || Boolean(feedback)}
                            >
                                <span className="scripture-rain__card-inner">{formatScriptureMemoryCardText(fragment.text)}</span>
                            </button>
                        );
                    }) : null}
                </div>

                <footer className="scripture-rain__controls border-t border-white/10 bg-slate-950/72 px-3 pt-3 backdrop-blur sm:px-5">
                    <div className="scripture-rain__progress-track" aria-label={`已完成 ${currentIndex}，共 ${session.fragmentCount} 片`}>
                        <div className="scripture-rain__progress-bar" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-black text-slate-300">{Number.isFinite(Number(currentVerse)) ? `第 ${currentVerse} 節` : '下一片'} · {currentIndex + 1} / {session.fragmentCount}</p>
                            <p className={`mt-1 truncate text-xs font-bold ${feedback?.type === 'correct' ? 'text-emerald-300' : feedback?.type === 'wrong' ? 'text-rose-300' : 'text-slate-400'}`} aria-live="polite">{message || '漏過的下一片會優先回到畫面；只有點錯才失去生命'}</p>
                        </div>
                        <button
                            type="button"
                            onClick={useHint}
                            disabled={hintPending || Boolean(feedback)}
                            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-amber-300 px-4 text-sm font-black text-amber-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Lightbulb className="h-4 w-4" />
                            提示下一片 · {session.hintCost} <Coins className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="sr-only" aria-live="assertive">
                        {feedback?.type === 'correct' && <span><CheckCircle2 />正確</span>}
                        {feedback?.type === 'wrong' && <span><XCircle />順序錯誤</span>}
                    </div>
                </footer>
            </div>
            {exitMenu}
        </div>
    );
}
