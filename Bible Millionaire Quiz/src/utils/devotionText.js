const MARKDOWN_BLOCK_PREFIX = /^\s*(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s)/u;
const SENTENCE_PATTERN = /[^。！？!?；;\n]+[。！？!?；;]+(?:[」』”’"]+)?|[^。！？!?；;\n]+$/gu;

function splitLongProse(text, targetLength, minimumLength) {
    if (text.length <= targetLength || MARKDOWN_BLOCK_PREFIX.test(text)) {
        return text;
    }

    const sentences = text.match(SENTENCE_PATTERN)?.map(sentence => sentence.trim()).filter(Boolean) || [];
    if (sentences.length < 2) return text;

    const paragraphs = [];
    let current = '';

    sentences.forEach((sentence) => {
        if (current && current.length >= minimumLength && current.length + sentence.length > targetLength) {
            paragraphs.push(current);
            current = sentence;
            return;
        }

        current += sentence;
    });

    if (current) paragraphs.push(current);

    if (paragraphs.length > 1 && paragraphs.at(-1).length < minimumLength) {
        paragraphs[paragraphs.length - 2] += paragraphs.pop();
    }

    return paragraphs.join('\n\n');
}

/**
 * 為沒有段落資訊的靈修長文補上純顯示用段落。
 * 不改寫文字，只加入 Markdown 空行；既有段落與清單格式會優先保留。
 */
export function formatDevotionalMarkdown(value, options = {}) {
    if (typeof value !== 'string') return '';

    const targetLength = options.targetLength ?? 145;
    const minimumLength = options.minimumLength ?? 65;
    const normalized = value
        .replace(/\\n/gu, '\n')
        .replace(/\r\n?/gu, '\n')
        .trim();

    if (!normalized) return '';

    const explicitBlocks = normalized.split(/\n{2,}/u);
    const formattedBlocks = explicitBlocks.flatMap((block) => {
        const lines = block.split(/\n+/u).map(line => line.trim()).filter(Boolean);

        // 模型有時只用單一換行表示段落；純文字行可安全轉為 Markdown 段落。
        if (lines.length > 1 && lines.every(line => !MARKDOWN_BLOCK_PREFIX.test(line))) {
            return lines.map(line => splitLongProse(line, targetLength, minimumLength));
        }

        return splitLongProse(block, targetLength, minimumLength);
    });

    return formattedBlocks.join('\n\n');
}

