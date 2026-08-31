import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platformDir = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.resolve(platformDir, '..');

function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
}

function resolveInput(value) {
  return path.isAbsolute(value) ? value : path.resolve(hubRoot, value);
}

function readLocalReferences(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const references = new Set();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*`([^`$]+)`\s*\)/g,
    /\bimport\s*["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const reference = match[1];
      if (reference.startsWith('.')) references.add(reference);
    }
  }

  return [...references];
}

function collectGraph(entryPath) {
  const visited = new Set();
  const queue = [entryPath];

  while (queue.length > 0) {
    const current = path.resolve(queue.shift());
    if (visited.has(current)) continue;
    if (!fs.existsSync(current) || !fs.statSync(current).isFile()) continue;

    visited.add(current);
    if (!current.endsWith('.js') && !current.endsWith('.mjs')) continue;

    for (const reference of readLocalReferences(current)) {
      const resolved = path.resolve(path.dirname(current), reference);
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }

  return [...visited].sort();
}

function usage() {
  console.error('Usage: node platform/collect-vite-asset-graph.mjs <entry-js> [root]');
  process.exitCode = 2;
}

const [entryArgument, rootArgument] = process.argv.slice(2);
if (!entryArgument) {
  usage();
} else {
  const entryPath = resolveInput(entryArgument);
  const reportRoot = rootArgument ? resolveInput(rootArgument) : path.dirname(entryPath);

  if (!fs.existsSync(entryPath)) {
    throw new Error(`Vite entry does not exist: ${entryPath}`);
  }

  const files = collectGraph(entryPath).map((absolute) => ({
    path: normalizeSlashes(path.relative(reportRoot, absolute)),
    bytes: fs.statSync(absolute).size,
  }));

  console.log(JSON.stringify({
    entry: normalizeSlashes(path.relative(reportRoot, entryPath)),
    fileCount: files.length,
    files,
  }, null, 2));
}
