import React from 'react';
import ReactMarkdown from 'react-markdown';
import { formatDevotionalMarkdown } from '../../../utils/devotionText';
import DevotionalReadAloudControls from './DevotionalReadAloudControls';

function MarkdownBlocks({ value, components, sectionKey, activeSegmentId }) {
    const blocks = formatDevotionalMarkdown(value).split(/\n{2,}/u).filter(Boolean);

    return blocks.map((block, index) => {
        const segmentId = `${sectionKey}-${index}`;
        const active = activeSegmentId === segmentId;
        return (
            <div
                key={segmentId}
                data-devotional-speech-id={segmentId}
                className={`rounded-xl transition-colors ${active ? '-mx-2 bg-indigo-50 px-2 py-1 ring-1 ring-indigo-100' : ''}`}
            >
                <ReactMarkdown components={components}>{block}</ReactMarkdown>
            </div>
        );
    });
}

/**
 * DevotionCard - 溫暖淺色風格 (支援動態字體)
 */
const DevotionCard = ({ devotionalContent, isLoading, fontSize = 'medium', readAloudController = null }) => {
    if (isLoading) {
        return (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100 mb-8 animate-pulse">
                <div className="h-6 bg-stone-100 rounded w-1/3 mb-6"></div>
                <div className="space-y-3">
                    <div className="h-4 bg-stone-100 rounded w-full"></div>
                    <div className="h-4 bg-stone-100 rounded w-5/6"></div>
                    <div className="h-4 bg-stone-100 rounded w-4/6"></div>
                </div>
            </div>
        );
    }

    if (!devotionalContent) return null;

    const { title, scripture, scriptureReference, understanding, meditation, prayer, closingWord, author } = devotionalContent;
    const isVirtualAuthor = devotionalContent.metadata?.authorType !== 'human';
    const authorName = typeof author === 'string' ? author : author?.name;

    // 字體大小映射 - 統一內文大小 (手機版縮小一級)
    const getSizeClasses = () => {
        switch (fontSize) {
            case 'small':
                return {
                    body: 'text-base md:text-lg leading-relaxed',
                    heading: 'text-lg md:text-xl font-bold'
                };
            case 'large':
                return {
                    body: 'text-xl md:text-2xl leading-relaxed',
                    heading: 'text-2xl md:text-3xl font-bold'
                };
            case 'extra-large':
                return {
                    body: 'text-2xl md:text-3xl leading-relaxed',
                    heading: 'text-3xl md:text-4xl font-bold'
                };
            default: // medium
                return {
                    body: 'text-lg md:text-xl leading-relaxed',
                    heading: 'text-xl md:text-2xl font-bold'
                };
        }
    };

    const sizes = getSizeClasses();

    // Markdown 自定義組件，確保字體一致
    const MarkdownComponents = {
        p: ({ node: _node, ...props }) => <p className={`mb-4 last:mb-0 ${sizes.body}`} {...props} />,
        li: ({ node: _node, ...props }) => <li className={`mb-2 ${sizes.body}`} {...props} />,
        h1: ({ node: _node, ...props }) => <h1 className={`mb-4 mt-6 ${sizes.heading}`} {...props} />,
        h2: ({ node: _node, ...props }) => <h2 className={`mb-3 mt-5 ${sizes.heading}`} {...props} />,
        h3: ({ node: _node, ...props }) => <h3 className={`mb-3 mt-4 ${sizes.heading}`} {...props} />,
        strong: ({ node: _node, ...props }) => <strong className="font-bold text-stone-800" {...props} />,
    };

    return (
        <div className="bg-white p-6 md:p-10 rounded-3xl shadow-sm border border-stone-100 mb-8 text-stone-700 animate-fade-in-smooth">
            {readAloudController ? (
                <div className="-mx-3 mb-6 border-b border-stone-100 px-3 pb-3 md:-mx-6 md:px-6">
                    <DevotionalReadAloudControls controller={readAloudController} />
                </div>
            ) : null}

            {/* 今日經文 */}
            <div className="mb-10 text-center">
                {title && (
                    <h2
                        data-devotional-speech-id="title-0"
                        className={`${sizes.heading} text-stone-800 mb-6 font-bold tracking-wide leading-snug rounded-xl transition-colors ${readAloudController?.activeSegmentId === 'title-0' ? 'bg-indigo-50 px-2 py-1 ring-1 ring-indigo-100' : ''}`}
                    >
                        {title}
                    </h2>
                )}
                <span className="inline-block px-4 py-1 bg-amber-50 text-amber-700 text-sm font-black rounded-full mb-4 tracking-widest">今日經文</span>
                <blockquote
                    data-devotional-speech-id="scripture-0"
                    className={`${sizes.body} font-serif text-stone-800 mb-4 rounded-xl transition-colors ${readAloudController?.activeSegmentId?.startsWith('scripture-') ? 'bg-indigo-50 px-2 py-1 ring-1 ring-indigo-100' : ''}`}
                >
                    "{scripture}"
                </blockquote>
                <p className={`text-stone-500 font-bold ${sizes.body}`}>— {scriptureReference}</p>
                {authorName && (
                    <p className="text-stone-500 text-base mt-2 font-medium">
                        {isVirtualAuthor ? '虛擬作者' : '撰文'}：{authorName}
                    </p>
                )}
            </div>

            <div className="space-y-8">
                {/* 經文小理解 */}
                {understanding && (
                    <div className="bg-stone-50/50 p-6 rounded-2xl">
                        <h3 className={`${sizes.heading} text-stone-800 mb-3 flex items-center gap-2`}>
                            <span className="w-1 h-6 bg-amber-400 rounded-full"></span>
                            經文小理解
                        </h3>
                        <div className="text-stone-600">
                            <MarkdownBlocks value={understanding} components={MarkdownComponents} sectionKey="understanding" activeSegmentId={readAloudController?.activeSegmentId} />
                        </div>
                    </div>
                )}

                {/* 今日默想 */}
                {meditation && (
                    <div>
                        <h3 className={`${sizes.heading} text-stone-800 mb-3 flex items-center gap-2`}>
                            <span className="w-1 h-6 bg-rose-400 rounded-full"></span>
                            今日默想
                        </h3>
                        <div className="text-stone-600">
                            <MarkdownBlocks value={meditation} components={MarkdownComponents} sectionKey="meditation" activeSegmentId={readAloudController?.activeSegmentId} />
                        </div>
                    </div>
                )}

                {/* 今日禱告 */}
                {prayer && (
                    <div className="bg-amber-50/80 p-8 rounded-2xl border border-amber-100/50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-amber-100 rounded-full opacity-50 blur-2xl"></div>
                        <h3 className={`${sizes.heading} text-amber-800 mb-3 relative z-10`}>🙏 今日禱告</h3>
                        <div className="text-stone-700 italic relative z-10 font-serif">
                            <MarkdownBlocks value={prayer} components={MarkdownComponents} sectionKey="prayer" activeSegmentId={readAloudController?.activeSegmentId} />
                        </div>
                    </div>
                )}

                {/* 生命加油站 */}
                {closingWord && (
                    <div className="border-t border-stone-100 pt-8 mt-8">
                        <h3 className="text-sm font-black text-stone-400 mb-3 tracking-[0.3em] text-center">今日提醒</h3>
                        <div
                            data-devotional-speech-id="closing-0"
                            className={`text-stone-600 text-center font-medium rounded-xl transition-colors ${readAloudController?.activeSegmentId?.startsWith('closing-') ? 'bg-indigo-50 px-2 py-1 ring-1 ring-indigo-100' : ''}`}
                        >
                            <ReactMarkdown components={MarkdownComponents}>
                                {closingWord.replace(/([，。？！；])/g, '$1  \n')}
                            </ReactMarkdown>
                        </div>
                    </div>
                )}

                {isVirtualAuthor && (
                    <aside
                        className="border-t border-stone-200 pt-5 mt-8 text-sm leading-relaxed text-stone-500"
                        aria-label="虛擬作者內容說明"
                    >
                        <p>本文由本站虛擬作者透過 AI 輔助撰寫，僅供個人靈修與反思參考。</p>
                        <details className="mt-2">
                            <summary className="inline-block cursor-pointer font-medium text-stone-600 underline decoration-stone-300 underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded">
                                內容說明
                            </summary>
                            <p className="mt-2">
                                內容可能有疏漏，不取代聖經原文、教會牧養或任何專業建議。涉及重要信仰、健康或生活決定時，請查考經文，並尋求可信任的牧者或合適專業人士協助。
                            </p>
                        </details>
                    </aside>
                )}
            </div>
        </div>
    );
};

export default DevotionCard;
