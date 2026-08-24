# Number Pop

A browser-based arcade math game. A question appears, bubbles drift across the
play field, and you tap the correct answer before it drifts away. Score scales
with how fast you answer. Three lives.

## Status

Playable end to end: home screen, topic picker, a settings sheet behind the
gear, the game itself, a pause card behind the HUD's pause button, and a
game-over screen with the mascot.

The pause button is the HUD's only button, and quitting and restarting live
behind it rather than on the play field: a close button next to a live game is
one stray tap from ending a run. Escape pauses too, and leaving the tab pauses
by itself.

## Playing locally

**Double-click `index.html`.** That's it.

There is no build step and no server needed. The scripts load as ordinary
`<script src>` tags rather than ES modules, specifically so the game runs
straight from the filesystem — an ES module would fail on CORS over `file://`
and force a server for no benefit.

Everything else works from disk too: the artwork is drawn in canvas and every
sound effect is synthesized with the Web Audio API. The one thing that reaches
the network is the Fredoka webfont from Google Fonts; offline it falls back to a
rounded system font and the game plays normally.

The single asset is `assets/jungle-ambience.mp3`, the background jungle loop.
It plays from `file://` as well, though served over http it sounds better: the
game can then decode it and crossfade the loop seam, which a bare `<audio>` tag
cannot do. Delete the file and the game still runs — the ambience just stays
silent.

## Putting it online

Upload the folder to any static host — Netlify Drop, Cloudflare Pages, GitHub
Pages, Vercel. There is nothing to configure and no backend to stand up.

## Layout

```
index.html      markup for the canvas play field, HUD and menu screens
styles/         stylesheet
assets/         the jungle ambience loop, the game's only binary asset
src/core/       engine pieces: game loop, input, audio, ambience, storage, RNG
src/game/       gameplay: questions, distractors, bubbles, motion, levels,
                effects, scoring, playthings, render
src/art/        procedural art: theme, bubbles, gorilla, mascot, scenery
src/ui/         DOM layer: the HUD and the menu screens
src/main.js     bootstrap and the frame tick
```

The menu screens are interactive scenery, not wallpaper. `src/game/playthings.js`
owns all of it: the gorilla, who tracks the pointer with his eyes, thumps his
chest when tapped, hides behind his hands if you hold him, and catches a banana
thrown from the sack; the leaves you can pluck off the canopy; four fireflies
that scatter when one is caught; a parrot and a toucan that take turns crossing
the top; and the crates, which knock. It draws live on top of the baked scenery
layer, because `scenery.js` pre-renders to an offscreen canvas and blitted art
cannot move — which is also why a knocked crate answers with dust and sound
rather than a wobble.

Nothing there touches gameplay, scoring or storage. The banana in particular is
theatre: the run's banana count is earned by three-starring a level, and a home
screen that handed them out would let a child farm the reward without doing any
arithmetic.

Two rules keep this honest: `src/game/` never imports from `src/ui/`, and
`render.js` reads state but never writes it, so a whole run can be simulated
without drawing anything. Script order in `index.html` is the dependency
order — there is no module system doing it for you.

## Scope

Multiplication, division, addition and subtraction, plus a mixed mode, with
user-chosen tables and number ranges. Settings and high scores are kept in
`localStorage` — there is no backend and no account.

High scores are stored per topic set, so beating your 2× table score doesn't
require beating your mixed-mode score.

### Difficulty

One preset moves several dials together:

| | Easy | Normal | Hard |
|---|---|---|---|
| Bubbles | 3 | 4–5 | 6 |
| Drift speed | 25 px/s | 55 px/s | 90 px/s |
| Full-points window | 3.5 s | 2.5 s | 1.8 s |
| Timeout | 12 s | 9 s | 7 s |
| Score multiplier | 0.75× | 1.0× | 1.35× |

### Wrong answers

Distractor quality *is* the difficulty curve, so the wrong options are the
mistakes children actually make rather than random numbers: the adjacent
multiple (`9 × 5` → 40, 50), the near miss (43, 44), the digit swap (54), the
same ones digit (25, 35), the dropped carry (`27 + 15` → 32) and the column
flip (`52 − 28` → 36). Options are also held inside a plausible band around the
answer — a 40 beside an 8 gets ruled out without doing any arithmetic.

### Which question comes next

Facts you get wrong, answer slowly, or haven't seen in a while are weighted up,
but only 70% of the time; the other 30% is uniform. Pure weakness-weighting
traps a child on the same four facts and they stop feeling progress. Per-fact
records live in `localStorage` and survive a settings change.

## Testing

The pure logic — RNG, distractors, question generation, scoring, physics — has
a test harness that runs on Windows without Node:

```
cscript //Nologo //E:JScript test.js
```

It covers thousands of generated questions and option sets, simulates a minute
of bubble physics checking that nothing escapes the play field, stalls, or
deeply overlaps, and drives the session state machine through a pause to
confirm the clock, the drift and the answer reveal all stop and restart
together. `cscript`'s JScript is ES3-era, so the harness polyfills the modern
built-ins the game itself relies on — and patches out the one ES5 getter in
`session.js`, which JScript cannot parse.

## Artwork

All artwork, mascot and branding in this repository must be original or CC0.
Every visual is generated in code: the chalkboard, the crates and sack, the
foliage and vines, the bubbles and the gorilla. Nothing is traced from or copied
out of another game.
