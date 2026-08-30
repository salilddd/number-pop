/* How bubbles move, one object per behaviour.

   Every level picks a mode from here and bubbles.js delegates to it, so
   adding a new way for bubbles to travel never touches the physics loop,
   the hit tests or the render path.

   A mode is:
     staged     – true if place() puts bubbles outside the play rect
     walls      – 'bounce' | 'sides' | 'topbottom' | 'none'
     collide    – run the pairwise elastic collision pass
     clampSpeed – hold speed inside the difficulty's band. MUST be false for
                  anything gravity-driven, or the clamp renormalises the
                  velocity every frame and flattens the arc into a straight
                  line at constant speed.
     place(b, i, count, rect, cfg, shared)  – initial position/velocity
     step(b, dt, rect, cfg)                 – owns b.x and b.y this frame
     escaped(b, rect)                       – optional; bubble has left play
     progress(b, rect)                      – optional; 0..1 toward escaping

   `cfg` is the merged level tuning: { speed, clock, wind, ... }. `cfg.clock`
   is the seconds a question is worth at this level's pressure, and every mode
   that has a journey solves its own speed from it — which is what lets the
   ladder compare a volley with a downpour.
   `shared` is one object per spawn that every bubble in the set can see, for
   things the whole set must agree on (which way the river flows). */
