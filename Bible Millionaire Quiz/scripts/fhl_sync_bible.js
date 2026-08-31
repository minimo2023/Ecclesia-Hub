import pg from 'pg';
import dotenv from 'dotenv';
import { FhlBibleSyncService } from '../server/domains/content/bible/FhlBibleSyncService.js';
import { getFhlBook } from '../server/domains/content/bible/fhlCatalog.js';

dotenv.config();

const { Pool } = pg;

function parseArgs(argv) {
    const options = {
        book: 'Hebrews',
        chapter: null,
        versions: ['CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD'],
        dryRun: true,
        explicitSources: {},
        retryDelayMs: 300
    };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        const next = () => {
            const value = argv[++index];
            if (!value) throw new Error(`Missing value for ${arg}`);
            return value;
        };

        if (arg === '--book') options.book = next();
        else if (arg === '--chapter') options.chapter = Number(next());
        else if (arg === '--version' || arg === '--versions') {
            options.versions = next().split(',').map(value => value.trim()).filter(Boolean);
        } else if (arg === '--source-version') {
            if (options.versions.length !== 1) {
                throw new Error('--source-version requires exactly one --version');
            }
            options.explicitSources[options.versions[0]] = next();
        } else if (arg === '--apply') options.dryRun = false;
        else if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--retry-delay-ms') options.retryDelayMs = Number(next());
        else if (arg === '--help' || arg === '-h') options.help = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

function printHelp() {
    console.log(`
Usage:
  node scripts/fhl_sync_bible.js [options]

Safety defaults:
  - Defaults to Hebrews only.
  - Defaults to --dry-run. Database writes require --apply.

Options:
  --book Hebrews
  --chapter 1
  --versions CUV_TRAD,CNV_TRAD,TCV2010_TRAD
  --version CUV_TRAD
  --source-version unv       Only with exactly one target version
  --retry-delay-ms 300
  --dry-run
  --apply
`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    const book = getFhlBook(options.book);
    if (!book) throw new Error(`Unknown Bible book: ${options.book}`);
    if (options.chapter !== null && (!Number.isInteger(options.chapter) || options.chapter < 1 || options.chapter > book.chapters)) {
        throw new Error(`Invalid chapter for ${book.english}: ${options.chapter}`);
    }

    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'dev',
        password: process.env.DB_PASSWORD || 'dev123',
        database: process.env.DB_NAME || 'bible_quiz_v3'
    });

    try {
        const service = new FhlBibleSyncService({ retryDelayMs: options.retryDelayMs });
        const result = await service.syncBook(pool, {
            book: book.english,
            targetVersions: options.versions,
            explicitSources: options.explicitSources,
            chapter: options.chapter,
            dryRun: options.dryRun
        });
        console.log(JSON.stringify(result, null, 2));
        if (options.dryRun) {
            console.log('DRY RUN complete. No database rows were written.');
        } else {
            console.log('FHL sync committed successfully.');
        }
    } finally {
        await pool.end();
    }
}

main().catch(error => {
    console.error(`[FHL Sync] ${error.message}`);
    process.exitCode = 1;
});
