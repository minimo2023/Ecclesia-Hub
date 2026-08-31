/**
 * Base Database Adapter interface
 * Defines common methods that must be implemented by concrete adapters
 * Note: While JS doesn't have interfaces, this serves as the contract and base class
 */
export class DatabaseAdapter {
    /**
     * Initialize connection
     */
    async connect() {
        throw new Error('connect() not implemented');
    }

    /**
     * Execute a query that returns multiple rows
     * @param {string} sql SQL query
     * @param {Array} params Query parameters
     * @returns {Promise<Array>} Array of rows
     */
    async query(sql, params = []) {
        throw new Error('query() not implemented');
    }

    /**
     * Execute a query that returns a single row
     * @param {string} sql SQL query
     * @param {Array} params Query parameters
     * @returns {Promise<Object>} Single row object or undefined
     */
    async get(sql, params = []) {
        throw new Error('get() not implemented');
    }

    /**
     * Execute a command (INSERT, UPDATE, DELETE)
     * @param {string} sql SQL query
     * @param {Array} params Query parameters
     * @returns {Promise<Object>} Result object { changes, lastInsertRowid }
     */
    async run(sql, params = []) {
        throw new Error('run() not implemented');
    }

    /**
     * Execute a raw SQL script (e.g. for migrations/schema creation)
     * @param {string} sql Raw SQL script
     */
    async exec(sql) {
        throw new Error('exec() not implemented');
    }

    /**
     * Execute operation in a transaction
     * @param {Function} callback Function receiving the transaction context
     */
    async transaction(callback) {
        throw new Error('transaction() not implemented');
    }

    /**
     * Close connection
     */
    async close() {
        throw new Error('close() not implemented');
    }
}
