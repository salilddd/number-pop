/* Screen routing and the topics/settings UI.

   Settings are written back to storage the moment they change, so quitting
   mid-thought never loses a choice. */
(function (NP) {
  'use strict';

  var TABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /* Filled by CSS, so one shape covers both the earned and unearned star. */
  var STAR_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44 ' +
    '6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95z"/></svg>';

  var DIFF_HINT = {
    easy:   '3 bubbles, drifting slowly, plenty of time. Wrong answers look obviously wrong.',
    normal: '4 or 5 bubbles at a steady drift. Wrong answers are a mix of near misses and easy ones.',
    hard:   '6 fast bubbles and a short clock. Wrong answers are the mistakes people actually make.'
  };

  /* The reset button walks idle → armed → cleared. Wiping a highscore is
     the one destructive thing in the game, so it always costs two taps. */
  var RESET_TEXT = {
    idle:    'Reset score',
    armed:   'Tap again to erase',
    cleared: 'Scores cleared'
  };
  var RESET_HOLD = { armed: 4000, cleared: 1800 };

  var el = {};
  var settings = null;
  var handlers = {};
  var current = 'home';
  var resetState = 'idle';
  var resetTimer = 0;

  /* ------------------------------------------------------------ helpers */

  function setChip(node, on) {
    node.classList.toggle('on', !!on);
    node.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  /* Restart a CSS animation that may already be running. Reading offsetWidth
     forces the style flush between the two class changes; without it the
     browser coalesces them and nothing replays. */
  function replay(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function save() {
    NP.storage.saveSettings(settings);
  }

  /* --------------------------------------------------------- reflection */

  function refresh() {
    each(el.opChips, function (c) {
      setChip(c, settings.ops.indexOf(c.dataset.op) >= 0);
    });

    each(el.tableChips, function (c) {
      setChip(c, settings.tables.indexOf(parseInt(c.dataset.table, 10)) >= 0);
    });

    each(el.rangeChips, function (c) {
      setChip(c, parseInt(c.dataset.maxmul, 10) === settings.maxMultiplier);
    });

    each(el.addChips, function (c) {
      setChip(c, parseInt(c.dataset.max, 10) === settings.addMax);
    });

    each(el.diffChips, function (c) {
      setChip(c, c.dataset.diff === settings.difficulty);
    });

    each(el.sndChips, function (c) {
      setChip(c, (c.dataset.snd === 'on') === !!settings.sound);
    });

    each(el.jngChips, function (c) {
      setChip(c, (c.dataset.jng === 'on') === !!settings.jungle);
    });

    var needsTables = settings.ops.indexOf('mul') >= 0 || settings.ops.indexOf('div') >= 0;
    var needsRange  = settings.ops.indexOf('add') >= 0 || settings.ops.indexOf('sub') >= 0;
    el.fieldTables.classList.toggle('hidden', !needsTables);
    el.fieldAddSub.classList.toggle('hidden', !needsRange);

    el.diffHint.textContent = DIFF_HINT[settings.difficulty] || '';
  }

  function refreshHome() {
    var best = NP.storage.getBestOverall();
    el.homeBest.textContent = NP.scoring.format(best.score);
    el.homeBestTopic.textContent = NP.questions.describe(settings);
  }

  function refreshSettings() {
    el.settingsBest.textContent = NP.scoring.format(NP.storage.getBestOverall().score);
  }

  function setResetState(state) {
    resetState = state;
    window.clearTimeout(resetTimer);
    el.resetBtn.textContent = RESET_TEXT[state];
    el.resetBtn.classList.toggle('armed', state === 'armed');
    el.resetBtn.classList.toggle('cleared', state === 'cleared');
    // An armed button that stays armed forever is a trap for the next tap,
    // so both of the loud states time out back to plain.
    if (state !== 'idle') {
      resetTimer = window.setTimeout(function () { setResetState('idle'); }, RESET_HOLD[state]);
    }
  }

  /* -------------------------------------------------------------- wiring */

  function buildTableGrid() {
    el.tableGrid.innerHTML = '';
    TABLES.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'chip table';
      b.dataset.table = String(t);
      b.textContent = String(t);
      b.setAttribute('aria-label', t + ' times table');
      el.tableGrid.appendChild(b);
    });
    el.tableChips = el.tableGrid.querySelectorAll('.chip.table');
  }

  function toggleInArray(arr, value, minimum) {
    var i = arr.indexOf(value);
    if (i >= 0) {
      // Never let the player empty the list — a game with no operations
      // selected has nothing to ask.
      if (arr.length <= (minimum || 1)) return false;
      arr.splice(i, 1);
    } else {
      arr.push(value);
    }
    return true;
  }

  function wire() {
    each(el.opChips, function (c) {
      c.addEventListener('click', function () {
        NP.audio.click();
        if (toggleInArray(settings.ops, c.dataset.op)) { save(); refresh(); }
      });
    });

    each(el.tableChips, function (c) {
      c.addEventListener('click', function () {
        NP.audio.click();
        if (toggleInArray(settings.tables, parseInt(c.dataset.table, 10))) { save(); refresh(); }
      });
    });

    each(el.rangeChips, function (c) {
      c.addEventListener('click', function () {
        NP.audio.click();
        settings.maxMultiplier = parseInt(c.dataset.maxmul, 10);
        save(); refresh();
      });
    });

    each(el.addChips, function (c) {
      c.addEventListener('click', function () {
        NP.audio.click();
        settings.addMax = parseInt(c.dataset.max, 10);
        save(); refresh();
      });
    });

    each(el.diffChips, function (c) {
      c.addEventListener('click', function () {
        NP.audio.click();
        settings.difficulty = c.dataset.diff;
        save(); refresh();
      });
    });

    each(el.sndChips, function (c) {
      c.addEventListener('click', function () {
        settings.sound = c.dataset.snd === 'on';
        NP.audio.setEnabled(settings.sound);
        // Sound Off has to stop the ambience scheduler, not just mute it.
        NP.ambience.applySettings(settings);
        if (settings.sound) NP.audio.click();
        save(); refresh();
      });
    });

    each(el.jngChips, function (c) {
      c.addEventListener('click', function () {
        settings.jungle = c.dataset.jng === 'on';
        NP.ambience.applySettings(settings);
        NP.audio.click();
        save(); refresh();
      });
    });

    el.allTables.addEventListener('click', function () {
      NP.audio.click();
      settings.tables = settings.tables.length === TABLES.length ? [2, 5, 10] : TABLES.slice();
      save(); refresh();
    });

    document.getElementById('btn-play').addEventListener('click', function () {
      NP.audio.click();
      handlers.onPlay();
    });

    document.getElementById('btn-topics').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('topics');
    });

    document.getElementById('btn-topics-back').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('home');
    });

    document.getElementById('btn-topics-play').addEventListener('click', function () {
      NP.audio.click();
      handlers.onPlay();
    });

    document.getElementById('btn-settings').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('settings');
    });

    document.getElementById('btn-settings-back').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('home');
    });

    document.getElementById('btn-settings-done').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('home');
    });

    el.resetBtn.addEventListener('click', function () {
      NP.audio.click();
      if (resetState === 'cleared') return;
      if (resetState === 'idle') { setResetState('armed'); return; }
      NP.storage.resetProgress();
      setResetState('cleared');
      refreshSettings();
      refreshHome();
    });

    document.getElementById('btn-pause').addEventListener('click', function () {
      NP.audio.click();
      handlers.onPause();
    });

    document.getElementById('btn-resume').addEventListener('click', function () {
      NP.audio.click();
      handlers.onResume();
    });

    document.getElementById('btn-pause-restart').addEventListener('click', function () {
      NP.audio.click();
      handlers.onRestart();
    });

    document.getElementById('btn-pause-quit').addEventListener('click', function () {
      NP.audio.click();
      handlers.onQuit();
    });

    document.getElementById('btn-over-ok').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('home');
    });

    document.getElementById('btn-over-again').addEventListener('click', function () {
      NP.audio.click();
      handlers.onPlay();
    });

    document.getElementById('btn-level-continue').addEventListener('click', function () {
      NP.audio.click();
      handlers.onLevelContinue();
    });

    document.getElementById('lvl-mascot').addEventListener('click', function () {
      if (!this.firstChild) return;
      NP.audio.thump();
      replay(this, 'thump');
    });

    /* The two bits of interactive scenery that are DOM rather than canvas.
       Both are decoration, so neither is focusable — a child finds them by
       poking at the screen, and a keyboard user loses nothing. */

    document.querySelector('.logo').addEventListener('click', function () {
      NP.audio.click();
      replay(this, 'wiggle');
    });

    // The mascot div exists from the start; mount() fills it on game over.
    document.getElementById('mascot').addEventListener('click', function () {
      if (!this.firstChild) return;
      NP.audio.thump();
      replay(this, 'thump');
    });
  }

  /* --------------------------------------------------------------- API */

  NP.screens = {
    init: function (h) {
      handlers = h;
      settings = NP.storage.loadSettings();
      NP.audio.setEnabled(settings.sound);
      NP.ambience.applySettings(settings);

      el.screens = {
        home:       document.getElementById('screen-home'),
        topics:     document.getElementById('screen-topics'),
        settings:   document.getElementById('screen-settings'),
        paused:     document.getElementById('screen-paused'),
        levelclear: document.getElementById('screen-levelclear'),
        gameover:   document.getElementById('screen-gameover')
      };
      el.opChips     = document.querySelectorAll('#op-chips .chip.op');
      el.tableGrid   = document.getElementById('table-grid');
      el.rangeChips  = document.querySelectorAll('.chip.range');
      el.addChips    = document.querySelectorAll('.chip.addmax');
      el.diffChips   = document.querySelectorAll('.chip.diff');
      el.sndChips    = document.querySelectorAll('.chip.snd');
      el.jngChips    = document.querySelectorAll('.chip.jng');
      el.allTables   = document.getElementById('btn-all-tables');
      el.fieldTables = document.getElementById('field-tables');
      el.fieldAddSub = document.getElementById('field-addsub');
      el.diffHint    = document.getElementById('diff-hint');
      el.resetBtn    = document.getElementById('btn-reset');
      el.settingsBest = document.getElementById('settings-best');
      el.homeBest    = document.getElementById('home-best');
      el.homeBestTopic = document.getElementById('home-best-topic');
      el.overScore   = document.getElementById('over-score');
      el.overBest    = document.getElementById('over-best');
      el.overLevel   = document.getElementById('over-level');
      el.mascotLine  = document.getElementById('mascot-line');
      el.lvlEyebrow  = document.getElementById('lvl-eyebrow');
      el.lvlTitle    = document.getElementById('lvl-title');
      el.lvlStars    = document.getElementById('lvl-stars');
      el.lvlRows     = document.getElementById('lvl-rows');
      el.lvlHeart    = document.getElementById('lvl-heart');
      el.lvlNext     = document.getElementById('lvl-next');
      el.lvlMascot   = document.getElementById('lvl-mascot');
      el.lvlMascotLine = document.getElementById('lvl-mascot-line');
      el.pauseTitle  = document.getElementById('pause-title');
      el.pauseRows   = document.getElementById('pause-rows');

      buildTableGrid();
      wire();
      refresh();
      refreshHome();
      refreshSettings();

      return settings;
    },

    settings: function () { return settings; },

    current: function () { return current; },

    show: function (name) {
      current = name;
      for (var k in el.screens) {
        el.screens[k].classList.toggle('hidden', k !== name);
      }
      /* The level-clear and pause cards sit over a run in progress, so the
         HUD stays up behind them and the jungle stays ducked — score, hearts
         and level are exactly what those cards are talking about. */
      var inRun = (name === 'game' || name === 'levelclear' || name === 'paused');
      if (inRun) NP.hud.show();
      else NP.hud.hide();
      NP.hud.setPauseVisible(name === 'game');

      // Every transition passes through here — play, quit, escape, game over —
      // so this is the one place the jungle needs to duck and come back.
      NP.ambience.setDucked(inRun);

      /* Canvas taps drive the play field during a run and the interactive
         scenery on the menus; the topics and settings sheets are the two
         screens that own their pointers outright. session.setPhase also
         writes this, but every path reaches show() after the session has had
         its say — starting a game re-enables from setPhase('asking'), and
         abandon() and gameOver() both disable before show() runs. Resuming
         is the one path that runs the other way about: show('game') shuts
         input here and session.resume() opens it again immediately after,
         which is why it has to be called in that order. */
      NP.input.setEnabled(name === 'home' || name === 'gameover');

      if (name === 'home') refreshHome();
      if (name === 'topics') refresh();
      if (name === 'settings') {
        refresh();
        refreshSettings();
        setResetState('idle');   // never arrive with the wipe half-pressed
      }
    },

    /* The pause card. It reads the live run state rather than a summary
       object: nothing has finished, so there is nothing to summarise. */
    showPaused: function (state) {
      var level = state.level;
      el.pauseTitle.textContent = level ? 'Level ' + level.n + ' · ' + level.name : 'Level 1';

      buildRows(el.pauseRows, [
        ['Score', NP.scoring.format(state.score)],
        ['This level', state.levelQuestion + ' / ' + (level ? level.questions : 0)],
        ['Best streak', String(state.bestStreak)]
      ]);

      NP.screens.show('paused');
    },

    showGameOver: function (result) {
      el.overScore.textContent = NP.scoring.format(result.score);
      el.overBest.textContent = NP.scoring.format(result.best);
      el.overLevel.textContent = 'Level ' + result.level +
        (result.bestLevel > result.level ? ' · best ' + result.bestLevel : '');
      NP.mascot.mount(document.getElementById('mascot'));
      el.mascotLine.textContent = NP.mascot.line(result);
      NP.screens.show('gameover');
    },

    /* The full card, for bosses and every fifth level. The run is paused
       behind it until Continue is pressed. */
    showLevelClear: function (summary) {
      el.lvlEyebrow.textContent = 'Level ' + summary.level.n +
        (summary.level.boss ? ' · boss beaten' : ' clear');
      el.lvlTitle.textContent = summary.level.name;

      buildStars(summary.stars);
      buildRows(el.lvlRows, [
        ['Right this level', summary.correct + ' / ' + summary.questions],
        ['Level bonus', '+' + NP.scoring.format(summary.bonus)],
        ['Score', NP.scoring.format(summary.score)]
      ]);

      el.lvlHeart.classList.toggle('hidden', !summary.heartRefilled);
      el.lvlNext.textContent = 'Next: ' + summary.next.name;

      NP.mascot.mount(el.lvlMascot);
      el.lvlMascotLine.textContent = NP.mascot.levelLine(summary);

      NP.screens.show('levelclear');

      /* Stamped one at a time so the count lands as an event rather than
         appearing all at once. The CSS delays these to match. */
      for (var i = 0; i < summary.stars; i++) {
        (function (n) {
          window.setTimeout(function () { NP.audio.star(n); }, 260 + n * 240);
        })(i);
      }
      if (summary.heartRefilled) {
        window.setTimeout(function () { NP.audio.heart(); }, 260 + summary.stars * 240);
      }
    }
  };

  function buildStars(earned) {
    el.lvlStars.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var s = document.createElement('span');
      s.className = 'lvl-star' + (i < earned ? ' earned' : '');
      s.style.animationDelay = (0.26 + i * 0.24) + 's';
      s.innerHTML = STAR_SVG;
      el.lvlStars.appendChild(s);
    }
  }

  /* Shared by the level-clear and pause cards, which is why it takes the
     list to fill rather than reaching for one. */
  function buildRows(node, pairs) {
    node.innerHTML = '';
    pairs.forEach(function (pair) {
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = pair[0];
      dd.textContent = pair[1];
      node.appendChild(dt);
      node.appendChild(dd);
    });
  }
})(window.NP = window.NP || {});
