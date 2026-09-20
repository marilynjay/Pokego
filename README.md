# Pokémon Catcher

A referee for a game played on the carpet. She throws a plushie Poké Ball at a
plushie Pokémon; a grown-up taps **She threw it!** once the ball has actually
left her hand, and the app decides what happened.

It does not play the game. It watches, and rules on it.

## How a turn goes

1. **Who did you find?** — fourteen big picture buttons.
2. **Stats** get rolled: how it's feeling, how hard it is to catch (1–10), how
   strong it is (1–10), how much it's **wiggling** (1–10), and its type.
3. **Berry?** — if she handed it one of the 3D-printed berries, tap it.
4. **Which ball?** — Poké, Great, Moon or Master.
5. She throws the real ball. Then you tap the button, and the on-screen ball
   arcs over, swallows it, drops, and wobbles once, twice or three times before
   it clicks shut or bursts open.

Three things can happen: **caught**, **broke out** (it's still right there, throw
again) or **ran to another room** (go and find it). Each has its own sound.

**A Pokémon that breaks out uses a move on her**, and the screen says what to do
about it — see below.

After a break-out, **Throw again** throws — one tap, not two. She is still
aiming at the same animal, and the ball she picked stays picked. The berry and
ball rows stay on screen, so a berry can go in first if she hands one over.

## The rules it uses

### Catching

An easy Pokémon goes into a plain Poké Ball about five times in six; a
difficulty-10 one about once in twelve. Balls, berries and wiggling multiply up
from there, every previous miss is added on top, and nothing but a Master Ball
can exceed 95%.

| Ball | Effect |
| --- | --- |
| Poké Ball | ×1 |
| Great Ball | ×1.5 |
| Moon Ball | ×2 on a spooky-or-sparkly one, ×1 on everyone else |
| Master Ball | always catches, always — and it can never run away, but then it has to recharge |

| Berry | Effect |
| --- | --- |
| Razz | ×1.5 |
| Golden Razz | ×2.5 |
| Nanab | scales with wiggling — see below — and it cannot run away |
| Pinap | ×1.2, and a catch leaves a 💛 on its collection card |

A berry is eaten by the throw it was given for. The ball stays selected, since
she usually throws the same one again.

### Every miss makes the next throw easier

A hidden count. Each throw that doesn't land adds ten percentage points to the
next one, up to +75. It's added rather than multiplied on purpose: a multiplier
leaves a difficulty-10 Pokémon stubborn forever, whereas this converges on a
catch no matter how bad the roll was.

In practice the worst case in the game — difficulty 10, wiggling 10, a plain
Poké Ball and no berry — goes in after about 4 throws, and within 7 nineteen
times out of twenty. Nobody has to spend the Master Ball just to end a losing
streak.

None of it shows on the **Hard to catch** bar, which keeps reading whatever it
rolled. The only tell is the line under the picture, which starts saying *it's
getting tired* after a couple of misses, and *it's getting really tired* after
four — true, and the sort of true a three-year-old can act on.

The count follows her across a getaway. If it runs to another room and she
finds it again, the ground she gained comes with her.

### Wiggling, and what the Nanab berry is for

A Pokémon that won't hold still is harder to hit: catch odds are multiplied by
`1 − 0.04 × wiggling`, so a 10 costs you 40%.

A Nanab berry removes that penalty completely **and** is thanked for it, paying
`1 + 0.2 × wiggling` instead. On a Pokémon wiggling at 10 that's the difference
between ×0.6 and ×3.0 — a fivefold swing, and the difference between a 5% throw
and a 25% one.

So it's a real decision rather than a default:

| Wiggling | Better berry |
| --- | --- |
| 1–2 | Razz, or Golden Razz — the Nanab has nothing to fix |
| 3+ | Nanab, and by a widening margin |

The app says which it is when you tap the berry, so she hears the reason rather
than just the result.

### The Master Ball has to recharge

It always works, which makes it the answer to everything unless it costs
something. The cost is three minutes — the tile dims and counts down, and
tapping it tells you how long is left rather than doing nothing.

**I'm feeling generous — unlock it now** clears the wait immediately. It's
deliberately small, text-only and dashed, because it sits on a screen a small
child is jabbing at and it isn't for her.

The countdown is stored, so reloading the page isn't a way around it. The length
is a setting: off, 1, 3, 5 or 10 minutes.

### It fights back

