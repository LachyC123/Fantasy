// Turn the Vite build (dist/) into a page body for hosts that supply their own
// <html>/<head>/<body> skeleton (for example a claude.ai Artifact). Writes
// <out>/index.html and prints the published-path → source-file map for dist/assets.
//
//   npm run build && node scripts/artifact.mjs <outDir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'dist-artifact');
const html = readFileSync('dist/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);

const title = pick(/<title>[\s\S]*?<\/title>/g)[0] ?? '<title>Hollow Atlas</title>';
const head = [...pick(/<link rel="stylesheet"[^>]*>/g), ...pick(/<script type="module"[^>]*><\/script>/g)].map((t) => t.replace(/(src|href)="\.\//g, '$1="'));
const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
// The host's skeleton has a light colour-scheme; the game is a single dark look.
const style = '<style>:root{color-scheme:dark;padding:0!important}html,body{background:#0d0b12}</style>';

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), [title, style, ...head, body.trim()].join('\n') + '\n');

const files = Object.fromEntries(readdirSync('dist/assets').map((f) => [`assets/${f}`, resolve('dist/assets', f)]));
console.log(JSON.stringify({ page: join(outDir, 'index.html'), files }, null, 2));
