/* The game state machine. All run state lives in one object so it can be
   logged, serialised and inspected — which is what makes a bad round
   reproducible instead of a mystery.

   Phases:
     intro       — the level card is up, the field is empty
     asking      — bubbles are live, the clock is draining, input is open
     between     — the answer has landed; a short pause to show what happened
     celebrating — the level is cleared and being celebrated
     over        — the run has ended

   A level decides how the bubbles move, how many questions clear it and how
   much pressure it applies. The difficulty preset the player chose sets the
   band all of that moves inside — how hard the maths is, and what a full
   clock and a full field are worth — so the whole ladder is reachable at
   every difficulty and Easy stays Easy the whole way up. */
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

  /* ---- power-ups ----
     Earned at a streak milestone and held until spent, which is the whole
     point: the interesting moment is not using one, it is deciding whether
     this question is worth it or whether the boss two levels away is. Two at
     a time, because an inventory you cannot hold in your head stops being a
     decision and starts being a menu. */
  var POWER_KINDS  = ['slow', 'freeze', 'fifty'];
  var MAX_POWERS   = 2;
  var SLOW_FACTOR  = 0.4;      // everything moves at this rate for the rest
                               // of the question
  var FREEZE_TIME  = 3;        // ...or stops dead for this long

  /* ---- second chances ----
     One per level when the setting is on. A wrong tap normally costs a heart
     *and* four and a half seconds of reveal, which is a hard stack to land on
     a six-year-old who slipped.

     Only the opening levels get one. Those are where a child is still learning
     what a tap costs, and a slip there should not end the run; by level three
     the rules are understood and the hearts are supposed to mean something. */
  var RETRIES_PER_LEVEL = 1;
  var RETRY_LAST_LEVEL  = 2;   // 1-based: levels 1 and 2 only

  /* ---- the Big Boss ----
     Level 13 never completes, so it is measured in waves instead. A wave
     scores, re-tunes the run a notch faster and rolls straight on; it never
     raises a card or waits for a tap, because the whole point of the Big
     Boss is that it does not stop.

     No hearts come back out here — the level-12 boss refills one on the way
     in, and that top-up is the last one a run gets. */
  var WAVE_INTRO = 1.2;               // the beat between one wave and the next
  var CLEAN_WAVES_PER_BANANA = 5;     // five in a row, no misses, no slips

  var state = null;
  var cb = {};

  /* How crowded the field is comes from the level tuning, not straight from
     the preset: the ladder thins it out while the rules are still being
     learned and packs it again in its back half, and the Big Boss keeps
     adding to it long after the clock has stopped tightening. */
  function bubbleCount(cfg) {
    // Four is 4 or 5, so consecutive questions don't look identical.
    return cfg.bubbles === 4 ? NP.rng.int(4, 5) : cfg.bubbles;
  }

  /* The fact pool belongs to the level, not to the run: past the opening
     rungs the freebies come out of it, and it has to be the trimmed pool the
     mastery weighting draws from — filtering per draw would leave them in it
     and they would keep coming back around.

     Rebuilt only when the answer actually changes. It is cheap, but it is not
     free, and once trimmed it stays trimmed for the rest of the climb. */
  function refreshPool() {
    var shaping = state.waveLevel || state.level;
    var want = !!NP.levels.shapes(shaping, state.preset, state.settings).noGimmes;
    if (want === state.poolTrimmed) return;
    state.poolTrimmed = want;
    state.pool = NP.questions.buildPool(state.settings, { noGimmes: want });
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

    state.levelQuestion = 0;
    state.levelCorrect = 0;
    state.levelMisses = 0;
    state.levelSlips = 0;
    state.retryLeft = (state.settings.retry && state.level.n <= RETRY_LAST_LEVEL)
      ? RETRIES_PER_LEVEL : 0;
    state.livesAtLevelStart = state.lives;
    state.bubbles = [];
    state.awaitContinue = false;

    /* The Big Boss has no fixed tuning of its own — every wave brings its
       own, so the first one is set up here and the rest follow from it. */
    if (state.level.endless) {
      state.wave = 0;
      state.cleanWaves = 0;
      state.waveLevel = null;
      beginWave();
    } else {
      state.waveLevel = null;
      state.cfg = NP.levels.tuning(state.preset, state.level);
    }

    refreshPool();

    if (cb.onRetry) cb.onRetry(state.retryLeft);

    /* Recorded on arrival rather than on completion: dying on level 7 still
       means you got to level 7. A ?level= jump is exempt — it would write a
       best level that was never actually climbed, and that record outlives
       the debug session. */
    if (!state.debugJump) NP.storage.setBestLevel(state.topicKey, state.level.n);

    if (cb.onLevelStart) cb.onLevelStart(state.level, state);
    NP.playthings.announce();
    setPhase('intro', INTRO_TIME);
  }

  /* ---------------------------------------------------------- Big Boss */

  /* One wave. It re-tunes the run in place — new movement, a notch more
     speed — without touching the level it belongs to, which is what lets
     that level go on forever. */
  function beginWave() {
    var prev = state.waveLevel ? state.waveLevel.mode : null;

    state.wave++;
    state.waveLevel = NP.levels.wave(state.wave, prev);
    state.cfg = NP.levels.tuning(state.preset, state.waveLevel);

    /* The wave is what the pips and the clean-run rule both measure now, so
       their counters restart with it rather than with the level. */
    state.levelQuestion = 0;
    state.levelMisses = 0;
    state.levelSlips = 0;

    if (cb.onWave) cb.onWave(state.wave, state.waveLevel, state);
  }

  /* A wave cleared. Unlike a level this raises no card, waits for no tap and
     hands back no heart: it scores, pays out anything earned, and rolls
     straight into the next wave. */
  function finishWave() {
    var bonus = NP.scoring.waveBonus(state.wave, state.preset);
    state.score += bonus;

    /* Judged exactly the way a three-star level is, so a Big Boss banana
       costs what a ladder banana costs. Any miss or slip resets the run of
       them — five *in a row* is the price, not five in total. */
    var clean = state.levelMisses === 0 && state.levelSlips === 0;
    state.cleanWaves = clean ? state.cleanWaves + 1 : 0;

    var earned = false;
    if (state.cleanWaves >= CLEAN_WAVES_PER_BANANA) {
      state.cleanWaves = 0;
      state.bananas++;
      earned = true;
      NP.playthings.eat();
    }

    // Recorded on completion rather than arrival: a wave you were part-way
    // through when the run ended is not a wave you survived.
    if (!state.debugJump) NP.storage.setBestWave(state.topicKey, state.wave);

    var summary = {
      wave: state.wave,
      bonus: bonus,
      clean: clean,
      banana: earned,
      score: state.score,
      bananas: state.bananas
    };

    if (cb.onScore) cb.onScore(state.score, bonus);
    if (cb.onWaveClear) cb.onWaveClear(summary);

    /* Announced after the clear, so the banner naming the next wave is the
       one left standing. Then a short beat on the intro phase — update()
       already moves from intro into the next question when it elapses, so
       the Big Boss needs no phase of its own. */
    beginWave();
    setPhase('intro', WAVE_INTRO);
  }

  /* ------------------------------------------------------------- levels */

  /* A used second chance costs the third star, and with it the banana. The
     jungle is supposed to be a record of clean levels, so a level that needed
     rescuing must not grow anything. */
  function starsFor() {
    if (state.levelMisses === 0 && state.levelSlips === 0 &&
        state.lives >= state.livesAtLevelStart) return 3;
    if (state.levelMisses <= 1) return 2;
    return 1;
  }

  function finishLevel() {
    var level = state.level;
    var stars = starsFor();
    var bonus = NP.scoring.levelBonus(level, stars, state.preset);

    state.score += bonus;
    state.stars.push(stars);
    if (stars === 3) { state.bananas++; NP.playthings.eat(); }

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
    NP.playthings.cheer(true);

    // The big card waits for a tap; the quick one runs itself out.
    state.awaitContinue = summary.big;
    setPhase('celebrating', summary.big ? 0 : CELEBRATE_TIME);
    if (cb.onLevelClear) cb.onLevelClear(summary);
  }

  /* ---------------------------------------------------------- questions */

  /* Two bubbles for a true-or-false question and no distractors: the claim is
     either right or it is not. They carry 1 and 0 so every hit test, escape
     and reveal downstream keeps working on values, and the thumbs are put on
     afterwards as a way of drawing them. */
  function spawnFor(q) {
    if (q.form === 'judge') {
      var pair = [1, 0];
      NP.rng.shuffle(pair);
      var list = NP.bubbles.spawn(pair, q.answer, state.playRect, state.cfg);
      for (var i = 0; i < list.length; i++) {
        list[i].glyph = list[i].value ? 'yes' : 'no';
      }
      return list;
    }

    var count = bubbleCount(state.cfg);
    var wrong = NP.distractors.generate(q, count - 1, state.cfg.nearRatio);
    var values = [q.answer].concat(wrong);
    NP.rng.shuffle(values);
    return NP.bubbles.spawn(values, q.answer, state.playRect, state.cfg);
  }

  function nextQuestion() {
    /* The wave, where there is one: a Big Boss wave carries its own pressure
       and the level behind it is frozen at the first, so asking the level
       would hold the question shapes at wave 1 for the rest of the run. */
    var shaping = state.waveLevel || state.level;
    var q = NP.questions.next(state.settings, state.pool, state.facts,
                              state.recentKeys,
                              NP.levels.shapes(shaping, state.preset, state.settings));

    state.recentKeys.push(q.key);
    if (state.recentKeys.length > RECENT_MEMORY) state.recentKeys.shift();

    state.question = q;
    state.questionTime = 0;
    state.shuffled = false;

    // Slow-mo lasts the question it was spent on, and no longer.
    state.slowed = false;
    state.freezeLeft = 0;

    state.bubbles = spawnFor(q);

    setPhase('asking');
    NP.playthings.watch();
    if (cb.onQuestion) cb.onQuestion(q, state);
    // What the strip shows depends on the question's shape, so it is repainted
    // per question and not only when a power is earned or spent.
    emitPowers();
    if (cb.onTimer) cb.onTimer(1);
    if (cb.onFlow) cb.onFlow('normal');
  }

  /* ------------------------------------------------------------- powers */

  /* Hand over an earned power, or keep it on the meter until there is room.

     Banking matters now that the charge meter is on screen: a child who has
     just answered five in a row watches the meter fill and gets nothing if
     both slots are taken, which teaches them the meter lies. It waits
     instead, and drops the moment a slot frees. At most one waits — the cap
     is meant to keep the inventory small enough to hold in your head, and a
     queue behind it would quietly undo that.

     Returns true when the strip actually changed. */
  function grantPower() {
    if (state.powers.length >= MAX_POWERS) {
      state.banked = true;
      return false;
    }
    state.powers.push(NP.rng.pick(POWER_KINDS));
    state.banked = false;
    return true;
  }

  /* The streak, and the same streak read as progress toward the next power.
     `awarded` marks the one tick where the meter is paying out, so the HUD
     can flash it full on the way to empty instead of just dropping to zero —
     which is what a broken streak looks like. */
  function emitStreak(awarded) {
    if (cb.onStreak) cb.onStreak(state.streak);
    if (cb.onCharge) {
      cb.onCharge({
        filled: state.banked ? NP.scoring.MILESTONE
                             : NP.scoring.streakCharge(state.streak),
        total: NP.scoring.MILESTONE,
        banked: !!state.banked,
        awarded: !!awarded
      });
    }
  }

  /* The held strip as the HUD should draw it. A true-or-false question is two
     bubbles with one of them right, so the 50:50 has no pair to take away —
     rather than leave a button whose only possible answer is to refuse the
     tap, its slot goes out empty for that question and comes back on the
     next. The slot is blanked rather than dropped so the remaining buttons
     keep their index into `state.powers`, which is what usePower is given. */
  function visiblePowers() {
    var judging = !!(state.question && state.question.form === 'judge');
    var out = [];
    for (var i = 0; i < state.powers.length; i++) {
      out.push(judging && state.powers[i] === 'fifty' ? null : state.powers[i]);
    }
    return out;
  }

  function emitPowers() {
    if (cb.onPowers) cb.onPowers(visiblePowers());
  }

  function wrongAlive() {
    var out = [];
    for (var i = 0; i < state.bubbles.length; i++) {
      var b = state.bubbles[i];
      if (b.state === 'alive' && !b.correct) out.push(b);
    }
    return out;
  }

  /* The 50:50. Fading rather than popping: a pop is the sound and the shape
     of a right answer, and borrowing it here would teach the wrong thing. */
  function dissolveTwo() {
    var wrong = NP.rng.shuffle(wrongAlive());
    for (var i = 0; i < 2 && i < wrong.length; i++) {
      NP.effects.dust(wrong[i].x, wrong[i].y, wrong[i].r);
      NP.bubbles.fade(wrong[i]);
    }
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
    emitStreak();
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
    NP.playthings.cheer(NP.scoring.isMilestone(state.streak));
    NP.bubbles.pop(bubble);
    fadeOthers(bubble);

    // A bubble bursts into the colour it was, so a gold or red thumb doesn't
    // scatter green confetti across the field.
    var skin = burstSkin(bubble);
    NP.effects.burst(bubble.x, bubble.y, bubble.r, skin.chips, 20);
    NP.effects.ring(bubble.x, bubble.y, bubble.r, skin.ring);
    NP.effects.floatText(bubble.x, bubble.y - bubble.r * 0.6,
      '+' + points, NP.theme.pointsText, Math.max(20, bubble.r * 0.5));

    var earned = NP.scoring.isMilestone(state.streak);
    if (earned) {
      NP.audio.streak();
      NP.effects.floatText(state.playRect.left + (state.playRect.right - state.playRect.left) / 2,
        state.playRect.top + 40, state.streak + ' in a row!', NP.theme.streakGold, 26);
      if (grantPower()) emitPowers();
    }

    if (cb.onScore) cb.onScore(state.score, points);
    emitStreak(earned);
    if (cb.onLevelProgress) cb.onLevelProgress(state.levelQuestion, state.level.questions);

    setPhase('between', PAUSE_CORRECT);
  }

  /* What a bubble is made of, for the confetti and ring it bursts into.
     Green for a numbered bubble, and for the true-or-false pair whichever of
     the two answer colours it was wearing. */
  function burstSkin(bubble) {
    var T = NP.theme;
    if (bubble.glyph === 'yes') {
      return { chips: [T.revealLight, T.reveal, T.revealRim, T.white], ring: T.revealLight };
    }
    if (bubble.glyph === 'no') {
      return { chips: [T.wrongLight, T.wrong, T.wrongRim, T.white], ring: T.wrongLight };
    }
    return { chips: [T.bubbleLight, T.bubble, T.bubbleRim, T.white], ring: T.bubbleLight };
  }

  /* Taking a wrongly tapped bubble away.

     A wrong tap normally announces itself by the bubble turning red on the
     way out. The true-or-false pair has already spent red on saying "thumbs
     down", so a wrong tap there would be a red bubble turning red — nothing
     at all. They get a white ring popping off the bubble instead, which is
     the same beat and needs no colour the pair hasn't already used. */
  function takeWrong(bubble) {
    NP.bubbles.markWrong(bubble);
    NP.effects.dust(bubble.x, bubble.y, bubble.r);
    if (bubble.glyph) NP.effects.ring(bubble.x, bubble.y, bubble.r, NP.theme.white);
  }

  /* Every way of getting a question wrong lands here: a wrong tap, the clock
     running out, or the answer escaping the field. They differ only in what
     is left on screen to point at, and in how long the pause needs to be. */
  function onMissed(reason, bubble) {
    var q = state.question;

    /* A second chance. Only a wrong *tap* can use one: a timeout or an
       escaped answer means the clock already ran out, and there is nothing
       left to go back to.

       It takes the bubble away and lets the child keep thinking — no reveal,
       because the answer is still worth working out, and no heart, because a
       run should not end on a slip. The clock keeps running and the streak
       still breaks, so it is a real mistake with a softer landing. */
    if (reason === 'wrong' && state.retryLeft > 0 && bubble) {
      state.retryLeft--;
      state.levelSlips++;
      state.streak = 0;

      NP.storage.recordFact(q.key, false, 0);
      state.facts[q.key] = NP.storage.loadFacts()[q.key];

      NP.audio.wrong();
      NP.playthings.hide(0.7);
      takeWrong(bubble);
      NP.effects.shake(6, 0.14);

      emitStreak();
      if (cb.onRetry) cb.onRetry(state.retryLeft);
      return;
    }

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

    if (bubble) takeWrong(bubble);

    // Show what the answer was — the mistake is the teaching moment, and
    // skipping past it wastes the only part the child will remember.
    var pause = reason === 'wrong' ? PAUSE_WRONG : PAUSE_TIMEOUT;
    var right = findCorrectBubble();

    NP.playthings.hide(pause);

    if (right && right.state === 'alive') {
      NP.bubbles.reveal(right);
      // Gold on anything else; white on a thumb, which may already be gold.
      NP.effects.ring(right.x, right.y, right.r,
        right.glyph ? NP.theme.white : NP.theme.reveal);
    } else {
      // It escaped the field, so there is nothing left to circle. Say it
      // instead, and hold it for the same beat the gold bubble would get.
      right = null;
      var cx = (state.playRect.left + state.playRect.right) / 2;
      var cy = (state.playRect.top + state.playRect.bottom) / 2;
      NP.effects.floatText(cx, cy, NP.questions.reveal(q),
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

    /* Bananas are banked here rather than as each one is earned, so they
       reach the jungle as one event the child can watch happen on the way
       back to the home screen. Abandoning a run banks nothing, for the same
       reason it scores nothing — and a run that jumped up the ladder banks
       nothing either, on the same grounds as its score. */
    if (!state.debugJump) NP.storage.addBananas(state.bananas);

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

      /* 0 on a run that never reached the Big Boss. The game-over card tests
         it to decide which number it is reporting: past level 13 the ladder
         stops and the wave is the only thing still climbing. */
      wave: (state.level && state.level.endless) ? state.wave : 0,
      bestWave: NP.storage.getBestWave(state.topicKey),
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
        // Untrimmed to start with; beginLevel takes the freebies out at the
        // rung that asks for it, including on a ?level= jump straight past it.
        pool: NP.questions.buildPool(settings),
        poolTrimmed: false,
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
        levelSlips: 0,
        retryLeft: 0,
        livesAtLevelStart: MAX_LIVES,
        stars: [],
        bananas: 0,
        awaitContinue: false,

        // Only meaningful once the run reaches level 13.
        wave: 0,
        waveLevel: null,
        cleanWaves: 0,

        powers: [],
        banked: false,
        slowed: false,
        freezeLeft: 0,

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
      emitStreak();
      if (cb.onPowers) cb.onPowers([]);
      if (cb.onFlow) cb.onFlow('normal');

      // Past the ladder there is only the Big Boss, so a jump beyond it
      // credits the twelve levels that exist and no more.
      var from = Math.min(Math.max(0, startLevel | 0), NP.levels.endlessIndex);

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

      /* How the run is going, handed to the sideline gorilla as three 0..1
         dials: how far up the ladder, how far into the next power-up, and how
         much trouble the lives are in. He gets it every frame because the
         three of them are mutated in five different places between them, and
         a value read fresh cannot fall out of step with the score the way
         five separate notifications could. Past the authored twelve the
         ladder progress simply pins at 1. */
      NP.playthings.runMood(
        Math.min(1, (state.level.n - 1) / (NP.levels.authored - 1)),
        Math.min(1, state.streak / NP.scoring.MILESTONE),
        (MAX_LIVES - state.lives) / MAX_LIVES
      );

      /* Two clocks. `flow` is the one the question runs on — the bubbles and
         the timer both read it, so slowing it slows the question as a whole
         rather than making the bubbles crawl while the clock keeps draining.
         Effects and the sideline gorilla stay on real time: a slow-motion
         particle burst just looks like the game has hung. */
      var flow = dt;
      if (state.freezeLeft > 0) {
        state.freezeLeft -= dt;
        flow = 0;
        if (state.freezeLeft <= 0 && cb.onFlow) {
          cb.onFlow(state.slowed ? 'slow' : 'normal');
        }
      } else if (state.slowed) {
        flow = dt * SLOW_FACTOR;
      }

      NP.bubbles.update(state.bubbles, flow, state.playRect, state.cfg, onEscape);
      NP.effects.update(dt);

      if (state.phase === 'intro') {
        state.phaseTime += dt;
        if (state.phaseTime >= state.phaseDuration) nextQuestion();

      } else if (state.phase === 'asking') {
        state.questionTime += flow;

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
        NP.playthings.watchTimer(remaining);

        /* Against the answering clock, not the timeout. In an escape mode
           the timeout is a loose backstop — 45% of it lands well after the
           bubble has already left the field, so the twist used to be
           silently unreachable in every mode it was allowed in. */
        if (state.cfg.shuffle && !state.shuffled &&
            state.questionTime >= state.cfg.clock * SHUFFLE_AT) {
          state.shuffled = true;
          if (NP.motion.beginShuffle(state.bubbles)) NP.audio.rustle();
        }

        // In an escape mode this is only a backstop against a stuck state.
        if (state.questionTime >= state.cfg.timeout) onMissed('timeout', null);

      } else if (state.phase === 'between') {
        state.phaseTime += dt;
        if (state.phaseTime >= state.phaseDuration) {
          if (state.lives <= 0) gameOver();
          else if (state.levelQuestion >= state.level.questions) {
            // Same count either way — the Big Boss just never runs out of
            // waves to start next.
            if (state.level.endless) finishWave();
            else finishLevel();
          }
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

    /* Spend a held power-up. Returns false when there was nothing to spend or
       nothing for it to do, so the HUD can refuse the tap rather than
       swallowing a power the player would never see used. */
    usePower: function (index) {
      if (!state || state.phase !== 'asking' || state.paused) return false;

      var kind = state.powers[index];
      if (!kind) return false;

      // The strip already hides the 50:50 on a true-or-false question, so this
      // is the backstop for every other way the field can run short of two
      // wrong bubbles — and for a caller that is not the HUD.
      if (kind === 'fifty' && wrongAlive().length < 2) return false;

      state.powers.splice(index, 1);

      // A power earned while the strip was full has been waiting for exactly
      // this — the freed slot fills in the same beat the spent one empties.
      var released = state.banked && grantPower();

      if (kind === 'slow') state.slowed = true;
      else if (kind === 'freeze') state.freezeLeft = FREEZE_TIME;
      else dissolveTwo();

      NP.audio.sparkle();
      emitPowers();
      if (released) emitStreak(true);
      if (cb.onFlow) {
        cb.onFlow(state.freezeLeft > 0 ? 'freeze' : (state.slowed ? 'slow' : 'normal'));
      }
      return true;
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
