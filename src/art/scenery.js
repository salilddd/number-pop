/* All the set dressing: the chalkboard itself, the crates and sack along the
   bottom, and the vines that hang from the top on the menu screens.

   Everything here is drawn with paths and gradients — there are no image
   files anywhere in this game. Both layers are pre-rendered into offscreen
   canvases on resize and blitted once per frame, so the per-frame cost is a
   single drawImage no matter how detailed the scene gets.

   The layout uses its own fixed-seed PRNG rather than NP.rng, so the plank
   grain and leaf angles stay put when the game reseeds for a daily run. */
(function (NP) {
  'use strict';

  var T = NP.theme;

  /* ---------------------------------------------------------------- rng */

  function makeRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------ helpers */

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* A single pointed leaf, drawn from its stem at the origin pointing "up"
     before rotation. Two mirrored quadratics give the classic leaf outline. */
  function leaf(ctx, x, y, len, halfWidth, angle, fill, veinColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(halfWidth, -len * 0.45, 0, -len);
    ctx.quadraticCurveTo(-halfWidth, -len * 0.45, 0, 0);
    ctx.fillStyle = fill;
    ctx.fill();

    // midrib
    ctx.strokeStyle = veinColor;
    ctx.lineWidth = Math.max(1, len * 0.022);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.04);
    ctx.lineTo(0, -len * 0.93);
    ctx.stroke();

    // side veins
    ctx.lineWidth = Math.max(0.8, len * 0.014);
    ctx.globalAlpha = 0.75;
    for (var i = 1; i <= 4; i++) {
      var t = i / 5;
      var vy = -len * (0.14 + t * 0.68);
      var spread = halfWidth * (1 - Math.abs(t - 0.35)) * 0.62;
      ctx.beginPath();
      ctx.moveTo(0, vy);
      ctx.quadraticCurveTo(spread * 0.6, vy - len * 0.04, spread, vy - len * 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, vy);
      ctx.quadraticCurveTo(-spread * 0.6, vy - len * 0.04, -spread, vy - len * 0.1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // a soft sheen down one side so the leaves don't read as flat cutouts
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.08);
    ctx.quadraticCurveTo(halfWidth * 0.55, -len * 0.45, 0, -len * 0.9);
    ctx.quadraticCurveTo(halfWidth * 0.12, -len * 0.45, 0, -len * 0.08);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fill();

    ctx.restore();
  }

  /* A fan of leaves growing out of one point. */
  function leafCluster(ctx, x, y, size, count, baseAngle, spread, rand) {
    var greens = [T.leaf1, T.leaf2, T.leaf3];
    for (var i = 0; i < count; i++) {
      var t = count === 1 ? 0.5 : i / (count - 1);
      var angle = baseAngle + (t - 0.5) * spread + (rand() - 0.5) * 0.16;
      var len = size * (0.66 + rand() * 0.5);
      leaf(ctx, x + (rand() - 0.5) * size * 0.22, y, len, len * 0.29, angle,
           greens[i % greens.length], T.leafVein);
    }
  }

  /* ------------------------------------------------------------- crates */

  function woodPanel(ctx, x, y, w, h, rand) {
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, T.woodLight);
    g.addColorStop(0.45, T.wood);
    g.addColorStop(1, T.woodDark);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    // grain
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.lineWidth = 1;
    for (var i = 0; i < Math.max(3, h / 7); i++) {
      var gy = y + rand() * h;
      ctx.strokeStyle = rand() > 0.5
        ? 'rgba(74,47,25,0.22)'
        : 'rgba(214,172,124,0.14)';
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.bezierCurveTo(x + w * 0.3, gy + (rand() - 0.5) * 4,
                        x + w * 0.7, gy + (rand() - 0.5) * 4,
                        x + w, gy + (rand() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(40,25,12,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function nails(ctx, x, y, w, h) {
    var pts = [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]];
    for (var i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 2.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(38,24,12,0.62)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pts[i][0] - 0.6, pts[i][1] - 0.6, 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(228,200,166,0.4)';
      ctx.fill();
    }
  }

  /* A plain closed crate: horizontal planks inside a heavier frame. */
  function crate(ctx, x, y, w, h, rand, opts) {
    opts = opts || {};
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = T.woodDeep;
    ctx.fillRect(0, 0, w, h);

    var planks = Math.max(2, Math.round(h / 26));
    var ph = h / planks;
    for (var i = 0; i < planks; i++) {
      woodPanel(ctx, 3, i * ph + 2, w - 6, ph - 3, rand);
    }

    // frame boards down each side
    woodPanel(ctx, 0, 0, 9, h, rand);
    woodPanel(ctx, w - 9, 0, 9, h, rand);
    nails(ctx, 0, 0, 9, h);
    nails(ctx, w - 9, 0, 9, h);

    if (opts.caution) {
      ctx.save();
      ctx.translate(w / 2, h * 0.5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = T.cautionRed;
      ctx.globalAlpha = 0.82;

      var fs = Math.max(7, w * 0.11);
      ctx.font = '700 ' + fs + 'px ' + T.font;
      ctx.fillText('CAUTION', 0, -h * 0.3);

      // an upward arrow, the way shipping crates are stencilled
      var ax = 0, ay = h * 0.02, ah = h * 0.24, aw = w * 0.13;
      ctx.lineWidth = Math.max(2, w * 0.05);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = T.cautionRed;
      ctx.beginPath();
      ctx.moveTo(ax, ay + ah);
      ctx.lineTo(ax, ay - ah * 0.5);
      ctx.moveTo(ax - aw, ay + aw * 0.1);
      ctx.lineTo(ax, ay - ah * 0.55);
      ctx.lineTo(ax + aw, ay + aw * 0.1);
      ctx.stroke();

      ctx.font = '600 ' + (fs * 0.72) + 'px ' + T.font;
      ctx.fillText('THIS SIDE UP', 0, h * 0.36);
      ctx.restore();
    }

    if (opts.latch) {
      var lx = w * 0.5 - 7, ly = h * 0.42;
      ctx.fillStyle = '#8d9099';
      roundRect(ctx, lx, ly, 14, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#5d6169';
      roundRect(ctx, lx + 3, ly + 6, 8, 9, 2);
      ctx.fill();
    }

    if (opts.holes) {
      ctx.fillStyle = 'rgba(24,15,7,0.78)';
      for (var k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(w * (0.22 + k * 0.14), h * 0.24, Math.max(2.4, w * 0.022), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /* An open slatted crate — the lattice one in the top-left of the scene. */
  function slatCrate(ctx, x, y, w, h, rand) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(20,13,6,0.85)';
    ctx.fillRect(0, 0, w, h);

    var slatH = h / 5;
    for (var i = 0; i < 5; i++) {
      woodPanel(ctx, 0, i * slatH + 2, w, slatH - 4, rand);
    }
    // two verticals over the top
    woodPanel(ctx, w * 0.12, 0, 8, h, rand);
    woodPanel(ctx, w * 0.72, 0, 8, h, rand);
    ctx.restore();
  }

  /* ------------------------------------------------------- burlap sack */

  function sack(ctx, x, y, w, h, rand) {
    ctx.save();
    ctx.translate(x, y);

    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, T.sack);
    g.addColorStop(1, T.sackDark);
    ctx.fillStyle = g;

    // a slumped bag: wide at the base, gathered at the neck
    ctx.beginPath();
    ctx.moveTo(w * 0.28, 0);
    ctx.bezierCurveTo(w * 0.02, h * 0.3, 0, h * 0.75, w * 0.16, h);
    ctx.lineTo(w * 0.86, h);
    ctx.bezierCurveTo(w * 1.02, h * 0.72, w * 0.96, h * 0.28, w * 0.72, 0);
    ctx.closePath();
    ctx.fill();

    // fold shadows
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(110,92,58,0.35)';
    ctx.lineWidth = Math.max(1.5, w * 0.022);
    for (var i = 0; i < 4; i++) {
      var fx = w * (0.24 + i * 0.17);
      ctx.beginPath();
      ctx.moveTo(fx, h * 0.16);
      ctx.quadraticCurveTo(fx + (rand() - 0.5) * w * 0.12, h * 0.6, fx + (rand() - 0.5) * w * 0.1, h);
      ctx.stroke();
    }
    ctx.restore();

    // rope tied round the neck
    ctx.strokeStyle = T.rope;
    ctx.lineWidth = Math.max(3, w * 0.055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.14);
    ctx.quadraticCurveTo(w * 0.5, h * 0.24, w * 0.78, h * 0.12);
    ctx.stroke();
    // knot + tails
    ctx.lineWidth = Math.max(2, w * 0.035);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.2);
    ctx.quadraticCurveTo(w * 0.62, h * 0.3, w * 0.56, h * 0.42);
    ctx.moveTo(w * 0.5, h * 0.2);
    ctx.quadraticCurveTo(w * 0.38, h * 0.32, w * 0.44, h * 0.44);
    ctx.stroke();

    ctx.restore();
  }

  /* --------------------------------------------------- hanging vines */

  function vine(ctx, x, y, length, sway, rand, flowers) {
    var endX = x + sway;
    var endY = y + length;

    ctx.strokeStyle = T.vine;
    ctx.lineWidth = Math.max(2, length * 0.014);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + sway * 0.2, y + length * 0.35,
                      x + sway * 1.25, y + length * 0.66,
                      endX, endY);
    ctx.stroke();

    // leaves and flowers spaced down the stem
    var steps = Math.max(3, Math.round(length / 34));
    for (var i = 1; i <= steps; i++) {
      var t = i / (steps + 1);
      var mt = 1 - t;
      // point on the cubic
      var px = mt * mt * mt * x
             + 3 * mt * mt * t * (x + sway * 0.2)
             + 3 * mt * t * t * (x + sway * 1.25)
             + t * t * t * endX;
      var py = mt * mt * mt * y
             + 3 * mt * mt * t * (y + length * 0.35)
             + 3 * mt * t * t * (y + length * 0.66)
             + t * t * t * endY;

      var side = (i % 2 === 0) ? 1 : -1;
      var ln = length * (0.11 + rand() * 0.05);
      leaf(ctx, px, py, ln, ln * 0.3, side * (2.2 + rand() * 0.5), T.leaf1, T.leafVein);

      if (flowers && rand() > 0.55) {
        var fr = length * 0.035;
        ctx.fillStyle = T.flowerDark;
        ctx.beginPath();
        ctx.ellipse(px + side * fr * 0.6, py + fr * 1.5, fr * 0.85, fr * 1.5, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = T.flower;
        ctx.beginPath();
        ctx.ellipse(px + side * fr * 0.4, py + fr * 1.3, fr * 0.7, fr * 1.3, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.ellipse(px + side * fr * 0.2, py + fr * 0.8, fr * 0.24, fr * 0.5, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ---------------------------------------------------- chalkboard base */

  function paintBoard(ctx, w, h) {
    var rand = makeRandom(0xC4A1B0);

    ctx.fillStyle = T.board;
    ctx.fillRect(0, 0, w, h);

    // cloudy chalk-dust smudges
    for (var i = 0; i < 26; i++) {
      var cx = rand() * w;
      var cy = rand() * h;
      var r = (0.08 + rand() * 0.26) * Math.max(w, h) * 0.55;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, T.boardSmudge);
      g.addColorStop(1, 'rgba(226,230,210,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // wiped arcs, the ghost of a board rubber
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (var j = 0; j < 7; j++) {
      var ax = rand() * w;
      var ay = rand() * h;
      var aw = w * (0.25 + rand() * 0.4);
      var ah = h * (0.02 + rand() * 0.05);
      var ag = ctx.createLinearGradient(ax - aw / 2, ay, ax + aw / 2, ay);
      ag.addColorStop(0, 'rgba(226,230,210,0)');
      ag.addColorStop(0.5, 'rgba(226,230,210,0.05)');
      ag.addColorStop(1, 'rgba(226,230,210,0)');
      ctx.fillStyle = ag;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate((rand() - 0.5) * 0.5);
      ctx.fillRect(-aw / 2, -ah / 2, aw, ah);
      ctx.restore();
    }
    ctx.restore();

    // short bright scratches
    ctx.strokeStyle = T.boardScratch;
    ctx.lineCap = 'round';
    for (var k = 0; k < 16; k++) {
      var sx = rand() * w;
      var sy = rand() * h;
      var len = 6 + rand() * 30;
      var ang = (rand() - 0.5) * 1.4;
      ctx.globalAlpha = 0.25 + rand() * 0.5;
      ctx.lineWidth = 0.7 + rand() * 1.1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len * 0.35);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // vignette
    var vg = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.22,
                                      w / 2, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  /* ------------------------------------------------ the bottom tableau */

  function paintProps(ctx, w, h) {
    var rand = makeRandom(0x5EED12);
    var s = w / 520;              // everything below is authored at 520px wide
    var base = h + 6 * s;         // let the props run just off the bottom edge

    ctx.save();

    /* ---- left group: the slat crate sits on the big crate, sack in front ---- */
    crate(ctx, -12 * s, base - 132 * s, 132 * s, 134 * s, rand, { latch: true });
    slatCrate(ctx, -8 * s, base - 210 * s, 98 * s, 80 * s, rand);
    leafCluster(ctx, 122 * s, base - 104 * s, 68 * s, 4, -0.35, 1.5, rand);
    sack(ctx, 22 * s, base - 74 * s, 102 * s, 78 * s, rand);
    leafCluster(ctx, 6 * s, base - 6 * s, 58 * s, 3, -0.15, 1.2, rand);

    /* ---- right group: caution crate behind, holed crate in front ---- */
    crate(ctx, 398 * s, base - 220 * s, 138 * s, 138 * s, rand, { caution: true });
    crate(ctx, 382 * s, base - 104 * s, 154 * s, 108 * s, rand, { holes: true });
    leafCluster(ctx, 392 * s, base - 90 * s, 74 * s, 5, 0.28, 1.7, rand);
    leafCluster(ctx, 512 * s, base - 18 * s, 62 * s, 3, 0.2, 1.3, rand);

    /* ---- a few fronds across the very bottom to tie the groups together ---- */
    leafCluster(ctx, 168 * s, base + 4 * s, 70 * s, 4, -0.12, 1.5, rand);
    leafCluster(ctx, 268 * s, base + 8 * s, 54 * s, 3, 0.05, 1.3, rand);
    leafCluster(ctx, 344 * s, base + 2 * s, 64 * s, 4, 0.18, 1.4, rand);

    ctx.restore();
  }

  /* ------------------------------------------- the top vines (menus only) */

  function paintCanopy(ctx, w, h) {
    var rand = makeRandom(0x9A17C3);
    var s = w / 520;

    // left canopy
    leafCluster(ctx, 40 * s, -6 * s, 92 * s, 5, Math.PI - 0.35, 1.7, rand);
    leafCluster(ctx, 132 * s, -10 * s, 74 * s, 4, Math.PI + 0.2, 1.5, rand);
    vine(ctx, 96 * s, 0, 150 * s, 26 * s, rand, true);
    vine(ctx, 168 * s, 0, 104 * s, -18 * s, rand, true);

    // right canopy
    leafCluster(ctx, w - 46 * s, -8 * s, 88 * s, 5, Math.PI + 0.3, 1.7, rand);
    vine(ctx, w - 120 * s, 0, 122 * s, 22 * s, rand, true);

    // a lone strand near the middle so the top edge isn't symmetrical
    vine(ctx, w * 0.52, 0, 74 * s, -14 * s, rand, false);
  }

  /* ------------------------------------------------------------- public */

  var boardLayer = null;
  var canopyLayer = null;
  var layerW = 0, layerH = 0;

  function makeLayer(w, h, dpr, painter) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    var g = c.getContext('2d');
    g.scale(dpr, dpr);
    painter(g, w, h);
    return c;
  }

  NP.scenery = {
    /* Rebuild both offscreen layers. Call on resize only — this is the
       expensive part of the whole renderer. */
    build: function (w, h, dpr) {
      layerW = w; layerH = h;
      boardLayer = makeLayer(w, h, dpr, function (g, ww, hh) {
        paintBoard(g, ww, hh);
        paintProps(g, ww, hh);
      });
      canopyLayer = makeLayer(w, h, dpr, function (g, ww, hh) {
        paintCanopy(g, ww, hh);
      });
    },

    drawBoard: function (ctx) {
      if (boardLayer) ctx.drawImage(boardLayer, 0, 0, layerW, layerH);
    },

    /* Hanging vines: only shown on the menu and game-over screens, matching
       how the real game keeps the play field clear at the top. */
    drawCanopy: function (ctx) {
      if (canopyLayer) ctx.drawImage(canopyLayer, 0, 0, layerW, layerH);
    },

    /* Exposed so the mascot and other art can reuse the leaf shape. */
    leaf: leaf,
    roundRect: roundRect
  };
})(window.NP = window.NP || {});
