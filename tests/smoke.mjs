// Drives a real browser through the whole game: picking a Pokémon, the stat
// roll, every ball, a berry, a break-out, a hide, the sparkly path, and the
// collection stacking. Starts its own server, so `npm test` is the whole thing.
//
//   npm test
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8137;
const URL = `http://127.0.0.1:${PORT}/`;

let passed = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: ROOT, stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);

// Wait for it to answer rather than sleeping a guessed amount.
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(URL); if (r.ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 100));
}

const found = process.env.CHROME_PATH
  ?? globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome').find(existsSync);
const browser = await chromium.launch(found ? { executablePath: found } : {});


/** Opens a fresh page. `rng` is the queue Math.random() reads from, in order;
 *  once it runs dry the last value repeats. */
async function open({ rng = [0.5], settings = {}, reducedMotion = 'reduce' } = {}) {
  const ctx = await browser.newContext({ reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(({ rng, settings }) => {
    let i = 0;
    Math.random = () => rng[Math.min(i++, rng.length - 1)];
    try {
      if (localStorage.getItem('pokego.settings') === null) {
        localStorage.setItem('pokego.settings', JSON.stringify(Object.assign({ shinyOdds: 0, sound: false, fleeing: true }, settings)));
      }
    } catch { /* ignore */ }
  }, { rng, settings });
  await page.goto(URL);
  await page.waitForSelector('#pickGrid .pick');
  return { page, ctx, errors };
}

const meet = async (page, name) => {
  await page.locator('.pick', { has: page.locator(`b:text-is("${name}")`) }).first().click();
  await page.waitForSelector('#s-meet.on');
};
/** Break-outs re-throw from the result button, in a single tap. */
const pick = async (page, kind, key) => {
  const el = page.locator(`[data-${kind}="${key}"]`);
  if (await el.getAttribute('aria-pressed') !== 'true') await el.click();
};
const throwAgain = async (page, berry) => {
  if (berry) await pick(page, 'berry', berry);
  await page.click('#againBtn');
  await page.waitForSelector('#afterRow', { state: 'hidden' });   // the throw started
  await page.waitForSelector('#afterRow:not([hidden])', { timeout: 15000 });
  return page.locator('#headline').innerText();
};
const throwWith = async (page, ball, berry) => {
  if (berry) await pick(page, 'berry', berry);
  await pick(page, 'ball', ball);
  await page.click('#throwBtn');
  await page.waitForSelector('#afterRow:not([hidden])', { timeout: 15000 });
  return page.locator('#headline').innerText();
};

console.log('\nthe pick screen');
{
  const { page, ctx, errors } = await open();
  // Counted from the data file rather than hard-coded, so adding a Pokémon
  // does not fail a test that was only ever describing the old list.
  const mon = JSON.parse(readFileSync(join(ROOT, 'data/pokemon.json'), 'utf8')).mon;
  ok(`shows all ${mon.length}`, await page.locator('#pickGrid .pick').count() === mon.length);
  const grid = await page.locator('#pickGrid').innerText();
  const absent = mon.filter((m) => !grid.includes(m.name)).map((m) => m.name);
  ok('every one of them by name', absent.length === 0, absent.join(', '));
  // The ones that are easy to get wrong, spelled out so a typo in the data
  // file is a failing test rather than something she has to notice.
  for (const name of ['Snubbull', 'Marshadow', 'Mimikyu', 'Lapras', 'Sprigatito', 'Fuecoco', 'Quaxly', 'Bulbasaur'])
    ok(`${name} is spelled right`, grid.includes(name));
  ok('loads without console errors', errors.length === 0, errors[0]);
  await ctx.close();
}

console.log('\nan encounter');
{
  // temper .5, difficulty .99 -> 10, power .1 -> 2, wiggle .4 -> 5
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.1, 0.4] });
  await meet(page, 'Psyduck');
  ok('announces the Pokémon', (await page.locator('#headline').innerText()).includes('Psyduck'));
  ok('rolls a temperament', (await page.locator('#stTemper').innerText()).trim().length > 2);
  ok('rolls difficulty 1-10', await page.locator('#stDiff i.on').count() === 10);
  ok('rolls strength 1-10', await page.locator('#stPower i.on').count() === 2);
  ok('rolls how much it is wiggling', await page.locator('#stWriggle i.on').count() === 5);
  ok('shows its type', (await page.locator('#stTypes').innerText()).includes('Water'));
  ok('will not throw until a ball is picked', await page.locator('#throwBtn').isDisabled());
  await page.click('[data-ball="poke"]');
  ok('throw unlocks once a ball is picked', !(await page.locator('#throwBtn').isDisabled()));
  await ctx.close();
}

