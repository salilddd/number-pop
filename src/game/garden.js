/* The jungle a child grows by three-starring levels.

   One banana buys one growth, and growth is the only thing bananas buy.
   That keeps the reward honest: bananas are earned by clearing a level with
   no mistakes and no lost hearts, so the home screen filling in is a record
   of perfect levels and nothing else. The banana the gorilla catches on the
   home screen is still pure theatre — it is not this currency, and feeding
   him all afternoon plants nothing.

   Twenty plots, each of which grows twice: the first pass plants them, the
   second flowers them. Forty bananas to fill the screen, which at a good
   run's three or four perfect levels is a couple of weeks of practice — the
   point is that it is slow enough to be worth having.

   Nothing here touches gameplay or scoring. It reads the banana total and
   draws; session.js is what banks a run's bananas when the run ends. */
(function (NP) {
  'use strict';

  var rng = NP.rng;

  /* Plots are authored against the same 520px-wide board as scenery.js, and
     positioned from the bottom edge the same way, so they sit on the floor
     and on the crate lids rather than floating near them.

       [ x, y above the base line, kind, size ]

     Ordered by prominence: the first bananas a child ever earns land in the
     middle of the open floor where they cannot be missed, and the fiddly
     corners fill in later.

     Floor plants are sized to be seen from across a room; the ones on the
     lids are held well below that, because a plant is only sitting on a crate
     for as long as it is small enough to fit on one. */
  var PLOTS = [
    [152,    0, 'fern',    62],
    [336,    2, 'fern',    57],
    [196,   -2, 'shrooms', 32],
    [300,    0, 'bush',    49],
    [128,   -4, 'sapling', 89],
    [104, -132, 'shrooms', 24],   // left crate lid, clear of the slat crate
    [368,   -2, 'fern',    67],
    [244,    4, 'bush',    43],
    [172,    4, 'bush',    40],
    [466, -218, 'fern',    34],   // caution crate lid
    [220,   -1, 'fern',    51],
    [ 96,  -70, 'bush',    31],   // the sack's shoulder
    [408, -100, 'shrooms', 26],   // holed crate lid
    [276,    4, 'bush',    46],   // no sapling here: the gorilla's face is
    [318,   -3, 'fern',    54],
    [ 44, -206, 'bush',    28],   // slat crate lid
    [140,    6, 'shrooms', 30],
    [478, -100, 'bush',    31],
    [258,   -1, 'shrooms', 32],
    [200,    6, 'fern',    56]    // ...directly behind x 210-300, and a tree
                                  // planted there grows straight up it
  ];

  var GROW_TIME  = 0.85;        // seconds for one plant to grow in
  var SPROUT_LEAD = 0.45;       // ...after the home screen has settled
  var SPROUT_GAP  = 0.5;        // between consecutive sprouts
  var SWAY = 0.05;              // radians either side, at rest

  var plots = [];
  var w = 0, h = 0, s = 1;
  var screen = '';
  var time = 0;
  var banked = -1;              // banana total the garden has been told about

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* How grown plot `i` should be at this banana total. The first pass over
     every plot plants it; the second flowers it. */
  function targetFor(i, total) {
    if (total > PLOTS.length + i) return 2;
    return total > i ? 1 : 0;
  }

  function live() { return screen === 'home' || screen === 'gameover'; }

  /* ------------------------------------------------------------- layout */

  /* The props root at `h + 6*s`, six units below the visible edge, because a
     crate wants its bottom corners cut off rather than floating. A plant does
     not: rooted down there it loses its lowest fronds off the bottom and what
     is left reads as a smudge along the edge rather than as a plant.

     So the floor plots are lifted back inside the frame. The lid plots are
     not — they are measured off the same base the crates are drawn from, and
     moving that base would float them above the lids they sit on. The two
     groups are told apart by how far above the base they were authored:
     nothing on the floor is more than a few units off it, and the nearest
     lid is seventy. */
  var ROOT_LIFT = 14;           // board units, floor plots only
  var LID_CUTOFF = -60;

  function place(p) {
    var base = h + 6 * s;
    var above = PLOTS[p.i][1];
    p.x = PLOTS[p.i][0] * s;
    p.y = base + (above > LID_CUTOFF ? above - ROOT_LIFT : above) * s;
    p.size = PLOTS[p.i][3] * s;
  }

  /* --------------------------------------------------------------- API */

  NP.garden = {
    plots: PLOTS.length,

    /* Re-laid out with the scenery on every resize. The grown state
       survives, so a rotation does not replant the jungle. */
    build: function (width, height) {
      w = width;
      h = height;
      s = w / 520;

      if (plots.length !== PLOTS.length) {
        plots = [];
        for (var i = 0; i < PLOTS.length; i++) {
          /* A fixed handful of random numbers per plot, drawn once. The art
             indexes into these rather than calling a PRNG, so a plant looks
             identical every frame instead of boiling. */
          var rnd = [];
          for (var r = 0; r < 12; r++) rnd.push(rng.next());

          plots.push({
            i: i,
            kind: PLOTS[i][2],
            rnd: rnd,
            stage: 0,           // what is drawn: 0 none, 1 planted, 2 flowering
            body: 0,            // 0..1, the plant itself growing in
            bloom: 0,           // 0..1, the flowers arriving
            delay: 0,           // before this plot's growth starts
            growing: 0,         // which of body/bloom is animating: 0, 1 or 2
            phase: rng.float(0, Math.PI * 2),
            rate: rng.float(0.5, 0.95),
            tell: 0
          });
        }
        NP.garden.refresh(false);
      }

      for (var k = 0; k < plots.length; k++) place(plots[k]);
    },

    setScreen: function (name) {
      if (name === screen) return;
      screen = name;

      /* New growth sprouts on the home screen and nowhere else. The garden
         is still drawn behind the game-over card — it is the same scene —
         but a jungle growing behind that card would pull the eye off the
         score the child is there to read, and spend the moment early. */
      if (name === 'home') NP.garden.refresh(true);
    },

    /* Read the banana total and bring the plots up to it. With `animate`,
       anything new sprouts in turn with a puff and a rustle; without, it is
       simply already there — which is what the first draw of a session
       wants, or every plant earned last week would sprout again on load.

       Returns how many growths were queued. */
    refresh: function (animate) {
      var total = NP.storage.getBananas();
      if (total === banked && banked >= 0) return 0;

      var queued = 0;

      for (var i = 0; i < plots.length; i++) {
        var p = plots[i];
        var want = targetFor(i, total);
        if (want <= p.stage) continue;              // never un-grow

        var wasEmpty = p.stage === 0;
        p.stage = want;

        if (!animate || banked < 0) {
          p.body = 1;
          p.bloom = want >= 2 ? 1 : 0;
          p.growing = 0;
          p.delay = 0;
          continue;
        }

        /* A plot that skipped straight past planting to flowering still grows
           its body first and picks the blossom up afterwards, as a second
           beat — otherwise it arrives fully formed with flowers already on
           it, which is the one thing the two passes exist to avoid. update()
           chains the second beat off the end of the first. */
        p.growing = wasEmpty ? 1 : 2;
        if (wasEmpty) p.body = 0;
        p.bloom = 0;
        p.delay = SPROUT_LEAD + SPROUT_GAP * queued;
        queued++;
      }

      banked = total;
      return queued;
    },

    /* What the jungle looks like as numbers, for the screens that say so.

       `nextKind` and `nextPass` are what the *following* banana buys, which
       is the only thing the home screen says out loud now. They live here
       rather than in the UI because they are read off the plot table, and
       src/ui/ has no business knowing the order the jungle grows in. */
    status: function () {
      var total = NP.storage.getBananas();
      var full = total >= PLOTS.length * 2;
      /* The first pass plants plot `total`; the second flowers plot
         `total - 20`. Both fall straight out of targetFor() above. */
      var nextIdx = full ? -1
                  : total < PLOTS.length ? total
                  : total - PLOTS.length;

      return {
        bananas: total,
        planted: Math.min(total, PLOTS.length),
        flowering: clamp(total - PLOTS.length, 0, PLOTS.length),
        plots: PLOTS.length,
        full: full,
        nextKind: nextIdx < 0 ? null : PLOTS[nextIdx][2],
        nextPass: full ? null : (total < PLOTS.length ? 'plant' : 'flower')
      };
    },

    update: function (dt) {
      if (!live() || !plots.length) return;
      time += dt;

      for (var i = 0; i < plots.length; i++) {
        var p = plots[i];
        if (p.tell > 0) p.tell -= dt;
        if (!p.growing) continue;

        if (p.delay > 0) {
          p.delay -= dt;
          if (p.delay > 0) continue;

          // The moment it breaks ground: a puff of green and a rustle, so a
          // child looking anywhere on the screen notices something arrived.
          NP.effects.burst(p.x, p.y - p.size * 0.3, p.size * 0.5,
            [NP.theme.leaf1, NP.theme.leaf3, NP.theme.leafVein], 10);
          NP.audio.rustle();
        }

        var key = p.growing === 1 ? 'body' : 'bloom';
        p[key] = Math.min(1, p[key] + dt / GROW_TIME);

        if (p[key] >= 1) {
          // A plot that had to grow its body on the way to flowering picks
          // the blossom up as a second beat rather than at the same time.
          if (p.growing === 1 && p.stage >= 2 && p.bloom < 1) {
            p.growing = 2;
            p.bloom = 0;
            p.delay = 0;
          } else {
            p.growing = 0;
          }
        }
      }
    },

    /* Drawn between the baked scenery and the props, so the gorilla stands
       in front of his own jungle rather than behind it. */
    draw: function (ctx) {
      if (!live() || !plots.length) return;

      for (var i = 0; i < plots.length; i++) {
        var p = plots[i];
        if (p.stage <= 0 || p.body <= 0.01) continue;

        // The idle sway doubles as the tell that says these are touchable.
        var sway = Math.sin(time * p.rate + p.phase) * SWAY *
                   (p.tell > 0 ? 3.4 : 1);

        NP.gardenArt[p.kind](ctx, p.x, p.y, p.size, p.body, p.bloom, sway, p.rnd);
      }
    },

    /* Called from playthings.tap, between the props a child aims at and the
       crates that would otherwise swallow the tap. Returns true if a plant
       answered. */
    tap: function (x, y) {
      if (!live() || !plots.length) return false;

      for (var i = plots.length - 1; i >= 0; i--) {
        var p = plots[i];
        if (p.stage <= 0 || p.body < 0.9) continue;

        // Measured against the middle of the plant rather than its root, or
        // only the soil it grows out of would be touchable.
        var dx = x - p.x;
        var dy = y - (p.y - p.size * 0.42);
        var hit = Math.max(16, p.size * 0.55);
        if (dx * dx + dy * dy > hit * hit) continue;

        p.tell = 0.9;
        NP.audio.rustle();
        NP.effects.burst(p.x, p.y - p.size * 0.45, p.size * 0.4,
          [NP.theme.grown1, NP.theme.grown3], 5);
        return true;
      }

      return false;
    },

    /* Wiping the scores wipes the jungle with them, so "reset" means what it
       says rather than leaving a garden nothing in the game explains. */
    reset: function () {
      banked = -1;
      for (var i = 0; i < plots.length; i++) {
        var p = plots[i];
        p.stage = 0;
        p.body = 0;
        p.bloom = 0;
        p.growing = 0;
        p.delay = 0;
      }
      NP.garden.refresh(false);
    }
  };
})(window.NP = window.NP || {});
