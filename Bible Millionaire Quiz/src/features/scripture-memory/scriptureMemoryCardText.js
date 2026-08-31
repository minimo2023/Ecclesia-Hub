export function formatScriptureMemoryCardText(value) {
    return String(value || '')
        .trim()
        // Keep internal list punctuation because it separates names. Only
        // sentence-edge punctuation is unnecessary on a selectable card.
        .replace(/^[，,；;：:、。！？!?]+|[，,；;：:、。！？!?]+$/gu, '')
        .replace(/[‧．]/gu, '·')
        .replace(/([、，；])(?=\S)/gu, '$1\u2009');
}

export default formatScriptureMemoryCardText;
