/* The palette, in one place. Every colour the canvas paints comes from here,
   so retinting the whole game is a single edit. */
(function (NP) {
  'use strict';

  NP.theme = {
    /* chalkboard — painted as a vertical gradient rather than one flat
       fill, so the scene has somewhere for light to come from: cool leaf
       shade overhead, warmer sunlit floor down by the crates. paintBoard
       lays these out top, middle, bottom; `board` is the midpoint. */
    boardTop:     '#0c1f16',
    board:        '#15301f',
    boardFloor:   '#243318',
    boardDeep:    '#0a1710',
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

    /* the gorilla — shared by the canvas mascot on the menus and the SVG
       one on the game-over screen, so the two read as the same character */
    fur:          '#87786a',
    furDark:      '#6b5c4f',
    furLight:     '#9b8b7c',
    face:         '#c8b096',
    muzzle:       '#dcc7ae',
    ink:          '#3b3128',
    nostril:      '#7a6553',

    /* firefly */
    glow:         '#ffe98a',
    glowCore:     '#fffce8',

    /* bananas — the reward pile on the sack, and the one you can toss the
       gorilla from the home screen */
    banana:       '#f2c53d',
    bananaLight:  '#ffe487',
    bananaDark:   '#c99418',
    bananaTip:    '#5c4a20',

    /* the two birds that cross the canopy */
    parrot:       '#d8342e',
    parrotDark:   '#9c1f1c',
    parrotWing:   '#2f7fd0',
    parrotWing2:  '#f2c033',
    parrotBeak:   '#f09022',

    toucan:       '#26221e',
    toucanDark:   '#15120f',
    toucanBib:    '#f4ecd8',
    toucanBeak:   '#f2a326',
    toucanBeakTip:'#d8342e',
    toucanEye:    '#59c8e8',

    /* coconut */
    coconut:      '#7a5330',
    coconutLight: '#a2764a',
    coconutDark:  '#4a3018',
    coconutEye:   '#2e1d0d',

    /* the bomb sitting on the caution crate — a cast-iron ball, so it is
       lit almost entirely by its highlight: the shell itself is nearly the
       colour of the board and would vanish without one. */
    bomb:         '#2b3038',
    bombLight:    '#5c6672',
    bombDark:     '#0d1015',
    bombCollar:   '#8d9099',
    fuse:         '#c9a464',
    fuseDark:     '#7d5f2e',

    /* the fuse spark and the bang. Ordered hottest first — the particle
       bursts walk this list, so the sparks come out white and cool to red
       on their way down. */
    spark:        '#fff6d8',
    ember:        '#ffb03a',
    emberHot:     '#ff6a1e',
    emberDeep:    '#d63317',
    smoke:        'rgba(188,192,184,0.5)',
    smokeDark:    'rgba(108,112,106,0.5)',

    /* the flash, as gradient stops rather than one colour: white at the
       core, orange through the middle, and it has to reach zero alpha at
       the rim or the bloom ends in a visible disc */
    blastCore:    'rgba(255,248,224,0.95)',
    blastMid:     'rgba(255,166,56,0.5)',
    blastEdge:    'rgba(255,92,26,0)',

    /* score popups */
    pointsText:   '#ffffff',
    streakGold:   '#ffd85e',

    font: '"Fredoka", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
  };
})(window.NP = window.NP || {});
