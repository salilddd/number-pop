/* Particles, floating score text, expanding rings and screen shake.

   This is most of the difference between "works" and "feels good", so it
   gets its own module rather than being sprinkled through the session code.
   Shake stays under 0.2s and tapers with an ease-out — anything longer
   reads as a bug rather than as impact. */
(function (NP) {
  'use strict';

  var rng = NP.rng;
  var T = NP.theme;

  var particles = [];
  var texts = [];
  var rings = [];
  var banners = [];
  var flashes = [];
  var pending = [];          // bursts scheduled to fire a little later
  var tosses = [];           // rewards flying to the pile they land on

  var shakeTime = 0;
  var shakeDuration = 0;
  var shakeAmount = 0;
  var shakeX = 0, shakeY = 0;

  var CONFETTI = ['#5fc22b', '#8fe05c', '#ffd34d', '#ffe89a', '#ff6f76', '#ffffff', '#4f9c30'];

  function easeOutBack(t) {
    var c1 = 2.2, c3 = c1 + 1;
    var p = t - 1;
    return 1 + c3 * p * p * p + c1 * p * p;
  }

  NP.effects = {
    reset: function () {
      particles.length = 0;
      texts.length = 0;
      rings.length = 0;
      banners.length = 0;
      flashes.length = 0;
      pending.length = 0;
      tosses.length = 0;
      shakeTime = shakeDuration = shakeAmount = 0;
      shakeX = shakeY = 0;
    },

    /* A bubble bursting. */
    burst: function (x, y, radius, colors, count) {
      var n = count || 18;
      for (var i = 0; i < n; i++) {
        var angle = (i / n) * Math.PI * 2 + rng.float(-0.25, 0.25);
        var speed = rng.float(90, 320);
        particles.push({
          x: x + Math.cos(angle) * radius * 0.55,
          y: y + Math.sin(angle) * radius * 0.55,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          r: rng.float(radius * 0.07, radius * 0.2),
          color: colors[i % colors.length],
          life: 0,
          maxLife: rng.float(0.4, 0.75),
          gravity: 620,
          spin: rng.float(-8, 8),
          angle: 0
        });
      }
    },

    /* Chalk dust — a softer, slower puff for the wrong answer. */
    dust: function (x, y, radius) {
      for (var i = 0; i < 12; i++) {
        var angle = rng.float(0, Math.PI * 2);
        var speed = rng.float(20, 90);
        particles.push({
          x: x, y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 20,
          r: rng.float(radius * 0.08, radius * 0.22),
          color: 'rgba(233,236,220,0.5)',
          life: 0,
          maxLife: rng.float(0.5, 0.9),
          gravity: 60,
          spin: 0,
          angle: 0
        });
      }
    },

    /* `life` defaults to a second. Pass a longer one when the text has to
       survive a long pause — a revealed answer with nothing left on screen
       to point at has to stay readable for the whole reveal. */
    floatText: function (x, y, text, color, size, life) {
      var maxLife = life || 1.0;
      texts.push({
        x: x, y: y,
        text: text,
        color: color || T.pointsText,
        size: size || 26,
        // Longer-lived text drifts more slowly, or it sails off the top.
        vy: -78 / Math.max(1, maxLife),
        life: 0,
        maxLife: maxLife
      });
    },

    ring: function (x, y, r, color) {
      rings.push({ x: x, y: y, r: r, color: color || T.bubbleLight, life: 0, maxLife: 0.42 });
    },

    /* ----------------------------------------------------------- the bang */

    /* The bloom of something going off. Additive and centred on the blast
       rather than a full-screen wash, so it lifts the scene around it
       instead of blanking it — and short, because a flash you have time to
       read the shape of has stopped being a flash. */
    flash: function (x, y, radius, life) {
      flashes.push({ x: x, y: y, r: radius, life: 0, maxLife: life || 0.28 });
    },

    /* Puffs that rise, spread and thin out. Negative gravity and a radius
       that grows with age is the whole trick: particles that shrink as they
       fade read as debris, and smoke has to do the opposite. */
    smoke: function (x, y, radius, count) {
      var n = count || 9;
      for (var i = 0; i < n; i++) {
        var angle = rng.float(0, Math.PI * 2);
        var speed = rng.float(14, 70);
        particles.push({
          x: x + Math.cos(angle) * radius * 0.3,
          y: y + Math.sin(angle) * radius * 0.3,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - rng.float(24, 62),
          r: rng.float(radius * 0.3, radius * 0.62),
          shape: 'puff',
          color: i % 3 === 0 ? T.smokeDark : T.smoke,
          life: 0,
          maxLife: rng.float(0.9, 1.7),
          gravity: -28,                    // it climbs, and keeps climbing
          spin: 0,
          angle: 0
        });
      }
    },

    /* ------------------------------------------------------ celebration */

    /* Paper falling across the whole field. Rectangles rather than circles,
       because tumbling rectangles read as confetti and dots read as more
       particles. */
    confetti: function (rect, count) {
      var n = count || 70;
      var w = rect.right - rect.left;
      for (var i = 0; i < n; i++) {
        var size = rng.float(5, 12);
        particles.push({
          x: rect.left + rng.float(0, w),
          y: rect.top - rng.float(10, 260),
          vx: rng.float(-60, 60),
          vy: rng.float(40, 130),
          r: size,
          h: size * rng.float(0.4, 0.7),
          shape: 'rect',
          color: CONFETTI[i % CONFETTI.length],
          life: 0,
          maxLife: rng.float(1.6, 2.8),
          gravity: 90,
          spin: rng.float(-9, 9),
          angle: rng.float(0, Math.PI * 2)
        });
      }
    },

    /* A staggered volley of bursts across the field. Scheduled rather than
       fired at once, so it reads as several fireworks instead of one big
       explosion. */
    fireworks: function (rect, count) {
      var n = count || 5;
      var w = rect.right - rect.left;
      var h = rect.bottom - rect.top;
      for (var i = 0; i < n; i++) {
        pending.push({
          delay: i * rng.float(0.13, 0.24),
          x: rect.left + rng.float(w * 0.15, w * 0.85),
          y: rect.top + rng.float(h * 0.12, h * 0.6),
          r: rng.float(24, 46)
        });
      }
    },

    /* Big centred text that pops in, holds, then fades — the level card and
       the level-clear shout. Canvas rather than DOM so it can sit over the
       playfield without a second overlay stealing taps. */
    banner: function (rect, title, subtitle, life, color) {
      banners.push({
        x: (rect.left + rect.right) / 2,
        y: rect.top + (rect.bottom - rect.top) * 0.34,
        w: rect.right - rect.left,
        title: title,
        subtitle: subtitle || '',
        color: color || T.chalk,
        life: 0,
        maxLife: life || 1.6
      });
    },

    /* A banana arcing from where it was earned to the pile it is banked on.
       A tally that silently ticks up in a corner never taught anyone where
       the reward went; watching it fly there does. `onLand` fires once, at
       the end, so the pile can swell as it takes delivery. */
    toss: function (fromX, fromY, toX, toY, onLand) {
      tosses.push({
        x0: fromX, y0: fromY,
        x1: toX, y1: toY,
        // Enough lift to clear the bubbles it is flying over.
        lift: Math.max(90, Math.abs(fromY - toY) * 0.42),
        life: 0,
        maxLife: 0.95,
        onLand: onLand || null
      });
    },

    shake: function (amount, duration) {
      // Don't let a small shake cut off a bigger one already running.
      if (amount < shakeAmount && shakeTime < shakeDuration) return;
      shakeAmount = amount;
      shakeDuration = duration || 0.16;
      shakeTime = 0;
    },

    update: function (dt) {
      var i, p;

      // Fireworks waiting their turn.
      for (i = pending.length - 1; i >= 0; i--) {
        var q = pending[i];
        q.delay -= dt;
        if (q.delay > 0) continue;
        pending.splice(i, 1);
        NP.effects.burst(q.x, q.y, q.r, CONFETTI, 16);
        NP.effects.ring(q.x, q.y, q.r, rng.pick(CONFETTI));
      }

      for (i = particles.length - 1; i >= 0; i--) {
        p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        p.vx *= 0.99;
      }

      for (i = banners.length - 1; i >= 0; i--) {
        banners[i].life += dt;
        if (banners[i].life >= banners[i].maxLife) banners.splice(i, 1);
      }

      /* Spliced before the callback runs, so a handler that starts another
         toss cannot be walked over by this same loop. */
      for (i = tosses.length - 1; i >= 0; i--) {
        var z = tosses[i];
        z.life += dt;
        if (z.life < z.maxLife) continue;
        tosses.splice(i, 1);
        if (z.onLand) z.onLand();
      }

      for (i = texts.length - 1; i >= 0; i--) {
        var t = texts[i];
        t.life += dt;
        if (t.life >= t.maxLife) { texts.splice(i, 1); continue; }
        t.y += t.vy * dt;
        t.vy *= 0.94;
      }

      for (i = rings.length - 1; i >= 0; i--) {
        var g = rings[i];
        g.life += dt;
        if (g.life >= g.maxLife) rings.splice(i, 1);
      }

      for (i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life += dt;
        if (flashes[i].life >= flashes[i].maxLife) flashes.splice(i, 1);
      }

      if (shakeTime < shakeDuration) {
        shakeTime += dt;
        var k = 1 - shakeTime / shakeDuration;
        var falloff = k * k;                       // ease-out taper
        shakeX = (rng.next() * 2 - 1) * shakeAmount * falloff;
        shakeY = (rng.next() * 2 - 1) * shakeAmount * falloff;
      } else {
        shakeX = shakeY = 0;
        shakeAmount = 0;
      }
    },

    /* Applied by main.js as a CSS transform on the play field wrapper, so
       the canvas and the in-game HUD jolt together. Rounded to whole pixels
       to keep the canvas from resampling. */
    shakeOffset: function () {
      return { x: Math.round(shakeX), y: Math.round(shakeY) };
    },

    draw: function (ctx) {
      var i;

      /* Under the rings and the debris on purpose: a bloom painted over the
         embers would wash out the very thing it is supposed to be lighting. */
      for (i = 0; i < flashes.length; i++) {
        var fl = flashes[i];
        var ft = fl.life / fl.maxLife;
        var fr = fl.r * (0.5 + ft * 0.9);
        var fade = 1 - ft;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * fade;
        var fg = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, fr);
        fg.addColorStop(0, T.blastCore);
        fg.addColorStop(0.34, T.blastMid);
        fg.addColorStop(1, T.blastEdge);
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, fr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (i = 0; i < rings.length; i++) {
        var g = rings[i];
        var gt = g.life / g.maxLife;
        NP.bubbleArt.drawRing(ctx, g.x, g.y, g.r * (1 + gt * 0.9), 1 - gt, g.color);
      }

      for (i = 0; i < particles.length; i++) {
        var p = particles[i];
        var alpha = 1 - p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        if (p.shape === 'rect') {
          // Squashed on the spin axis so it looks like paper turning over.
          ctx.fillRect(-p.r / 2, -p.h / 2, p.r, p.h * Math.abs(Math.cos(p.angle * 1.7)));
        } else if (p.shape === 'puff') {
          // Grows as it thins, and soft-edged — a hard circle of grey is a
          // ball, not smoke.
          var pr = p.r * (1 + (p.life / p.maxLife) * 1.8);
          var pg = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
          pg.addColorStop(0, p.color);
          pg.addColorStop(0.55, p.color);
          pg.addColorStop(1, 'rgba(120,124,118,0)');
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(0, 0, pr, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r * (0.5 + alpha * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      /* The reward in flight. Eased toward the target with a sine arc over
         the top, shrinking as it goes, so it reads as travelling away from
         the player and down into the scene. */
      for (i = 0; i < tosses.length; i++) {
        var z = tosses[i];
        var zt = z.life / z.maxLife;
        var ease = 1 - Math.pow(1 - zt, 2.2);
        var zx = z.x0 + (z.x1 - z.x0) * ease;
        var zy = z.y0 + (z.y1 - z.y0) * ease - Math.sin(zt * Math.PI) * z.lift;
        var zs = 34 * (1 - zt * 0.42);

        ctx.save();
        // Fades out over the last sliver so it hands off to the pile's bump
        // rather than blinking out at full opacity.
        ctx.globalAlpha = zt > 0.86 ? (1 - zt) / 0.14 : 1;
        ctx.translate(zx, zy);
        ctx.rotate(zt * 6.1);
        // Drawn from a pivot at the stalk, so centre it on the flight path.
        NP.progressArt.banana(ctx, -zs * 0.5, 0, zs, 0);
        ctx.restore();
      }

      for (i = 0; i < texts.length; i++) {
        var t = texts[i];
        var tt = t.life / t.maxLife;
        ctx.save();
        ctx.globalAlpha = tt < 0.7 ? 1 : (1 - tt) / 0.3;
        ctx.font = '600 ' + t.size + 'px ' + T.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillText(t.text, t.x, t.y + 2);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      }

      for (i = 0; i < banners.length; i++) {
        drawBanner(ctx, banners[i]);
      }
    }
  };

  /* Pops in with an overshoot, holds, then fades. The plaque behind it is
     what makes it readable over a field of bubbles and confetti. */
  function drawBanner(ctx, b) {
    var t = b.life / b.maxLife;
    var IN = 0.22, OUT = 0.75;

    var scale = t < IN ? easeOutBack(t / IN) : 1;
    var alpha = t < IN ? Math.min(1, t / IN * 1.6)
              : (t > OUT ? 1 - (t - OUT) / (1 - OUT) : 1);
    if (alpha <= 0) return;

    var padX = Math.min(b.w * 0.47, 250);
    var inner = padX * 2 - 46;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.x, b.y);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Level hints are a full sentence and the field is only ~400px wide, so
    // both lines are measured and shrunk to fit rather than trusted to.
    var titleSize = fitText(ctx, b.title, '700', Math.min(52, b.w * 0.115), inner, 20);
    var subSize = b.subtitle
      ? fitText(ctx, b.subtitle, '500', Math.min(21, b.w * 0.05), inner, 11)
      : 0;

    var half = b.subtitle ? titleSize * 0.9 + subSize : titleSize * 0.85;
    ctx.fillStyle = 'rgba(12,13,10,0.66)';
    roundRect(ctx, -padX, -half, padX * 2, half * 2, 16);
    ctx.fill();

    var titleY = b.subtitle ? -subSize * 0.8 : 0;
    ctx.font = '700 ' + titleSize + 'px ' + T.font;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText(b.title, 0, titleY + 3);
    ctx.fillStyle = b.color;
    ctx.fillText(b.title, 0, titleY);

    if (b.subtitle) {
      ctx.font = '500 ' + subSize + 'px ' + T.font;
      ctx.fillStyle = T.chalkDim;
      ctx.fillText(b.subtitle, 0, titleSize * 0.62);
    }

    ctx.restore();
  }

  /* Shrink a font size until the string fits, then leave the context set to
     that font so the caller can just draw. Steps down rather than scaling,
     so the glyphs stay crisp. */
  function fitText(ctx, text, weight, size, maxWidth, minSize) {
    var s = Math.round(size);
    for (var guard = 0; guard < 40; guard++) {
      ctx.font = weight + ' ' + s + 'px ' + T.font;
      if (ctx.measureText(text).width <= maxWidth || s <= minSize) break;
      s -= 1;
    }
    return s;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
})(window.NP = window.NP || {});
