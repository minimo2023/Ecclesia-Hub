import pg from 'pg';
import { DatabaseAdapter } from './base.js';

const { Pool } = pg;

export class PostgresAdapter extends DatabaseAdapter {
    constructor(config) {
        super();
        this.config = config;
        this.pool = null;
        // Explicitly bind to prevent context loss in callbacks/transactions
        this.normalizeSql = this.normalizeSql.bind(this);
        this._transformRow = this._transformRow.bind(this);
    }

    async connect() {
        if (!this.pool) {
            try {
                this.pool = new Pool(this.config);
                // Test connection
                const client = await this.pool.connect();
                try {
                    console.log(`✅ Postgres Connected: ${this.config.database} @ ${this.config.host}`);
                } finally {
                    client.release();
                }
            } catch (err) {
                console.error(`❌ Postgres Connection Error: ${err.message}`);
                throw err;
            }
        }
        return this;
    }

    // Helper to convert snake_case to camelCase
    _camelize(str) {
        return str.replace(/_([a-z0-9])/g, (g) => g[1].toUpperCase());
    }

    // Transform a single row's keys to camelCase (Shallow transform)
    _transformRow(row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
        const newRow = {};
        for (const [key, value] of Object.entries(row)) {
            newRow[this._camelize(key)] = value;
        }
        return newRow;
    }

    // Convert '?' placeholders to '$n' for PostgreSQL
    normalizeSql(sql) {
        if (!sql) return sql;
        let index = 1;
        return sql.replace(/\?/g, () => `$${index++}`);
    }

    async query(sql, params = []) {
        if (!this.pool) await this.connect();
        try {
            const normalizedSql = this.normalizeSql(sql);
            const res = await this.pool.query(normalizedSql, params);
            // Transform all rows to camelCase
            return res.rows.map(row => this._transformRow(row));
        } catch (err) {
            console.error(`Postgres Query Error: ${err.message}`, { 
                originalSql: sql,
                normalizedSql: this.normalizeSql(sql), 
                params 
            });
            throw err;
        }
    }

    // Alias for SQLite compatibility - many operations use .all()
    async all(sql, params = []) {
        return this.query(sql, params);
    }

    async get(sql, params = []) {
        if (!this.pool) await this.connect();
        try {
            const normalizedSql = this.normalizeSql(sql);
            const res = await this.pool.query(normalizedSql, params);
            // Transform row to camelCase
            return this._transformRow(res.rows[0]);
        } catch (err) {
            console.error(`❌ Postgres Query Error: ${err.message}`);
            console.error(`   SQL: ${this.normalizeSql(sql)}`);
            console.error(`   Params: ${JSON.stringify(params)}`);
            throw err;
        }
    }

    async run(sql, params = []) {
        if (!this.pool) await this.connect();
        
        const originalNormalizedSql = this.normalizeSql(sql);
        let runSql = originalNormalizedSql;
        
        // [V9.10 Fix] Robust INSERT RETURNING logic
        const isInsert = /^\s*INSERT\s+INTO/i.test(runSql);
        const hasReturning = /RETURNING/i.test(runSql);
        
        if (isInsert && !hasReturning) {
            // Return all columns to be safe and detect primary key automatically
            runSql += ' RETURNING *';
        }

        try {
            const res = await this.pool.query(runSql, params);
            let lastId = null;
            if (res.rows && res.rows.length > 0) {
                // Internal Audit: We use raw snake_case keys here because res.rows is straight from PG
                lastId = res.rows[0].id || res.rows[0].user_id || Object.values(res.rows[0])[0];
            }
            return {
                changes: res.rowCount,
                lastInsertRowid: lastId
            };
        } catch (err) {
            // [STABLE FALLBACK] If RETURNING * failed (e.g. some complex INSERT types), fallback to original SQL
            if (isInsert && !hasReturning) {
                try {
                    console.warn(`[V9.10 PostgresAdapter] RETURNING fallback triggered: ${err.message}`);
                    const res = await this.pool.query(originalNormalizedSql, params);
                    return { changes: res.rowCount, lastInsertRowid: null };
                } catch (retryErr) {
                    console.error(`❌ [Postgres Fatal] Retry failed with SQL: [${originalNormalizedSql}]`);
                    throw retryErr;
                }
            }
            console.error(`❌ [Postgres Run Error] ${err.message}`, { 
                sql: `[${sql}]`, 
                runSql: `[${runSql}]`,
                params 
            });
            throw err;
        }
    }


    async exec(sql) {
        if (!this.pool) await this.connect();
        try {
            await this.pool.query(sql);
            console.log('✅ Postgres Executed Script');
        } catch (err) {
            console.error(`Postgres Exec Error: ${err.message}`);
            throw err;
        }
    }



