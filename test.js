// Logic harness for Number Pop, run with:  cscript //Nologo //E:JScript test.js
// cscript's JScript is ES3-era, so the modern built-ins the game uses are
// polyfilled here. The game itself targets real browsers where these exist.

var window = this;
window.window = window;

/* ------------------------------- polyfills ------------------------------- */
if (!Math.imul) {
  Math.imul = function (a, b) {
    var ah = (a >>> 16) & 0xffff, al = a & 0xffff;
    var bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
  };
}
if (!Math.hypot) {
  Math.hypot = function (x, y) { return Math.sqrt(x * x + y * y); };
}
if (!Math.sign) {
  Math.sign = function (x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); };
}
if (!Number.isFinite) {
  Number.isFinite = function (v) {
    return typeof v === 'number' && isFinite(v);
  };
}
if (!Date.now) {
  Date.now = function () { return new Date().getTime(); };
}
if (!Array.isArray) {
  Array.isArray = function (v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  };
}
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (needle) {
    for (var i = 0; i < this.length; i++) if (this[i] === needle) return i;
    return -1;
  };
}
if (!Array.prototype.forEach) {
  Array.prototype.forEach = function (fn) {
    for (var i = 0; i < this.length; i++) fn(this[i], i, this);
  };
}
if (typeof JSON === 'undefined') {
  JSON = {
    parse: function (s) { return eval('(' + s + ')'); },
    stringify: function (v) {
      if (v === null || v === undefined) return 'null';
      var t = typeof v;
      if (t === 'number' || t === 'boolean') return String(v);
      if (t === 'string') return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      var out = [], i, k;
      if (v instanceof Array) {
        for (i = 0; i < v.length; i++) out.push(JSON.stringify(v[i]));
        return '[' + out.join(',') + ']';
      }
      for (k in v) {
        if (v.hasOwnProperty(k)) out.push(JSON.stringify(k) + ':' + JSON.stringify(v[k]));
      }
      return '{' + out.join(',') + '}';
    }
  };
}

/* ------------------------------- loader ---------------------------------- */
// Resolve relative to this script, so the harness travels with the folder.
var ROOT = (function () {
  var full = WScript.ScriptFullName;
  return full.substring(0, full.lastIndexOf('\\') + 1);
})();
// ADODB.Stream rather than FileSystemObject: the sources are UTF-8 and FSO
// would hand back mojibake for the multiplication sign and thin space.
// `patch` rewrites the text before it is evaluated, for the rare source that
// uses something JScript cannot parse. It must actually match: a patch that
// quietly stops applying would surface as a baffling compile error instead.
function load(rel, patch) {
  var st = new ActiveXObject('ADODB.Stream');
  st.Type = 2;                       // adTypeText
  st.Charset = 'utf-8';
  st.Open();
  st.LoadFromFile(ROOT + rel.replace(/\//g, '\\'));
  var src = st.ReadText();
  st.Close();
  if (patch) {
    var patched = patch(src);
    if (patched === src) throw new Error('patch for ' + rel + ' matched nothing');
    src = patched;
  }
  eval(src);
}

load('src/core/rng.js');
load('src/core/storage.js');
load('src/art/theme.js');
load('src/game/distractors.js');
load('src/game/questions.js');
load('src/game/scoring.js');
load('src/game/motion.js');

var NP = window.NP;
NP.input = { segmentDistanceSq: function () { return 0; } };
load('src/game/bubbles.js');

/* session.js drives two modules that only mean anything in a browser: one
   draws, the other makes noise. Stub both, and record what input.setEnabled
   was last told — that flag is how a pause actually stops taps reaching the
   field, so it is worth asserting on. */
NP.input.setEnabled = function (on) { NP.input.enabled = on; };

function stubModule(names) {
  var m = {}, noop = function () {};
  for (var n = 0; n < names.length; n++) m[names[n]] = noop;
  return m;
}
NP.audio = stubModule(['correct', 'wrong', 'timeout', 'lifeLost', 'streak',
  'levelUp', 'star', 'heart', 'fanfare', 'gameOver', 'rustle', 'click',
  'unlock', 'start', 'thump', 'sparkle', 'setEnabled']);
NP.effects = stubModule(['burst', 'ring', 'floatText', 'dust', 'shake',
  'reset', 'update', 'banner', 'confetti', 'fireworks', 'shakeOffset']);

load('src/game/levels.js');
/* session.js publishes its state through an ES5 getter, which JScript is too
   old to parse. Dropping the accessor costs the harness nothing: start()
   hands back the same object, and that is what these tests hold on to. */
load('src/game/session.js', function (src) {
  return src.replace('get state() { return state; },', '');
});

/* ------------------------------- assertions ------------------------------ */
var passed = 0, failed = 0, failures = [];

function ok(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? '  ->  ' + detail : '')); }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, 'expected ' + expected + ', got ' + actual);
}

