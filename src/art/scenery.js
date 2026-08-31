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

  /* Zero the alpha on an rgba() string, for the far stop of a gradient.

     A gradient that fades to `rgba(0,0,0,0)` is fading toward transparent
     *black*, and browsers disagree about whether that darkens the midpoint.
     Fading a colour to its own zero-alpha self can only ever be clean. */
  function fade(rgba) {
    return rgba.replace(/[\d.]+\s*\)$/, '0)');
  }

  /* Where the key light comes from, as a unit vector in board space: down and
     to the right, i.e. the sun is off the top-left shoulder of the scene.
     paintBoard puts its light break on the same side, and every contact
     shadow below is offset along it, so the whole scene agrees about the
     time of day. Change it here and everything follows. */
  var LIGHT_X = 0.6, LIGHT_Y = 0.8;

  /* The blade outline, in a frame where the stem is at the origin and the
     leaf points "up". Three of them, because one silhouette repeated across
     a cluster is the single loudest tell that a scene was generated: real
     foliage is never the same leaf forty times.

     0 — the classic point, narrow and symmetric.
     1 — broad and blunt, the understorey philodendron shape.
     2 — a drooping tip, swung off the midrib to one side. */
  function bladePath(ctx, len, halfWidth, variant) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    if (variant === 1) {
      ctx.bezierCurveTo(halfWidth * 1.28, -len * 0.20,
                        halfWidth * 1.10, -len * 0.74, 0, -len);
      ctx.bezierCurveTo(-halfWidth * 1.04, -len * 0.72,
                        -halfWidth * 1.22, -len * 0.18, 0, 0);
    } else if (variant === 2) {
      ctx.bezierCurveTo(halfWidth * 1.02, -len * 0.30,
                        halfWidth * 0.98, -len * 0.80, halfWidth * 0.26, -len);
      ctx.bezierCurveTo(-halfWidth * 0.88, -len * 0.74,
                        -halfWidth * 0.98, -len * 0.24, 0, 0);
    } else {
      ctx.quadraticCurveTo(halfWidth, -len * 0.45, 0, -len);
      ctx.quadraticCurveTo(-halfWidth, -len * 0.45, 0, 0);
    }
    ctx.closePath();
  }

  /* A single leaf, drawn from its stem at the origin pointing "up" before
     rotation.

     This used to be a flat fill, a midrib, four veins and one 9%-white sheen
     — which is a cutout, not a surface. What is added on top of the fill,
     all of it clipped inside the blade so nothing spills:

       · a cross-blade gradient aligned to the scene's key light, so one side
         of the midrib catches it and the other falls away. The gradient is
         rotated *out* of the leaf's own frame, so a cluster fanned through
         180° is lit from one direction rather than every leaf being lit
         identically relative to itself.
       · a warm glow through the blade — the thing that actually reads as a
         leaf being thin — kept yellower than any green in the palette,
         because that is what daylight does on its way through one.
       · a hard specular along the curl.
       · a darkened rim, so a leaf ends on a line instead of dissolving into
         whichever leaf is behind it.

     `variant` picks the silhouette. Callers that don't care get one chosen
     from the leaf's own dimensions, which varies across a fanned cluster
     while staying put for any given leaf between rebuilds. */
  function leaf(ctx, x, y, len, halfWidth, angle, fill, veinColor, variant) {
    if (variant == null) {
      variant = Math.abs(Math.round(len * 7 + angle * 13 + halfWidth)) % 3;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    bladePath(ctx, len, halfWidth, variant);
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.save();
    ctx.clip();

    /* The key light, brought from board space into this leaf's rotated
       frame. Everything below is drawn along it. */
    var c = Math.cos(-angle), s = Math.sin(-angle);
    var lx = LIGHT_X * c - LIGHT_Y * s;
    var ly = LIGHT_X * s + LIGHT_Y * c;

    var midY = -len * 0.5;
    var reach = Math.max(halfWidth * 1.7, len * 0.6);

    // light through the blade, strongest up the midrib away from the stem
    var glow = ctx.createRadialGradient(0, -len * 0.42, 0, 0, -len * 0.42, len * 0.6);
    glow.addColorStop(0, T.leafGlow);
    glow.addColorStop(1, fade(T.leafGlow));
    ctx.fillStyle = glow;
    ctx.fillRect(-reach, -len * 1.1, reach * 2, len * 1.2);

    // lit side / shaded side, across the blade
    var lit = ctx.createLinearGradient(-lx * reach, midY - ly * reach,
                                        lx * reach, midY + ly * reach);
    lit.addColorStop(0, T.leafLit);
    lit.addColorStop(0.46, fade(T.leafLit));
    lit.addColorStop(0.54, fade(T.leafShade));
    lit.addColorStop(1, T.leafShade);
    ctx.fillStyle = lit;
    ctx.fillRect(-reach, -len * 1.1, reach * 2, len * 1.2);

    // midrib
    ctx.strokeStyle = veinColor;
    ctx.lineWidth = Math.max(1, len * 0.022);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.04);
    ctx.lineTo(variant === 2 ? halfWidth * 0.22 : 0, -len * 0.93);
    ctx.stroke();

    // side veins
    ctx.lineWidth = Math.max(0.8, len * 0.014);
    ctx.globalAlpha = 0.6;
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

    /* The specular, on whichever side of the midrib the light is actually
       on. A highlight painted down a fixed side is the giveaway the old
       sheen had: half the leaves in a fan were lit from underneath. */
    var side = lx >= 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.1);
    ctx.quadraticCurveTo(side * halfWidth * 0.62, -len * 0.44, 0, -len * 0.88);
    ctx.quadraticCurveTo(side * halfWidth * 0.16, -len * 0.44, 0, -len * 0.1);
    ctx.fillStyle = T.leafSpec;
    ctx.globalAlpha = 0.55 + Math.abs(lx) * 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();

    // rim, outside the clip so it lands on the edge rather than inside it
    bladePath(ctx, len, halfWidth, variant);
    ctx.strokeStyle = T.leafEdge;
    ctx.lineWidth = Math.max(0.8, len * 0.018);
    ctx.stroke();

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

  /* ------------------------------------------------- grounding shadow */

  /* The pool of shadow an object standing on the floor casts under itself.

     Nothing in this scene had one. A crate drawn straight onto the ground
     gradient is a rectangle in front of a wall, not a box resting on a
     floor, and no amount of detail on the crate itself fixes that — the
     information that says "this is standing on that" lives entirely in the
     dark under it.

     Offset along the scene's key light, so every shadow in the tableau falls
     the same way, and squashed flat because we are looking at the floor at a
     glancing angle. */
  function groundShadow(ctx, cx, cy, rx, ry, alpha) {
    ctx.save();
    ctx.translate(cx + rx * LIGHT_X * 0.18, cy + ry * LIGHT_Y * 0.25);
    ctx.scale(rx, ry);

    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0,    T.contact);
    g.addColorStop(0.55, 'rgba(5,12,6,' + (0.5 * alpha * 0.45).toFixed(3) + ')');
    g.addColorStop(1,    T.contactEdge);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
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

  /* A band of out-of-focus foliage, for the middle distance.

     This is the depth-of-field pass, and it is doing two jobs at once. The
     blur is the cue that says "this is further away than the thing in front
     of it" — the scene had no such cue at all before, every element from the
     back wall to the crates being drawn at identical crispness. And the
     shapes give the empty middle of the board something in it, so the space
     between the canopy and the crates reads as air with jungle in it rather
     than as a fill.

     Deliberately no shading, no veins, no rim: at this blur none of it would
     survive, and a blurred leaf is only ever shape and value.

     Drawn in clusters rather than scattered evenly. Evenly spaced leaves at
     this size read as a pattern of individual shapes floating in front of a
     wall; foliage massed around a few centres, overlapping itself, reads as
     one canopy at a distance — which is the only thing it is allowed to
     read as. The leaves are also small relative to their blur, because a
     blurred shape stops being an object and starts being tone only once the
     blur is a decent fraction of the shape. */
  function farFoliage(ctx, w, h, rand, yTop, yBottom, blur, color, clusters, size) {
    ctx.save();
    ctx.filter = 'blur(' + blur + 'px)';
    ctx.fillStyle = color;

    for (var c = 0; c < clusters; c++) {
      var hx = rand() * w * 1.2 - w * 0.1;
      var hy = yTop + rand() * (yBottom - yTop);
      var spread = size * (1.6 + rand() * 1.4);
      var n = 7 + Math.floor(rand() * 7);

      for (var i = 0; i < n; i++) {
        var len = size * (0.55 + rand() * 0.7);
        ctx.save();
        ctx.translate(hx + (rand() - 0.5) * spread,
                      hy + (rand() - 0.5) * spread * 0.6);
        ctx.rotate(rand() * Math.PI * 2);
        bladePath(ctx, len, len * (0.3 + rand() * 0.2), i % 3);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.filter = 'none';
    ctx.restore();
  }

  function paintBoard(ctx, w, h) {
    var rand = makeRandom(0xC4A1B0);
    var i;

    /* The ground runs top to bottom in board space, so it re-derives at
       whatever height the layer is rebuilt at and never needs unpicking
       when the viewport changes.

       Five stops rather than three. The extra two are the whole point: a
       dark lip at the very top for the hanging canopy to sit against, and a
       bright break just under it where daylight gets past the leaves. Under
       the old three-stop ramp the top of the board was the darkest thing in
       the scene, which is backwards — it is where the sky is. */
    var ground = ctx.createLinearGradient(0, 0, 0, h);
    ground.addColorStop(0,    T.boardTop);
    ground.addColorStop(0.14, T.boardHaze);
    ground.addColorStop(0.46, T.board);
    ground.addColorStop(0.78, T.board);
    ground.addColorStop(1,    T.boardFloor);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);

    /* The light break: the sun, off the top-left shoulder, coming through a
       gap in the canopy. Everything else in the scene — the leaf speculars,
       the contact shadows, the key light below — is aimed to agree with it. */
    var sunX = w * 0.30, sunY = h * 0.09, sunR = Math.max(w, h) * 0.34;
    var sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
    sun.addColorStop(0,    T.sunCore);
    sun.addColorStop(0.35, 'rgba(226,240,166,0.11)');
    sun.addColorStop(1,    T.sunEdge);
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    /* Two foliage bands at different blurs. Far and heavily blurred first,
       then a nearer, sharper one over it — the difference between the two
       is what actually builds the depth, more than either band alone. */
    farFoliage(ctx, w, h, rand, h * 0.05, h * 0.60, 13, T.farLeafDeep, 9, h * 0.05);

    /* Aerial haze, between the bands. Distance washes contrast out toward
       the colour of the air, and inserting that wash *between* two layers of
       foliage is what separates them — without it they are two sets of
       blurred shapes at the same apparent distance. */
    var hz = ctx.createLinearGradient(0, h * 0.06, 0, h * 0.56);
    hz.addColorStop(0,    T.hazeEdge);
    hz.addColorStop(0.38, T.haze);
    hz.addColorStop(1,    T.hazeEdge);
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, w, h);

    farFoliage(ctx, w, h, rand, h * 0.18, h * 0.78, 9, T.farLeaf, 6, h * 0.042);

    // light dapple, pooling toward the floor where the canopy breaks
    for (i = 0; i < 22; i++) {
      var cx = rand() * w;
      var cy = h * 0.25 + rand() * h * 0.75;
      var r = (0.08 + rand() * 0.24) * Math.max(w, h) * 0.5;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, T.dapple);
      g.addColorStop(1, T.dappleEdge);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    /* Dust caught in the shaft. Weighted toward the lit side of the board,
       because that is the only place you would be able to see it. */
    ctx.fillStyle = T.mote;
    for (i = 0; i < 34; i++) {
      var mx = rand() * w * 0.82;
      var my = h * 0.06 + rand() * h * 0.6;
      var mr = 0.5 + rand() * 1.5;
      ctx.globalAlpha = (0.12 + rand() * 0.4) * (1 - my / h);
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* The key light, in place of the flat vignette that used to sit here.

       The old one was a black radial centred on the middle of the board: it
       darkened all four corners equally, which is not light, it is just less
       of everything. This one is offset to the sun's side and falls off
       toward the opposite corner, so the board has a lit end and a shaded
       end. The shadow colour is boardDeep rather than black — shadows in a
       green scene are green, and a black one reads as dirt on the lens. */
    var kx = w * 0.34, ky = h * 0.26;
    var far = Math.sqrt((w - kx) * (w - kx) + (h - ky) * (h - ky));
    var key = ctx.createRadialGradient(kx, ky, Math.min(w, h) * 0.14, kx, ky, far);
    key.addColorStop(0,    'rgba(8,20,9,0)');
    key.addColorStop(0.55, 'rgba(8,20,9,0.16)');
    key.addColorStop(1,    'rgba(8,20,9,0.5)');
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, w, h);

    /* The floor comes back out from under the key light. The crates and the
       gorilla stand here and the garden grows here, so it is the one part of
       the board that must not be the darkest thing on screen — which is
       exactly what the falloff above would otherwise make it. */
    var floor = ctx.createLinearGradient(0, h * 0.52, 0, h);
    floor.addColorStop(0,    'rgba(120,142,58,0)');
    floor.addColorStop(0.55, 'rgba(120,142,58,0.05)');
    floor.addColorStop(1,    'rgba(120,142,58,0.17)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, h * 0.52, w, h * 0.48);
  }

  /* ------------------------------------------------ the bottom tableau */

  function paintProps(ctx, w, h) {
    var rand = makeRandom(0x5EED12);
    var s = w / 520;              // everything below is authored at 520px wide
    var base = h + 6 * s;         // let the props run just off the bottom edge

    ctx.save();

    /* An occlusion band where the floor meets the back of the scene. The
       crates sit in front of it, so the tableau has something to be in
       front of rather than being pasted onto the ground gradient. */
    var ao = ctx.createLinearGradient(0, base - 110 * s, 0, base);
    ao.addColorStop(0, T.contactEdge);
    ao.addColorStop(1, 'rgba(5,12,6,0.3)');
    ctx.fillStyle = ao;
    ctx.fillRect(0, base - 110 * s, w, 116 * s);

    /* ---- left group: the slat crate sits on the big crate, sack in front ----

       Each shadow goes down immediately before the thing that casts it, so
       it lands under that prop and over whatever the prop is standing on:
       the slat crate's pools on the big crate's lid, not on the floor. */
    groundShadow(ctx, 54 * s, base + 2 * s, 104 * s, 20 * s, 0.95);
    crate(ctx, -12 * s, base - 132 * s, 132 * s, 134 * s, rand, { latch: true });

    groundShadow(ctx, 41 * s, base - 130 * s, 62 * s, 13 * s, 0.8);
    slatCrate(ctx, -8 * s, base - 210 * s, 98 * s, 80 * s, rand);

    leafCluster(ctx, 122 * s, base - 104 * s, 68 * s, 4, -0.35, 1.5, rand);

    groundShadow(ctx, 73 * s, base + 4 * s, 74 * s, 16 * s, 0.9);
    sack(ctx, 22 * s, base - 74 * s, 102 * s, 78 * s, rand);

    leafCluster(ctx, 6 * s, base - 6 * s, 58 * s, 3, -0.15, 1.2, rand);

    /* ---- right group: caution crate behind, holed crate in front ---- */
    groundShadow(ctx, 467 * s, base - 82 * s, 96 * s, 18 * s, 0.85);
    crate(ctx, 398 * s, base - 220 * s, 138 * s, 138 * s, rand, { caution: true });

    groundShadow(ctx, 459 * s, base + 4 * s, 112 * s, 19 * s, 0.95);
    crate(ctx, 382 * s, base - 104 * s, 154 * s, 108 * s, rand, { holes: true });

    leafCluster(ctx, 392 * s, base - 90 * s, 74 * s, 5, 0.28, 1.7, rand);
    leafCluster(ctx, 512 * s, base - 18 * s, 62 * s, 3, 0.2, 1.3, rand);

    /* The middle of the floor is deliberately left bare.

       Three fronds used to run across it to tie the two crate groups
       together. They stood exactly where the garden grows, in the same three
       greens, and at 54–70 units they were larger than most of the plants a
       banana buys — so an earned fern arrived on top of a bigger one the
       player was given for free, and growing the jungle changed nothing you
       could point at.

       The floor is the garden's, and it is supposed to start empty: that is
       what makes twelve perfect levels look like something. */

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
  var propsLayer = null;
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
    /* Rebuild the offscreen layers. Call on resize only — this is the
       expensive part of the whole renderer.

       The crates and the sack are their own layer rather than part of the
       board, because they are foreground: the bomb, the coconut and the
       gorilla all stand on them, and on the menus that whole group has to be
       drawn in front of the contrast scrim while the board stays behind it.
       Baked into the board, the crates ended up behind the drifting bubbles
       while the bomb resting on one was in front of them. */
    build: function (w, h, dpr) {
      layerW = w; layerH = h;
      boardLayer = makeLayer(w, h, dpr, paintBoard);
      propsLayer = makeLayer(w, h, dpr, paintProps);
      canopyLayer = makeLayer(w, h, dpr, paintCanopy);
    },

    drawBoard: function (ctx) {
      if (boardLayer) ctx.drawImage(boardLayer, 0, 0, layerW, layerH);
    },

    /* The crates and the sack everything else stands on. */
    drawProps: function (ctx) {
      if (propsLayer) ctx.drawImage(propsLayer, 0, 0, layerW, layerH);
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
