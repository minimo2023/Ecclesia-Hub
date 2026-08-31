import { initializeInfrastructure } from '../server/database/index.js';
import { LogosBank } from '../server/database/services/LogosBankService.js';

const dbOps = await initializeInfrastructure();

const userId = 'a31a2b61-d620-4bf5-b3d8-217c90405733';

const balances = await LogosBank.getBalances(userId);
console.log('\n=== LOGOSBANK.getBalances() AFTER FIX ===');
console.log(JSON.stringify(balances, null, 2));

// 驗證 getUser 也注入正確
const user = await dbOps.getUser(userId);
console.log('\n=== getUser().ai_credits ===');
console.log('ai_credits:', user?.ai_credits);
console.log('coins:', user?.coins);

process.exit(0);
