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

Everything else works from disk too: the artwork is drawn in canvas, every
sound effect is synthesized with the Web Audio API, and the Fredoka webfont is
self-hosted in `styles/fonts/`. Nothing reaches the network at all.

The single asset is `assets/jungle-ambience.mp3`, the background jungle loop.
It plays from `file://` as well, though served over http it sounds better: the
game can then decode it and crossfade the loop seam, which a bare `<audio>` tag
cannot do. Delete the file and the game still runs — the ambience just stays
silent.

## Putting it online

Upload the folder to any static host — Netlify Drop, Cloudflare Pages, GitHub
Pages, Vercel. There is nothing to configure and no backend to stand up.

## Android

`android/` is a WebView shell around the same files. It needs Android Studio
and nothing else — no Node, no bundler, no separate copy of the game.

Open `android/` in Android Studio, let it sync, plug in a phone with USB
debugging on, and press Run.

From a terminal instead:

```
cd android
gradlew assembleDebug          # -> app/build/outputs/apk/debug/app-debug.apk
gradlew installDebug           # build and push to the connected phone
```

The game is **not** vendored into the Android project. A Gradle `Sync` task
stages it out of the repo root at build time, so editing `src/` or `styles/`
and pressing Run is the whole edit loop. The file list in
`android/app/build.gradle.kts` is an allowlist rather than an exclude list, so
the next thing added beside the README doesn't quietly end up in the APK.

### Why it serves over https and not file://

`MainActivity` uses `WebViewAssetLoader` to serve the APK's assets from
`https://appassets.androidplatform.net/`, rather than pointing the WebView at
`file:///android_asset/`. Two things break on `file://`:

- `ambience.js` fetches the jungle loop and decodes it so it can crossfade the
  loop seam. Fetch refuses a `file://` origin, so it would silently fall back
  to the bare `<audio>` element and the seam would come back.
- `file://` pages get an opaque origin, so `localStorage` is scratch space.
  Every highscore and the per-fact practice history would vanish on relaunch.

A synthetic secure origin keeps both. `domStorageEnabled` also has to be set
explicitly or `storage.js` falls back to its in-memory store.

### No network at all

The app declares no permissions, `INTERNET` included, and `MainActivity`
refuses any request that isn't on the asset host. A maths game for children
has no business holding a network handle.

Fredoka used to be the one exception — linked from Google Fonts, and therefore
the one thing in the game that never worked here, since a request the app has
no permission to make cannot succeed. It is now self-hosted at
`styles/fonts/fredoka-latin-var.woff2` and declared by an `@font-face` rule at
the top of `style.css`, so the Android build finally renders in the face the
game was designed in.

It is one 29 KB file for all three weights, because Fredoka is a variable font
and the 500, 600 and 700 the old `<link>` asked for all resolved to the same
woff2. Only the latin subset ships, which is everything the game can produce:
ASCII, `×` and `÷` from latin-1, the minus sign `−` (U+2212) and the thin space
(U+2009). The licence is SIL OFL 1.1 and travels with the font in
`styles/fonts/OFL.txt` — the staging task ships `styles/**`, so both are inside
the APK.

### Back, rotation and the screen timeout

The hardware back button is the one system gesture that can end a run outright,
so it goes through `NP.app.back()` in `main.js` rather than straight to
`finish()`. Every branch mirrors what that screen's own back button does: from
the play field it pauses, from the level card it does nothing, and only from
home does it actually leave.

Rotation is handled by `configChanges` in the manifest, not by an activity
restart. Without it a rotation rebuilds the activity, reloads the WebView and
ends the run mid-question; the game would rather be handed the configuration
change, which it already reacts to via `window.resize`. The activity also holds
`FLAG_KEEP_SCREEN_ON`, because a child working out 7 × 8 is not idle but the
display server can't tell the difference.

Orientation is left unlocked. To pin it, add
`android:screenOrientation="portrait"` to the activity.

