/**
 * 正式浅色经典风格（is-classic-app-replica）。
 * 运行：node scripts/classicAppReplica.selftest.js
 */
var fs = require('fs');
var path = require('path');

var demo = require('../miniprogram/utils/demoWeekendAmateurGame.js');
var digits = require('../miniprogram/subpackages/scoring/utils/classicAppReplicaScoreDigits.js');

var mini = path.join(__dirname, '..', 'miniprogram');
var scoreJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'scoring', 'pages', 'score', 'index.js'),
  'utf8'
);
var wxml = fs.readFileSync(
  path.join(mini, 'subpackages', 'scoring', 'pages', 'score', 'index.wxml'),
  'utf8'
);
var replicaWxss = fs.readFileSync(
  path.join(mini, 'subpackages', 'scoring', 'styles', 'classic-app-replica.wxss'),
  'utf8'
);
var indexWxss = fs.readFileSync(
  path.join(mini, 'subpackages', 'scoring', 'pages', 'score', 'index.wxss'),
  'utf8'
);
var demoJs = fs.readFileSync(
  path.join(mini, 'utils', 'demoWeekendAmateurGame.js'),
  'utf8'
);

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

assert(
  'no isClassicAppReplicaExperiment export',
  typeof demo.isClassicAppReplicaExperiment !== 'function'
);
assert(
  'score page has no classicAppReplicaExperiment field',
  scoreJs.indexOf('classicAppReplicaExperiment') < 0
);
assert(
  'replica class follows scoreHoleStyleClassic only',
  wxml.indexOf("scoreHoleStyleClassic ? 'is-classic-app-replica'") >= 0
);
assert(
  'classic not gated by demo-weekend-amateur',
  scoreJs.indexOf('isClassicAppReplicaExperiment') < 0 &&
    replicaWxss.indexOf('demo-weekend-amateur') < 0 &&
    !/isClassicAppReplicaExperiment/.test(demoJs)
);
assert(
  'elite does not add replica root class',
  wxml.indexOf("isScoreEliteDemo ? 'is-classic-app-replica'") < 0 &&
    replicaWxss.indexOf('.is-score-elite-demo') < 0
);
assert(
  'left-bottom still binds putts',
  /class="hole-cell-putt">\{\{col\.putts\}\}</.test(wxml) &&
    /class="hole-cell-putt">\{\{cell\.putts\}\}</.test(wxml)
);
assert(
  'size class is per-cell replicaScoreSizeClass when classic',
  wxml.indexOf('scoreHoleStyleClassic ? col.replicaScoreSizeClass') >= 0 &&
    wxml.indexOf('scoreHoleStyleClassic ? cell.replicaScoreSizeClass') >= 0
);
assert(
  'classic omits elite score-main--wide on hole digits',
  wxml.indexOf("scoreHoleStyleClassic ? '' : col.scoreMainWideClass") >= 0 &&
    wxml.indexOf("scoreHoleStyleClassic ? '' : cell.scoreMainWideClass") >= 0
);
assert(
  'wxss imported',
  indexWxss.indexOf('classic-app-replica.wxss') >= 0
);

assert(
  'shell fourball present',
  wxml.indexOf('scoreboard-shell--fourball') >= 0
);
assert(
  'shell g1-stroke / fourball40 present',
  wxml.indexOf('scoreboard-shell--g1-stroke') >= 0 &&
    wxml.indexOf('scoreboard-shell--fourball40') >= 0
);
assert(
  'shell match-play present',
  wxml.indexOf('scoreboard-shell--match-play') >= 0
);
assert(
  'shell basic present',
  wxml.indexOf('scoreboard-shell--basic') >= 0
);
assert(
  'replica layout not fourball-only',
  replicaWxss.indexOf('.match-play-side-row') >= 0 &&
    replicaWxss.indexOf('.tee-sticky-overlay__row') >= 0 &&
    replicaWxss.indexOf('.scoreboard-row--player .score-cell:not(.sticky-col)') >= 0 &&
    replicaWxss.indexOf('.fourball-player-column__row') >= 0
);

