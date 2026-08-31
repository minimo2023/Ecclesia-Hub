/**
 * Final Boot Chain Diagnostic Tool
 * Used to identify exactly where the Node.js process exits during startup.
 */

async function run() {
    console.log('🚀 [Boot Check] Step 1: Loading environment...');
    const dotenv = await import('dotenv');
    dotenv.config();
    console.log('✅ Env loaded.');

    console.log('🚀 [Boot Check] Step 2: Loading core schemas...');
    try {
        const schemas = await import('../server/database/schemas_pg.js');
        console.log('✅ schemas_pg.js loaded. Keys:', Object.keys(schemas).length);
    } catch (e) {
        console.error('❌ FAILED to load schemas_pg.js:', e.stack);
        process.exit(1);
    }

    console.log('🚀 [Boot Check] Step 3: Loading database entry (database/index.js)...');
    try {
        const dbIndex = await import('../server/database/index.js');
        console.log('✅ database/index.js loaded.');
    } catch (e) {
        console.error('❌ FAILED to load database/index.js:', e.stack);
        process.exit(1);
    }

    console.log('🚀 [Boot Check] Step 4: Loading LogosEngine...');
    try {
        const logos = await import('../server/services/LogosEngine.js');
        console.log('✅ LogosEngine loaded.');
    } catch (e) {
        console.error('❌ FAILED to load LogosEngine.js:', e.stack);
        process.exit(1);
    }

    console.log('🏁 [Boot Check] ALL CRITICAL MODULES LOADED SUCCESSFULLY.');
}

run().catch(err => {
    console.error('🔥 CRITICAL ERROR IN DIAGNOSTIC:', err.stack);
    process.exit(1);
});
