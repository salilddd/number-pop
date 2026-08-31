/* The palette, in one place. Every colour the canvas paints comes from here,
   so retinting the whole game is a single edit. */
(function (NP) {
  'use strict';

  NP.theme = {
    /* The jungle behind everything, painted as a vertical ramp so the scene
       has somewhere for light to come from.

       The ramp is no longer one dark band. It runs deep canopy shadow at the
       very top edge — where the hanging leaves overlap it and need something
       to sit against — up through a bright break where daylight gets past the
       canopy, back down through the mid where the title sits, and out to a
       warm sunlit floor by the crates. paintBoard lays these out in order.

       Widening that range is the single biggest thing separating this from a
       rendered scene: everything used to live inside eight values of green,
       which is what made it read as a flat fill rather than as air. */
    boardTop:     '#081a10',
    boardHaze:    '#356237',
    board:        '#1a3a22',
    boardFloor:   '#3a5220',
    boardDeep:    '#081409',

    /* Out-of-focus foliage massed across the middle distance. Drawn under a
       blur, so these only ever read as shape and value — never as leaves.

       Note which way round these go: `farLeafDeep` is the *furthest* band and
       it is the LIGHTER of the two, because distance is haze, not darkness.
       Air between you and a thing washes it toward the colour of the air, so
       the far canopy sits just above the board's own value and the nearer
       band sits well below it. Painted the intuitive way round — far things
       darker — the bands read as storm clouds behind a hedge. */
    farLeafDeep:  '#2d4f30',
    farLeaf:      '#17321d',

    /* The light break behind the canopy, and the haze that separates near
       from far. Both are gradient stops and both have to reach zero alpha at
       the rim, or they end in a visible disc. */
    sunCore:      'rgba(226,240,166,0.30)',
    sunEdge:      'rgba(226,240,166,0)',
    haze:         'rgba(154,190,142,0.085)',
    hazeEdge:     'rgba(154,190,142,0)',

    /* Light dapple on the floor, and dust caught in the shaft. These replace
       the chalk smudges and board-rubber arcs the scene inherited from when
       it was a chalkboard — same cheap texture pass, read as a jungle. */
    dapple:       'rgba(226,240,190,0.055)',
    dappleEdge:   'rgba(226,240,190,0)',
    mote:         'rgba(240,246,216,0.55)',

    /* Contact shadow. Every prop standing on the floor gets one, or it
       floats: an object with nothing pooled under it never looks placed. */
    contact:      'rgba(5,12,6,0.5)',
    contactEdge:  'rgba(5,12,6,0)',

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

    /* What turns a leaf from a cutout into a lit surface, all applied inside
       the blade's own shape by leaf():

       `leafLit`/`leafShade` are the two ends of a gradient run across the
       blade rather than along it, so one side of the midrib catches the key
       light and the other falls away. `leafGlow` is the light coming through
       from behind — the thing that actually reads as "thin" — and it is
       warmer and yellower than any of the greens, because that is what
       happens to daylight on its way through a leaf. `leafSpec` is the hard
       highlight along the curl, and `leafEdge` darkens the rim so the blade
       ends on a line instead of dissolving into the leaf behind it. */
    leafLit:      'rgba(198,238,138,0.34)',
    leafShade:    'rgba(9,26,12,0.34)',
    leafGlow:     'rgba(196,232,104,0.38)',
    leafSpec:     'rgba(255,255,238,0.30)',
    leafEdge:     'rgba(8,20,10,0.34)',

    /* The garden's own greens, a step brighter and warmer than the scenery's
       leaf1/2/3 above. The plants a banana buys are drawn in these so that a
       grown jungle reads as grown, rather than as more of the foliage the
       board came with. Same hue family — it is the same jungle — but lit,
       the way the thing you tended stands out from the thing you inherited. */
    grown1:       '#5fc22b',
    grown2:       '#469f22',
    grown3:       '#7ada4a',
    grownVein:    '#357f1c',
    grownVine:    '#57a92f',   // the climbers' stem, darker than their leaves
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

    /* A warm charcoal rather than the near-black a toucan really is: at 60px
       on a dark board, true black gives up its whole silhouette and leaves
       the bird reading as a floating beak and bib. */
    toucan:       '#453d34',
    toucanDark:   '#2c2620',
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
