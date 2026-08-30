/* The level ladder.

   A level says how the bubbles move and how many questions clear it. It has a
   small say in the maths too — past level three the freebies are trimmed out
   of the fact pool (see GIMMES_UNTIL) and the wrong answers close in on the
   right one — but only ever as a nudge on the difficulty preset the player
   chose: a six-year-old on Easy still gets to see every level, and Easy at
   level 12 is still gentler than Hard at level 1.

   What a level *does* own is one number: `pressure`. It starts at 1 on the
   first rung, rises monotonically to LADDER_TOP on the last, and keeps
   rising through the Big Boss for as long as a run survives. Everything that
   makes a level harder is derived from it — the clock, the bubble speed, how
   crowded the field is, how confusable the wrong answers are, how often the
   question changes shape.

   That is deliberate. The ladder used to hand-author a fall time per level,
   and twelve unrelated numbers do not stay in order: it ran 6.4 → 5.0 → 4.2
   → 5.8 → 5.4, and three of the twelve levels quietly shared level 1's clock
   because their movement mode had no spatial one. One scalar cannot do that,
   and the tests hold it to it.

   Raw seconds still move up and down along the ladder, and that is correct:
   a mode with a wall clock and a stationary target is easier per second than
   one where the answer is shrinking away, so each mode declares what a
   question is worth in seconds at pressure 1 and the ramp divides into it.
   Pressure is the invariant, not the stopwatch.

   Twelve authored levels introduce one idea at a time, then the Big Boss
   remixes forever. Bosses are short, strict and refill a heart, which is what
   makes the ladder survivable rather than a slow bleed. */
