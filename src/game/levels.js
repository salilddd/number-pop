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
    { name: 'First Steps', mode: 'drift',    questions: 5, speedMul: 0.8,
      hint: 'Tap the right answer.' },
    { name: 'Breezy',      mode: 'drift',    questions: 6, speedMul: 1.1,
      hint: 'A little quicker now.' },
    { name: 'Carousel',    mode: 'carousel', questions: 6, speedMul: 1.0,
      hint: 'Round and round they go.' },
    { name: 'Rainfall',    mode: 'rain',     questions: 6, fallTime: 6.4,
      hint: 'Pop it before it hits the ground!' },
    { name: 'Downpour',    mode: 'rain',     questions: 7, fallTime: 5.0,
      hint: 'Falling faster. Keep up!' },
    { name: 'Crate Smash', mode: 'rain',     questions: 3, fallTime: 4.2, boss: true,
      hint: 'Boss! Three in a row, no mistakes.' },
    { name: 'Volley',      mode: 'volley',   questions: 6, gravity: 470,
      hint: 'They fly up, then fall back down.' },
    { name: 'Deflate',     mode: 'deflate',  questions: 6, fallTime: 5.8,
      hint: 'They are shrinking away!' },
    { name: 'Vine Swing',  mode: 'swing',    questions: 7, speedMul: 1.15,
      hint: 'Swinging on the vines.' },
    { name: 'Fizz',        mode: 'fizz',     questions: 7, fallTime: 5.4,
      hint: 'Rising! Catch them before they reach the top.' },
    { name: 'River',       mode: 'river',    questions: 7, fallTime: 5.4,
      hint: 'Floating downstream.' },
    { name: 'Storm',       mode: 'rain',     questions: 3, fallTime: 4.0,
      wind: true, boss: true,
      hint: 'Boss! Wind and rain. No mistakes.' }
  ];

  /* Past the authored ladder, levels are drawn from here. */
  var REMIX = ['drift', 'carousel', 'rain', 'volley', 'deflate', 'swing',
               'fizz', 'river', 'windy'];

  var REMIX_HINT = {
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

  var RAMP_PER_LEVEL = 0.06;
  var RAMP_CAP = 2.0;
  var BASE_TIMEOUT = 9;          // the Normal preset's clock, our reference
  var SHUFFLE_FROM = 8;          // 0-based: level 9 onward can shuffle
  var SHUFFLE_CHANCE = 0.35;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* Levels past the ladder are generated fresh each time they come up, so
     a long run keeps surprising instead of cycling a fixed list. */
  function remixLevel(index) {
    var boss = (index + 1) % 6 === 0;
    var mode = boss ? 'rain' : rng.pick(REMIX);
    var ramp = clamp(1 + (index - LADDER.length + 1) * RAMP_PER_LEVEL, 1, RAMP_CAP);

    return {
      name: boss ? 'Storm ' + Math.floor((index + 1) / 6) : 'Remix',
      mode: mode,
      questions: boss ? 3 : 7,
      speedMul: ramp,
      fallTime: (boss ? 4.0 : 5.4) / ramp,
      gravity: 470 * ramp,
      wind: boss || mode === 'windy',
      boss: boss,
      hint: boss ? 'Boss! No mistakes.' : REMIX_HINT[mode]
    };
  }

  NP.levels = {
    authored: LADDER.length,

    /* 0-based. Always returns a level — the ladder never runs out. */
    at: function (index) {
      var i = Math.max(0, index | 0);
      var src = i < LADDER.length ? LADDER[i] : remixLevel(i);

      var level = {
        n: i + 1,
        index: i,
        name: src.name,
        mode: src.mode,
        questions: src.questions,
        speedMul: src.speedMul || 1,
        fallTime: src.fallTime || 5.5,
        gravity: src.gravity || 520,
        wind: !!src.wind,
        boss: !!src.boss,
        hint: src.hint || ''
      };

      // The shell-game twist rides on top of whatever mode is playing,
      // rather than costing a rung of the ladder to itself.
      level.shuffle = i >= SHUFFLE_FROM && !level.boss && rng.bool(SHUFFLE_CHANCE);

      return level;
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
    }
  };
})(window.NP = window.NP || {});
