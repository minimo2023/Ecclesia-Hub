import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScriptureSearchQuery } from '../domains/scripture-tools/routes.js';

test('scripture tools search resolves public version and Chinese book safely', () => {
    const result = buildScriptureSearchQuery({
        query: '不要懼怕',
        version: 'CUV_TRAD',
        book: '以賽亞書',
        limit: 30
    });

    assert.equal(result.resolvedVersion.storageVersion, 'CUV_TRAD');
    assert.deepEqual(result.params, ['CUV_TRAD', '%不要懼怕%', 'Isaiah', 30]);
    assert.match(result.sql, /text ILIKE \$2/);
    assert.match(result.sql, /book = \$3/);
    assert.match(result.sql, /LIMIT \$4/);
});

test('scripture tools search escapes LIKE wildcard characters', () => {
    const result = buildScriptureSearchQuery({ query: '恩典%', version: 'unv' });
    assert.equal(result.params[1], '%恩典\\%%');
});

test('scripture tools search rejects short query and private compatibility version', () => {
    assert.throws(
        () => buildScriptureSearchQuery({ query: '恩', version: 'CUV_TRAD' }),
        error => error.code === 'INVALID_SEARCH_QUERY'
    );
    assert.throws(
        () => buildScriptureSearchQuery({ query: '恩典', version: 'TCV1995_TRAD' }),
        error => error.code === 'UNSUPPORTED_BIBLE_VERSION'
    );
});