(function (NP) {
  'use strict';

  var rng = NP.rng;
  var TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* Evenly spaced columns across the field, shuffled so the correct answer
     is not always in the same lane.

     Pass `ordered` to get them left-to-right instead. Only swing wants that,
     because it alternates hanging heights by index: with a shuffled list two
     bubbles on the same tier could land in neighbouring columns and overlap.
     Nothing is lost by ordering them — the caller shuffled the values before
     spawning, so which column holds the answer is already random. */
  function columns(count, rect, r, ordered) {
    var pad = r + 8;
    var lo = rect.left + pad;
    var hi = rect.right - pad;
    if (hi < lo) { lo = hi = (rect.left + rect.right) / 2; }
    var step = (hi - lo) / Math.max(1, count);
    var out = [];
    for (var i = 0; i < count; i++) out.push(lo + step * (i + 0.5));
    return ordered ? out : rng.shuffle(out);
  }

  function rows(count, rect, r) {
    var pad = r + 8;
    var lo = rect.top + pad;
    var hi = rect.bottom - pad;
    if (hi < lo) { lo = hi = (rect.top + rect.bottom) / 2; }
    var step = (hi - lo) / Math.max(1, count);
    var out = [];
    for (var i = 0; i < count; i++) out.push(lo + step * (i + 0.5));
    return rng.shuffle(out);
  }

  /* Crossing speed that gets a bubble over the field in cfg.clock seconds
     regardless of screen size — a phone and a desktop must give a child the
     same amount of thinking time. */
  function crossSpeed(distance, cfg) {
    return distance / clockOf(cfg);
  }

  function clockOf(cfg) {
    return Math.max(0.6, (cfg && cfg.clock) || 5);
  }

  /* How far back to hold bubble `i` so the set arrives as a stream rather
     than a wall. Expressed as a fraction of the crossing distance, not as a
     multiple of the radius: the last bubble in a set of five was otherwise
     four seconds behind the first, and if it happened to be the answer the
     child spent most of the question waiting. */
  var ENTRY_SPREAD = 0.26;

  function stagger(i, count, distance) {
    if (count < 2) return 0;
    return (i / (count - 1)) * distance * ENTRY_SPREAD;
  }

  function fieldW(rect) { return rect.right - rect.left; }
  function fieldH(rect) { return rect.bottom - rect.top; }

  /* ------------------------------------------------------------- drift */

  var drift = {
    staged: false,
    walls: 'bounce',
    collide: true,
    clampSpeed: true,

    place: function (b, i, count, rect, cfg) {
      var a = rng.float(0, TAU);
      b.vx = Math.cos(a) * cfg.speed;
      b.vy = Math.sin(a) * cfg.speed;
    },

    step: function (b, dt) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
  };

  /* -------------------------------------------------------------- rain
     Falls from above the top edge. The descent is the clock, so the speed
     comes from cfg.clock rather than from the drift speed. A little sway
     keeps it from looking like a spreadsheet. */

  var rain = {
    staged: true,
    walls: 'none',
    collide: false,
    clampSpeed: false,

    pre: function (list, dt, rect, cfg, shared) {
      if (cfg.wind) shared.windT = (shared.windT || 0) + dt;
    },

    place: function (b, i, count, rect, cfg, shared) {
      if (!shared.cols) {
        shared.cols = columns(count, rect, b.r);
        shared.gust = rng.float(0, TAU);
        shared.windT = 0;
      }
      var dist = fieldH(rect) + b.r * 2;
      b.homeX = shared.cols[i];
      b.x = b.homeX;
      // Staggered above the top edge so they arrive in a readable stream.
      b.y = rect.top - b.r - stagger(i, count, dist);
      b.vx = 0;
      b.vy = crossSpeed(dist, cfg);
      b.sway = rng.float(0, TAU);
      b.swayAmp = rng.float(5, 14);
    },

    step: function (b, dt, rect, cfg) {
      b.y += b.vy * dt;
      b.sway += dt * 1.5;
      var gust = cfg.wind
        ? Math.sin(b.shared.windT * 0.5 + b.shared.gust) * b.r * 1.1
        : 0;
      b.x = clamp(b.homeX + Math.sin(b.sway) * b.swayAmp + gust,
                  rect.left + b.r, rect.right - b.r);
    },

    escaped: function (b, rect) { return b.y - b.r > rect.bottom; },

    progress: function (b, rect) {
      return clamp((b.y - rect.top) / Math.max(1, fieldH(rect)), 0, 1);
    }
  };

  /* ------------------------------------------------------------- fizz
     Rain upside down: rises from below and escapes out of the top. */

  var fizz = {
    staged: true,
    walls: 'none',
    collide: false,
    clampSpeed: false,

    place: function (b, i, count, rect, cfg, shared) {
      if (!shared.cols) shared.cols = columns(count, rect, b.r);
      var dist = fieldH(rect) + b.r * 2;
      b.homeX = shared.cols[i];
      b.x = b.homeX;
      b.y = rect.bottom + b.r + stagger(i, count, dist);
      b.vx = 0;
      b.vy = -crossSpeed(dist, cfg);
      b.sway = rng.float(0, TAU);
      b.swayAmp = rng.float(6, 16);
    },

    step: function (b, dt, rect) {
      b.y += b.vy * dt;
      b.sway += dt * 2.1;
      b.x = clamp(b.homeX + Math.sin(b.sway) * b.swayAmp, rect.left + b.r, rect.right - b.r);
    },

    escaped: function (b, rect) { return b.y + b.r < rect.top; },

    progress: function (b, rect) {
      return clamp(1 - (b.y - rect.top) / Math.max(1, fieldH(rect)), 0, 1);
    }
  };

  /* ------------------------------------------------------------ volley
     Lobbed up from below, arcing under gravity and falling back out. Both
     the launch speed and the gravity are solved from the target apex and
     cfg.clock, so every bubble clears the same height and takes the same
     time to do it no matter how tall the screen is.

     Gravity used to be a number the level authored, which left the volley as
     the one mode the ladder could not compare with anything else: at the
     level it was introduced on its arc ran about three seconds against the
     five its neighbours were giving, so it was harder than the boss before
     it. A round trip under constant gravity takes 2*sqrt(2*rise/g), so the
     gravity that fits a clock of t is 8*rise/t². */

  var volley = {
    staged: true,
    walls: 'sides',
    collide: false,
    clampSpeed: false,

    place: function (b, i, count, rect, cfg, shared) {
      if (!shared.cols) shared.cols = columns(count, rect, b.r);
      b.homeX = shared.cols[i];
      b.x = b.homeX;
      b.y = rect.bottom + b.r;

      var apexY = rect.top + fieldH(rect) * rng.float(0.10, 0.30);
      var rise = Math.max(40, b.y - apexY);
      var t = clockOf(cfg);

      // Kept on the bubble rather than read from cfg every frame, so a
      // resize mid-flight cannot bend an arc that is already in the air.
      b.g = 8 * rise / (t * t);

      b.vy = -Math.sqrt(2 * b.g * rise);
      // A gentle lean toward the middle, so nothing hugs the edge.
      var toCentre = (rect.left + rect.right) / 2 - b.x;
      b.vx = clamp(toCentre * 0.22, -70, 70);
      b.delay = i * 0.28;
    },

    step: function (b, dt) {
      if (b.delay > 0) { b.delay -= dt; return; }
      b.vy += (b.g || 520) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    },

    escaped: function (b, rect) { return b.entered && b.y - b.r > rect.bottom; },

    progress: function (b, rect) {
      // Only the fall back down is dangerous, so the bar holds full on the
      // way up and drains on the way down.
      if (b.vy <= 0) return 0;
      return clamp((b.y - rect.top) / Math.max(1, fieldH(rect)), 0, 1);
    }
  };

  /* ------------------------------------------------------------- river
     Enters from one side and leaves by the other. All bubbles in a set
     agree on the direction, which is what `shared` is for. */

  var river = {
    staged: true,
    walls: 'topbottom',
    collide: false,
    clampSpeed: false,

    place: function (b, i, count, rect, cfg, shared) {
      if (!shared.rows) {
        shared.rows = rows(count, rect, b.r);
        shared.dir = rng.bool() ? 1 : -1;
      }
      var dist = fieldW(rect) + b.r * 2;
      b.y = shared.rows[i];
      var offset = b.r + stagger(i, count, dist);
      b.x = shared.dir > 0 ? rect.left - offset : rect.right + offset;
      b.vx = shared.dir * crossSpeed(dist, cfg);
      b.vy = rng.float(-14, 14);
    },

    step: function (b, dt) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    },

    escaped: function (b, rect) {
      return b.shared.dir > 0 ? b.x - b.r > rect.right : b.x + b.r < rect.left;
    },

    progress: function (b, rect) {
      var p = (b.x - rect.left) / Math.max(1, fieldW(rect));
      return clamp(b.shared.dir > 0 ? p : 1 - p, 0, 1);
    }
  };

  /* ---------------------------------------------------------- carousel
     Positional rather than velocity-driven: the angle is the state and
     x/y are derived, so a resize just moves the ring. Slightly elliptical
     because the play field is usually taller than it is wide. */

  var carousel = {
    staged: true,
    walls: 'none',
    collide: false,
    clampSpeed: false,
    positional: true,

    /* The constant is deliberately small next to the speed term. A carousel
       never lets a bubble escape, so the ring is the only thing the ramp can
       show; with the old `0.30 + speed/260` the whole ladder moved it by
       four tenths of a turn a second and the last carousel looked like the
       first. */
    place: function (b, i, count, rect, cfg, shared) {
      if (shared.spin == null) {
        shared.spin = (rng.bool() ? 1 : -1) * (0.16 + cfg.speed / 150);
      }
      b.angle = (i / count) * TAU + rng.float(-0.12, 0.12);
      b.spin = shared.spin;
    },

    step: function (b, dt, rect) {
      // Winds up slowly through the question so the last few seconds bite.
      b.spin *= 1 + dt * 0.055;
      b.angle += b.spin * dt;

      var cx = (rect.left + rect.right) / 2;
      var cy = (rect.top + rect.bottom) / 2;
      var rx = Math.max(10, fieldW(rect) / 2 - b.r - 10);
      var ry = Math.max(10, fieldH(rect) / 2 - b.r - 10);
      var rad = Math.min(rx, ry / 0.74);

      b.x = cx + Math.cos(b.angle) * rad;
      b.y = cy + Math.sin(b.angle) * rad * 0.74;
    }
  };

  /* ------------------------------------------------------------- swing
     Pendulums hanging from the top edge. Each keeps its pivot so the
     renderer can draw the vine it hangs from. */

  var swing = {
    staged: true,
    walls: 'none',
    collide: false,
    clampSpeed: false,
    positional: true,

    place: function (b, i, count, rect, cfg, shared) {
      if (!shared.cols) shared.cols = columns(count, rect, b.r * 0.5, true);
      var h = fieldH(rect);

      /* Two hanging tiers, alternating by column — which is why the columns
         above are left-to-right rather than shuffled. With five bubbles the
         columns are narrower than a bubble is wide, so hanging them all at
         the same height would guarantee overlap however the vines are
         spaced; separating them vertically is the only thing that works. */
      var len = clamp(h * (i % 2 ? 0.62 : 0.30),
                      b.r * 1.5, Math.max(b.r * 1.5, h - b.r - 12));

      b.tether = { x: shared.cols[i], y: rect.top + 2 };
      b.len = len;

      /* Swing far enough to be alive, not so far as to cross into the next
         column: two bubbles on the same tier are two columns apart, and
         both are swinging toward each other at the worst moment. */
      var spacing = (fieldW(rect) - b.r * 2) / Math.max(1, count);
      var lateral = Math.min(spacing * 0.35, b.r * 1.2);
      b.amp = Math.asin(clamp(lateral / len, 0.06, 0.55));

      b.phase = rng.float(0, TAU);
      /* A real pendulum: shorter vines swing faster, which reads as alive.
         The speed term carries most of it, for the same reason the carousel's
         does — the old `0.85 + speed/900` moved the swing by seven per cent
         across the entire ladder, so a level that authored itself as 15%
         faster was in practice not faster at all. */
      b.w = Math.sqrt(900 / len) * (0.35 + cfg.speed / 120);

      b.x = b.tether.x;
      b.y = b.tether.y + len;
    },

    step: function (b, dt, rect) {
      b.phase += b.w * dt;
      var a = b.amp * Math.sin(b.phase);
      // Keep the pivot valid across a resize.
      b.tether.y = rect.top + 2;
      var len = Math.min(b.len, Math.max(b.r * 1.6, fieldH(rect) - b.r - 12));
      b.x = clamp(b.tether.x + Math.sin(a) * len, rect.left + b.r, rect.right - b.r);
      b.y = b.tether.y + Math.cos(a) * len;
    }
  };

  /* ----------------------------------------------------------- deflate
     Drifts normally but shrinks away to nothing. Another spatial clock,
     with no bubble ever leaving the field. */

  var DEFLATE_START = 1.25;

  var deflate = {
    staged: false,
    walls: 'bounce',
    collide: true,
    clampSpeed: true,
    // Start oversized. Applied before placement, or findSpot would pack them
    // at the normal radius and they would spawn already overlapping.
    radiusMul: DEFLATE_START,

    place: function (b, i, count, rect, cfg) {
      drift.place(b, i, count, rect, cfg);
      b.deflateFrom = b.r;
      b.deflateTo = Math.max(11, b.r * 0.3);
      b.deflateRate = (b.deflateFrom - b.deflateTo) / clockOf(cfg);
    },

    step: function (b, dt, rect) {
      drift.step(b, dt, rect);
      if (b.r > b.deflateTo) {
        b.r = Math.max(b.deflateTo, b.r - b.deflateRate * dt);
        // baseR too, or the next resize inflates it back (main.clampInto
        // restores r from baseR).
        b.baseR = b.r;
      }
    },

    escaped: function (b) { return b.r <= b.deflateTo + 0.01; },

    progress: function (b) {
      var span = Math.max(1, b.deflateFrom - b.deflateTo);
      return clamp(1 - (b.r - b.deflateTo) / span, 0, 1);
    }
  };

  /* ------------------------------------------------------------- windy
     Drift with a shared gust that reverses every few seconds. Nothing
     escapes; it just makes aiming honest work. */

  var WIND_ACCEL = 130;

  var windy = {
    staged: false,
    walls: 'bounce',
    collide: true,
    clampSpeed: true,

    /* The gust is a property of the weather, not of any one bubble, so it
       advances once per frame rather than once per bubble — otherwise the
       clock speed would depend on how many bubbles are still alive. */
    pre: function (list, dt, rect, cfg, shared) {
      shared.windT = (shared.windT || 0) + dt;
      shared.wind = Math.sin(shared.windT * 0.55 + (shared.gust || 0)) * WIND_ACCEL;
    },

    place: function (b, i, count, rect, cfg, shared) {
      drift.place(b, i, count, rect, cfg);
      if (shared.gust == null) {
        shared.gust = rng.float(0, TAU);
        shared.windT = 0;
        shared.wind = 0;
      }
    },

    step: function (b, dt, rect) {
      b.vx += (b.shared.wind || 0) * dt;
      drift.step(b, dt, rect);
    }
  };

  /* --------------------------------------------------------------- API */

  var MODES = {
    drift: drift,
    rain: rain,
    fizz: fizz,
    volley: volley,
    river: river,
    carousel: carousel,
    swing: swing,
    deflate: deflate,
    windy: windy
  };

  NP.motion = {
    modes: MODES,

    get: function (name) { return MODES[name] || drift; },

    /* Does this mode let bubbles leave the field? Used by the HUD to swap
       the wall clock for a spatial one, and by main.js to leave staged
       bubbles alone on resize. */
    hasEscape: function (mode) { return !!(mode && mode.escaped); },

    /* 0..1 toward the escape edge. The correct bubble is the only one that
       actually costs a life, so it is the only one the timer should track —
       draining the bar for a wrong answer nobody was going to tap would
       just be a lie. */
    progress: function (list, rect, mode) {
      if (!mode || !mode.progress) return 0;
      var fallback = 0;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (b.state !== 'alive' && b.state !== 'reveal') continue;
        var p = mode.progress(b, rect);
        if (b.correct) return clamp(p, 0, 1);
        if (p > fallback) fallback = p;
      }
      return clamp(fallback, 0, 1);
    },

    /* The shell-game twist: two bubbles trade places over SWAP_TIME. The
       tween itself lives in bubbles.update so it works on top of any mode. */
    beginShuffle: function (list) {
      var alive = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].state === 'alive' && list[i].swapT == null) alive.push(list[i]);
      }
      if (alive.length < 2) return false;

      rng.shuffle(alive);
      var a = alive[0], b = alive[1];
      startSwap(a, b.x, b.y);
      startSwap(b, a.x, a.y);
      return true;
    }
  };

  // Also expose each mode by name, so callers with a fixed mode in mind can
  // write NP.motion.drift rather than NP.motion.get('drift').
  for (var name in MODES) {
    if (Object.prototype.hasOwnProperty.call(MODES, name)) NP.motion[name] = MODES[name];
  }

  function startSwap(b, toX, toY) {
    b.swapFromX = b.x;
    b.swapFromY = b.y;
    b.swapToX = toX;
    b.swapToY = toY;
    b.swapT = 0;
  }
})(window.NP = window.NP || {});
