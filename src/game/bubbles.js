/* Bubble entities and their physics.

   Four details separate a good feel from a broken one, and all four are
   easy to leave out:
     1. De-overlap positionally as well as with impulse, or contacting
        circles interpenetrate and buzz against each other.
     2. Clamp speed into a band — collisions otherwise drain a bubble to a
        standstill or compound into a rocket.
     3. Clamp dt (handled in core/loop.js) so a backgrounded tab does not
        teleport everything through a wall.
     4. Scale the radius to the play area, never to fixed pixels, so one
        tuning pass covers phone, tablet and desktop. */
(function (NP) {
  'use strict';

  var rng = NP.rng;

  var RESTITUTION = 0.98;
  var SPEED_MIN = 0.6;          // as a fraction of the difficulty's base speed
  var SPEED_MAX = 1.6;
  var SPAWN_IN = 0.3;           // seconds for the grow-in animation
  var POP_TIME = 0.34;
  var FADE_TIME = 0.45;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* Slight overshoot on the way in, so bubbles arrive with a bounce. */
  function easeOutBack(t) {
    var c1 = 1.9, c3 = c1 + 1;
    var p = t - 1;
    return 1 + c3 * p * p * p + c1 * p * p;
  }

  function radiusFor(count, rect) {
    var w = rect.right - rect.left;
    var h = rect.bottom - rect.top;
    var area = Math.max(1, w * h);
    var r = Math.sqrt(area * 0.15 / (count * Math.PI));
    r = Math.min(r, w / 2.7);            // never wider than ~37% of the field
    r = Math.min(r, h / 3.2);
    return clamp(r, 24, 78);
  }

  NP.bubbles = {
    radiusFor: radiusFor,

    /* Build the bubble set for one question. `values[0]` must be the
       correct answer; the caller has already shuffled display order. */
    spawn: function (values, correctValue, rect, baseSpeed) {
      var count = values.length;
      var r = radiusFor(count, rect);
      var list = [];

      for (var i = 0; i < count; i++) {
        var pos = findSpot(list, r, rect);
        var angle = rng.float(0, Math.PI * 2);
        list.push({
          x: pos.x,
          y: pos.y,
          vx: Math.cos(angle) * baseSpeed,
          vy: Math.sin(angle) * baseSpeed,
          r: r,
          baseR: r,
          value: values[i],
          correct: values[i] === correctValue,
          state: 'alive',
          t: 0,
          age: 0,
          alpha: 1,
          scale: 0,
          wobble: rng.float(0, Math.PI * 2)
        });
      }
      return list;
    },

    update: function (list, dt, rect, baseSpeed) {
      var i, j, b;

      for (i = 0; i < list.length; i++) {
        b = list[i];
        b.age += dt;

        // grow-in
        b.scale = b.age >= SPAWN_IN ? 1 : easeOutBack(b.age / SPAWN_IN);

        if (b.state === 'alive' || b.state === 'reveal') {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.wobble += dt * 2.2;

          // walls
          if (b.x - b.r < rect.left)   { b.x = rect.left + b.r;   b.vx = Math.abs(b.vx); }
          if (b.x + b.r > rect.right)  { b.x = rect.right - b.r;  b.vx = -Math.abs(b.vx); }
          if (b.y - b.r < rect.top)    { b.y = rect.top + b.r;    b.vy = Math.abs(b.vy); }
          if (b.y + b.r > rect.bottom) { b.y = rect.bottom - b.r; b.vy = -Math.abs(b.vy); }

        } else if (b.state === 'popped') {
          b.t += dt;
          var pt = clamp(b.t / POP_TIME, 0, 1);
          b.scale = 1 + pt * 0.55;
          b.alpha = 1 - pt;

        } else if (b.state === 'wrong' || b.state === 'fading') {
          b.t += dt;
          var ft = clamp(b.t / FADE_TIME, 0, 1);
          b.scale = 1 - ft * 0.35;
          b.alpha = 1 - ft;
          b.y += 40 * dt * ft;          // sinks as it goes
        }
      }

      // pairwise collisions, alive bubbles only
      for (i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.state !== 'alive' && a.state !== 'reveal') continue;
        for (j = i + 1; j < list.length; j++) {
          b = list[j];
          if (b.state !== 'alive' && b.state !== 'reveal') continue;
          resolvePair(a, b);
        }
      }

      // keep speeds in a believable band
      var lo = baseSpeed * SPEED_MIN;
      var hi = baseSpeed * SPEED_MAX;
      for (i = 0; i < list.length; i++) {
        b = list[i];
        if (b.state !== 'alive' && b.state !== 'reveal') continue;
        var sp = Math.hypot(b.vx, b.vy);
        if (sp < 1e-4) {
          var ang = rng.float(0, Math.PI * 2);
          b.vx = Math.cos(ang) * lo;
          b.vy = Math.sin(ang) * lo;
        } else if (sp < lo || sp > hi) {
          var target = clamp(sp, lo, hi);
          b.vx = b.vx / sp * target;
          b.vy = b.vy / sp * target;
        }
      }

      // drop finished bubbles
      for (i = list.length - 1; i >= 0; i--) {
        b = list[i];
        if ((b.state === 'popped' && b.t >= POP_TIME) ||
            ((b.state === 'wrong' || b.state === 'fading') && b.t >= FADE_TIME)) {
          list.splice(i, 1);
        }
      }
    },

    /* Point test, nearest centre first so overlapping bubbles resolve
       to the one the finger is most clearly on. */
    hitAtPoint: function (list, x, y) {
      var best = null;
      var bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (b.state !== 'alive') continue;
        var dx = x - b.x, dy = y - b.y;
        var d = dx * dx + dy * dy;
        if (d <= b.r * b.r && d < bestD) { bestD = d; best = b; }
      }
      return best;
    },

    /* Segment test for swipes: dragging through a bubble counts as tapping it. */
    hitOnSegment: function (list, x1, y1, x2, y2) {
      var best = null;
      var bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (b.state !== 'alive') continue;
        var d = NP.input.segmentDistanceSq(x1, y1, x2, y2, b.x, b.y);
        if (d <= b.r * b.r && d < bestD) { bestD = d; best = b; }
      }
      return best;
    },

    pop: function (b) { b.state = 'popped'; b.t = 0; },
    markWrong: function (b) { b.state = 'wrong'; b.t = 0; },
    fade: function (b) { if (b.state === 'alive') { b.state = 'fading'; b.t = 0; } },
    reveal: function (b) { b.state = 'reveal'; b.t = 0; }
  };

  /* Equal-mass elastic collision with positional correction. */
  function resolvePair(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var distSq = dx * dx + dy * dy;
    var minDist = a.r + b.r;

    if (distSq >= minDist * minDist) return;

    var dist = Math.sqrt(distSq);
    if (dist < 1e-6) {
      // Perfectly concentric: nudge apart along a random axis so the
      // normal below is well defined.
      var ang = rng.float(0, Math.PI * 2);
      dx = Math.cos(ang); dy = Math.sin(ang); dist = 0.001;
    }

    var nx = dx / dist;
    var ny = dy / dist;

    // 1. push apart so they stop interpenetrating
    var overlap = (minDist - dist) / 2;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;

    // 2. exchange velocity along the collision normal
    var rvx = b.vx - a.vx;
    var rvy = b.vy - a.vy;
    var vn = rvx * nx + rvy * ny;
    if (vn > 0) return;                 // already separating

    var impulse = -(1 + RESTITUTION) * vn / 2;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }

  /* Rejection sampling for non-overlapping start positions. After enough
     failures the separation requirement relaxes rather than looping
     forever — a small field with six bubbles genuinely cannot satisfy it. */
  function findSpot(existing, r, rect) {
    var pad = r + 4;
    var minX = rect.left + pad;
    var maxX = rect.right - pad;
    var minY = rect.top + pad;
    var maxY = rect.bottom - pad;

    if (maxX < minX) { minX = maxX = (rect.left + rect.right) / 2; }
    if (maxY < minY) { minY = maxY = (rect.top + rect.bottom) / 2; }

    for (var attempt = 0; attempt < 120; attempt++) {
      var relax = attempt < 30 ? 1.18 : (attempt < 70 ? 1.05 : 0.92);
      var x = rng.float(minX, maxX);
      var y = rng.float(minY, maxY);
      var ok = true;

      for (var i = 0; i < existing.length; i++) {
        var e = existing[i];
        var need = (e.r + r) * relax;
        var dx = x - e.x, dy = y - e.y;
        if (dx * dx + dy * dy < need * need) { ok = false; break; }
      }
      if (ok) return { x: x, y: y };
    }

    return { x: rng.float(minX, maxX), y: rng.float(minY, maxY) };
  }
})(window.NP = window.NP || {});