console.log('\nthe moon ball house rule');
{
  const { page, ctx } = await open();
  await meet(page, 'Gengar');
  await page.click('[data-ball="moon"]');
  ok('says yes on a spooky one', (await page.locator('#hint').innerText()).includes('good choice'));
  await page.click('#backFromMeet');
  await meet(page, 'Psyduck');
  await page.click('[data-ball="moon"]');
  ok('says no on Psyduck', (await page.locator('#hint').innerText()).includes("isn't one"));
  // A Psychic type added later has to pick the rule up on its own, from its
  // types in the data file, with no code change.
  await page.click('#backFromMeet');
  await meet(page, 'Mewtwo');
  await page.click('[data-ball="moon"]');
  ok('a newly added Psychic one qualifies too',
    (await page.locator('#hint').innerText()).includes('good choice'));
  await ctx.close();
}

console.log('\nthe master ball always works');
{
  // A difficulty-10 Pokémon and a roll that would fail any other ball.
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.999] });
  await meet(page, 'Marshadow');
  const head = await throwWith(page, 'master');
  ok('catches the hardest roll there is', head.includes('Gotcha'), head);
  ok('offers no retry after a catch', await page.locator('#againBtn').isHidden());
  await ctx.close();
}

console.log('\nbreaking out, then hiding');
{
  // difficulty 10, wiggle 6, both catch rolls fail, the second then rolls a hide.
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.5, 0.99, 0.99, 0.0] });
  await meet(page, 'Gengar');
  const first = await throwWith(page, 'poke');
  ok('first miss breaks out, never hides', first.includes('broke out'), first);
  ok('it is still there to throw at again', await page.locator('#ballCard').isVisible());
  const second = await throwAgain(page);
  ok('a later miss can hide in another room', second.includes('another room'), second);
  ok('offers to go and find it', (await page.locator('#againBtn').innerText()).includes('found it'));
  await ctx.close();
}

console.log('\nberries');
{
  // A Nanab calms it, so a roll that would otherwise hide cannot.
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.5, 0.99, 0.99, 0.0] });
  await meet(page, 'Gengar');
  await throwWith(page, 'poke');
  const second = await throwAgain(page, 'nanab');
  ok('a Nanab berry stops it hiding', second.includes('broke out'), second);
  await ctx.close();
}
{
  // Difficulty 8, barely wiggling -> .24 on a plain ball, .60 with a Golden
  // Razz. A roll of .55 falls between the two.
  const { page, ctx } = await open({ rng: [0.5, 0.7, 0.5, 0.0, 0.55] });
  await meet(page, 'Litten');
  ok('the roll under test is difficulty 8', await page.locator('#stDiff i.on').count() === 8);
  const head = await throwWith(page, 'poke', 'golden');
  ok('a Golden Razz turns a miss into a catch', head.includes('Gotcha'), head);
  await ctx.close();
}
{
  const { page, ctx } = await open({ rng: [0.5, 0.0, 0.5, 0.0] });
  await meet(page, 'Grookey');
  await throwWith(page, 'poke', 'pinap');
  await page.click('#doneBtn');
  await page.click('#toCollection');
  ok('a Pinap berry leaves a heart on the collection card',
    (await page.locator('.stack').first().innerText()).includes('💛'));
  await ctx.close();
}

console.log('\nsparkly ones');
{
  // 1-in-50 odds, and the first roll hits.
  const { page, ctx } = await open({ settings: { shinyOdds: 50 }, rng: [0.0, 0.5, 0.99, 0.5, 0.99] });
  await meet(page, 'Gengar');
  ok('announces a sparkly one', (await page.locator('#headline').innerText()).includes('sparkly'));
  ok('uses the shiny artwork', (await page.locator('#monImg').getAttribute('src')).includes('/shiny/'));
  const head = await throwWith(page, 'poke');
  ok('it can still break out', head.includes('broke out'), head);

  await page.click('#doneBtn');
  await meet(page, 'Psyduck');
  ok('someone else is not sparkly too', !(await page.locator('#headline').innerText()).includes('sparkly'));
  await page.click('#backFromMeet');

  await meet(page, 'Gengar');
  ok('the sparkly one is still sparkly when she comes back',
    (await page.locator('#headline').innerText()).includes('sparkly'));
  await throwWith(page, 'master');

  await page.click('#doneBtn');
  await page.click('#toCollection');
  const body = await page.locator('#collectionBody').innerText();
  ok('a caught sparkly one gets its own stack', /sparkly ones/i.test(body), body.slice(0, 80));

  // And once caught it is no longer waiting out there.
  await page.click('#backFromCollection');
  await meet(page, 'Gengar');
  ok('the sparkle does not carry over to the next Gengar',
    !(await page.locator('#headline').innerText()).includes('sparkly'));
  await ctx.close();
}