function say(s) { WScript.Echo(s); }

/* =============================== rng ==================================== */
say('--- rng ---');
NP.rng.seed(12345);
var inRange = true, allSame = true, first = NP.rng.next();
for (var i = 0; i < 5000; i++) {
  var v = NP.rng.next();
  if (v < 0 || v >= 1) inRange = false;
  if (v !== first) allSame = false;
}
ok('rng.next stays in [0,1)', inRange);
ok('rng.next varies', !allSame);

var intOk = true;
for (i = 0; i < 5000; i++) {
  var n = NP.rng.int(3, 7);
  if (n < 3 || n > 7 || n !== Math.floor(n)) intOk = false;
}
ok('rng.int respects inclusive bounds', intOk);

NP.rng.seed(999);
var seqA = []; for (i = 0; i < 10; i++) seqA.push(NP.rng.next());
NP.rng.seed(999);
var seqB = []; for (i = 0; i < 10; i++) seqB.push(NP.rng.next());
ok('rng is reproducible from a seed', seqA.join(',') === seqB.join(','));

var wIdx = NP.rng.weightedIndex([0, 0, 5, 0]);
eq('weightedIndex picks the only weighted entry', wIdx, 2);

/* =========================== misconceptions ============================= */
say('--- misconception models ---');
eq('dropped carry: 27 + 15', NP.distractors.noCarryAdd(27, 15), 32);
eq('dropped carry: 8 + 7', NP.distractors.noCarryAdd(8, 7), 5);
eq('column flip: 52 - 28', NP.distractors.columnFlipSub(52, 28), 36);
eq('column flip: 43 - 17', NP.distractors.columnFlipSub(43, 17), 34);

/* ============================ distractors =============================== */
say('--- distractors ---');
NP.rng.seed(4242);

var q95 = NP.questions.makeQuestion('mul', 9, 5);
eq('9 x 5 answer', q95.answer, 45);
eq('9 x 5 text', q95.text, '9 \u00d7 5 = ?');

var distractorRuns = 0, dBad = [];
var ops = ['mul', 'div', 'add', 'sub'];
for (var run = 0; run < 4000; run++) {
  var op = ops[run % 4];
  var q;
  if (op === 'mul') q = NP.questions.makeQuestion('mul', NP.rng.int(2, 12), NP.rng.int(1, 12));
  else if (op === 'div') { var t = NP.rng.int(2, 12), m = NP.rng.int(1, 12); q = NP.questions.makeQuestion('div', t * m, t); }
  else if (op === 'add') { var a = NP.rng.int(1, 60); q = NP.questions.makeQuestion('add', a, NP.rng.int(1, 100 - a)); }
  else { var x = NP.rng.int(2, 100); q = NP.questions.makeQuestion('sub', x, NP.rng.int(1, x - 1)); }

  var want = NP.rng.int(2, 5);
  var ds = NP.distractors.generate(q, want, 0.55);
  distractorRuns++;

  if (ds.length !== want) dBad.push('count ' + ds.length + '/' + want + ' for ' + q.text);
  var seen = {};
  var lo = q.answer <= 12 ? 0 : Math.floor(q.answer * 0.35);
  var hi = Math.max(12, Math.round(q.answer * 2 + 8));
  for (i = 0; i < ds.length; i++) {
    var d = ds[i];
    if (d === q.answer) dBad.push('equals answer: ' + q.text + ' -> ' + d);
    if (d < 0) dBad.push('negative: ' + q.text + ' -> ' + d);
    if (d !== Math.floor(d)) dBad.push('non-integer: ' + q.text + ' -> ' + d);
    if (seen[d]) dBad.push('duplicate: ' + q.text + ' -> ' + d);
    // An option far outside the answer's neighbourhood can be ruled out
    // without doing any arithmetic, which defeats the question.
    if (d < lo || d > hi) dBad.push('implausible: ' + q.text + ' -> ' + d + ' (band ' + lo + '-' + hi + ')');
    seen[d] = true;
  }
}
ok('distractors: ' + distractorRuns + ' runs produce valid option sets',
   dBad.length === 0, dBad.slice(0, 5).join(' | '));

