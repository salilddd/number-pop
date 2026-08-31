/* Bootstrap and the frame tick.

   Owns exactly three things: wiring the modules together, deciding what the
   renderer draws this frame, and keeping the play rectangle correct across
   resizes and orientation changes. */
(function (NP) {
  'use strict';

  var canvas = null;
  var playfield = null;
  var settings = null;

  var ambient = [];            // decorative bubbles drifting behind the menus
  var AMBIENT_COUNT = 4;

  /* Bubbles take the level tuning object rather than a bare speed. Leaving
     `mode` out lets bubbles.js fall back to plain drift, which is all the
     menu decoration ever wants. */
  var AMBIENT_CFG = { speed: 22 };

  var lastShake = { x: 0, y: 0 };

  /* Bumped on every run. Anything scheduled against the run it was started
     in checks this before firing, so a celebration left in flight when the
     player quits cannot land on the run they start next. */
  var runToken = 0;

  /* --------------------------------------------------------- play area */

  function currentPlayRect() {
    // Measured from the live HUD rather than guessed, so safe-area insets
    // and late font loading can't push the question onto the bubbles.
    var top = NP.screens.current() === 'game' ? NP.hud.questionBottom() : 90;
    return NP.render.playRect(top);
  }

  function clampInto(list, rect, mode) {
    // Modes that stage bubbles off-screen, or let them leave by an edge,
    // must keep whatever position they have: dragging a bubble that is
    // still waiting above the top edge into view would teleport the answer
    // into the middle of the question. Their radius still gets clamped, so
    // a rotation onto a narrow screen cannot leave them oversized.
    var offField = !!(mode && (mode.staged || mode.escaped));

    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      b.r = Math.min(b.baseR, (rect.right - rect.left) / 2.4, (rect.bottom - rect.top) / 2.4);
      if (offField) continue;
      b.x = Math.max(rect.left + b.r, Math.min(rect.right - b.r, b.x));
      b.y = Math.max(rect.top + b.r, Math.min(rect.bottom - b.r, b.y));
    }
  }

  /* ---------------------------------------------------------- ambient */

  /* The radius is derived from a full set every time, so a single bubble
     spawned to replace a popped one comes back the same size as its
     neighbours instead of filling the screen. */
  function ambientRadius(rect) {
    return NP.bubbles.radiusFor(AMBIENT_COUNT, rect) * 0.72;
  }

  function addAmbient(count) {
    var rect = NP.render.playRect(120);
    var values = [];
    for (var i = 0; i < count; i++) values.push(NP.rng.int(2, 12) * NP.rng.int(2, 12));

    // findSpot only avoids the bubbles inside its own new list, so a
    // replacement can arrive overlapping; the pair solver separates it
    // within a frame or two, and it grows in from nothing meanwhile.
    var fresh = NP.bubbles.spawn(values, null, rect, AMBIENT_CFG);
    var r = ambientRadius(rect);
    for (var j = 0; j < fresh.length; j++) {
      fresh[j].r = r;                       // decorative, so keep them modest
      fresh[j].baseR = r;
      fresh[j].alpha = 0.62;
      ambient.push(fresh[j]);
    }
  }

  /* Popping the menu decoration is free delight, and it quietly teaches the
     one verb the whole game is built on before the child presses Play. */
  function popAmbient(b) {
    if (!b) return false;
    NP.audio.correct(0);
    NP.bubbles.pop(b);
    NP.effects.burst(b.x, b.y, b.r,
      [NP.theme.bubbleLight, NP.theme.bubble, NP.theme.bubbleRim, '#ffffff'], 14);
    NP.effects.ring(b.x, b.y, b.r);
    addAmbient(1);
    return true;
  }

  /* ------------------------------------------------------------- input */

  function onTap(x, y) {
    if (NP.session.isPlaying()) {
      NP.session.hit(NP.bubbles.hitAtPoint(NP.session.state.bubbles, x, y));
      return;
    }
    // The bubbles are drawn in front of the props, so they get first refusal
    // on the tap — whatever the child can see on top is what answers.
    if (popAmbient(NP.bubbles.hitAtPoint(ambient, x, y))) return;
    if (plantFromPile(x, y)) return;
    NP.playthings.tap(x, y);
  }

  /* Spending a banana on the jungle, by tapping the pile it is sitting in.

     This is the other half of tossBanana below: one flies from the play field
     to the pile when it is earned, and one flies from the pile to a plot when
     it is spent. A child can watch the whole life of a banana, which is the
     point — growth used to happen off-screen between visits, so the reward
     arrived with nobody looking at it.

     Tested before playthings because the pile is drawn on top of the entire
     menu scene, and hit order has to follow draw order. */
  function plantFromPile(x, y) {
    var rect = NP.render.playRect(120);
    if (!NP.progressArt.hits(rect, x, y, NP.storage.getBananas())) return false;

    var spot = NP.garden.nextSpot();      // before spending: spending moves it
    var from = NP.progressArt.target(rect);
    var result = NP.garden.spend();

    if (result !== 'grown') {
      /* A refusal is a real answer. The jungle being full is worth saying out
         loud rather than going quiet, which would read as a dead button. */
      NP.audio.click();
      NP.effects.shake(4, 0.12);
      return true;
    }

    NP.progressArt.pop();
    NP.audio.sparkle();
    NP.effects.toss(from.x, from.y, spot.x, spot.y, function () {
      NP.audio.rustle();
      NP.effects.burst(spot.x, spot.y, 24,
        [NP.theme.grown1, NP.theme.grown3, NP.theme.streakGold], 10);
    });
    NP.screens.refreshHome();
    return true;
  }

  function onSwipe(x1, y1, x2, y2) {
    if (NP.session.isPlaying()) {
      NP.session.hit(NP.bubbles.hitOnSegment(NP.session.state.bubbles, x1, y1, x2, y2));
      return;
    }

    /* A finger dragging a banana across the menu is carrying something, not
       swiping at the bubbles behind it — and popping three of them on the way
       to the gorilla's mouth is not what it was aiming at. */
    if (NP.playthings.carrying()) return;

    popAmbient(NP.bubbles.hitOnSegment(ambient, x1, y1, x2, y2));
  }

  /* ------------------------------------------------- levels and rewards */

  var STAR_TEXT = ['☆☆☆', '★☆☆', '★★☆', '★★★'];

  /* ?level=7 starts a run on level 7. Levels past the first boss are forty
     correct answers away otherwise, which makes them untestable. */
  function debugStartLevel() {
    var m = /[?&]level=(\d+)/.exec(window.location.search);
    return m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
  }

  /* The card at the head of every level. It has to land before the first
     question, because two of the modes can take a life from a child who
     does not yet know the rule. */
  function announceLevel(level) {
    NP.hud.setLevel(level);
    NP.hud.setLevelProgress(0, level.questions);
    NP.hud.setTimer(1);

    // The Big Boss gets a longer card and its own line: it is the last level
    // there is, and arriving at it should not read like arriving at another.
    NP.effects.banner(
      currentPlayRect(),
      level.endless
        ? 'Level ' + level.n + ' · Big Boss'
        : 'Level ' + level.n + (level.boss ? ' · Boss' : ''),
      level.endless ? level.hint : level.name + ' — ' + level.hint,
      level.endless ? 2.2 : 1.6,
      level.boss ? NP.theme.wrongLight : NP.theme.chalk
    );
  }

  /* Each wave of the Big Boss. Wave one is announced by the level card that
     is already on screen saying the same thing, so it gets the chip and the
     pips but not a second plaque stacked on the first. */
  function announceWave(wave, waveLevel) {
    NP.hud.setWave(wave);
    NP.hud.setLevelProgress(0, waveLevel.questions);
    NP.hud.setTimer(1);

    /* Every wave hangs a banana on the finished vine, the first one
       included — which is why this sits above the early return: arriving at
       the Big Boss is exactly when the plant should visibly start fruiting. */
    NP.progressArt.sprout();

    if (wave <= 1) return;

    NP.effects.banner(currentPlayRect(), 'Wave ' + wave, waveLevel.hint,
                      1.1, NP.theme.wrongLight);
  }

  /* A wave cleared. Deliberately lighter than a level: no card, no pause and
     nothing to tap, because the Big Boss does not stop and so its
     celebration cannot either. */
  function celebrateWave(summary) {
    var rect = currentPlayRect();

    NP.effects.confetti(rect, 34);
    NP.hud.setTimer(1);
    NP.audio.levelUp(summary.wave);
    NP.playthings.cheer(summary.banana);

    NP.effects.floatText((rect.left + rect.right) / 2,
      rect.top + (rect.bottom - rect.top) * 0.3,
      'Wave ' + summary.wave + ' clear!   +' + NP.scoring.format(summary.bonus),
      NP.theme.streakGold, 26, 1.3);

    // Five clean waves is what a banana costs out here, so this is where one
    // gets sent — the same flight a three-star level sends.
    if (summary.banana) tossBanana(rect);
  }

  /* The banana's flight to the pile. This is the only thing in the game that
     connects earning one to where it lands — a tally that silently ticks up
     in a corner never taught anyone where the reward went.

     The target comes from progressArt rather than being written out again
     here, so the pile and the thing aimed at it cannot drift apart. */
  function tossBanana(rect) {
    var to = NP.progressArt.target(rect);

    NP.effects.toss((rect.left + rect.right) / 2,
                    rect.top + (rect.bottom - rect.top) * 0.42,
                    to.x, to.y, function () {
      NP.progressArt.pop();
      NP.audio.sparkle();
      NP.effects.burst(to.x, to.y, 22,
        [NP.theme.bananaLight, NP.theme.banana, NP.theme.streakGold], 12);
    });
  }

  /* An extra heart is the rarest thing a run can be handed — twice in twelve
     levels, and only if it was needed — so it gets the whole screen for a
     beat rather than a badge on a card the child taps straight past.

     The heart erupts in the middle, where they are already looking, and then
     flies to the strip in the corner, where it will matter. The HUD is
     holding the gain back until it lands (see hud.setLives), so the strip
     lighting up *is* the delivery rather than a coincidence next to it.

     The card that follows waits out the beat before it takes the screen. */
  var HEART_BEAT = 1500;

  function celebrateHeart(rect) {
    var x = (rect.left + rect.right) / 2;
    var y = rect.top + (rect.bottom - rect.top) * 0.42;
    // If the strip cannot be measured, aim at where it lives anyway: a heart
    // that flies off toward the corner still reads correctly.
    var to = NP.hud.livesAnchor() || { x: rect.right - 40, y: rect.top - 20 };

    // A tap that does nothing, sitting where the child has learned to reach.
    NP.hud.setPauseVisible(false);

    NP.audio.heart();
    NP.effects.flash(x, y, 170, 0.4);
    NP.effects.ring(x, y, 54, NP.theme.wrongLight);
    NP.effects.ring(x, y, 96, NP.theme.wrong);
    NP.effects.burst(x, y, 30,
      [NP.theme.wrong, NP.theme.wrongLight, NP.theme.white], 26);
    NP.effects.floatText(x, y - 66, 'EXTRA LIFE!', NP.theme.wrongLight, 42, 1.5);

    NP.effects.toss(x, y, to.x, to.y, function () {
      NP.hud.releaseLives();
      NP.audio.sparkle();
      NP.effects.flash(to.x, to.y, 60, 0.26);
      NP.effects.ring(to.x, to.y, 26, NP.theme.wrongLight);
      NP.effects.burst(to.x, to.y, 18,
        [NP.theme.wrongLight, NP.theme.white, NP.theme.wrong], 16);
    }, 'heart');
  }

  /* The card, once the heart has finished flying — and once the run is
     actually back on the play field to receive it. Anything can happen
     inside a beat this long: Escape, the hardware back button and a tab
     switch all pause, and a card raised over the pause screen would look
     like the run had resumed itself. So a pause holds the card rather than
     losing it, and leaving the run drops it for good — `token` is what tells
     those two apart, since quitting and starting again lands back on the
     play field looking exactly like never having left. */
  function raiseLevelClear(summary, token) {
    if (token !== runToken || !NP.session.isPlaying()) return;
    if (NP.screens.current() !== 'game' || NP.session.isPaused()) {
      window.setTimeout(function () { raiseLevelClear(summary, token); }, 200);
      return;
    }
    NP.screens.showLevelClear(summary);
  }

  function celebrateLevel(summary) {
    var rect = currentPlayRect();

    NP.effects.confetti(rect, summary.big ? 110 : 70);
    NP.effects.fireworks(rect, summary.big ? 7 : 4);
    NP.hud.setTimer(1);

    // Three stars is what a banana costs, so this is where one gets sent.
    if (summary.stars === 3) tossBanana(rect);

    if (summary.heartRefilled) celebrateHeart(rect);

    if (summary.big) {
      /* The full card takes over and waits for a tap — but not until the
         heart has finished flying, or the one moment it was thrown for
         happens behind the card. */
      if (summary.heartRefilled) {
        window.setTimeout(function () { raiseLevelClear(summary, runToken); },
                          HEART_BEAT);
      } else {
        NP.screens.showLevelClear(summary);
      }
      return;
    }

    NP.effects.banner(rect,
      'Level ' + summary.level.n + ' clear!',
      STAR_TEXT[summary.stars] + '   +' + NP.scoring.format(summary.bonus),
      1.9, NP.theme.streakGold);
  }

  /* ------------------------------------------------------------- flow */

  function startGame() {
    runToken++;
    NP.audio.unlock();
    NP.audio.start();
    NP.hud.resetLives();
    NP.screens.show('game');

    // The HUD must be laid out before its height can be measured.
    var rect = currentPlayRect();

    NP.session.start(settings, rect, {
      onScore:    function (score, delta) { NP.hud.setScore(score, delta); },
      onLives:    function (n, max, gained) { NP.hud.setLives(n, max, gained); },
      onQuestion: function (q) { NP.hud.setQuestion(q.text, q.form); },
      onTimer:    function (f) { NP.hud.setTimer(f); },
      onStreak:   function (n) { NP.hud.setStreak(n); },
      onCharge:   function (c) { NP.hud.setCharge(c); },
      onPowers:   function (list) { NP.hud.setPowers(list); },
      onRetry:    function (n, spent) { NP.hud.setRetry(n, spent); },
      onFlow:     function (kind) { NP.hud.setFlow(kind); },
      onLevelStart:    announceLevel,
      onLevelProgress: function (done, total) { NP.hud.setLevelProgress(done, total); },
      onLevelClear:    celebrateLevel,
      onWave:          announceWave,
      onWaveClear:     celebrateWave,
      onGameOver: function (result) { NP.screens.showGameOver(result); }
    }, debugStartLevel());
  }

  /* The big level-clear card's Continue button. Back to the game screen
     first, so the next level's card is positioned against a laid-out HUD. */
  function continueLevel() {
    NP.screens.show('game');
    NP.session.continueLevel();
  }

  function quitGame() {
    NP.session.abandon();
    NP.effects.reset();
    NP.screens.show('home');
  }

  /* ------------------------------------------------------------- pause */

  /* Only a live question can be paused. During the level-clear card the run
     is already stopped, and pausing a run that has ended would raise the
     card over the game-over screen. */
  function pauseGame() {
    if (NP.screens.current() !== 'game') return;
    if (!NP.session.pause()) return;
    NP.screens.showPaused(NP.session.state);
  }

  /* show() first, then resume(): the screen change shuts input off, and the
     session is what knows whether the phase it froze in should take taps. */
  function resumeGame() {
    if (!NP.session.isPaused()) return;
    NP.screens.show('game');
    NP.session.resume();
  }

  function restartGame() {
    NP.session.abandon();
    NP.effects.reset();
    startGame();
  }

  /* ------------------------------------------------------------- frame */

  function tick(dt) {
    var playing = NP.session.isPlaying();

    // One string compare a frame is cheaper than routing screen changes
    // through another callback, and it keeps the scenery's idea of where it
    // is impossible to get out of step with the actual screen.
    var where = playing ? 'game' : NP.screens.current();
    NP.playthings.setScreen(where);
    NP.garden.setScreen(where);

    if (playing) {
      NP.session.update(dt);
    } else {
      NP.bubbles.update(ambient, dt, NP.render.playRect(120), AMBIENT_CFG);
      NP.garden.update(dt);
      NP.effects.update(dt);
    }

    /* The props tick on both sides of that branch. On the menus they are the
       whole scene; during a run the sideline gorilla is still watching, and
       he is the one thing in there that a live question wants.

       A pause is the exception: the session freezes itself, and a gorilla
       still rocking away behind the pause card is the one thing on screen
       that would give away that the game had not really stopped. */
    NP.playthings.update(playing && NP.session.isPaused() ? 0 : dt);

    NP.hud.update(dt);
    NP.ambience.update(dt);

    // Shake the canvas and the in-game HUD together, as one jolt.
    var shake = NP.effects.shakeOffset();
    if (shake.x !== lastShake.x || shake.y !== lastShake.y) {
      playfield.style.transform = (shake.x || shake.y)
        ? 'translate(' + shake.x + 'px,' + shake.y + 'px)'
        : '';
      lastShake = shake;
    }

    var st = playing ? NP.session.state : null;
    NP.render.frame({
      bubbles: playing ? st.bubbles : ambient,
      showCanopy: !playing,
      // progressArt is skipped without a rect, so the menus have to pass the
      // one the ambient bubbles already use or the pile below never draws.
      rect: playing ? st.playRect : NP.render.playRect(120),

      /* One entry in `stars` per level cleared, so its length is the count.

         Off the play screens the same pile shows the *banked* total instead.
         The vine is the shape of a single run, so it stays home — `cleared: 0`
         draws nothing — but bananas are a lifetime tally, and the home screen,
         standing in front of the jungle they paid for, is exactly where a
         child goes looking for them. */
      progress: playing
        ? { cleared: st.stars.length, stars: st.stars, bananas: st.bananas,
            /* 0 anywhere but the Big Boss, the same test the game-over card
               makes: past level 13 the ladder has stopped and the wave is the
               only thing still climbing, so it is what the vine grows on. */
            wave: (st.level && st.level.endless) ? st.wave : 0 }
        : { cleared: 0, stars: [], bananas: NP.storage.getBananas(), wave: 0 }
    });
  }

  /* ------------------------------------------------------------ resize */

  var resizeTimer = 0;
  function onResize() {
    window.clearTimeout(resizeTimer);
    // Rebuilding the scenery layer is the expensive part, so coalesce the
    // burst of events an orientation change produces.
    resizeTimer = window.setTimeout(function () {
      NP.render.resize();
      var rect = currentPlayRect();
      if (NP.session.isPlaying()) {
        var st = NP.session.state;
        NP.session.setPlayRect(rect);
        clampInto(st.bubbles, rect, st.cfg && st.cfg.mode);
      }
      clampInto(ambient, NP.render.playRect(120), null);
    }, 120);
  }

  /* -------------------------------------------------------------- init */

  function init() {
    canvas = document.getElementById('stage');
    playfield = document.getElementById('playfield');

    NP.render.init(canvas);
    NP.hud.init({
      onUsePower: function (i) { return NP.session.usePower(i); }
    });
    settings = NP.screens.init({
      onPlay: startGame,
      onQuit: quitGame,
      onPause: pauseGame,
      onResume: resumeGame,
      onRestart: restartGame,
      onLevelContinue: continueLevel
    });

    NP.input.attach(canvas, { onTap: onTap, onSwipe: onSwipe });
    NP.input.setEnabled(false);

    addAmbient(AMBIENT_COUNT);

    /* Age the jungle before the home screen is built, not after: `show`
       refreshes the line, and the line is where the child is told what died.
       Once per launch is the right cadence — a phone left open overnight is
       still yesterday's session, and a jungle that shrank while it was on
       screen would read as the game taking something. */
    NP.garden.age();

    NP.screens.show('home');
    NP.loop.start(tick);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // Audio contexts start suspended and can only be resumed from inside a
    // real gesture, so take the first one the page sees.
    document.addEventListener('pointerdown', function once() {
      NP.audio.unlock();
      document.removeEventListener('pointerdown', once);
    });

    /* Escape pauses rather than quits. Quitting is still two taps away on
       the card, which is the point: it used to end a run outright. */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (NP.session.isPaused()) resumeGame();
      else if (NP.session.isPlaying()) pauseGame();
    });

    /* Leaving the tab pauses the run. requestAnimationFrame stops on its own
       while the tab is hidden, so nothing was being lost — but coming back to
       a live clock and a half-answered question is its own way to lose a
       life, and a child switching apps mid-question has not given up. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseGame();
    });

    // Web fonts land after first paint; the bubble numbers are measured at
    // draw time so they self-correct, but the play rectangle is measured
    // once and needs a nudge.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (NP.session.isPlaying()) NP.session.setPlayRect(currentPlayRect());
      });
    }
  }

  /* --------------------------------------------------- native shell hook */

  /* The Android WebView shell calls this on the hardware back button and
     closes the app when it returns false. Back is the one system gesture
     that can end a run outright, so from the play field it pauses rather
     than quits — the same reasoning as Escape above, and the reason quitting
     still lives two taps deep on the pause card.

     Every branch mirrors what the equivalent on-screen button already does,
     so back is never a second, subtly different way out of a screen. */
  NP.app = {
    back: function () {
      switch (NP.screens.current()) {
        case 'game':       pauseGame();  return true;
        case 'paused':     resumeGame(); return true;
        case 'topics':
        case 'mastery':
        case 'settings':
        case 'gameover':   NP.screens.show('home'); return true;
        // The level card is the run's only checkpoint. Swallow back so a
        // stray swipe can't skip past the stars a level was just won with.
        case 'levelclear': return true;
        default:           return false;  // home — let the shell exit
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.NP = window.NP || {});
