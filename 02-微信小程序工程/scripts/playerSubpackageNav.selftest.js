/**
 * Phase 4.1B：小程序用原生 navigateTo 加载 player 分包 + normal preloadRule。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/playerSubpackageNav.selftest.js
 */

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');

var passed = 0;
var failed = 0;
function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label);
  }
}

function methodSource(src, name) {
  var re = new RegExp('\\b' + name + '\\s*\\([^)]*\\)\\s*\\{');
  var match = re.exec(src);
  if (!match) return '';
  var start = match.index;
  var i = match.index + match[0].length - 1;
  var depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

var appJson = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
var rule = appJson.preloadRule && appJson.preloadRule['subpackages/create/pages/normal/index'];
var invite = appJson.preloadRule && appJson.preloadRule['pages/team-invite/index'];
assert(
  'normal preloadRule packages player + network all',
  !!(rule && rule.network === 'all' && rule.packages && rule.packages.indexOf('player') >= 0)
);
assert(
  'team-invite preloadRule 仍预下载 player',
  !!(invite && invite.packages && invite.packages.indexOf('player') >= 0)
);

assert(
  '仓库无 subpackageLoader 生产文件',
  !fs.existsSync(path.join(mini, 'utils', 'subpackageLoader.js'))
);

var normalSrc = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'normal', 'index.js'),
  'utf8'
);
var scoreSrc = fs.readFileSync(
  path.join(mini, 'subpackages', 'scoring', 'pages', 'score', 'index.js'),
  'utf8'
);
var friendsFn = methodSource(normalSrc, 'addFromFriends');
var comboFn = methodSource(normalSrc, 'addFromCombo');
var manualFn = methodSource(normalSrc, 'addManual');
var scoreFriendFn = methodSource(scoreSrc, 'addMethodFriend');
var scoreComboFn = methodSource(scoreSrc, 'addMethodCombo');
var scoreManualFn = methodSource(scoreSrc, 'addMethodManual');

function isDirectPlayerNav(fn, pagePath, eventName) {
  return (
    fn.indexOf('wx.navigateTo') >= 0 &&
    fn.indexOf(pagePath) >= 0 &&
    fn.indexOf(eventName) >= 0 &&
    fn.indexOf('ensureLoaded') < 0 &&
    fn.indexOf('loadSubpackage') < 0 &&
    fn.indexOf('networkConnected') < 0
  );
}

assert(
  'normal addFromFriends 直接 navigateTo + friendsSelected',
  isDirectPlayerNav(friendsFn, '/subpackages/player/pages/friends/index', 'friendsSelected')
);
assert(
  'normal addFromCombo 直接 navigateTo + comboSelected',
  isDirectPlayerNav(comboFn, '/subpackages/player/pages/combos/index', 'comboSelected')
);
assert(
  'normal addManual 直接 navigateTo + playerPicked',
  isDirectPlayerNav(manualFn, '/subpackages/player/pages/manual/index', 'playerPicked')
);
assert(
  'score addMethodFriend 直接 navigateTo + friendsSelected',
  isDirectPlayerNav(scoreFriendFn, '/subpackages/player/pages/friends/index', 'friendsSelected')
);
assert(
  'score addMethodCombo 直接 navigateTo + comboSelected',
  isDirectPlayerNav(scoreComboFn, '/subpackages/player/pages/combos/index', 'comboSelected')
);
assert(
  'score addMethodManual 本页 sheet 且不 ensure player',
  scoreManualFn.indexOf('manualSheetVisible') >= 0 &&
    scoreManualFn.indexOf('ensureLoaded') < 0 &&
    scoreManualFn.indexOf('/subpackages/player/pages/manual') < 0
);
assert(
  'normal/score 无 offline return 门禁文案',
  friendsFn.indexOf('当前无网络') < 0 &&
    comboFn.indexOf('当前无网络') < 0 &&
    scoreFriendFn.indexOf('当前无网络') < 0
);
assert(
  '诊断代码已清除',
  normalSrc.indexOf('_phase41a') < 0 &&
    normalSrc.indexOf('diagLoadPlayerByName') < 0 &&
    normalSrc.indexOf('请查看调试日志') < 0 &&
    normalSrc.indexOf('wx.loadSubpackage') < 0 &&
    scoreSrc.indexOf('wx.loadSubpackage') < 0
);

console.log('\n---- playerSubpackageNav.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
