/* Canvas setup and the per-frame draw.

   The chalkboard and its props are pre-rendered once per resize into an
   offscreen canvas, so a frame costs one drawImage plus the live bubbles
   and particles. */
(function (NP) {
  'use strict';

  var canvas = null;
  var ctx = null;
  var width = 0, height = 0, dpr = 1;

  /* bubbles.js sets edgeFade for the modes that stage bubbles outside the
     play rect, so they slide into view instead of being painted over the
     question and the score. Every other mode leaves it at 1. */
  function alphaOf(b) {
    return b.edgeFade == null ? b.alpha : b.alpha * b.edgeFade;
  }

  NP.render = {
    init: function (canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d', { alpha: false });
      NP.render.resize();
    },

    /* Match the backing store to the element's CSS size times the device
       pixel ratio, or everything is soft on a phone. Capped at 2 — a 3x
       backing store on a large phone costs fill rate for no visible gain. */
    resize: function () {
      var rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      NP.scenery.build(width, height, dpr);
      NP.garden.build(width, height);
      NP.playthings.build(width, height);

      return { width: width, height: height };
    },

    size: function () { return { width: width, height: height }; },

    /* The area bubbles may occupy: below the question, inside a small
       margin, running all the way to the bottom edge so they drift over
       the crates the way they do in the real game. */
    playRect: function (topPx) {
      return {
        left: 8,
        top: topPx,
        right: width - 8,
        bottom: height - 8
      };
    },

    frame: function (state) {
      if (!ctx) return;

      NP.scenery.drawBoard(ctx);
      if (state.showCanopy) NP.scenery.drawCanopy(ctx);

      // The jungle the player has grown. Over the baked props, because it
      // grows on top of the crates and the sack as well as out of the floor;
      // under everything a finger can reach, because it is scenery.
      NP.garden.draw(ctx);

      // Over the canopy, so plucked leaves sit on the vines they hang from;
      // under the bubbles, so a drifting bubble is still the topmost thing a
      // finger can land on. No-ops on the screens where nothing is live.
      NP.playthings.draw(ctx);

      // The run's progress vine and banana pile are scenery, so they go
      // behind everything the player can touch.
      if (state.progress && state.rect) {
        NP.progressArt.draw(ctx, state.rect, state.progress);
      }

      var list = state.bubbles || [];
      var i, b;

      // Vines first, as one pass, so no bubble is ever drawn under the rope
      // belonging to the bubble next to it.
      for (i = 0; i < list.length; i++) {
        b = list[i];
        if (!b.tether || b.scale <= 0.01) continue;
        NP.bubbleArt.drawTether(ctx, b.tether.x, b.tether.y, b.x, b.y, alphaOf(b));
      }

      for (i = 0; i < list.length; i++) {
        b = list[i];
        if (b.scale <= 0.01) continue;

        var alpha = alphaOf(b);
        if (alpha <= 0.01) continue;

        /* The true-or-false pair is coloured by its answer — yellow for the
           thumbs up, red for the thumbs down — so the two read apart from
           across the room, before the icons themselves resolve.

           That spends both of the colours every other bubble uses for
           feedback, so those two report back with a white ring instead:
           turning an already-red bubble red says nothing. */
        var palette = 'green';
        var marked = false;
        if (b.glyph) {
          palette = b.glyph === 'yes' ? 'reveal' : 'wrong';
          marked = b.state === 'reveal';
        } else if (b.state === 'wrong') {
          palette = 'wrong';
        } else if (b.state === 'reveal') {
          palette = 'reveal';
        }

        // A slow breathing wobble keeps the field alive even when a bubble
        // happens to be drifting straight.
        var wobble = 1 + Math.sin(b.wobble) * 0.012;

        NP.bubbleArt.draw(ctx, b.x, b.y, b.r * b.scale * wobble, b.value, {
          palette: palette,
          marked: marked,
          alpha: alpha,
          // Set on the two bubbles of a true-or-false question; every other
          // bubble leaves it undefined and shows its number.
          glyph: b.glyph
        });
      }

      NP.effects.draw(ctx);
    }
  };
})(window.NP = window.NP || {});
