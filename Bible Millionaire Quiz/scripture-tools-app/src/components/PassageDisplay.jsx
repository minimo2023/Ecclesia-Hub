import { Fragment } from 'react';

export function PassageDisplay({ passage, reference, activeVerse = null, focusVerse = null, emptyText = '請先選擇並載入一章經文。' }) {
    if (!passage.length) return <div className="empty-state">{emptyText}</div>;
    return (
        <article className="passage-card" aria-label={reference}>
            <div className="passage-reference">{reference}</div>
            <div className="passage-text">
                {passage.map(item => (
                    <Fragment key={`${item.chapter}-${item.verse}`}>
                        {(item.sectionHeadings || []).map((heading, index) => (
                            <span className="passage-section-heading" key={`${item.verse}-heading-${index}`}>{heading}</span>
                        ))}
                        <p
                            className={[
                                Number(activeVerse) === Number(item.verse) ? 'is-reading' : '',
                                Number(focusVerse) === Number(item.verse) ? 'is-focused' : '',
                                item.lineBreakAfter ? 'has-line-break-after' : '',
                                item.paragraphBreakAfter ? 'has-paragraph-break-after' : ''
                            ].filter(Boolean).join(' ')}
                            data-verse={item.verse}
                            aria-current={Number(activeVerse) === Number(item.verse) ? 'true' : undefined}
                        ><sup>{item.verse}</sup>{item.text}</p>
                    </Fragment>
                ))}
            </div>
        </article>
    );
}
