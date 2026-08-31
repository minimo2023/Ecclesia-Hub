import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const currentFile = fileURLToPath(import.meta.url);
const utilsRoot = path.dirname(currentFile);

export const serverRoot = path.resolve(utilsRoot, '..');
export const biblicalProjectRoot = path.resolve(serverRoot, '..');

function findHubRoot(startPath) {
    let current = path.resolve(startPath);

    while (true) {
        const marker = path.join(current, 'platform', 'ecclesia-hub.marker');
        if (fs.existsSync(marker)) return current;

        const parent = path.dirname(current);
        if (parent === current) return biblicalProjectRoot;
        current = parent;
    }
}

function resolveConfiguredPath(environmentName, fallback) {
    const configured = process.env[environmentName];
    return configured ? path.resolve(configured) : fallback;
}

export const hubRoot = resolveConfiguredPath(
    'ECCLESIA_HUB_ROOT',
    findHubRoot(biblicalProjectRoot)
);

export const dataRoot = resolveConfiguredPath(
    'ECCLESIA_DATA_ROOT',
    path.join(hubRoot, 'data')
);

export const uploadsRoot = resolveConfiguredPath(
    'ECCLESIA_UPLOADS_ROOT',
    path.join(hubRoot, 'uploads')
);

export const reportsRoot = resolveConfiguredPath(
    'ECCLESIA_REPORTS_ROOT',
    path.join(hubRoot, 'reports')
);

export const privateMediaRoot = resolveConfiguredPath(
    'ECCLESIA_PRIVATE_MEDIA_ROOT',
    path.join(hubRoot, 'private-media')
);

export const publicRoot = path.join(biblicalProjectRoot, 'public');
export const mobileAppRoot = path.join(biblicalProjectRoot, 'mobile-app');
export const promptRoot = path.join(serverRoot, 'services', 'logos', 'prompts');
export const serverConfigRoot = path.join(serverRoot, 'config');
export const serverDataRoot = path.join(serverRoot, 'data');

export const workspacePaths = Object.freeze({
    hubRoot,
    biblicalProjectRoot,
    serverRoot,
    dataRoot,
    uploadsRoot,
    reportsRoot,
    privateMediaRoot,
    publicRoot,
    mobileAppRoot,
    promptRoot,
    serverConfigRoot,
    serverDataRoot,
});

export default workspacePaths;