    async transaction(callback) {
        const self = this;
        if (!this.pool) await this.connect();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const txContext = {
                query: async (sql, params) => {
                    const res = await client.query(self.normalizeSql(sql), params);
                    return res.rows.map(row => self._transformRow(row));
                },
                get: async (sql, params) => {
                    const res = await client.query(self.normalizeSql(sql), params);
                    return self._transformRow(res.rows[0]);
                },
                run: async (sql, params) => {
                    const res = await client.query(self.normalizeSql(sql), params);
                    return { 
                        changes: res.rowCount, 
                        rowCount: res.rowCount, 
                        lastInsertRowid: res.rows[0]?.id || res.rows[0]?.user_id || null 
                    };
                },
                prepare: (sql) => {
                    return {
                        all: async (...p) => {
                            const res = await client.query(self.normalizeSql(sql), p);
                            return res.rows.map(row => self._transformRow(row));
                        },
                        get: async (...p) => {
                            const res = await client.query(self.normalizeSql(sql), p);
                            return self._transformRow(res.rows[0]);
                        },
                        run: async (...p) => {
                            const res = await client.query(self.normalizeSql(sql), p);
                            return { 
                                changes: res.rowCount, 
                                rowCount: res.rowCount, 
                                lastInsertRowid: res.rows[0]?.id || res.rows[0]?.user_id || null 
                            };
                        }
                    };
                }
            };

                // Pass context AND arguments to the callback
                // better-sqlite3: callback(args) derived from executor(args)
                // But our code usually does: transaction((tx) => ...) ??
                // Actually usage in expeditionSocket: transaction(() => { ... })
                // It uses closure variables.
                // But strict alignment: callback usually receives parameters passed to executor.
                // However, since we defined 'txContext' specifically for binding DB ops to the TX,
                // better-sqlite3 does NOT pass a context object. It relies on the stmt objects prepared OUTSIDE?
                // NO. better-sqlite3 transaction is sync. It locks the database.
                // Statements prepared outside will participate in the transaction if executed on the same thread/conn.
                // In PG, we MUST use the `client` instance.
                // So our callback MUST use `txContext` or we must patch globally (bad).
                // Or... our `dbOps` index.js wrapper should handle this?
                // In `expeditionSocket.js`:
                // const executeTrade = dbOps.gamesDb.transaction(() => { ... use dbOps.gamesDb.prepare ... });
                // If we use `dbOps.gamesDb.prepare` inside `transaction`, it uses the GLOBAL pool, not the TX client.
                // THIS IS FATAL for Postgres implementation.
                // PostgreSQL transactions are connection-bound.

                // If I return an executor, and the user code continues to use global `dbOps.gamesDb`,
                // it will run OUTSIDE the transaction loop.
                // This means my `transaction` implementation in `postgres.js` relies on the callback using `txContext`?
                // But `expeditionSocket.js` uses `dbOps.gamesDb` inside the callback!

                // This implies that for PG, `expeditionSocket` MUST be refactored to use the passed context,
                // OR we need CLS (Continuation Local Storage) which is complex in JS.

                // Simpler Fix:
                // Change `expeditionSocket.js` to not use `transaction` wrapper style if it's too hard to adapt.
                // Just use explicit `BEGIN` / `COMMIT` / `ROLLBACK`?
                // Or, update `expeditionSocket.js` to use the `tx` argument??
                // But `better-sqlite3` `transaction` callback does not receive a `tx` object (it receives custom args).

                // Correction:
                // In `better-sqlite3`, `transaction` creates a wrapper. When called, it runs exclusively.
                // Statements run on the `Database` object automatically use the current transaction of that thread.

                // We cannot replicate this easily in Node/PG without AsyncLocalStorage.
                // So, we MUST pass the transaction client to the callback.
                // And we MUST refactor `expeditionSocket.js` to use it.

                // So, for now, I will modify `postgres.js` to return executor.
                // AND I will modify `expeditionSocket.js` to use the injected `tx` if available, or just refactor.
                // AND since `expeditionSocket` modification is upcoming, I will handle the logic there.

                const result = await callback(txContext);
                await client.query('COMMIT');
                return result;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
    }

    // === Backward Compatibility for better-sqlite3 ===
    /**
     * Shim for better-sqlite3 prepare() method.
     * Note: This returns an object with methods that are internally ASYNC but 
     * presented as a standard statement interface. 
     * WARNING: Users must still await results if the wrapper doesn't handle it,
     * but many of our routes already handle this or use generic dbOps.
     */
    prepare(sql) {
        const self = this;
        return {
            all: (...params) => {
                // Return a promise if called, though better-sqlite3 .all() is sync
                // This works because our route handlers often use async/await anyway
                return self.query(sql, params);
            },
            get: (...params) => {
                return self.get(sql, params);
            },
            run: (...params) => {
                return self.run(sql, params);
            }
        };
    }
    // ===============================================

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            console.log('🔌 Postgres Disconnected');
        }
    }
}
