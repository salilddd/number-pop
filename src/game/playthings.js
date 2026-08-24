/* The things a child can poke at on the menu screens.

   None of this touches gameplay, scoring or storage — it exists so that a
   child waiting to start, or sitting on the game-over screen, has something
   to do with their hands. That is also why every prop answers instantly and
   loudly: a tap that produces nothing teaches a child the screen is dead.

   Everything here is drawn live rather than baked into the scenery layer,
   because scenery.js pre-renders to an offscreen canvas on resize and blits
   it — baked art cannot move. The crates are the exception that proves it:
   they are part of the baked layer, so knocking one gives dust, sound and a
   jolt rather than a visible wobble.

   Layout is authored at 520px wide and scaled by w/520, the same convention
   paintProps and paintCanopy use, so the pluckable leaves line up with the
   vines they appear to hang from at any screen size. */
(function (NP) {
  'use strict';

  var T = NP.theme;
  var rng = NP.rng;

  /* ---- gorilla ----
     He is the main event on the home screen, so he is drawn big: a third of
     the screen height, sitting in the gap between the two crate groups. The
     cap on screen height is what keeps him off the best-score line on a
     short phone. */
  var GORILLA_H     = 232;      // box units at the 520px authoring width
  var GORILLA_MAX_H = 0.34;     // ...but never more than this much of the screen

  var REAR_TIME     = 0.2;
  var SETTLE_TIME   = 0.3;
  var DRUM_INTERVAL = 0.17;     // seconds between fists — slow enough to read
  var DRUM_BURST    = 1.0;      // one tap is worth this much drumming
  var DRUM_MAX      = 2.6;      // ...but keep-tapping cannot wind up forever
  var BLINK_TIME    = 0.14;

  /* ---- peek-a-boo ---- */
  var HOLD_TIME     = 0.55;     // press this long on him and he hides
  var COVER_TIME    = 0.18;     // hands up
  var UNCOVER_TIME  = 0.3;      // ...and the reveal

  /* ---- coconut ---- */
  var COCONUT_G       = 1500;
  var COCONUT_BOUNCE  = 0.46;
  var COCONUT_REGROW  = [6, 10];

  /* ---- the bomb ----
     The fuse is the whole point of it: long enough that a child sees the
     spark travelling and knows something is coming, short enough that they
     are still watching when it arrives. */
  var FUSE_TIME   = 1.6;
  var FUSE_CUT    = 0.24;       // how much each further tap hurries it along
  var FUSE_FLOOR  = 0.14;       // ...but never straight to the bang under a finger
  var FIZZ_GAP    = 0.19;       // seconds between licks of the fuse sound
  var SPARK_GAP   = 0.045;      // ...and between sparks thrown off the tip
  var BOMB_REGROW = [5.5, 9];
  var BOMB_ARRIVE = 0.42;       // the pop as a fresh one is put back

  /* ---- bananas ---- */
  var BANANA_FLY    = 0.95;     // seconds from the sack to his mouth
  var BANANA_G      = 900;
  var EAT_TIME      = 1.4;
  var MAX_BANANAS   = 4;

  /* ---- birds ----
     Two species that strictly alternate, so a child who has just watched the
     parrot go past gets something new next time rather than a coin flip that
     might hand them the same bird four times running.

     One crosses every ten seconds, and the clock is measured launch to launch
     rather than from the moment the last one left the screen — a slow toucan
     and a quick parrot then keep the same beat instead of the gap stretching
     with the crossing. */
  var BIRD_PERIOD = 10;
  var FIRST_BIRD  = 2.5;        // the first one comes sooner than the rest

  var BIRDS = [
    { art: 'parrot', cry: 'squawk', size: 34, speed: [95, 150], flap: 7,   hit: 0.95 },
    { art: 'toucan', cry: 'croak',  size: 46, speed: [68, 108], flap: 5.2, hit: 0.85 }
  ];

  /* ---- leaves ---- */
  var LEAF_TERMINAL = 58;       // px/s, the speed a falling leaf settles to
  var LEAF_REGROW   = [4, 7];   // seconds before a plucked leaf comes back
  var MAX_FALLING   = 14;

  /* ---- fireflies ---- */
  var FLY_COUNT     = 4;
  var FLY_SPEED     = 36;
  var DART_SPEED    = 190;
  var DART_TIME     = 0.7;
  var SCATTER       = 90;       // how far a startled neighbour jumps away

  /* A prop that has not been touched for this long gives a silent tell, so
     a child who has not realised the scene is alive finds out. */
  var NUDGE_AFTER   = 7;

  var w = 0, h = 0, s = 1;
  var screen = '';              // '' when nothing is live
  var time = 0;
  var idleTime = 0;

  /* Seconds since the pointer last actually moved. A parked cursor stops
     being interesting after this long and he goes back to watching the sky. */
  var POINTER_INTEREST = 1.5;
  var pointerIdle = 99;
  var lastPointerX = 0, lastPointerY = 0;

  var gorilla = null;
  var leaves = [];
  var falling = [];
  var flies = [];
  var knocks = [];
  var sack = null;
  var bananas = [];
  var coconut = null;
  var bomb = null;
  var bird = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* --------------------------------------------------------------- layout */

  function layoutGorilla() {
    // He sits in the gap between the two crate groups — the left one ends
    // near 124*s and the right one starts at 382*s.
    var height = Math.min(GORILLA_H * s, h * GORILLA_MAX_H);
    gorilla = {
      x: w * 0.487,
      groundY: h + 4 * s,
      height: height,
      scale: height / NP.gorillaArt.height,

      stage: 'idle',
      stageT: 0,
      drumLeft: 0,
      nextHit: 0,
      beat: 0,
      armL: 0,
      armR: 0,

      blinkIn: rng.float(2, 5),
      blinking: 0,
      scratch: 0,
      impact: 0,

      gazeX: 0,
      gazeY: 0,
      eating: 0,
      eatKind: 'banana',
      chewed: false
    };
  }

  /* Six leaves hung off the vines and clusters painted by paintCanopy, so
     they look like part of the canopy rather than six sprites parked on top
     of it. The angles sit around PI because scenery.leaf draws pointing up
     before rotation, and these have to hang. */
  function layoutLeaves() {
    var spec = [
      [96 * s + 20 * s,   108 * s, 27 * s, 2.62],
      [96 * s + 26 * s,   150 * s, 31 * s, 3.05],
      [168 * s - 14 * s,   84 * s, 25 * s, 3.52],
      [w - 120 * s + 18 * s, 95 * s, 28 * s, 2.74],
      [w * 0.52 - 12 * s,  63 * s, 23 * s, 3.46],
      [w - 46 * s,         42 * s, 30 * s, 3.24]
    ];

    leaves = [];
    for (var i = 0; i < spec.length; i++) {
      leaves.push({
        x: spec[i][0],
        y: spec[i][1],
        len: spec[i][2],
        angle: spec[i][3],
        phase: rng.float(0, Math.PI * 2),
        gone: 0,
        tell: 0
      });
    }
  }

  /* The same rectangles paintProps draws its crates into. The sack is held
     separately because it does something better than knock. */
  function layoutKnocks() {
    var base = h + 6 * s;
    knocks = [
      { x: -12 * s, y: base - 132 * s, w: 132 * s, h: 134 * s },
      { x:  -8 * s, y: base - 210 * s, w:  98 * s, h:  80 * s },
      { x: 398 * s, y: base - 220 * s, w: 138 * s, h: 138 * s },
      { x: 382 * s, y: base - 104 * s, w: 154 * s, h: 108 * s }
    ];
    sack = { x: 22 * s, y: base - 74 * s, w: 102 * s, h: 78 * s };
  }

  function flyBounds() {
    // Kept clear of the question area at the top and the props at the
    // bottom, so he is always somewhere a finger can reach him.
    return { left: 24, right: w - 24, top: 54, bottom: h * 0.60 };
  }

  function retarget(f) {
    var b = flyBounds();
    f.tx = rng.float(b.left, b.right);
    f.ty = rng.float(b.top, b.bottom);
    f.hold = rng.float(1.5, 3);
  }

  function layoutFlies() {
    var b = flyBounds();
    flies = [];
    for (var i = 0; i < FLY_COUNT; i++) {
      var f = {
        x: rng.float(b.left, b.right),
        y: rng.float(b.top, b.bottom),
        tx: 0, ty: 0, hold: 0,
        dart: 0,
        bob: rng.float(0, Math.PI * 2),
        // Own speed and own glow phase, or four of them blinking and
        // drifting in lockstep read as one animation drawn four times.
        speed: FLY_SPEED * rng.float(0.78, 1.3),
        pulse: rng.float(0, Math.PI * 2),
        rate: rng.float(2.4, 3.6),
        loop: 0,
        perch: 0,
        landed: false
      };
      retarget(f);
      flies.push(f);
    }
  }

  function layoutBird() {
    bird = {
      flying: false,
      x: 0, y: 0,
      dir: 1,
      speed: 0,
      size: BIRDS[0].size * s,
      kind: rng.int(0, BIRDS.length - 1),   // which one goes first varies
      flap: 0,
      bob: 0,
      cry: 0,
      next: FIRST_BIRD
    };
  }

  /* --------------------------------------------------------------- gorilla */

  /* Where his head is, in screen pixels — the gaze and the banana both aim
     at it, and both would be subtly wrong if they used his feet. */
  function headAt(g) {
    return { x: g.x, y: g.groundY - g.height * 0.54 };
  }

  function gorillaHits(x, y) {
    if (!gorilla || screen !== 'home') return false;
    var gy = gorilla.groundY - gorilla.height * 0.52;
    var gr = gorilla.height * 0.46;
    var dx = x - gorilla.x, dy = y - gy;
    return dx * dx + dy * dy <= gr * gr;
  }

  /* What he is looking at, most interesting first. A live pointer wins over
     the birds, because a child moving a finger about is asking for his
     attention; a bird wins over a cursor that has been parked for a while,
     which is what stops him staring blankly at a stationary mouse. */
  function gazeTarget() {
    if (bananas.length) return bananas[0];
    if (coconut && coconut.state === 'loose') return coconut;

    var p = NP.input.pointer();
    if (p && pointerIdle < POINTER_INTEREST) return p;

    if (bird.flying && bird.x > -bird.size && bird.x < w + bird.size) return bird;
    return p;
  }

  /* Eased rather than snapped, because eyes that teleport read as a glitch;
     and normalised by distance so something right next to his face does not
     peg the pupils at full deflection. Shared with the sideline gorilla, who
     has a much shorter list of things worth looking at. */
  function easeGaze(g, t, dt) {
    var tx = 0, ty = 0;

    if (t) {
      var head = headAt(g);
      var dx = t.x - head.x;
      var dy = t.y - head.y;
      var d = Math.max(1, Math.hypot(dx, dy));
      var k = Math.min(1, d / (g.height * 0.85));
      tx = dx / d * k;
      ty = dy / d * k;
    }

    var ease = Math.min(1, dt * 7);
    g.gazeX += (tx - g.gazeX) * ease;
    g.gazeY += (ty - g.gazeY) * ease;
  }

  function updateGaze(g, dt) {
    easeGaze(g, gazeTarget(), dt);
  }

  function thump() {
    var g = gorilla;
    scatterPerched();
    if (g.stage === 'idle' || g.stage === 'settle') {
      g.stage = 'rear';
      g.stageT = 0;
      g.drumLeft = DRUM_BURST;
      g.nextHit = REAR_TIME + DRUM_INTERVAL * 0.5;
    } else {
      // Already going: extend rather than restart, the same way effects.shake
      // refuses to let a small shake cut off a bigger one.
      g.drumLeft = Math.min(DRUM_MAX, g.drumLeft + DRUM_BURST * 0.6);
    }
  }

  function fistHit(g) {
    var chestX = g.x + (g.beat % 2 === 0 ? -1 : 1) * g.height * 0.09;
    var chestY = g.groundY - g.height * 0.11;

    NP.audio.thump();
    // The first landing gets the vocalisation, so a burst reads as one
    // gorilla hooting and drumming rather than a stack of identical hits.
    if (g.beat === 0) NP.audio.hoot();

    NP.effects.dust(chestX, chestY, g.height * 0.2);
    NP.effects.ring(chestX, chestY, g.height * 0.13, T.furLight);
    NP.effects.shake(7, 0.17);
    g.impact = 1;                 // drives the chest squash in the pose
    g.beat++;
  }

  function updateGorilla(dt) {
    var g = gorilla;
    g.stageT += dt;

    updateGaze(g, dt);

    /* Peek-a-boo. Held on his face for long enough and he covers his eyes;
       he stays hidden as long as the finger is down, and the reveal is the
       payoff. The tap that began the hold has already fired a thump, which
       turns out to read well: he drums, then hides behind his hands. */
    var press = NP.input.press();
    var holding = !!press && !press.moved && gorillaHits(press.x, press.y);

    if (g.stage === 'peek') {
      if (!holding) {
        g.stage = 'uncover';
        g.stageT = 0;
        NP.audio.hoot();
        var hd = headAt(g);
        NP.effects.ring(hd.x, hd.y, g.height * 0.24, T.furLight);
      }
    } else if (holding && press.held >= HOLD_TIME && g.eating <= 0) {
      g.stage = 'peek';
      g.stageT = 0;
      g.drumLeft = 0;
      g.beat = 0;
    }

    // Chewing. The second munch lands halfway through, so one banana sounds
    // like two bites rather than one long noise.
    if (g.eating > 0) {
      g.eating -= dt;
      if (!g.chewed && g.eating <= EAT_TIME * 0.45) {
        g.chewed = true;
        NP.audio.munch();
      }
      if (g.eating <= 0) NP.audio.hoot();
    }

    // blink
    g.blinkIn -= dt;
    if (g.blinking > 0) {
      g.blinking -= dt;
    } else if (g.blinkIn <= 0) {
      g.blinking = BLINK_TIME;
      g.blinkIn = rng.float(3, 6);
    }

    if (g.scratch > 0) g.scratch -= dt;
    if (g.impact > 0) g.impact = Math.max(0, g.impact - dt * 7);

    if (g.stage === 'rear') {
      if (g.stageT >= REAR_TIME) { g.stage = 'drum'; g.stageT = 0; }

    } else if (g.stage === 'drum') {
      g.nextHit -= dt;
      g.drumLeft -= dt;
      if (g.nextHit <= 0) {
        fistHit(g);
        g.nextHit += DRUM_INTERVAL;
      }
      if (g.drumLeft <= 0) { g.stage = 'settle'; g.stageT = 0; }

    } else if (g.stage === 'settle') {
      if (g.stageT >= SETTLE_TIME) { g.stage = 'idle'; g.stageT = 0; }

    } else if (g.stage === 'uncover') {
      if (g.stageT >= UNCOVER_TIME) { g.stage = 'idle'; g.stageT = 0; }
    }
  }

  function gorillaPose() {
    var g = gorilla;
    var lean = 0, mouth = 0, tilt = 0;
    var armL = 0, armR = 0;
    var reach = 'chest';
    var blink = g.blinking > 0
      ? Math.sin((1 - g.blinking / BLINK_TIME) * Math.PI)
      : 0;

    /* Hiding beats the rest, and eating beats drumming — otherwise a banana
       arriving mid-thump would leave him doing both at once. */
    if (g.stage === 'peek' || g.stage === 'uncover') {
      reach = 'eyes';
      blink = 1;
      if (g.stage === 'peek') {
        armL = armR = clamp(g.stageT / COVER_TIME, 0, 1);
      } else {
        var u = clamp(g.stageT / UNCOVER_TIME, 0, 1);
        armL = armR = 1 - u;
        // Eyes spring open and the mouth with them: that is the "boo".
        blink = 1 - clamp(u * 2.2, 0, 1);
        mouth = 1 - u;
      }
      return {
        breath: Math.sin(time * 1.4),
        lean: 0,
        headTilt: Math.sin(time * 0.37) * 0.05,
        armL: armL, armR: armR,
        blink: blink,
        mouth: mouth,
        gazeX: g.gazeX, gazeY: g.gazeY,
        reach: reach
      };
    }

    if (g.eating > 0) {
      var e = 1 - g.eating / EAT_TIME;
      // Hand up fast, hold at the mouth, drop at the end.
      var lift = e < 0.18 ? e / 0.18 : (e > 0.82 ? (1 - e) / 0.18 : 1);
      return {
        breath: Math.sin(time * 1.4),
        lean: 0,
        headTilt: Math.sin(time * 0.37) * 0.05 + g.gazeX * 0.04,
        armL: 0,
        armR: clamp(lift, 0, 1),
        blink: blink,
        mouth: lift > 0.6 ? 0.5 + 0.5 * Math.sin(time * 19) : 0,
        gazeX: g.gazeX * 0.3, gazeY: 0.5,       // looking down at the banana
        reach: 'mouth'
      };
    }

    if (g.stage === 'rear') {
      var r = clamp(g.stageT / REAR_TIME, 0, 1);
      lean = r; mouth = r; tilt = -0.07 * r;
      armL = armR = 0.3 * r;

    } else if (g.stage === 'drum') {
      lean = 1; mouth = 1; tilt = -0.07;
      // The arm about to land accelerates into the chest; the other one is
      // on its way back out. That alternation is what reads as drumming.
      var t = clamp(1 - g.nextHit / DRUM_INTERVAL, 0, 1);
      var swinging = 0.3 + 0.7 * t * t;
      var recovering = 0.3 + 0.35 * (1 - t);
      if (g.beat % 2 === 0) { armL = swinging; armR = recovering; }
      else                  { armR = swinging; armL = recovering; }

    } else if (g.stage === 'settle') {
      var k = 1 - clamp(g.stageT / SETTLE_TIME, 0, 1);
      lean = k; mouth = k; tilt = -0.07 * k;
      armL = armR = 0.3 * k;
    }

    if (g.scratch > 0 && g.stage === 'idle') {
      var sc = Math.sin((1 - g.scratch / 1.2) * Math.PI);
      armL = 0.55 * sc;
      tilt = 0.09 * sc;
    }

    return {
      // Each landing punches the chest outward, then it springs back — the
      // squash is most of what sells the hit as having weight.
      breath: Math.sin(time * 1.4) + g.impact * 3.2,
      lean: lean,
      // A little of the head follows the eyes, which is most of what makes
      // the tracking read as attention rather than as googly eyes.
      headTilt: tilt + Math.sin(time * 0.37) * 0.05 + g.gazeX * 0.05,
      armL: armL,
      armR: armR,
      blink: blink,
      mouth: mouth,
      gazeX: g.gazeX,
      gazeY: g.gazeY,
      reach: reach
    };
  }

  function drawGorilla(ctx) {
    var g = gorilla;
    NP.gorillaArt.draw(ctx, g.x, g.groundY, g.scale, gorillaPose());

    // Two fronds over his feet, so he sits in the scene instead of on it.
    // Sized off the scenery scale rather than off him: these have to match
    // the fronds paintProps puts along the bottom, and would look like
    // giant leaves if they grew with him.
    var f = 64 * s;
    NP.scenery.leaf(ctx, g.x - g.height * 0.36, g.groundY - f * 0.16,
                    f, f * 0.3, -0.42, T.leaf2, T.leafVein);
    NP.scenery.leaf(ctx, g.x + g.height * 0.38, g.groundY - f * 0.1,
                    f * 0.9, f * 0.27, 0.36, T.leaf1, T.leafVein);
  }

  /* ---------------------------------------------------------------- leaves */

  function pluck(leaf) {
    if (falling.length >= MAX_FALLING) falling.shift();

    var greens = [T.leaf1, T.leaf2, T.leaf3];
    falling.push({
      homeX: leaf.x,
      x: leaf.x,
      y: leaf.y,
      vy: 8,
      len: leaf.len,
      base: leaf.angle,
      angle: leaf.angle,
      phase: rng.float(0, Math.PI * 2),
      amp: rng.float(14, 26),
      spin: rng.float(-0.7, 0.7),
      color: greens[(rng.int(0, 2)) % greens.length],
      life: 0,
      landed: 0
    });

    leaf.gone = rng.float(LEAF_REGROW[0], LEAF_REGROW[1]);
    NP.audio.rustle();
  }

  function updateLeaves(dt) {
    var i, l;

    for (i = 0; i < leaves.length; i++) {
      l = leaves[i];
      if (l.gone > 0) l.gone -= dt;
      if (l.tell > 0) l.tell -= dt;
    }

    var groundY = h - 6;
    for (i = falling.length - 1; i >= 0; i--) {
      l = falling[i];
      l.life += dt;

      if (l.landed > 0) {
        l.landed -= dt;
        if (l.landed <= 0) { falling.splice(i, 1); }
        continue;
      }

      l.vy += (LEAF_TERMINAL - l.vy) * Math.min(1, dt * 2.2);
      l.y += l.vy * dt;

      // Side-to-side swing with the leaf tipping into each swing — a leaf
      // that only translated would read as a falling coin.
      l.phase += dt * 3.2;
      l.x = l.homeX + Math.sin(l.phase) * l.amp;
      l.angle = l.base + Math.sin(l.phase) * 0.7 + l.life * l.spin;

      // The 8s cap is a safety net: a very short viewport could otherwise
      // leave a leaf falling below the ground line it never reaches.
      if (l.y >= groundY || l.life > 8) l.landed = 0.5;
    }
  }

  function drawLeaves(ctx) {
    var i, l, sway;

    for (i = 0; i < leaves.length; i++) {
      l = leaves[i];
      if (l.gone > 0) continue;
      // The idle sway is the tell that says these are touchable.
      sway = Math.sin(time * 0.8 + l.phase) * (l.tell > 0 ? 0.22 : 0.06);
      NP.scenery.leaf(ctx, l.x, l.y, l.len, l.len * 0.29, l.angle + sway,
                      T.leaf3, T.leafVein);
    }

    for (i = 0; i < falling.length; i++) {
      l = falling[i];
      ctx.save();
      if (l.landed > 0) ctx.globalAlpha = clamp(l.landed / 0.5, 0, 1);
      NP.scenery.leaf(ctx, l.x, l.y, l.len, l.len * 0.29, l.angle,
                      l.color, T.leafVein);
      ctx.restore();
    }
  }

  /* -------------------------------------------------------------- coconut */

  function layoutCoconut() {
    var base = h + 6 * s;
    var r = Math.max(9, 15 * s);
    coconut = {
      state: 'perched',
      // Sitting on the lid of the slat crate in the top-left group.
      homeX: 42 * s,
      homeY: base - 210 * s - r,
      x: 42 * s,
      y: base - 210 * s - r,
      r: r,
      vx: 0, vy: 0,
      angle: 0,
      life: 0,
      regrow: 0
    };
  }

  function knockCoconut() {
    var c = coconut;
    c.state = 'loose';
    c.life = 0;
    // Off the lid and to the right, which is where the gorilla is standing.
    c.vx = rng.float(70, 105);
    c.vy = -rng.float(20, 60);
    NP.audio.knock();
    NP.effects.dust(c.x, c.y, c.r * 1.4);
  }

  function updateCoconut(dt) {
    var c = coconut;

    if (c.state === 'perched') return;
    if (c.state === 'gone') {
      c.regrow -= dt;
      if (c.regrow <= 0) {
        c.state = 'perched';
        c.x = c.homeX; c.y = c.homeY;
        c.angle = 0;
      }
      return;
    }

    c.life += dt;
    c.vy += COCONUT_G * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // Rolling contact: the spin comes from the travel, so it never looks
    // like it is skidding.
    c.angle += (c.vx / c.r) * dt;

    var ground = h - 6 * s - c.r;
    if (c.y >= ground) {
      c.y = ground;
      if (Math.abs(c.vy) > 55) {
        c.vy = -c.vy * COCONUT_BOUNCE;
        NP.audio.knock();
        NP.effects.dust(c.x, c.y + c.r * 0.6, c.r);
      } else {
        c.vy = 0;
        c.vx *= 1 - dt * 0.6;              // rolls to a stop
      }
    }

    // Caught: he scoops it up as it reaches his feet.
    var reach = gorilla.height * 0.3;
    if (Math.abs(c.x - gorilla.x) < reach && c.y > gorilla.groundY - gorilla.height * 0.45 &&
        gorilla.eating <= 0) {
      c.state = 'gone';
      c.regrow = rng.float(COCONUT_REGROW[0], COCONUT_REGROW[1]);
      gorilla.eating = EAT_TIME;
      gorilla.eatKind = 'coconut';
      gorilla.chewed = false;
      gorilla.stage = 'idle';
      NP.audio.crack();
      NP.effects.burst(c.x, c.y, c.r * 1.2,
        [T.coconutLight, T.coconut, T.coconutDark], 10);
      return;
    }

    // Rolled off the screen, or nobody caught it in time.
    if (c.x - c.r > w || c.x + c.r < 0 || c.life > 9) {
      c.state = 'gone';
      c.regrow = rng.float(COCONUT_REGROW[0], COCONUT_REGROW[1]);
    }
  }

  function drawCoconut(ctx) {
    if (coconut.state === 'gone') return;
    NP.jungleArt.coconut(ctx, coconut.x, coconut.y, coconut.r, coconut.angle);
  }

  /* ------------------------------------------------------------------ bomb */

  /* It sits on the lid of the caution crate, which is the joke: that crate
     has been stencilled with a warning and an arrow this whole time, and now
     there is something on it worth the warning.

     It is the loudest thing on the menus and the only one that answers with
     the whole scene at once — the fireflies scatter, the bird bolts, and the
     gorilla drums back at it. That is deliberate. Everything else here gives
     a child one small answer for one small poke; this gives them a big one,
     and a fuse to wait through first so they know it is coming. */

  function layoutBomb() {
    var base = h + 6 * s;
    var lid = base - 220 * s;           // the top of the caution crate
    var r = Math.max(8, 12 * s);
    bomb = {
      state: 'idle',                    // idle | lit | gone
      // Left of the middle of the lid, so it never fights the garden plot
      // that grows at 466 on the same crate.
      x: 424 * s,
      y: lid - r,
      r: r,
      fuse: 1,                          // cord left: 1 unlit, 0 at the bang
      burn: 0,
      fizz: 0,
      spark: 0,
      regrow: 0,
      arrive: 0,
      tell: 0
    };
  }

  function fuseTip(b) {
    return NP.jungleArt.bombFuseTip(b.x, b.y, b.r, b.fuse);
  }

  function lightBomb() {
    var b = bomb;
    var tip = fuseTip(b);

    if (b.state === 'lit') {
      /* Already burning. Rather than ignore the tap — which would teach a
         child the bomb had stopped listening — every further poke takes a
         bite out of what is left, so mashing at it brings the bang forward.
         Never all the way, though: a fuse that ended under the finger would
         read as a punishment for tapping.

         Clamped with a max as well as a min, or the last stretch of cord
         would be the safest place on it: a tap arriving after the cap had
         been passed would drag the fuse back to the cap, and a child
         drumming their fingers on it could hold the bang off forever. */
      b.burn = Math.max(b.burn, Math.min(FUSE_TIME - FUSE_FLOOR, b.burn + FUSE_CUT));
      NP.audio.fizz(b.burn / FUSE_TIME);
      NP.effects.burst(tip.x, tip.y, b.r * 0.7, [T.spark, T.ember, T.emberHot], 5);
      return;
    }

    b.state = 'lit';
    b.burn = 0;
    b.fizz = FIZZ_GAP;
    b.spark = 0;
    NP.audio.fizz(0);
    NP.effects.burst(tip.x, tip.y, b.r * 0.8, [T.spark, T.ember, T.emberHot], 7);
    NP.effects.ring(tip.x, tip.y, b.r * 0.7, T.spark);
  }

  function explode() {
    var b = bomb;
    b.state = 'gone';
    b.fuse = 0;
    b.regrow = rng.float(BOMB_REGROW[0], BOMB_REGROW[1]);

    NP.audio.boom();

    /* Pushed in the order it is drawn: the light, then the shockwave, then
       what the shockwave throws. */
    NP.effects.flash(b.x, b.y, b.r * 9, 0.3);
    NP.effects.ring(b.x, b.y, b.r * 1.5, T.spark);
    NP.effects.ring(b.x, b.y, b.r * 3.1, T.ember);
    NP.effects.burst(b.x, b.y, b.r * 2.2,
      [T.spark, T.ember, T.emberHot, T.emberDeep, T.white], 26);
    NP.effects.smoke(b.x, b.y - b.r * 0.3, b.r * 2.6, 11);

    // The lid underneath takes it: splinters off the wood and a lungful of
    // chalk dust, so the blast belongs to the crate and not to thin air.
    NP.effects.burst(b.x, b.y + b.r * 0.9, b.r * 1.5,
      [T.woodLight, T.wood, T.woodDark], 8);
    NP.effects.dust(b.x, b.y + b.r, b.r * 3);

    NP.effects.shake(13, 0.34);

    // Everything alive answers it. One tap, the whole board reacts — which
    // is the payoff for having sat through the fuse.
    scatterPerched();
    if (bird.flying) startleBird();
    if (screen === 'home' && gorilla) thump();
  }

  function updateBomb(dt) {
    var b = bomb;

    if (b.arrive > 0) b.arrive -= dt;
    if (b.tell > 0) b.tell -= dt;

    if (b.state === 'gone') {
      b.regrow -= dt;
      if (b.regrow <= 0) {
        b.state = 'idle';
        b.fuse = 1;
        b.arrive = BOMB_ARRIVE;
        // Silent, like the leaves growing back: a child who is watching sees
        // it arrive, and one who is not is not told off for missing it.
        NP.effects.dust(b.x, b.y + b.r * 0.7, b.r * 1.2);
      }
      return;
    }

    if (b.state !== 'lit') return;

    b.burn += dt;
    b.fuse = Math.max(0, 1 - b.burn / FUSE_TIME);

    var tip = fuseTip(b);

    b.spark -= dt;
    if (b.spark <= 0) {
      b.spark = SPARK_GAP;
      NP.effects.burst(tip.x, tip.y, b.r * 0.5, [T.spark, T.ember, T.emberHot], 2);
    }

    // The sizzle climbs as the cord shortens, so the countdown can be heard
    // with the screen not being looked at.
    b.fizz -= dt;
    if (b.fizz <= 0) {
      b.fizz = FIZZ_GAP;
      NP.audio.fizz(1 - b.fuse);
    }

    if (b.fuse <= 0) explode();
  }

  /* Grows up off the lid rather than fading in on the spot — 0.35 to 1 with
     the speed coming off it, which is a pop without an overshoot the eye has
     to forgive. */
  function popScale(k) {
    var e = 1 - k;
    return 0.35 + 0.65 * (1 - e * e * e);
  }

  function drawBomb(ctx) {
    var b = bomb;
    if (b.state === 'gone') return;

    var lit = b.state === 'lit';
    var t = lit ? 1 - b.fuse : 0;             // 0 at the light, 1 at the bang

    /* It tells you itself. The tremble and the swell both run off how much
       cord is left, so the bang is telegraphed by the bomb and not only by
       the sound — which matters on a muted phone. */
    var jitter = b.r * 0.09 * t;
    var x = b.x + Math.sin(time * 47) * jitter;
    var y = b.y + Math.cos(time * 39) * jitter * 0.6;

    // A cold fuse gives one slow rock when the scene is asking to be poked.
    if (b.tell > 0) x += Math.sin(b.tell * 12) * b.r * 0.18 * Math.min(1, b.tell);

    var glow = lit ? 0.45 + 0.55 * t * (0.7 + 0.3 * Math.sin(time * 33)) : 0;
    var swell = lit ? t * (0.6 + 0.4 * Math.sin(time * 21)) : 0;
    var opts = { fuse: b.fuse, lit: lit, glow: glow, swell: swell };

    if (b.arrive > 0) {
      var k = popScale(1 - b.arrive / BOMB_ARRIVE);
      ctx.save();
      ctx.translate(x, y + b.r);              // anchored on the lid it stands on
      ctx.scale(k, k);
      NP.jungleArt.bomb(ctx, 0, -b.r, b.r, opts);
      ctx.restore();
      return;
    }

    NP.jungleArt.bomb(ctx, x, y, b.r, opts);
  }

  /* --------------------------------------------------------------- banana */

  /* Tapping the sack lobs a banana to the gorilla, who catches and eats it.
     Purely a bit of theatre: the run's banana count is earned by three-
     starring a level, and a home screen that handed them out would let a
     child farm the reward without doing any arithmetic. */
  function tossBanana() {
    if (bananas.length >= MAX_BANANAS) return;

    var head = headAt(gorilla);
    var x0 = sack.x + sack.w * 0.5;
    var y0 = sack.y + sack.h * 0.15;
    var x1 = head.x - gorilla.height * 0.02;
    var y1 = head.y + gorilla.height * 0.06;      // his mouth, not his brow

    // Solve the lob so it lands on his mouth exactly when it should.
    bananas.push({
      x: x0, y: y0,
      vx: (x1 - x0) / BANANA_FLY,
      vy: (y1 - y0) / BANANA_FLY - 0.5 * BANANA_G * BANANA_FLY,
      angle: rng.float(-0.4, 0.4),
      spin: rng.float(3.5, 6.5) * (rng.bool() ? 1 : -1),
      // Scaled off the gorilla, not the screen: it has to read as something
      // he could actually hold, and he is the thing it is next to.
      len: Math.max(26, gorilla.height * 0.28),
      life: 0
    });

    NP.audio.rustle();
    NP.effects.dust(x0, y0, 12);
  }

  function updateBananas(dt) {
    for (var i = bananas.length - 1; i >= 0; i--) {
      var b = bananas[i];
      b.life += dt;
      b.vy += BANANA_G * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.spin * dt;

      if (b.life >= BANANA_FLY) {
        bananas.splice(i, 1);
        gorilla.eating = EAT_TIME;
        gorilla.chewed = false;
        gorilla.stage = 'idle';
        gorilla.stageT = 0;
        NP.audio.munch();
        NP.effects.burst(b.x, b.y, b.len * 0.6,
          [T.bananaLight, T.banana, T.bananaDark], 8);
      }
    }
  }

  function drawBananas(ctx) {
    for (var i = 0; i < bananas.length; i++) {
      var b = bananas[i];
      NP.jungleArt.banana(ctx, b.x, b.y, b.len, b.angle);
    }
  }

  /* ---------------------------------------------------------------- birds */

  function birdKind() { return BIRDS[bird.kind]; }

  function launchBird() {
    var b = bird;
    // Strict alternation, advanced here rather than on landing so a bird
    // startled off the top of the screen still hands over to the other one.
    b.kind = (b.kind + 1) % BIRDS.length;
    var k = BIRDS[b.kind];

    b.flying = true;
    b.dir = rng.bool() ? 1 : -1;
    b.size = k.size * s;
    b.x = b.dir > 0 ? -b.size * 2.6 : w + b.size * 2.6;
    b.y = rng.float(72 * s, 150 * s);
    b.speed = rng.float(k.speed[0], k.speed[1]);
    b.flap = 0;
    b.bob = rng.float(0, Math.PI * 2);
    b.cry = 0;
    b.next = BIRD_PERIOD;         // the clock for the one after this
  }

  function updateBird(dt) {
    var b = bird;

    // The clock runs whether or not one is up, so the next bird is due ten
    // seconds after the last one set off rather than ten after it landed.
    b.next -= dt;

    if (!b.flying) {
      if (b.next <= 0) launchBird();
      return;
    }

    var k = birdKind();

    // Wings beat faster the harder it is working, which is the only cue
    // that says "I startled it" once it is already moving.
    b.flap += dt * (b.cry > 0 ? k.flap * 1.85 : k.flap);
    if (b.flap > 1) b.flap -= 1;

    b.bob += dt * 3.4;
    b.x += b.dir * b.speed * dt;
    b.y += Math.sin(b.bob) * 14 * dt;

    if (b.cry > 0) {
      b.cry -= dt;
      b.speed += 130 * dt;              // bolts for the treeline
      b.y -= 26 * dt;
    }

    var gone = b.dir > 0 ? b.x - b.size * 2.6 > w : b.x + b.size * 2.6 < 0;
    if (gone || b.y < -b.size * 2.6) {
      b.flying = false;
      // A slow crossing on a wide screen can outlast its own ten seconds.
      // The next one then goes as soon as the sky is clear rather than
      // sitting out a turn.
      if (b.next < 0) b.next = 0;
    }
  }

  function drawBird(ctx) {
    if (!bird.flying) return;
    NP.jungleArt[birdKind().art](ctx, bird.x, bird.y, bird.size,
                                 bird.dir, bird.flap, bird.cry > 0 ? 1 : 0);
  }

  function startleBird() {
    var b = bird;
    var k = birdKind();
    b.cry = 0.5;
    NP.audio[k.cry]();
    // A couple of feathers shaken loose, in that bird's own colours.
    var feathers = k.art === 'toucan'
      ? [T.toucanBib, T.toucanBeak, T.toucan]
      : [T.parrot, T.parrotWing, T.parrotWing2];
    NP.effects.burst(b.x, b.y, b.size * 0.5, feathers, 7);
  }

  /* --------------------------------------------------------------- firefly */

  /* A spot on the top of his head, in screen pixels. */
  function perchPoint() {
    return {
      x: gorilla.x + gorilla.height * 0.1,
      y: gorilla.groundY - gorilla.height * 0.83
    };
  }

  /* Everything that startles him startles whatever has settled on him. */
  function scatterPerched() {
    for (var i = 0; i < flies.length; i++) {
      if (flies[i].perch) {
        flies[i].perch = 0;
        flies[i].landed = false;
        dart(flies[i]);
        return;                  // one sparkle burst, not four
      }
    }
  }

  function anyPerched() {
    for (var i = 0; i < flies.length; i++) if (flies[i].perch) return true;
    return false;
  }

  /* Left alone long enough, one comes down and sits on him. It is the only
     prop that changes on its own without being asked, which is what makes
     an untouched screen still worth looking at. */
  function sendToPerch() {
    if (screen !== 'home' || !gorilla || anyPerched()) return;
    var free = [];
    for (var i = 0; i < flies.length; i++) {
      if (!flies[i].perch && flies[i].dart <= 0) free.push(flies[i]);
    }
    if (!free.length) return;
    var f = free[rng.int(0, free.length - 1)];
    f.perch = rng.float(7, 12);
    f.landed = false;
  }

  function updateFly(f, dt) {
    var b = flyBounds();

    f.bob += dt * 2.6;

    /* Perching overrides the wander entirely: it steers to his head, then
       locks to it so it does not jitter around on his fur. */
    if (f.perch > 0 && f.dart <= 0) {
      f.perch -= dt;
      var at = perchPoint();

      if (f.landed) {
        f.x = at.x;
        f.y = at.y;
        if (f.perch <= 0) { f.landed = false; retarget(f); }
        return;
      }

      var pdx = at.x - f.x, pdy = at.y - f.y;
      var pd = Math.hypot(pdx, pdy);
      if (pd < 3) {
        f.landed = true;
      } else {
        var pstep = Math.min(pd, f.speed * 1.6 * dt);
        f.x += pdx / pd * pstep;
        f.y += pdy / pd * pstep;
      }
      return;
    }

    if (f.dart > 0) {
      f.dart -= dt;
      if (f.dart <= 0) retarget(f);
    } else {
      f.hold -= dt;
      if (f.hold <= 0) retarget(f);
    }

    var speed = f.dart > 0 ? DART_SPEED : f.speed;
    var dx = f.tx - f.x;
    var dy = f.ty - f.y;
    var d = Math.hypot(dx, dy);

    if (d < 4) {
      if (f.dart <= 0) retarget(f);
    } else {
      var step = Math.min(d, speed * dt);
      f.x += dx / d * step;
      f.y += dy / d * step;
    }

    if (f.dart > 0 && rng.next() < dt * 26) {
      NP.effects.burst(f.x, f.y, 5, [T.streakGold, T.glowCore], 3);
    }

    if (f.loop > 0) f.loop -= dt;

    f.x = clamp(f.x, b.left, b.right);
    f.y = clamp(f.y, b.top, b.bottom);
  }

  function drawFly(ctx, f) {
    var bobY = f.y + Math.sin(f.bob) * 3;
    var pulse = 0.35 + 0.3 * Math.sin(time * f.rate + f.pulse);
    var glowR = 14 + (f.loop > 0 ? 5 : 0);

    var g = ctx.createRadialGradient(f.x, bobY, 0, f.x, bobY, glowR);
    g.addColorStop(0, 'rgba(255,233,138,' + (pulse + 0.35) + ')');
    g.addColorStop(0.45, 'rgba(255,233,138,' + (pulse * 0.4) + ')');
    g.addColorStop(1, 'rgba(255,233,138,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, bobY, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = T.ink;
    ctx.beginPath();
    ctx.ellipse(f.x - 1.6, bobY, 2.4, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = T.glowCore;
    ctx.beginPath();
    ctx.ellipse(f.x + 1.8, bobY, 2.8, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function dart(f) {
    var b = flyBounds();
    // Away from wherever it is now, so the child has to chase it.
    f.tx = f.x < (b.left + b.right) / 2 ? rng.float(b.right - 90, b.right)
                                        : rng.float(b.left, b.left + 90);
    f.ty = rng.float(b.top, b.bottom);
    f.dart = DART_TIME;
    NP.audio.sparkle();
    NP.effects.burst(f.x, f.y, 6, [T.streakGold, T.glowCore], 5);

    /* Neighbours close enough to have "noticed" scatter as well. Catching
       one and watching the rest of the swarm startle is a far better second
       or two than catching one on its own. */
    for (var i = 0; i < flies.length; i++) {
      var o = flies[i];
      if (o === f || o.dart > 0) continue;
      var dx = o.x - f.x, dy = o.y - f.y;
      if (dx * dx + dy * dy > SCATTER * SCATTER) continue;
      o.tx = clamp(o.x + dx * 1.9 + rng.float(-30, 30), b.left, b.right);
      o.ty = clamp(o.y + dy * 1.9 + rng.float(-30, 30), b.top, b.bottom);
      o.hold = rng.float(0.6, 1.1);
      o.dart = DART_TIME * 0.55;
    }
  }

  /* ----------------------------------------------------------------- nudge */

  /* Silent by design. A prop that chirped every seven seconds would stop
     being an invitation and start being a nag. */
  function nudge() {
    // A firefly settling on him is the best of these and costs nothing to
    // watch, so it gets first refusal whenever there is a free one.
    if (screen === 'home' && !anyPerched() && rng.next() < 0.45) {
      sendToPerch();
      return;
    }

    // The birds used to be one of the tells, brought forward when the scene
    // had gone quiet. They keep their own ten-second beat now, so pulling one
    // in early would cost the cadence more than the nudge is worth.
    var pick = rng.int(0, 3);

    // A wisp off the cold fuse and one slow rock. Silent like the rest of
    // them — the bomb has plenty to say once it is actually lit.
    if (pick === 3 && bomb.state === 'idle') {
      var tip = fuseTip(bomb);
      NP.effects.smoke(tip.x, tip.y, bomb.r * 0.55, 2);
      bomb.tell = 1.5;
      return;
    }

    if (pick === 0 && gorilla && screen === 'home' && gorilla.stage === 'idle') {
      gorilla.scratch = 1.2;
    } else if (pick === 1) {
      var live = [];
      for (var i = 0; i < leaves.length; i++) {
        if (leaves[i].gone <= 0) live.push(leaves[i]);
      }
      if (live.length) live[rng.int(0, live.length - 1)].tell = 1.6;
    } else if (flies.length) {
      var f = flies[rng.int(0, flies.length - 1)];
      f.loop = 1.2;
      retarget(f);
    }
  }

  /* ----------------------------------------------------- sideline gorilla */

  /* He watches the run from the edge of the play field. The same character
     and the same art as the one on the home screen, at about half the size
     and with none of the things a finger can do to him: during a question
     every tap belongs to the bubbles, and a prop that stole one would cost
     a life.

     He is silent for a related reason. The run already has a sound for each
     of the events he reacts to, and a hoot layered over the streak jingle is
     noise rather than a second voice — everything he has to say, he says
     with his body.

     What he says is the run, read back: he throws his fists up for a right
     answer, drums a milestone, hides behind his hands through the reveal
     after a miss, and leans in as the clock runs down. */

  var SIDE_H     = 150;         // box units at the 520px authoring width
  var SIDE_MAX_H = 0.19;        // ...but never more than this much of the screen
  var SIDE_X     = 0.70;        // across the field, out past the bubbles' middle

  var CHEER_TIME = 0.85;
  var DRUM_TIME  = 1.15;
  var MOOD_RAMP  = 0.16;        // fade into and out of a mood, seconds
  var TENSE_FROM = 0.45;        // the share of the clock left when he starts to worry
  var POINT_TIME = 0.9;
  var EAT_SIDE   = 1.4;         // matches EAT_TIME, so both gorillas chew alike

  /* How wound up he is by the run so far, as opposed to by the question in
     front of him. Tension resets every question; this does not — it is what
     makes level 11 look different from level 1. */
  var ENERGY_EASE = 0.8;        // drifts toward its target this fast, per second
  var BOB_H       = 0.055;      // bounce height, as a share of his height

  /* Idle business. The gaps are long on purpose: he is beside the question,
     not in it, and a prop that moves constantly stops being scenery. */
  var FIDGET_GAP  = [3.2, 6.5];
  var FIDGET_CALM = 0.3;        // ...and only while there is plenty of clock left

  var side = null;

  function layoutSide() {
    var height = Math.min(SIDE_H * s, h * SIDE_MAX_H);
    side = {
      x: w * SIDE_X,
      groundY: h + 4 * s,
      height: height,
      scale: height / NP.gorillaArt.height,

      mood: 'watch',
      moodT: 0,
      hold: 0,
      beat: 0,
      nextHit: 0,
      tension: 0,
      chewed: false,

      /* The run, as three dials session.js keeps pointed at the truth.
         `energy` chases `energyTarget` rather than jumping to it. */
      energy: 0,
      energyTarget: 0,
      hype: 0,
      anxious: 0,

      fidget: null,
      fidgetT: 0,
      fidgetLen: 0,
      fidgetIn: rng.float(FIDGET_GAP[0], FIDGET_GAP[1]),
      fidgetFlip: 1,

      blinkIn: rng.float(2, 5),
      blinking: 0,
      gazeX: 0,
      gazeY: 0
    };
  }

  function setMood(name, seconds) {
    side.mood = name;
    side.moodT = 0;
    side.hold = seconds;
    side.beat = 0;
    side.nextHit = MOOD_RAMP;
    // A cheer, a hide or a reveal always wins: whatever he was idly doing is
    // dropped rather than left to finish underneath the thing that matters.
    side.fidget = null;
  }

  /* ---- idle business ----
     Short bits he does with his hands while there is nothing to react to.
     Each one is a pose delta laid over the watching pose, so the clock still
     reads through whatever he happens to be doing. `len` is how long it runs;
     `hot` marks the ones only worth doing once the run has him wound up. */
  var FIDGETS = [
    { name: 'scratch',    len: 1.1 },
    { name: 'lookAround', len: 1.4 },
    { name: 'shift',      len: 1.2 },
    { name: 'stretch',    len: 1.5 },
    { name: 'earFlick',   len: 0.7 },
    { name: 'wave',       len: 1.0, hot: true }
  ];

  /* A fidget may only start when there is genuinely nothing else going on.
     He is beside the question, not in it — anything that pulls the eye off a
     live clock is worse than him standing still. */
  function canFidget(g) {
    return g.mood === 'watch' && g.tension < FIDGET_CALM && g.anxious < 0.6;
  }

  function startFidget(g) {
    var pick = null;
    // Rejection rather than a filtered copy: the list is six long and this
    // runs once every few seconds.
    for (var tries = 0; tries < 8 && !pick; tries++) {
      var f = rng.pick(FIDGETS);
      if (!f.hot || g.energy > 0.5) pick = f;
    }
    if (!pick) pick = FIDGETS[0];

    g.fidget = pick.name;
    g.fidgetT = 0;
    g.fidgetLen = pick.len;
    g.fidgetFlip = -g.fidgetFlip;      // so he does not shift his weight the same way twice
  }

  function updateSide(dt) {
    var g = side;
    g.moodT += dt;

    // Energy drifts rather than steps: a gorilla who visibly changed gear on
    // the frame a level ticked over would read as a glitch.
    g.energy += (g.energyTarget - g.energy) * Math.min(1, dt * ENERGY_EASE);

    /* He follows the finger, and nothing else. A gorilla whose eyes tracked
       the bubbles would be a cheat sheet — the right one is the only one on
       screen worth looking at. */
    easeGaze(g, NP.input.pointer(), dt);

    g.blinkIn -= dt;
    if (g.blinking > 0) {
      g.blinking -= dt;
    } else if (g.blinkIn <= 0) {
      g.blinking = BLINK_TIME;
      // Down to his last life he blinks faster, which is most of what makes
      // the same face read as worried.
      g.blinkIn = rng.float(3, 6) * (1 - g.anxious * 0.4);
    }

    if (g.fidget) {
      g.fidgetT += dt;
      if (g.fidgetT >= g.fidgetLen) g.fidget = null;
    } else if (canFidget(g)) {
      g.fidgetIn -= dt;
      if (g.fidgetIn <= 0) {
        startFidget(g);
        // The more wound up he is, the less still he can keep.
        g.fidgetIn = rng.float(FIDGET_GAP[0], FIDGET_GAP[1]) * (1 - g.energy * 0.45);
      }
    }

    if (g.mood === 'drum') {
      g.nextHit -= dt;
      if (g.nextHit <= 0) { g.beat++; g.nextHit += DRUM_INTERVAL; }
    }

    // The second munch lands halfway through, the same way the home gorilla
    // eats, so one banana sounds like two bites rather than one long noise.
    if (g.mood === 'eat' && !g.chewed && g.hold <= EAT_SIDE * 0.55) {
      g.chewed = true;
      NP.audio.munch();
    }

    if (g.hold > 0) {
      g.hold -= dt;
      if (g.hold <= 0) { g.mood = 'watch'; g.moodT = 0; }
    }
  }

  function sidePose() {
    var g = side;
    var blink = g.blinking > 0
      ? Math.sin((1 - g.blinking / BLINK_TIME) * Math.PI)
      : 0;
    var idle = Math.sin(time * 0.37) * 0.05;

    // Every mood fades in and back out, so nothing ever snaps on or off in
    // the corner of a child's eye while they are reading a question.
    var amt = Math.min(clamp(g.moodT / MOOD_RAMP, 0, 1),
                       clamp(g.hold / MOOD_RAMP, 0, 1));

    if (g.mood === 'hide') {
      return {
        breath: Math.sin(time * 1.4),
        lean: 0,
        headTilt: idle,
        armL: amt, armR: amt,
        blink: 1,
        mouth: 0.3 * amt,
        gazeX: 0, gazeY: 0,
        reach: 'eyes'
      };
    }

    if (g.mood === 'cheer') {
      return {
        breath: Math.sin(time * 1.4) + amt * 0.9,
        lean: amt * 0.3,
        headTilt: idle - amt * 0.05,
        armL: amt, armR: amt,
        // Eyes wide open on the cheer: a blink here reads as a wince.
        blink: blink * (1 - amt),
        mouth: amt,
        gazeX: g.gazeX * 0.4, gazeY: -0.45 * amt,
        reach: 'cheer'
      };
    }

    if (g.mood === 'drum') {
      // Same alternation as the home gorilla, minus the sound and the shake.
      var t = clamp(1 - g.nextHit / DRUM_INTERVAL, 0, 1);
      var swinging = (0.3 + 0.7 * t * t) * amt;
      var recovering = (0.3 + 0.35 * (1 - t)) * amt;
      return {
        breath: Math.sin(time * 1.4),
        lean: amt,
        headTilt: idle - 0.07 * amt,
        armL: g.beat % 2 === 0 ? swinging : recovering,
        armR: g.beat % 2 === 0 ? recovering : swinging,
        blink: blink,
        mouth: amt,
        gazeX: g.gazeX * 0.5, gazeY: g.gazeY * 0.5,
        reach: 'chest'
      };
    }

    if (g.mood === 'point') {
      /* A level has started. He turns and points at the board, which is the
         one moment in a run where looking away from the player is right —
         there is no question up yet to point away from. */
      return {
        breath: Math.sin(time * 1.4) + amt * 0.4,
        lean: amt * 0.12,
        sway: 0,
        headTilt: idle - amt * 0.06,
        armL: 0, armR: amt,
        blink: blink * (1 - amt),
        mouth: 0.7 * amt,
        gazeX: -0.6 * amt, gazeY: -0.3 * amt,
        reach: 'chest', reachR: 'point'
      };
    }

    if (g.mood === 'eat') {
      // The home gorilla's eating curve, hand up fast, hold at the mouth,
      // drop at the end. Kept identical so one banana looks the same
      // whichever gorilla is holding it.
      var e = 1 - clamp(g.hold / EAT_SIDE, 0, 1);
      var lift = e < 0.18 ? e / 0.18 : (e > 0.82 ? (1 - e) / 0.18 : 1);
      lift = clamp(lift, 0, 1);
      return {
        breath: Math.sin(time * 1.4),
        lean: 0,
        sway: 0,
        headTilt: idle + g.gazeX * 0.04,
        armL: lift, armR: 0,
        blink: blink,
        mouth: lift > 0.6 ? 0.5 + 0.5 * Math.sin(time * 19) : 0,
        gazeX: g.gazeX * 0.3, gazeY: 0.5,       // looking down at the banana
        reach: 'chest', reachL: 'mouth'
      };
    }

    /* Watching. Two clocks drive him here and they are deliberately
       different. Tension is the question's clock — as it runs out his
       breathing quickens, his hands come up and his mouth opens, which says
       "hurry" without taking any room away from the bubbles. Energy is the
       run's, and it never resets: it widens his rocking and quickens his
       resting breath, so an hour in he is a livelier animal than he was on
       level one. On top of both, a fidget if there is room for one. */
    var tense = g.tension;
    var en = g.energy;
    var rock = Math.sin(time * (0.5 + en * 0.35));

    var pose = {
      breath: Math.sin(time * (1.4 + en * 0.8 + tense * 2.4)) * (1 + en * 0.35),
      // A live streak keeps him leaned in and grinning rather than snapping
      // back to neutral the moment the cheer is over.
      lean: 0.12 * g.hype,
      sway: rock * (0.15 + en * 0.5),
      headTilt: idle + g.gazeX * 0.05 + tense * 0.05 * Math.sin(time * 11),
      // Low on lives his hands stay half up, whatever the clock is doing.
      armL: Math.max(tense * 0.34, 0.25 * g.anxious),
      armR: Math.max(tense * 0.26, 0.22 * g.anxious),
      blink: blink,
      mouth: Math.max(tense * 0.65, 0.45 * g.hype),
      gazeX: g.gazeX,
      gazeY: g.gazeY,
      reach: 'chest'
    };

    if (g.fidget) applyFidget(g, pose);
    return pose;
  }

  /* Idle business, laid over the watching pose in place.

     Every one rides the same bell so it fades in and back out — the same
     trick the blink uses, and the reason none of this can flicker at the
     edge of a child's vision. The bell is cut short if the clock starts to
     matter mid-fidget, so a question turning urgent takes his hands back
     rather than waiting for him to finish scratching. */
  function applyFidget(g, pose) {
    var t = clamp(g.fidgetT / g.fidgetLen, 0, 1);
    var bell = Math.sin(t * Math.PI) *
               clamp(1 - g.tension / FIDGET_CALM, 0, 1);
    if (bell <= 0) return;

    if (g.fidget === 'scratch') {
      pose.reachL = 'scratch';
      pose.armL = Math.max(pose.armL, 0.85 * bell);
      pose.headTilt += 0.10 * bell;

    } else if (g.fidget === 'lookAround') {
      // He sweeps his own head. It follows nothing on screen, so it stays
      // useless as a hint about which bubble is the right one.
      var look = Math.sin(t * Math.PI * 2) * 0.8 * bell;
      pose.gazeX = look;
      pose.headTilt += look * 0.09;

    } else if (g.fidget === 'shift') {
      pose.sway += g.fidgetFlip * bell * 0.55;

    } else if (g.fidget === 'stretch') {
      pose.reach = 'cheer';
      pose.armL = Math.max(pose.armL, 0.55 * bell);
      pose.armR = Math.max(pose.armR, 0.55 * bell);
      pose.mouth = Math.max(pose.mouth, 0.5 * bell);
      pose.blink = Math.max(pose.blink, bell);      // eyes shut mid-yawn

    } else if (g.fidget === 'earFlick') {
      pose.reachL = 'scratch';
      pose.armL = Math.max(pose.armL, 0.45 * bell);
      pose.headTilt += Math.sin(t * Math.PI * 3) * 0.05 * bell;

    } else if (g.fidget === 'wave') {
      pose.reachR = 'wave';
      pose.armR = Math.max(pose.armR, bell);
      pose.mouth = Math.max(pose.mouth, 0.6 * bell);
    }
  }

  function drawSide(ctx) {
    var g = side;

    /* The bounce that goes with the rocking, at twice its frequency so his
       weight lands at each extreme of the sway — half that and he floats.
       Done by shifting the ground point rather than inside the pose, so the
       fronds below stay where they are and he lifts off them. */
    var bob = Math.abs(Math.sin(time * (1.0 + g.energy * 0.7))) *
              g.height * BOB_H * g.energy;
    NP.gorillaArt.draw(ctx, g.x, g.groundY - bob, g.scale, sidePose());

    // Two fronds over his feet, the same trick as on the home screen: they
    // plant him in the scene instead of leaving him standing on it.
    var f = 42 * s;
    NP.scenery.leaf(ctx, g.x - g.height * 0.34, g.groundY - f * 0.16,
                    f, f * 0.3, -0.42, T.leaf2, T.leafVein);
    NP.scenery.leaf(ctx, g.x + g.height * 0.36, g.groundY - f * 0.1,
                    f * 0.9, f * 0.27, 0.36, T.leaf1, T.leafVein);
  }

  /* ------------------------------------------------------------------ API */

  function active() { return screen === 'home' || screen === 'gameover'; }

  NP.playthings = {
    /* Re-laid out with the scenery on every resize, so the props stay
       glued to the baked art they belong to. */
    build: function (width, height) {
      w = width;
      h = height;
      s = w / 520;
      layoutGorilla();
      layoutLeaves();
      layoutKnocks();
      layoutFlies();
      layoutBird();
      layoutCoconut();
      layoutBomb();
      layoutSide();
      falling.length = 0;
      bananas.length = 0;
    },

    /* The one authority for what is live. The big gorilla is home-only: the
       game-over screen already has the SVG one in its mascot row, and two
       gorillas on one screen reads as a bug. The small one on the sideline
       is the mirror of that rule — he exists only during a run. */
    setScreen: function (name) {
      if (name === screen) return;
      screen = name;
      if (!active()) NP.playthings.reset();
      idleTime = 0;
    },

    reset: function () {
      falling.length = 0;
      bananas.length = 0;
      for (var i = 0; i < leaves.length; i++) { leaves[i].gone = 0; leaves[i].tell = 0; }
      if (gorilla) {
        gorilla.stage = 'idle';
        gorilla.stageT = 0;
        gorilla.drumLeft = 0;
        gorilla.scratch = 0;
        gorilla.eating = 0;
        gorilla.gazeX = gorilla.gazeY = 0;
        gorilla.eatKind = 'banana';
      }
      for (var j = 0; j < flies.length; j++) {
        flies[j].dart = 0;
        flies[j].loop = 0;
        flies[j].perch = 0;
        flies[j].landed = false;
      }
      if (coconut) {
        coconut.state = 'perched';
        coconut.x = coconut.homeX;
        coconut.y = coconut.homeY;
        coconut.angle = 0;
      }
      if (bomb) {
        // Put back unlit rather than left mid-fuse: leaving a run would
        // otherwise arm it, and coming back would bang at nothing.
        bomb.state = 'idle';
        bomb.fuse = 1;
        bomb.burn = 0;
        bomb.arrive = 0;
        bomb.tell = 0;
      }
      if (bird) { bird.flying = false; bird.next = FIRST_BIRD; }
      if (side) {
        side.mood = 'watch';
        side.moodT = 0;
        side.hold = 0;
        side.tension = 0;
        side.gazeX = side.gazeY = 0;
        // The run's dials go with the run. Left standing, a fresh game would
        // open with the last one's energy still wound up.
        side.energy = side.energyTarget = 0;
        side.hype = side.anxious = 0;
        side.fidget = null;
        side.fidgetT = 0;
        side.fidgetIn = rng.float(FIDGET_GAP[0], FIDGET_GAP[1]);
        side.chewed = false;
      }
    },

    update: function (dt) {
      /* A run has exactly one prop, and he is it. Everything else on this
         list belongs to the menus and would be drawing over a live question. */
      if (screen === 'game') {
        if (side) { time += dt; updateSide(dt); }
        return;
      }

      if (!active() || !gorilla) return;
      time += dt;

      var pt = NP.input.pointer();
      if (pt && (pt.x !== lastPointerX || pt.y !== lastPointerY)) {
        pointerIdle = 0;
        lastPointerX = pt.x;
        lastPointerY = pt.y;
      } else {
        pointerIdle += dt;
      }

      if (screen === 'home') {
        updateGorilla(dt);
        updateBananas(dt);
        updateCoconut(dt);
      }
      updateLeaves(dt);
      updateBomb(dt);
      updateBird(dt);
      for (var i = 0; i < flies.length; i++) updateFly(flies[i], dt);

      idleTime += dt;
      if (idleTime >= NUDGE_AFTER) { nudge(); idleTime = 0; }
    },

    draw: function (ctx) {
      if (screen === 'game') {
        if (side) drawSide(ctx);
        return;
      }

      if (!active() || !gorilla) return;
      drawLeaves(ctx);
      drawBomb(ctx);             // on a crate at the back, so he stands in front
      if (screen === 'home') {
        drawCoconut(ctx);        // behind him: it rolls in from the crates
        drawGorilla(ctx);
        drawBananas(ctx);        // in front of him, so a catch reads clearly
      }
      drawBird(ctx);
      for (var i = 0; i < flies.length; i++) drawFly(ctx, flies[i]);
    },

    /* Returns true if something answered, so the caller knows the tap is
       spent. Ordered smallest and most mobile first; the crates are last
       because they are the biggest targets and would otherwise swallow
       taps aimed at whatever is standing in front of them. */
    tap: function (x, y) {
      if (!active() || !gorilla) return false;
      var i, dx, dy, hit;

      // fireflies — nearest wins, so a tap between two catches the one the
      // finger was actually closest to
      var caught = null, bestD = 20 * 20;
      for (i = 0; i < flies.length; i++) {
        dx = x - flies[i].x; dy = y - flies[i].y;
        var fd = dx * dx + dy * dy;
        if (fd <= bestD) { bestD = fd; caught = flies[i]; }
      }
      if (caught) { dart(caught); idleTime = 0; return true; }

      // bird — before the leaves, because it flies through them and a moving
      // target the child has a second to hit must win the overlap
      if (bird.flying) {
        dx = x - bird.x; dy = y - bird.y;
        var br = bird.size * birdKind().hit;
        if (dx * dx + dy * dy <= br * br) { startleBird(); idleTime = 0; return true; }
      }

      // leaves
      for (i = 0; i < leaves.length; i++) {
        var l = leaves[i];
        if (l.gone > 0) continue;
        hit = Math.max(16, l.len * 0.55);
        // Measured from the middle of the leaf rather than its stem, or the
        // fat end of it would not be touchable.
        var cx = l.x + Math.sin(l.angle) * l.len * 0.5;
        var cy = l.y - Math.cos(l.angle) * l.len * 0.5;
        dx = x - cx; dy = y - cy;
        if (dx * dx + dy * dy <= hit * hit) { pluck(l); idleTime = 0; return true; }
      }

      // coconut, while it is still sitting on the crate
      if (screen === 'home' && coconut.state === 'perched') {
        dx = x - coconut.x; dy = y - coconut.y;
        var cr = coconut.r * 2.2;               // generous: it is a small target
        if (dx * dx + dy * dy <= cr * cr) { knockCoconut(); idleTime = 0; return true; }
      }

      /* The bomb. Ahead of the garden because there is a plot growing on the
         same crate lid, and a fern is not worth losing a bang to. The hit
         circle is lifted towards the fuse: a child aiming at a bomb aims at
         the spark, not at the middle of the ball. */
      if (bomb.state !== 'gone') {
        var bombR = bomb.r * 2.6;
        dx = x - bomb.x; dy = y - (bomb.y - bomb.r * 0.55);
        if (dx * dx + dy * dy <= bombR * bombR) { lightBomb(); idleTime = 0; return true; }
      }

      // gorilla
      if (gorillaHits(x, y)) { thump(); idleTime = 0; return true; }

      /* The jungle the player has grown. It sits between him and the props
         because that is the order it is drawn in: he stands in front of his
         plants, and the plants stand in front of the sack and the crates. */
      if (NP.garden.tap(x, y)) { idleTime = 0; return true; }

      // the sack: a banana on the home screen, where there is a gorilla to
      // throw it to; just a sack to thump anywhere else
      if (x >= sack.x && x <= sack.x + sack.w &&
          y >= sack.y && y <= sack.y + sack.h) {
        idleTime = 0;
        if (screen === 'home') { tossBanana(); return true; }
        NP.audio.knock();
        NP.effects.dust(x, y, 16);
        return true;
      }

      // crates
      for (i = 0; i < knocks.length; i++) {
        var k = knocks[i];
        if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) {
          NP.audio.knock();
          NP.effects.dust(x, y, 16);
          NP.effects.shake(2.5, 0.1);
          idleTime = 0;
          return true;
        }
      }

      return false;
    },

    /* ---- what the sideline gorilla is told about the run ----
       Called from session.js. Each one is a no-op off the play field, so the
       state machine never has to ask which screen is up. */

    /* A right answer. `big` is a streak milestone, which gets the drums. */
    cheer: function (big) {
      if (!side || screen !== 'game') return;
      side.tension = 0;
      setMood(big ? 'drum' : 'cheer', big ? DRUM_TIME : CHEER_TIME);
    },

    /* A miss. He hides for as long as the reveal is up, because the reveal
       is the part the child is supposed to be reading — him bouncing back
       cheerfully over the top of it would pull the eye straight off it. */
    hide: function (seconds) {
      if (!side || screen !== 'game') return;
      side.tension = 0;
      setMood('hide', Math.max(0.5, seconds || 1));
    },

    /* The question's clock, 1 at the start and 0 when it is up. */
    watchTimer: function (remaining) {
      if (!side || screen !== 'game') return;
      var t = (TENSE_FROM - remaining) / TENSE_FROM;
      side.tension = clamp(t, 0, 1);
    },

    /* A fresh question: back to neutral, whatever he was doing. */
    watch: function () {
      if (!side || screen !== 'game') return;
      side.tension = 0;
      if (side.mood !== 'watch') { side.mood = 'watch'; side.moodT = 0; side.hold = 0; }
    },

    /* The run so far, as three dials, each already normalised to 0..1 by the
       caller the way `watchTimer` is. Pushed every frame rather than on each
       event: the level, the streak and the lives change in five different
       places between them, and a value read fresh every frame cannot go
       stale the way five separate notifications can. */
    runMood: function (progress, streak, trouble) {
      if (!side || screen !== 'game') return;
      side.energyTarget = clamp(0.15 + progress * 0.6 + streak * 0.25, 0, 1);
      side.hype = clamp(streak, 0, 1);
      side.anxious = clamp(trouble, 0, 1);
    },

    /* A level has begun. He points at the board, which fills the intro beat
       that he otherwise spends standing still. */
    announce: function () {
      if (!side || screen !== 'game') return;
      side.tension = 0;
      setMood('point', POINT_TIME);
    },

    /* A banana earned. He eats it. */
    eat: function () {
      if (!side || screen !== 'game') return;
      side.tension = 0;
      side.chewed = false;
      setMood('eat', EAT_SIDE);
    }
  };
})(window.NP = window.NP || {});
