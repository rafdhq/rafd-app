/**
 * Post-build script: inject dist/assets/*.{js,css} into the Service Worker SHELL.
 * Ensures every JS/CSS chunk is cached at install time so offline-first works
 * even for lazy-loaded chunks (html2canvas, jspdf, etc.) before they are ever fetched.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const distDir = join(process.cwd(), 'dist');
const assetsDir = join(distDir, 'assets');
const swPath = join(distDir, 'sw.js');

if (!existsSync(swPath)) {
  console.error('❌ dist/sw.js not found. Aborting SW injection.');
  process.exit(1);
}

const assetFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => f.endsWith('.js') || f.endsWith('.css'))
  : [];

const assetPaths = assetFiles.map((f) => `/assets/${f}`);

// Read the SW template that Vite copied from public/
let sw = readFileSync(swPath, 'utf8');

// Find the SHELL declaration and replace it with the expanded list
const shellMatch = sw.match(/const\s+SHELL\s*=\s*(\[[^\]]*\]);/);
if (!shellMatch) {
  console.error('❌ Could not find SHELL declaration in sw.js');
  process.exit(1);
}

const baseEntries = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/mobile/manager',
  '/mobile/staff',
];
const shellEntries = [...baseEntries, ...assetPaths];

// Preserve formatting: use single quotes like the original
const shellString =
  "[" +
  shellEntries.map((e) => `'${e}'`).join(', ') +
  "]";

sw = sw.replace(shellMatch[0], `const SHELL = ${shellString};`);

writeFileSync(swPath, sw);
console.log(`✅ Injected ${assetPaths.length} assets into dist/sw.js`);
console.log(`   Total SHELL entries: ${shellEntries.length}`);
