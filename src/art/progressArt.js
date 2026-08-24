/* Run progress, drawn as scenery rather than as a readout.

   Two things a child can see without reading anything:
     - a vine climbing the left edge of the board, one leaf per level
       cleared. Its leaf is bright for three stars, plain for two, dark for
       one, so the shape of the run is visible at a glance.
     - bananas piling onto the sack, one for every perfect level.

   Both are painted behind the bubbles and at reduced opacity: this is the
   background telling a story, not a HUD element competing for attention. */
(function (NP) {
  'use strict';

  var T = NP.theme;

  var LEVELS_TO_FILL = 12;      // how many rungs it takes to reach the top
  var VINE_ALPHA = 0.85;
  var SWAY = 18;                // px the stem wanders either side, at s = 1
  var MAX_BANANAS = 5;          // beyond this, a count is clearer than a pile

  /* The props are authored against a 520px-wide board and positioned from
     the canvas height, so the vine has to be placed the same way or it
     detaches from the crate it is supposed to be growing out of. */
  function anchor(rect) {
    var w = rect.right + 8;
    var h = rect.bottom + 8;
    var s = w / 520;
    return {
      s: s,
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

  function drawBananas(ctx, rect, run) {
    var count = run.bananas || 0;
    if (count <= 0) return;

    var a = anchor(rect);
    var len = 54 * a.s;
    var x = 60 * a.s;
    var y = a.base - 108 * a.s;                  // on the sack's shoulder,
    //                                              clear of the fronds below

    ctx.save();

    /* Always the same three-banana hand, with the tally beside it. A pile
       that grew with the count turned into a spiral of crescents by level
       nine and collided with the scenery; a fixed icon plus a number reads
       instantly and never outgrows its corner. */
    var FAN = [0.30, 0.04, -0.22];
    for (var i = 0; i < FAN.length; i++) {
      banana(ctx, x, y, len - i * 2 * a.s, FAN[i]);
    }

    // The stalk they all hang from.
    ctx.strokeStyle = T.bananaTip;
    ctx.lineWidth = 5 * a.s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + 2 * a.s);
    ctx.lineTo(x - 5 * a.s, y - 13 * a.s);
    ctx.stroke();

    if (count > 1) {
      var tx = x + len * 0.92;
      var ty = y - 12 * a.s;
      ctx.font = '700 ' + Math.round(21 * a.s) + 'px ' + T.font;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText('x' + count, tx + 1.5, ty + 2);
      ctx.fillStyle = T.bananaLight;
      ctx.fillText('x' + count, tx, ty);
    }

    ctx.restore();
  }

  NP.progressArt = {
    /* `run` is { cleared, stars: [perLevel], bananas }. Called from
       render.frame between the board and the bubbles. */
    draw: function (ctx, rect, run) {
      if (!run) return;
      drawVine(ctx, rect, run);
      drawBananas(ctx, rect, run);
    }
  };
})(window.NP = window.NP || {});
