/* Run progress, drawn as scenery rather than as a readout.

   Two things a child can see without reading anything:
     - a vine climbing the left edge of the board, one leaf per level
       cleared. Its leaf is bright for three stars, plain for two, dark for
       one, so the shape of the run is visible at a glance.
     - a hand of bananas on the right-hand crates with the tally beside it,
       one for every perfect level.

   They sit at opposite corners on purpose: the vine grows out of the left
   crates, and a banana count stacked into the same corner was reading as
   part of the same plant.

   Both are painted behind the bubbles and at reduced opacity: this is the
   background telling a story, not a HUD element competing for attention. */
(function (NP) {
  'use strict';

  var T = NP.theme;

  var LEVELS_TO_FILL = 12;      // how many rungs it takes to reach the top
  var VINE_ALPHA = 0.85;
  var SWAY = 18;                // px the stem wanders either side, at s = 1

  /* The hand ships at about 50px over the crate lid, where its own dark
     outline is within a few points of the wood behind it. Bigger, with a
     glow and a plate under the tally, is what makes it read at all. */
  var EDGE = 8;                 // px of board kept clear to the right of it
  var BANANA_SCALE = 1.35;
  var BUMP_TIME = 420;          // ms the pile swells for when one lands

  /* Set when a banana finishes its flight, so the pile visibly takes
     delivery. A timestamp rather than a ticking timer: this module has no
     update() and does not want one for a single flourish. */
  var bumpAt = -1e9;

  function bumpScale() {
    var t = (Date.now() - bumpAt) / BUMP_TIME;
    if (t < 0 || t > 1) return 1;
    return 1 + Math.sin(t * Math.PI) * 0.35;
  }

  /* The props are authored against a 520px-wide board and positioned from
     the canvas height, so the vine has to be placed the same way or it
     detaches from the crate it is supposed to be growing out of. */
  function anchor(rect) {
    var w = rect.right + 8;
    var h = rect.bottom + 8;
    var s = w / 520;
    return {
      s: s,
      w: w,
      base: h + 6 * s,
      x: 40 * s,
      y: h + 6 * s - 198 * s      // just inside the top of the slat crate
    };
  }

  /* Where the stem is at `t` (0 at the root, 1 at full height). */
  function stemAt(a, topY, t) {
    var y = a.y - (a.y - topY) * t;
    var x = a.x + Math.sin(t * 3.3) * SWAY * a.s;
    return { x: x, y: y };
  }

  function drawVine(ctx, rect, run) {
    var cleared = run.cleared || 0;
    if (cleared <= 0) return;

    var a = anchor(rect);
    var topY = rect.top + 12;
    if (a.y - topY < 40) return;                 // no room worth drawing in

    var grown = Math.min(cleared, LEVELS_TO_FILL) / LEVELS_TO_FILL;

    ctx.save();
    ctx.globalAlpha = VINE_ALPHA;

    /* Stem, sampled rather than one long curve so the taper is even and the
       leaf nodes sit exactly on the line. */
    var STEPS = 48;
    var last = stemAt(a, topY, 0);
    for (var i = 1; i <= STEPS; i++) {
      var t = (i / STEPS) * grown;
      var p = stemAt(a, topY, t);
      ctx.strokeStyle = T.vine;
      ctx.lineWidth = (8 - 3.6 * (i / STEPS)) * a.s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }

    /* One leaf per cleared level, alternating sides. */
    var shown = Math.min(cleared, LEVELS_TO_FILL);
    for (var n = 0; n < shown; n++) {
      var lt = ((n + 1) / LEVELS_TO_FILL);
      var node = stemAt(a, topY, lt);
      var side = n % 2 ? 1 : -1;
      var stars = run.stars && run.stars[n] != null ? run.stars[n] : 3;

      var fill = stars >= 3 ? T.leaf3 : (stars === 2 ? T.leaf1 : T.leafDark);
      var len = (stars >= 3 ? 54 : 44) * a.s;

      /* leaf() grows upward from its anchor, so the angle is measured from
         straight up: past a right angle it points down and outward, which
         is how a real leaf hangs off a climbing stem. */
      NP.scenery.leaf(ctx, node.x, node.y, len, len * 0.40,
                      side * (1.95 + (n % 3) * 0.13), fill, T.leafVein);
    }

    var tip = stemAt(a, topY, grown);

    if (cleared < LEVELS_TO_FILL) {
      /* A bud at the growing tip — the thing that will become the next
         leaf, so the vine reads as unfinished rather than as stopped. */
      ctx.fillStyle = T.leaf2;
      ctx.beginPath();
      ctx.ellipse(tip.x, tip.y - 3 * a.s, 4 * a.s, 6.5 * a.s, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      /* Full height. The vine cannot grow any further, so it flowers —
         otherwise the reward simply stops arriving at level twelve and a
         long run has nothing left to show for itself. */
      flower(ctx, tip.x, tip.y - 6 * a.s, 11 * a.s);
    }

    ctx.restore();
  }

  /* The bloom that crowns a full vine. Five petals and a gold centre. */
  function flower(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);

    for (var i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      ctx.fillStyle = i % 2 ? T.flowerDark : T.flower;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.62, r * 0.40, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = T.streakGold;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.33, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* One banana, drawn from a pivot at its stalk end rather than its centre,
     so a hand of them can fan from a shared point the way a real bunch
     does. Fat and outlined: these are only ~50px long over a busy sack, and
     a thin crescent just reads as a scratch. */
  function banana(ctx, px, py, len, angle) {
    var bow = len * 0.46;         // how far the outer edge arcs up
    var thick = len * 0.36;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -bow, len, 0);
    ctx.quadraticCurveTo(len * 0.5, -bow + thick, 0, 0);
    ctx.closePath();

    ctx.fillStyle = T.banana;
    ctx.fill();
    ctx.strokeStyle = T.bananaTip;
    ctx.lineWidth = Math.max(1.2, len * 0.055);
    ctx.lineJoin = 'round';
    ctx.stroke();

    // A single highlight along the belly, following the same curve.
    ctx.beginPath();
    ctx.moveTo(len * 0.22, -len * 0.11);
    ctx.quadraticCurveTo(len * 0.5, -bow * 0.80, len * 0.78, -len * 0.11);
    ctx.strokeStyle = T.bananaLight;
    ctx.lineWidth = Math.max(1.4, len * 0.10);
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  /* Where the pile sits: the lid of the front crate in the right-hand group,
     at the same height the sack used to hold it on the left. The left corner
     is where the vine roots and where the sack and the slat crate already
     stack up, so the hand spent a run half behind the scenery it was drawn
     over. The right lid is the emptiest flat surface on the board.

     Exposed through the API so an effect can aim a banana at it without
     duplicating the placement maths and drifting. */
  function pilePoint(a) {
    return { x: 386 * a.s, y: a.base - 112 * a.s };
  }

  function drawBananas(ctx, rect, run) {
    var count = run.bananas || 0;
    if (count <= 0) return;

    var a = anchor(rect);

    /* Two scales, not one. The fan swells when a banana lands; the tally is
       laid out at the resting size and stays put, because a number that
       slides sideways every time one arrives is harder to read than one that
       simply sits there — and in this corner it would slide off the board. */
    var mul = BANANA_SCALE * bumpScale();
    var len = 54 * a.s * mul;
    var rest = 54 * a.s * BANANA_SCALE;
    var fs = Math.round(21 * a.s * BANANA_SCALE);
    var label = 'x' + count;

    ctx.save();

    /* Measured before anything is placed: the tally hangs off the right of
       the hand, so it is the width of the number — one digit or two — that
       decides whether the group still fits in the corner. */
    ctx.font = '700 ' + fs + 'px ' + T.font;
    var tw = ctx.measureText(label).width;
    var span = Math.max(rest, rest * 0.92 + fs * 0.34 + tw);

    var p = pilePoint(a);
    var x = Math.min(p.x, a.w - EDGE * a.s - span);
    var y = p.y;

    /* A warm glow under the hand. Gold fill on mid-brown wood, outlined in a
       brown a few points off the wood itself, goes muddy exactly where the
       pile is placed — the glow is what separates it from the crate. */
    var gx = x + len * 0.5;
    var gy = y - len * 0.2;
    var glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, len * 1.5);
    glow.addColorStop(0, 'rgba(255,228,135,0.34)');
    glow.addColorStop(0.5, 'rgba(242,197,61,0.13)');
    glow.addColorStop(1, 'rgba(242,197,61,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(gx - len * 1.5, gy - len * 1.5, len * 3, len * 3);

    /* Always the same three-banana hand, with the tally beside it. A pile
       that grew with the count turned into a spiral of crescents by level
       nine and collided with the scenery; a fixed icon plus a number reads
       instantly and never outgrows its corner. */
    var FAN = [0.30, 0.04, -0.22];
    for (var i = 0; i < FAN.length; i++) {
      banana(ctx, x, y, len - i * 2 * a.s * mul, FAN[i]);
    }

    // The stalk they all hang from.
    ctx.strokeStyle = T.bananaTip;
    ctx.lineWidth = 5 * a.s * mul;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + 2 * a.s);
    ctx.lineTo(x - 5 * a.s, y - 13 * a.s * mul);
    ctx.stroke();

    /* The count, from the very first banana rather than the second. A lone
       bunch with no number beside it reads as scenery, which is precisely how
       the reward went unnoticed — the number is what makes it a score. */
    var tx = x + rest * 0.92;
    var ty = y - 12 * a.s * BANANA_SCALE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // A dark plate behind it, for the same reason the glow is there.
    ctx.fillStyle = 'rgba(8,18,12,0.72)';
    NP.scenery.roundRect(ctx, tx - fs * 0.34, ty - fs * 0.72,
                         tw + fs * 0.68, fs * 1.44, fs * 0.72);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(label, tx + 1.5, ty + 2);
    ctx.fillStyle = T.bananaLight;
    ctx.fillText(label, tx, ty);

    ctx.restore();
  }

  NP.progressArt = {
    /* `run` is { cleared, stars: [perLevel], bananas }. Called from
       render.frame between the board and the bubbles. */
    draw: function (ctx, rect, run) {
      if (!run) return;
      drawVine(ctx, rect, run);
      drawBananas(ctx, rect, run);
    },

    /* Where a banana in flight should be aimed, in play-rect coordinates. */
    target: function (rect) {
      var a = anchor(rect);
      var p = pilePoint(a);
      return { x: p.x + 18 * a.s, y: p.y - 12 * a.s };
    },

    /* Called when one lands, so the pile takes visible delivery. */
    pop: function () { bumpAt = Date.now(); },

    /* The banana shape itself, so effects.js can fly one without owning a
       second copy of the drawing. */
    banana: banana
  };
})(window.NP = window.NP || {});