### Launcher icon

The icon is the gorilla's head, ported path for path out of `src/art/gorillaArt.js`
into `res/drawable/ic_launcher_foreground.xml` so the launcher shows the same
character the home screen does. It stays a `VectorDrawable` at every density —
adaptive icons landed in API 26 and `minSdk` is 26, so there are no PNGs in the
project at all.

Both drawables wrap the artwork in one `<group>` that scales the 200×210 box
`gorillaArt.js` draws in down into the 108dp icon canvas, which is what lets the
path data be diffed against `head()` in that file without any arithmetic. At
0.42 his ear tips land 35.3 units from centre and his crown 27.7, both inside
the 36-unit radius every launcher mask keeps.

`ic_launcher_monochrome.xml` is the themed-icon layer, where the system keeps
the alpha and throws the colour away. Shading is no help there — fur, face and
muzzle would flatten into one blob — so he is a silhouette with the brow, eyes
and muzzle cut out of it by `fillType="evenOdd"`. The features are not at the
foreground's proportions: the eyes are widened and the muzzle narrowed, because
small eyes over a broad snout read as a pig. The brow is what makes it an ape at
all, and it is the reason the silhouette still reads at 36px. No two holes may
touch, either — under `evenOdd` an overlap flips back to solid and lands as a
blot rather than a gap.

The background layer is `leafDark` from `theme.js`. It is the only green in the
palette he is legible on: the bubble green and its rim both sit within a few
percent of his fur's luminance, and against either of them his head all but
disappears at 48dp.

### Versions

| | |
|---|---|
| Android Gradle Plugin | 9.3.2 |
| Gradle | 9.7.1 (wrapper committed) |
| compileSdk / targetSdk | 37 |
| minSdk | 26 (Android 8.0) |
| Build JDK | 25, Android Studio's bundled JBR |

Two of these are load-bearing. AGP 9 has **built-in Kotlin support**, so the
`org.jetbrains.kotlin.android` plugin must not be applied — it is a hard error,
not a warning — and Kotlin compiler options moved inside the `android { }`
block. AGP 9 also **rejects `Provider` instances in the SourceSet API**, which
is why the staging directory is resolved to a `File` and the task ordering is
wired explicitly through `preBuild`.

The Gradle daemon runs on JDK 25, pinned by `gradle/gradle-daemon-jvm.properties`
(Android Studio generates this). The app itself still targets Java 17 bytecode.

Debug builds are debug-signed, which is all sideloading needs.

### Release builds for Play

Play takes an **`.aab`**, not an APK, and it must be signed with a real key.

Create the key once, from `android/`:

```
"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v ^
  -keystore numberpop-upload.jks -alias numberpop -keyalg RSA -keysize 2048 ^
  -validity 10000
```

Then copy `keystore.properties.example` to `keystore.properties` and fill in
the two passwords. Both that file and the `.jks` are gitignored — a signing key
in a public repo is a key anyone can ship an impostor Number Pop with.

```
gradlew bundleRelease        # -> app/build/outputs/bundle/release/app-release.aab
```

`app/build.gradle.kts` only creates the release `signingConfig` when
`keystore.properties` is actually present, so a fresh clone can still
`assembleDebug` without one. When it is absent the release build deliberately
comes out **unsigned** rather than falling back to the debug key: a
debug-signed release looks like it worked right up until Play rejects the
upload, which is the worst possible place to find out.

Keep the `.jks` backed up somewhere that isn't this laptop. Under Play App
Signing it is the *upload* key rather than the one users verify against, so
losing it is recoverable — but only by asking Google to reset it, which takes
days.

The build needs `JAVA_HOME` on a JDK 25, because
`gradle/gradle-daemon-jvm.properties` pins the daemon there. Android Studio
supplies one; from a plain terminal, point at it explicitly or Gradle will try
to download a toolchain and fail:

```
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
```

### If dependency downloads fail with `PKIX path building failed`

