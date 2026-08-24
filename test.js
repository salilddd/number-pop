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

/* The sideline gorilla is told about every event in a run. He draws, so he
   is stubbed here — but the calls have to exist or session.js throws. */
NP.playthings = stubModule(['cheer', 'hide', 'watch', 'watchTimer',
  'runMood', 'announce', 'eat']);

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

/* ========================== missing operands ============================ */
say('--- missing operands ---');

// This file is read by cscript in the system codepage, not as UTF-8, so the
// operator signs are escaped here the same way the 9x5 checks above do it.
var TIMES = '\u00d7';
var MINUS = '\u2212';

var qb = NP.questions.makeQuestion('mul', 7, 6, 'b');
eq('7 x ? = 42 reads right', qb.text, '7 ' + TIMES + ' ? = 42');
eq('7 x ? = 42 wants the missing factor', qb.answer, 6);
eq('7 x ? = 42 still knows the product', qb.result, 42);
eq('a blanked question keeps its mastery key', qb.key,
   NP.questions.makeQuestion('mul', 7, 6).key);
eq('reveal writes the whole line out', NP.questions.reveal(qb), '7 ' + TIMES + ' 6 = 42');

var qa = NP.questions.makeQuestion('mul', 7, 6, 'a');
eq('? x 6 = 42 reads right', qa.text, '? ' + TIMES + ' 6 = 42');
eq('? x 6 = 42 wants the other factor', qa.answer, 7);

var qsub = NP.questions.makeQuestion('sub', 52, 28, 'b');
eq('52 - ? = 24 reads right', qsub.text, '52 ' + MINUS + ' ? = 24');
eq('52 - ? = 24 wants the subtrahend', qsub.answer, 28);

var qdiv = NP.questions.makeQuestion('div', 42, 6, 'b');
eq('42 ÷ ? = 7 wants the divisor', qdiv.answer, 6);
eq('42 ÷ ? = 7 knows the quotient', qdiv.result, 7);

eq('a plain question answers the sum', NP.questions.makeQuestion('mul', 7, 6).answer, 42);
eq('a plain question still ends in a blank',
   NP.questions.makeQuestion('mul', 7, 6).text, '7 ' + TIMES + ' 6 = ?');

/* The option set is the whole difficulty of a missing operand: a 6 beside a
   42 gives itself away, and a 6 beside 5, 7 and 8 does not. */
NP.rng.seed(8080);
var mBad = [], mRuns = 0;
var blankOps = [['mul', 'a'], ['mul', 'b'], ['div', 'b'], ['add', 'b'], ['sub', 'b']];
for (run = 0; run < 3000; run++) {
  var spec = blankOps[run % blankOps.length];
  var bq;
  if (spec[0] === 'mul') bq = NP.questions.makeQuestion('mul', NP.rng.int(2, 12), NP.rng.int(2, 12), spec[1]);
  else if (spec[0] === 'div') { var dt2 = NP.rng.int(2, 12), dm = NP.rng.int(2, 12); bq = NP.questions.makeQuestion('div', dt2 * dm, dt2, 'b'); }
  else if (spec[0] === 'add') { var aa = NP.rng.int(1, 60); bq = NP.questions.makeQuestion('add', aa, NP.rng.int(1, 100 - aa), 'b'); }
  else { var sx = NP.rng.int(3, 100); bq = NP.questions.makeQuestion('sub', sx, NP.rng.int(1, sx - 1), 'b'); }

  var want2 = NP.rng.int(2, 5);
  var opts2 = NP.distractors.generate(bq, want2, 0.55);
  mRuns++;

  if (opts2.length !== want2) mBad.push('count ' + opts2.length + '/' + want2 + ' for ' + bq.text);

  var seen2 = {};
  var lo2 = bq.answer <= 12 ? 0 : Math.floor(bq.answer * 0.35);
  var hi2 = Math.max(12, Math.round(bq.answer * 2 + 8));
  for (i = 0; i < opts2.length; i++) {
    var o2 = opts2[i];
    if (o2 === bq.answer) mBad.push('equals answer: ' + bq.text + ' -> ' + o2);
    if (o2 < 0) mBad.push('negative: ' + bq.text + ' -> ' + o2);
    if (o2 !== Math.floor(o2)) mBad.push('non-integer: ' + bq.text + ' -> ' + o2);
    if (seen2[o2]) mBad.push('duplicate: ' + bq.text + ' -> ' + o2);
    if (o2 < lo2 || o2 > hi2) mBad.push('implausible: ' + bq.text + ' -> ' + o2);
    seen2[o2] = true;
  }
}
ok('missing-operand distractors: ' + mRuns + ' runs produce valid option sets',
   mBad.length === 0, mBad.slice(0, 5).join(' | '));

