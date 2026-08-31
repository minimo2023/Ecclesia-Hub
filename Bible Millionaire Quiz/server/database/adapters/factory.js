import { SqliteAdapter } from './sqlite.js';
import { PostgresAdapter } from './postgres.js';
import path from 'path';

/**
 * DB Adapter Factory
 * Returns appropriate adapter based on configuration
 */
export class DatabaseFactory {
    static createAdapter(type, config) {
        switch (type) {
            case 'postgres':
                return new PostgresAdapter(config);
            case 'sqlite':
                return new SqliteAdapter(config.filename || config);
            default:
                throw new Error(`Unsupported database type: ${type}`);
        }
    }
}
