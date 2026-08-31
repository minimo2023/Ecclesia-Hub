import fs from 'fs';
import path from 'path';
import { privateMediaRoot } from '../../utils/paths.js';

const recordingsRoot = path.join(privateMediaRoot, 'scripture-recordings');
const stagingRoot = path.join(recordingsRoot, '.staging');

function assertInsideRoot(candidate) {
    const resolved = path.resolve(candidate);
    const root = `${path.resolve(recordingsRoot)}${path.sep}`;
    if (!resolved.startsWith(root)) throw new Error('INVALID_RECORDING_STORAGE_KEY');
    return resolved;
}

export function storageKeyFor(assetId, extension, now = new Date()) {
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const shard = String(assetId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || '00';
    return [year, month, shard, `${assetId}.${extension}`].join('/');
}

export class LocalRecordingStorage {
    constructor() {
        fs.mkdirSync(stagingRoot, { recursive: true });
    }

    resolve(storageKey) {
        return assertInsideRoot(path.join(recordingsRoot, ...String(storageKey).split('/')));
    }

    async write({ assetId, extension, buffer }) {
        const storageKey = storageKeyFor(assetId, extension);
        const finalPath = this.resolve(storageKey);
        const temporaryPath = assertInsideRoot(path.join(stagingRoot, `${assetId}.part`));
        await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
        await fs.promises.writeFile(temporaryPath, buffer, { flag: 'wx' });
        await fs.promises.rename(temporaryPath, finalPath);
        return { storageKey, absolutePath: finalPath };
    }

    async remove(storageKey) {
        const absolutePath = this.resolve(storageKey);
        await fs.promises.rm(absolutePath, { force: true });
    }

    async stat(storageKey) {
        return fs.promises.stat(this.resolve(storageKey));
    }

    createReadStream(storageKey, options) {
        return fs.createReadStream(this.resolve(storageKey), options);
    }

    async cleanupStaging(maxAgeMs = 60 * 60 * 1000) {
        const entries = await fs.promises.readdir(stagingRoot, { withFileTypes: true }).catch(() => []);
        const cutoff = Date.now() - maxAgeMs;
        let removed = 0;
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.part')) continue;
            const target = assertInsideRoot(path.join(stagingRoot, entry.name));
            const stat = await fs.promises.stat(target).catch(() => null);
            if (stat && stat.mtimeMs < cutoff) {
                await fs.promises.rm(target, { force: true });
                removed += 1;
            }
        }
        return removed;
    }
}

export const recordingStorage = new LocalRecordingStorage();
export { recordingsRoot };
export default recordingStorage;
