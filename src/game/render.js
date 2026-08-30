/* Canvas setup and the per-frame draw.

   The chalkboard, the crates and the canopy are pre-rendered once per resize
   into offscreen layers, so a frame costs three drawImage calls plus the live
   bubbles and particles.

   There are two canvases. On the menus a contrast scrim sits between them, so
   the background can be muted for the sake of the title while the crates and
   everything standing on them stay at full strength. In a run the second
   canvas is unused and the draw collapses to a single pass. */
(function (NP) {
  'use strict';

  var canvas = null;
  var ctx = null;

  /* The second canvas, which sits above the home screen's scrim. Only the
     live props go on it, and only on the menus: in a run there is no scrim
     to clear, and the bubbles have to stay the topmost thing a finger can
     land on. */
  var front = null, fctx = null;

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
      front = document.getElementById('stage-front');
      fctx = front.getContext('2d');
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
      front.width = canvas.width;
      front.height = canvas.height;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

      /* Two planes, split by the home screen's contrast scrim.

         Background — the board, the hanging canopy and the bubbles drifting
         through the air — stays on the main canvas, behind the scrim, and
         goes on being muted by it.

         Foreground — the crates and the sack, the jungle growing on them and
         everything standing on them — goes to the front canvas, in front of
         the scrim, at full strength. Keeping the crates in this group is what
         stops a bubble sliding between a crate and the bomb resting on it.

         In a run there is no scrim and no second plane: `live` is the main
         canvas, the order below collapses to the single pass it always was,
         and the bubbles stay on top of everything so a drifting bubble is
         still the topmost thing a finger can land on. */
      var menus = !!state.showCanopy;
      var live = menus ? fctx : ctx;
      fctx.clearRect(0, 0, width, height);

      NP.scenery.drawBoard(ctx);
      if (menus) {
        NP.scenery.drawCanopy(ctx);
        drawBubbles(ctx, state);
      }

      NP.scenery.drawProps(live);

      // No-ops on the screens where nothing is live.
      NP.playthings.draw(live);

      /* The jungle the player has grown, in front of the gorilla rather than
         behind him.

         Behind him it was very nearly invisible: his torso is an opaque fill
         across the middle of the board, and ten of the fourteen floor plots
         sat inside it — including three of the first four bananas a child
         ever earns. A reward you cannot see is not a reward, and the garden
         is the only thing a banana buys.

         Drawing it last makes it the foreground planting band, which is what
         the scene already did for the two fronds at his feet in playthings.
         He stands among his jungle instead of in front of it. */
      NP.garden.draw(live);

      // The run's progress vine and banana pile are scenery, so they go
      // behind everything the player can touch.
      if (state.progress && state.rect) {
        NP.progressArt.draw(live, state.rect, state.progress);
      }

      if (!menus) drawBubbles(ctx, state);

      // Particles follow whatever threw them — a firefly's sparkle has to
      // come out in front of the scrim alongside the firefly itself.
      NP.effects.draw(live);
    }
  };

  /* The bubble field, as one pass. Pulled out of frame() because the menus
     and a run put it on opposite sides of the foreground. */
  function drawBubbles(ctx, state) {
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
  }
})(window.NP = window.NP || {});
