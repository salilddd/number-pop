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
