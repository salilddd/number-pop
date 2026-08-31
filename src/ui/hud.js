/* The in-game HUD: score pill, hearts, question, timer bar, streak badge.
   DOM rather than canvas, because laying out text by hand in canvas buys
   nothing here and costs the ability to just write CSS. */
(function (NP) {
  'use strict';

  var HEART_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 21.2S3.3 15.6 3.3 9.4C3.3 6.4 5.6 4.2 8.4 4.2c1.6 0 3 .8 3.6 1.9 ' +
    '.6-1.1 2-1.9 3.6-1.9 2.8 0 5.1 2.2 5.1 5.2 0 6.2-8.7 11.8-8.7 11.8z" ' +
    'fill="#e8353f" stroke="#8f1a22" stroke-width="1.1" stroke-linejoin="round"/>' +
    '<path d="M8.6 6.6c-1.3 0-2.4 1-2.4 2.4" fill="none" stroke="rgba(255,255,255,.55)" ' +
    'stroke-width="1.3" stroke-linecap="round"/>' +
    '</svg>';

  /* One shield for the level's second chance, when the setting is on. */
  var SHIELD_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 2.8l7.2 2.6v6.1c0 4.5-3.1 8.2-7.2 9.7-4.1-1.5-7.2-5.2-7.2-9.7V5.4z" ' +
    'fill="#5fc22b" stroke="#2f6d12" stroke-width="1.1" stroke-linejoin="round"/>' +
    '<path d="M8.6 12.2l2.4 2.4 4.4-4.6" fill="none" stroke="#fff" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* The three power-ups, as stroke-only glyphs matching the icon buttons.
     Named on the face as well as drawn: a child who has just earned their
     first one should not have to guess what the picture means. */
  var POWER_ART = {
    slow: {
      label: 'Slow',
      svg: '<circle cx="16" cy="16" r="10.5"/><path d="M16 9.5 V16 L20.5 19"/>'
    },
    freeze: {
      label: 'Freeze',
      svg: '<path d="M16 4 V28 M6.5 9.5 L25.5 22.5 M25.5 9.5 L6.5 22.5"/>'
    },
    fifty: {
      label: '50:50',
      svg: '<path d="M9.5 22.5 L22.5 9.5"/><circle cx="11" cy="11" r="3.2"/>' +
           '<circle cx="21" cy="21" r="3.2"/>'
    }
  };

  var el = {};
  var displayScore = 0;
  var targetScore = 0;
  var handlers = {};
  var chargeTimer = 0;      // the pay-out flash, so a later update can cancel it

  /* The heart bar is sized by the difficulty preset, not by the HUD, so it is
     built on the first setLives of a run rather than at init. `shownLives` is
     what the strip is currently drawing, which is what makes a heart coming
     *back* distinguishable from one being lost. */
  var totalLives = 0;
  var shownLives = 0;

  /* A heart being handed back is staged rather than painted straight away:
     something is usually being thrown at the strip, and the heart has to
     light up when that lands, not a second before it. The timer is the
     safety net — a dropped animation must never leave the strip lying about
     how many lives the run has. */
  var pendingGain = null;
  var gainTimer = 0;
  var GAIN_FALLBACK = 2200;
  var shieldTimer = 0;      // the shield's shatter, before it leaves the HUD

  function buildHearts(n) {
    totalLives = n;
    shownLives = n;
    el.lives.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var heart = document.createElement('div');
      heart.className = 'heart';
      heart.innerHTML = HEART_SVG;
      el.lives.appendChild(heart);
    }
  }

  function paintLives(n) {
    var hearts = el.lives.children;
    for (var i = 0; i < hearts.length; i++) {
      var lost = i >= n;
      var wasLost = hearts[i].classList.contains('lost') ||
                    hearts[i].classList.contains('breaking');
      if (lost && !wasLost) {
        hearts[i].classList.add('breaking');
        (function (node) {
          window.setTimeout(function () {
            node.classList.remove('breaking');
            node.classList.add('lost');
          }, 320);
        })(hearts[i]);
      } else if (!lost && wasLost) {
        /* A heart coming back is the rarest good thing on the HUD, so it
           gets a real arrival rather than just un-greying: the grey drops
           and the heart swells in from nothing. */
        hearts[i].classList.remove('lost', 'breaking', 'gained');
        void hearts[i].offsetWidth;              // restart the animation
        hearts[i].classList.add('gained');
      } else if (!lost) {
        hearts[i].classList.remove('lost', 'breaking');
      }
    }
    shownLives = n;
  }

  function paintCharge(filled, total) {
    var segs = el.chargeSegs.children;
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.toggle('on', i < filled);
    }
    // One chip short of a power-up: worth flagging, since it is the moment
    // the next question is suddenly worth being careful about.
    el.charge.classList.toggle('near', filled === total - 1);
  }

  NP.hud = {
    init: function (h) {
      handlers = h || {};
      el.root     = document.getElementById('hud');
      el.score    = document.getElementById('score');
      el.pill     = document.getElementById('score-pill');
      el.lives    = document.getElementById('lives');
      el.question = document.getElementById('question');
      el.qwrap    = document.getElementById('question-wrap');
      el.timer    = document.getElementById('timer-fill');
      el.streak   = document.getElementById('streak-badge');
      el.level    = document.getElementById('level-chip');
      el.levelNum = document.getElementById('level-num');
      el.levelName = document.getElementById('level-name');
      el.pips     = document.getElementById('level-pips');
      el.pause    = document.getElementById('btn-pause');
      el.powers   = document.getElementById('powers');
      el.shield   = document.getElementById('retry-shield');
      el.charge     = document.getElementById('charge');
      el.chargeSegs = document.getElementById('charge-segs');

      el.shield.innerHTML = SHIELD_SVG;

      /* Delegated, because the strip is rebuilt every time a power is earned
         or spent. The index is read off the button rather than closed over,
         so it stays correct after a splice. */
      el.powers.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.power') : null;
        if (!btn || !handlers.onUsePower) return;
        var i = parseInt(btn.dataset.index, 10);
        // A refused power is a real answer, so say so rather than going quiet.
        // The strip already keeps the 50:50 off a true-or-false question, so
        // this should be rare — but a shake beats a tap that does nothing.
        if (handlers.onUsePower(i) === false) {
          btn.classList.remove('refused');
          void btn.offsetWidth;
          btn.classList.add('refused');
        }
      });
    },

    show: function () { el.root.classList.remove('hidden'); },
    hide: function () { el.root.classList.add('hidden'); },

    /* The HUD also stays up behind the level-clear card, where the run is
       already stopped — a pause button there would be a tap that does
       nothing, sitting right where the child has learned to reach. */
    setPauseVisible: function (on) { el.pause.classList.toggle('hidden', !on); },

    setScore: function (score, delta) {
      targetScore = score;
      if (delta === 0) {
        // A reset, not an award: snap rather than counting down from the
        // last run's total.
        displayScore = score;
        el.score.textContent = NP.scoring.format(score);
      }
      if (delta > 0) {
        el.pill.classList.remove('bump');
        void el.pill.offsetWidth;          // restart the animation
        el.pill.classList.add('bump');
      }
    },

    /* Counting up to the new total reads as a reward; snapping does not. */
    update: function (dt) {
      if (displayScore === targetScore) return;
      var diff = targetScore - displayScore;
      var step = Math.max(1, Math.abs(diff) * dt * 9);
      if (Math.abs(diff) <= step) displayScore = targetScore;
      else displayScore += Math.sign(diff) * step;
      el.score.textContent = NP.scoring.format(displayScore);
    },

    /* `max` is the run's heart ceiling — 4 on Easy, 2 on Hard. It arrives
       with every call rather than being set once, so a strip left over from
       another difficulty is rebuilt on the first update of the new run
       instead of quietly drawing four hearts for a two-heart run.

       `staged` marks a heart being handed back, which is held until
       releaseLives() lands it. Losses are never staged: a heart breaking has
       to be immediate or the child cannot tell what the tap cost. */
    setLives: function (n, max, staged) {
      if (max && max !== totalLives) buildHearts(max);

      window.clearTimeout(gainTimer);
      if (staged) {
        pendingGain = n;
        gainTimer = window.setTimeout(function () {
          NP.hud.releaseLives();
        }, GAIN_FALLBACK);
        return;
      }

      pendingGain = null;
      paintLives(n);
    },

    /* Forces the strip to be rebuilt on the next setLives. Called when a run
       starts, so hearts lost in the last one are not sitting there greyed
       out waiting to be re-earned — and so a heart still staged from a
       celebration the player quit out of cannot land on the new run. */
    resetLives: function () {
      window.clearTimeout(gainTimer);
      pendingGain = null;
      totalLives = 0;
      shownLives = 0;
    },

    /* Lands a staged heart. Returns false if there was nothing waiting, so a
       celebration can tell whether it just delivered something. */
    releaseLives: function () {
      if (pendingGain === null) return false;
      var n = pendingGain;
      pendingGain = null;
      window.clearTimeout(gainTimer);
      paintLives(n);
      return true;
    },

    /* Where the heart about to be filled sits on screen, so whoever is
       throwing one at the strip knows what to aim for. Null before the strip
       exists. */
    livesAnchor: function () {
      if (!el.lives || !el.lives.children.length) return null;
      var slot = el.lives.children[Math.min(shownLives, totalLives - 1)];
      var r = (slot || el.lives).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    /* The question mark is the thing to fill in — whether it stands for the
       answer or for a hidden operand — so it is coloured rather than left as
       punctuation. Split and appended as nodes rather than written as markup:
       the text is only ever numbers and an operator, but building HTML out of
       a string is a habit worth not having. */
    setQuestion: function (text, form) {
      el.question.textContent = '';
      el.question.classList.toggle('judge', form === 'judge');

      /* A finished statement is not obviously a question, so it gets asked
         one. Real text rather than CSS content: a child using a screen reader
         needs to hear it too. */
      if (form === 'judge') {
        var ask = document.createElement('span');
        ask.className = 'ask';
        ask.textContent = 'True or false?';
        el.question.appendChild(ask);
      }

      var parts = String(text).split('?');
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) {
          var blank = document.createElement('span');
          blank.className = 'blank';
          blank.textContent = '?';
          el.question.appendChild(blank);
        }
        if (parts[i]) el.question.appendChild(document.createTextNode(parts[i]));
      }

      el.question.classList.remove('pulse');
      void el.question.offsetWidth;
      el.question.classList.add('pulse');
    },

    /* fraction: 1 at the start of a question, 0 when time is up. */
    setTimer: function (fraction) {
      var f = Math.max(0, Math.min(1, fraction));
      el.timer.style.transform = 'scaleX(' + f + ')';
      el.timer.classList.toggle('low', f <= 0.5 && f > 0.22);
      el.timer.classList.toggle('critical', f <= 0.22);
    },

    /* The level chip by the score. Boss levels get their own colour, since
       the rule change they bring is worth flagging before it bites. */
    setLevel: function (level) {
      el.levelNum.textContent = level.n;
      el.levelName.textContent = level.name;
      el.level.classList.toggle('boss', !!level.boss);
      el.level.classList.remove('pop');
      void el.level.offsetWidth;               // restart the animation
      el.level.classList.add('pop');
    },

    /* The Big Boss keeps the level chip but swaps the name for the wave
       count, because level 13 is where the level number stops moving and the
       wave becomes the only number still going up. */
    setWave: function (wave) {
      el.levelName.textContent = 'Wave ' + wave;
      el.level.classList.remove('pop');
      void el.level.offsetWidth;
      el.level.classList.add('pop');
    },

    /* One pip per question in the level, filling as they are answered.
       Rebuilt only when the count changes, so the fill transition survives
       from one question to the next. */
    setLevelProgress: function (done, total) {
      if (el.pips.children.length !== total) {
        el.pips.innerHTML = '';
        for (var i = 0; i < total; i++) {
          var p = document.createElement('i');
          p.className = 'pip';
          el.pips.appendChild(p);
        }
      }
      var pips = el.pips.children;
      for (var j = 0; j < pips.length; j++) {
        pips[j].classList.toggle('done', j < done);
      }
    },

    /* The held power-ups. Rebuilt whole rather than diffed: there are at most
       two of them, and a strip that is always exactly the list is one fewer
       thing that can get out of step with the run.

       A hole in the list is a power the current question has nothing for — the
       50:50 on a true-or-false — and it draws as nothing at all. The slot is
       skipped rather than closed up, because the index the button carries is
       the one the session reads back. */
    setPowers: function (list) {
      el.powers.innerHTML = '';

      for (var i = 0; i < list.length; i++) {
        var art = POWER_ART[list[i]];
        if (!art) continue;

        var btn = document.createElement('button');
        btn.className = 'power ' + list[i];
        btn.dataset.index = String(i);
        btn.setAttribute('aria-label', 'Use ' + art.label);
        btn.innerHTML =
          '<svg viewBox="0 0 32 32" aria-hidden="true">' + art.svg + '</svg>' +
          '<span>' + art.label + '</span>';
        el.powers.appendChild(btn);
      }

      el.powers.classList.toggle('hidden', !el.powers.children.length);
    },

    /* Progress toward the next power-up, as {filled, total, banked, awarded}.
       Rebuilt only when the segment count changes, so lighting a chip keeps
       its transition. */
    setCharge: function (c) {
      var total = c.total, filled = Math.max(0, Math.min(total, c.filled));

      if (el.chargeSegs.children.length !== total) {
        el.chargeSegs.innerHTML = '';
        for (var i = 0; i < total; i++) {
          el.chargeSegs.appendChild(document.createElement('i'));
        }
      }

      /* The pay-out is the one moment the meter must not simply tell the
         truth: filled has already dropped to zero, and showing that
         immediately is indistinguishable from a broken streak. Hold it full
         and gold for the beat the power button takes to appear, then settle. */
      window.clearTimeout(chargeTimer);
      el.charge.classList.remove('burst');
      if (c.awarded) {
        paintCharge(total, total);
        void el.charge.offsetWidth;
        el.charge.classList.add('burst');
        chargeTimer = window.setTimeout(function () {
          el.charge.classList.remove('burst');
          paintCharge(filled, total);
        }, 460);
      } else {
        paintCharge(filled, total);
      }

      // Held back because both slots are full: it drops as soon as one frees.
      el.charge.classList.toggle('banked', !!c.banked);
      el.charge.setAttribute('aria-label', c.banked
        ? 'Power-up ready — use one to make room'
        : (total - filled) + ' more in a row for a power-up');
    },

    /* The level's unspent second chance. `spent` says it was just used up,
       as opposed to a new level simply not having one: spending it is worth
       showing — the shield flares and shatters where it stands, so the child
       sees the thing that saved them being used rather than a corner of the
       HUD quietly emptying. */
    setRetry: function (n, spent) {
      window.clearTimeout(shieldTimer);
      el.shield.classList.remove('spent');

      if (n <= 0 && spent) {
        void el.shield.offsetWidth;              // restart the animation
        el.shield.classList.add('spent');
        shieldTimer = window.setTimeout(function () {
          el.shield.classList.add('hidden');
          el.shield.classList.remove('spent');
        }, 640);
        return;
      }

      el.shield.classList.toggle('hidden', n <= 0);
    },

    /* 'normal' | 'slow' | 'freeze'. The bubbles visibly changing pace is the
       real cue; this recolours the timer bar so the reason is legible. */
    setFlow: function (kind) {
      el.timer.classList.toggle('slowed', kind === 'slow');
      el.timer.classList.toggle('frozen', kind === 'freeze');
    },

    setStreak: function (n) {
      if (n < 3) {
        el.streak.classList.add('hidden');
        return;
      }
      el.streak.classList.remove('hidden');
      el.streak.textContent = n + ' in a row  ·  ×' +
        NP.scoring.streakMultiplier(n).toFixed(1);
      el.streak.classList.remove('pop');
      void el.streak.offsetWidth;
      el.streak.classList.add('pop');
    },

    /* Where the bubble field is allowed to start, measured rather than
       guessed so safe-area insets and font loading can't push the question
       down onto the bubbles. */
    questionBottom: function () {
      var appRect = document.getElementById('app').getBoundingClientRect();
      var qRect = el.qwrap.getBoundingClientRect();
      return Math.round(qRect.bottom - appRect.top + 16);
    }
  };
})(window.NP = window.NP || {});
