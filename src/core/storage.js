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
    jungle: true
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

    resetProgress: function () {
      writeJSON('facts', {});
      writeJSON('highscores', {});
      writeJSON('levels', {});
    }
  };

  NP.storage = storage;
})(window.NP = window.NP || {});
