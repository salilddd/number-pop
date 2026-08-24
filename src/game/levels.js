/* The level ladder.

   A level says how the bubbles move and how many questions clear it. It does
   NOT say how hard the maths is — that stays with the difficulty preset the
   player chose, so a six-year-old on Easy still gets to see every level.

   Twelve authored levels introduce one idea at a time, then it remixes
   forever with a slow speed ramp. Bosses are short, strict and refill a
   heart, which is what makes the ladder survivable rather than a slow
   bleed. */
(function (NP) {
  'use strict';

  var rng = NP.rng;

  /* fallTime is the seconds a bubble takes to cross the field in the modes
     where position is the clock. It is scaled by difficulty below, so these
     numbers are all "at Normal". */
  var LADDER = [
    { name: 'First Steps', mode: 'drift',    questions: 4, speedMul: 0.8,
      hint: 'Tap the right answer.' },
    { name: 'Breezy',      mode: 'drift',    questions: 4, speedMul: 1.1,
      hint: 'A little quicker now.' },
    { name: 'Carousel',    mode: 'carousel', questions: 4, speedMul: 1.0,
      hint: 'Round and round they go.' },
    { name: 'Rainfall',    mode: 'rain',     questions: 4, fallTime: 6.4,
      hint: 'Pop it before it hits the ground!' },
    { name: 'Downpour',    mode: 'rain',     questions: 5, fallTime: 5.0,
      hint: 'Falling faster. Keep up!' },
    { name: 'Crate Smash', mode: 'rain',     questions: 3, fallTime: 4.2, boss: true,
      hint: 'Boss! Three in a row, no mistakes.' },
    { name: 'Volley',      mode: 'volley',   questions: 5, gravity: 470,
      hint: 'They fly up, then fall back down.' },
    { name: 'Deflate',     mode: 'deflate',  questions: 5, fallTime: 5.8,
      hint: 'They are shrinking away!' },
    { name: 'Vine Swing',  mode: 'swing',    questions: 5, speedMul: 1.15,
      hint: 'Swinging on the vines.' },
    { name: 'Fizz',        mode: 'fizz',     questions: 5, fallTime: 5.4,
      hint: 'Rising! Catch them before they reach the top.' },
    { name: 'River',       mode: 'river',    questions: 5, fallTime: 5.4,
      hint: 'Floating downstream.' },
    { name: 'Storm',       mode: 'rain',     questions: 3, fallTime: 4.0,
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

  var RAMP_CAP = 2.0;
  var BASE_TIMEOUT = 9;          // the Normal preset's clock, our reference
  var SHUFFLE_FROM = 8;          // 0-based: level 9 onward can shuffle
  var SHUFFLE_CHANCE = 0.35;
  var SHAPES_FROM = 3;           // 1-based: the level the alternative question
                                 // shapes are allowed to start appearing on

  /* ---- the Big Boss ----
     Level 13 is the last level there is, and it does not finish. It runs in
     waves of three questions, each a notch faster than the last, until the
     run ends — which it always eventually does, because the hearts never
     come back out here.

     That is what makes the authored twelve a climb with a summit rather than
     a middle that fades into more of itself, and it is why the progress vine
     fills at exactly twelve: the vine finishing *is* reaching the Big Boss. */
  var ENDLESS_INDEX = 12;        // 0-based, so level 13
  var WAVE_SIZE = 3;             // questions per wave
  var BASE_FALL = 4.0;           // at Normal — the Storm boss's clock
  var WAVE_RAMP = 1.06;          // six per cent, compounding, per wave
  var FALL_FLOOR = 0.35;         // the fall time bottoms out here, as a
                                 // fraction of BASE_FALL

  /* Level 13 itself, the same whatever index asked for it — a run cannot
     climb past the Big Boss by accident.

     `questions` is the wave size rather than Infinity on purpose: it is
     handed to hud.setLevelProgress, which builds that many pips in a loop. */
  function endlessLevel() {
    return {
      name: 'Big Boss',
      mode: 'rain',
      questions: WAVE_SIZE,
      speedMul: 1,
      fallTime: BASE_FALL,
      gravity: 470,
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

    /* 0-based. Always returns a level — everything past the ladder is the
       Big Boss. */
    at: function (index) {
      var i = Math.max(0, index | 0);
      var endless = i >= ENDLESS_INDEX;
      var src = endless ? endlessLevel() : LADDER[i];

      var level = {
        n: endless ? ENDLESS_INDEX + 1 : i + 1,
        index: endless ? ENDLESS_INDEX : i,
        name: src.name,
        mode: src.mode,
        questions: src.questions,
        speedMul: src.speedMul || 1,
        fallTime: src.fallTime || 5.5,
        gravity: src.gravity || 520,
        wind: !!src.wind,
        boss: !!src.boss,
        endless: !!src.endless,
        hint: src.hint || ''
      };

      // The shell-game twist rides on top of whatever mode is playing,
      // rather than costing a rung of the ladder to itself.
      level.shuffle = i >= SHUFFLE_FROM && !level.boss && rng.bool(SHUFFLE_CHANCE);

      return level;
    },

    /* One wave of the Big Boss, shaped like a level so tuning() consumes it
       unchanged. Six per cent compounds per wave: the velocity-driven modes
       plateau at RAMP_CAP, the falling ones keep tightening to the floor.

       Past that floor nothing gets faster. A bubble that crosses the field
       before a child can read the question is not difficulty, it is a coin
       toss — the run should end because they were finally overwhelmed, not
       because the game stopped being answerable. */
    wave: function (n, prevMode) {
      var w = Math.max(1, n | 0);
      var ramp = Math.min(Math.pow(WAVE_RAMP, w - 1), 1 / FALL_FLOOR);
      var moved = Math.min(ramp, RAMP_CAP);

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
        speedMul: moved,
        fallTime: BASE_FALL / ramp,
        gravity: 470 * moved,
        wind: mode === 'windy',
        boss: true,
        endless: true,
        wave: w,
        ramp: ramp,
        /* The shell game on top of a 1.4-second fall is not fair difficulty,
           and no boss has ever taken it. */
        shuffle: false,
        hint: MODE_HINT[mode] || ''
      };
    },

    /* Merge a level onto the chosen difficulty. Everything that reads
       `preset` today keeps working — this only widens it. */
    tuning: function (preset, level) {
      var mode = NP.motion.get(level.mode);

      // Difficulty owns how much thinking time a child gets, so it scales
      // the spatial clock the same way it scales the wall clock.
      var timeScale = preset.timeout / BASE_TIMEOUT;
      var fallTime = level.fallTime * timeScale;

      return {
        mode: mode,
        modeName: level.mode,
        speed: preset.speed * level.speedMul,
        fallTime: fallTime,
        gravity: level.gravity,
        wind: level.wind,

        /* Positional modes derive x and y from an angle every frame, so a
           swap tween is overwritten the instant it lands — the bubbles
           cross over each other and snap straight back. The twist only
           means anything where the mode integrates a velocity. */
        shuffle: level.shuffle && !mode.positional,

        // In an escape mode the descent is the real clock, and this is only
        // a backstop against a stuck state, so it is deliberately generous.
        // Everywhere else it is still the clock the player sees.
        timeout: mode.escaped ? fallTime * 1.8 + 2 : preset.timeout
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

       It lives here rather than in session.js because it is a property of the
       level, like the mode and the question count beside it — the level is
       what decides, and difficulty only says how often. */
    shapes: function (level, preset, settings) {
      var allowed = !!level && level.n >= SHAPES_FROM &&
                    (!level.boss || !!level.endless);
      return {
        blank: allowed && settings.blanks ? preset.blankRatio : 0,
        judge: allowed && settings.judge ? preset.judgeRatio : 0,
        nearRatio: preset.nearRatio
      };
    }
  };
})(window.NP = window.NP || {});
