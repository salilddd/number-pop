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

  var shakeTime = 0;
  var shakeDuration = 0;
  var shakeAmount = 0;
  var shakeX = 0, shakeY = 0;

  NP.effects = {
    reset: function () {
      particles.length = 0;
      texts.length = 0;
      rings.length = 0;
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

    floatText: function (x, y, text, color, size) {
      texts.push({
        x: x, y: y,
        text: text,
        color: color || T.pointsText,
        size: size || 26,
        vy: -78,
        life: 0,
        maxLife: 1.0
      });
    },

    ring: function (x, y, r, color) {
      rings.push({ x: x, y: y, r: r, color: color || T.bubbleLight, life: 0, maxLife: 0.42 });
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
        ctx.beginPath();
        ctx.arc(0, 0, p.r * (0.5 + alpha * 0.5), 0, Math.PI * 2);
        ctx.fill();
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
    }
  };
})(window.NP = window.NP || {});