[
  '--classic-app-replica-cell',
  '--classic-app-replica-aspect',
  '--classic-app-replica-score-size',
  '--classic-app-replica-score-size-2digit',
  '--classic-app-replica-score-size-3digit',
  '--classic-app-replica-score-weight',
  '--classic-app-replica-score-top',
  '--classic-app-replica-meta-size',
  '--classic-app-replica-meta-inset',
  '--classic-app-replica-marker',
  '--classic-app-replica-grid',
  '--classic-app-replica-score-blue',
  '--classic-app-replica-score-orange',
  '--classic-app-replica-score-black',
  '--classic-app-replica-side-blue',
  '--classic-app-replica-side-red',
  '--classic-app-replica-cell-white',
  '--classic-app-replica-cell-light-gray',
  '--classic-app-replica-cell-mid-gray',
  '--classic-app-replica-cell-dark-gray',
  '--classic-app-replica-cell-eagle',
  '--classic-app-replica-cell-birdie'
].forEach(function (token) {
  assert('token ' + token, replicaWxss.indexOf(token) >= 0);
});

assert(
  'single 68 / two 62 / three 54',
  /--classic-app-replica-score-size:\s*68rpx;/.test(replicaWxss) &&
    /--classic-app-replica-score-size-2digit:\s*62rpx;/.test(replicaWxss) &&
    /--classic-app-replica-score-size-3digit:\s*54rpx;/.test(replicaWxss)
);
assert(
  'font-large keeps replica cell 144rpx',
  /--classic-app-replica-cell:\s*144rpx;/.test(replicaWxss) &&
    !/\.is-classic-app-replica\.font-large[\s\S]*?--classic-app-replica-cell:/.test(
      replicaWxss
    )
);
assert(
  'font-large does not retune replica marker or meta inset',
  !/\.is-classic-app-replica\.font-large[\s\S]*?--classic-app-replica-marker:/.test(
    replicaWxss
  ) &&
    !/\.is-classic-app-replica\.font-large[\s\S]*?--classic-app-replica-meta-inset:/.test(
      replicaWxss
    ) &&
    !/\.is-classic-app-replica\.font-large[\s\S]*?--classic-app-replica-meta-bottom:/.test(
      replicaWxss
    )
);
assert(
  'font-large still enlarges replica score type',
  /is-classic-app-replica\.font-large[\s\S]*?--classic-app-replica-score-size:\s*76rpx;/.test(
    replicaWxss
  )
);
assert(
  'score weight is 500',
  /--classic-app-replica-score-weight:\s*500;/.test(replicaWxss)
);

assert('digit 5 is single', digits.resolveClassicScoreSizeClass('5') === '');
assert('digit 9 is single', digits.resolveClassicScoreSizeClass('9') === '');
assert(
  'digit 10 is two',
  digits.resolveClassicScoreSizeClass('10') === 'is-replica-score-2digit'
);
assert(
  'digit 11 is two',
  digits.resolveClassicScoreSizeClass('11') === 'is-replica-score-2digit'
);
assert(
  'digit 12 is two',
  digits.resolveClassicScoreSizeClass('12') === 'is-replica-score-2digit'
);
assert(
  'digit 100 is three not two',
  digits.resolveClassicScoreSizeClass('100') === 'is-replica-score-3digit'
);
assert(
  'same-hole 11 vs 5 isolated',
  digits.resolveClassicScoreSizeClass('11') === 'is-replica-score-2digit' &&
    digits.resolveClassicScoreSizeClass('5') === ''
);
assert(
  'same-hole 8 vs 12 isolated',
  digits.resolveClassicScoreSizeClass('8') === '' &&
    digits.resolveClassicScoreSizeClass('12') === 'is-replica-score-2digit'
);
assert(
  '9 to 10 switches class',
  digits.resolveClassicScoreSizeClass('9') === '' &&
    digits.resolveClassicScoreSizeClass('10') === 'is-replica-score-2digit'
);
assert(
  '10 to 9 switches back',
  digits.resolveClassicScoreSizeClass('10') === 'is-replica-score-2digit' &&
    digits.resolveClassicScoreSizeClass('9') === ''
);
assert(
  '2digit class on score node only',
  replicaWxss.indexOf('.hole-cell-score.is-replica-score-2digit') >= 0 &&
    replicaWxss.indexOf('.is-replica-score-2digit .hole-cell-score') < 0
);
assert(
  '3digit class on hole and special score nodes',
  replicaWxss.indexOf('.hole-cell-score.is-replica-score-3digit') >= 0 &&
    replicaWxss.indexOf('.special-cell-val.is-replica-score-3digit') >= 0
);

