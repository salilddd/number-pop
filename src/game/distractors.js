/* Wrong-answer generation.

   Distractor quality *is* the difficulty curve. Random numbers make a hard
   question trivial, because the right answer ends up the only plausible one
   on screen. Everything here reproduces an error a child actually makes:
   the adjacent multiple, the dropped carry, the column flip, the digit swap.

   Candidates are sorted into "near" (genuinely confusable) and "far"
   (obviously wrong once you think), and difficulty decides the mix. */
(function (NP) {
  'use strict';

  var rng = NP.rng;

  /* ------------------------------------------------- misconception models */

  /* 27 + 15 -> 32. Adds each column and forgets to carry the ten.
     The single most valuable addition distractor there is. */
  function noCarryAdd(a, b) {
    var result = 0, place = 1;
    while (a > 0 || b > 0) {
      result += ((a % 10) + (b % 10)) % 10 * place;
      a = Math.floor(a / 10);
      b = Math.floor(b / 10);
      place *= 10;
    }
    return result;
  }

  /* 52 - 28 -> 36. Takes the smaller digit from the larger in each column,
     regardless of which number it belongs to. */
  function columnFlipSub(a, b) {
    var result = 0, place = 1;
    while (a > 0 || b > 0) {
      result += Math.abs((a % 10) - (b % 10)) * place;
      a = Math.floor(a / 10);
      b = Math.floor(b / 10);
      place *= 10;
    }
    return result;
  }

  /* 45 -> 54 */
  function digitSwap(n) {
    var s = String(n);
    if (s.length < 2) return null;
    var swapped = parseInt(s.split('').reverse().join(''), 10);
    return swapped === n ? null : swapped;
  }

  /* 45 -> 25, 35, 55, 65: right ones digit, wrong tens. */
  function sameOnesDigit(n, out) {
    var ones = n % 10;
    var tens = Math.floor(n / 10);
    for (var d = -3; d <= 3; d++) {
      if (d === 0) continue;
      var candidate = (tens + d) * 10 + ones;
      if (candidate > 0 && candidate !== n) out.push(candidate);
    }
  }

  /* ------------------------------------------------------ per-operation */

  function candidatesFor(q) {
    var near = [];
    var far = [];
    var a = q.a, b = q.b, ans = q.answer;

    near.push(ans + 1, ans - 1, ans + 2, ans - 2);

    var swapped = digitSwap(ans);
    if (swapped != null) near.push(swapped);

    if (q.op === 'mul') {
      // adjacent multiples — the classic slip along a times table
      near.push(a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b);
      sameOnesDigit(ans, near);
      far.push(a + b, Math.abs(a - b));
      for (var m = 1; m <= 12; m++) {
        if (m !== b && m !== b + 1 && m !== b - 1) far.push(a * m);
      }
    } else if (q.op === 'div') {
      // q.a is the dividend, q.b the divisor, ans the quotient
      near.push(ans + 3, ans - 3, q.b, q.b + 1);
      far.push(q.a - q.b, q.a + q.b, q.b * 2);
      for (var k = 1; k <= 12; k++) {
        if (Math.abs(k - ans) > 3) far.push(k);
      }
    } else if (q.op === 'add') {
      var dropped = noCarryAdd(a, b);
      if (dropped !== ans) near.push(dropped);
      near.push(ans + 10, ans - 10);
      sameOnesDigit(ans, near);
      far.push(Math.abs(a - b), a * b > 200 ? a + b + 20 : a * b);
      far.push(ans + 20, ans - 20, ans + 11, ans - 9);
    } else if (q.op === 'sub') {
      var flipped = columnFlipSub(a, b);
      if (flipped !== ans) near.push(flipped);
      near.push(ans + 10, ans - 10);
      sameOnesDigit(ans, near);
      far.push(a + b, b - a, ans + 20, ans - 20);
    }

    return { near: near, far: far };
  }

  /* --------------------------------------------------------- assembly */

  function valid(v, ans, seen, ceiling) {
    return Number.isFinite(v)
      && Math.floor(v) === v
      && v >= 0
      && v !== ans
      && v <= ceiling
      && !seen[v];
  }

  function takeFrom(pool, ans, seen, ceiling) {
    // Walk a shuffled copy so repeated calls don't always favour the same
    // strategy, and so the same question twice looks different.
    rng.shuffle(pool);
    while (pool.length) {
      var v = pool.pop();
      if (valid(v, ans, seen, ceiling)) return v;
    }
    return null;
  }

  NP.distractors = {
    noCarryAdd: noCarryAdd,
    columnFlipSub: columnFlipSub,

    /* Returns `count` unique wrong answers for a question. */
    generate: function (q, count, nearRatio) {
      var pools = candidatesFor(q);
      var ans = q.answer;
      var seen = {};
      seen[ans] = true;

      // Keep options in a believable range — a 400 next to a 45 gives the
      // answer away by looking absurd.
      var ceiling = Math.max(20, ans * 3 + 25);

      var out = [];
      var ratio = nearRatio == null ? 0.55 : nearRatio;

      for (var i = 0; i < count; i++) {
        var wantNear = rng.next() < ratio;
        var first = wantNear ? pools.near : pools.far;
        var second = wantNear ? pools.far : pools.near;

        var v = takeFrom(first, ans, seen, ceiling);
        if (v == null) v = takeFrom(second, ans, seen, ceiling);

        // Last resort: something random but nearby, so a slot is never empty.
        var guard = 0;
        while (v == null && guard++ < 60) {
          var span = Math.max(6, Math.round(ans * 0.5));
          var candidate = ans + rng.int(-span, span);
          if (valid(candidate, ans, seen, ceiling)) v = candidate;
        }
        if (v == null) continue;

        seen[v] = true;
        out.push(v);
      }

      return out;
    }
  };
})(window.NP = window.NP || {});