console.log('\nthe collection stacks up');
{
  const { page, ctx } = await open({ rng: [0.5, 0.0, 0.5, 0.0], settings: { masterCooldown: 0 } });
  for (let i = 0; i < 3; i++) {
    await meet(page, 'Charmander');
    await throwWith(page, 'master');
    await page.click('#doneBtn');
  }
  await meet(page, 'Jolteon');
  await throwWith(page, 'master');
  await page.click('#doneBtn');
  await page.click('#toCollection');
  ok('three Charmanders are one card, not three', await page.locator('.stack').count() === 2);
  ok('the card counts them', (await page.locator('.stack', { hasText: 'Charmander' }).innerText()).includes('3'));
  ok('the totals line reads right', (await page.locator('#collectionBody').innerText()).includes('4 caught'));

  page.on('dialog', (d) => d.accept());
  await page.click('#backFromCollection');
  await page.click('#toSettings');
  await page.click('#resetBtn');
  await page.click('#backFromSettings');
  await page.click('#toCollection');
  ok('reset empties it', (await page.locator('#collectionBody').innerText()).includes('Nothing caught yet'));
  await ctx.close();
}

console.log('\nsettings stick');
{
  const { page, ctx } = await open();
  await page.click('#toSettings');
  await page.selectOption('#setShiny', '10');
  await page.click('#setFlee');
  await page.reload();
  await page.waitForSelector('#pickGrid .pick');
  await page.click('#toSettings');
  ok('shiny odds survive a reload', await page.locator('#setShiny').inputValue() === '10');
  ok('hiding stays switched off', await page.locator('#setFlee').getAttribute('aria-checked') === 'false');
  await ctx.close();
}

console.log('\nnothing moving, for anyone who asked for that');
{
  const { page, ctx, errors } = await open({ reducedMotion: 'no-preference', rng: [0.5, 0.0, 0.5, 0.0], settings: { sound: true } });
  await meet(page, 'Pikachu');
  const head = await throwWith(page, 'poke');
  ok('the full animation still resolves, with sound on', head.includes('Gotcha'), head);
  ok('and throws no errors doing it', errors.length === 0, errors[0]);
  await ctx.close();
}

console.log('\nthrowing again takes one tap');
{
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.99, 0.99, 0.99] });
  await meet(page, 'Gengar');
  await throwWith(page, 'poke');
  ok('the throw button gets out of the way', await page.locator('#throwBtn').isHidden());
  ok('and the retry is the big one', (await page.locator('#againBtn').getAttribute('class')).includes('primary'));
  const second = await throwAgain(page);
  ok('one tap resolves a whole second throw', second.includes('broke out'), second);
  ok('the ball stayed picked', await page.locator('[data-ball="poke"]').getAttribute('aria-pressed') === 'true');
  // Un-picking the ball has to disable it, since it now throws directly.
  await page.click('[data-ball="poke"]');
  ok('no ball means no throw', await page.locator('#againBtn').isDisabled());
  await page.click('[data-ball="great"]');
  ok('picking another re-enables it', !(await page.locator('#againBtn').isDisabled()));
  await ctx.close();
}

