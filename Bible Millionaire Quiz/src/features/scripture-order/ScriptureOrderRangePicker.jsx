import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, MousePointer2 } from 'lucide-react';
import {
    normalizeScriptureOrderRange,
    scriptureOrderRangeFromRows,
    scriptureOrderRowSelected,
    updateScriptureOrderRange
} from './scriptureOrderSelection';

export default function ScriptureOrderRangePicker({
    chapterData,
    loading,
    selection,
    onSelectionChange,
    onBack,
    minimumVerses = 1,
    maximumVerses = 20
}) {
    const [notice, setNotice] = useState('');
    const gestureRef = useRef({
        active: false,
        anchorRow: null,
        pointerId: null,
        pointerType: null,
        startX: 0,
        startY: 0,
        timer: null,
        suppressClickUntil: 0
    });
    const normalized = useMemo(() => normalizeScriptureOrderRange(selection), [selection]);

    const applyRange = next => {
        if (next?.count > maximumVerses) {
            setNotice(`一次最多選擇 ${maximumVerses} 節，請縮短範圍。`);
            return;
        }
        setNotice('');
        onSelectionChange(next);
    };

    const releaseGesture = suppressClick => {
        const gesture = gestureRef.current;
        if (gesture.timer) window.clearTimeout(gesture.timer);
        if (suppressClick) gesture.suppressClickUntil = Date.now() + 400;
        Object.assign(gesture, {
            active: false,
            anchorRow: null,
            pointerId: null,
            pointerType: null,
            timer: null
        });
    };

    useEffect(() => () => releaseGesture(false), []);

    const activateGesture = () => {
        const gesture = gestureRef.current;
        if (!gesture.anchorRow || gesture.active) return;
        gesture.active = true;
        applyRange(scriptureOrderRangeFromRows(gesture.anchorRow));
        window.navigator.vibrate?.(10);
    };

    const startGesture = (row, event) => {
        if (event.button !== undefined && event.button !== 0) return;
        releaseGesture(false);
        Object.assign(gestureRef.current, {
            anchorRow: row,
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            startX: event.clientX,
            startY: event.clientY
        });
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            gestureRef.current.timer = window.setTimeout(activateGesture, 300);
        }
    };

    const moveGesture = event => {
        const gesture = gestureRef.current;
        if (gesture.pointerId !== event.pointerId || !gesture.anchorRow) return;
        const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
        if (!gesture.active) {
            if (gesture.pointerType === 'mouse' && distance >= 6) activateGesture();
            else if (gesture.pointerType !== 'mouse' && distance >= 10) {
                releaseGesture(false);
                return;
            }
        }
        if (!gesture.active) return;
        event.preventDefault();
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-order-verse-index]');
        const index = Number(target?.dataset.orderVerseIndex);
        const row = chapterData?.verses?.[index];
        if (!row) return;
        applyRange(scriptureOrderRangeFromRows(gesture.anchorRow, row));
    };

    const finishGesture = event => {
        if (gestureRef.current.pointerId !== event.pointerId) return;
        releaseGesture(gestureRef.current.active);
    };

    if (loading) {
        return (
            <section className="scripture-order-range-state" role="status">
                <LoaderCircle className="scripture-order-spin" size={25} />
                <strong>正在載入本章經文…</strong>
            </section>
        );
    }

    if (!chapterData) return null;

    return (
        <section className="scripture-order-range-picker">
            <div className="scripture-order-range-heading">
                <button type="button" onClick={onBack}><ArrowLeft size={17} />上一步：書卷與章節</button>
                <div>
                    <strong>{chapterData.bookName} 第 {chapterData.chapter} 章</strong>
                    <span>{minimumVerses === 1 ? '點選一節即可選取，也可以繼續點選或拖曳建立連續範圍。' : '點選兩節建立連續範圍，也可以按住後拖曳選取。'}</span>
                </div>
            </div>

            <div
                className="scripture-order-verse-grid"
                onPointerMove={moveGesture}
                onPointerUp={finishGesture}
                onPointerCancel={finishGesture}
                onPointerLeave={event => {
                    if (event.pointerType === 'mouse' && gestureRef.current.active) finishGesture(event);
                }}
            >
                {chapterData.verses.map((row, index) => {
                    const selected = scriptureOrderRowSelected(row, normalized);
                    const playable = row.playable !== false;
                    return (
                        <button
                            key={`${row.verseStart}-${row.verseEnd}`}
                            type="button"
                            data-order-verse-index={index}
                            aria-pressed={selected}
                            aria-label={playable
                                ? `第 ${row.verseLabel} 節，${row.text}，${selected ? '已選取' : '未選取'}`
                                : `第 ${row.verseLabel} 節為譯本註記，不列入遊戲經文`}
                            disabled={!playable}
                            onPointerDown={event => startGesture(row, event)}
                            onClick={() => {
                                if (!playable) return;
                                if (Date.now() < gestureRef.current.suppressClickUntil) return;
                                applyRange(updateScriptureOrderRange(normalized, row));
                            }}
                        >
                            <span>{row.verseLabel}</span>
                            <p>{playable ? row.text : '本節為譯本註記，不列入遊戲經文'}</p>
                            {selected ? <Check size={17} aria-hidden="true" /> : null}
                        </button>
                    );
                })}
            </div>

            <div className={`scripture-order-selection-summary${normalized ? ' has-selection' : ''}`} aria-live="polite">
                <MousePointer2 size={18} />
                {normalized
                    ? <span>已選擇 <strong>{normalized.start}–{normalized.end} 節</strong>，共 {normalized.count} 節</span>
                    : <span>請選擇連續 {minimumVerses} 至 {maximumVerses} 節</span>}
                {normalized ? <button type="button" onClick={() => applyRange(null)}>清除</button> : null}
            </div>
            {notice ? <p className="scripture-order-range-notice" role="alert">{notice}</p> : null}
        </section>
    );
}