This machine runs AVG Antivirus with TLS scanning on: it terminates https
connections and re-signs them with its own root. Windows trusts that root, so
browsers and Android Studio's own downloader are fine — but the JVM ships a
separate truststore that has never heard of it, so every Gradle dependency
download fails. This hits Android Studio too, because the Gradle daemon is a
plain JVM either way.

The usual one-liner, `-Djavax.net.ssl.trustStoreType=Windows-ROOT`, does *not*
work: Studio's bundled JBR is a stripped JDK with no `SunMSCAPI` provider and
answers `Windows-ROOT not found`. Instead `~/.gradle/gradle.properties` points
the JVM at `~/.gradle/certs/cacerts-avg.jks`, a copy of JBR's own cacerts with
the AVG root added. It lives outside the JDK so it needs no admin rights and
survives an Android Studio update. That file documents how to rebuild it.

Turning off AVG's HTTPS scanning removes the need for any of it.

### If AAPT fails with `error: failed writing to ... The data is invalid. (13)`

The repo lives under OneDrive, whose filter driver occasionally refuses a write
into `app/build/`. It surfaces as a Win32 `ERROR_INVALID_DATA` from AAPT rather
than as anything that mentions OneDrive, and the named file is always somewhere
under `app/build/intermediates/`. Delete the directory it names and build again:

```
rmdir /s /q app\build\intermediates\runtime_symbol_list
gradlew assembleDebug
```

It is not a resource error, so there is nothing to fix in `res/`. If it repeats,
`gradlew clean` clears the lot.

## Layout

```
index.html      markup for the canvas play field, HUD and menu screens
styles/         stylesheet
assets/         the jungle ambience loop, the game's only binary asset
src/core/       engine pieces: game loop, input, audio, ambience, storage, RNG
src/game/       gameplay: questions, distractors, bubbles, motion, levels,
                effects, scoring, garden, playthings, render
src/art/        procedural art: theme, bubbles, gorilla, garden, mascot,
                scenery
src/ui/         DOM layer: the HUD and the menu screens
src/main.js     bootstrap and the frame tick
```

The menu screens are interactive scenery, not wallpaper. `src/game/playthings.js`
owns all of it:

- **The gorilla.** His eyes follow whatever is most interesting — a moving
  finger first, then a bird crossing the canopy once the pointer has been
  still for a moment. Tap him and he hoots and drums his chest; hold him and
  he hides behind his hands until you let go.
- **The sack**, which lobs him a banana he catches and eats.
- **Three coconuts** in a row on the slat crate lid: knock one off and it
  bounces down, rolls along the ground, and he scoops it up. Each keeps its own
  regrow clock, so the lid refills one at a time — and the bomb going off sends
  all of the ones still up there down at once.
- **The bomb** on the caution crate — which is the joke: that crate has been
  stencilled with a warning this whole time. Tap it and the fuse lights and
  sizzles down over a second and a half, throwing sparks and climbing in pitch
  while the bomb trembles, and then it goes off: a flash, two shockwaves,
  embers, splinters off the lid and a cloud of smoke. Keep tapping and the fuse
  burns down faster. It is the one prop the whole scene answers — the fireflies
  scatter, the bird bolts, and the gorilla drums back at the bang — and a fresh
  one is put back on the lid a few seconds later.
- **The canopy leaves**, which come away and flutter down, then grow back.
- **Four fireflies** that scatter when one is caught, and — if the screen is
  left alone long enough — one that comes down and settles on his head until
  something startles him.
- **A parrot and a toucan** that strictly alternate crossing the top.
- **The crates**, which knock.

It all draws live on top of the baked scenery layer, because `scenery.js`
pre-renders to an offscreen canvas and blitted art cannot move — which is also
why a knocked crate answers with dust and sound rather than a wobble.

Nothing there touches gameplay, scoring or storage. The banana in particular is
theatre: the run's banana count is earned by three-starring a level, and a home
screen that handed them out would let a child farm the reward without doing any
arithmetic.

