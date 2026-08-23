/* Speed is the whole reward. Two players who both answer everything
   correctly need to finish thousands of points apart, or the arcade framing
   does nothing.

   An instant answer on hard at a full streak is about 1,350; a slow but
   correct one is 100. A 40-60 question run therefore lands somewhere
   between 15k and 60k. */
(function (NP) {
  'use strict';

  var BASE = 100;
  var SPEED_BONUS = 400;
  var STREAK_STEP = 0.1;
  var STREAK_CAP = 10;          // multiplier tops out at 2.0x

  NP.scoring = {
    streakMultiplier: function (streak) {
      return 1 + Math.min(streak, STREAK_CAP) * STREAK_STEP;
    },

    /* elapsed: seconds spent on this question.
       streak:  count of correct answers *before* this one. */
    points: function (elapsed, streak, preset) {
      var t = elapsed / preset.fullPoints;
      var speedFactor = 1 - t;
      if (speedFactor < 0) speedFactor = 0;
      if (speedFactor > 1) speedFactor = 1;

      var speed = Math.round(SPEED_BONUS * speedFactor);
      var mult = NP.scoring.streakMultiplier(streak);
      return Math.round((BASE + speed) * mult * preset.scoreMult);
    },

    /* Streak milestones worth celebrating with a sound and a badge. */
    isMilestone: function (streak) {
      return streak > 0 && streak % 5 === 0;
    },

    format: function (n) {
      // Thin space rather than a comma: reads better at the chunky HUD size
      // and matches the score pill in the reference screenshots.
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
  };
})(window.NP = window.NP || {});
