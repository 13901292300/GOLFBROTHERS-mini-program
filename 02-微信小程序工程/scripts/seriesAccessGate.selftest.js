/**
 * Series 访问码门闩自测（纯函数 + 页面接线静态检查）
 * 运行（在 02-微信小程序工程 目录，需人工批准时再跑）：
 *   node scripts/seriesAccessGate.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var gate = require(seriesTestPaths.util('seriesAccessGate.js'));

var detailDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var pageJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
var gateSrc = fs.readFileSync(seriesTestPaths.util('seriesAccessGate.js'), 'utf8');

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

function series(over) {
  return Object.assign(
    {
      seriesId: 's1',
      lifecycleStatus: 'published',
      visibility: 'public',
      accessCode: 'SECRET'
    },
    over || {}
  );
}

// ----- decideAccessGate -----
assert(
  'public → 不校验',
  gate.decideAccessGate(series()).needVerify === false &&
    gate.decideAccessGate(series()).reason === 'public_skip'
);

assert(
  'draft preview → 不校验',
  (function () {
    var d = gate.decideAccessGate(
      series({ lifecycleStatus: 'draft', visibility: 'private' }),
      { preview: '1' }
    );
    return d.needVerify === false && d.reason === 'draft_preview_skip';
  })()
);

assert(
  'published private → 需校验',
  gate.decideAccessGate(series({ visibility: 'private' })).needVerify === true
);

assert(
  'cancelled private → 需校验（历史）',
  gate.decideAccessGate(
    series({ lifecycleStatus: 'cancelled', visibility: 'private' })
  ).needVerify === true
);

assert(
  'archived private → 需校验（历史）',
  gate.decideAccessGate(
    series({ lifecycleStatus: 'archived', visibility: 'private' })
  ).needVerify === true
);

// ----- verifyAccessCode -----
assert(
  '正确码 → ok，返回无明文',
  (function () {
    var r = gate.verifyAccessCode('SECRET', 'SECRET');
    var s = JSON.stringify(r);
    return r.ok === true && s.indexOf('SECRET') < 0;
  })()
);

assert(
  '错误码 → wrong_code，文案固定',
  (function () {
    var r = gate.verifyAccessCode('SECRET', 'bad');
    return (
      r.ok === false &&
      r.errorKey === 'wrong_code' &&
      gate.wrongCodeMessage() === '访问码错误' &&
      JSON.stringify(r).indexOf('SECRET') < 0
    );
  })()
);

assert(
  '空期望码不得直通',
  gate.verifyAccessCode('', '').ok === false
);

assert(
  '取消导航：有栈 → navigateBack',
  gate.resolveCancelNavigation({ pageStackLength: 2 }).action === 'navigateBack'
);

assert(
  '取消导航：无上一页 → switchTabHome',
  gate.resolveCancelNavigation({ pageStackLength: 1 }).action === 'switchTabHome'
);

assert(
  'canRenderBusinessContent 仅 open/unlocked',
  gate.canRenderBusinessContent('open') &&
    gate.canRenderBusinessContent('unlocked') &&
    !gate.canRenderBusinessContent('locked') &&
    !gate.canRenderBusinessContent('pending')
);

// ----- 页面接线（静态）-----
assert(
  'detail require seriesAccessGate',
  pageJs.indexOf("require('../../utils/seriesAccessGate.js')") >= 0
);

assert(
  'onLoad 走 _beginAccessGateFlow 且不直接无门闩 reload',
  pageJs.indexOf('_beginAccessGateFlow') >= 0 &&
    /onLoad:[\s\S]*?_beginAccessGateFlow/.test(pageJs)
);

assert(
  'reloadViewModel 有门闩守卫',
  /reloadViewModel:[\s\S]*?_canLoadBusinessContent/.test(pageJs)
);

assert(
  'wxml 验证前无业务块（accessContentReady）',
  pageWxml.indexOf('accessContentReady') >= 0 &&
    pageWxml.indexOf('series-access-shell') >= 0
);

assert(
  '认 tab 白名单含 register',
  pageJs.indexOf('ALLOWED_TABS') >= 0 && pageJs.indexOf('register: true') >= 0
);

assert(
  '门闩源码 / setData 路径不写 accessCode 字段名到 data 赋值（粗检）',
  !/setData\(\s*\{[^}]*accessCode\s*:/.test(pageJs) &&
    gateSrc.indexOf('accessCode') >= 0
);

assert(
  '错误提示经 wrongCodeMessage（文案在 gate util）',
  pageJs.indexOf('wrongCodeMessage') >= 0 && gateSrc.indexOf('访问码错误') >= 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('FAILURES:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
