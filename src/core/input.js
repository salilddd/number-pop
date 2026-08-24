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

  /* Where the pointer is, and how long it has been held. Polled rather than
     pushed: the interactive scenery wants this every frame anyway (the
     gorilla's eyes follow it), and a callback per mousemove would be a lot
     of noise for something read once a frame. */
  var atX = 0, atY = 0;
  var seen = false;
  var heldFor = 0;
  var pressX = 0, pressY = 0;
  var pressMoved = false;
  var pressStart = 0;

  /* Pointer position in CSS pixels relative to the canvas. Physics runs in
     the same space, so nothing here needs to know about devicePixelRatio. */
  function localPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function track(p) {
    atX = p.x; atY = p.y;
    seen = true;
  }

  function onDown(e) {
    if (!enabled || down) return;
    activePointer = e.pointerId;
    down = true;
    var p = localPoint(e);
    lastX = p.x; lastY = p.y;
    track(p);
    pressX = p.x; pressY = p.y;
    pressMoved = false;
    pressStart = (window.performance && window.performance.now)
      ? window.performance.now() : Date.now();
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    }
    if (handlers.onTap) handlers.onTap(p.x, p.y);
  }

  function onMove(e) {
    if (!enabled) return;

    // Hover is tracked even with no button down — that is the whole point of
    // it — so this runs before the drag check below.
    var p = localPoint(e);
    track(p);

    if (down && e.pointerId === activePointer) {
      var mx = p.x - pressX, my = p.y - pressY;
      // A press that wandered this far was a drag, not a hold.
      if (mx * mx + my * my > 14 * 14) pressMoved = true;
    }

    if (!down || e.pointerId !== activePointer) return;
    // Ignore sub-pixel jitter so a shaky finger on a tap doesn't fire swipes.
    var dx = p.x - lastX, dy = p.y - lastY;
    if (dx * dx + dy * dy < 9) return;
    if (handlers.onSwipe) handlers.onSwipe(lastX, lastY, p.x, p.y);
    lastX = p.x; lastY = p.y;
  }

  function onUp(e) {
    if (e.pointerId !== activePointer) return;
    down = false;
    heldFor = 0;
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
      if (!on) { down = false; activePointer = null; heldFor = 0; }
    },

    isEnabled: function () { return enabled; },

    /* Last known pointer position in canvas CSS pixels, or null before the
       pointer has ever been seen — a touch device reports nothing at all
       until the first tap, and callers must not aim at 0,0 in the meantime. */
    pointer: function () {
      return seen ? { x: atX, y: atY } : null;
    },

    /* The current press, or null. `held` is seconds so far; `moved` says the
       finger wandered far enough that this is a drag rather than a hold. */
    press: function () {
      if (!down) return null;
      var now = (window.performance && window.performance.now)
        ? window.performance.now() : Date.now();
      heldFor = (now - pressStart) / 1000;
      return { x: pressX, y: pressY, held: heldFor, moved: pressMoved };
    },

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
