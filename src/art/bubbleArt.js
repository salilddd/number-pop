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
      ctx.ellipse(x - r * 0.28, y - r * 0.44, r * 0.46, r * 0.28, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + r * 0.1, y + r * 0.62, r * 0.62, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fill();
      ctx.restore();

      /* 5. the number */
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