### The gorilla on the sideline

During a run a much smaller version of him watches from the edge of the play
field. Same character, same art, none of the things a finger can do to him —
during a question every tap belongs to the bubbles, and a prop that stole one
would cost a life. He is silent for a related reason: the run already has a
sound for each event he reacts to, so everything he has to say he says with his
body. He throws his fists up for a right answer, drums a milestone, hides behind
his hands through the reveal after a miss, and leans in as the clock runs down.

He never looks at the bubbles. His eyes follow the player's finger and nothing
else, because a gorilla who watched the right answer would be a cheat sheet.

### The jungle

`src/game/garden.js` grows the home screen out of bananas. One banana buys one
growth and growth is the only thing bananas buy, so the plants are a record of
levels cleared with no mistakes and no lost hearts, and nothing else. There are
thirty plots and each grows twice — the first pass plants them, the second puts
them in flower — so filling the screen takes sixty perfect levels. Bananas are
banked when a run **ends**; quitting from the pause card banks none, for the
same reason it scores none.

#### One integer

The whole garden is `grown`, a count of growth steps, in `localStorage`. Growth
is strictly ordered — step *k* plants plot `(k-1) % 30`, and the pass after
flowers it — so a single number says which plants exist and how far along each
one is. Spending adds one; a day passing takes two off. That is why "the newest
dies first" and "a flowering plant drops back to green before it goes" needed no
code: they are what counting down *means*.

#### Spending, by hand

Bananas are a **balance**, not a tally. They sit in the pile on the right-hand
crates until the child taps it, and each tap spends one and grows one plant while
they watch. Growth used to follow the banana total automatically, which meant the
reward landed between visits with nobody looking at it.

The tap flies a banana from the pile to the plot it pays for — the mirror of
`tossBanana`, which flies one *to* the pile when it is earned, so a child can
watch the whole life of a banana. `progressArt.hits()` owns the hit test for the
same reason `target()` owns the aim point: one copy of the placement maths.
`plantFromPile` in `main.js` is tested before `playthings.tap`, because the pile
is drawn on top of the menu scene and hit order follows draw order.

Refusals are spoken rather than silent: a full jungle or an empty pile clicks and
shakes. Planting is home-only — the pile is drawn on the game-over card too, but
that card is where the run is being read.

#### Aging

Two growth steps fall away per day (`DECAY_PER_DAY`), so a jungle is something
kept up rather than finished once. Standing still costs two perfect levels a day.

It is **floored** (`DECAY_FLOOR`, 6): aging is uncapped by days — a fortnight
away really does cost a fortnight — but it stops with a jungle still standing,
because a child returning to a bare screen would have been punished for a holiday
rather than for anything they did. A jungle already under the floor is left alone;
the floor is where aging stops, not a level it tops anything up to.

`age()` runs once per launch, before the home screen is built, so the line under
the score can say what died. A jungle that shrank while it was on screen would
read as the game taking something. The day index is local, not UTC, so "a new
day" falls where the child in front of the phone thinks it does, and a clock set
backwards ages nothing.

Aging is applied without animation on purpose: it happens between visits, so
there is nobody to animate it for, and a plant wilting the instant the home
screen opens would read as a bug rather than as time passing.

Twenty of the plots are ground cover along the bottom and ten are vines that
climb the left and right margins. Ground cover alone can only ever fill a strip:
however long you played, four fifths of the screen stayed bare board. The
climbers are what let growth go **up**, and they are interleaved with the floor
plots rather than added after them, so the jungle grows in both directions from
the first few bananas.

They stay in the margins and never cross the middle, because the middle carries
the logo, the buttons and the score — which is the entire reason `#home-scrim`
exists. A vine through the Play button would be undoing that on purpose.

