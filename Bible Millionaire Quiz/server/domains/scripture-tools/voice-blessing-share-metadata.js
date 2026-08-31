const DEFAULT_TITLE = '語音祝福｜來自聖經智匯';
const DEFAULT_DESCRIPTION = '聆聽一段來自聖經智匯的語音經文祝福。';

const collapseWhitespace = value => String(value || '').replace(/\s+/gu, ' ').trim();

const limitText = (value, maximumLength) => {
    const normalized = collapseWhitespace(value);
    if (normalized.length <= maximumLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
};

const escapeHtml = value => String(value || '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');

export function buildVoiceBlessingShareMetadata(share, canonicalUrl) {
    const blessingTitle = limitText(share?.card?.title, 60);
    const reference = limitText(share?.recording?.reference, 48);
    const title = blessingTitle
        ? `語音祝福－${blessingTitle}｜來自聖經智匯`
        : DEFAULT_TITLE;
    const description = reference
        ? `聆聽一段以${reference}錄製的語音經文祝福。`
        : DEFAULT_DESCRIPTION;

    return {
        title,
        description,
        canonicalUrl: collapseWhitespace(canonicalUrl)
    };
}

export function injectVoiceBlessingShareMetadata(html, metadata) {
    const title = escapeHtml(metadata?.title || DEFAULT_TITLE);
    const description = escapeHtml(metadata?.description || DEFAULT_DESCRIPTION);
    const canonicalUrl = escapeHtml(metadata?.canonicalUrl || '');
    const metaBlock = [
        `  <title>${title}</title>`,
        `  <meta name="description" content="${description}" />`,
        '  <meta property="og:type" content="website" />',
        `  <meta property="og:title" content="${title}" />`,
        `  <meta property="og:description" content="${description}" />`,
        '  <meta property="og:site_name" content="聖經智匯" />',
        '  <meta property="og:locale" content="zh_TW" />',
        canonicalUrl ? `  <meta property="og:url" content="${canonicalUrl}" />` : '',
        '  <meta name="twitter:card" content="summary" />',
        `  <meta name="twitter:title" content="${title}" />`,
        `  <meta name="twitter:description" content="${description}" />`,
        canonicalUrl ? `  <link rel="canonical" href="${canonicalUrl}" />` : ''
    ].filter(Boolean).join('\n');

    const withoutExistingMetadata = String(html || '')
        .replace(/\s*<title\b[^>]*>[\s\S]*?<\/title>/giu, '')
        .replace(/\s*<meta\b[^>]*(?:name|property)=["'](?:description|og:type|og:title|og:description|og:site_name|og:locale|og:url|twitter:card|twitter:title|twitter:description)["'][^>]*\/?>/giu, '')
        .replace(/\s*<link\b[^>]*rel=["']canonical["'][^>]*\/?>/giu, '');

    if (/<\/head>/iu.test(withoutExistingMetadata)) {
        return withoutExistingMetadata.replace(/<\/head>/iu, `${metaBlock}\n</head>`);
    }
    return `${metaBlock}\n${withoutExistingMetadata}`;
}

export function absolutizeVoiceBlessingShareAssetUrls(html, basePath = '/') {
    const normalizedBase = basePath === '/m/' ? '/m/' : '/';
    return String(html || '').replace(
        /\b(src|href)=(["'])\.\/([^"']+)\2/giu,
        (_match, attribute, quote, relativePath) => `${attribute}=${quote}${normalizedBase}${relativePath}${quote}`
    );
}

export const voiceBlessingShareMetadataDefaults = Object.freeze({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION
});
