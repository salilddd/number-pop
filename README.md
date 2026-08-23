# Number Pop

A browser-based arcade math game. A question appears, bubbles drift across the
play field, and you tap the correct answer before it drifts away. Score scales
with how fast you answer. Three lives.

## Status

Early development.

## Playing locally

The game is plain HTML, CSS and JavaScript with no build step. Serve the folder
over HTTP and open it in a browser:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

Opening `index.html` directly from the filesystem will not work, because the
JavaScript is loaded as ES modules.

## Layout

```
index.html      markup for the canvas play field, HUD and menu screens
styles/         stylesheet
src/core/       engine pieces: game loop, input, audio, storage, RNG
```

## Scope

Multiplication, division, addition and subtraction, plus a mixed mode, with
user-chosen tables and number ranges. Settings and high scores are kept in
`localStorage` — there is no backend and no account.

## Artwork

All artwork, mascot and branding in this repository must be original or CC0.
