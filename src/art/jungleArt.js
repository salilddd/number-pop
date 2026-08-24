/* Two small jungle actors that only the menu screens use: the banana the
   gorilla is fed, and the parrot that crosses the canopy.

   Kept out of scenery.js on purpose — everything in there is baked into an
   offscreen layer on resize, and both of these move every frame. Like the
   rest of src/art/ these are pure draw functions with no state of their own;
   playthings.js owns where they are and what they are doing. */
(function (NP) {
  'use strict';

  var T = NP.theme;

  /* -------------------------------------------------------------- banana */

  /* Drawn around its own centre, `len` long, pointing right before rotation.
     A banana is really just two arcs sharing their ends, with the fill
     between them — the trick is that the inner arc bows less than the outer
     one, which is what gives the crescent its taper. */
  NP.jungleArt = {
    banana: function (ctx, x, y, len, angle) {
      var w = len * 0.34;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.moveTo(-len / 2, w * 0.35);
      ctx.quadraticCurveTo(0, -w * 1.15, len / 2, w * 0.35);
      ctx.quadraticCurveTo(0, -w * 0.25, -len / 2, w * 0.35);
      ctx.closePath();

      var g = ctx.createLinearGradient(0, -w, 0, w);
      g.addColorStop(0, T.bananaLight);
      g.addColorStop(0.55, T.banana);
      g.addColorStop(1, T.bananaDark);
      ctx.fillStyle = g;
      ctx.fill();

      ctx.strokeStyle = T.bananaDark;
      ctx.lineWidth = Math.max(1, len * 0.035);
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Stem at one end, dried tip at the other.
      ctx.lineCap = 'round';
      ctx.strokeStyle = T.bananaTip;
      ctx.lineWidth = Math.max(1.6, len * 0.075);
      ctx.beginPath();
      ctx.moveTo(-len / 2, w * 0.35);
      ctx.lineTo(-len * 0.62, w * 0.1);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(len / 2, w * 0.35, Math.max(1.1, len * 0.05), 0, Math.PI * 2);
      ctx.fillStyle = T.bananaTip;
      ctx.fill();

      ctx.restore();
    },

    /* ---------------------------------------------------------- coconut */

    /* The three dark pores are the whole reason a brown circle reads as a
       coconut rather than as a rock, so they rotate with it — that is also
       what makes the roll legible. */
    coconut: function (ctx, x, y, r, angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      var g = ctx.createRadialGradient(-r * 0.32, -r * 0.34, r * 0.1, 0, 0, r);
      g.addColorStop(0, T.coconutLight);
      g.addColorStop(0.6, T.coconut);
      g.addColorStop(1, T.coconutDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // husk fibres
      ctx.strokeStyle = 'rgba(46,29,13,0.3)';
      ctx.lineWidth = Math.max(0.8, r * 0.06);
      ctx.lineCap = 'round';
      for (var i = 0; i < 5; i++) {
        var a = -0.9 + i * 0.45;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
        ctx.quadraticCurveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2,
                             Math.cos(a + 0.5) * r * 0.8, Math.sin(a + 0.5) * r * 0.8);
        ctx.stroke();
      }

      ctx.fillStyle = T.coconutEye;
      var pores = [[-0.3, -0.22], [0.28, -0.26], [0.02, 0.16]];
      for (var k = 0; k < pores.length; k++) {
        ctx.beginPath();
        ctx.arc(pores[k][0] * r, pores[k][1] * r, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },

    /* ------------------------------------------------------------- bomb */

    /* A cartoon bomb: a cast-iron ball, a collar, and a twist of fuse.
       `opts.fuse` is how much cord is left (1 unlit, 0 at the bang), `lit`
       whether it is burning, `glow` the flicker the fire throws back onto
       the shell, and `swell` the squash of it winding up to go off.

       The shell is nearly the colour of the chalkboard, so almost all of
       what makes it read as a sphere is the highlight and the rim light —
       fill it flat and it is a hole in the scene. */
    bomb: function (ctx, x, y, r, opts) {
      opts = opts || {};
      var f = opts.fuse == null ? 1 : opts.fuse;
      var glow = opts.glow || 0;
      var swell = opts.swell || 0;
      var c = fuseCurve(r, f);

      ctx.save();
      ctx.translate(x, y);

      // Contact shadow first and outside the squash, so the ball deforms
      // against the crate lid rather than dragging the lid with it.
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.95, r * 0.9, r * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.scale(1 + swell * 0.07, 1 - swell * 0.05);

      var g = ctx.createRadialGradient(-r * 0.36, -r * 0.4, r * 0.08, 0, 0, r * 1.05);
      g.addColorStop(0, T.bombLight);
      g.addColorStop(0.42, T.bomb);
      g.addColorStop(1, T.bombDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // bounce light off the sunlit floor, along the bottom-right
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = Math.max(1, r * 0.11);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.93, 0.34, 1.95);
      ctx.stroke();

      // the fuse throwing its own light down onto the shell
      if (glow > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        var wg = ctx.createRadialGradient(0, -r * 0.95, 0, 0, -r * 0.95, r * 1.6);
        wg.addColorStop(0, 'rgba(255,152,42,' + (0.55 * glow).toFixed(3) + ')');
        wg.addColorStop(1, 'rgba(255,100,20,0)');
        ctx.fillStyle = wg;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      }

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.37, -r * 0.42, r * 0.24, r * 0.15, -0.6, 0, Math.PI * 2);
      ctx.fill();

      // the collar the fuse comes out of
      var cw = r * 0.44;
      var cg = ctx.createLinearGradient(-cw, 0, cw, 0);
      cg.addColorStop(0, '#4a4e55');
      cg.addColorStop(0.38, T.bombCollar);
      cg.addColorStop(1, '#41454c');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(-cw, -r * 0.84);
      ctx.lineTo(cw, -r * 0.84);
      ctx.lineTo(cw * 0.74, -r * 1.28);
      ctx.lineTo(-cw * 0.74, -r * 1.28);
      ctx.closePath();
      ctx.fill();

      // the cord — dark twine with the twist ticked across it in light
      if (f > 0.02) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = T.fuseDark;
        ctx.lineWidth = Math.max(1.6, r * 0.2);
        ctx.beginPath();
        ctx.moveTo(c.x0, c.y0);
        ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
        ctx.stroke();

        ctx.strokeStyle = T.fuse;
        ctx.lineWidth = Math.max(1, r * 0.1);
        for (var i = 1; i <= 5; i++) {
          var t = i / 6, mt = 1 - t;
          var px = mt * mt * c.x0 + 2 * mt * t * c.cx + t * t * c.x;
          var py = mt * mt * c.y0 + 2 * mt * t * c.cy + t * t * c.y;
          var dx = 2 * mt * (c.cx - c.x0) + 2 * t * (c.x - c.cx);
          var dy = 2 * mt * (c.cy - c.y0) + 2 * t * (c.y - c.cy);
          var d = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
          var nx = -dy / d * r * 0.12, ny = dx / d * r * 0.12;
          ctx.beginPath();
          ctx.moveTo(px - nx, py - ny);
          ctx.lineTo(px + nx, py + ny);
          ctx.stroke();
        }
      }

      if (opts.lit) {
        // The fire itself: an additive bloom with a hard white core, which
        // is the only part of this that has to survive being tiny.
        var fr = r * (0.36 + 0.22 * glow);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var sg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, fr * 2.8);
        sg.addColorStop(0, T.spark);
        sg.addColorStop(0.28, 'rgba(255,176,58,0.5)');
        sg.addColorStop(1, 'rgba(255,106,30,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(c.x, c.y, fr * 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = T.spark;
        ctx.beginPath();
        ctx.arc(c.x, c.y, fr * 0.44, 0, Math.PI * 2);
        ctx.fill();
      } else if (f > 0.02) {
        // an unlit cord ends in a frayed black tip, not in mid-air
        ctx.fillStyle = T.bombDark;
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(1, r * 0.11), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },

    /* Where the burning end of the fuse is, in screen pixels. playthings.js
       has to put its sparks exactly where the fire is drawn, and a fuse that
       throws them off the wrong end is worse than one that throws none. */
    bombFuseTip: function (x, y, r, f) {
      var c = fuseCurve(r, f);
      return { x: x + c.x, y: y + c.y };
    },

    /* ------------------------------------------------------------ parrot */

    /* `dir` is 1 flying right, -1 flying left. `flap` runs 0..1 through one
       wingbeat. The far wing is drawn behind the body and the near one in
       front, so the beat reads as depth rather than as a flat scissor. */
    parrot: function (ctx, x, y, size, dir, flap, squawk) {
      var beat = Math.sin(flap * Math.PI * 2);

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir * size, size);         // authored facing right, 1 unit tall

      wing(ctx, -beat * 0.9 - 0.25, T.parrotWing2, 0.78);

      // tail
      ctx.fillStyle = T.parrotDark;
      ctx.beginPath();
      ctx.moveTo(-0.28, 0);
      ctx.lineTo(-0.95, -0.22);
      ctx.lineTo(-0.92, 0.02);
      ctx.lineTo(-0.95, 0.24);
      ctx.closePath();
      ctx.fill();

      // body
      ctx.fillStyle = T.parrot;
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.46, 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // head
      ctx.beginPath();
      ctx.arc(0.42, -0.16, 0.22, 0, Math.PI * 2);
      ctx.fill();

      // hooked beak
      ctx.fillStyle = T.parrotBeak;
      ctx.beginPath();
      ctx.moveTo(0.58, -0.2);
      ctx.quadraticCurveTo(0.78, -0.14, 0.7, 0.03);
      ctx.quadraticCurveTo(0.63, -0.04, 0.56, -0.06);
      ctx.closePath();
      ctx.fill();

      // eye — wide open mid-squawk
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0.47, -0.22, 0.075 + squawk * 0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = T.ink;
      ctx.beginPath();
      ctx.arc(0.48, -0.22, 0.042, 0, Math.PI * 2);
      ctx.fill();

      wing(ctx, beat * 1.05, T.parrotWing, 1);

      ctx.restore();
    },

    /* Same contract as the parrot. Deliberately the opposite silhouette:
       heavier body, slower beat, and that beak — which is most of the bird
       and is what makes it readable at this size against a dark board. */
    toucan: function (ctx, x, y, size, dir, flap, squawk) {
      var beat = Math.sin(flap * Math.PI * 2);

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir * size, size);

      wing(ctx, -beat * 0.8 - 0.25, T.toucanDark, 0.8);

      // squared-off tail
      ctx.fillStyle = T.toucanDark;
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.16);
      ctx.lineTo(-0.98, -0.2);
      ctx.lineTo(-0.98, 0.16);
      ctx.lineTo(-0.3, 0.2);
      ctx.closePath();
      ctx.fill();

      // body
      ctx.fillStyle = T.toucan;
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.52, 0.36, 0, 0, Math.PI * 2);
      ctx.fill();

      // cream bib down the throat and chest
      ctx.fillStyle = T.toucanBib;
      ctx.beginPath();
      ctx.ellipse(0.26, 0.06, 0.3, 0.24, -0.25, 0, Math.PI * 2);
      ctx.fill();

      // head
      ctx.fillStyle = T.toucan;
      ctx.beginPath();
      ctx.arc(0.46, -0.22, 0.25, 0, Math.PI * 2);
      ctx.fill();

      /* The beak: one long curved wedge, tip laid over the base so the
         colour change reads as a tip and not as a seam. */
      ctx.beginPath();
      ctx.moveTo(0.6, -0.36);
      ctx.quadraticCurveTo(1.35, -0.34, 1.62, 0.02);
      ctx.quadraticCurveTo(1.15, -0.04, 0.62, -0.05);
      ctx.closePath();
      ctx.fillStyle = T.toucanBeak;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(1.3, -0.19);
      ctx.quadraticCurveTo(1.5, -0.1, 1.62, 0.02);
      ctx.quadraticCurveTo(1.36, -0.02, 1.22, -0.06);
      ctx.closePath();
      ctx.fillStyle = T.toucanBeakTip;
      ctx.fill();

      // the dark seam where the two halves meet
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.028;
      ctx.beginPath();
      ctx.moveTo(0.62, -0.06);
      ctx.quadraticCurveTo(1.15, -0.05, 1.62, 0.02);
      ctx.stroke();

      // pale eye patch, then the eye
      ctx.fillStyle = T.toucanEye;
      ctx.beginPath();
      ctx.ellipse(0.5, -0.3, 0.13, 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = T.ink;
      ctx.beginPath();
      ctx.arc(0.52, -0.3, 0.055 + squawk * 0.015, 0, Math.PI * 2);
      ctx.fill();

      wing(ctx, beat * 0.95, T.toucan, 1.06);

      ctx.restore();
    }
  };

  /* The fuse as one quadratic, in units of the bomb's radius and relative to
     its centre. Burning it down shortens the whole curve back towards the
     collar rather than sliding a point along a fixed one, so the cord that
     is left is always cord that has not burnt yet. */
  function fuseCurve(r, f) {
    var len = f < 0 ? 0 : (f > 1 ? 1 : f);
    var x0 = 0.04 * r, y0 = -1.22 * r;          // where it leaves the collar
    return {
      x0: x0, y0: y0,
      cx: x0 + 0.12 * r * len, cy: y0 - 1.05 * r * len,
      x:  x0 + 1.02 * r * len, y:  y0 - 1.18 * r * len
    };
  }

  function wing(ctx, angle, colour, scale) {
    ctx.save();
    ctx.translate(0.02, -0.12);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-0.28, -0.5, -0.52, -0.36);
    ctx.quadraticCurveTo(-0.34, -0.06, 0, 0);
    ctx.closePath();
    ctx.fill();

    // a band of secondary feathers along the trailing edge
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.moveTo(-0.08, -0.06);
    ctx.quadraticCurveTo(-0.3, -0.2, -0.48, -0.33);
    ctx.quadraticCurveTo(-0.3, -0.1, -0.08, -0.02);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
})(window.NP = window.NP || {});