console.log('\nthe artwork and the thrown ball actually render');
{
  const { page, ctx, errors } = await open({ reducedMotion: 'no-preference', rng: [0.5, 0.99, 0.5, 0.99] });
  const box = await page.locator('#pickGrid .pick img').first().boundingBox();
  ok('the pick grid draws real pictures', box.width > 40 && box.height > 40, JSON.stringify(box));
  ok('served from this repo, not a CDN',
    !(await page.locator('#pickGrid .pick img').first().getAttribute('src')).startsWith('http'));
  ok('every picture loads', await page.evaluate(
    () => Array.from(document.querySelectorAll('#pickGrid img')).every((i) => i.complete && i.naturalWidth > 0)));

  await meet(page, 'Gengar');
  await page.waitForFunction(() => { const i = document.getElementById('monImg'); return i.complete && i.naturalWidth > 0; });
  const mon = await page.locator('#monImg').boundingBox();
  ok('the Pokémon fills the stage', mon.height > 150, JSON.stringify(mon));

  // The bug this guards: an inline <svg> with only a viewBox has no intrinsic
  // size, and Safari gave the thrown ball a zero-height box.
  await page.click('[data-ball="poke"]');
  await page.click('#throwBtn');
  await page.waitForSelector('#ball.show');
  // Computed size, not the bounding box: mid-flight the ball is scaled down, and
  // it was the CSS size resolving to zero that broke it on iOS.
  const ball = await page.evaluate(() => {
    const px = (el) => { const c = getComputedStyle(el); return [parseFloat(c.width), parseFloat(c.height)]; };
    return { inner: px(document.getElementById('ballInner')), svg: px(document.querySelector('#ball svg')) };
  });
  ok('the thrown ball resolves to a real size',
    ball.svg[0] > 60 && ball.svg[1] > 60 && ball.inner[0] > 60 && ball.inner[1] > 60, JSON.stringify(ball));
  const ids = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[id^="clip-"]')).map((e) => e.id);
    return { count: all.length, unique: new Set(all).size };
  });
  ok('no two clip paths share an id', ids.count === ids.unique, JSON.stringify(ids));
  await page.waitForSelector('#afterRow:not([hidden])', { timeout: 15000 });
  ok('no errors through a full throw', errors.length === 0, errors[0]);
  await ctx.close();
}

console.log('\nevery miss makes the next throw easier');
{
  // Difficulty 10, barely wiggling -> 8% on a plain ball, climbing 10 points a
  // miss. A roll of .30 every time therefore misses, misses, misses, then lands.
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.0, 0.3] });
  await meet(page, 'Marshadow');
  const before = await page.locator('#stDiff i.on').count();
  ok('the same roll misses at first', (await throwWith(page, 'poke')).includes('broke out'));
  ok('and again', (await throwAgain(page)).includes('broke out'));
  ok('and again', (await throwAgain(page)).includes('broke out'));
  const fourth = await throwAgain(page);
  ok('then the very same roll catches it', fourth.includes('Gotcha'), fourth);
  ok('and the bar never let on', await page.locator('#stDiff i.on').count() === before);
  await ctx.close();
}
{
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.0, 0.99] });
  await meet(page, 'Marshadow');
  await throwWith(page, 'poke');
  ok('it says so in words she can hear', /tired/i.test(await page.locator('#hint').innerText()) === false);
  await throwAgain(page);
  ok('after a couple it says it is getting tired', /getting tired/i.test(await page.locator('#hint').innerText()),
    await page.locator('#hint').innerText());
  await ctx.close();
}

console.log('\nthe Nanab berry is worth more on a wriggly one');
{
  // Same difficulty, same berry, same roll of .80 — only the wiggling differs.
  const calm = await open({ rng: [0.5, 0.4, 0.5, 0.0, 0.8] });
  await meet(calm.page, 'Psyduck');
  ok('a still Pokémon barely needs one', await calm.page.locator('#stWriggle i.on').count() === 1);
  const calmHead = await throwWith(calm.page, 'poke', 'nanab');
  ok('so the Nanab does not save the throw', calmHead.includes('broke out'), calmHead);
  await calm.page.click('[data-berry="nanab"]');
  ok('and it says as much', /pretty still/i.test(await calm.page.locator('#hint').innerText()));
  await calm.ctx.close();

  const wild = await open({ rng: [0.5, 0.4, 0.5, 0.99, 0.8] });
  await meet(wild.page, 'Psyduck');
  ok('a wriggly one maxes the bar', await wild.page.locator('#stWriggle i.on').count() === 10);
  await wild.page.click('[data-berry="nanab"]');
  ok('and it says the berry will help a lot', /help a lot/i.test(await wild.page.locator('#hint').innerText()));
  const wildHead = await throwWith(wild.page, 'poke', 'nanab');
  ok('the identical roll now catches it', wildHead.includes('Gotcha'), wildHead);
  await wild.ctx.close();
}