The garden draws **in front of** the gorilla (`render.js`), not behind him. He is
an opaque silhouette across the middle of the board, and behind him ten of the
fourteen floor plots were invisible — including three of the first four bananas
a child ever earns. Drawing it last makes it the foreground planting band, which
is what the scene already did for the two fronds at his feet. `playthings.tap`
hit-tests the plants ahead of him for the same reason: hit order has to follow
draw order, or the topmost thing under the finger is not the thing that answers.

Earned plants are drawn in their own greens (`grown1..3` in `theme.js`), a step
brighter than the scenery's. They used to share `leaf1/2/3` with the baked
foliage, and the three decorative fronds that used to run across the bottom of
`paintProps` were *larger* than most of the plants a banana buys — so an earned
fern arrived on top of a bigger one the player got for free. Those fronds are
gone and the floor now starts bare, which is what makes twelve perfect levels
look like something.

`?grown=45` forces the size of the jungle and `?bananas=8` the balance waiting to
be spent, the way `?level=` forces the rung. Sixty perfect levels is not
something you can play through to check a layout, and the jungle is the one part
of the game whose whole appearance hangs off a number that takes weeks to move.
Both override the read only — `setGrown` is inert while `?grown=` is in force —
so visiting the URL cannot damage a real save.

New plants sprout on arrival at the home screen, one at a time, and not behind
the game-over card: that card is where the run is being read. The game explains
where bananas go exactly twice — on the level card that earned one, and on the
game-over screen — and after that the jungle speaks for itself.

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
| Missing numbers | 18% | 30% | 42% |
| True or false | 14% | 20% | 24% |

### The freebies

`1 × 5` and `7 × 10` are read off the line rather than worked out. They are the
right place to start, and the wrong place to still be on level 10 — a ladder
whose questions stand still while the bubbles speed up is a ladder that only
gets harder to *see*. So from **level 4** they leave the pool: no operand of 1,
no multiplier of 10, no dividing by one or answering ten, and for add and
subtract no operand of one and nothing in the bottom quarter of the range.

The trim is asymmetric on purpose. A table the player picked in Choose Topics is
not a freebie, it is the thing they sat down to practise, so `10 × 5` stays and
`5 × 10` goes; `50 ÷ 10` stays and `70 ÷ 7 = 10` goes. And a pool with fewer than
six facts left is put back untrimmed — a child drilling the 2× table up to 2 has
to be asked something, and an easy question beats no question.

It happens in the pool rather than per draw, because the pool is what the
weakness weighting picks from: a fact left in it comes back around however
unwelcome it is. `NP.levels.shapes()` decides (`GIMMES_UNTIL`), `buildPool()`
does it, and `session.beginLevel()` rebuilds the pool at the rung that asks —
including on a `?level=` jump straight past it.

### Three shapes of question

A drawn fact becomes one of three questions. Both alternatives are held back
until level 3 — they are the same facts, but they are different things to *do*
with them, and a child still learning that the game is "tap the number" should
not meet a second rule in the same breath. Neither ever appears in a boss,
where three questions have to be answered with no mistakes and the rule
changing underfoot is not the kind of difficulty a boss is for.

`NP.levels.shapes()` is the one place that decides, because it is a property of
the level in the same way the motion mode and the question count are.

### Missing numbers

Some questions hide an operand instead of the answer — `7 × ? = 42` rather than
`7 × 6 = ?`. Same fact, asked backwards, and much harder: it is the inverse
relation rather than a lookup. They start at level 3, because a child still
learning that the game is "tap the number" should not meet a second rule in the
same breath, and they never appear in a boss, where three questions have to be
answered with no mistakes.

The fact's mastery key does not move — `7 × ? = 42` records against `6x7` — so
the weakness weighting keeps working across both forms. Division and
subtraction only ever hide the *second* operand: `? ÷ 6 = 7` asks for the
dividend, which is a far bigger number than anything else on screen, and the
small wrong answers beside it would give the game away. A blank that can be
read straight off the line (`1 × ? = 9`) is refused outright.

