import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

// Lire l'URL de base depuis la variable d'environnement (défaut: localhost)
const baseUrl = process.env.STYA_BASE_URL || 'http://localhost:3000';

const buildOptions = {
  entryPoints: [
    'src/background.ts',
    'src/content.ts',
    'src/popup.ts',
  ],
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
  define: {
    '__STYA_BASE_URL__': JSON.stringify(baseUrl),
  },
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log(`Watching for changes... (STYA_BASE_URL=${baseUrl})`);
} else {
  await esbuild.build(buildOptions);
  console.log(`Built with STYA_BASE_URL=${baseUrl}`);
}
