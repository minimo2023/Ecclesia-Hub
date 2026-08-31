const DEFINITIONS = Object.freeze({
    CUV_TRAD: Object.freeze({
        canonicalVersion: 'CUV_TRAD',
        storageVersion: 'CUV_TRAD',
        sourceVersion: 'unv',
        displayName: '和合本',
        aliases: Object.freeze(['CUV_TRAD', 'unv', 'cuv'])
    }),
    CNV_TRAD: Object.freeze({
        canonicalVersion: 'CNV_TRAD',
        storageVersion: 'CNV_TRAD',
        sourceVersion: 'ncv',
        displayName: '新譯本',
        aliases: Object.freeze(['CNV_TRAD', 'ncv'])
    }),
    TCV2019_TRAD: Object.freeze({
        canonicalVersion: 'TCV2019_TRAD',
        // Historical question and verse rows keep this storage code until a
        // separately audited compatibility migration changes their identity.
        storageVersion: 'TCV2010_TRAD',
        sourceVersion: 'tcv2019',
        displayName: '現代中文譯本2019',
        aliases: Object.freeze([
            'TCV2019_TRAD', 'TCV2010_TRAD', 'TCV_TRAD',
            'tcv2019', 'tcv2010', 'tcv'
        ])
    }),
    TCV1995_TRAD: Object.freeze({
        canonicalVersion: 'TCV1995_TRAD',
        storageVersion: 'TCV1995_TRAD',
        sourceVersion: 'tcv95',
        displayName: '現代中文譯本1995（舊題證據）',
        public: false,
        aliases: Object.freeze(['TCV1995_TRAD', 'TCV95_TRAD', 'tcv95'])
    }),
    LCC_TRAD: Object.freeze({
        canonicalVersion: 'LCC_TRAD',
        storageVersion: 'LCC_TRAD',
        sourceVersion: 'lcc',
        displayName: '呂振中譯本',
        aliases: Object.freeze(['LCC_TRAD', 'lcc'])
    })
});

const ALIASES = new Map();
for (const definition of Object.values(DEFINITIONS)) {
    for (const alias of definition.aliases) {
        ALIASES.set(String(alias).toLowerCase(), definition);
    }
}

export const BIBLE_VERSION_DEFINITIONS = DEFINITIONS;
export const CANONICAL_BIBLE_VERSIONS = Object.freeze(Object.keys(DEFINITIONS));
export const QUESTION_VERSION_ALIASES = Object.freeze(
    Object.values(DEFINITIONS).flatMap(definition => definition.aliases)
);

export function resolveBibleVersion(value = 'CUV_TRAD') {
    const requestedVersion = String(value || 'CUV_TRAD').trim();
    const definition = ALIASES.get(requestedVersion.toLowerCase());
    if (!definition) return null;
    return Object.freeze({
        requestedVersion,
        canonicalVersion: definition.canonicalVersion,
        storageVersion: definition.storageVersion,
        sourceVersion: definition.sourceVersion,
        displayName: definition.displayName,
        ...(definition.public === false ? { public: false } : {})
    });
}

export function requireBibleVersion(value = 'CUV_TRAD') {
    const resolved = resolveBibleVersion(value);
    if (!resolved) throw new Error(`UNSUPPORTED_BIBLE_VERSION:${String(value || '')}`);
    return resolved;
}

export function getBibleVersionAliasMap() {
    return Object.fromEntries(
        Array.from(ALIASES.entries()).map(([alias, definition]) => [alias, definition.storageVersion])
    );
}

export function listBibleVersions() {
    return Object.values(DEFINITIONS).map(definition => ({ ...definition }));
}

export default {
    BIBLE_VERSION_DEFINITIONS,
    CANONICAL_BIBLE_VERSIONS,
    QUESTION_VERSION_ALIASES,
    resolveBibleVersion,
    requireBibleVersion,
    getBibleVersionAliasMap,
    listBibleVersions
};
