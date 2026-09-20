// Drives a real browser through the whole game: picking a Pokémon, the stat
// roll, every ball, a berry, a break-out, a hide, the sparkly path, and the
// collection stacking. Starts its own server, so `npm test` is the whole thing.
//
//   npm test
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, globSync } from 'node:fs';
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
const throwAgain = async (page, berry) => {
  if (berry) await page.click(`[data-berry="${berry}"]`);
  await page.click('#againBtn');
  await page.waitForSelector('#afterRow', { state: 'hidden' });   // the throw started
  await page.waitForSelector('#afterRow:not([hidden])', { timeout: 15000 });
  return page.locator('#headline').innerText();
};
const throwWith = async (page, ball, berry) => {
  if (berry) await page.click(`[data-berry="${berry}"]`);
  // The ball stays picked after a break-out, and clicking it again would
  // un-pick it — so only click when it isn't already chosen.
  const chooser = page.locator(`[data-ball="${ball}"]`);
  if (await chooser.getAttribute('aria-pressed') !== 'true') await chooser.click();
  await page.click('#throwBtn');
  await page.waitForSelector('#afterRow:not([hidden])', { timeout: 15000 });
  return page.locator('#headline').innerText();
};

console.log('\nthe pick screen');
{
  const { page, ctx, errors } = await open();
  ok('shows all fourteen', await page.locator('#pickGrid .pick').count() === 14);
  ok('Snubbull is spelled with two bs', (await page.locator('#pickGrid').innerText()).includes('Snubbull'));
  ok('no Marshadow typo', (await page.locator('#pickGrid').innerText()).includes('Marshadow'));
  ok('loads without console errors', errors.length === 0, errors[0]);
  await ctx.close();
}

console.log('\nan encounter');
{
  // temper .5, difficulty from .99 -> 10, power from .1 -> 2
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.1, 0.99] });
  await meet(page, 'Psyduck');
  ok('announces the Pokémon', (await page.locator('#headline').innerText()).includes('Psyduck'));
  ok('rolls a temperament', (await page.locator('#stTemper').innerText()).trim().length > 2);
  ok('rolls difficulty 1-10', await page.locator('#stDiff i.on').count() === 10);
  ok('rolls strength 1-10', await page.locator('#stPower i.on').count() === 2);
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
  // difficulty 10, both catch rolls fail, the second one then rolls a hide.
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.99, 0.99, 0.0] });
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
  const { page, ctx } = await open({ rng: [0.5, 0.99, 0.5, 0.99, 0.99, 0.0] });
  await meet(page, 'Gengar');
  await throwWith(page, 'poke');
  const second = await throwAgain(page, 'nanab');
  ok('a Nanab berry stops it hiding', second.includes('broke out'), second);
  await ctx.close();
}
{
  // Difficulty 8 -> base 3/12 = .25. A roll of .55 misses on a plain ball and
  // lands with a Golden Razz (.25 x 2.5 = .625).
  const { page, ctx } = await open({ rng: [0.5, 0.7, 0.5, 0.55] });
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
  const { page, ctx } = await open({ rng: [0.5, 0.0, 0.5, 0.0] });
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

await browser.close();
stop();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => `  ✗ ${f}`).join('\n')); process.exit(1); }