console.log('\nthe Master Ball has to recharge');
{
  const { page, ctx } = await open({ rng: [0.5, 0.5, 0.5, 0.5, 0.99] });
  const master = page.locator('[data-ball="master"]');
  await meet(page, 'Gengar');
  ok('it starts ready', !(await master.getAttribute('class')).includes('locked'));
  ok('and nothing offers to unlock it', await page.locator('#unlockMaster').isHidden());
  await throwWith(page, 'master');
  await page.click('#doneBtn');
  await meet(page, 'Psyduck');
  ok('using it starts the wait', (await master.getAttribute('class')).includes('locked'));
  ok('the tile counts down', /^[0-3]:[0-5][0-9]$/.test(await page.locator('#masterCool').innerText()),
    await page.locator('#masterCool').innerText());
  await master.click();
  ok('tapping it refuses, and says how long', /recharging/i.test(await page.locator('#hint').innerText()));
  ok('and it does not get picked', await master.getAttribute('aria-pressed') === 'false');
  ok('the throw button stays locked out', await page.locator('#throwBtn').isDisabled());

  // It has to survive a reload, or reloading is the way around it.
  await page.reload();
  await page.waitForSelector('#pickGrid .pick');
  await meet(page, 'Psyduck');
  ok('a reload does not clear it', (await page.locator('[data-ball="master"]').getAttribute('class')).includes('locked'));

  await page.click('#unlockMaster');
  ok('a generous grown-up can unlock it', !(await page.locator('[data-ball="master"]').getAttribute('class')).includes('locked'));
  ok('and the unlock button gets out of the way', await page.locator('#unlockMaster').isHidden());
  await page.click('[data-ball="master"]');
  ok('now it can be picked again', await page.locator('[data-ball="master"]').getAttribute('aria-pressed') === 'true');
  await ctx.close();
}
{
  const { page, ctx } = await open({ rng: [0.5, 0.5, 0.5, 0.5, 0.99], settings: { masterCooldown: 0 } });
  await meet(page, 'Gengar');
  await throwWith(page, 'master');
  await page.click('#doneBtn');
  await meet(page, 'Psyduck');
  ok('the cooldown can be switched off entirely',
    !(await page.locator('[data-ball="master"]').getAttribute('class')).includes('locked'));
  await ctx.close();
}

console.log('\nthe Pokémon is still there after the last one was caught');
{
  // The catch animation ends at opacity 0 with fill:'forwards', which outranks
  // inline styles — so the NEXT encounter used to render an empty stage.
  const { page, ctx } = await open({ reducedMotion: 'no-preference', rng: [0.5, 0.0, 0.5, 0.0], settings: { masterCooldown: 0 } });
  const shown = () => page.evaluate(() => {
    const i = document.getElementById('monImg'), r = i.getBoundingClientRect();
    return { opacity: Number(getComputedStyle(i).opacity), w: Math.round(r.width), h: Math.round(r.height) };
  });
  await meet(page, 'Pikachu');
  const first = await shown();
  ok('visible on the first encounter', first.opacity === 1 && first.h > 150, JSON.stringify(first));
  const head = await throwWith(page, 'poke');
  ok('and it gets caught', head.includes('Gotcha'), head);

  await page.click('#doneBtn');
  await meet(page, 'Charmander');
  const next = await shown();
  ok('and the next one is visible too', next.opacity === 1 && next.h > 150, JSON.stringify(next));

  // Same again through a getaway and a break-out, which take other code paths.
  await throwWith(page, 'master');
  await page.click('#doneBtn');
  await meet(page, 'Gengar');
  const third = await shown();
  ok('still visible after a Master Ball catch', third.opacity === 1 && third.h > 150, JSON.stringify(third));
  await ctx.close();
}

console.log('\nyou can tell which version you are running');
{
  const { page, ctx } = await open();
  await page.click('#toSettings');
  const stamp = await page.locator('#buildStamp').innerText();
  ok('settings names the build', /^Version: .+\d{4}/.test(stamp), stamp);
  await ctx.close();
}
{
  // With the ticker disabled, only the start-up paint can lock the tile — which
  // is where paintMaster() belongs, and where it briefly wasn't.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.setInterval = () => 0;
    try {
      localStorage.setItem('pokego.settings', JSON.stringify({ shinyOdds: 0, sound: false, fleeing: true, masterCooldown: 3 }));
      localStorage.setItem('pokego.masterReadyAt', JSON.stringify(Date.now() + 120000));
    } catch { /* ignore */ }
  });
  await page.goto(URL);
  await page.waitForSelector('#pickGrid .pick');
  ok('a stored cooldown shows without waiting for a tick',
    (await page.locator('[data-ball="master"]').getAttribute('class')).includes('locked'));
  await ctx.close();
}

