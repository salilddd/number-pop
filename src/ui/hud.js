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

  var el = {};
  var displayScore = 0;
  var targetScore = 0;
  var totalLives = 3;

  NP.hud = {
    init: function () {
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

      el.lives.innerHTML = '';
      for (var i = 0; i < totalLives; i++) {
        var h = document.createElement('div');
        h.className = 'heart';
        h.innerHTML = HEART_SVG;
        el.lives.appendChild(h);
      }
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

    setLives: function (n) {
      var hearts = el.lives.children;
      for (var i = 0; i < hearts.length; i++) {
        var lost = i >= n;
        var wasLost = hearts[i].classList.contains('lost');
        if (lost && !wasLost) {
          hearts[i].classList.add('breaking');
          (function (node) {
            window.setTimeout(function () {
              node.classList.remove('breaking');
              node.classList.add('lost');
            }, 320);
          })(hearts[i]);
        } else if (!lost) {
          hearts[i].classList.remove('lost', 'breaking');
        }
      }
    },

    setQuestion: function (text) {
      el.question.textContent = text;
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
