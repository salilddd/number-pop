/* The plants a banana buys.

   Four kinds, each drawn from its own base point on the ground, `size` tall
   before sway. Like the rest of src/art/ these are pure draw functions with
   no state: garden.js owns where each one is, how grown it is and how the
   breeze is moving it.

   Every plant takes the same arguments:
     body   0..1, the plant growing in from nothing
     bloom  0..1, the flowers arriving on a plant that is already there
     sway   radians, applied about the base point
     rnd    a fixed array of 0..1 numbers for this plot. Fixed rather than a
            live PRNG because a plant redrawn every frame from fresh random
            numbers boils instead of standing still.

   Nothing here changes its part count between the two stages. A frond or a
   toadstool that appeared the instant a plant flowered would pop, and the
   flowering pass is supposed to be the quiet reward — it adds colour to
   something the child already recognises, it does not rebuild it. */
(function (NP) {
  'use strict';

  var T = NP.theme;

  /* The garden's own palette, not the scenery's. See `grown1..3` in theme.js
     for why: an earned plant drawn in the board's own greens is
     indistinguishable from the greenery the board came with. */
  var GREENS = [T.grown1, T.grown2, T.grown3];
  var VEIN = T.grownVein;

  /* Overshoot slightly and settle: a plant that grows in linearly reads as a
     sprite fading up rather than as something sprouting. */
  function ease(t) {
    if (t >= 1) return 1;
    if (t <= 0) return 0;
    return 1 + 1.7 * Math.pow(t - 1, 3) + Math.pow(t - 1, 2);
  }

  function blossom(ctx, x, y, r, alt) {
    ctx.fillStyle = alt ? T.flowerDark : T.flower;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.streakGold;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }

  NP.gardenArt = {
    /* A low fan of fronds. The workhorse of the jungle floor. */
    fern: function (ctx, x, y, size, body, bloom, sway, rnd) {
      var g = ease(body);
      if (g <= 0.01) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway);

      for (var i = 0; i < 5; i++) {
        var t = i / 4;
        /* The outer fronds lag the inner ones, so the plant unfurls from the
           middle instead of inflating. */
        var lag = (g - 0.3 * Math.abs(t - 0.5) * 2) / 0.7;
        if (lag <= 0.02) continue;
        if (lag > 1) lag = 1;

        var len = size * (0.66 + rnd[i] * 0.42) * lag;
        var angle = (t - 0.5) * 1.75 + (rnd[i + 3] - 0.5) * 0.2;
        NP.scenery.leaf(ctx, (rnd[i + 5] - 0.5) * size * 0.24, 0,
                        len, len * 0.28, angle, GREENS[i % 3], VEIN);
      }

      if (bloom > 0.01) {
        var b = ease(bloom);
        for (var f = 0; f < 3; f++) {
          blossom(ctx, (f - 1) * size * 0.30, -size * (0.24 + rnd[f] * 0.16),
                  size * 0.09 * b, f % 2 === 1);
        }
      }

      ctx.restore();
    },

    /* A rounded shrub. Flowering turns it into the loud one in the border. */
    bush: function (ctx, x, y, size, body, bloom, sway, rnd) {
      var g = ease(body);
      if (g <= 0.01) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway);
      ctx.scale(g, g);

      // Three overlapping mounds of leaf, the back pair darker.
      var mounds = [
        [-size * 0.30, -size * 0.34, size * 0.40, T.grown2],
        [ size * 0.28, -size * 0.30, size * 0.38, T.grown2],
        [ 0,           -size * 0.50, size * 0.46, T.grown1]
      ];
      for (var m = 0; m < 3; m++) {
        ctx.fillStyle = mounds[m][3];
        ctx.beginPath();
        ctx.ellipse(mounds[m][0], mounds[m][1], mounds[m][2], mounds[m][2] * 0.86,
                    (rnd[m] - 0.5) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // A few leaves breaking the outline, so it is a plant and not a blob.
      for (var i = 0; i < 5; i++) {
        var a = -1.5 + (i / 4) * 3 + (rnd[i + 2] - 0.5) * 0.3;
        var len = size * (0.40 + rnd[i + 4] * 0.24);
        NP.scenery.leaf(ctx, Math.sin(a) * size * 0.24, -size * 0.34,
                        len, len * 0.30, a, T.grown3, VEIN);
      }

      if (bloom > 0.01) {
        var b = ease(bloom);
        for (var f = 0; f < 5; f++) {
          var fa = (f / 5) * Math.PI * 2 + rnd[f];
          blossom(ctx, Math.cos(fa) * size * 0.42,
                  -size * 0.42 + Math.sin(fa) * size * 0.26,
                  size * 0.10 * b, f % 2 === 0);
        }
      }

      ctx.restore();
    },

    /* A clump of toadstools for the shady corners. Flowering makes the caps
       luminous, which is the one place this jungle gets to be magic. */
    shrooms: function (ctx, x, y, size, body, bloom, sway, rnd) {
      var g = ease(body);
      if (g <= 0.01) return;

      var b = ease(bloom);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway * 0.4);          // stouter than a frond, so it sways less
      ctx.scale(g, g);

      for (var i = 0; i < 3; i++) {
        var cx = (i - 1) * size * 0.72 + (rnd[i] - 0.5) * size * 0.2;
        var hh = size * (0.62 + rnd[i + 2] * 0.5);
        var cw = size * (0.40 + rnd[i + 4] * 0.16);

        // stalk
        ctx.fillStyle = T.muzzle;
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.24, 0);
        ctx.quadraticCurveTo(cx - cw * 0.18, -hh * 0.6, cx - cw * 0.2, -hh);
        ctx.lineTo(cx + cw * 0.2, -hh);
        ctx.quadraticCurveTo(cx + cw * 0.18, -hh * 0.6, cx + cw * 0.24, 0);
        ctx.closePath();
        ctx.fill();

        if (b > 0.01) {
          // A soft ring of light under the cap, laid down before the cap.
          var glow = ctx.createRadialGradient(cx, -hh, 0, cx, -hh, cw * 2.2);
          glow.addColorStop(0, 'rgba(255,233,138,' + (0.42 * b) + ')');
          glow.addColorStop(1, 'rgba(255,233,138,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(cx, -hh, cw * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // cap: a dome with its underside showing along the rim
        ctx.fillStyle = T.flower;
        ctx.beginPath();
        ctx.ellipse(cx, -hh, cw, cw * 0.78, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = T.flowerDark;
        ctx.beginPath();
        ctx.ellipse(cx, -hh, cw, cw * 0.22, 0, 0, Math.PI);
        ctx.fill();

        // spots
        ctx.fillStyle = b > 0.5 ? T.glowCore : T.toucanBib;
        for (var d = 0; d < 3; d++) {
          ctx.beginPath();
          ctx.arc(cx + (rnd[i + d] - 0.5) * cw * 1.2,
                  -hh - cw * (0.16 + rnd[i + d + 1] * 0.36),
                  cw * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    },

    /* A young tree — the tallest thing the garden grows, so it only goes in
       the plots with headroom. Flowering hangs blossom in the crown. */
    sapling: function (ctx, x, y, size, body, bloom, sway, rnd) {
      var g = ease(body);
      if (g <= 0.01) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway * 1.2);          // top-heavy, so it moves most
      ctx.scale(g, g);

      var tipX = (rnd[0] - 0.5) * size * 0.16;

      ctx.lineCap = 'round';
      ctx.strokeStyle = T.woodDark;
      ctx.lineWidth = size * 0.11;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(size * 0.06, -size * 0.4, tipX, -size * 0.72);
      ctx.stroke();

      // a lighter core down the trunk, so it is not a flat stick
      ctx.strokeStyle = T.wood;
      ctx.lineWidth = size * 0.055;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.2);
      ctx.quadraticCurveTo(size * 0.06, -size * 0.5, tipX, -size * 0.78);
      ctx.stroke();

      var crownY = -size * 0.74;
      for (var i = 0; i < 6; i++) {
        var a = (i / 5 - 0.5) * 2.35 + (rnd[i + 1] - 0.5) * 0.22;
        var len = size * (0.34 + rnd[i + 3] * 0.2);
        NP.scenery.leaf(ctx, tipX + (rnd[i + 2] - 0.5) * size * 0.08, crownY,
                        len, len * 0.32, a, GREENS[i % 3], VEIN);
      }

      if (bloom > 0.01) {
        var b = ease(bloom);
        for (var f = 0; f < 3; f++) {
          blossom(ctx, tipX + (f - 1) * size * 0.26 + (rnd[f] - 0.5) * size * 0.1,
                  crownY + size * 0.1 + rnd[f + 2] * size * 0.12,
                  size * 0.085 * b, f % 2 === 1);
        }
      }

      ctx.restore();
    }
  };
})(window.NP = window.NP || {});
