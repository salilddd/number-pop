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
    NP.playthings.tap(x, y);
  }

  function onSwipe(x1, y1, x2, y2) {
    if (NP.session.isPlaying()) {
      NP.session.hit(NP.bubbles.hitOnSegment(NP.session.state.bubbles, x1, y1, x2, y2));
      return;
    }
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

    NP.effects.banner(
      currentPlayRect(),
      'Level ' + level.n + (level.boss ? ' · Boss' : ''),
      level.name + ' — ' + level.hint,
      1.6,
      level.boss ? NP.theme.wrongLight : NP.theme.chalk
    );
  }

  function celebrateLevel(summary) {
    var rect = currentPlayRect();

    NP.effects.confetti(rect, summary.big ? 110 : 70);
    NP.effects.fireworks(rect, summary.big ? 7 : 4);
    NP.hud.setTimer(1);
    if (summary.heartRefilled) NP.audio.heart();

    if (summary.big) {
      // The full card takes over and waits for a tap.
      NP.screens.showLevelClear(summary);
      return;
    }

    NP.effects.banner(rect,
      'Level ' + summary.level.n + ' clear!',
      STAR_TEXT[summary.stars] + '   +' + NP.scoring.format(summary.bonus),
      1.9, NP.theme.streakGold);
  }

  /* ------------------------------------------------------------- flow */

  function startGame() {
    NP.audio.unlock();
    NP.audio.start();
    NP.screens.show('game');

    // The HUD must be laid out before its height can be measured.
    var rect = currentPlayRect();

    NP.session.start(settings, rect, {
      onScore:    function (score, delta) { NP.hud.setScore(score, delta); },
      onLives:    function (n) { NP.hud.setLives(n); },
      onQuestion: function (q) { NP.hud.setQuestion(q.text); },
      onTimer:    function (f) { NP.hud.setTimer(f); },
      onStreak:   function (n) { NP.hud.setStreak(n); },
      onLevelStart:    announceLevel,
      onLevelProgress: function (done, total) { NP.hud.setLevelProgress(done, total); },
      onLevelClear:    celebrateLevel,
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
    // through another callback, and it keeps the props' idea of where they
    // are impossible to get out of step with the actual screen.
    NP.playthings.setScreen(playing ? 'game' : NP.screens.current());

    if (playing) {
      NP.session.update(dt);
    } else {
      NP.bubbles.update(ambient, dt, NP.render.playRect(120), AMBIENT_CFG);
      NP.playthings.update(dt);
      NP.effects.update(dt);
    }

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
      rect: playing ? st.playRect : null,
      // One entry in `stars` per level cleared, so its length is the count.
      progress: playing
        ? { cleared: st.stars.length, stars: st.stars, bananas: st.bananas }
        : null
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
    NP.hud.init();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.NP = window.NP || {});
