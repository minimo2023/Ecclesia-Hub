/**
 * DB Init Diagnostic Tool (Sovereign Audit)
 */
import * as schemas from '../server/database/schemas_pg.js';

console.log('🔍 [Diagnostic] Examining schemas_pg.js exports:');
const keys = Object.keys(schemas);
console.log('📂 Total exports:', keys.length);
console.log('📑 Available functions:', keys.join(', '));

const required = ['createAIGovernanceTables', 'createTimeTravelerTables', 'createUsersTables'];
const missing = required.filter(k => !keys.includes(k));

if (missing.length > 0) {
    console.error('❌ [Diagnostic] MISSING CRITICAL FUNCTIONS:', missing.join(', '));
} else {
    console.log('✅ [Diagnostic] All required governance functions are exported.');
}

process.exit(0);
