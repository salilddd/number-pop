/* Every sound effect is synthesized with the Web Audio API — no files to load
   and nothing to go missing. (The one recording in the game is the background
   jungle loop, which ambience.js owns and hangs off the master gain here.)
   The context starts suspended in every modern browser, so unlock() must be
   called from inside a real user gesture before anything will be heard. */
(function (NP) {
  'use strict';

  var ctx = null;
  var master = null;
  var limiter = null;
  var enabled = true;
  var unlocked = false;

  function ensureContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;

      /* The jungle bed is boosted to full scale on the menus (see LEVEL_MENU
         in ambience.js) and every sting still lands on top of it. Without
         something catching the sum, the two coinciding would clip — which is
         heard as a crackle, not as loudness. The threshold sits just under
         full scale on purpose: the quiet stretches of the loop never reach it,
         so only the peaks get held down. */
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1.5;   // dBFS, ~0.84 amplitude
      limiter.knee.value = 0;           // a hard corner: limit, don't compress
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      master.connect(limiter);
      limiter.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  /* One oscillator with an exponential pitch sweep and a short AD envelope. */
  function tone(opts) {
    if (!enabled || !ensureContext()) return;
    var now = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.12;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, now);
    if (opts.to && opts.to !== opts.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), now + dur);
    }

    var peak = opts.gain == null ? 0.5 : opts.gain;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.015, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /* Filtered white noise — the "pff" of a bubble bursting. */
  function noise(opts) {
    if (!enabled || !ensureContext()) return;
    var now = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.09;
    var frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    var src = ctx.createBufferSource();
    src.buffer = buffer;

    var filter = ctx.createBiquadFilter();
    filter.type = opts.lowpass ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(opts.freq || 1200, now);
    filter.Q.value = opts.q == null ? 1.2 : opts.q;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.gain == null ? 0.28 : opts.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  var audio = {
    /* Call from a click/pointerdown handler. Safe to call repeatedly. */
    unlock: function () {
      if (unlocked) return;
      if (!ensureContext()) return;
      if (ctx.state === 'suspended') {
        // Only mark it unlocked once the resume actually settles, otherwise a
        // rejection would latch the flag and the next tap could never retry.
        ctx.resume().then(function () { unlocked = true; },
                          function () { /* user can retry with the next tap */ });
      } else {
        unlocked = true;
      }
    },

    setEnabled: function (on) {
      enabled = !!on;
      if (master) master.gain.value = enabled ? 0.32 : 0;
    },

    isEnabled: function () { return enabled; },

    /* Reading the live state rather than the flag above, so a context the
       browser re-suspends on its own is reported honestly. */
    isUnlocked: function () { return !!ctx && ctx.state === 'running'; },

    /* The ambience layer needs the same context and the same master gain, so
       the Sound toggle silences it too and there is only ever one
       AudioContext. Returns null if the browser has no Web Audio at all. */
    bus: function () {
      return ensureContext() ? { ctx: ctx, out: master } : null;
    },

    /* Correct answer. Pitch climbs with the streak so a run audibly builds. */
    correct: function (streak) {
      var step = Math.min(streak || 0, 8);
      var base = 520 * Math.pow(1.0595, step * 2);   // two semitones per streak
      noise({ freq: 1800, dur: 0.07, gain: 0.2, q: 0.8 });
      tone({ freq: base, to: base * 1.5, dur: 0.11, type: 'triangle', gain: 0.42 });
      tone({ freq: base * 1.5, to: base * 2, dur: 0.13, type: 'sine', gain: 0.3, delay: 0.075 });
    },

    /* Wrong answer: a flat descending buzz, deliberately unmusical. */
    wrong: function () {
      tone({ freq: 320, to: 130, dur: 0.3, type: 'sawtooth', gain: 0.24 });
      tone({ freq: 158, to: 92, dur: 0.34, type: 'square', gain: 0.14 });
    },

    /* A heart draining away. */
    lifeLost: function () {
      noise({ freq: 260, dur: 0.24, gain: 0.24, lowpass: true });
      tone({ freq: 190, to: 78, dur: 0.36, type: 'sine', gain: 0.32, delay: 0.03 });
    },

    /* Ran out of time — a rising "hurry" that resolves nowhere. */
    timeout: function () {
      tone({ freq: 440, to: 300, dur: 0.18, type: 'triangle', gain: 0.26 });
      tone({ freq: 300, to: 200, dur: 0.22, type: 'triangle', gain: 0.22, delay: 0.14 });
    },

    /* Streak milestone sparkle. */
    streak: function () {
      [0, 0.06, 0.12].forEach(function (d, i) {
        tone({ freq: 880 * Math.pow(1.26, i), dur: 0.11, type: 'sine', gain: 0.26, delay: d });
      });
    },

    /* Falling minor arpeggio at the end of a run. */
    gameOver: function () {
      var notes = [523, 440, 349, 262];
      notes.forEach(function (f, i) {
        tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.3, delay: i * 0.135 });
      });
      tone({ freq: 131, dur: 0.7, type: 'sine', gain: 0.24, delay: 0.5 });
    },

    /* New personal best. */
    fanfare: function () {
      var notes = [523, 659, 784, 1047];
      notes.forEach(function (f, i) {
        tone({ freq: f, dur: 0.26, type: 'triangle', gain: 0.34, delay: i * 0.1 });
      });
      tone({ freq: 1047, to: 1568, dur: 0.5, type: 'sine', gain: 0.3, delay: 0.42 });
    },

    /* Clearing a level. Transposed up a semitone per level, so getting
       further genuinely sounds higher — capped before it turns shrill. */
    levelUp: function (level) {
      var shift = Math.pow(1.0595, Math.min(Math.max((level || 1) - 1, 0), 12));
      var notes = [392, 523, 659, 784];
      notes.forEach(function (f, i) {
        tone({ freq: f * shift, dur: 0.22, type: 'triangle', gain: 0.32, delay: i * 0.09 });
      });
      tone({ freq: 784 * shift, to: 1175 * shift, dur: 0.55,
             type: 'sine', gain: 0.28, delay: 0.36 });
    },

    /* One star stamping onto the level-clear card. */
    star: function (i) {
      var f = 1046 * Math.pow(1.26, i || 0);
      tone({ freq: f, to: f * 1.5, dur: 0.16, type: 'sine', gain: 0.3 });
      noise({ freq: 3200, dur: 0.06, gain: 0.1, q: 0.7 });
    },

    /* A heart coming back at the end of a boss. */
    heart: function () {
      tone({ freq: 330, to: 494, dur: 0.18, type: 'triangle', gain: 0.34 });
      tone({ freq: 494, to: 659, dur: 0.26, type: 'sine', gain: 0.3, delay: 0.14 });
    },

    click: function () {
      tone({ freq: 660, to: 880, dur: 0.05, type: 'sine', gain: 0.2 });
    },

    /* ---- the interactive scenery on the menus ----
       All four are deliberately quieter than the gameplay cues: a child
       poking at the background should not be louder than answering. */

    /* One fist landing on the gorilla's chest. Four layers, because a chest
       is a drum: the knuckle slap on top, the body of the hit, the low boom
       underneath, and a resonant tail. Pitched low on purpose — this should
       be felt as much as heard, and it must not compete with `correct`. */
    thump: function () {
      noise({ freq: 1500, dur: 0.05, gain: 0.22, q: 1.4 });          // knuckles
      noise({ freq: 220,  dur: 0.2,  gain: 0.42, lowpass: true });   // body
      tone({ freq: 108, to: 50, dur: 0.28, type: 'sine',     gain: 0.62 });
      tone({ freq: 62,  to: 36, dur: 0.36, type: 'triangle', gain: 0.36 });
    },

    /* The hoot that opens a chest-beating display. Rises, then falls away —
       a flat tone reads as a machine, not an animal. */
    hoot: function () {
      tone({ freq: 300, to: 470, dur: 0.17, type: 'sine', gain: 0.36 });
      tone({ freq: 470, to: 320, dur: 0.22, type: 'sine', gain: 0.32, delay: 0.16 });
      tone({ freq: 152, to: 128, dur: 0.34, type: 'triangle', gain: 0.18 });
    },

    /* A leaf coming away from the vine. */
    rustle: function () {
      noise({ freq: 2600, dur: 0.13, gain: 0.1, q: 0.6 });
    },

    /* Two soft chews. Bandpass noise rather than a tone, because a pitched
       munch sounds like a cartoon boing. */
    munch: function () {
      noise({ freq: 620, dur: 0.09, gain: 0.2, q: 2.2 });
      noise({ freq: 480, dur: 0.11, gain: 0.17, q: 2.2, delay: 0.15 });
      tone({ freq: 240, to: 200, dur: 0.1, type: 'triangle', gain: 0.1, delay: 0.02 });
    },

    /* The toucan: lower and drier than the parrot, two croaks in a row.
       Same idea, an octave down, so the two birds are told apart with the
       screen not even being looked at. */
    croak: function () {
      tone({ freq: 420, to: 190, dur: 0.14, type: 'sawtooth', gain: 0.24 });
      noise({ freq: 700, dur: 0.1, gain: 0.14, q: 2.4 });
      tone({ freq: 360, to: 165, dur: 0.13, type: 'sawtooth', gain: 0.2, delay: 0.19 });
      noise({ freq: 620, dur: 0.09, gain: 0.11, q: 2.4, delay: 0.19 });
    },

    /* The parrot. Deliberately harsh and short — a sawtooth falling fast is
       about as close to a squawk as two oscillators get. */
    squawk: function () {
      tone({ freq: 1250, to: 620, dur: 0.11, type: 'sawtooth', gain: 0.26 });
      tone({ freq: 900,  to: 500, dur: 0.09, type: 'square',   gain: 0.13, delay: 0.02 });
      noise({ freq: 2200, dur: 0.07, gain: 0.12, q: 1.6 });
      tone({ freq: 1050, to: 700, dur: 0.09, type: 'sawtooth', gain: 0.19, delay: 0.16 });
    },

    /* Knuckles on a wooden crate. */
    knock: function () {
      tone({ freq: 210, to: 120, dur: 0.07, type: 'square', gain: 0.2 });
      noise({ freq: 900, dur: 0.05, gain: 0.14 });
    },

    /* The firefly darting away. */
    sparkle: function () {
      tone({ freq: 1320, to: 1760, dur: 0.07, type: 'sine', gain: 0.16 });
      tone({ freq: 1760, to: 2200, dur: 0.06, type: 'sine', gain: 0.12, delay: 0.05 });
    },

    start: function () {
      tone({ freq: 392, dur: 0.12, type: 'triangle', gain: 0.3 });
      tone({ freq: 587, dur: 0.16, type: 'triangle', gain: 0.3, delay: 0.1 });
    }
  };

  NP.audio = audio;
})(window.NP = window.NP || {});