assert('putt 0 kept', digits.resolveFilledHolePutt(0) === 0);
assert('putt "0" kept', digits.resolveFilledHolePutt('0') === 0);
assert('putt 1', digits.resolveFilledHolePutt(1) === 1);
assert('putt 2', digits.resolveFilledHolePutt(2) === 2);
assert('putt empty defaults 1', digits.resolveFilledHolePutt('') === 1);
assert('putt null defaults 1', digits.resolveFilledHolePutt(null) === 1);
assert(
  'column builder uses resolveFilledHolePutt',
  scoreJs.indexOf('resolveFilledHolePutt(putts[hi])') >= 0 &&
    !/const p = putts\[hi\] \|\| 1;/.test(scoreJs)
);

function holeClass(diff) {
  var n = Number(diff);
  if (!Number.isFinite(n)) return '';
  if (n <= -2) return 'classic-eagle';
  if (n === -1) return 'classic-birdie';
  if (n === 0) return 'classic-par';
  if (n === 1) return 'classic-bogey';
  if (n === 2) return 'classic-double';
  if (n >= 3) return 'classic-triple';
  return '';
}

assert(
  'resolveClassicHoleClass present',
  /function resolveClassicHoleClass\(diff\) \{/.test(scoreJs)
);

assert('status -2 eagle', holeClass(-2) === 'classic-eagle');
assert('status -3 eagle', holeClass(-3) === 'classic-eagle');
assert('status -1 birdie', holeClass(-1) === 'classic-birdie');
assert('status 0 par', holeClass(0) === 'classic-par');
assert('status +1 bogey', holeClass(1) === 'classic-bogey');
assert('status +2 double', holeClass(2) === 'classic-double');
assert('status +3 triple', holeClass(3) === 'classic-triple');
assert('status +4 triple', holeClass(4) === 'classic-triple');

[
  'classic-eagle',
  'classic-birdie',
  'classic-par',
  'classic-bogey',
  'classic-double',
  'classic-triple'
].forEach(function (cls) {
  assert(
    'palette ' + cls,
    replicaWxss.indexOf('.score-cell.' + cls) >= 0
  );
});

assert(
  'light classic palette is :not(.dark-mode)',
  replicaWxss.indexOf('.is-classic-app-replica:not(.dark-mode) .score-cell.classic-par') >=
    0
);
assert(
  'dark classic palette stays in original sheet',
  indexWxss.indexOf('.score-page.is-score-classic.dark-mode .score-cell.classic-par') >= 0
);
assert(
  'triangle colors independent of score colors',
  /--classic-app-replica-side-blue:\s*#009afe/.test(replicaWxss) &&
    /--classic-app-replica-score-blue:\s*#009afe/.test(replicaWxss) &&
    /--classic-app-replica-side-red:\s*#fe4236/.test(replicaWxss) &&
    /--classic-app-replica-score-orange:\s*#fe6400/.test(replicaWxss)
);
assert(
  'triangles still gated by triangleClass',
  wxml.indexOf('wx:if="{{cell.triangleClass}}"') >= 0 &&
    wxml.indexOf('wx:if="{{col.triangleClass}}"') >= 0
);
assert(
  'replica does not paint T-tee fill',
  replicaWxss.indexOf('fourball-track-lead__tee-half') < 0 &&
    replicaWxss.indexOf('fourball-tee-sticky-overlay__tee') < 0
);
assert(
  'no leftover experiment identifiers in replica sources',
  !/experiment/i.test(replicaWxss) &&
    !/classicAppReplicaExperiment/.test(scoreJs) &&
    !/resolveClassicAppReplicaScoreSizeClass/.test(
      fs.readFileSync(
        path.join(
          mini,
          'subpackages',
          'scoring',
          'utils',
          'classicAppReplicaScoreDigits.js'
        ),
        'utf8'
      )
    )
);
assert(
  'no hardcoded phone px in replica sheet',
  !/(^|[^r])\d+px/.test(replicaWxss.replace(/\/\*[\s\S]*?\*\//g, ''))
);
assert(
  'elite wide marker remains on elite-only CSS',
  indexWxss.indexOf('.score-page.is-score-elite-demo .hole-cell-score.score-main--wide') >=
    0
);

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
