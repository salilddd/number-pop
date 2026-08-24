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

  /* ---- bananas ---- */
  var BANANA_FLY    = 0.95;     // seconds from the sack to his mouth
  var BANANA_G      = 900;
  var EAT_TIME      = 1.4;
  var MAX_BANANAS   = 4;

  /* ---- birds ----
     Two species that strictly alternate, so a child who has just watched the
     parrot go past gets something new next time rather than a coin flip that
     might hand them the same bird four times running. The gap averages 15s. */
  var BIRD_GAP = [11, 19];

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

  var gorilla = null;
  var leaves = [];
  var falling = [];
  var flies = [];
  var knocks = [];
  var sack = null;
  var bananas = [];
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
        loop: 0
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
      next: rng.float(4, 9)        // the first one comes sooner than the rest
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

  /* Eyes follow the pointer. Eased rather than snapped, because eyes that
     teleport read as a glitch; and normalised by distance so a pointer right
     next to his face does not peg the pupils at full deflection. */
  function updateGaze(g, dt) {
    var p = NP.input.pointer();
    var tx = 0, ty = 0;

    if (p) {
      var head = headAt(g);
      var dx = p.x - head.x;
      var dy = p.y - head.y;
      var d = Math.max(1, Math.hypot(dx, dy));
      var k = Math.min(1, d / (g.height * 0.85));
      tx = dx / d * k;
      ty = dy / d * k;
    }

    var ease = Math.min(1, dt * 7);
    g.gazeX += (tx - g.gazeX) * ease;
    g.gazeY += (ty - g.gazeY) * ease;
  }

  function thump() {
    var g = gorilla;
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

    /* Hiding beats everything else, and eating beats drumming — otherwise a
       banana arriving mid-thump would leave him doing both at once. */
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
  }

  function updateBird(dt) {
    var b = bird;

    if (!b.flying) {
      b.next -= dt;
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
      b.next = rng.float(BIRD_GAP[0], BIRD_GAP[1]);
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

  function updateFly(f, dt) {
    var b = flyBounds();

    f.bob += dt * 2.6;

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
    var pick = rng.int(0, 3);

    // Bringing the next bird forward is the strongest tell of the four:
    // something new crosses the screen rather than something already there
    // twitching.
    if (pick === 3) {
      if (!bird.flying) bird.next = Math.min(bird.next, 1.2);
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
      falling.length = 0;
      bananas.length = 0;
    },

    /* The one authority for what is live. The gorilla is home-only: the
       game-over screen already has the SVG one in its mascot row, and two
       gorillas on one screen reads as a bug. */
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
      }
      for (var j = 0; j < flies.length; j++) { flies[j].dart = 0; flies[j].loop = 0; }
      if (bird) { bird.flying = false; bird.next = rng.float(4, 9); }
    },

    update: function (dt) {
      if (!active() || !gorilla) return;
      time += dt;

      if (screen === 'home') {
        updateGorilla(dt);
        updateBananas(dt);
      }
      updateLeaves(dt);
      updateBird(dt);
      for (var i = 0; i < flies.length; i++) updateFly(flies[i], dt);

      idleTime += dt;
      if (idleTime >= NUDGE_AFTER) { nudge(); idleTime = 0; }
    },

    draw: function (ctx) {
      if (!active() || !gorilla) return;
      drawLeaves(ctx);
      if (screen === 'home') {
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

      // gorilla
      if (gorillaHits(x, y)) { thump(); idleTime = 0; return true; }

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
    }
  };
})(window.NP = window.NP || {});
