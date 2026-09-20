// Fetches one Pokémon's cry from PokéAPI and converts it to MP3 in
// assets/cries/. PokéAPI publishes cries as Ogg Vorbis, which Safari cannot
// decode at all, so an iPhone would play nothing at all without this step.
//
//   npm run add-cry -- 133          # one id
//   npm run add-cry -- --all        # every id in data/pokemon.json that is missing
import { mkdirSync, existsSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
const OUT = join(ROOT, 'assets/cries');
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
const data = JSON.parse(readFileSync(join(ROOT, 'data/pokemon.json'), 'utf8'));
const wanted = args.includes('--all')
  ? data.mon.map((m) => m.id).filter((id) => !existsSync(join(OUT, `${id}.mp3`)))
  : args.map(Number).filter(Number.isInteger);

if (!wanted.length) { console.log('nothing to fetch — pass a dex id, or --all'); process.exit(0); }
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

for (const id of wanted) {
  const out = join(OUT, `${id}.mp3`), ogg = join(TMP, `${id}.ogg`);
  try {
    const res = await fetch(`${SOURCE}/${id}.ogg`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(ogg, Buffer.from(await res.arrayBuffer()));
    // Mono at 48k: a cry is about a second of noisy retro audio, so this sounds
    // identical to the source at roughly half the bytes.
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', ogg, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', out]);
    console.log(`  assets/cries/${id}.mp3  (${statSync(out).size} bytes)`);
  } catch (err) {
    rmSync(out, { force: true });
    console.error(`  ${id} failed: ${err.message}`);
    if (String(err.message).includes('ENOENT')) console.error('  (no ffmpeg found — try `pip install imageio-ffmpeg`)');
  }
}