Wriggling free isn't free. A Pokémon that breaks out of the ball — but doesn't
run off — uses one of its own moves, and the screen tells her what to do about
it:

> **Pikachu used Thunder Wave!**
> It's being sneaky! Wiggle about so it doesn't work!

The moves are real. `data/moves.json` holds every move each of the fourteen
learns by levelling up, in any game, built from PokéAPI's source CSVs by
`npm run build-moves`. That's its signature set rather than every TM it could
ever be taught — Gengar gets Hypnosis and Shadow Ball, not Thunderbolt. It runs
from 11 moves for Grookey to 33 for Mr. Mime, and the tests fail if any of them
drops below 8, so nobody quietly ends up with three.

What she should do about it comes from the move's **type**, since that's what
decides whether it's a shower of sparks or a faceful of sludge — duck, roll,
blow it out like a candle, hide behind your hands. Status moves don't hit you,
they try something on you, so they get their own set of lines about being
sneaky. Every line is a physical thing a three-year-old can do standing in a
living room.

Nothing uses a move from another room: a getaway means it isn't there any more.
A catch clears the line, and so does meeting someone new.

Picking the move and the line draws from a **separate generator** from the one
that decides catches. Cosmetic randomness shifting the sequence that settles
whether a ball works would be a bug in itself, and in the tests — where
`Math.random` is a scripted queue — adding a line of flavour text would
otherwise quietly change an outcome somewhere else.

### The Moon Ball

The real rule — a boost only for Pokémon that evolve with a Moon Stone —
catches none of her fourteen, so the Moon Ball would be a Poké Ball with a nicer
paint job. The house rule instead: **it's the ball for the spooky and sparkly
ones**, meaning anything Ghost, Fairy, Psychic or Dark. That's Gengar, Mimikyu,
Mr. Mime, Snubbull, Espeon and Marshadow — six of the fourteen, so it's a real
choice rather than an auto-win, and it's a rule a three-year-old can learn to
predict. The app says out loud which it is when you pick the ball, so she hears
the reason either way.

Add a Ghost or Fairy to `data/pokemon.json` and the rule covers it with no code
change.

### Stats are rolled fresh every time

Nothing is fixed per species. There is such a thing as an easy, friendly
Marshadow and a fierce, grumpy Psyduck, and the same Pokémon is a different
proposition each time she finds it.

They hold still for the length of one encounter, though — breaking out doesn't
re-roll them, because it's the same animal she's still throwing at.

### Running away is the gentle version

A Pokémon can only run **after** it has already broken out once, never on the
first throw in a new room, never on a Nanab berry, never on a Master Ball, and
never if you've switched it off in settings. The odds run from 4% to 13% with difficulty. It's phrased as *ran to
another room*, not *fled*, and the button underneath says **She found it!** —
so it starts a new game somewhere else in the house instead of ending this one.

If it's a rough day, **Let them hide** turns it off entirely and nothing ever
gets away.

### Sparkly ones

1 in 50 by default, adjustable from 1-in-10 to never — plus **Every time**, for
a day that needs a guaranteed sparkle. A pity counter guarantees one by the
50th encounter, so "1 in 50" can't quietly mean "never" on a bad streak.

Two things make this work for a small child:

- **It's rolled per encounter, not per throw.** A sparkly Gengar that breaks out
  is still sparkly on the next throw — a breakout can never steal one.
- **A sparkly one stays out there until she catches it.** If it runs to another
  room, or she wanders off and catches three Pikachu first, it is still sparkly
  whenever she comes back to it. It is only spent once it's actually caught.

### Her collection

Stacked by species, so twelve Charmanders are one card reading **12** rather
than a wall of identical pictures. Sparkly ones get their own stacks in their
own section, which is the whole point of a sparkly one.

Everything lives in `localStorage`, in that browser only. Nothing is synced or
sent anywhere. **Reset everything she's caught** in settings clears it.

## Running it

It's a static page, but browsers block `fetch` from `file://`, so serve the
folder:

```sh
npm run serve      # or: python3 -m http.server 8123
```

Then open <http://localhost:8123>. It works unchanged on GitHub Pages — the
workflow in `.github/workflows` turns Pages on and deploys the repo root from
`main`. There's no build step.

### On her phone or tablet

Add it to the home screen and it opens full-screen with its own icon. Sound
needs one tap anywhere first — that's a browser rule, and the first tap of a
turn satisfies it.

