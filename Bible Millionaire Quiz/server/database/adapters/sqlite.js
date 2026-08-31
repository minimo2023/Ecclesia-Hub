import sqlite3 from 'better-sqlite3';

export class SqliteAdapter {
    constructor(config) {
        this.filename = config.filename || config;
        this.db = null;
    }
    
    async connect() {
        this.db = new sqlite3(this.filename);
        return this.db;
    }

    async close() {
        if (this.db) this.db.close();
    }

    async query(sql, params = []) {
        try {
            if (sql.trim().toUpperCase().startsWith('SELECT')) {
                return this.db.prepare(sql).all(...params);
            } else {
                return this.db.prepare(sql).run(...params);
            }
        } catch (e) {
            console.error('SQLite query error:', sql, e.message);
            throw e;
        }
    }

    async get(sql, params = []) {
        try {
            return this.db.prepare(sql).get(...params);
        } catch (e) {
            console.error('SQLite get error:', sql, e.message);
            throw e;
        }
    }

    async exec(sql) {
        return this.db.exec(sql);
    }

    // Stub for transaction
    async transaction(callback) {
        const _tx = this.db.transaction(callback);
        return _tx(this);
    }
}