Missing numbers deliberately stay out of the topic key, so turning them on does
not split your record of the 4× table into two scoreboards that mean the same
thing. There is a toggle in Choose Topics.

### True or false

Some questions state the answer outright — `6 × 7 = 41` — and put two bubbles on
the field, a gold thumbs up and a red thumbs down. It works in every motion
mode, because two bubbles fall, drift, swing and swap exactly like five.

The whole difficulty is in the claim. Half of them are true; the false half
takes its number from the same distractor pool the wrong bubbles come from, so
what you get is `6 × 7 = 41`, not `6 × 7 = 300`. A wildly wrong claim can be
waved away without arithmetic, and with only two bubbles on screen there is
nothing else holding the question up.

Two bubbles does mean a guess is a coin flip. That is the honest cost, and it is
the same bargain the rest of the game makes: a wrong guess costs a heart, and
across a run guessing loses. The `truth` field is derived from the claim rather
than remembered alongside it, so the two can never disagree.

The thumbs are Google's Material Symbols — `thumb_up` and `thumb_down` in the
Rounded weight, filled — carried in `bubbleArt.js` as path data and filled onto
the canvas like any other shape. This is the one place the game borrows a shape
instead of drawing it, and deliberately: a thumbs up is a shape everyone has
seen ten thousand times, so anything slightly off in the proportions reads as
wrong without the player being able to say why.

The icons are authored on a 960 grid whose y axis already runs downwards, so
the path data drops into a canvas with no flip. Each one is centred on its real
ink bounds rather than on the middle of the grid, because the forearm sits off
to one side and the two therefore differ. The pair is a 180° rotation of one
another rather than a mirror — the forearm swaps corners — which is why the two
bubbles don't read as the same picture upside down.

#### Why these two bubbles report back differently

The pair is coloured by its answer: the thumbs up rides the gold bubble, the
thumbs down the red one, so which is which is legible from across the room
before the icons themselves resolve.

That takes both of the colours every other bubble uses to say something. Gold
is what the right answer turns when it is revealed after a mistake, and red is
what a bubble turns on the way out when you tap it wrongly — so on this pair
those two moments would be a gold bubble turning gold and a red bubble turning
red, which is to say nothing at all. Worse, the tap feedback would be silently
missing exactly where the game most needs to be clear.

So on a thumb the same two moments are told in white, which neither bubble has
spent:

- **tapped wrongly** — a white ring pops off the bubble as it goes, instead of
  the bubble changing colour (`takeWrong` in `session.js`).
- **revealed as the right answer** — a white ring sits just inside the rim for
  as long as the reveal holds (`opts.marked` in `bubbleArt.js`). It rides close
  to the rim on purpose: the hand is white too, and a ring drawn across the
  thumb merges into it and stops reading as a ring.

The confetti follows the same rule — a bubble bursts into the colour it was, so
a gold or red thumb doesn't scatter green.

One thing this deliberately does *not* do is colour the pair by whether it is
correct. Red is the thumbs down, always, whether the thumbs down is the right
answer or the wrong one — and it is the right answer half the time. A red that
sometimes meant "don't pick me" would teach a child to avoid the button rather
than to read the claim.

### Power-ups

A streak milestone — every fifth correct answer — pays out one of three, and you
hold up to two:

- **Slow** — the question runs at 40% for the rest of the question. The bubbles
  and the clock both read the same scaled time, so it slows the *question*
  rather than making the bubbles crawl while the clock keeps draining.
- **Freeze** — everything stops dead for three seconds.
- **50:50** — two wrong bubbles dissolve. They fade rather than pop: a pop is
  the sound and the shape of a right answer, and borrowing it here would teach
  the wrong thing.

The interesting moment is not spending one, it is deciding whether this question
is worth it or whether the boss two levels away is — which is why they are held
rather than fired automatically, and why the cap is two. An inventory you cannot
hold in your head stops being a decision and starts being a menu.

