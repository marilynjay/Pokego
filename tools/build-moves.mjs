// Builds data/moves.json: the moves each of her Pokémon actually learns, so the
// one it fires off after breaking out of a ball is a real move and not one I
// made up.
//
// Reads PokéAPI's source CSVs rather than its REST API — the alternative is a
// few hundred requests for one move each.
//
//   npm run build-moves
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const CACHE = join(ROOT, '.cache/csv');
const ENGLISH = '9';

mkdirSync(CACHE, { recursive: true });

async function csv(name) {
  const file = join(CACHE, name);
  if (!existsSync(file)) {
    process.stdout.write(`  fetching ${name}…\r`);
    const res = await fetch(`${SOURCE}/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  const head = split(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(split(line).map((v, i) => [head[i], v])));
}

// Small quote-aware splitter; a few move descriptions carry commas.
function split(line) {
  const out = []; let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\r$/, ''));
}

const [moves, moveNames, pokemonMoves, methods, damageClasses, typeNames] = await Promise.all(
  ['moves.csv', 'move_names.csv', 'pokemon_moves.csv', 'pokemon_move_methods.csv',
   'move_damage_classes.csv', 'type_names.csv'].map(csv));

const levelUp = methods.find((m) => m.identifier === 'level-up')?.id;
if (!levelUp) throw new Error('no level-up method in pokemon_move_methods.csv');

const nameOf = new Map(moveNames.filter((r) => r.local_language_id === ENGLISH).map((r) => [r.move_id, r.name]));
const typeOf = new Map(typeNames.filter((r) => r.local_language_id === ENGLISH).map((r) => [r.type_id, r.name]));
const classOf = new Map(damageClasses.map((r) => [r.id, r.identifier]));
const moveById = new Map(moves.map((r) => [r.id, r]));

const mon = JSON.parse(readFileSync(join(ROOT, 'data/pokemon.json'), 'utf8')).mon;
const wanted = new Set(mon.map((m) => String(m.id)));

// Every move it learns by levelling up, in any game — its signature set, rather
// than every TM it could ever be taught. Taking only the newest game's list
// leaves some of them with three or four moves, which is not enough variety for
// a game that shows one every time a ball fails.
const byMon = new Map([...wanted].map((id) => [id, new Set()]));
for (const row of pokemonMoves) {
  if (row.pokemon_move_method_id !== levelUp || !wanted.has(row.pokemon_id)) continue;
  byMon.get(row.pokemon_id).add(row.move_id);
}

const out = {};
const missing = [];
for (const m of mon) {
  const picked = [...byMon.get(String(m.id))];
  const list = picked.map((moveId) => {
    const move = moveById.get(moveId);
    const name = nameOf.get(moveId);
    if (!move || !name) return null;
    return { name, type: typeOf.get(move.type_id) ?? 'Normal', class: classOf.get(move.damage_class_id) ?? 'status' };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) missing.push(m.name);
  out[m.id] = list;
}
if (missing.length) throw new Error(`no moves found for: ${missing.join(', ')}`);

writeFileSync(join(ROOT, 'data/moves.json'),
  JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), moves: out }, null, 1) + '\n');

console.log(`\nwrote data/moves.json`);
for (const m of mon) console.log(`  ${m.name.padEnd(11)} ${String(out[m.id].length).padStart(2)} moves`);