// The 9x5 example from the reference screenshots should draw on the
// near-miss and same-ones-digit strategies on hard.
NP.rng.seed(7);
var nearHits = 0, samples = 400;
for (i = 0; i < samples; i++) {
  var opts = NP.distractors.generate(q95, 4, 0.85);
  for (var j = 0; j < opts.length; j++) {
    var o = opts[j];
    if (Math.abs(o - 45) <= 2 || o % 10 === 5 || o === 54 || o === 40 || o === 50 || o === 36) nearHits++;
  }
}
ok('hard distractors for 9x5 skew to confusable values',
   nearHits / (samples * 4) > 0.6, 'ratio ' + (nearHits / (samples * 4)).toFixed(2));

/* ============================= questions ================================ */
say('--- question generation ---');
NP.rng.seed(31337);

function sweep(settings, rounds) {
  var pool = NP.questions.buildPool(settings);
  var facts = {};
  var recent = [];
  var bad = [];
  var opsSeen = {};

  for (var r = 0; r < rounds; r++) {
    var q = NP.questions.next(settings, pool, facts, recent);
    opsSeen[q.op] = (opsSeen[q.op] || 0) + 1;

    recent.push(q.key);
    if (recent.length > 3) recent.shift();

    if (settings.ops.indexOf(q.op) < 0) bad.push('op not enabled: ' + q.op);
    if (q.answer !== Math.floor(q.answer)) bad.push('non-integer answer: ' + q.text);
    if (q.answer < 0) bad.push('negative answer: ' + q.text);

    if (q.op === 'mul') {
      if (q.answer !== q.a * q.b) bad.push('mul wrong: ' + q.text);
      if (settings.tables.indexOf(q.a) < 0) bad.push('mul off-table: ' + q.text);
      if (q.b > settings.maxMultiplier) bad.push('mul over range: ' + q.text);
    }
    if (q.op === 'div') {
      if (q.answer !== q.a / q.b) bad.push('div wrong: ' + q.text);
      if (q.a % q.b !== 0) bad.push('div not exact: ' + q.text);
    }
    if (q.op === 'add') {
      if (q.answer !== q.a + q.b) bad.push('add wrong: ' + q.text);
      if (q.answer > settings.addMax) bad.push('add over max: ' + q.text + ' > ' + settings.addMax);
    }
    if (q.op === 'sub') {
      if (q.answer !== q.a - q.b) bad.push('sub wrong: ' + q.text);
      if (q.answer < 0) bad.push('sub negative: ' + q.text);
      if (q.a > settings.addMax) bad.push('sub over max: ' + q.text);
    }

    // full round trip: build the option set the game would show
    var opts = NP.distractors.generate(q, 4, 0.55);
    var hasAnswer = false;
    for (var k = 0; k < opts.length; k++) if (opts[k] === q.answer) hasAnswer = true;
    if (hasAnswer) bad.push('answer leaked into distractors: ' + q.text);
  }
  return { bad: bad, opsSeen: opsSeen };
}

var s1 = { ops: ['mul'], tables: [2, 5, 10], maxMultiplier: 10, addMax: 20, difficulty: 'normal' };
var r1 = sweep(s1, 3000);
ok('multiplication sweep (2,5,10 up to 10)', r1.bad.length === 0, r1.bad.slice(0, 3).join(' | '));

var s2 = { ops: ['mul', 'div', 'add', 'sub'], tables: [3, 4, 7, 12], maxMultiplier: 12, addMax: 100, difficulty: 'hard' };
var r2 = sweep(s2, 4000);
ok('mixed sweep with add/sub up to 100', r2.bad.length === 0, r2.bad.slice(0, 3).join(' | '));
ok('mixed mode uses all four operations',
   r2.opsSeen.mul && r2.opsSeen.div && r2.opsSeen.add && r2.opsSeen.sub,
   'saw ' + JSON.stringify(r2.opsSeen));

var s3 = { ops: ['add', 'sub'], tables: [2], maxMultiplier: 10, addMax: 10, difficulty: 'easy' };
var r3 = sweep(s3, 2000);
ok('small add/sub sweep (up to 10)', r3.bad.length === 0, r3.bad.slice(0, 3).join(' | '));

