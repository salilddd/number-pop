/* All sound is synthesized with the Web Audio API — no audio files to load,
   nothing to go missing, and the whole game stays a folder you can copy.
   The context starts suspended in every modern browser, so unlock() must be
   called from inside a real user gesture before anything will be heard. */
(function (NP) {
  'use strict';

  var ctx = null;
  var master = null;
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
      master.connect(ctx.destination);
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
        ctx.resume().catch(function () { /* user can retry with the next tap */ });
      }
      unlocked = true;
    },

    setEnabled: function (on) {
      enabled = !!on;
      if (master) master.gain.value = enabled ? 0.32 : 0;
    },

    isEnabled: function () { return enabled; },

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

    click: function () {
      tone({ freq: 660, to: 880, dur: 0.05, type: 'sine', gain: 0.2 });
    },

    start: function () {
      tone({ freq: 392, dur: 0.12, type: 'triangle', gain: 0.3 });
      tone({ freq: 587, dur: 0.16, type: 'triangle', gain: 0.3, delay: 0.1 });
    }
  };

  NP.audio = audio;
})(window.NP = window.NP || {});
