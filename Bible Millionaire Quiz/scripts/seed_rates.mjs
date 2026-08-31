import { initializeInfrastructure } from '../server/database/index.js';

const dbOps = await initializeInfrastructure();

console.log('Seeding default exchange rates...');
await dbOps.saveSetting('rate_coin_to_credit', '50', '金幣換點數匯率 (X金幣 = 1點數)');
await dbOps.saveSetting('rate_credit_to_coin', '45', '點數換金幣匯率 (1點數 = X金幣)');

console.log('Done!');
process.exit(0);
