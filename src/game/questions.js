/* Question generation, and the difficulty presets everything else reads.

   Which fact to show next is where the real value sits — anything can print
   7 x 8. Facts the player gets wrong, answers slowly, or has not seen in a
   while are weighted up, but only 70% of the time: pure weakness-weighting
   traps a child on the same four facts and they stop feeling progress. */
(function (NP) {
  'use strict';

  var rng = NP.rng;

  /* One preset moves several dials together. */
  var PRESETS = {
    easy:   { bubbles: 3, speed: 25, fullPoints: 3.5, timeout: 12, nearRatio: 0.25, scoreMult: 0.75 },
    normal: { bubbles: 4, speed: 55, fullPoints: 2.5, timeout: 9,  nearRatio: 0.55, scoreMult: 1.0  },
    hard:   { bubbles: 6, speed: 90, fullPoints: 1.8, timeout: 7,  nearRatio: 0.85, scoreMult: 1.35 }
  };

  var SYMBOL = { mul: '×', div: '÷', add: '+', sub: '−' };

  /* ------------------------------------------------------------- facts */

  function mulKey(a, b) {
    // Commutative, so 3x4 and 4x3 build one shared mastery record.
    return Math.min(a, b) + 'x' + Math.max(a, b);
  }

  function makeQuestion(op, a, b) {
    var q = { op: op, a: a, b: b, answer: 0, key: '', text: '' };
    if (op === 'mul') {
      q.answer = a * b;
      q.key = mulKey(a, b);
    } else if (op === 'div') {
      // a is the dividend, b the divisor
      q.answer = a / b;
      q.key = a + 'd' + b;
    } else if (op === 'add') {
      q.answer = a + b;
      q.key = Math.min(a, b) + 'p' + Math.max(a, b);
    } else {
      q.answer = a - b;
      q.key = a + 'm' + b;
    }
    q.text = a + ' ' + SYMBOL[op] + ' ' + b + ' = ?';
    return q;
  }

  /* ------------------------------------------------------------- pools */

  /* Enumerable pools let facts be weighted by mastery. Multiplication and
     division always are. Addition and subtraction only up to 20 — beyond
     that the fact space is too large for per-fact mastery to mean much,
     so those are generated on the fly instead. */
  function buildPool(settings) {
    var pool = { mul: null, div: null, add: null, sub: null };
    var t, m, i;
    var maxMul = settings.maxMultiplier;

    if (settings.ops.indexOf('mul') >= 0) {
      pool.mul = [];
      for (i = 0; i < settings.tables.length; i++) {
        t = settings.tables[i];
        for (m = 1; m <= maxMul; m++) pool.mul.push([t, m]);
      }
    }

    if (settings.ops.indexOf('div') >= 0) {
      pool.div = [];
      for (i = 0; i < settings.tables.length; i++) {
        t = settings.tables[i];
        for (m = 1; m <= maxMul; m++) pool.div.push([t * m, t]);
      }
    }

    if (settings.addMax <= 20) {
      var lo = 1;
      if (settings.ops.indexOf('add') >= 0) {
        pool.add = [];
        for (var a = lo; a <= settings.addMax; a++) {
          for (var b = lo; a + b <= settings.addMax; b++) pool.add.push([a, b]);
        }
      }
      if (settings.ops.indexOf('sub') >= 0) {
        pool.sub = [];
        for (var x = lo + 1; x <= settings.addMax; x++) {
          for (var y = lo; y < x; y++) pool.sub.push([x, y]);
        }
      }
    }

    return pool;
  }

  /* How badly does this fact need practice? */
  function weightFor(key, facts, now) {
    var f = facts[key];
    if (!f || !f.seen) return 2.2;                 // unseen facts deserve a turn

    var w = 1;
    var accuracy = f.correct / f.seen;
    w += (1 - accuracy) * 3.5;                     // missed facts weigh most

    if (f.avgMs > 3000) {
      w += Math.min((f.avgMs - 3000) / 2000, 1.5); // slow recall is weak recall
    }

    var days = (now - (f.lastSeen || 0)) / 86400000;
    w += Math.min(days, 5) * 0.2;                  // spacing: stale facts resurface

    return w;
  }

  /* Random generation for the add/sub ranges too large to enumerate. */
  function randomAddSub(op, max) {
    var a, b;
    if (op === 'add') {
      a = rng.int(1, max - 1);
      b = rng.int(1, max - a);
      return makeQuestion('add', a, b);
    }
    a = rng.int(2, max);
    b = rng.int(1, a - 1);
    return makeQuestion('sub', a, b);
  }

  NP.questions = {
    presets: PRESETS,

    preset: function (name) {
      return PRESETS[name] || PRESETS.normal;
    },

    buildPool: buildPool,

    /* Human-readable version of a fact, for the mascot's closing line. */
    label: function (q) {
      return q.a + ' ' + SYMBOL[q.op] + ' ' + q.b;
    },

    /* Identifies a topic set so highscores are kept separately per setup. */
    topicKey: function (s) {
      var parts = s.ops.slice().sort().join('');
      if (s.ops.indexOf('mul') >= 0 || s.ops.indexOf('div') >= 0) {
        parts += ':' + s.tables.slice().sort(function (x, y) { return x - y; }).join(',');
        parts += '@' + s.maxMultiplier;
      }
      if (s.ops.indexOf('add') >= 0 || s.ops.indexOf('sub') >= 0) {
        parts += ':n' + s.addMax;
      }
      return parts + '|' + s.difficulty;
    },

    /* A friendly description of the current topic set for the home screen. */
    describe: function (s) {
      var bits = [];
      var names = { mul: 'times', div: 'divide', add: 'add', sub: 'subtract' };
      for (var i = 0; i < s.ops.length; i++) bits.push(names[s.ops[i]]);
      var text = bits.join(' + ');
      if (s.ops.indexOf('mul') >= 0 || s.ops.indexOf('div') >= 0) {
        var t = s.tables.slice().sort(function (x, y) { return x - y; });
        text += ' · ' + (t.length > 6 ? t.length + ' tables' : t.join(', '));
      }
      return text + ' · ' + s.difficulty;
    },

    /* Draw the next question. `recent` is a list of recently used keys so
       the same fact cannot appear twice in quick succession. */
    next: function (settings, pool, facts, recent) {
      var now = Date.now();
      var attempts = 0;
      var q = null;

      while (attempts++ < 24) {
        var op = settings.ops.length === 1
          ? settings.ops[0]
          : rng.pick(settings.ops);

        var entries = pool[op];

        if (!entries || !entries.length) {
          if (op === 'add' || op === 'sub') {
            q = randomAddSub(op, settings.addMax);
          } else {
            continue;
          }
        } else {
          var idx;
          if (rng.next() < 0.3) {
            // The uniform 30% keeps coverage broad and stops the game
            // hammering the same handful of weak facts.
            idx = rng.int(0, entries.length - 1);
          } else {
            var weights = new Array(entries.length);
            for (var i = 0; i < entries.length; i++) {
              var pair = entries[i];
              var key = op === 'mul' ? mulKey(pair[0], pair[1])
                      : op === 'div' ? pair[0] + 'd' + pair[1]
                      : op === 'add' ? Math.min(pair[0], pair[1]) + 'p' + Math.max(pair[0], pair[1])
                      : pair[0] + 'm' + pair[1];
              weights[i] = weightFor(key, facts, now);
            }
            idx = rng.weightedIndex(weights);
          }
          q = makeQuestion(op, entries[idx][0], entries[idx][1]);
        }

        if (q && recent.indexOf(q.key) < 0) return q;
      }

      // Ran out of attempts (a tiny pool, e.g. one table on easy) — take
      // whatever the last draw produced rather than looping forever.
      return q || makeQuestion('mul', 2, 2);
    },

    makeQuestion: makeQuestion
  };
})(window.NP = window.NP || {});
