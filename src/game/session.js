/* The game state machine. All run state lives in one object so it can be
   logged, serialised and inspected — which is what makes a bad round
   reproducible instead of a mystery.

   Phases:
     intro       — the level card is up, the field is empty
     asking      — bubbles are live, the clock is draining, input is open
     between     — the answer has landed; a short pause to show what happened
     celebrating — the level is cleared and being celebrated
     over        — the run has ended

   A level decides how the bubbles move and how many questions clear it. The
   difficulty preset the player chose still decides how hard the maths is,
   how many bubbles there are and how long they get to think, so the whole
   ladder is reachable at every difficulty. */
(function (NP) {
  'use strict';

  var PAUSE_CORRECT = 0.42;

  /* The reveal is the one moment in the game where learning actually happens,
     so it is deliberately unhurried. Note that the losing bubbles spend the
     first FADE_TIME (0.45s) dissolving, so the child only gets a clean look at
     the gold answer for the remainder — budget accordingly.

     The pace cost is bounded: a wrong answer or a timeout always costs a life,
     so the reveal happens at most three times in an entire run. */
  var PAUSE_WRONG   = 4.4;
  var PAUSE_TIMEOUT = 4.8;     // a beat longer: nothing was even attempted

  var INTRO_TIME     = 1.7;    // the level card, before the first question
  var CELEBRATE_TIME = 2.1;    // the quick, non-blocking celebration
  var RECENT_MEMORY  = 3;      // don't repeat a fact within this many questions
  var MAX_LIVES      = 3;
  var SHUFFLE_AT     = 0.45;   // fraction of the clock at which bubbles trade

  var state = null;
  var cb = {};

  function bubbleCount(preset) {
    // "normal" is 4 or 5, so consecutive questions don't look identical.
    return preset.bubbles === 4 ? NP.rng.int(4, 5) : preset.bubbles;
  }

  function setPhase(phase, duration) {
    state.phase = phase;
    state.phaseTime = 0;
    state.phaseDuration = duration || 0;
    NP.input.setEnabled(phase === 'asking');
  }

  /* ------------------------------------------------------------- levels */

  function beginLevel(index) {
    state.levelIndex = index;
    state.level = NP.levels.at(index);
    state.cfg = NP.levels.tuning(state.preset, state.level);

    state.levelQuestion = 0;
    state.levelCorrect = 0;
    state.levelMisses = 0;
    state.livesAtLevelStart = state.lives;
    state.bubbles = [];
    state.awaitContinue = false;

    /* Recorded on arrival rather than on completion: dying on level 7 still
       means you got to level 7. A ?level= jump is exempt — it would write a
       best level that was never actually climbed, and that record outlives
       the debug session. */
    if (!state.debugJump) NP.storage.setBestLevel(state.topicKey, state.level.n);

    if (cb.onLevelStart) cb.onLevelStart(state.level, state);
    setPhase('intro', INTRO_TIME);
  }

  function starsFor() {
    if (state.levelMisses === 0 && state.lives >= state.livesAtLevelStart) return 3;
    if (state.levelMisses <= 1) return 2;
    return 1;
  }

  function finishLevel() {
    var level = state.level;
    var stars = starsFor();
    var bonus = NP.scoring.levelBonus(level, stars, state.preset);

    state.score += bonus;
    state.stars.push(stars);
    if (stars === 3) state.bananas++;

    /* The heart is the whole point of a boss. Without it the ladder is a
       slow bleed nobody can climb: three lives spread over twelve levels
       means one mistake every four levels, forever. */
    var refilled = false;
    if (level.boss && state.lives < MAX_LIVES) {
      state.lives++;
      refilled = true;
      if (cb.onLives) cb.onLives(state.lives);
    }

    var summary = {
      level: level,
      next: NP.levels.at(state.levelIndex + 1),
      stars: stars,
      bonus: bonus,
      correct: state.levelCorrect,
      questions: state.levelQuestion,
      heartRefilled: refilled,
      big: NP.levels.isBigCelebration(level),
      score: state.score,
      bananas: state.bananas
    };

    if (cb.onScore) cb.onScore(state.score, bonus);
    NP.audio.levelUp(level.n);

    // The big card waits for a tap; the quick one runs itself out.
    state.awaitContinue = summary.big;
    setPhase('celebrating', summary.big ? 0 : CELEBRATE_TIME);
    if (cb.onLevelClear) cb.onLevelClear(summary);
  }

  /* ---------------------------------------------------------- questions */

  function nextQuestion() {
    var q = NP.questions.next(state.settings, state.pool, state.facts, state.recentKeys);

    state.recentKeys.push(q.key);
    if (state.recentKeys.length > RECENT_MEMORY) state.recentKeys.shift();

    var count = bubbleCount(state.preset);
    var wrong = NP.distractors.generate(q, count - 1, state.preset.nearRatio);
    var values = [q.answer].concat(wrong);
    NP.rng.shuffle(values);

    state.question = q;
    state.questionTime = 0;
    state.shuffled = false;
    state.bubbles = NP.bubbles.spawn(values, q.answer, state.playRect, state.cfg);

    setPhase('asking');
    if (cb.onQuestion) cb.onQuestion(q, state);
    if (cb.onTimer) cb.onTimer(1);
  }

  function fadeOthers(except) {
    for (var i = 0; i < state.bubbles.length; i++) {
      if (state.bubbles[i] !== except) NP.bubbles.fade(state.bubbles[i]);
    }
  }

  function findCorrectBubble() {
    for (var i = 0; i < state.bubbles.length; i++) {
      if (state.bubbles[i].correct) return state.bubbles[i];
    }
    return null;
  }

  function noteMiss(q) {
    var entry = state.misses[q.key];
    if (entry) entry.count++;
    else state.misses[q.key] = { count: 1, label: NP.questions.label(q) };
  }

  function loseLife() {
    state.lives--;
    state.streak = 0;
    if (cb.onLives) cb.onLives(state.lives);
    if (cb.onStreak) cb.onStreak(0);
  }

  function onCorrect(bubble) {
    var q = state.question;
    var points = NP.scoring.points(state.questionTime, state.streak, state.preset);

    state.score += points;
    state.streak++;
    state.answered++;
    state.correct++;
    state.levelQuestion++;
    state.levelCorrect++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;

    NP.storage.recordFact(q.key, true, Math.round(state.questionTime * 1000));
    state.facts[q.key] = NP.storage.loadFacts()[q.key];

    NP.audio.correct(state.streak);
    NP.bubbles.pop(bubble);
    fadeOthers(bubble);

    NP.effects.burst(bubble.x, bubble.y, bubble.r,
      [NP.theme.bubbleLight, NP.theme.bubble, NP.theme.bubbleRim, '#ffffff'], 20);
    NP.effects.ring(bubble.x, bubble.y, bubble.r);
    NP.effects.floatText(bubble.x, bubble.y - bubble.r * 0.6,
      '+' + points, NP.theme.pointsText, Math.max(20, bubble.r * 0.5));

    if (NP.scoring.isMilestone(state.streak)) {
      NP.audio.streak();
      NP.effects.floatText(state.playRect.left + (state.playRect.right - state.playRect.left) / 2,
        state.playRect.top + 40, state.streak + ' in a row!', NP.theme.streakGold, 26);
    }

    if (cb.onScore) cb.onScore(state.score, points);
    if (cb.onStreak) cb.onStreak(state.streak);
    if (cb.onLevelProgress) cb.onLevelProgress(state.levelQuestion, state.level.questions);

    setPhase('between', PAUSE_CORRECT);
  }

  /* Every way of getting a question wrong lands here: a wrong tap, the clock
     running out, or the answer escaping the field. They differ only in what
     is left on screen to point at, and in how long the pause needs to be. */
  function onMissed(reason, bubble) {
    var q = state.question;

    state.answered++;
    state.levelQuestion++;
    state.levelMisses++;
    noteMiss(q);
    NP.storage.recordFact(q.key, false, 0);
    state.facts[q.key] = NP.storage.loadFacts()[q.key];

    if (reason === 'wrong') NP.audio.wrong();
    else NP.audio.timeout();
    NP.audio.lifeLost();
    loseLife();

    if (bubble) {
      NP.bubbles.markWrong(bubble);
      NP.effects.dust(bubble.x, bubble.y, bubble.r);
    }

    // Show what the answer was — the mistake is the teaching moment, and
    // skipping past it wastes the only part the child will remember.
    var pause = reason === 'wrong' ? PAUSE_WRONG : PAUSE_TIMEOUT;
    var right = findCorrectBubble();

    if (right && right.state === 'alive') {
      NP.bubbles.reveal(right);
      NP.effects.ring(right.x, right.y, right.r, NP.theme.reveal);
    } else {
      // It escaped the field, so there is nothing left to circle. Say it
      // instead, and hold it for the same beat the gold bubble would get.
      right = null;
      var cx = (state.playRect.left + state.playRect.right) / 2;
      var cy = (state.playRect.top + state.playRect.bottom) / 2;
      NP.effects.floatText(cx, cy, q.text + ' ' + q.answer,
        NP.theme.reveal, 38, pause - 0.4);
    }

    for (var i = 0; i < state.bubbles.length; i++) {
      var b = state.bubbles[i];
      if (b !== bubble && b !== right) NP.bubbles.fade(b);
    }

    NP.effects.shake(reason === 'wrong' ? 9 : 6, reason === 'wrong' ? 0.18 : 0.16);
    if (cb.onLevelProgress) cb.onLevelProgress(state.levelQuestion, state.level.questions);

    setPhase('between', pause);
  }

  /* A bubble left the field. Only the correct answer escaping costs a life:
     with one right answer among five, charging for the others would punish
     the player for correctly ignoring them. */
  function onEscape(bubble) {
    if (!state || state.phase !== 'asking') return;

    if (!bubble.correct) {
      // Puff at the edge it left by, not at its off-screen centre.
      var rect = state.playRect;
      var px = Math.max(rect.left + 12, Math.min(rect.right - 12, bubble.x));
      var py = Math.max(rect.top + 12, Math.min(rect.bottom - 12, bubble.y));
      NP.effects.dust(px, py, bubble.r * 0.8);
      return;
    }

    onMissed('escape', null);
  }

  /* --------------------------------------------------------------- end */

  function weakestOfRun() {
    var bestKey = null, bestCount = 1;
    for (var k in state.misses) {
      if (state.misses[k].count >= bestCount) {
        bestCount = state.misses[k].count;
        bestKey = k;
      }
    }
    return bestKey ? state.misses[bestKey].label : null;
  }

  function gameOver() {
    setPhase('over');
    NP.input.setEnabled(false);

    var previousBest = NP.storage.getHighscore(state.topicKey);
    // A run that started partway up the ladder skipped the questions the
    // score is made of, so it is not comparable with a real one.
    var isNewBest = !state.debugJump &&
      NP.storage.setHighscore(state.topicKey, state.score);

    var result = {
      score: state.score,
      best: Math.max(previousBest, state.score),
      previousBest: previousBest,
      isNewBest: isNewBest && state.score > 0,
      answered: state.answered,
      correct: state.correct,
      bestStreak: state.bestStreak,
      weakestLabel: weakestOfRun(),
      topicKey: state.topicKey,
      level: state.level ? state.level.n : 1,
      levelName: state.level ? state.level.name : '',
      bestLevel: NP.storage.getBestLevel(state.topicKey),
      bananas: state.bananas
    };

    if (result.isNewBest) NP.audio.fanfare();
    else NP.audio.gameOver();

    if (cb.onGameOver) cb.onGameOver(result);
  }

  /* --------------------------------------------------------------- API */

  NP.session = {
    get state() { return state; },

    isPlaying: function () {
      return state != null && state.phase !== 'over';
    },

    /* `startLevel` is 0-based and only used by the ?level= debug hook. */
    start: function (settings, playRect, callbacks, startLevel) {
      cb = callbacks || {};
      var preset = NP.questions.preset(settings.difficulty);

      state = {
        settings: settings,
        preset: preset,
        pool: NP.questions.buildPool(settings),
        facts: NP.storage.loadFacts(),
        topicKey: NP.questions.topicKey(settings),
        playRect: playRect,

        score: 0,
        lives: MAX_LIVES,
        streak: 0,
        bestStreak: 0,
        answered: 0,
        correct: 0,
        misses: {},

        levelIndex: 0,
        level: null,
        cfg: null,
        levelQuestion: 0,
        levelCorrect: 0,
        levelMisses: 0,
        livesAtLevelStart: MAX_LIVES,
        stars: [],
        bananas: 0,
        awaitContinue: false,

        question: null,
        bubbles: [],
        recentKeys: [],
        shuffled: false,

        phase: 'intro',
        phaseTime: 0,
        phaseDuration: 0,
        questionTime: 0,
        paused: false
      };

      NP.effects.reset();
      if (cb.onScore) cb.onScore(0, 0);
      if (cb.onLives) cb.onLives(MAX_LIVES);
      if (cb.onStreak) cb.onStreak(0);

      var from = Math.max(0, startLevel | 0);

      /* Jumping straight to level 13 has to look like having got there, or
         every display driven by the run's history contradicts the level
         number — the progress vine sits at nothing, the banana tally reads
         zero, and the game-over card claims no levels were cleared. Credit
         the skipped levels so the debug hook produces a state the rest of
         the game can believe. */
      state.debugJump = from > 0;
      for (var lv = 0; lv < from; lv++) {
        state.stars.push(3);
        state.bananas++;
      }

      beginLevel(from);
      return state;
    },

    setPlayRect: function (rect) {
      if (state) state.playRect = rect;
    },

    update: function (dt) {
      if (!state) return;

      /* One early return freezes the lot: bubbles stop drifting, the clock
         stops draining and the reveal stops counting down, so a question
         paused mid-answer comes back exactly as it was left. */
      if (state.paused) return;

      NP.bubbles.update(state.bubbles, dt, state.playRect, state.cfg, onEscape);
      NP.effects.update(dt);

      if (state.phase === 'intro') {
        state.phaseTime += dt;
        if (state.phaseTime >= state.phaseDuration) nextQuestion();

      } else if (state.phase === 'asking') {
        state.questionTime += dt;

        /* Where a bubble can escape, the descent is the clock — so the bar
           tracks how close the answer is to leaving rather than a stopwatch
           whose relevance is invisible. It follows the correct bubble only:
           draining the bar for a wrong answer nobody was going to tap would
           be a lie. */
        var remaining;
        if (state.cfg.mode.escaped) {
          remaining = 1 - NP.motion.progress(state.bubbles, state.playRect, state.cfg.mode);
        } else {
          remaining = 1 - state.questionTime / state.cfg.timeout;
        }
        if (remaining < 0) remaining = 0;
        if (cb.onTimer) cb.onTimer(remaining);

        if (state.cfg.shuffle && !state.shuffled &&
            state.questionTime >= state.cfg.timeout * SHUFFLE_AT) {
          state.shuffled = true;
          if (NP.motion.beginShuffle(state.bubbles)) NP.audio.rustle();
        }

        // In an escape mode this is only a backstop against a stuck state.
        if (state.questionTime >= state.cfg.timeout) onMissed('timeout', null);

      } else if (state.phase === 'between') {
        state.phaseTime += dt;
        if (state.phaseTime >= state.phaseDuration) {
          if (state.lives <= 0) gameOver();
          else if (state.levelQuestion >= state.level.questions) finishLevel();
          else nextQuestion();
        }

      } else if (state.phase === 'celebrating') {
        if (state.awaitContinue) return;         // the card is waiting on a tap
        state.phaseTime += dt;
        if (state.phaseTime >= state.phaseDuration) beginLevel(state.levelIndex + 1);
      }
    },

    isPaused: function () { return !!(state && state.paused); },

    /* Returns false when there was nothing to pause, so the caller doesn't
       raise the pause card over a run that has already ended. */
    pause: function () {
      if (!state || state.phase === 'over' || state.paused) return false;
      state.paused = true;
      NP.input.setEnabled(false);
      return true;
    },

    resume: function () {
      if (!state || !state.paused) return;
      state.paused = false;
      // Only a live question takes taps; every other phase was already
      // holding input shut when the pause landed.
      NP.input.setEnabled(state.phase === 'asking');
    },

    /* The big level-clear card's Continue button. */
    continueLevel: function () {
      if (!state || state.phase !== 'celebrating') return;
      state.awaitContinue = false;
      beginLevel(state.levelIndex + 1);
    },

    /* Called by the input layer for both taps and swipes. */
    hit: function (bubble) {
      if (!state || state.phase !== 'asking' || !bubble) return;
      if (bubble.correct) onCorrect(bubble);
      else onMissed('wrong', bubble);
    },

    /* Player quit from the pause card. Ends the run without scoring it. */
    abandon: function () {
      if (!state) return;
      setPhase('over');
      NP.input.setEnabled(false);
      state = null;
    }
  };
})(window.NP = window.NP || {});
