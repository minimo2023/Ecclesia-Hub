function verseBounds(row) {
    const covered = Array.isArray(row?.coveredVerses)
        ? row.coveredVerses.map(Number).filter(Number.isInteger)
        : [];
    const start = Number(row?.verseStart ?? row?.verse ?? covered[0]);
    const end = Number(row?.verseEnd ?? covered.at(-1) ?? start);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
    return { start, end };
}

export function normalizeScriptureOrderRange(range) {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
    return { start, end, count: end - start + 1 };
}

export function scriptureOrderRangeFromRows(firstRow, lastRow = firstRow) {
    const first = verseBounds(firstRow);
    const last = verseBounds(lastRow);
    if (!first || !last) return null;
    const start = Math.min(first.start, last.start);
    const end = Math.max(first.end, last.end);
    return { start, end, count: end - start + 1 };
}

export function updateScriptureOrderRange(currentRange, clickedRow) {
    const current = normalizeScriptureOrderRange(currentRange);
    const clicked = verseBounds(clickedRow);
    if (!clicked) return current;
    if (!current) return { ...clicked, count: clicked.end - clicked.start + 1 };

    if (clicked.end < current.start || clicked.start > current.end) {
        const start = Math.min(current.start, clicked.start);
        const end = Math.max(current.end, clicked.end);
        return { start, end, count: end - start + 1 };
    }

    if (clicked.start <= current.start && clicked.end >= current.end) return null;
    if (clicked.start <= current.start) {
        const start = clicked.end + 1;
        return start <= current.end ? { start, end: current.end, count: current.end - start + 1 } : null;
    }
    if (clicked.end >= current.end) {
        const end = clicked.start - 1;
        return end >= current.start ? { start: current.start, end, count: end - current.start + 1 } : null;
    }

    const distanceToStart = clicked.start - current.start;
    const distanceToEnd = current.end - clicked.end;
    if (distanceToStart <= distanceToEnd) {
        const start = clicked.end + 1;
        return { start, end: current.end, count: current.end - start + 1 };
    }
    const end = clicked.start - 1;
    return { start: current.start, end, count: end - current.start + 1 };
}

export function validateScriptureOrderRange(range, { min = 1, max = 20 } = {}) {
    const normalized = normalizeScriptureOrderRange(range);
    if (!normalized) return { valid: false, code: 'PASSAGE_RANGE_REQUIRED', count: 0 };
    if (normalized.count < min) return { valid: false, code: 'PASSAGE_RANGE_TOO_SHORT', count: normalized.count };
    if (normalized.count > max) return { valid: false, code: 'PASSAGE_RANGE_TOO_LONG', count: normalized.count };
    return { valid: true, code: null, count: normalized.count, range: normalized };
}

export function scriptureOrderRowSelected(row, range) {
    const bounds = verseBounds(row);
    const normalized = normalizeScriptureOrderRange(range);
    return Boolean(bounds && normalized && bounds.start >= normalized.start && bounds.end <= normalized.end);
}