// A single table on easy is the tightest pool the game allows; it must not
// hang trying to satisfy the no-repeat rule.
var s4 = { ops: ['mul'], tables: [2], maxMultiplier: 10, addMax: 20, difficulty: 'easy' };
var r4 = sweep(s4, 500);
ok('single-table pool terminates and stays valid', r4.bad.length === 0, r4.bad.slice(0, 3).join(' | '));

// Weakness weighting should actually bias selection.
NP.rng.seed(555);
var pool5 = NP.questions.buildPool(s1);
var facts5 = {};
facts5['5x7'] = { seen: 10, correct: 1, avgMs: 6000, lastSeen: Date.now() - 86400000 * 3, box: 1 };
var weakCount = 0, total5 = 6000;
for (i = 0; i < total5; i++) {
  var qq = NP.questions.next(s1, pool5, facts5, []);
  if (qq.key === '5x7') weakCount++;
}
var uniformShare = 1 / 30;   // 3 tables x 10 multipliers
ok('a weak fact is drawn more often than chance',
   weakCount / total5 > uniformShare * 1.5,
   'share ' + (weakCount / total5).toFixed(4) + ' vs uniform ' + uniformShare.toFixed(4));

eq('commutative facts share a mastery key',
   NP.questions.makeQuestion('mul', 3, 4).key,
   NP.questions.makeQuestion('mul', 4, 3).key);

/* ============================== scoring ================================= */
say('--- scoring ---');
var hard = NP.questions.preset('hard');
var normal = NP.questions.preset('normal');

eq('instant answer, no streak, normal', NP.scoring.points(0, 0, normal), 500);
eq('slow answer floors at base', NP.scoring.points(99, 0, normal), 100);
eq('streak multiplier caps at 2x', NP.scoring.streakMultiplier(50), 2);
eq('instant + max streak on hard', NP.scoring.points(0, 10, hard), Math.round(500 * 2 * 1.35));
ok('score scale matches the reference highscore',
   NP.scoring.points(0, 10, hard) > 1200 && NP.scoring.points(0, 10, hard) < 1500,
   'got ' + NP.scoring.points(0, 10, hard));

var monotonic = true, prev = Infinity;
for (var tt = 0; tt <= 3; tt += 0.1) {
  var p = NP.scoring.points(tt, 3, normal);
  if (p > prev) monotonic = false;
  prev = p;
}
ok('points never increase as time passes', monotonic);
eq('format groups thousands with a thin space', NP.scoring.format(67853), ('67' + String.fromCharCode(0x2009) + '853'));
eq('format leaves small numbers alone', NP.scoring.format(880), '880');

/* ============================== physics ================================= */
say('--- bubble physics ---');
NP.rng.seed(2024);
var rect = { left: 8, top: 150, right: 512, bottom: 900 };

var vals = [45, 43, 25, 20, 54];
// bubbles.js takes the level tuning object now; no `mode` means plain drift.
var cfg = { speed: 55 };
var list = NP.bubbles.spawn(vals, 45, rect, cfg);
eq('spawn count', list.length, 5);
var correctCount = 0;
for (i = 0; i < list.length; i++) if (list[i].correct) correctCount++;
eq('exactly one correct bubble', correctCount, 1);

var startInside = true;
for (i = 0; i < list.length; i++) {
  var b = list[i];
  if (b.x - b.r < rect.left - 1 || b.x + b.r > rect.right + 1 ||
      b.y - b.r < rect.top - 1 || b.y + b.r > rect.bottom + 1) startInside = false;
}
ok('bubbles spawn inside the play rect', startInside);

// Simulate 60 seconds at 60fps and confirm nothing escapes or stalls.
var escaped = false, stalled = false, overlapped = false;
for (var frame = 0; frame < 3600; frame++) {
  NP.bubbles.update(list, 1 / 60, rect, cfg);
  for (i = 0; i < list.length; i++) {
    var bb = list[i];
    if (bb.state !== 'alive') continue;
    if (bb.x - bb.r < rect.left - 2 || bb.x + bb.r > rect.right + 2 ||
        bb.y - bb.r < rect.top - 2 || bb.y + bb.r > rect.bottom + 2) escaped = true;
    var sp = Math.sqrt(bb.vx * bb.vx + bb.vy * bb.vy);
    if (sp < 55 * 0.5 || sp > 55 * 1.7) stalled = true;
    for (j = i + 1; j < list.length; j++) {
      var cc = list[j];
      if (cc.state !== 'alive') continue;
      var dx = cc.x - bb.x, dy = cc.y - bb.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      // allow a hair of penetration within a single frame's correction
      if (dist < (bb.r + cc.r) * 0.94) overlapped = true;
    }
  }
}
ok('no bubble escapes the play rect over 60s', !escaped);
ok('speeds stay inside the clamp band', !stalled);
ok('bubbles never deeply overlap', !overlapped);

