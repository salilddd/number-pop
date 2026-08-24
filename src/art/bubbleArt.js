/* Drawing one answer bubble.

   The look is built in five passes: a cast shadow, a darker rim ring, the
   graded face, a specular highlight, then the number. The number is measured
   and shrunk to fit, so a three-digit answer never spills over the rim. */
(function (NP) {
  'use strict';

  var T = NP.theme;

  var PALETTES = {
    green:  { face: T.bubble, light: T.bubbleLight, mid: T.bubbleMid, rim: T.bubbleRim },
    reveal: { face: T.reveal, light: T.revealLight, mid: T.reveal,    rim: T.revealRim },
    wrong:  { face: T.wrong,  light: T.wrongLight,  mid: T.wrong,     rim: T.wrongRim }
  };

  /* The two thumbs.

     These are Google's Material Symbols — `thumb_up` and `thumb_down`, in the
     Rounded weight, filled — used under the Apache License 2.0:
     https://github.com/google/material-design-icons

     Drawing them by hand was a losing game. A thumbs up is a shape everyone
     has seen ten thousand times, so anything even slightly off in the
     proportions reads as wrong without the player being able to say why.

     The icons are authored on a 960 grid whose y axis already runs downwards
     (the viewBox is `0 -960 960 960`), so the path data drops straight into a
     canvas with no flip. `cx`/`cy` are the centre of each icon's real ink
     bounds, measured off the path data rather than assumed to be the middle
     of the grid — the forearm sits off to one side, so the two differ. They
     are what centres each hand in its bubble.

     The pair is a 180° rotation of one another, not a mirror: the forearm
     swaps corners. That is how the pair is designed, and it is why the two
     bubbles do not read as the same picture upside down. */
  var GLYPHS = {
    yes: {
      d: 'M840-640q32 0 56 24t24 56v80q0 7-1.5 15t-4.5 15L794-168q-9 20-30 34t-44 14H400q-33 0-56.5-23.5T320-200v-407q0-16 6.5-30.5T344-663l217-216q15-14 35.5-17t39.5 7q19 10 27.5 28t3.5 37l-45 184h218ZM160-120q-33 0-56.5-23.5T80-200v-360q0-33 23.5-56.5T160-640q33 0 56.5 23.5T240-560v360q0 33-23.5 56.5T160-120Z',
      cx: 500, cy: -508.2
    },
    no: {
      d: 'M120-320q-32 0-56-24t-24-56v-80q0-7 1.5-15t4.5-15l120-282q9-20 30-34t44-14h320q33 0 56.5 23.5T640-760v407q0 16-6.5 30.5T616-297L399-81q-15 14-35.5 17T324-71q-19-10-27.5-28t-3.5-37l45-184H120Zm680-520q33 0 56.5 23.5T880-760v360q0 33-23.5 56.5T800-320q-33 0-56.5-23.5T720-400v-360q0-33 23.5-56.5T800-840Z',
      cx: 460, cy: -451.8
    }
  };

  // Both icons are 840 grid units across the ink. The hand is drawn that wide
  // relative to the bubble radius, which puts its far corner at about 0.76r —
  // inside the rim with room to spare.
  var GLYPH_GRID = 840;
  var GLYPH_FILL = 1.22;

  function thumb(ctx, x, y, r, glyph, color) {
    var g = GLYPHS[glyph];
    if (!g) return;
    if (!g.path) g.path = new Path2D(g.d);

    var k = r * GLYPH_FILL / GLYPH_GRID;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.translate(-g.cx, -g.cy);
    ctx.fillStyle = color;
    ctx.fill(g.path);
    ctx.restore();
  }

  NP.bubbleArt = {
    draw: function (ctx, x, y, r, value, opts) {
      opts = opts || {};
      var pal = PALETTES[opts.palette || 'green'] || PALETTES.green;
      var alpha = opts.alpha == null ? 1 : opts.alpha;
      if (alpha <= 0.01 || r <= 0.5) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      /* 1. cast shadow, offset down and slightly squashed */
      ctx.save();
      ctx.translate(x, y + r * 0.13);
      ctx.scale(1, 0.92);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = T.bubbleShadow;
      ctx.filter = 'none';
      ctx.fill();
      ctx.restore();

      /* 2. rim ring */
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = pal.rim;
      ctx.fill();

      /* 3. graded face, inset by the rim width */
      var inner = r * 0.9;
      var g = ctx.createLinearGradient(x, y - inner, x, y + inner);
      g.addColorStop(0, pal.light);
      g.addColorStop(0.42, pal.face);
      g.addColorStop(1, pal.mid);
      ctx.beginPath();
      ctx.arc(x, y, inner, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      /* 4. specular highlight, up and to the left */
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, inner, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(x - r * 0.26, y - r * 0.46, r * 0.40, r * 0.22, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.19)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + r * 0.1, y + r * 0.62, r * 0.62, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fill();
      ctx.restore();

      /* 4b. a white ring, marking the answer that was right all along.

         The true-or-false bubbles are coloured by their answer — yellow for
         thumbs up, red for thumbs down — which spends both of the colours the
         rest of the game turns a bubble to say "wrong" and "this was the right
         one". So they say it with a ring instead. It is the one signal that
         works whatever colour the bubble underneath it already was.

         It rides just inside the rim rather than closer in, so that it clears
         the hand: the two are both white, and a ring crossing the thumb merges
         into it and stops reading as a ring at all. */
      if (opts.marked) {
        ctx.beginPath();
        ctx.arc(x, y, inner * 0.94, 0, Math.PI * 2);
        ctx.strokeStyle = T.white;
        ctx.lineWidth = Math.max(2, r * 0.07);
        ctx.stroke();
      }

      /* 5a. a thumb, when the bubble is an answer to a true-or-false
             question rather than a number */
      if (opts.glyph) {
        thumb(ctx, x, y + r * 0.09, r, opts.glyph, 'rgba(0,0,0,0.22)');
        thumb(ctx, x, y, r, opts.glyph, T.white);
        ctx.restore();
        return;
      }

      /* 5b. the number */
      if (value != null) {
        var label = String(value);
        var size = r * (label.length >= 3 ? 0.74 : 0.92);
        ctx.font = '600 ' + size + 'px ' + T.font;
        // Shrink until it clears the rim with a little air either side.
        var maxWidth = inner * 1.62;
        var guard = 0;
        while (ctx.measureText(label).width > maxWidth && guard++ < 12) {
          size *= 0.92;
          ctx.font = '600 ' + size + 'px ' + T.font;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillText(label, x, y + size * 0.10);
        ctx.fillStyle = T.white;
        ctx.fillText(label, x, y + size * 0.04);
      }

      ctx.restore();
    },

    /* The vine a swinging bubble hangs from. Bowed slightly away from the
       swing so it reads as a rope under load rather than a drawn line. */
    drawTether: function (ctx, x1, y1, x2, y2, alpha) {
      if (alpha <= 0.01) return;
      var mx = (x1 + x2) / 2;
      var my = (y1 + y2) / 2;
      var sag = (x2 - x1) * 0.12;

      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = T.vine;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx - sag, my, x2, y2);
      ctx.stroke();

      // A knot where it meets the top edge, so it looks tied to something.
      ctx.fillStyle = T.leafDark;
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    /* The expanding ring left behind when a bubble is popped. */
    drawRing: function (ctx, x, y, r, alpha, color) {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color || T.bubbleLight;
      ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };
})(window.NP = window.NP || {});
