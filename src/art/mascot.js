/* The gorilla on the game-over screen — original vector art, drawn as a
   flat cartoon so it sits alongside the canvas scenery without looking
   like it came from a different game. */
(function (NP) {
  'use strict';

  var FUR_DARK  = '#6b5c4f';
  var FUR       = '#87786a';
  var FUR_LIGHT = '#9b8b7c';
  var FACE      = '#c8b096';
  var MUZZLE    = '#dcc7ae';
  var INK       = '#3b3128';
  var NOSTRIL   = '#7a6553';

  var SVG =
  '<svg viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A friendly gorilla">' +

    /* ---- shoulders and arms ---- */
    '<path d="M14 210 C10 168 34 141 66 134 L134 134 C166 141 190 168 186 210 Z" fill="' + FUR + '"/>' +
    '<path d="M14 210 C11 180 24 156 44 145 C36 168 34 190 36 210 Z" fill="' + FUR_DARK + '"/>' +
    '<path d="M186 210 C189 180 176 156 156 145 C164 168 166 190 164 210 Z" fill="' + FUR_DARK + '"/>' +
    /* chest patch */
    '<ellipse cx="100" cy="186" rx="40" ry="30" fill="' + FUR_LIGHT + '"/>' +

    /* ---- ears ---- */
    '<ellipse cx="33" cy="86" rx="17" ry="19" fill="' + FUR + '"/>' +
    '<ellipse cx="35" cy="86" rx="9" ry="10" fill="' + FACE + '" opacity="0.75"/>' +
    '<ellipse cx="167" cy="86" rx="17" ry="19" fill="' + FUR + '"/>' +
    '<ellipse cx="165" cy="86" rx="9" ry="10" fill="' + FACE + '" opacity="0.75"/>' +

    /* ---- head ---- */
    '<path d="M100 18 C143 18 166 46 166 86 C166 126 138 150 100 150 ' +
             'C62 150 34 126 34 86 C34 46 57 18 100 18 Z" fill="' + FUR + '"/>' +
    /* crown tuft */
    '<path d="M100 18 C80 18 66 26 58 38 C72 26 84 22 100 22 C116 22 128 26 142 38 ' +
             'C134 26 120 18 100 18 Z" fill="' + FUR_DARK + '"/>' +

    /* ---- face plate ---- */
    '<path d="M100 44 C134 44 152 66 152 96 C152 126 130 146 100 146 ' +
             'C70 146 48 126 48 96 C48 66 66 44 100 44 Z" fill="' + FACE + '"/>' +

    /* ---- brow ridge ---- */
    '<path d="M52 84 C60 66 78 58 100 58 C122 58 140 66 148 84 ' +
             'C138 74 122 70 100 70 C78 70 62 74 52 84 Z" fill="' + FUR_DARK + '"/>' +

    /* ---- eyes ---- */
    '<ellipse cx="79" cy="93" rx="11" ry="12" fill="#ffffff"/>' +
    '<ellipse cx="121" cy="93" rx="11" ry="12" fill="#ffffff"/>' +
    '<circle cx="81" cy="95" r="6" fill="' + INK + '"/>' +
    '<circle cx="123" cy="95" r="6" fill="' + INK + '"/>' +
    '<circle cx="83" cy="92" r="2.1" fill="#ffffff"/>' +
    '<circle cx="125" cy="92" r="2.1" fill="#ffffff"/>' +

    /* ---- muzzle ---- */
    '<ellipse cx="100" cy="122" rx="34" ry="25" fill="' + MUZZLE + '"/>' +
    '<ellipse cx="91" cy="115" rx="4.4" ry="3.4" fill="' + NOSTRIL + '"/>' +
    '<ellipse cx="109" cy="115" rx="4.4" ry="3.4" fill="' + NOSTRIL + '"/>' +

    /* ---- smile ---- */
    '<path d="M82 130 C90 141 110 141 118 130" fill="none" stroke="' + NOSTRIL + '" ' +
          'stroke-width="3.4" stroke-linecap="round"/>' +

  '</svg>';

  NP.mascot = {
    /* Drop the gorilla into a container element. */
    mount: function (el) {
      if (el && !el.firstChild) el.innerHTML = SVG;
    },

    /* Encouragement shown in the speech bubble. Picked to say something
       true about the run rather than generic praise — a child can tell
       the difference. */
    line: function (result) {
      var score = result.score;
      var best = result.best;
      var isNewBest = result.isNewBest;
      var accuracy = result.answered ? result.correct / result.answered : 0;
      var weakest = result.weakestLabel;

      if (isNewBest) {
        return 'A new highscore! ' + score.toLocaleString() + ' points. That was your best run yet.';
      }
      if (result.answered === 0) {
        return 'Ready when you are. Tap the bubble with the right answer.';
      }
      if (score > best * 0.9) {
        return 'So close to your best! You needed just ' + (best - score).toLocaleString() + ' more.';
      }
      if (result.bestStreak >= 10) {
        return result.bestStreak + ' correct in a row! That streak was the good bit.';
      }
      if (accuracy >= 0.9) {
        return 'Almost everything right. Now try answering a little faster for more points.';
      }
      if (weakest) {
        return 'Nice work! The ' + weakest + ' one caught you out — worth another go.';
      }
      if (accuracy < 0.6) {
        return 'Tricky round. Try an easier setting and build the speed back up.';
      }
      return 'Nice work! Practise and you will get a new highscore.';
    }
  };
})(window.NP = window.NP || {});
