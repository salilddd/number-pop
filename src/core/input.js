/* Pointer handling for the play field.

   Tap and swipe deliberately share one path. A tap is resolved on
   pointerdown rather than click — click adds a perceptible delay on touch
   and makes the whole game feel mushy. A swipe is resolved by testing the
   segment travelled since the last move event against each bubble, so
   dragging a finger through a bubble counts exactly like tapping it. */
(function (NP) {
  'use strict';

  var canvas = null;
  var handlers = { onTap: null, onSwipe: null };
  var enabled = true;
  var down = false;
  var lastX = 0, lastY = 0;
  var activePointer = null;

  /* Pointer position in CSS pixels relative to the canvas. Physics runs in
     the same space, so nothing here needs to know about devicePixelRatio. */
  function localPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e) {
    if (!enabled || down) return;
    activePointer = e.pointerId;
    down = true;
    var p = localPoint(e);
    lastX = p.x; lastY = p.y;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    }
    if (handlers.onTap) handlers.onTap(p.x, p.y);
  }

  function onMove(e) {
    if (!enabled || !down || e.pointerId !== activePointer) return;
    var p = localPoint(e);
    // Ignore sub-pixel jitter so a shaky finger on a tap doesn't fire swipes.
    var dx = p.x - lastX, dy = p.y - lastY;
    if (dx * dx + dy * dy < 9) return;
    if (handlers.onSwipe) handlers.onSwipe(lastX, lastY, p.x, p.y);
    lastX = p.x; lastY = p.y;
  }

  function onUp(e) {
    if (e.pointerId !== activePointer) return;
    down = false;
    activePointer = null;
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    }
  }

  NP.input = {
    attach: function (canvasEl, opts) {
      canvas = canvasEl;
      handlers.onTap = opts.onTap || null;
      handlers.onSwipe = opts.onSwipe || null;

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('pointerleave', onUp);

      // Belt and braces alongside `touch-action: none` in the stylesheet:
      // without this some Android browsers still claim the gesture as a scroll.
      canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    },

    /* Gate input during the pause between questions so a fast double-tap
       cannot answer the next question before the child has read it. */
    setEnabled: function (on) {
      enabled = !!on;
      if (!on) { down = false; activePointer = null; }
    },

    isEnabled: function () { return enabled; },

    /* Shortest distance from a point to a segment, squared.
       Used for swipe hit-testing against bubbles. */
    segmentDistanceSq: function (x1, y1, x2, y2, px, py) {
      var dx = x2 - x1, dy = y2 - y1;
      var lenSq = dx * dx + dy * dy;
      var t = 0;
      if (lenSq > 1e-6) {
        t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
      }
      var cx = x1 + t * dx - px;
      var cy = y1 + t * dy - py;
      return cx * cx + cy * cy;
    }
  };
})(window.NP = window.NP || {});
