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

  /* How many hearts a run gets is the one dial here a parent will actually
     weigh, so it leads — the rest of the line is what the game feels like,
     but this is what it costs to get it wrong. */
  var DIFF_HINT = {
    easy:   '4 lives. 3 bubbles, drifting slowly, plenty of time. Wrong answers look obviously wrong.',
    normal: '3 lives. 4 or 5 bubbles at a steady drift. Wrong answers are a mix of near misses and easy ones.',
    hard:   '2 lives. 6 fast bubbles and a short clock. Wrong answers are the mistakes people actually make.'
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

    each(el.blankChips, function (c) {
      setChip(c, (c.dataset.blank === 'on') === !!settings.blanks);
    });

    each(el.judgeChips, function (c) {
      setChip(c, (c.dataset.judge === 'on') === !!settings.judge);
    });

    each(el.retryChips, function (c) {
      setChip(c, (c.dataset.retry === 'on') === !!settings.retry);
    });

    var needsTables = settings.ops.indexOf('mul') >= 0 || settings.ops.indexOf('div') >= 0;
    var needsRange  = settings.ops.indexOf('add') >= 0 || settings.ops.indexOf('sub') >= 0;
    el.fieldTables.classList.toggle('hidden', !needsTables);
    el.fieldAddSub.classList.toggle('hidden', !needsRange);

    el.diffHint.textContent = DIFF_HINT[settings.difficulty] || '';
  }

  /* What the next banana buys, per plant kind. Two passes over the same
     twenty plots, so each kind needs both a planting and a flowering verb —
     and the toadstools do not flower, they light up, which is exactly what
     `bloom` does to them in gardenArt. */
  var GROWS = {
    fern:    'to grow a fern',
    bush:    'to grow a bush',
    shrooms: 'to grow a clump of toadstools',
    sapling: 'to grow a tree',
    climber: 'to send a vine climbing'
  };
  var FLOWERS = {
    fern:    'to bring a fern into flower',
    bush:    'to bring a bush into flower',
    shrooms: 'to light the toadstools up',
    sapling: 'to put blossom on a tree',
    climber: 'to flower a climbing vine'
  };

  /* The line under the score, which used to read "12 bananas · 12 of 20
     plants grown".

     That said the count three times over — the banana pile on the crate
     already draws it, and the jungle itself already *is* it — and it said it
     as an inventory. It is an instruction now, because there is something to
     do: bananas are held until they are spent, and the only way to spend one
     is to tap the pile. This line is what teaches that, so while a banana is
     waiting it always says so, and it names the plant that tap would buy. */
  function jungleLine(j) {
    /* What died comes first — it is the news, and a child who came back to a
       smaller jungle deserves to be told why rather than left to wonder
       whether they misremembered it. Paired with the instruction, because the
       day the jungle shrinks is exactly the day the tap matters most. */
    if (j.aged > 0) {
      var died = j.aged === 1 ? 'A plant died back' : j.aged + ' plants died back';
      return j.bananas > 0 && !j.full
        ? died + ' — tap a banana to replace one'
        : died + ' overnight';
    }

    if (j.full) return 'Your jungle is in full bloom';
    if (j.bananas === 0) return 'Clear a level with no mistakes to earn a banana';

    var verb = (j.nextPass === 'flower' ? FLOWERS : GROWS)[j.nextKind];
    return verb ? 'Tap a banana ' + verb : 'Tap a banana to grow your jungle';
  }

  function refreshHome() {
    var best = NP.storage.getBestOverall();
    el.homeBest.textContent = NP.scoring.format(best.score);
    el.homeBestTopic.textContent = NP.questions.describe(settings);

    el.homeJungle.textContent = jungleLine(NP.garden.status());
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

  /* ------------------------------------------------------------- mastery */

  /* The game has been keeping a Leitner box per fact since the first run —
     right answers move a fact up, a wrong one drops it straight back to 1 —
     and until now nothing ever showed it. This is that record, drawn as the
     times-table square every child has seen on a classroom wall.

     Division shares the cells with multiplication rather than getting a grid
     of its own: 42 ÷ 6 is the 6 × 7 fact asked backwards, and a child who
     can do it both ways has earned something the square should say. */

  var MASTERY_MAX = 12;

  var BOX_NAME = ['not tried yet', 'just met', 'coming along', 'getting there',
                  'nearly there', 'known cold'];

  function factBox(facts, key) {
    var f = facts[key];
    if (!f || !f.seen) return 0;
    var box = f.box || 1;
    return box < 1 ? 1 : (box > 5 ? 5 : box);
  }

  /* The best box either division form of a × b has reached. The pool builds
     dividends both ways round, so both keys are worth asking about. */
  function divBox(facts, a, b) {
    var product = a * b;
    return Math.max(factBox(facts, product + 'd' + a),
                    factBox(facts, product + 'd' + b));
  }

  function masteryCell(tag, text, cls) {
    var node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  }

  function describeCell(facts, a, b) {
    var key = Math.min(a, b) + 'x' + Math.max(a, b);
    var f = facts[key];
    var line = a + ' × ' + b + ' = ' + (a * b);

    if (!f || !f.seen) return line + ' — not tried yet.';

    line += ' — ' + BOX_NAME[factBox(facts, key)] + '. Seen ' + f.seen +
            (f.seen === 1 ? ' time' : ' times');
    if (f.correct < f.seen) line += ', missed ' + (f.seen - f.correct);
    if (f.correct) line += ', usually ' + (f.avgMs / 1000).toFixed(1) + 's';

    var dv = divBox(facts, a, b);
    if (dv >= 4) line += '. You know it as a divide too.';

    return line + '.';
  }

  function buildMasteryGrid() {
    var facts = NP.storage.loadFacts();
    var chosen = {};
    for (var t = 0; t < settings.tables.length; t++) chosen[settings.tables[t]] = true;

    el.masteryGrid.innerHTML = '';
    el.masteryGrid.appendChild(masteryCell('div', '×', 'm-head m-corner'));

    var c, r;
    for (c = 1; c <= MASTERY_MAX; c++) {
      el.masteryGrid.appendChild(
        masteryCell('div', String(c), 'm-head' + (chosen[c] ? ' on' : '')));
    }

    for (r = 1; r <= MASTERY_MAX; r++) {
      el.masteryGrid.appendChild(
        masteryCell('div', String(r), 'm-head' + (chosen[r] ? ' on' : '')));

      for (c = 1; c <= MASTERY_MAX; c++) {
        var box = factBox(facts, Math.min(r, c) + 'x' + Math.max(r, c));
        var cell = masteryCell('button', String(r * c), 'm-cell box' + box);
        // The number is for the child who wants it; the colour is the point,
        // so the label never has to be read to see how the square is going.
        cell.setAttribute('aria-label', r + ' times ' + c + ', ' + BOX_NAME[box]);
        if (divBox(facts, r, c) >= 4) cell.classList.add('both');
        cell.dataset.a = String(r);
        cell.dataset.b = String(c);
        el.masteryGrid.appendChild(cell);
      }
    }
  }

  /* Add, subtract and divide do not fit a square — the fact space for adding
     up to 100 is far too big to draw, and would be mostly blank if it were.
     A count of what is solid says the same thing in one line. */
  function buildMasteryRows() {
    var facts = NP.storage.loadFacts();
    var tally = {
      div: { strong: 0, shaky: 0, label: 'Divide' },
      p:   { strong: 0, shaky: 0, label: 'Adding' },
      m:   { strong: 0, shaky: 0, label: 'Subtracting' }
    };

    for (var key in facts) {
      if (!Object.prototype.hasOwnProperty.call(facts, key)) continue;
      var group = key.indexOf('d') > 0 ? 'div'
                : key.indexOf('p') > 0 ? 'p'
                : key.indexOf('m') > 0 ? 'm' : null;
      if (!group) continue;

      var box = factBox(facts, key);
      if (box >= 4) tally[group].strong++;
      else if (box > 0) tally[group].shaky++;
    }

    var pairs = [];
    ['div', 'p', 'm'].forEach(function (g) {
      var t = tally[g];
      if (!t.strong && !t.shaky) return;
      pairs.push([t.label, t.strong + ' solid · ' + t.shaky + ' to work on']);
    });

    el.masteryOthers.classList.toggle('hidden', pairs.length === 0);
    if (pairs.length) buildRows(el.masteryRows, pairs);
  }

  function buildMasteryKey() {
    el.masteryKey.innerHTML = '';
    el.masteryKey.appendChild(masteryCell('span', 'new', 'm-key-label'));
    for (var b = 1; b <= 5; b++) {
      el.masteryKey.appendChild(masteryCell('i', '', 'm-swatch box' + b));
    }
    el.masteryKey.appendChild(masteryCell('span', 'known cold', 'm-key-label'));
  }

  function refreshMastery() {
    var facts = NP.storage.loadFacts();
    var seen = 0, solid = 0;

    for (var r = 1; r <= MASTERY_MAX; r++) {
      for (var c = r; c <= MASTERY_MAX; c++) {
        var box = factBox(facts, r + 'x' + c);
        if (box > 0) seen++;
        if (box >= 4) solid++;
      }
    }

    el.masteryLead.textContent = seen === 0
      ? 'Nothing here yet. Play a round and the squares you meet start filling in.'
      : solid + ' of the ' + seen + ' facts you have met are solid. ' +
        'Squares warm up as you get them right and cool off if you slip.';

    buildMasteryGrid();
    buildMasteryRows();

    var jungle = NP.garden.status();
    el.masteryJungle.textContent = jungle.bananas === 0
      ? 'Clear a level with no mistakes and no lost hearts to earn a banana. ' +
        'Every banana grows something on the home screen.'
      : jungle.full
        ? jungle.bananas + ' bananas. Your jungle is full — every plant is in flower.'
        : jungle.bananas + ' bananas · ' + jungle.planted + ' of ' + jungle.plots +
          ' plants growing' + (jungle.flowering ? ', ' + jungle.flowering + ' in flower' : '') + '.';

    el.masteryDetail.textContent = 'Tap a square to see how that one is going.';
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

    each(el.blankChips, function (c) {
      c.addEventListener('click', function () {
        NP.audio.click();
        settings.blanks = c.dataset.blank === 'on';
        save(); refresh();
      });
    });

    each(el.judgeChips, function (c) {
      c.addEventListener('click', function () {
        NP.audio.click();
        settings.judge = c.dataset.judge === 'on';
        save(); refresh();
      });
    });

    each(el.retryChips, function (c) {
      c.addEventListener('click', function () {
        NP.audio.click();
        settings.retry = c.dataset.retry === 'on';
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

    /* Delegated, because the grid is rebuilt from scratch every time the
       screen opens and 144 listeners would have to be rebuilt with it. */
    el.masteryGrid.addEventListener('click', function (e) {
      var cell = e.target.closest ? e.target.closest('.m-cell') : null;
      if (!cell) return;
      NP.audio.click();

      each(el.masteryGrid.querySelectorAll('.m-cell.picked'), function (n) {
        n.classList.remove('picked');
      });
      cell.classList.add('picked');

      el.masteryDetail.textContent = describeCell(NP.storage.loadFacts(),
        parseInt(cell.dataset.a, 10), parseInt(cell.dataset.b, 10));
    });

    document.getElementById('btn-mastery').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('mastery');
    });

    document.getElementById('btn-mastery-back').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('home');
    });

    document.getElementById('btn-mastery-done').addEventListener('click', function () {
      NP.audio.click();
      NP.screens.show('home');
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
      // The jungle is grown from banked bananas, so it has to come down with
      // them — leaving it standing would be a garden nothing in the game
      // could then explain.
      NP.garden.reset();
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
        mastery:    document.getElementById('screen-mastery'),
        settings:   document.getElementById('screen-settings'),
        paused:     document.getElementById('screen-paused'),
        levelclear: document.getElementById('screen-levelclear'),
        gameover:   document.getElementById('screen-gameover')
      };
      el.homeScrim   = document.getElementById('home-scrim');
      el.opChips     = document.querySelectorAll('#op-chips .chip.op');
      el.tableGrid   = document.getElementById('table-grid');
      el.rangeChips  = document.querySelectorAll('.chip.range');
      el.addChips    = document.querySelectorAll('.chip.addmax');
      el.diffChips   = document.querySelectorAll('.chip.diff');
      el.sndChips    = document.querySelectorAll('.chip.snd');
      el.jngChips    = document.querySelectorAll('.chip.jng');
      el.blankChips  = document.querySelectorAll('.chip.blank');
      el.judgeChips  = document.querySelectorAll('.chip.judge');
      el.retryChips  = document.querySelectorAll('.chip.retry');
      el.allTables   = document.getElementById('btn-all-tables');
      el.fieldTables = document.getElementById('field-tables');
      el.fieldAddSub = document.getElementById('field-addsub');
      el.diffHint    = document.getElementById('diff-hint');
      el.resetBtn    = document.getElementById('btn-reset');
      el.settingsBest = document.getElementById('settings-best');
      el.homeBest    = document.getElementById('home-best');
      el.homeBestTopic = document.getElementById('home-best-topic');
      el.homeJungle  = document.getElementById('home-jungle');
      el.masteryGrid   = document.getElementById('mastery-grid');
      el.masteryLead   = document.getElementById('mastery-lead');
      el.masteryDetail = document.getElementById('mastery-detail');
      el.masteryKey    = document.getElementById('mastery-key');
      el.masteryRows   = document.getElementById('mastery-rows');
      el.masteryOthers = document.getElementById('mastery-others');
      el.masteryJungle = document.getElementById('mastery-jungle');
      el.overBananas = document.getElementById('over-bananas');
      el.lvlBanana   = document.getElementById('lvl-banana');
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
      buildMasteryKey();
      wire();
      refresh();
      refreshHome();
      refreshSettings();

      return settings;
    },

    settings: function () { return settings; },

    /* Exposed so spending a banana on the jungle can put the line right
       again without waiting for the next arrival at the home screen. */
    refreshHome: refreshHome,

    current: function () { return current; },

    show: function (name) {
      current = name;
      for (var k in el.screens) {
        el.screens[k].classList.toggle('hidden', k !== name);
      }
      /* The contrast scrim belongs to the home screen, but it lives down in
         the play field rather than in this element, so that the fireflies and
         birds can be drawn in front of it. It has to be shown and hidden with
         its screen from here. */
      if (el.homeScrim) el.homeScrim.classList.toggle('hidden', name !== 'home');
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
      if (name === 'mastery') refreshMastery();
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
      /* Past level 13 the ladder stops and the wave is the only number still
         climbing, so a run that reached the Big Boss is reported by how long
         it lasted there rather than by a level number that cannot move. */
      el.overLevel.textContent = result.wave
        ? 'Big Boss · Wave ' + result.wave +
          (result.bestWave > result.wave ? ' · best ' + result.bestWave : '')
        : 'Level ' + result.level +
          (result.bestLevel > result.level ? ' · best ' + result.bestLevel : '');

      /* Where the bananas went. Shown only on a run that earned some, which
         is the one moment the connection is worth making — and the jungle
         itself does the explaining from then on. */
      var earned = result.bananas || 0;
      el.overBananas.classList.toggle('hidden', earned <= 0);
      if (earned > 0) {
        el.overBananas.textContent = earned === 1
          ? '1 banana for a perfect level — it is planted in your jungle.'
          : earned + ' bananas for perfect levels — planted in your jungle.';
      }
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
      // Three stars is what a banana costs, so the card that shows the stars
      // is where saying so belongs.
      el.lvlBanana.classList.toggle('hidden', summary.stars < 3);
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
