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

  /* The same idea one step up: a whole fact that is answered by reading it.
     `1 × 8` and `7 × 10` cost a child nothing but the tap, and past the
     opening levels a question that teaches nothing is a question wasted —
     NP.levels decides from which rung (see GIMMES_UNTIL there).

     It is positional, exactly like the pool that feeds it: `a` is the table
     the player chose in Choose Topics and `b` the multiplier. So `10 × 5`
     stays — they asked for the 10s, and this is what practising them looks
     like — while `5 × 10` goes. Division reads the same way round: its pool
     entries are [t × m, t], so `b` is the chosen table and `a / b` the
     multiplier, and `50 ÷ 10` survives where `70 ÷ 7 = 10` does not.

     For add and sub it is the tiny end that gives itself away rather than a
     particular operand: adding one, taking one away, and the sums small
     enough to be counted on fingers. */
  function gimme(op, a, b) {
    if (op === 'mul') return a === 1 || b === 1 || b === 10;
    if (op === 'div') {
      var quotient = a / b;
      return b === 1 || quotient === 1 || quotient === 10;
    }
    if (op === 'add') return a === 1 || b === 1 || a + b <= 5;
    return b === 1 || a <= 5;
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

  /* Fewest facts a trimmed pool may be left holding. Below this the trim is
     abandoned and the full pool kept: a child practising one narrow table
     (the 10s on their own, or 2× up to 2) would otherwise be handed a pool
     with nothing in it, and no question at all is worse than an easy one. */
  var MIN_POOL = 6;

  var OPS = ['mul', 'div', 'add', 'sub'];

  function withoutGimmes(entries, op) {
    var kept = [];
    for (var i = 0; i < entries.length; i++) {
      if (!gimme(op, entries[i][0], entries[i][1])) kept.push(entries[i]);
    }
    return kept.length >= MIN_POOL ? kept : entries;
  }

  /* Enumerable pools let facts be weighted by mastery. Multiplication and
     division always are. Addition and subtraction only up to 20 — beyond
     that the fact space is too large for per-fact mastery to mean much,
     so those are generated on the fly instead.

     `opts` is the level's shapes bundle, and only `noGimmes` is read here:
     which facts a level is willing to ask has to be settled in the pool
     rather than per draw, because the pool is what the mastery weighting
     picks from — a fact left in it comes back around however unwelcome it
     is. It is called again on every level, so the trim arrives with the
     rung that asked for it. */
  function buildPool(settings, opts) {
    var pool = { mul: null, div: null, add: null, sub: null };
    var noGimmes = !!(opts && opts.noGimmes);
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

    if (noGimmes) {
      for (i = 0; i < OPS.length; i++) {
        var op = OPS[i];
        if (pool[op] && pool[op].length) pool[op] = withoutGimmes(pool[op], op);
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

  /* Random generation for the add/sub ranges too large to enumerate. There is
     no pool here for the level to trim, so the floor is applied to the draw
     instead: no operand of one, and nothing that only uses the bottom quarter
     of the range the player asked for — `3 + 4` is not an "up to 100" sum.

     The size of a question is the biggest number on its line, which for a
     subtraction is what it starts from and not what it comes to: `52 − 45`
     is a two-digit question that happens to answer 7, and throwing it away
     for the size of its answer would leave only the easy ones. Bounded
     tries, then whatever came out, because a floor that cannot always be met
     must not become a hang. */
  function randomAddSub(op, max, noGimmes) {
    var lo = noGimmes ? 2 : 1;
    var floor = noGimmes ? Math.round(max * 0.25) : 0;
    var q, a, b;

    for (var tries = 0; tries < 6; tries++) {
      if (op === 'add') {
        a = rng.int(lo, max - lo);
        b = rng.int(lo, max - a);
        q = makeQuestion('add', a, b);
      } else {
        a = rng.int(lo + 1, max);
        b = rng.int(lo, a - 1);
        q = makeQuestion('sub', a, b);
      }
      if ((op === 'add' ? q.result : q.a) >= floor) return q;
    }
    return q;
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
         noGimmes   refuse the facts that answer themselves
       The caller owns those numbers because they depend on the level as well
       as the difficulty — see NP.levels.shapes. The same bundle goes to
       buildPool, which is where noGimmes does its work; it is read here only
       for the add and sub ranges too large to have a pool. */
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
            q = randomAddSub(op, settings.addMax, opts && opts.noGimmes);
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

    makeQuestion: makeQuestion,

    /* Exported for the tests, which sweep thousands of drawn questions and
       need to ask the same question the pool asked. */
    gimme: gimme
  };
})(window.NP = window.NP || {});