console.log('\nbreaking out, it uses a move on her');
{
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.5, 0.99, 0.99, 0.0] });
  const moves = JSON.parse(readFileSync(join(ROOT, 'data/moves.json'), 'utf8')).moves;

  await meet(page, 'Gengar');
  ok('nothing before a throw', await page.locator('#moveOut').isHidden());
  await throwWith(page, 'poke');
  ok('it uses one on the way out', await page.locator('#moveOut').isVisible());

  const line = await page.locator('#moveName').innerText();
  const named = line.replace(/^Gengar used /, '').replace(/!$/, '');
  ok('named after the Pokémon that threw it', line.startsWith('Gengar used '), line);
  ok('and it is a move Gengar really learns',
    moves['94'].some((m) => m.name === named), `${named} not in Gengar's ${moves['94'].length} moves`);
  ok('with something for her to do about it',
    (await page.locator('#moveDodge').innerText()).trim().length > 12);

  // A getaway means it is not there to do anything to her.
  const hid = await throwAgain(page);
  ok('the second throw is the getaway', hid.includes('another room'), hid);
  ok('nothing uses a move from another room', await page.locator('#moveOut').isHidden());
  await ctx.close();
}
{
  // Caught, and a fresh encounter: neither should be carrying the last move.
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.5, 0.99, 0.0] });
  await meet(page, 'Psyduck');
  await throwWith(page, 'poke');
  ok('a break-out shows one', await page.locator('#moveOut').isVisible());
  const caught = await throwAgain(page);
  ok('the next throw catches it', caught.includes('Gotcha'), caught);
  ok('a catch clears it', await page.locator('#moveOut').isHidden());
  await page.click('#doneBtn');
  await meet(page, 'Litten');
  ok('and so does meeting someone new', await page.locator('#moveOut').isHidden());
  await ctx.close();
}
{
  // Every Pokémon needs a list, or one of them silently never uses a move.
  const moves = JSON.parse(readFileSync(join(ROOT, 'data/moves.json'), 'utf8')).moves;
  const mon = JSON.parse(readFileSync(join(ROOT, 'data/pokemon.json'), 'utf8')).mon;
  const thin = mon.filter((m) => (moves[m.id] ?? []).length < 8).map((m) => m.name);
  ok('every Pokémon has a decent spread of moves', thin.length === 0, thin.join(', '));
  const bad = Object.values(moves).flat().filter((m) => !m.name || !m.type || !m.class);
  ok('every move carries a name, a type and a class', bad.length === 0, JSON.stringify(bad[0]));
}

console.log('\nthe ball is visible on the second throw too');
{
  // The break-out burst ends at opacity 0 with fill:'forwards'. The next throw
  // only animates transform, so nothing took that opacity back off and the
  // whole throw — including the catch screen — rendered empty.
  const { page, ctx } = await open({ reducedMotion: 'no-preference', rng: [0.5, 0.99, 0.5, 0.0, 0.99, 0.0] });
  const ballState = () => page.evaluate(() => {
    const b = document.getElementById('ball');
    const svg = b.querySelector('svg');
    const r = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
    return { opacity: Number(getComputedStyle(b).opacity), display: getComputedStyle(b).display,
             w: Math.round(r.width), h: Math.round(r.height) };
  });

  await meet(page, 'Gengar');
  const first = await throwWith(page, 'poke');
  ok('the first throw breaks out', first.includes('broke out'), first);

  // Catch it on the second throw and check the ball is actually on screen.
  await page.click('#againBtn');
  await page.waitForSelector('#ball.show');
  await page.waitForTimeout(700);
  const mid = await ballState();
  ok('the second ball is visible in flight', mid.opacity === 1 && mid.w > 30, JSON.stringify(mid));

  await page.waitForSelector('#afterRow:not([hidden])', { timeout: 15000 });
  ok('and it was a catch', (await page.locator('#headline').innerText()).includes('Gotcha'));
  const end = await ballState();
  ok('and the catch screen is not empty', end.opacity === 1 && end.h > 30, JSON.stringify(end));
  await ctx.close();
}

await browser.close();
stop();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => `  ✗ ${f}`).join('\n')); process.exit(1); }