// Radius must shrink as the count rises, and stay usable on a small screen.
var rBig = NP.bubbles.radiusFor(3, rect);
var rSmall = NP.bubbles.radiusFor(6, rect);
ok('more bubbles means smaller bubbles', rSmall < rBig, rSmall + ' vs ' + rBig);
var tinyRect = { left: 4, top: 120, right: 316, bottom: 500 };
var rTiny = NP.bubbles.radiusFor(6, tinyRect);
ok('radius stays sane on a small phone', rTiny >= 24 && rTiny * 2 < (tinyRect.right - tinyRect.left), 'r=' + rTiny);

// Hit testing
var probe = list[0];
probe.state = 'alive';
var hit = NP.bubbles.hitAtPoint(list, probe.x, probe.y);
ok('point hit test finds the bubble under the finger', hit === probe);
var miss = NP.bubbles.hitAtPoint(list, rect.left + 1, rect.top + 1);
ok('point hit test misses empty space', miss === null || miss !== probe);

/* ================================ pause ================================= */
say('--- pause ---');

function startRun() {
  return NP.session.start(NP.storage.loadSettings(),
    { left: 8, top: 120, right: 392, bottom: 700 }, {}, 0);
}

function step(frames) {
  for (var f = 0; f < frames; f++) NP.session.update(1 / 60);
}

function positions(run) {
  var out = [];
  for (var p = 0; p < run.bubbles.length; p++) {
    out.push(run.bubbles[p].x + ',' + run.bubbles[p].y);
  }
  return out.join(' | ');
}

NP.rng.seed(2024);
var run = startRun();

step(180);                            // past the level card, into a question
eq('a run reaches a live question', run.phase, 'asking');
step(30);

var beforeTime = run.questionTime;
var beforePos = positions(run);

ok('pause takes hold on a live run', NP.session.pause() === true);
ok('the run reports itself paused', NP.session.isPaused());
eq('pausing shuts input off', NP.input.enabled, false);
ok('pausing an already paused run is refused', NP.session.pause() === false);

step(600);                            // ten seconds, far past any timeout
eq('the clock does not drain while paused', run.questionTime, beforeTime);
eq('the phase survives the pause', run.phase, 'asking');
eq('bubbles do not drift while paused', positions(run), beforePos);

NP.session.resume();
ok('resuming clears the paused flag', !NP.session.isPaused());
eq('resuming a live question reopens input', NP.input.enabled, true);

step(30);
ok('the clock runs again after resuming', run.questionTime > beforeTime);
ok('bubbles drift again after resuming', positions(run) !== beforePos);

// Nothing to pause once the run is gone: the card must not be able to come
// up over the home screen or the game-over card.
NP.session.abandon();
ok('pause is refused once the run is gone', NP.session.pause() === false);
eq('a discarded run reports no pause', NP.session.isPaused(), false);

/* The reveal after a wrong answer is the one part of a run that teaches, so
   pausing inside it must not spend the beat the child gets to read it. */
NP.rng.seed(77);
run = startRun();
step(180);

var wrongBubble = null;
for (i = 0; i < run.bubbles.length; i++) {
  if (!run.bubbles[i].correct) wrongBubble = run.bubbles[i];
}
NP.session.hit(wrongBubble);
eq('a wrong tap enters the reveal', run.phase, 'between');

var revealLeft = run.phaseDuration - run.phaseTime;
NP.session.pause();
step(600);
eq('the reveal does not run out while paused', run.phaseDuration - run.phaseTime, revealLeft);

NP.input.enabled = null;              // so the next check proves resume wrote it
NP.session.resume();
eq('resuming into a reveal leaves input shut', NP.input.enabled, false);
NP.session.abandon();

/* ============================== settings ================================ */
say('--- settings repair ---');
var repaired = NP.storage.loadSettings();
ok('default settings load', repaired.ops.length > 0 && repaired.tables.length > 0);
eq('default difficulty', repaired.difficulty, 'normal');

/* ================================ report ================================ */
say('');
say('==================================');
say('passed: ' + passed + '   failed: ' + failed);
if (failed) {
  say('');
  for (i = 0; i < failures.length; i++) say('FAIL  ' + failures[i]);
}
say('==================================');
WScript.Quit(failed ? 1 : 0);
