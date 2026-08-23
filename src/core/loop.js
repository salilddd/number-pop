/* requestAnimationFrame loop with a clamped delta.

   The clamp is the important part: a backgrounded tab resumes with a delta
   of several seconds, and without the clamp every bubble teleports straight
   through a wall on the first frame back. */
(function (NP) {
  'use strict';

  var MAX_DT = 1 / 30;   // never integrate more than one 30fps step at a time

  var running = false;
  var rafId = 0;
  var lastTime = 0;
  var tick = null;

  function frame(now) {
    if (!running) return;
    rafId = window.requestAnimationFrame(frame);

    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!isFinite(dt) || dt <= 0) return;
    if (dt > MAX_DT) dt = MAX_DT;

    tick(dt, now);
  }

  NP.loop = {
    start: function (fn) {
      tick = fn;
      if (running) return;
      running = true;
      lastTime = window.performance.now();
      rafId = window.requestAnimationFrame(frame);
    },

    stop: function () {
      running = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
    },

    isRunning: function () { return running; }
  };

  /* Coming back from a background tab must not count as elapsed play time. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) lastTime = window.performance.now();
  });
})(window.NP = window.NP || {});