// A blank the child can read off the line teaches nothing, so next() must
// refuse to make one even when the ratio says every question should blank.
NP.rng.seed(4711);
var oneTable = { ops: ['mul'], tables: [1], maxMultiplier: 10, addMax: 20, difficulty: 'normal', blanks: true };
var poolOne = NP.questions.buildPool(oneTable);
var giveaways = 0;
for (i = 0; i < 600; i++) {
  var oq = NP.questions.next(oneTable, poolOne, {}, [], { blank: 1 });
  // Every fact in the 1x table has a 1 in it, so blanking the other side
  // would spell the answer out.
  if (oq.blank === 'b' && oq.a === 1) giveaways++;
  if (oq.blank === 'a' && oq.b === 1) giveaways++;
}
eq('a blank never gives itself away', giveaways, 0);

// The ratio has to actually bite, and a ratio of 0 has to mean none at all.
NP.rng.seed(1234);
var mixed = { ops: ['mul'], tables: [3, 4, 6, 7], maxMultiplier: 10, addMax: 20, difficulty: 'normal', blanks: true };
var poolMix = NP.questions.buildPool(mixed);
var blanked = 0, plain = 0;
for (i = 0; i < 3000; i++) {
  if (NP.questions.next(mixed, poolMix, {}, [], { blank: 0.3 }).blank !== 'answer') blanked++;
}
for (i = 0; i < 600; i++) {
  if (NP.questions.next(mixed, poolMix, {}, [], { blank: 0 }).blank !== 'answer') plain++;
}
ok('a 30% blank ratio lands near 30%', blanked / 3000 > 0.24 && blanked / 3000 < 0.36,
   'got ' + (blanked / 3000).toFixed(3));
eq('a zero ratio never blanks', plain, 0);

// Blanking must not change which fact is being practised, or the mastery
// record and the weakness weighting quietly stop agreeing with each other.
NP.rng.seed(99);
var keyBad = 0;
for (i = 0; i < 1500; i++) {
  var kq = NP.questions.next(mixed, poolMix, {}, [], { blank: 0.5 });
  var plainKey = NP.questions.makeQuestion(kq.op, kq.a, kq.b).key;
  if (kq.key !== plainKey) keyBad++;
  if (kq.op === 'mul' && kq.result !== kq.a * kq.b) keyBad++;
}
eq('a blanked question practises the same fact', keyBad, 0);

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

/* `tweak` is folded onto the saved settings, for the runs that need a
   specific rule on or off — the reveal tests in particular have to turn
   second chances off, or the wrong tap they depend on never reaches it. */
/* `at` is a 0-based level index; omit it to start at level 1. */
function startRun(tweak, at, cbs) {
  var s = NP.storage.loadSettings();
  for (var k in (tweak || {})) {
    if (tweak.hasOwnProperty(k)) s[k] = tweak[k];
  }
  return NP.session.start(s, { left: 8, top: 120, right: 392, bottom: 700 },
                          cbs || {}, at || 0);
}

function firstWrong(run, except) {
  for (var i = 0; i < run.bubbles.length; i++) {
    var b = run.bubbles[i];
    if (!b.correct && b.state === 'alive' && b !== except) return b;
  }
  return null;
}

function firstRight(run) {
  for (var i = 0; i < run.bubbles.length; i++) {
    if (run.bubbles[i].correct && run.bubbles[i].state === 'alive') return run.bubbles[i];
  }
  return null;
}

function countAliveWrong(run) {
  var n = 0;
  for (var i = 0; i < run.bubbles.length; i++) {
    if (run.bubbles[i].state === 'alive' && !run.bubbles[i].correct) n++;
  }
  return n;
}

function step(frames) {
  for (var f = 0; f < frames; f++) NP.session.update(1 / 60);
}

