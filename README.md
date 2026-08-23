# Number Pop

A browser-based arcade math game. A question appears, bubbles drift across the
play field, and you tap the correct answer before it drifts away. Score scales
with how fast you answer. Three lives.

## Status

Early development.

## Playing locally

The game is plain HTML, CSS and JavaScript with no build step, but it does need
to be served over HTTP — the scripts load as ES modules, so opening
`index.html` straight from the filesystem will fail on CORS.

The simplest option in VS Code is the **Live Server** extension
(`ritwickdey.LiveServer`): install it, then right-click `index.html` and choose
*Open with Live Server*.

Any static file server works just as well, if you have one available:

```bash
npx serve .          # Node
python -m http.server 8000   # Python
```

## Layout

```
index.html      markup for the canvas play field, HUD and menu screens
styles/         stylesheet
src/core/       engine pieces: game loop, input, audio, storage, RNG
src/game/       gameplay: questions, distractors, bubbles, effects, scoring, render
src/art/        procedural art: theme, bubbles, mascot, scenery
```

## Scope

Multiplication, division, addition and subtraction, plus a mixed mode, with
user-chosen tables and number ranges. Settings and high scores are kept in
`localStorage` — there is no backend and no account.

## Artwork

All artwork, mascot and branding in this repository must be original or CC0.
