/**
 * Series 详情 TAB 固定顺序（LIVE 不把报名挤出首屏）
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRegisterTabOrder.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var live = require(path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesLiveSessionProjection.js'
));
var registerVm = require(path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesRegisterViewModel.js'
));

var src = fs.readFileSync(
  path.join(
    root,
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'seriesLiveSessionProjection.js'
  ),
  'utf8'
);

var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

var FIXED = ['info', 'standings', 'register', 'schedule', 'discussion'];

function ids(hasLive) {
  return live.tabIds(live.buildSeriesDetailTabs(!!hasLive));
}

assert(
  '源码不再 LIVE 重排 register',
  src.indexOf("if (tabs[i].id === 'register') register = tabs[i]") < 0 &&
    src.indexOf('rest.push(register)') < 0
);

assert('CASE1 无 LIVE 固定顺序', ids(false).join(',') === FIXED.join(','));
assert(
  'CASE2 Round1 LIVE：register 仍第 3 位',
  live.hasAnyLiveRound([{ roundId: 'r1', state: 'live' }, { roundId: 'r2', state: 'unassigned' }]) ===
    true &&
    ids(true)[2] === 'register' &&
    ids(true).join(',') === FIXED.join(',')
);
assert(
  'CASE3 Round1 completed + Round2 upcoming：register 第 3 位',
  ids(false)[2] === 'register' &&
    live.hasAnyLiveRound([
      { roundId: 'r1', state: 'completed' },
      { roundId: 'r2', state: 'unassigned' }
    ]) === false
);
assert(
  'CASE4 全部 finished：tab 数组仍一致',
  ids(false).join(',') === FIXED.join(',')
);

var ctaClosed = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'published', isDraftPreview: false },
  registrationState: 'closed',
  identityOk: true,
  isRegistered: false,
  eligibleCount: 2
});
assert(
  'CASE5 registrationState=closed 不删 TAB，CTA 关闭',
  ids(false)[2] === 'register' &&
    ctaClosed.disabled === true &&
    ctaClosed.action === 'none'
);

var ctaCompleted = registerVm.resolveRegisterCta({
  lifecycleAccess: { lifecycleStatus: 'published', isDraftPreview: false },
  registrationState: 'open',
  identityOk: true,
  isRegistered: false,
  eligibleCount: 2,
  competitionPhaseCache: 'completed'
});
assert(
  '全部 completed：TAB 仍在，CTA 禁止报名',
  ids(false)[2] === 'register' && ctaCompleted.disabled === true
);

console.log('');
console.log('seriesRegisterTabOrder  ' + passed + '/' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
