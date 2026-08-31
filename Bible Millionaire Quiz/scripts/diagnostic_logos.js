/**
 * Logos Engine Diagnostic Tool (Sovereign Audit)
 */
import { fileURLToPath } from 'url';
import { dirname } from 'path';

console.log('🚀 [Diagnostic] Attempting to import LogosEngine singleton...');

try {
    // 試圖加載 Logos 引擎
    const { logosEngine } = await import('../server/services/LogosEngine.js');
    console.log('✅ [Diagnostic] LogosEngine imported successfully.');
    console.log('📑 Engine ID:', logosEngine.modelName);
    
    // 試圖加載靈修服務
    console.log('🚀 [Diagnostic] Attempting to import devotional service...');
    const devotional = await import('../server/services/devotional.js');
    console.log('✅ [Diagnostic] Devotional service imported successfully.');

} catch (e) {
    console.error('❌ [Diagnostic] FATAL INITIALIZATION ERROR:');
    console.error(e.stack);
}

process.exit(0);
