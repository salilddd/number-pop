/* localStorage wrapper.
   Every read and write is guarded: opening index.html straight from disk
   gives some browsers a null origin where storage throws instead of
   returning null, and a thrown error there would take the whole game down.
   When storage is unavailable the game still plays, it just forgets. */
(function (NP) {
  'use strict';

  var PREFIX = 'numberpop.';
  var memory = {};          // fallback so a session still works without storage
  var available = (function () {
    try {
      var k = PREFIX + '__t';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function readRaw(key) {
    if (!available) return memory[key] == null ? null : memory[key];
    try { return window.localStorage.getItem(PREFIX + key); }
    catch (e) { return null; }
  }

  function writeRaw(key, value) {
    memory[key] = value;
    if (!available) return;
    try { window.localStorage.setItem(PREFIX + key, value); }
    catch (e) { /* quota or private mode — memory fallback already holds it */ }
  }

  /* -1 when the hook is absent, which is every real session. See the bananas
     block below for what it is for. */
  function debugNumber(name) {
    var m = typeof window !== 'undefined' && window.location
          ? new RegExp('[?&]' + name + '=(\\d+)').exec(window.location.search)
          : null;
    return m ? parseInt(m[1], 10) : -1;
  }

  var debugBananas = debugNumber('bananas');
  var debugGrown   = debugNumber('grown');

  function readJSON(key, fallback) {
    var raw = readRaw(key);
    if (raw == null) return fallback;
    try {
      var parsed = JSON.parse(raw);
      return (parsed == null) ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { writeRaw(key, JSON.stringify(value)); }
    catch (e) { /* circular or too large — nothing sensible to do */ }
  }

  var DEFAULT_SETTINGS = {
    ops: ['mul'],
    tables: [2, 3, 4, 5, 10],
    maxMultiplier: 10,
    addMax: 20,
    difficulty: 'normal',
    sound: true,
    jungle: true,
    blanks: true,
    judge: true,
    retry: true
  };

  var storage = {
    supported: available,

    /* ---------------- settings ---------------- */

    loadSettings: function () {
      var saved = readJSON('settings', {});
      var s = {};
      for (var k in DEFAULT_SETTINGS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) {
          s[k] = Object.prototype.hasOwnProperty.call(saved, k) ? saved[k] : DEFAULT_SETTINGS[k];
        }
      }
      // Repair anything a hand-edit or an older version could have left broken.
      if (!Array.isArray(s.ops) || !s.ops.length) s.ops = DEFAULT_SETTINGS.ops.slice();
      if (!Array.isArray(s.tables) || !s.tables.length) s.tables = DEFAULT_SETTINGS.tables.slice();
      if (['easy', 'normal', 'hard'].indexOf(s.difficulty) < 0) s.difficulty = 'normal';
      if ([10, 12].indexOf(s.maxMultiplier) < 0) s.maxMultiplier = 10;
      if ([10, 20, 50, 100].indexOf(s.addMax) < 0) s.addMax = 20;
      s.sound = s.sound !== false;
      s.jungle = s.jungle !== false;
      s.blanks = s.blanks !== false;
      s.judge = s.judge !== false;
      s.retry = s.retry !== false;
      return s;
    },

    saveSettings: function (s) { writeJSON('settings', s); },

    defaults: function () { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); },

    /* ---------------- highscores ----------------
       Kept per topic-set, so beating your 2× table score does not
       require beating your mixed-mode score. */

    getHighscore: function (topicKey) {
      var all = readJSON('highscores', {});
      return all[topicKey] || 0;
    },

    setHighscore: function (topicKey, score) {
      var all = readJSON('highscores', {});
      if (score > (all[topicKey] || 0)) {
        all[topicKey] = score;
        writeJSON('highscores', all);
        return true;
      }
      return false;
    },

    /* ---------------- level ladder ----------------
       How far up the ladder this topic set has ever got. Kept apart from
       the highscore because they measure different things: a careful,
       slow player climbs further, a fast one scores higher. */

    getBestLevel: function (topicKey) {
      var all = readJSON('levels', {});
      return all[topicKey] || 1;
    },

    setBestLevel: function (topicKey, level) {
      var all = readJSON('levels', {});
      if (level > (all[topicKey] || 0)) {
        all[topicKey] = level;
        writeJSON('levels', all);
        return true;
      }
      return false;
    },

    /* ---------------- the Big Boss ----------------
       How many waves of level 13 this topic set has ever survived. The ladder
       tops out at 13 and stays there, so past that the wave is the only
       number left that says how far a run actually got. */

    getBestWave: function (topicKey) {
      var all = readJSON('waves', {});
      return all[topicKey] || 0;
    },

    setBestWave: function (topicKey, wave) {
      var all = readJSON('waves', {});
      if (wave > (all[topicKey] || 0)) {
        all[topicKey] = wave;
        writeJSON('waves', all);
        return true;
      }
      return false;
    },

    /* Best score across every topic set, for the home screen. */
    getBestOverall: function () {
      var all = readJSON('highscores', {});
      var best = 0, bestKey = null;
      for (var k in all) {
        if (all[k] > best) { best = all[k]; bestKey = k; }
      }
      return { score: best, topicKey: bestKey };
    },

    /* ---------------- per-fact stats ----------------
       Feeds weakness-weighted question selection. Keyed by the fact
       itself ("9x5"), so stats survive a settings change. */

    loadFacts: function () { return readJSON('facts', {}); },

    recordFact: function (key, correct, ms) {
      var facts = readJSON('facts', {});
      var f = facts[key] || { seen: 0, correct: 0, avgMs: 4000, lastSeen: 0, box: 1 };
      f.seen++;
      if (correct) {
        f.correct++;
        // Exponential moving average: recent answers should dominate.
        f.avgMs = Math.round(f.avgMs * 0.7 + ms * 0.3);
        f.box = Math.min(5, f.box + 1);
      } else {
        f.box = 1;
      }
      f.lastSeen = Date.now();
      facts[key] = f;
      writeJSON('facts', facts);
    },

    /* ---------------- bananas ----------------
       `?bananas=8` forces the held balance and `?grown=45` the size of the
       jungle, the same way `?level=` forces the rung. Sixty perfect levels is
       not something you can play through to check a layout, and the jungle is
       the one part of the game whose entire appearance hangs off a number
       that takes weeks to move. Neither hook writes anything back, so a real
       save cannot be damaged by visiting the URL.
       The one currency in the game, and the only thing it buys is the
       jungle on the home screen. Bananas are earned by three-starring a
       level and banked when a run ends, so the count is a tally of perfect
       levels — quitting mid-run banks nothing, exactly as it scores
       nothing. */

    getBananas: function () {
      if (debugBananas >= 0) return debugBananas;
      var n = readJSON('bananas', 0);
      return typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) : 0;
    },

    addBananas: function (n) {
      var total = storage.getBananas() + Math.max(0, n | 0);
      writeJSON('bananas', total);
      return total;
    },

    /* Bananas are a balance now, not a tally: they are held until the child
       spends one on the jungle by tapping the pile. Returns false when there
       is nothing to spend, so the caller can say so rather than going quiet. */
    spendBanana: function () {
      var total = storage.getBananas();
      if (total <= 0) return false;
      writeJSON('bananas', total - 1);
      return true;
    },

    /* ---------------- the jungle ----------------
       `grown` is the number of growth steps the jungle has been given, and it
       is the entire state of the garden. Growth is strictly ordered — step k
       plants plot (k-1) % plots, and the pass after that flowers it — so one
       integer says which plants exist and how far along each one is.

       That is what makes both directions cheap: spending a banana adds one,
       and a day passing takes two off. "Newest dies first" and "one growth
       step at a time" are not rules that had to be written, they are just
       what counting down means. */

    getGrown: function () {
      if (debugGrown >= 0) return debugGrown;
      var n = readJSON('grown', 0);
      return typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) : 0;
    },

    /* Ignored while `?grown=` is forcing the value, so that spending or aging
       on a debug page cannot write a made-up number over a real save. */
    setGrown: function (n) {
      if (debugGrown >= 0) return;
      writeJSON('grown', Math.max(0, n | 0));
    },

    /* The local day the jungle was last aged, as a day index. Local rather
       than UTC so that "a new day" means what a child in front of the phone
       thinks it means. -1 until the first visit, which is what stops a brand
       new install from being aged before it has grown anything. */
    getLastDay: function () {
      var n = readJSON('gardenday', -1);
      return typeof n === 'number' && isFinite(n) ? Math.floor(n) : -1;
    },

    setLastDay: function (n) {
      writeJSON('gardenday', n | 0);
    },

    /* ---------------- the peel hat ----------------
       Earned once, by feeding the gorilla until he is sated, and kept for
       good: he is wearing it on every visit after. A one-way latch rather
       than a counter, because there is nothing to count — he either found
       out that a peel makes a hat or he has not yet. */

    getPeelHat: function () {
      return readJSON('peelhat', false) === true;
    },

    setPeelHat: function () {
      writeJSON('peelhat', true);
      return true;
    },

    /* ---------------- the rest of the wardrobe ----------------
       The peel was the only thing he could be wearing long before there was
       anything else, and it keeps its own key: a child who earned it before
       the others existed still has it. Everything since lives in one object
       of latches beside it.

       Like the peel, none of this is cleared by resetProgress. It is not
       score — it is a record of things found out, and finding out that a leaf
       makes a hat cannot be un-found. */
    getWardrobe: function () {
      var worn = readJSON('wardrobe', null);
      if (!worn || typeof worn !== 'object') worn = {};
      if (storage.getPeelHat()) worn.peel = true;
      return worn;
    },

    unlockHat: function (name) {
      var worn = storage.getWardrobe();
      if (worn[name]) return false;         // already had it
      worn[name] = true;
      writeJSON('wardrobe', worn);
      return true;
    },

    resetProgress: function () {
      writeJSON('facts', {});
      writeJSON('highscores', {});
      writeJSON('levels', {});
      writeJSON('waves', {});
      writeJSON('bananas', 0);
      writeJSON('grown', 0);
      writeJSON('gardenday', -1);
      writeJSON('peelhat', false);
    }
  };

  NP.storage = storage;
})(window.NP = window.NP || {});