/* Answers n questions correctly, walking through the reveals, level cards and
   intros that come up on the way — the opening levels are four questions
   long, so anything about a five-streak has to cross one. */
function answerRight(run, n) {
  var got = 0, guard = 0;
  while (got < n && run.phase !== 'over' && guard++ < 900) {
    if (run.phase === 'asking') { NP.session.hit(firstRight(run)); got++; }
    else if (run.awaitContinue) NP.session.continueLevel();
    step(20);
  }
  return got;
}

/* Runs on to the next live question, so a test can spend a power-up on one. */
function untilAsking(run) {
  var guard = 0;
  while (run.phase !== 'asking' && run.phase !== 'over' && guard++ < 900) {
    if (run.awaitContinue) NP.session.continueLevel();
    step(10);
  }
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
run = startRun({ retry: false });
step(180);

var wrongBubble = firstWrong(run);
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

/* ========================== second chances =============================== */
say('--- second chances ---');

NP.rng.seed(515);
run = startRun({ retry: true });
step(180);
eq('a run with second chances on starts with one', run.retryLeft, 1);

var livesBefore = run.lives;
var slip = firstWrong(run);
NP.session.hit(slip);

eq('a second chance keeps the question alive', run.phase, 'asking');
eq('a second chance costs no heart', run.lives, livesBefore);
eq('a second chance breaks the streak anyway', run.streak, 0);
eq('the second chance is spent', run.retryLeft, 0);
eq('the slip is remembered for the stars', run.levelSlips, 1);
eq('a retried question is not yet answered', run.levelQuestion, 0);

// The next wrong tap in the same level lands the normal way.
var slip2 = firstWrong(run, slip);
ok('there is another wrong bubble to tap', slip2 !== null);
NP.session.hit(slip2);
eq('the next wrong tap costs a heart', run.lives, livesBefore - 1);
eq('...and shows the reveal', run.phase, 'between');

// A level rescued by a second chance must not earn its banana.
NP.rng.seed(616);
run = startRun({ retry: true });
step(180);
NP.session.hit(firstWrong(run));
var lvl = run.level;
while (run.levelQuestion < lvl.questions && run.phase !== 'over') {
  if (run.phase === 'asking') NP.session.hit(firstRight(run));
  step(40);
}
step(20);
eq('a rescued level earns no banana', run.bananas, 0);

NP.rng.seed(717);
run = startRun({ retry: false });
step(180);
eq('second chances off means none to spend', run.retryLeft, 0);
NP.session.hit(firstWrong(run));
eq('...and a wrong tap costs a heart straight away', run.lives, 2);
NP.session.abandon();

/* Only the opening levels are cushioned. Level 2 still is; level 3 is not, and
   a wrong tap there costs a heart even with the setting on. */
NP.rng.seed(818);
run = startRun({ retry: true }, 1);
step(180);
eq('level 2 still gets a second chance', run.retryLeft, 1);
NP.session.abandon();

NP.rng.seed(919);
run = startRun({ retry: true }, 2);
step(180);
eq('level 3 gets none even with the setting on', run.retryLeft, 0);
livesBefore = run.lives;
NP.session.hit(firstWrong(run));
eq('...so a wrong tap on level 3 costs a heart', run.lives, livesBefore - 1);
eq('...and shows the reveal', run.phase, 'between');
NP.session.abandon();

/* ============================= power-ups ================================ */
say('--- power-ups ---');

NP.rng.seed(818);
run = startRun({ retry: false });
step(180);

// Five right answers in a row is a milestone, and a milestone pays out.
eq('five right answers land', answerRight(run, 5), 5);
eq('a five-streak earns a power-up', run.powers.length, 1);

// On to a live question, where there is something to spend it on.
untilAsking(run);
eq('the run reaches a live question', run.phase, 'asking');

run.powers = ['slow'];
ok('slow-mo is spendable', NP.session.usePower(0) === true);
eq('spending a power puts it down', run.powers.length, 0);
var t0 = run.questionTime;
step(60);                                   // one second of wall clock
var grew = run.questionTime - t0;
ok('slow-mo runs the question at 40%', Math.abs(grew - 0.4) < 0.06, 'grew ' + grew);

run.powers = ['freeze'];
NP.session.usePower(0);
var frozenAt = run.questionTime;
step(60);
eq('freeze stops the question clock dead', run.questionTime, frozenAt);
step(180);                                  // past the three seconds
ok('the clock starts again after a freeze', run.questionTime > frozenAt);

// Back to a clean question, so the 50:50 has a full set to work on.
NP.rng.seed(919);
run = startRun({ retry: false, judge: false });
step(180);
var wrongCount = countAliveWrong(run);
ok('there are wrong answers to remove', wrongCount >= 2, 'had ' + wrongCount);
run.powers = ['fifty'];
ok('the 50:50 is spendable', NP.session.usePower(0) === true);
eq('the 50:50 takes two wrong answers away', countAliveWrong(run), wrongCount - 2);
ok('...and leaves the right one alone', firstRight(run) !== null);

eq('there is nothing to spend when empty', NP.session.usePower(0), false);
NP.session.abandon();
eq('a power cannot be spent outside a run', NP.session.usePower(0), false);

/* ---- the charge meter ----
   The HUD draws progress toward the next power-up out of the streak, so the
   two have to be paid on the same number. */
eq('a power-up every five', NP.scoring.MILESTONE, 5);
eq('a fresh streak has charged nothing', NP.scoring.streakCharge(0), 0);
eq('three in a row is three fifths', NP.scoring.streakCharge(3), 3);
eq('the charge empties as the power is paid', NP.scoring.streakCharge(5), 0);
eq('...and starts filling again', NP.scoring.streakCharge(6), 1);

NP.rng.seed(2468);
var charges = [];
run = startRun({ retry: false }, 0, {
  onCharge: function (c) { charges.push(c); }
});
step(180);
eq('the meter starts empty', charges[0].filled, 0);
eq('...and knows how long it is', charges[0].total, 5);

charges.length = 0;
answerRight(run, 4);
eq('four in a row lights four segments', charges[charges.length - 1].filled, 4);
ok('...without paying out', !charges[charges.length - 1].awarded);

charges.length = 0;
answerRight(run, 1);
var paid = charges[charges.length - 1];
ok('the fifth answer marks a pay-out', paid.awarded === true);
eq('...and the meter starts over', paid.filled, 0);

/* A power earned with both hands full has to wait rather than evaporate:
   the meter has just been watched filling, and paying nothing would make a
   liar of it. */
NP.rng.seed(1357);
run = startRun({ retry: false });
step(180);
run.powers = ['slow', 'freeze'];
answerRight(run, 5);
eq('a full strip holds at two', run.powers.length, 2);
ok('...and the earned power waits', run.banked === true);

untilAsking(run);
ok('spending one releases the waiting power', NP.session.usePower(0) === true);
eq('...so the strip fills straight back up', run.powers.length, 2);
ok('...and nothing is left waiting', run.banked === false);
NP.session.abandon();

/* ========================= level question shapes ======================== */
say('--- level question shapes ---');

var normalPreset = NP.questions.preset('normal');
var allOn = { blanks: true, judge: true };
var allOff = { blanks: false, judge: false };

eq('level 1 asks plainly', NP.levels.shapes(NP.levels.at(0), normalPreset, allOn).blank, 0);
eq('level 1 does not judge', NP.levels.shapes(NP.levels.at(0), normalPreset, allOn).judge, 0);
eq('level 2 still asks plainly', NP.levels.shapes(NP.levels.at(1), normalPreset, allOn).blank, 0);

var lv3shapes = NP.levels.shapes(NP.levels.at(2), normalPreset, allOn);
ok('level 3 allows missing operands', lv3shapes.blank > 0, 'got ' + lv3shapes.blank);
ok('level 3 allows true or false', lv3shapes.judge > 0, 'got ' + lv3shapes.judge);

var bossLevel = NP.levels.at(5);
ok('level 6 is a boss', bossLevel.boss === true);
eq('a boss asks plainly', NP.levels.shapes(bossLevel, normalPreset, allOn).blank, 0);
eq('a boss never judges', NP.levels.shapes(bossLevel, normalPreset, allOn).judge, 0);

eq('the settings can switch shapes off',
   NP.levels.shapes(NP.levels.at(2), normalPreset, allOff).blank, 0);
eq('...both of them',
   NP.levels.shapes(NP.levels.at(2), normalPreset, allOff).judge, 0);

/* ============================== the Big Boss ============================ */
say('--- the Big Boss ---');

/* Level 13 is the last level there is. Everything past the authored ladder
   has to land on it rather than climbing past it, or the level number and
   the wave count start telling two different stories. */
var boss13 = NP.levels.at(12);
eq('level 13 is the Big Boss', boss13.name, 'Big Boss');
ok('...and it is endless', boss13.endless === true);
ok('...and it is a boss', boss13.boss === true);
eq('...measured in waves of three', boss13.questions, 3);

var boss200 = NP.levels.at(200);
eq('the ladder cannot climb past 13', boss200.n, 13);
ok('...however far it is asked to', boss200.endless === true);
eq('...and it stays three questions long', boss200.questions, 3);

/* Six per cent, compounding, per wave — and a floor, because a bubble gone
   before a child can read the question is a coin toss rather than a test. */
var w1 = NP.levels.wave(1);
eq('wave 1 runs at the base fall time', Math.round(w1.fallTime * 100) / 100, 4);
eq('...at no extra speed', Math.round(w1.speedMul * 1000) / 1000, 1);

var w11 = NP.levels.wave(11);
var want11 = 4 / Math.pow(1.06, 10);
ok('ten waves compound six per cent each',
   Math.abs(w11.fallTime - want11) < 0.001, 'got ' + w11.fallTime);

var wLate = NP.levels.wave(60);
eq('the fall time floors at 35% of base',
   Math.round(wLate.fallTime * 1000) / 1000, 1.4);
eq('the movement speed caps at 2x', wLate.speedMul, 2);
eq('...and so does gravity', wLate.gravity, 940);
ok('a wave never runs the shell game', !NP.levels.wave(30).shuffle);

/* The mode re-rolls every wave. Two the same in a row read as nothing
   having happened, which is the one thing the re-roll exists to prevent. */
var repeats = 0;
for (i = 1; i < 240; i++) {
  if (NP.levels.wave(i + 1, 'rain').mode === 'rain') repeats++;
}
eq('a wave never repeats the one before it', repeats, 0);

/* The endless boss is the one boss that may change the question shape: the
   rule against it is about a three-question gate, and this is not one. */
var bossShapes = NP.levels.shapes(boss13, normalPreset, allOn);
ok('the Big Boss allows missing operands', bossShapes.blank > 0, 'got ' + bossShapes.blank);
ok('the Big Boss allows true or false', bossShapes.judge > 0, 'got ' + bossShapes.judge);
eq('a short boss still asks plainly',
   NP.levels.shapes(NP.levels.at(5), normalPreset, allOn).blank, 0);

/* The best-wave record. Every live Big Boss test below starts with a ?level=
   jump, which sets debugJump and so deliberately never writes this — leaving
   the storage path itself with nothing exercising it. */
NP.storage.setBestWave('probe', 7);
eq('a best wave is remembered', NP.storage.getBestWave('probe'), 7);
ok('...and only when it improves', NP.storage.setBestWave('probe', 3) === false);
eq('...so the record stands', NP.storage.getBestWave('probe'), 7);
eq('a topic with no Big Boss run has none', NP.storage.getBestWave('untouched'), 0);

/* The live Big Boss runs are further down, after the true-or-false section.
   They answer ~50 questions between them, and every answer writes to the
   shared fact store that questions.next() weights on — running them here
   shifts the question mix every later section sees. */

/* ============================ true or false ============================= */
say('--- true or false ---');

NP.rng.seed(2468);
var jSettings = { ops: ['mul'], tables: [3, 4, 6, 7], maxMultiplier: 10, addMax: 20,
                  difficulty: 'normal', blanks: true, judge: true, retry: true };
var jPool = NP.questions.buildPool(jSettings);

var jBad = [], trueCount = 0, notJudged = 0, jRuns = 2500;
for (i = 0; i < jRuns; i++) {
  var jq = NP.questions.next(jSettings, jPool, {}, [], { judge: 1, nearRatio: 0.55 });

  // A fact with no plausible wrong claim in range falls back to a plain
  // question rather than to a "false" statement that happens to be true.
  if (jq.form !== 'judge') { notJudged++; continue; }

  if (jq.answer !== (jq.truth ? 1 : 0)) jBad.push('answer disagrees with truth: ' + jq.text);
  if (jq.truth !== (jq.claim === jq.result)) jBad.push('truth disagrees with claim: ' + jq.text);
  if (jq.blank !== 'answer') jBad.push('a judged question was also blanked: ' + jq.text);
  if (jq.result !== jq.a * jq.b) jBad.push('judged question lost its sum: ' + jq.text);
  if (String(jq.text).indexOf('?') >= 0) jBad.push('a judged statement still has a blank: ' + jq.text);

  if (jq.truth) trueCount++;
  else {
    if (jq.claim === jq.result) jBad.push('a false claim was true: ' + jq.text);
    // The claim has to be worth checking. Outside the plausible band it can
    // be dismissed on sight and the question stops being arithmetic.
    var jHi = Math.max(12, Math.round(jq.result * 2 + 8));
    var jLo = jq.result <= 12 ? 0 : Math.floor(jq.result * 0.35);
    if (jq.claim < jLo || jq.claim > jHi) {
      jBad.push('implausible claim: ' + jq.text + ' (band ' + jLo + '-' + jHi + ')');
    }
  }
}
ok('judged questions are internally consistent', jBad.length === 0, jBad.slice(0, 4).join(' | '));
ok('almost every draw can be judged', notJudged < jRuns * 0.02, notJudged + ' of ' + jRuns);

var trueShare = trueCount / (jRuns - notJudged);
ok('about half the statements are true', trueShare > 0.44 && trueShare < 0.56,
   'share ' + trueShare.toFixed(3));

eq('a zero ratio never judges',
   NP.questions.next(jSettings, jPool, {}, [], { judge: 0, blank: 0 }).form, 'pick');

// The two thumb bubbles have to behave like any other pair: one right, one
// wrong, and the values distinct so the hit tests can tell them apart.
NP.rng.seed(1357);
run = startRun({ retry: false, judge: true, blanks: false });
step(180);
var judgedSeen = 0, judgeBad = [];
for (i = 0; i < 400 && run.phase !== 'over'; i++) {
  if (run.phase === 'asking' && run.question.form === 'judge') {
    judgedSeen++;
    if (run.bubbles.length !== 2) judgeBad.push('bubbles: ' + run.bubbles.length);
    var rights = 0, glyphs = {};
    for (var jb = 0; jb < run.bubbles.length; jb++) {
      if (run.bubbles[jb].correct) rights++;
      glyphs[run.bubbles[jb].glyph] = true;
    }
    if (rights !== 1) judgeBad.push('right answers: ' + rights);
    if (!glyphs.yes || !glyphs.no) judgeBad.push('missing a thumb');
  }
  if (run.phase === 'asking') NP.session.hit(firstRight(run));
  step(40);
}
ok('true-or-false questions turn up in a real run', judgedSeen > 0, 'saw ' + judgedSeen);
ok('every one is a clean pair of thumbs', judgeBad.length === 0, judgeBad.slice(0, 3).join(' | '));
NP.session.abandon();

/* A held 50:50 is drawn out of the strip while a true-or-false question is up
   — there is no pair of wrong bubbles for it to take — and drawn back in on
   the next question that has one. The slot is blanked rather than closed up,
   so whatever sits beside it keeps the index the session will read back. */
NP.rng.seed(1357);
var paints = [];
run = startRun({ retry: false, judge: true, blanks: false }, 0,
               { onPowers: function (l) { paints.push(l.slice()); } });
run.powers = ['fifty', 'slow'];
step(180);

var hidOnJudge = 0, keptOnPlain = 0, stripBad = [];
for (i = 0; i < 400 && run.phase !== 'over'; i++) {
  if (run.phase === 'asking') {
    var painted = paints[paints.length - 1] || [];
    if (painted[1] !== 'slow') stripBad.push('the slot beside it moved: ' + painted.join(','));
    if (run.question.form === 'judge') {
      if (painted[0]) stripBad.push('50:50 drawn on a judged question: ' + run.question.text);
      else hidOnJudge++;
    } else {
      if (painted[0] === 'fifty') keptOnPlain++;
      else stripBad.push('50:50 missing on a plain question: ' + run.question.text);
    }
    run.powers = ['fifty', 'slow'];   // still held when the next question paints
    NP.session.hit(firstRight(run));
  }
  step(40);
}
ok('the 50:50 leaves the strip on a true-or-false question', hidOnJudge > 0,
   'saw ' + hidOnJudge);
ok('...and is back on the next question that can use it', keptOnPlain > 0,
   'saw ' + keptOnPlain);
ok('...without shifting the power beside it', stripBad.length === 0,
   stripBad.slice(0, 3).join(' | '));
NP.session.abandon();

/* ========================= the Big Boss, live ============================ */
say('--- the Big Boss, live ---');

/* Deliberately last of the run-based sections. These answer ~50 questions,
   and every one is recorded through storage.recordFact — which questions.next
   weights on, so anything downstream would see a shifted question mix. Wiping
   first is what makes them deterministic rather than dependent on whatever the
   earlier sections happened to leave behind. */
NP.storage.resetProgress();

/* A live run on level 13. It must never finish a level, never hand a heart
   back, and keep starting waves for as long as it is asked to. */
NP.rng.seed(4242);
var cleared = [];
run = startRun({ retry: false }, 12, {
  onWaveClear: function (s) { cleared.push(s); }
});

eq('the run starts on level 13', run.level.n, 13);
ok('...on the Big Boss', run.level.endless === true);
eq('...at wave 1', run.wave, 1);
eq('...with no second chance', run.retryLeft, 0);

var livesAt13 = run.lives;
answerRight(run, 30);
step(60);                                   // the last answer's pause, so the
                                            // tenth wave actually closes
ok('the run is still going after 30 questions', run.phase !== 'over');
eq('...still on level 13', run.level.n, 13);
eq('...and never cleared a level', run.stars.length, 12);
eq('ten waves cleared', cleared.length, 10);
eq('...and an eleventh started', run.wave, 11);
eq('the hearts never come back', run.lives, livesAt13);

/* Five clean waves in a row buys one banana, and any miss resets the run of
   them — five *in a row* is the price, not five in total. */
eq('fifteen clean questions earn one banana', cleared[4].banana, true);
eq('...and the sixth wave does not', cleared[5].banana, false);
eq('thirty clean questions earn two', cleared[9].banana, true);
eq('the run banked both', run.bananas - 12, 2);

/* Ten clean waves is exactly two payouts, so the counter is back at zero.
   One more wave puts it part-way to the third, giving the reset something to
   actually take away. */
answerRight(run, 3);
step(60);
var beforeMiss = run.cleanWaves;
ok('a clean run is part-way to the next', beforeMiss > 0, 'got ' + beforeMiss);

/* The reset lands in finishWave, so the spoiled wave has to be played out
   before it means anything — a miss on question one of three has not cost the
   streak yet, it has only guaranteed it. */
untilAsking(run);
NP.session.hit(firstWrong(run));
step(360);                                  // through the reveal
eq('the miss is held against the wave', run.levelMisses, 1);
eq('...and the streak still stands mid-wave', run.cleanWaves, beforeMiss);
answerRight(run, 2);                        // close the wave the miss spoiled
step(60);
eq('...until the wave closes on it', run.cleanWaves, 0);

NP.session.abandon();

/* The wave is what the game-over card reports, because the level number
   stopped moving at 13 and the wave is the only thing still climbing. */
NP.rng.seed(31337);
var bossOver = null;
run = startRun({ retry: false }, 12, {
  onGameOver: function (r) { bossOver = r; }
});
answerRight(run, 9);                        // three waves in the bag
step(60);                                   // ...once the last one closes
eq('three waves cleared', run.wave, 4);

run.lives = 1;
untilAsking(run);
NP.session.hit(firstWrong(run));
step(600);                                  // through the reveal and out
eq('the run ends when the last heart goes', run.phase, 'over');
ok('the card is given a wave to report', bossOver !== null);
eq('...and it is the one the run reached', bossOver.wave, 4);
eq('...alongside the level it stopped on', bossOver.level, 13);

/* A run that never got there reports no wave at all, so the card falls back
   to the level number. */
NP.rng.seed(777);
var ladderOver = null;
run = startRun({ retry: false }, 0, {
  onGameOver: function (r) { ladderOver = r; }
});
run.lives = 1;
untilAsking(run);
NP.session.hit(firstWrong(run));
step(600);
ok('a ladder run also ends', ladderOver !== null);
eq('...reporting no wave', ladderOver.wave, 0);
eq('...and a real level number', ladderOver.level, 1);
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
