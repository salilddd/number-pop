/* Seeded PRNG + small random helpers.
   Seeded so the daily challenge can hand everyone the same questions,
   and so a bad run can be replayed exactly while debugging. */
(function (NP) {
  'use strict';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var current = Math.random;

  var rng = {
    /* Pass no seed to go back to unseeded Math.random. */
    seed: function (s) {
      current = (s == null) ? Math.random : mulberry32(s);
    },

    /* Seed from a YYYY-MM-DD string, for the daily challenge. */
    seedFromDate: function (d) {
      var str = d || new Date().toISOString().slice(0, 10);
      var h = 2166136261;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      rng.seed(h);
    },

    next: function () { return current(); },

    /* inclusive both ends */
    int: function (min, max) {
      return min + Math.floor(current() * (max - min + 1));
    },

    float: function (min, max) {
      return min + current() * (max - min);
    },

    pick: function (arr) {
      return arr[Math.floor(current() * arr.length)];
    },

    bool: function (p) {
      return current() < (p == null ? 0.5 : p);
    },

    /* Fisher-Yates, in place */
    shuffle: function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(current() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },

    /* Pick an index from an array of non-negative weights. */
    weightedIndex: function (weights) {
      var total = 0, i;
      for (i = 0; i < weights.length; i++) total += weights[i];
      if (total <= 0) return Math.floor(current() * weights.length);
      var r = current() * total;
      for (i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    }
  };

  NP.rng = rng;
})(window.NP = window.NP || {});
