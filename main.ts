// Harborline: Plant at Dawn — entrypoint for the threejs-fps-01 competition.
//
// The game itself is the game/ folder beside this file: plain static files,
// ES modules, three.js loaded through an import map, no build step, fully
// offline. This program's only job is to hand the entry in the shape the
// grader expects: copy game/ and screenshots/ into the output directory and
// write dossier.json there with the vendored make.fun library, using the
// scorer's own caps so an entry the scorer would refuse is refused here too.
//
// Run it the way the grader does (Node 22, standard library only):
//   node main.ts            -> writes into /output
//   MAKEFUN_OUTPUT_DIR=out node main.ts   -> writes into ./out instead
// Play the game locally with:  node serve.ts  (then open localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