**After a deploy it may keep showing you the old version.** Pages serves the
HTML with a ten-minute cache, and a home-screen web app holds on to it longer
than Safari does. Close the app from the app switcher and reopen it, or pull
down to reload in Safari. The bottom of **Grown-up settings** shows the build
time of whatever you are actually running, so you can tell at a glance rather
than guessing.

## Adding a Pokémon

Append it to `data/pokemon.json` — dex id, name, a phonetic respelling and its
types — then fetch its cry:

```sh
npm run add-mon -- 133
```

That pulls down its artwork (normal and shiny) and its cry. Then rebuild the
move lists so it has something to fight back with:

```sh
npm run build-moves
```

The pick grid, the Moon Ball rule and the collection all follow from the data
file.

The cry step needs `ffmpeg` on PATH (or `pip install imageio-ffmpeg`): PokéAPI
publishes cries as Ogg Vorbis, which Safari cannot decode at all, so an iPhone
would play nothing without the conversion to MP3.

## Repo layout

| Path | What it is |
| --- | --- |
| `index.html` | The whole app — markup, styles and logic |
| `data/pokemon.json` | Her fourteen catchable Pokémon |
| `assets/art/` | Artwork, normal and shiny, committed rather than hotlinked |
| `assets/cries/` | One MP3 cry each, converted from PokéAPI's Ogg |
| `assets/icon.svg` | Home-screen icon, drawn by hand |
| `data/moves.json` | The moves each one learns, for when it breaks out |
| `tools/build-moves.mjs` | Rebuilds that from PokéAPI's CSVs |
| `tools/add-mon.mjs` | Fetches one more Pokémon's artwork and cry |
| `tools/make-icons.mjs` | Rasterises the SVG to the PNGs iOS and Android need |
| `tests/smoke.mjs` | Playwright walk-through of the whole game |

## Tests

```sh
npm test
```

Starts its own server and drives a real browser through the stat roll, every
ball, every berry, a break-out, a hide, the miss-by-miss easing, the Nanab's
scaling, the Master Ball cooldown, the sparkly rules, the collection stacking
and the reset. `Math.random` is stubbed with a queue, so each rule is checked on
an exact roll rather than hoped at — the easing test throws the *same* roll four
times and expects the fourth to land.

They also measure what is actually on screen: that the artwork loads, that the
thrown ball has a real computed size, and that neither goes invisible after a
catch or a break-out.

## Sound

Synthesised in the browser with WebAudio rather than sampled — a rising
arpeggio for a catch, a descending wobble for a break-out, a whoosh for a
getaway. No audio files to license or download, and it works offline.

The cries are the real ones, and they are the only audio committed here.

## Artwork is committed, not hotlinked

The first version streamed artwork from the PokéAPI sprite CDN. On a phone that
left the stage blank whenever the CDN was slow or unreachable — an empty box
where the Pokémon should be, which is no good when the person looking at it
can't read the name underneath. All twenty-eight images (fourteen normal,
fourteen shiny) now ship in `assets/art` and are served from the same place as
the page, so they are exactly as reliable as the app itself. It costs 3.5 MB in
the repo, which for fourteen Pokémon is a bargain.

If an image somehow still fails, the stage falls back to the name and the app
keeps working.

## The one thing that keeps going invisible

Twice now something has vanished from the stage, and both times it was the same
root cause: **an animation with `fill: 'forwards'` keeps its end value in the
cascade above inline styles.** It does not wear off, and `el.style.opacity = '1'`
cannot undo it.

- The catch animation ends at `opacity: 0` on the Pokémon. Every *encounter*
  after a catch rendered an empty stage.
- The break-out burst ends at `opacity: 0` on the ball. Every *throw* after a
  break-out flew invisible, so the catch screen came up blank.

Both are fixed by cancelling leftover animations at the two points where these
elements get reused — the start of an encounter, and the start of a throw:

```js
const clearAnims = (el) => el && el.getAnimations?.().forEach((a) => a.cancel());
```

If something disappears again, this is the first thing to suspect, and the giveaway
is that the element is still the right size — 74×74, `display: block` — just at
zero opacity. Both cases have a test that was checked by reverting the fix and
watching it fail.

## Credits

Artwork and cries from [PokéAPI](https://pokeapi.co). The ball and berry
drawings and the app icon are original SVG, so nothing copyrighted is committed
to this repository. Pokémon names and artwork are © Nintendo / Game Freak /
The Pokémon Company; this is a personal toy for one household and isn't
affiliated with them.
