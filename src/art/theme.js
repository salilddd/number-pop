/* The palette, in one place. Every colour the canvas paints comes from here,
   so retinting the whole game is a single edit. */
(function (NP) {
  'use strict';

  NP.theme = {
    /* chalkboard */
    board:        '#23241f',
    boardDeep:    '#15160f',
    boardSmudge:  'rgba(226,230,210,0.045)',
    boardScratch: 'rgba(238,240,228,0.14)',

    /* answer bubbles */
    bubble:       '#5fc22b',
    bubbleLight:  '#8fe05c',
    bubbleMid:    '#66cb2f',
    bubbleRim:    '#3f8f19',
    bubbleShadow: 'rgba(0,0,0,0.32)',

    /* the correct bubble, revealed after a mistake */
    reveal:       '#ffd34d',
    revealLight:  '#ffe89a',
    revealRim:    '#c99614',

    /* a wrongly tapped bubble */
    wrong:        '#e8353f',
    wrongLight:   '#ff6f76',
    wrongRim:     '#9d1c24',

    /* text */
    white:        '#ffffff',
    chalk:        '#edeee7',
    chalkDim:     '#a7aa9d',

    /* wood */
    wood:         '#8a5c33',
    woodLight:    '#a87a45',
    woodDark:     '#6a4526',
    woodDeep:     '#4a2f19',
    woodEdge:     '#573820',
    cautionRed:   '#b8332c',

    /* burlap sack */
    sack:         '#c2ab80',
    sackDark:     '#9c8760',
    rope:         '#8d7346',

    /* foliage */
    leaf1:        '#3f9b2a',
    leaf2:        '#2f7d21',
    leaf3:        '#56b838',
    leafDark:     '#1e5a16',
    leafVein:     '#2a6b1d',
    flower:       '#c8304a',
    flowerDark:   '#8e1f33',
    vine:         '#4f9c30',

    /* score popups */
    pointsText:   '#ffffff',
    streakGold:   '#ffd85e',

    font: '"Fredoka", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
  };
})(window.NP = window.NP || {});
