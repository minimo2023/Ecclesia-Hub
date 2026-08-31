import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platformDir = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.resolve(platformDir, '..');
const baselinePath = path.join(platformDir, 'production-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function listFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) return listFiles(root, absolute);
    if (!entry.isFile()) return [];
    return [{
      absolute,
      relative: path.relative(root, absolute).split(path.sep).join('/')
    }];
  });
}

function isExcluded(relative, patterns) {
  return patterns.some((pattern) => {
    if (!pattern.endsWith('/**')) return relative === pattern;
    const prefix = pattern.slice(0, -3);
    return relative === prefix || relative.startsWith(`${prefix}/`);
  });
}

function fingerprint(root, exclusions) {
  const rows = listFiles(root)
    .filter(({ relative }) => !isExcluded(relative, exclusions))
    .map(({ absolute, relative }) => {
      const content = fs.readFileSync(absolute);
      return `${relative}|${content.length}|${sha256(content)}`;
    })
    .sort();

  return {
    fileCount: rows.length,
    sha256: sha256(rows.join('\n'))
  };
}

function fingerprintTargets(root, targets, exclusions = []) {
  const files = targets.flatMap((target) => {
    const absolute = path.join(root, target);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Canonical runtime target is missing: ${absolute}`);
    }

    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      return [{
        absolute,
        relative: target.split(path.sep).join('/')
      }];
    }

    return listFiles(root, absolute);
  });

  const rows = files
    .filter(({ relative }) => !isExcluded(relative, exclusions))
    .map(({ absolute, relative }) => {
      const content = fs.readFileSync(absolute);
      return `${relative}|${content.length}|${sha256(content)}`;
    })
    .sort();

  return {
    fileCount: rows.length,
    sha256: sha256(rows.join('\n'))
  };
}

function verifySnapshot(label, config) {
  const root = path.join(hubRoot, config.productionPath);
  if (!fs.existsSync(root)) {
    throw new Error(`${label} canonical snapshot is missing: ${root}`);
  }

  const actual = fingerprint(root, config.coreExclusions ?? []);
  const expected = {
    fileCount: config.coreFileCount,
    sha256: config.coreTreeSha256
  };

  if (actual.fileCount !== expected.fileCount || actual.sha256 !== expected.sha256) {
    throw new Error([
      `${label} canonical snapshot drifted.`,
      `Expected files=${expected.fileCount} sha256=${expected.sha256}`,
      `Actual   files=${actual.fileCount} sha256=${actual.sha256}`
    ].join('\n'));
  }

  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (!indexHtml.includes(config.entry)) {
    throw new Error(`${label} entry mismatch: ${config.entry}`);
  }

  return actual;
}

const desktop = verifySnapshot('desktop', baseline.desktop);
const mobile = verifySnapshot('mobile', baseline.mobile);
const backendPath = path.join(
  hubRoot,
  baseline.backend.referencePath ?? baseline.backend.entry
);
const backendSha256 = sha256(fs.readFileSync(backendPath));
if (backendSha256 !== baseline.backend.sha256) {
  throw new Error(`Canonical backend entry drifted: expected=${baseline.backend.sha256} actual=${backendSha256}`);
}

let runtime = null;
if (process.env.VERIFY_CANONICAL_RUNTIME_TREE === 'true') {
  runtime = fingerprintTargets(
    hubRoot,
    baseline.runtime.codeTargets,
    baseline.runtime.codeExclusions ?? []
  );

  if (
    runtime.fileCount !== baseline.runtime.codeFileCount
    || runtime.sha256 !== baseline.runtime.codeTreeSha256
  ) {
    throw new Error([
      'Captured canonical runtime tree drifted.',
      `Expected files=${baseline.runtime.codeFileCount} sha256=${baseline.runtime.codeTreeSha256}`,
      `Actual   files=${runtime.fileCount} sha256=${runtime.sha256}`
    ].join('\n'));
  }
}

console.log(JSON.stringify({
  success: true,
  canonicalEnvironment: baseline.canonicalEnvironment,
  desktop,
  mobile,
  backend: { sha256: backendSha256 },
  runtime,
  note: runtime
    ? 'Canonical runtime tree strict verification enabled.'
    : 'Canonical desktop, mobile and backend references are unchanged; the rebuildable candidate is verified separately.'
}, null, 2));
