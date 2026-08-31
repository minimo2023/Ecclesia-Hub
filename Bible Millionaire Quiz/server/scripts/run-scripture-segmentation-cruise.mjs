import { initializeInfrastructure } from '../database/index.js';
import {
    startSegmentationCruise,
    waitForSegmentationCruise
} from '../domains/scripture-tools/segmentation-cruise-service.js';

const activate = process.argv.includes('--activate');
const sizeArgument = process.argv.find(argument => argument.startsWith('--batch-size='));
const batchSize = sizeArgument ? Number(sizeArgument.split('=')[1]) : 100;

try {
    await initializeInfrastructure();
    const started = await startSegmentationCruise({ dryRun: !activate, batchSize, createdBy: 'cli' });
    console.log(JSON.stringify({ event: 'started', run: started }, null, 2));
    const completed = await waitForSegmentationCruise(started.id);
    console.log(JSON.stringify({ event: 'finished', run: completed }, null, 2));
    process.exit(completed?.status === 'COMPLETED' ? 0 : 1);
} catch (error) {
    console.error(JSON.stringify({
        event: 'failed',
        code: error?.code || 'SEGMENTATION_CRUISE_FAILED',
        message: error?.message || String(error)
    }, null, 2));
    process.exit(1);
}