(function (NP) {
  'use strict';

  var rng = NP.rng;

  /* Movement, length and flavour. Everything about difficulty is derived. */
  var LADDER = [
    { name: 'First Steps', mode: 'drift',    questions: 4,
      hint: 'Tap the right answer.' },
    { name: 'Breezy',      mode: 'drift',    questions: 4,
      hint: 'A little quicker now.' },
    { name: 'Carousel',    mode: 'carousel', questions: 4,
      hint: 'Round and round they go.' },
    { name: 'Rainfall',    mode: 'rain',     questions: 4,
      hint: 'Pop it before it hits the ground!' },
    { name: 'Downpour',    mode: 'rain',     questions: 5,
      hint: 'Falling faster. Keep up!' },
    { name: 'Crate Smash', mode: 'rain',     questions: 3, boss: true,
      hint: 'Boss! Three in a row, no mistakes.' },
    { name: 'Volley',      mode: 'volley',   questions: 5,
      hint: 'They fly up, then fall back down.' },
    { name: 'Deflate',     mode: 'deflate',  questions: 6,
      hint: 'They are shrinking away!' },
    { name: 'Vine Swing',  mode: 'swing',    questions: 6,
      hint: 'Swinging on the vines.' },
    { name: 'Fizz',        mode: 'fizz',     questions: 6,
      hint: 'Rising! Catch them before they reach the top.' },
    { name: 'River',       mode: 'river',    questions: 7,
      hint: 'Floating downstream.' },
    { name: 'Storm',       mode: 'rain',     questions: 3,
      wind: true, boss: true,
      hint: 'Boss! Wind and rain. No mistakes.' }
  ];

  /* The Big Boss re-rolls its movement every wave, drawing from here. */
  var ENDLESS_MODES = ['drift', 'carousel', 'rain', 'volley', 'deflate', 'swing',
                       'fizz', 'river', 'windy'];

  var MODE_HINT = {
    drift:    'Drifting again — but faster.',
    carousel: 'Round and round, quicker than before.',
    rain:     'Rain! Do not let the answer land.',
    volley:   'Up and over. Catch them at the top.',
    deflate:  'Shrinking fast.',
    swing:    'Swinging hard now.',
    fizz:     'Rising! Do not let it reach the top.',
    river:    'The river is running quick.',
    windy:    'Hold on — it is gusty out there.'
  };

  /* ---- the pressure curve ---- */

  var LADDER_TOP = 2.0;      // pressure on the last authored rung
  var BOSS_BUMP  = 1.10;     // a boss sits a notch above its own rung

  /* Geometric, so every rung takes the same proportional bite rather than the
     same number of seconds — which is what "one step harder" actually feels
     like. Derived from the ladder's own length, so adding a level reshapes
     the curve instead of leaving a gap in it. */
  var LADDER_STEP = Math.pow(LADDER_TOP, 1 / (LADDER.length - 1));

  var WAVE_RAMP = 1.11;      /* per Big Boss wave. Eleven per cent rather than
                                the six it used to be: below about ten, one
                                wave and the next are indistinguishable, and
                                the mode re-rolling between them is a far
                                bigger change than the ramp — the signal was
                                buried in its own noise. */

  /* ---- what pressure drives ---- */

  /* Seconds a question is worth in this mode at pressure 1. The four modes
     nothing escapes from are worth more of them: the whole set stays on
     screen and stays the size it started, so a second buys more thinking
     than a second spent watching the answer fall off the bottom. Without
     this the ladder cannot compare a volley with a downpour, which is how
     level 7 ended up harder than the level 6 boss in front of it. */
  var MODE_CLOCK = {
    drift:    8.0,
    carousel: 8.0,
    swing:    8.0,
    windy:    8.0,
    deflate:  6.8,
    rain:     6.4,
    fizz:     6.2,
    river:    6.2,
    volley:   6.2
  };
  var DEFAULT_CLOCK = 7.0;

  /* The clock bottoms out here, as a fraction of the mode's own. Past it
     nothing gets faster.

     A bubble that crosses the field before a child can read the question is
     not difficulty, it is a coin toss — the run should end because they were
     finally overwhelmed, not because the game stopped being answerable. The
     Big Boss reaches this floor around its sixth wave and then goes on
     climbing on everything below, which is the point: past the floor the
     difficulty has to change in kind rather than in speed. */
  var CLOCK_FLOOR = 0.28;

  /* Bubble speed, as a multiple of the preset's. Comfortably above the top
     of the ladder (2.2) on purpose: at 2.2 the cap landed exactly on level
     12, so every Big Boss wave ran at an identical speed and the four modes
     nothing escapes from had only the clock left to ramp. */
  var SPEED_CAP = 3.0;

  /* Wrong answers get more confusable with pressure. `nearRatio` is a
     probability, so this is a multiplier on the preset's own — Easy climbs
     inside Easy's band and never leaves it. */
  var NEAR_MIN = 0.5, NEAR_MAX = 2.5, NEAR_CEIL = 0.98;

  /* Missing operands and true-or-false fade in rather than switching on: the
     old gate handed a child the full ratio the moment level 3 started. From
     SHAPE_FROM_P (about level 3) they climb from SHAPE_MIN of the preset's
     ratio to all of it by SHAPE_FULL_P (about level 9), and the Big Boss
     pushes past it to SHAPE_MAX. */
  var SHAPE_FROM_P = 1.13, SHAPE_FULL_P = 1.66;
  var SHAPE_MIN = 0.45, SHAPE_MAX = 1.8;
  var BLANK_CEIL = 0.55, JUDGE_CEIL = 0.40;

  /* How many bubbles, relative to the preset's own count. One fewer while the
     rules are still being learned, the preset's number through the middle,
     and one more once the ladder is in its back half. */
  function ladderCrowd(i) {
    if (i < 2) return -1;
    if (i < 9) return 0;
    return 1;
  }
  var MAX_BUBBLES = 7;       // a field this size stops being readable

  /* The shell game. It starts at level 7 rather than level 9, because level 9
     is the swing — a positional mode, where tuning() has to throw the twist
     away (see `shuffle` there), so the old SHUFFLE_FROM switched a mechanic
     on at the one rung that could not run it. */
  var SHUFFLE_FROM = 6;      // 0-based: level 7 onward
  var SHUFFLE_MIN  = 0.20, SHUFFLE_TOP = 0.65;

  /* ...and it stays off wherever the answering clock is shorter than this.
     A swap costs most of half a second and lands halfway through the
     question; on top of a two-second fall that is not difficulty, it is a
     bubble the child never had a chance to follow. */
  var SHUFFLE_MIN_CLOCK = 3.0;

  var BASE_TIMEOUT = 9;      // the Normal preset's clock, our reference
  var SHAPES_FROM = 3;       // 1-based: the level alternative question shapes
                             // are allowed to start appearing on

  /* 1-based, and the last level that still asks the free ones. `× 1` and
     `n × 10` are answered by reading them, so past the opening rungs they are
     a turn the child spends learning nothing — and the ladder climbing while
     the questions stand still is exactly what makes level 10 feel like level
     2 with faster bubbles. From here on questions.js drops them from the pool.

     A table the player picked to practise is not a freebie, though, so the
     10× table survives it: what goes is `7 × 10`, not `10 × 7`. */
  var GIMMES_UNTIL = 3;

  /* ---- the Big Boss ----
     Level 13 is the last level there is, and it does not finish. It runs in
     waves of three questions, each a notch harder than the last, until the
     run ends — which it always eventually does, because the hearts never
     come back out here.

     That is what makes the authored twelve a climb with a summit rather than
     a middle that fades into more of itself, and it is why the progress vine
     fills at exactly twelve: the vine finishing *is* reaching the Big Boss. */
  var ENDLESS_INDEX = 12;    // 0-based, so level 13
  var WAVE_SIZE = 3;         // questions per wave

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* Pressure on ladder rung `i`, before the boss bump. */
  function basePressure(i) {
    return Math.pow(LADDER_STEP, clamp(i, 0, LADDER.length - 1));
  }

  /* Pressure in Big Boss wave `w`, picking up exactly where the level 12
     boss left off so the summit is a continuation and not a reset. */
  function wavePressure(w) {
    return LADDER_TOP * BOSS_BUMP * Math.pow(WAVE_RAMP, Math.max(1, w | 0) - 1);
  }

  /* Seconds a question in this mode is worth at this pressure. */
  function clockFor(modeName, pressure) {
    var base = MODE_CLOCK[modeName] || DEFAULT_CLOCK;
    return base * Math.max(CLOCK_FLOOR, 1 / Math.max(0.01, pressure));
  }

  /* Shared by tuning() and shapes(), so the bubbles on the field and the
     claims in a true-or-false question can never disagree about how close a
     wrong answer is allowed to be. */
  function nearRatioFor(preset, pressure) {
    var mul = clamp(pressure * 0.5, NEAR_MIN, NEAR_MAX);
    return Math.min(NEAR_CEIL, preset.nearRatio * mul);
  }

  function shapeMul(pressure) {
    var t = (pressure - SHAPE_FROM_P) / (SHAPE_FULL_P - SHAPE_FROM_P);
    return clamp(SHAPE_MIN + (1 - SHAPE_MIN) * t, SHAPE_MIN, SHAPE_MAX);
  }

  function shuffleChance(pressure) {
    return Math.min(SHUFFLE_TOP, SHUFFLE_MIN + Math.max(0, pressure - 1.4) * 0.45);
  }

  /* Level 13 itself, the same whatever index asked for it — a run cannot
     climb past the Big Boss by accident.

     `questions` is the wave size rather than Infinity on purpose: it is
     handed to hud.setLevelProgress, which builds that many pips in a loop. */
  function endlessLevel() {
    return {
      name: 'Big Boss',
      mode: 'rain',
      questions: WAVE_SIZE,
      wind: true,
      boss: true,
      endless: true,
      hint: 'It never stops. How long can you last?'
    };
  }

  NP.levels = {
    authored: LADDER.length,
    endlessIndex: ENDLESS_INDEX,
    waveSize: WAVE_SIZE,
    ladderTop: LADDER_TOP,

    basePressure: basePressure,
    wavePressure: wavePressure,
    clockFor: clockFor,
    nearRatio: nearRatioFor,
    gimmesUntil: GIMMES_UNTIL,

    /* 0-based. Always returns a level — everything past the ladder is the
       Big Boss. */
    at: function (index) {
      var i = Math.max(0, index | 0);
      var endless = i >= ENDLESS_INDEX;
      var src = endless ? endlessLevel() : LADDER[i];
      var pressure = endless ? wavePressure(1)
                             : basePressure(i) * (src.boss ? BOSS_BUMP : 1);

      var level = {
        n: endless ? ENDLESS_INDEX + 1 : i + 1,
        index: endless ? ENDLESS_INDEX : i,
        name: src.name,
        mode: src.mode,
        questions: src.questions,
        pressure: pressure,
        crowd: endless ? 1 : ladderCrowd(i),
        wind: !!src.wind,
        boss: !!src.boss,
        endless: !!endless,
        hint: src.hint || ''
      };

      // The shell-game twist rides on top of whatever mode is playing,
      // rather than costing a rung of the ladder to itself.
      level.shuffle = i >= SHUFFLE_FROM && !level.boss &&
                      rng.bool(shuffleChance(pressure));

      return level;
    },

    /* One wave of the Big Boss, shaped like a level so tuning() consumes it
       unchanged.

       Once the clock hits its floor around wave six the ramp stops being
       about speed and becomes about everything else: another bubble on the
       field, wrong answers that have to actually be checked, and a question
       that keeps changing what it is asking for. The last of those tops out
       around wave thirteen, and past there the Big Boss is at its terminal
       difficulty and stays — an endless mode has to have one, because a
       field can only hold so many bubbles and a fall can only be so fast.
       Thirteen waves of climbing is the goal, not infinity; what it replaces
       is twenty waves of six per cent nobody could feel. */
    wave: function (n, prevMode) {
      var w = Math.max(1, n | 0);
      var pressure = wavePressure(w);

      // Two identical waves running together read as nothing having changed,
      // which is the one thing the re-roll exists to avoid.
      var mode = rng.pick(ENDLESS_MODES);
      for (var guard = 0; guard < 8 && prevMode && mode === prevMode; guard++) {
        mode = rng.pick(ENDLESS_MODES);
      }

      return {
        n: ENDLESS_INDEX + 1,
        index: ENDLESS_INDEX,
        name: 'Big Boss',
        mode: mode,
        questions: WAVE_SIZE,
        pressure: pressure,
        /* Every fifth wave adds a bubble. This is the escalation that
           outlives the clock: it costs reading time rather than reaction
           time, so it keeps biting long after speed has stopped. */
        crowd: Math.min(3, 1 + Math.floor((w - 1) / 6)),
        wind: mode === 'windy',
        boss: true,
        endless: true,
        wave: w,
        /* Proposed here and filtered in tuning(), which is the only place
           that knows the mode's clock — see SHUFFLE_MIN_CLOCK. */
        shuffle: rng.bool(shuffleChance(pressure)),
        hint: MODE_HINT[mode] || ''
      };
    },

    /* Merge a level onto the chosen difficulty. */
    tuning: function (preset, level) {
      var mode = NP.motion.get(level.mode);
      var pressure = level.pressure || 1;

      // Difficulty owns how much thinking time a child gets, so it scales
      // every clock the same way, spatial or wall.
      var timeScale = preset.timeout / BASE_TIMEOUT;
      var clock = clockFor(level.mode, pressure) * timeScale;

      return {
        mode: mode,
        modeName: level.mode,
        pressure: pressure,
        speed: preset.speed * Math.min(pressure, SPEED_CAP),

        /* The one clock. In an escape mode the bubble's journey across the
           field takes exactly this long; everywhere else it is the wall
           clock counting down. Either way it is the time the player has,
           which is what the shell game and the HUD both want to know. */
        clock: clock,

        wind: level.wind,
        bubbles: clamp(preset.bubbles + (level.crowd || 0), 2, MAX_BUBBLES),
        nearRatio: nearRatioFor(preset, pressure),

        /* Positional modes derive x and y from an angle every frame, so a
           swap tween is overwritten the instant it lands — the bubbles
           cross over each other and snap straight back. The twist only
           means anything where the mode integrates a velocity, and only
           where there is enough clock left to follow it. */
        shuffle: !!level.shuffle && !mode.positional &&
                 clock >= SHUFFLE_MIN_CLOCK,

        // In an escape mode the journey is the real clock, and this is only
        // a backstop against a stuck state, so it is deliberately generous.
        // Everywhere else the two are the same thing.
        timeout: mode.escaped ? clock * 1.8 + 2 : clock
      };
    },

    /* Bosses and every fifth level get the full card; the rest get a quick
       in-canvas burst that does not interrupt the run. */
    isBigCelebration: function (level) {
      return !!level && (level.boss || level.n % 5 === 0);
    },

    /* Which question shapes this level may ask for, as the ratios
       questions.next() wants.

       Both of the alternative shapes are held back for the first two levels:
       they are the same facts, but they are different things to do with them,
       and a child still learning that the game is "tap the number" should not
       meet a second rule in the same breath. Neither appears in a boss, where
       three questions have to be answered with no mistakes and the rule
       changing underfoot is not the kind of difficulty a boss is for.

       The Big Boss is the exception, because that reasoning is about a short
       gate and it is not one: it is the whole endgame, and sixty questions of
       nothing but the plain form is monotony rather than difficulty.

       From level 3 they fade in with pressure rather than arriving at full
       strength, and past the top of the ladder they go on past the preset's
       own ratio — which is the endgame having to get harder somehow once the
       clock has stopped.

       It lives here rather than in session.js because it is a property of the
       level, like the mode and the question count beside it — the level is
       what decides, and difficulty only says how often. */
    shapes: function (level, preset, settings) {
      var allowed = !!level && level.n >= SHAPES_FROM &&
                    (!level.boss || !!level.endless);
      var mul = shapeMul(level ? (level.pressure || 1) : 1);

      return {
        blank: allowed && settings.blanks
          ? Math.min(BLANK_CEIL, preset.blankRatio * mul) : 0,
        judge: allowed && settings.judge
          ? Math.min(JUDGE_CEIL, preset.judgeRatio * mul) : 0,
        nearRatio: nearRatioFor(preset, level ? (level.pressure || 1) : 1),

        /* Which facts the level is willing to ask at all. Unlike the ratios
           above this one is read by buildPool rather than per question — the
           pool is what the weighting draws from, so a fact left in it comes
           back however often the level would rather it did not. */
        noGimmes: !!level && level.n > GIMMES_UNTIL
      };
    }
  };
})(window.NP = window.NP || {});
