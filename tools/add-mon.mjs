// Fetches one Pokémon's artwork and cry from PokéAPI into this repo.
//
// The artwork is committed rather than streamed from the PokéAPI CDN: hotlinking
// left the stage blank whenever the CDN was slow or unreachable, and there are
// only fourteen of them. The cry is converted to MP3 because PokéAPI publishes
// Ogg Vorbis, which Safari cannot decode at all.
//
//   npm run add-mon -- 133          # one id
//   npm run add-mon -- --all        # everything in data/pokemon.json that is missing
//   npm run add-mon -- --all --force  # re-fetch even what is already there
import { mkdirSync, existsSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
const OUT = join(ROOT, 'assets/cries');
const ARTOUT = join(ROOT, 'assets/art');
const TMP = join(ROOT, '.cache/cries');

const ffmpeg = (() => {
  try {
    return execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'ffmpeg';   // whatever is on PATH; `pip install imageio-ffmpeg` if there isn't one
  }
})();

const args = process.argv.slice(2);
const force = args.includes('--force');
const data = JSON.parse(readFileSync(join(ROOT, 'data/pokemon.json'), 'utf8'));
const complete = (id) => existsSync(join(OUT, `${id}.mp3`))
  && existsSync(join(ARTOUT, `${id}.png`)) && existsSync(join(ARTOUT, 'shiny', `${id}.png`));
const wanted = args.includes('--all')
  ? data.mon.map((m) => m.id).filter((id) => !complete(id))
  : args.map(Number).filter(Number.isInteger);

if (!wanted.length) { console.log('nothing to fetch — pass a dex id, or --all'); process.exit(0); }
mkdirSync(OUT, { recursive: true });
mkdirSync(join(ARTOUT, 'shiny'), { recursive: true });
mkdirSync(TMP, { recursive: true });

async function download(url, to) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

// Artwork and cry are fetched independently: a missing ffmpeg should not cost
// you the pictures, and a failed conversion must never delete a cry that was
// already sitting there working perfectly well.
let failures = 0;
for (const id of wanted) {
  for (const [what, file, get] of [
    ['artwork', join(ARTOUT, `${id}.png`), async () => {
      await download(`${ART}/${id}.png`, join(ARTOUT, `${id}.png`));
      await download(`${ART}/shiny/${id}.png`, join(ARTOUT, 'shiny', `${id}.png`));
      return `assets/art/${id}.png + shiny`;
    }],
    ['cry', join(OUT, `${id}.mp3`), async () => {
      const ogg = join(TMP, `${id}.ogg`);
      await download(`${CRIES}/${id}.ogg`, ogg);
      // Mono at 48k: a cry is about a second of noisy retro audio, so this
      // sounds identical to the source at roughly half the bytes.
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', ogg, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', file]);
      return `assets/cries/${id}.mp3  (${statSync(file).size} bytes)`;
    }],
  ]) {
    const existed = existsSync(file);
    if (existed && !force) { console.log(`  ${id} ${what} already there`); continue; }
    try {
      console.log(`  ${await get()}`);
    } catch (err) {
      if (!existed) rmSync(file, { force: true });   // clean up a half-written file, never a good one
      failures++;
      console.error(`  ${id} ${what} failed: ${err.message}`);
      if (String(err.message).includes('ENOENT') && what === 'cry') {
        console.error('  (no ffmpeg found — try `pip install imageio-ffmpeg`)');
      }
    }
  }
}
if (failures) process.exitCode = 1;
