import assert from 'node:assert/strict';
import test from 'node:test';

import { createSystemOps } from '../database/system.js';

const createDb = (counts = {}, options = {}) => {
    const calls = [];

    return {
        calls,
        async get(sql, params = []) {
            calls.push({ sql, params });

            if (sql.includes('to_regclass')) {
                return { relation: options.commentariesExists ? 'commentaries' : null };
            }

            const table = Object.keys(counts).find((name) => sql.includes(`public.${name}`));
            return { count: table ? counts[table] : 0 };
        },
        async query() {
            return [];
        }
    };
};

test('system stats treat the optional commentaries table as empty when it is absent', async () => {
    const contentDb = createDb({
        bible_verses: 31103,
        locations: 120,
        bible_objects: 45,
        lexicons: 800
    });
    const usersDb = createDb({ users: 16 });
    const gamesDb = createDb({ questions: 5019 });
    const ops = createSystemOps({ usersDb, contentDb, notesDb: createDb(), gamesDb });

    const stats = await ops.getStats();

    assert.equal(stats.commentaries, 0);
    assert.equal(stats.verses, 31103);
    assert.equal(stats.users, 16);
    assert.equal(
        contentDb.calls.some(({ sql }) => sql.includes('COUNT(*)') && sql.includes('public.commentaries')),
        false
    );
});

test('system stats count commentaries when the optional table exists', async () => {
    const contentDb = createDb({ commentaries: 1467 }, { commentariesExists: true });
    const usersDb = createDb();
    const gamesDb = createDb();
    const ops = createSystemOps({ usersDb, contentDb, notesDb: createDb(), gamesDb });

    const stats = await ops.getStats();

    assert.equal(stats.commentaries, 1467);
    assert.equal(
        contentDb.calls.some(({ sql }) => sql.includes('COUNT(*)') && sql.includes('public.commentaries')),
        true
    );
});

test('audit log pagination is bounded and returns the management UI contract', async () => {
    const calls = [];
    const usersDb = {
        async query(sql, params) {
            calls.push({ sql, params });
            return [{ id: 'audit-1', action: 'LOGIN_ADMIN' }];
        },
        async get(sql) {
            calls.push({ sql, params: [] });
            return { count: 245 };
        }
    };
    const ops = createSystemOps({
        usersDb,
        contentDb: createDb(),
        notesDb: createDb(),
        gamesDb: createDb()
    });

    const result = await ops.getAuditLogs({ page: -2, limit: 9999 });

    assert.deepEqual(result.data, [{ id: 'audit-1', action: 'LOGIN_ADMIN' }]);
    assert.deepEqual(result.pagination, {
        page: 1,
        limit: 200,
        total: 245,
        totalPages: 2
    });
    assert.deepEqual(calls[0].params, [200, 0]);
    assert.match(calls[0].sql, /COALESCE\(al\.action_type, al\.action, 'UNKNOWN'\)/);
    assert.match(calls[0].sql, /LEFT JOIN public\.users/);
    assert.match(calls[0].sql, /u\.id::text = COALESCE\(al\.actor_user_id::text, al\.user_id::text\)/);
});