Effects and the sideline gorilla stay on real time throughout. A slow-motion
particle burst just looks like the game has hung.

A 50:50 with nothing to remove — a true-or-false question has one wrong bubble,
not two — is refused, and the button shakes. A refusal is a real answer; going
quiet would look like a broken button.

### Second chances

On by default, in Settings. In **levels 1 and 2**, the first wrong **tap** in
the level takes the bubble away instead of a heart, and the same question stays
live. From level 3 on there are none, and the shield stops appearing in the HUD.

The opening levels are where a child is still learning what a tap costs, and a
slip there should not end the run. By level three the rules are understood, and
the hearts have to mean something for the rest of the ladder to have any weight.
A `?level=` jump lands under the same rule: jump to level 5 and you get none.

A mis-tap normally costs a heart *and* four and a half seconds of reveal, which
is a hard stack to land on a six-year-old who slipped. This unstacks it without
giving anything away: there is no reveal, because the answer is still worth
working out; the clock keeps running; and the streak still breaks. It is a real
mistake with a softer landing.

Only a wrong tap can use one. A timeout or an escaped answer means the clock has
already run out and there is nothing to go back to.

A level that used its second chance cannot earn three stars, and so grows no
banana — the jungle stays a record of clean levels.

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

### My Tables

The home screen's second button opens that record. Every fact sits in a Leitner
box from 1 to 5 — a right answer moves it up, a wrong one drops it straight back
to 1 — and the grid colours each cell by its box, from bare through red and
green to gold. The game has kept those boxes since the first run; until now
nothing ever showed them.

Division shares the multiplication cells rather than getting a grid of its own,
because `42 ÷ 6` is the `6 × 7` fact asked backwards. A cell whose division form
has also reached box 4 gets a notch in its corner: you know it both ways. Adding
and subtracting get a line of counts instead of a square — the fact space for
adding up to 100 is far too large to draw and would be mostly blank if it were.

Tapping a cell says how that one fact is going in words, and the header strip
highlights the tables currently selected in Choose Topics.

## Testing

The pure logic — RNG, distractors, question generation, scoring, physics — has
a test harness that runs on Windows without Node:

```
cscript //Nologo //E:JScript test.js
```

It covers thousands of generated questions and option sets — the plain form, the
missing-operand one, which has its own option-set rules, and the true-or-false
one, where it checks that the claim always agrees with the truth flag and that a
false claim is always close enough to be worth checking. It simulates a minute
of bubble physics confirming that nothing escapes the play field, stalls, or
deeply overlaps, and it drives the session state machine through a pause, a
second chance, and each of the three power-ups — the slow-mo assertion is that
one second of wall clock moves the question clock by four tenths, which is the
kind of thing that breaks silently. `cscript`'s JScript is ES3-era, so the harness polyfills the modern
built-ins the game itself relies on — and patches out the one ES5 getter in
`session.js`, which JScript cannot parse. For the same reason the operator signs
in the harness's own expected strings are written as `\u` escapes: `cscript`
reads `test.js` in the system codepage, not as UTF-8.

The harness is logic only. The drawing, the DOM and the audio are stubbed, so
nothing here says the game looks right — that still needs a browser.

## Artwork

All artwork, mascot and branding in this repository must be original, or under a
licence that permits reuse. Every visual is generated in code: the chalkboard,
the crates and sack, the foliage and vines, the bubbles, the bomb and the
gorilla. Nothing is traced from or copied out of another game. The sound is
generated too — every effect in `audio.js` is synthesized from oscillators and
filtered noise, down to the bang.

The one borrowed shape is the pair of thumbs on true-or-false bubbles: Google's
[Material Symbols](https://github.com/google/material-design-icons) `thumb_up`
and `thumb_down`, used under the Apache License 2.0. The path data lives in
`src/art/bubbleArt.js` with the licence noted beside it.
