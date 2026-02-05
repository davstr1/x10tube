import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

// Configurations
const DEV_URL = 'http://localhost:3000';
const PROD_URL = 'https://toyourai.plstry.me';

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
function copyStatic(outdir) {
  mkdirSync(`${outdir}/icons`, { recursive: true });
  cpSync('icons', `${outdir}/icons`, { recursive: true });
  cpSync('manifest.json', `${outdir}/manifest.json`);
  try { cpSync('claude-inject.js', `${outdir}/claude-inject.js`); } catch {}
}

if (isWatch) {
  // Watch mode: only dev
  const ctx = await esbuild.context({
    ...commonOptions,
    outdir: 'dist-dev',
    define: { '__STYA_BASE_URL__': JSON.stringify(DEV_URL) },
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
      define: { '__STYA_BASE_URL__': JSON.stringify(DEV_URL) },
    }),
    esbuild.build({
      ...commonOptions,
      outdir: 'dist-prod',
      define: { '__STYA_BASE_URL__': JSON.stringify(PROD_URL) },
    }),
  ]);

  copyStatic('dist-dev');
  copyStatic('dist-prod');

  console.log(`✓ dist-dev/  → ${DEV_URL}`);
  console.log(`✓ dist-prod/ → ${PROD_URL}`);
}
