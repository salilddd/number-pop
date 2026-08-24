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
    easy:   { bubbles: 3, speed: 25, fullPoints: 3.5, timeout: 12, nearRatio: 0.25, scoreMult: 0.75, blankRatio: 0.18, judgeRatio: 0.14 },
    normal: { bubbles: 4, speed: 55, fullPoints: 2.5, timeout: 9,  nearRatio: 0.55, scoreMult: 1.0,  blankRatio: 0.30, judgeRatio: 0.20 },
    hard:   { bubbles: 6, speed: 90, fullPoints: 1.8, timeout: 7,  nearRatio: 0.85, scoreMult: 1.35, blankRatio: 0.42, judgeRatio: 0.24 }
  };

  var SYMBOL = { mul: '×', div: '÷', add: '+', sub: '−' };

  /* Which operand a question may hide. Division and subtraction only ever
     hide the second one: `? ÷ 6 = 7` asks for the dividend, which is a much
     bigger number than anything else the option set would hold, and beside a
     42 the small wrong answers give themselves away. */
  var BLANKABLE = { mul: ['a', 'b'], div: ['b'], add: ['a', 'b'], sub: ['b'] };

  /* ------------------------------------------------------------- facts */

  function mulKey(a, b) {
    // Commutative, so 3x4 and 4x3 build one shared mastery record.
    return Math.min(a, b) + 'x' + Math.max(a, b);
  }

  /* `blank` says which number is hidden behind the question mark:
       'answer' (the default)  7 × 6 = ?
       'b'                     7 × ? = 42
       'a'                     ? × 6 = 42
     `q.answer` is always the number the child has to tap, and `q.result` is
     always what the sum comes to — for a plain question they are the same.

     The mastery key never moves: `7 × ? = 42` practises 7 × 6 and the child's
     record should say so, which is also what lets the weakness weighting keep
     working across both forms of the same fact. */
  function makeQuestion(op, a, b, blank) {
    var q = {
      op: op, a: a, b: b,
      answer: 0, result: 0,
      form: 'pick',          // 'pick' a number, or 'judge' a finished statement
      blank: 'answer',
      key: '', text: ''
    };

    if (op === 'mul') {
      q.result = a * b;
      q.key = mulKey(a, b);
    } else if (op === 'div') {
      // a is the dividend, b the divisor
      q.result = a / b;
      q.key = a + 'd' + b;
    } else if (op === 'add') {
      q.result = a + b;
      q.key = Math.min(a, b) + 'p' + Math.max(a, b);
    } else {
      q.result = a - b;
      q.key = a + 'm' + b;
    }

    if (blank === 'a' || blank === 'b') q.blank = blank;

    if (q.blank === 'b') {
      q.answer = b;
      q.text = a + ' ' + SYMBOL[op] + ' ? = ' + q.result;
    } else if (q.blank === 'a') {
      q.answer = a;
      q.text = '? ' + SYMBOL[op] + ' ' + b + ' = ' + q.result;
    } else {
      q.answer = q.result;
      q.text = a + ' ' + SYMBOL[op] + ' ' + b + ' = ?';
    }

    return q;
  }

  /* A blank the child can read straight off the line teaches nothing:
     `1 × ? = 9` and `42 ÷ ? = 42` both answer themselves. */
  function trivialBlank(op, a, b, which) {
    if (op === 'mul') return which === 'b' ? a === 1 : b === 1;
    if (op === 'div') return b === 1 || a / b === 1;
    return false;
  }

  /* Hide an operand some of the time. Called on the way out of next(), so
     every path that produces a question gets the same treatment. */
  function maybeBlank(q, ratio) {
    if (!q || !ratio || rng.next() >= ratio) return q;

    var sides = BLANKABLE[q.op];
    if (!sides) return q;

    var which = sides.length === 1 ? sides[0] : rng.pick(sides);
    if (trivialBlank(q.op, q.a, q.b, which)) return q;

    return makeQuestion(q.op, q.a, q.b, which);
  }

  /* ------------------------------------------------------------- judging */

  /* `6 × 7 = 41` — true or false? The statement is finished, and the child
     decides whether it is right rather than producing the answer.

     Half of them are true. The false half takes its claim from the distractor
     pool rather than from a random number, which is the whole difficulty: a
     `6 × 7 = 300` can be waved away without arithmetic, while a `6 × 7 = 41`
     has to actually be checked. With only two bubbles on the field there is
     nothing else holding the question up. */
  function judged(q, nearRatio) {
    var claim = q.result;

    if (!rng.bool()) {
      var wrong = NP.distractors.generate(q, 1, nearRatio == null ? 0.55 : nearRatio);
      // No plausible wrong value in range — better a plain question than a
      // "false" statement that happens to be true.
      if (!wrong.length) return q;
      claim = wrong[0];
    }

    var j = makeQuestion(q.op, q.a, q.b);
    j.form = 'judge';
    j.claim = claim;
    // Derived rather than remembered, so the two can never disagree.
    j.truth = (claim === j.result);
    j.answer = j.truth ? 1 : 0;
    j.text = q.a + ' ' + SYMBOL[q.op] + ' ' + q.b + ' = ' + claim;
    return j;
  }

  /* A drawn fact becomes one of three questions. Judging is tried first,
     because a statement with a hole in it — `7 × ? = 42`, true or false? —
     is not a question anyone can answer. */
  function shape(q, opts) {
    if (!q) return q;
    var o = opts || {};
    if (o.judge && rng.next() < o.judge) return judged(q, o.nearRatio);
    return maybeBlank(q, o.blank);
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

    /* The whole truth, for the beat after a miss where the answer is shown.
       Written out in full rather than as "the question plus the answer",
       because a missing-operand question read that way comes out as
       `7 × ? = 42 6`. */
    reveal: function (q) {
      return q.a + ' ' + SYMBOL[q.op] + ' ' + q.b + ' = ' + q.result;
    },

    /* Identifies a topic set so highscores are kept separately per setup.

       Missing-operand questions deliberately stay out of this: they are the
       same facts drawn the same way round, only presented differently, so
       splitting the scoreboard over them would fragment a child's record of
       the 4× table into two halves that mean the same thing. */
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

    /* Draw the next question. `recent` is a list of recently used keys so the
       same fact cannot appear twice in quick succession.

       `opts` is how the drawn fact should be dressed:
         blank      how often to hide an operand rather than the answer
         judge      how often to state it outright and ask true or false
         nearRatio  how confusable the false claims should be
       The caller owns those numbers because they depend on the level as well
       as the difficulty — see NP.levels.shapes. */
    next: function (settings, pool, facts, recent, opts) {
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

        if (q && recent.indexOf(q.key) < 0) return shape(q, opts);
      }

      // Ran out of attempts (a tiny pool, e.g. one table on easy) — take
      // whatever the last draw produced rather than looping forever.
      return shape(q || makeQuestion('mul', 2, 2), opts);
    },

    makeQuestion: makeQuestion
  };
})(window.NP = window.NP || {});
