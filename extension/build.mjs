import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const isWatch = process.argv.includes('--watch');

// Load .env from parent directory
const envFile = readFileSync('../.env', 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
);

// Configurations
const DEV_URL = env.DEV_URL || 'http://localhost:3000';
const PROD_URL = env.PROD_URL || 'https://toyourai.plstry.me';
const CHROME_EXTENSION_URL = env.CHROME_EXTENSION_URL || '';
const REVIEW_PROMPT_FIRST = parseInt(env.REVIEW_PROMPT_FIRST) || 20;
const REVIEW_PROMPT_SECOND = parseInt(env.REVIEW_PROMPT_SECOND) || 50;
const POSTHOG_API_KEY = env.POSTHOG_API_KEY || '';

const entryPoints = [
  'src/background.ts',
  'src/content.ts',
];

const commonOptions = {
  entryPoints,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

// Copy static files to a dist folder
function copyStatic(outdir, { prod = false } = {}) {
  mkdirSync(`${outdir}/icons`, { recursive: true });
  cpSync('icons', `${outdir}/icons`, { recursive: true });

  // Process manifest: strip localhost entries in prod
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));
  if (prod) {
    const isLocalhost = (s) => s.includes('localhost');
    if (manifest.host_permissions) {
      manifest.host_permissions = manifest.host_permissions.filter(p => !isLocalhost(p));
    }
    if (manifest.externally_connectable?.matches) {
      manifest.externally_connectable.matches = manifest.externally_connectable.matches.filter(p => !isLocalhost(p));
    }
  }
  writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

  try { cpSync('claude-inject.js', `${outdir}/claude-inject.js`); } catch {}
}

const commonDefines = {
  '__CHROME_EXTENSION_URL__': JSON.stringify(CHROME_EXTENSION_URL),
  '__REVIEW_PROMPT_FIRST__': JSON.stringify(REVIEW_PROMPT_FIRST),
  '__REVIEW_PROMPT_SECOND__': JSON.stringify(REVIEW_PROMPT_SECOND),
  '__POSTHOG_API_KEY__': JSON.stringify(POSTHOG_API_KEY),
};

if (isWatch) {
  // Watch mode: only dev
  const ctx = await esbuild.context({
    ...commonOptions,
    outdir: 'dist-dev',
    define: { ...commonDefines, '__STYA_BASE_URL__': JSON.stringify(DEV_URL) },
  });
  await ctx.watch();
  copyStatic('dist-dev');
  console.log(`Watching for changes... (dev: ${DEV_URL})`);
} else {
  // Build both dev and prod
  await Promise.all([
    esbuild.build({
      ...commonOptions,
      outdir: 'dist-dev',
      define: { ...commonDefines, '__STYA_BASE_URL__': JSON.stringify(DEV_URL) },
    }),
    esbuild.build({
      ...commonOptions,
      outdir: 'dist-prod',
      define: { ...commonDefines, '__STYA_BASE_URL__': JSON.stringify(PROD_URL) },
    }),
  ]);

  copyStatic('dist-dev');
  copyStatic('dist-prod', { prod: true });

  console.log(`✓ dist-dev/  → ${DEV_URL}`);
  console.log(`✓ dist-prod/ → ${PROD_URL}`);
}
