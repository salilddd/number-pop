/* The gorilla, drawn on canvas so he can move.

   Same character as the SVG one in mascot.js — the outlines are ported across
   path for path and both read their colours from the theme, so the two never
   drift apart. The one real difference is the arms: here they are separate
   pieces pivoting at the shoulder, because a gorilla that cannot raise a fist
   cannot thump his chest, which is the whole point of putting him on the menu.

   Authored inside a 200x210 box like the SVG, with the origin passed in as the
   ground point under his feet. Everything is expressed in box coordinates, so
   the ported path data below can be compared against mascot.js line by line. */
(function (NP) {
  'use strict';

  var T = NP.theme;

  var BOX_W = 200;
  var BOX_H = 210;

  /* Shoulder sockets, and where each fist sits at rest and against the chest.
     The arm poses are interpolated between these two, which is enough movement
     to read as drumming without needing a skeleton. */
  var SHOULDER = { x: 48, y: 150 };
  var REST     = { ex: 30, ey: 184, fx: 32, fy: 206 };   // elbow, fist hanging
  var CHEST    = { ex: 56, ey: 176, fx: 82, fy: 184 };   // elbow, fist on chest
  var MOUTH    = { ex: 62, ey: 168, fx: 84, fy: 138 };   // holding food up
  var EYES     = { ex: 58, ey: 148, fx: 80, fy: 100 };   // hands over the eyes

  var REACH = { chest: CHEST, mouth: MOUTH, eyes: EYES };

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------------------------------------------------------------- torso */

  function torso(ctx) {
    // shoulders and the outside of both arms
    ctx.fillStyle = T.fur;
    ctx.beginPath();
    ctx.moveTo(14, 210);
    ctx.bezierCurveTo(10, 168, 34, 141, 66, 134);
    ctx.lineTo(134, 134);
    ctx.bezierCurveTo(166, 141, 190, 168, 186, 210);
    ctx.closePath();
    ctx.fill();

    // darker mass down each flank
    ctx.fillStyle = T.furDark;
    ctx.beginPath();
    ctx.moveTo(14, 210);
    ctx.bezierCurveTo(11, 180, 24, 156, 44, 145);
    ctx.bezierCurveTo(36, 168, 34, 190, 36, 210);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(186, 210);
    ctx.bezierCurveTo(189, 180, 176, 156, 156, 145);
    ctx.bezierCurveTo(164, 168, 166, 190, 164, 210);
    ctx.closePath();
    ctx.fill();
  }

  function chestPatch(ctx, breath) {
    // The breath scales the patch rather than the whole torso, so his
    // silhouette stays put and only the chest rises and falls. Drumming
    // pushes `breath` well past 1, which is what makes each fist landing
    // punch the chest outward.
    ctx.save();
    ctx.translate(100, 186);
    ctx.scale(1 + breath * 0.05, 1 + breath * 0.06);
    ctx.fillStyle = T.furLight;
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ arm */

  /* `side` is -1 for his right arm (screen left) and 1 for the other.
     `t` runs 0 (hanging) to 1 (fist at `to`, one of the REACH targets). */
  function arm(ctx, side, t, shade, to) {
    var dst = to || CHEST;
    var sx = 100 + (SHOULDER.x - 100) * side;
    var sy = SHOULDER.y;
    var ex = 100 + (lerp(REST.ex, dst.ex, t) - 100) * side;
    var ey = lerp(REST.ey, dst.ey, t);
    var fx = 100 + (lerp(REST.fx, dst.fx, t) - 100) * side;
    var fy = lerp(REST.fy, dst.fy, t);

    ctx.strokeStyle = shade;
    ctx.fillStyle = shade;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(fx, fy);
    ctx.stroke();

    // knuckles
    ctx.beginPath();
    ctx.arc(fx, fy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(59,49,40,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx - 9, fy - 3);
    ctx.lineTo(fx + 9, fy - 3);
    ctx.stroke();
  }

  /* ----------------------------------------------------------------- head */

  function ear(ctx, cx) {
    ctx.fillStyle = T.fur;
    ctx.beginPath();
    ctx.ellipse(cx, 86, 17, 19, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = T.face;
    ctx.beginPath();
    ctx.ellipse(cx + (cx < 100 ? 2 : -2), 86, 9, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function eye(ctx, cx, blink, gazeX, gazeY) {
    ctx.save();
    ctx.translate(cx, 93);
    ctx.scale(1, Math.max(0.04, 1 - blink * 0.94));

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // The pupil rides toward whatever he is looking at. Capped at 3.6 so it
    // never crawls off the white and turns him cross-eyed.
    var px = 2 + gazeX * 3.6;
    var py = 2 + gazeY * 3.6;
    ctx.fillStyle = T.ink;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px + 2, py - 3, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // A lid line once the eye is mostly shut, or a closed eye reads as a gap.
    if (blink > 0.55) {
      ctx.strokeStyle = T.nostril;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.globalAlpha = (blink - 0.55) / 0.45;
      ctx.beginPath();
      ctx.moveTo(cx - 10, 93);
      ctx.lineTo(cx + 10, 93);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function head(ctx, pose) {
    ear(ctx, 33);
    ear(ctx, 167);

    // skull
    ctx.fillStyle = T.fur;
    ctx.beginPath();
    ctx.moveTo(100, 18);
    ctx.bezierCurveTo(143, 18, 166, 46, 166, 86);
    ctx.bezierCurveTo(166, 126, 138, 150, 100, 150);
    ctx.bezierCurveTo(62, 150, 34, 126, 34, 86);
    ctx.bezierCurveTo(34, 46, 57, 18, 100, 18);
    ctx.closePath();
    ctx.fill();

    // crown tuft
    ctx.fillStyle = T.furDark;
    ctx.beginPath();
    ctx.moveTo(100, 18);
    ctx.bezierCurveTo(80, 18, 66, 26, 58, 38);
    ctx.bezierCurveTo(72, 26, 84, 22, 100, 22);
    ctx.bezierCurveTo(116, 22, 128, 26, 142, 38);
    ctx.bezierCurveTo(134, 26, 120, 18, 100, 18);
    ctx.closePath();
    ctx.fill();

    // face plate
    ctx.fillStyle = T.face;
    ctx.beginPath();
    ctx.moveTo(100, 44);
    ctx.bezierCurveTo(134, 44, 152, 66, 152, 96);
    ctx.bezierCurveTo(152, 126, 130, 146, 100, 146);
    ctx.bezierCurveTo(70, 146, 48, 126, 48, 96);
    ctx.bezierCurveTo(48, 66, 66, 44, 100, 44);
    ctx.closePath();
    ctx.fill();

    // brow ridge
    ctx.fillStyle = T.furDark;
    ctx.beginPath();
    ctx.moveTo(52, 84);
    ctx.bezierCurveTo(60, 66, 78, 58, 100, 58);
    ctx.bezierCurveTo(122, 58, 140, 66, 148, 84);
    ctx.bezierCurveTo(138, 74, 122, 70, 100, 70);
    ctx.bezierCurveTo(78, 70, 62, 74, 52, 84);
    ctx.closePath();
    ctx.fill();

    eye(ctx, 79, pose.blink, pose.gazeX, pose.gazeY);
    eye(ctx, 121, pose.blink, pose.gazeX, pose.gazeY);

    // muzzle
    ctx.fillStyle = T.muzzle;
    ctx.beginPath();
    ctx.ellipse(100, 122, 34, 25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = T.nostril;
    ctx.beginPath();
    ctx.ellipse(91, 115, 4.4, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(109, 115, 4.4, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Smile and open "hoo" are crossfaded rather than morphed — at this size
    // the swap is invisible and a real morph would need a third path.
    if (pose.mouth < 1) {
      ctx.globalAlpha = 1 - pose.mouth;
      ctx.strokeStyle = T.nostril;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(82, 130);
      ctx.bezierCurveTo(90, 141, 110, 141, 118, 130);
      ctx.stroke();
    }
    if (pose.mouth > 0) {
      ctx.globalAlpha = pose.mouth;
      ctx.fillStyle = T.nostril;
      ctx.beginPath();
      ctx.ellipse(100, 133, 13, 9 + pose.mouth * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------------- public */

  var DEFAULTS = {
    breath: 0, lean: 0, headTilt: 0, armL: 0, armR: 0,
    blink: 0, mouth: 0, gazeX: 0, gazeY: 0, reach: 'chest'
  };

  NP.gorillaArt = {
    width: BOX_W,
    height: BOX_H,

    /* `x, y` is the ground point under his feet; `scale` is box units to CSS
       pixels. `pose` may omit any field. */
    draw: function (ctx, x, y, scale, pose) {
      var p = pose || DEFAULTS;
      var breath   = p.breath   || 0;
      var lean     = p.lean     || 0;
      var headTilt = p.headTilt || 0;
      var armL     = p.armL     || 0;
      var armR     = p.armR     || 0;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.translate(-BOX_W / 2, -BOX_H);

      // Rearing back pivots the whole animal about his hips, and lifts him
      // off his heels. Big enough to see from across a room — a chest thump
      // that only moves the arms reads as a twitch.
      ctx.translate(100, BOX_H);
      ctx.rotate(-lean * 0.085);
      ctx.translate(0, -lean * 15);
      ctx.scale(1 + lean * 0.04, 1 + lean * 0.05);
      ctx.translate(-100, -BOX_H);

      var to = REACH[p.reach] || CHEST;

      // far arm, then the body, then the near arm — so the near fist reads as
      // being in front of the chest it is drumming
      arm(ctx, 1, armR, T.furDark, to);
      torso(ctx);
      chestPatch(ctx, breath);
      arm(ctx, -1, armL, T.fur, to);

      ctx.save();
      ctx.translate(100, 146);
      ctx.rotate(headTilt);
      ctx.translate(-100, -146);
      head(ctx, {
        blink: p.blink || 0,
        mouth: p.mouth || 0,
        gazeX: p.gazeX || 0,
        gazeY: p.gazeY || 0
      });
      ctx.restore();

      // Hands go over the eyes, so they must be drawn after the face.
      if (p.reach === 'eyes') {
        arm(ctx, 1, armR, T.furDark, to);
        arm(ctx, -1, armL, T.fur, to);
      }

      ctx.restore();
    }
  };
})(window.NP = window.NP || {});
