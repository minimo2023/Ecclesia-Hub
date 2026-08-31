import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CloudRain, LoaderCircle, Play } from 'lucide-react';
import { BIBLE_BOOKS } from '../member/ScriptureReader';
import {
    ScriptureMemoryIntro,
    ScriptureMemoryModePicker,
    ScriptureMemoryPassagePicker,
    ScriptureMemorySourceTabs,
    ScriptureVoiceModeControl
} from '../scripture-memory/ScriptureMemorySetup';
import ScriptureBookChapterSelector from '../scripture-reading/ScriptureBookChapterSelector';
import ScriptureOrderRangePicker from '../scripture-order/ScriptureOrderRangePicker';
import { validateScriptureOrderRange } from '../scripture-order/scriptureOrderSelection';
import { loadScriptureRainChapter, previewScriptureRainPassage } from './scriptureRainApi';
import '../scripture-order/ScriptureOrderGame.css';

export default function ScriptureRainSetup({ bootstrap, preparing, onPrepare, voice }) {
    const [sourceType, setSourceType] = useState('custom');
    const [passageId, setPassageId] = useState(bootstrap.passages?.[0]?.id || '');
    const [challengeDifficulty, setChallengeDifficulty] = useState('SIMPLE');
    const [challengeSpeed, setChallengeSpeed] = useState('SLOW');
    const [testament, setTestament] = useState('old');
    const [customStage, setCustomStage] = useState('location');
    const [expandedBook, setExpandedBook] = useState(null);
    const [customBook, setCustomBook] = useState(null);
    const [customChapter, setCustomChapter] = useState(null);
    const [chapterData, setChapterData] = useState(null);
    const [chapterLoading, setChapterLoading] = useState(false);
    const [customSelection, setCustomSelection] = useState(null);
    const [setupStage, setSetupStage] = useState('select');
    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [message, setMessage] = useState('');
    const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
    const chapterRequest = useRef(0);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 640px)');
        const update = event => setMobile(event.matches);
        media.addEventListener?.('change', update);
        return () => media.removeEventListener?.('change', update);
    }, []);

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

    const featuredPassage = useMemo(
        () => bootstrap.passages?.find(passage => passage.id === passageId) || bootstrap.passages?.[0] || null,
        [bootstrap.passages, passageId]
    );
    const canPrepare = sourceType === 'featured' ? Boolean(featuredPassage) : Boolean(customRange);
    const selectedSummary = sourceType === 'featured'
        ? featuredPassage ? `${featuredPassage.title}・${featuredPassage.reference}` : '請選擇一段常用經文'
        : customRange ? `${customBook.name} ${customChapter}:${customRange.verseStart}–${customRange.verseEnd}` : '請先選擇書卷、章節與經節';

    const chooseChapter = async (book, chapter) => {
        const requestId = chapterRequest.current + 1;
        chapterRequest.current = requestId;
        setCustomBook(book);
        setCustomChapter(chapter);
        setCustomSelection(null);
        setChapterData(null);
        setChapterLoading(true);
        setCustomStage('verses');
        setMessage('');
        try {
            const data = await loadScriptureRainChapter(book.name, chapter);
            if (chapterRequest.current === requestId) setChapterData(data.chapter);
        } catch (error) {
            if (chapterRequest.current === requestId) {
                setMessage(error.message);
                setCustomStage('location');
            }
        } finally {
            if (chapterRequest.current === requestId) setChapterLoading(false);
        }
    };

    const loadPreview = async () => {
        setMessage('');
        if (!canPrepare || previewing) {
            setMessage('請先選擇同章連續 1 至 20 節。');
            return;
        }
        setPreviewing(true);
        try {
            const result = await previewScriptureRainPassage(
                sourceType === 'featured' ? { passageId } : { customRange }
            );
            setPreview(result.preview);
            setSetupStage('preview');
        } catch (error) {
            setMessage(error.message || '暫時無法預覽經文');
        } finally {
            setPreviewing(false);
        }
    };

    const prepare = () => {
        if (setupStage !== 'mode') return;
        onPrepare(sourceType === 'featured'
            ? { passageId, challengeDifficulty, challengeSpeed }
            : { customRange, challengeDifficulty, challengeSpeed });
    };

    return (
        <section className="scripture-rain__setup-main" aria-labelledby="scripture-rain-setup-title">
            <ScriptureMemoryIntro
                variant="rain"
                icon={CloudRain}
                badge="經文記憶"
                titleId="scripture-rain-setup-title"
                title="準備一段經文，讓它化成經文雨"
                description="先選擇經文並熟悉完整次序。系統會在背景完成健康切片，確認後才開始落雨與計時。"
            />

            <ScriptureMemorySourceTabs variant="rain" value={sourceType} onChange={nextSource => {
                setSourceType(nextSource);
                setSetupStage('select');
                setPreview(null);
                setMessage('');
            }} />

            {setupStage === 'mode' ? (
                <section className="scripture-order-mode-step" aria-labelledby="scripture-rain-mode-step-title">
                    <div className="scripture-order-step-copy">
                        <span>步驟三</span>
                        <div><strong id="scripture-rain-mode-step-title">選擇遊戲模式</strong><p>{selectedSummary}</p></div>
                    </div>
                    <button type="button" className="scripture-order-mode-back" onClick={() => setSetupStage('preview')}>
                        <ArrowLeft size={16} />上一步：預覽經文
                    </button>
                </section>
            ) : setupStage === 'preview' && preview ? (
                <section className="scripture-order-custom-preview" aria-labelledby="scripture-rain-setup-preview-title">
                    <span>步驟二・預覽經文</span>
                    <h2 id="scripture-rain-setup-preview-title">{preview.passage.title}</h2>
                    <p>{preview.passage.reference}・共 {preview.fragmentCount} 個片段</p>
                    <div className="scripture-order-text-preview" aria-label="完整經文預覽">
                        {preview.verses?.map(verse => (
                            <p key={verse.verse}><sup>{verse.verse}</sup>{verse.text}</p>
                        ))}
                    </div>
                    <div className="scripture-order-custom-preview-meta">
                        <strong>{sourceType === 'featured' ? '常用經文' : '自選經文'}</strong>
                        <span>和合本</span><span>逐字重組已通過</span>
                    </div>
                    <button type="button" onClick={() => setSetupStage('select')}>
                        <ArrowLeft size={15} />上一步：選擇經文
                    </button>
                </section>
            ) : sourceType === 'featured' ? (
                <ScriptureMemoryPassagePicker
                    variant="rain"
                    passages={bootstrap.passages}
                    selectedId={passageId}
                    onSelect={nextId => {
                        setPassageId(nextId);
                        setPreview(null);
                        setMessage('');
                    }}
                    getBadge={passage => passage.level || '記憶'}
                    getMeta={passage => passage.reference}
                />
            ) : (
                <section className="scripture-rain__custom-card scripture-memory-custom-card">
                    {customStage === 'location' ? (
                        <>
                            <div className="scripture-rain__step-copy">
                                <span>1</span>
                                <div><strong>選擇書卷與章節</strong><p>選定章節後，可選擇一節或一段連續經文。</p></div>
                            </div>
                            <ScriptureBookChapterSelector
                                books={BIBLE_BOOKS}
                                activeTestament={testament}
                                expandedBook={expandedBook}
                                currentBook={customBook}
                                currentChapter={customChapter}
                                onTestamentChange={next => {
                                    setTestament(next);
                                    setExpandedBook(null);
                                    setMessage('');
                                }}
                                onBookToggle={book => setExpandedBook(current => current?.code === book.code ? null : book)}
                                onChapterSelect={chooseChapter}
                                variant={mobile ? 'mobile' : 'desktop'}
                            />
                        </>
                    ) : (
                        <ScriptureOrderRangePicker
                            chapterData={chapterData}
                            loading={chapterLoading}
                            selection={customSelection}
                            onSelectionChange={next => {
                                setCustomSelection(next);
                                setMessage('');
                            }}
                            onBack={() => {
                                chapterRequest.current += 1;
                                setChapterLoading(false);
                                setCustomStage('location');
                                setMessage('');
                            }}
                            minimumVerses={1}
                            maximumVerses={20}
                        />
                    )}
                </section>
            )}

            {setupStage === 'mode' ? (
                <>
                    <ScriptureMemoryModePicker
                        variant="rain"
                        rain
                        difficulty={challengeDifficulty}
                        onDifficultyChange={setChallengeDifficulty}
                        speed={challengeSpeed}
                        onSpeedChange={setChallengeSpeed}
                    />
                    <ScriptureVoiceModeControl voice={voice} />
                </>
            ) : null}

            {message ? <p className="scripture-rain__setup-message" role="alert">{message}</p> : null}
            <div className="scripture-rain__custom-confirm" role="region" aria-label="確認經文與遊戲設定">
                <div>
                    <span>{setupStage === 'mode' ? '步驟三・遊戲模式' : setupStage === 'preview' ? '步驟二・經文預覽' : '步驟一・選擇經文'}</span>
                    <strong>{selectedSummary}</strong>
                    <small>{setupStage === 'mode' ? '完成難度與速度設定後即可開始。' : '先確認完整經文，再設定遊戲模式。'}</small>
                </div>
                <button
                    type="button"
                    onClick={setupStage === 'select' ? loadPreview : setupStage === 'preview' ? () => setSetupStage('mode') : prepare}
                    disabled={preparing || previewing || (setupStage === 'select' && !canPrepare)}
                >
                    {preparing || previewing ? <LoaderCircle className="scripture-rain__spin" size={19} /> : <Play size={19} />}
                    {preparing ? '正在準備…' : previewing ? '正在讀取…' : setupStage === 'select'
                        ? '下一步：預覽經文' : setupStage === 'preview' ? '下一步：遊戲模式' : '開始挑戰'}
                </button>
            </div>
        </section>
    );
}
