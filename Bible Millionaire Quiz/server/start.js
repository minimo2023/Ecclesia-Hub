import { bootServer, startServer } from './index.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

try {
    await bootServer();
    await startServer(config.server.port);
} catch (error) {
    logger.error(`Fatal startup error: ${error.message}`, { stack: error.stack });
    process.exit(1);
}
