/* The jungle bed: a looping field recording of birds, water and wind.

   This is the one part of the game that is not synthesized. An earlier version
   built the ambience from oscillators, and it was never going to work: a sine
   sweep reads as a theremin rather than a bird, and filtered noise reads as
   hiss rather than insects. A real recording is the only thing that sounds
   like a real jungle.

   The clip is short, so it is looped with a crossfade — two copies overlapping
   by a couple of seconds — rather than butt-joined, which would put an audible
   seam in the background every twenty seconds.

   Everything runs through NP.audio's master gain, so Sound Off silences it and
   there is only ever one AudioContext. */
(function (NP) {
  'use strict';

  var SRC = 'assets/jungle-ambience.mp3';

  /* The menu figure is a boost, not a fader position. The master gain
     downstream is 0.32, so 3.1 here lands the jungle just shy of full scale at
     the output — the practical ceiling, and the point where the limiter in
     audio.js begins holding the peaks. Higher only squashes; it does not get
     louder. The run level stays at unity, which puts the jungle about 10 dB
     down once play starts so it never fights the answer stings. */
  var LEVEL_MENU = 3.1;
  var LEVEL_GAME = 1;
  var FADE_IN    = 2.5;         // first pass rises out of nothing
  var RAMP       = 0.6;         // never set a gain outright — it clicks
  var XFADE      = 2.0;         // overlap between one pass and the next
  var LOOKAHEAD  = 1.0;         // queue the next pass this far before it starts
  var EL_MASTER  = 0.32;        // mirrors NP.audio's master, for the fallback

  var ctx = null;
  var bus = null;               // the duck control for the whole layer
  var buffer = null;
  var live = [];                // sources scheduled or playing right now
  var nextStart = 0;
  var xfade = XFADE;            // clamped to the clip in loadBuffer()

  var el = null;                // fallback <audio>, see loadViaElement()
  var elVol = 0;                // its volume is glided by hand, frame by frame
  var mode = '';                // '' | 'buffer' | 'element'
  var loading = false;
  var failed = false;

  var enabled = false;
  var ducked = false;
  var faded = false;

  /* ------------------------------------------------------------- helpers */

  function targetLevel() {
    if (!enabled || failed || document.hidden) return 0;
    return ducked ? LEVEL_GAME : LEVEL_MENU;
  }

  function rampTo(param, value, seconds) {
    var now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + (seconds == null ? RAMP : seconds));
  }

  /* Buffer mode only. The element has no gain ramp, so its level is glided in
     update() instead and its silencing is done by pausing outright. */
  function applyLevel(seconds) {
    if (mode === 'buffer' && bus) rampTo(bus.gain, targetLevel(), seconds);
  }

  /* ------------------------------------------------------------- loading */

  function load() {
    if (loading || failed || mode) return;
    loading = true;

    var node = NP.audio.bus();
    if (!node) { loadViaElement(); return; }
    ctx = node.ctx;

    bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(node.out);

    window.fetch(SRC)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (bytes) {
        // The callback form as well as the promise: Safari still resolves the
        // old signature and ignores the value it returns.
        return new Promise(function (resolve, reject) {
          ctx.decodeAudioData(bytes, resolve, reject);
        });
      })
      .then(function (decoded) {
        buffer = decoded;
        // A crossfade longer than a third of the clip would leave no steady
        // middle and the loop would audibly pulse.
        xfade = Math.min(XFADE, decoded.duration / 3);
        mode = 'buffer';
        loading = false;
      })
      .catch(function () {
        // Almost always file:// — fetch refuses the local origin. The element
        // path can still read it, so fall back rather than going silent.
        if (bus) { bus.disconnect(); bus = null; }
        loadViaElement();
      });
  }

  /* No fetch, no decode, no crossfade — but it plays from a bare filesystem,
     which the buffer path cannot. The loop seam is audible; that is the price
     of opening index.html directly instead of serving it. */
  function loadViaElement() {
    el = new window.Audio();
    el.src = SRC;
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    elVol = 0;

    el.addEventListener('canplaythrough', function () {
      mode = 'element';
      loading = false;
    });
    el.addEventListener('error', function () {
      failed = true;
      loading = false;
    });
  }

  /* ---------------------------------------------------------------- loop */

  /* One pass of the clip, faded in at the head and out at the tail so the
     copy scheduled underneath it takes over without a seam. */
  function schedulePass(at) {
    var dur = buffer.duration;
    var head = faded ? xfade : Math.min(FADE_IN, dur / 3);

    var src = ctx.createBufferSource();
    src.buffer = buffer;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(1, at + head);
    g.gain.setValueAtTime(1, at + dur - xfade);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);

    src.connect(g);
    g.connect(bus);
    src.start(at);
    src.stop(at + dur + 0.05);

    live.push(src);
    src.onended = function () {
      var i = live.indexOf(src);
      if (i >= 0) live.splice(i, 1);
      try { g.disconnect(); } catch (e) { /* already torn down */ }
    };

    // The next pass starts before this one has finished — that overlap is the
    // crossfade, and it is what makes a short clip loop invisibly.
    nextStart = at + dur - xfade;
  }

  function stopAll(delay) {
    if (!ctx) return;
    var when = ctx.currentTime + (delay || 0);
    for (var i = 0; i < live.length; i++) {
      try { live[i].stop(when); } catch (e) { /* already stopped */ }
    }
    live = [];
    nextStart = 0;
  }

  /* ----------------------------------------------------------------- API */

  NP.ambience = {
    /* Enabled only when the master Sound is on too — no point streaming a
       loop under a muted bus. */
    applySettings: function (settings) {
      var on = !!(settings && settings.sound && settings.jungle);
      if (on === enabled) return;
      enabled = on;
      if (enabled) return;

      applyLevel();
      if (mode === 'buffer') stopAll(RAMP + 0.1);
      faded = false;
    },

    setDucked: function (on) {
      on = !!on;
      if (on === ducked) return;
      ducked = on;
      applyLevel();
    },

    isEnabled: function () { return enabled; },

    update: function (dt) {
      if (failed) return;

      if (mode === 'element') {
        // Glide by hand: a media element has no scheduled ramp. Pausing at
        // zero rather than leaving it running keeps it off the audio hardware
        // when the jungle is switched off.
        var want = Math.max(0, Math.min(1, targetLevel() * EL_MASTER));
        var span = faded ? RAMP : FADE_IN;
        var step = (dt || 0.016) / span;
        if (Math.abs(want - elVol) <= step) { elVol = want; faded = true; }
        else elVol += (want > elVol ? step : -step);

        el.volume = elVol;
        if (elVol > 0 && el.paused) el.play().catch(function () { failed = true; });
        else if (elVol === 0 && !el.paused) el.pause();
        return;
      }

      if (!enabled) return;
      if (!NP.audio.isUnlocked()) return;     // nothing plays until a gesture
      if (!mode) { load(); return; }

      if (!live.length) {                     // first pass, or back after a toggle
        schedulePass(ctx.currentTime + 0.05);
        applyLevel();
        faded = true;
      } else if (ctx.currentTime + LOOKAHEAD >= nextStart) {
        // Clamped forward: coming back from a hidden tab can leave nextStart
        // in the past, and a pass whose fades are already behind the clock
        // would play at the wrong level for its whole length.
        schedulePass(Math.max(nextStart, ctx.currentTime + 0.05));
      }
    }
  };

  /* rAF throttling stops the scheduler on a hidden tab, but the loop is
     already queued in the audio clock and would keep playing to an empty
     room. The element path has no queue, so pausing it is enough. */
  document.addEventListener('visibilitychange', function () {
    if (mode === 'buffer') applyLevel(0.3);
    else if (mode === 'element' && el && document.hidden) { el.pause(); elVol = 0; el.volume = 0; }
  });
})(window.NP = window.NP || {});
