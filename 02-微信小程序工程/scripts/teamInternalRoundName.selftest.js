/**
 * 普通队内创建/编辑：roundName 14 字、blur 规范化、必填
 * 运行：node scripts/teamInternalRoundName.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var pageDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'team-internal'
);
var utilsDir = path.join(root, 'miniprogram', 'utils');
var policy = require(path.join(utilsDir, 'matchTitlePolicy.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));

if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return {
      getTheme: function () {
        return 'bright';
      }
    };
  };
}

var capturedPage = null;
global.Page = function (def) {
  capturedPage = def;
  return def;
};

var toasts = [];
var saveCalls = [];
var origSave = teamMatchStore.saveMatch;

global.wx = {
  getStorageSync: function () {
    return null;
  },
  setStorageSync: function () {},
  removeStorageSync: function () {},
  showToast: function (opt) {
    toasts.push(opt && opt.title);
  },
  showModal: function () {},
  getWindowInfo: function () {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 24 };
  },
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 24 };
  },
  getMenuButtonBoundingClientRect: function () {
    return { top: 24, height: 32, bottom: 56, left: 280 };
  }
};

teamMatchStore.saveMatch = function () {
  saveCalls.push(Array.prototype.slice.call(arguments));
  return arguments[0] || { matchId: 'spy' };
};

require(path.join(pageDir, 'index.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');

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

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function makePage() {
  toasts.length = 0;
  saveCalls.length = 0;
  var page = {
    data: clone(capturedPage.data)
  };
  Object.keys(capturedPage).forEach(function (key) {
    if (key === 'data') return;
    if (typeof capturedPage[key] === 'function') {
      page[key] = capturedPage[key];
    }
  });
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  page.onLoad({});
  return page;
}

var NAME14 = Array(14).fill('春').join('');
var NAME15 = Array(15).fill('春').join('');
var OTHER15 = Array(15).fill('夏').join('');
var NAME14B = Array(14).fill('秋').join('');

assert('页面已加载', !!capturedPage && typeof capturedPage.onRoundNameInput === 'function');
assert(
  'WXML bindinput + bindblur',
  pageWxml.indexOf('bindinput="onRoundNameInput"') >= 0 &&
    pageWxml.indexOf('bindblur="onRoundNameBlur"') >= 0
);
assert(
  'onSubmit 走同一校验',
  /onSubmit\(\) \{[\s\S]*_assertRoundNameOrTip\(\)/.test(pageJs) &&
    pageJs.indexOf('return this._commitRoundNameInput(this.data.roundName)') >= 0
);

var page = makePage();
var ret14 = page.onRoundNameInput({ detail: { value: NAME14 } });
assert(
  '14字输入通过并回写',
  ret14 === NAME14 && page.data.roundName === NAME14 && page._commitRoundNameInput(NAME14) === true
);

page = makePage();
var ret15 = page.onRoundNameInput({ detail: { value: NAME15 } });
assert(
  '15字输入被限制为14',
  ret15 === NAME14 &&
    policy.countTitleChars(ret15) === 14 &&
    page.data.roundName === NAME14
);
assert(
  '15字 blur/提交拒绝',
  page._commitRoundNameInput(NAME15) === false &&
    toasts.indexOf('比赛名称最多 14 个字符') >= 0
);

page = makePage();
assert('空值提交拒绝', page._assertRoundNameOrTip() === false && toasts.indexOf('请输入比赛名称') >= 0);
toasts.length = 0;
page.data.roundName = '   ';
assert(
  '纯空格提交拒绝',
  page._assertRoundNameOrTip() === false && toasts.indexOf('请输入比赛名称') >= 0
);

page = makePage();
var withNl = page.onRoundNameInput({ detail: { value: '甲\n乙\r丙' } });
assert('bindinput 返回清换行后的值', withNl === '甲乙丙' && page.data.roundName === '甲乙丙');

page = makePage();
page.onRoundNameInput({ detail: { value: '  队内月例  ' } });
assert(
  'bindinput 不 trim',
  page.data.roundName === '  队内月例  '
);
assert(
  'blur 清换行并 trim 且写回页面',
  page.onRoundNameBlur({ detail: { value: ' \n 队内月例 \r ' } }) === true &&
    page.data.roundName === '队内月例' &&
    page._roundNameLastOk === '队内月例'
);

page = makePage();
page._roundNameLastOk = '合法旧名';
page.data.roundName = '合法旧名';
saveCalls.length = 0;
toasts.length = 0;
assert(
  'blur 失败回退且不写 store',
  page.onRoundNameBlur({ detail: { value: '' } }) === false &&
    page.data.roundName === '合法旧名' &&
    saveCalls.length === 0 &&
    toasts.indexOf('请输入比赛名称') >= 0
);

page = makePage();
page._roundNameBaseline = NAME15;
page._roundNameLastOk = NAME15;
page.data.roundName = NAME15;
saveCalls.length = 0;
assert(
  '历史15字未改可保存',
  page._assertRoundNameOrTip() === true &&
    page.data.roundName === NAME15 &&
    saveCalls.length === 0
);

toasts.length = 0;
assert(
  '历史15字改成另一条超长内容拒绝',
  page._commitRoundNameInput(OTHER15) === false &&
    page.data.roundName === NAME15 &&
    toasts.indexOf('比赛名称最多 14 个字符') >= 0
);

assert(
  '历史15字改成14字通过',
  page._commitRoundNameInput(NAME14B) === true && page.data.roundName === NAME14B
);

var autoName = policy.buildAutoInternalRoundName('非常非常长的主办球队名称');
assert(
  '自动标题≤14',
  policy.countTitleChars(autoName) <= 14 && autoName.indexOf('月例赛') >= 0
);

page = makePage();
page._applySelectedTeam({ teamId: 't1', teamName: '前海国际', teamLogo: '', teamRole: '' });
var autoAfterTeam = page.data.roundName;
page.onRoundNameInput({ detail: { value: '手工比赛名' } });
page.onRoundNameBlur({ detail: { value: '手工比赛名' } });
page._applySelectedTeam({ teamId: 't2', teamName: '深圳湾', teamLogo: '', teamRole: '' });
assert(
  '手工标题后换球队不覆盖',
  page._roundNameManual === true &&
    page.data.roundName === '手工比赛名' &&
    autoAfterTeam !== '手工比赛名'
);

page = makePage();
page.setData({
  teamId: 't1',
  teamName: '前海',
  courseName: '球场A'
});
page.data.roundName = '';
saveCalls.length = 0;
toasts.length = 0;
page.onSubmit();
assert(
  'onSubmit 空名走同一校验且不写 store',
  saveCalls.length === 0 && toasts.indexOf('请输入比赛名称') >= 0
);

if (typeof origSave === 'function') {
  teamMatchStore.saveMatch = origSave;
}

console.log('');
console.log('teamInternalRoundName.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
