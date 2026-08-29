/**
 * 四个球队标题 input：原生 maxlength=-1，Unicode 计数，Series 固定 quota
 * 运行：node scripts/titleUnicodeInput.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var seriesDir = path.join(root, 'miniprogram', 'subpackages', 'create', 'pages', 'series');
var internalDir = path.join(root, 'miniprogram', 'subpackages', 'create', 'pages', 'team-internal');
var interDir = path.join(root, 'miniprogram', 'subpackages', 'create', 'pages', 'team-inter');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var policy = require(path.join(utilsDir, 'matchTitlePolicy.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var roundDraft = require(path.join(seriesDir, 'roundDraft.js'));
var basicInfoDraft = require(path.join(seriesDir, 'basicInfoDraft.js'));

if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return { getTheme: function () { return 'bright'; } };
  };
}

var capturedPage = null;
global.Page = function (def) {
  capturedPage = def;
  return def;
};
global.wx = {
  getStorageSync: function () { return null; },
  setStorageSync: function () {},
  removeStorageSync: function () {},
  showToast: function () {},
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

require(path.join(seriesDir, 'index.js'));

var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var internalWxml = fs.readFileSync(path.join(internalDir, 'index.wxml'), 'utf8');
var interWxml = fs.readFileSync(path.join(interDir, 'index.wxml'), 'utf8');
var policyJs = fs.readFileSync(path.join(utilsDir, 'matchTitlePolicy.js'), 'utf8');

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

function inputMaxlength(wxml, valueExpr) {
  var parts = wxml.split('<input');
  var i;
  for (i = 1; i < parts.length; i++) {
    var block = '<input' + parts[i].split('>')[0] + '>';
    if (block.indexOf('value="{{' + valueExpr + '}}"') >= 0) {
      var m = block.match(/maxlength="([^"]+)"/);
      return m ? m[1] : '';
    }
  }
  return '';
}

function allMaxlengths(wxml) {
  var out = [];
  var re = /maxlength="([^"]+)"/g;
  var m;
  while ((m = re.exec(wxml))) out.push(m[1]);
  return out;
}

var EMOJI = '\uD83D\uDE00';
function repeatEmoji(n) {
  var s = '';
  var i;
  for (i = 0; i < n; i++) s += EMOJI;
  return s;
}

assert(
  '四个标题 input maxlength=-1',
  inputMaxlength(seriesWxml, 'seriesNameInput') === '{{-1}}' &&
    inputMaxlength(seriesWxml, 'seriesSubtitleInput') === '{{-1}}' &&
    inputMaxlength(internalWxml, 'roundName') === '{{-1}}' &&
    inputMaxlength(interWxml, 'roundName') === '{{-1}}'
);

assert(
  'Series 其它 maxlength 未改',
  seriesWxml.indexOf('maxlength="20"') >= 0 &&
    seriesWxml.indexOf('maxlength="6"') >= 0 &&
    seriesWxml.indexOf('maxlength="40"') >= 0
);
assert(
  '队内其它 maxlength 未改',
  internalWxml.indexOf('maxlength="40"') >= 0 &&
    internalWxml.indexOf('maxlength="20"') >= 0 &&
    allMaxlengths(internalWxml).indexOf('{{-1}}') >= 0
);
assert(
  '队际其它 maxlength 未改',
  interWxml.indexOf('maxlength="40"') >= 0 &&
    interWxml.indexOf('maxlength="20"') >= 0
);

assert(
  'resolveInputMaxlength 语义未改',
  /n > limit \? n : limit/.test(policyJs) &&
    policy.resolveInputMaxlength(Array(20).fill('名').join(''), 14) === 20 &&
    policy.resolveInputMaxlength('短', 14) === 14
);

var fourteen = repeatEmoji(14);
var fifteen = repeatEmoji(15);
assert(
  '14 emoji 计数为14',
  policy.countTitleChars(fourteen) === 14 && policy.countTypingChars(fourteen) === 14
);
assert(
  'constrainTyping 保留14 emoji',
  policy.constrainTyping(fourteen, { max: 14 }) === fourteen
);
assert(
  '第15个 emoji 被 JS 限制',
  policy.constrainTyping(fifteen, { max: 14 }) === fourteen &&
    policy.countTitleChars(policy.constrainTyping(fifteen, { max: 14 })) === 14
);

assert(
  'Series 计数绑定固定 quota',
  seriesWxml.indexOf('{{seriesNameCount}} / {{seriesNameQuota}}') >= 0 &&
    seriesWxml.indexOf('{{seriesSubtitleCount}} / {{seriesSubtitleQuota}}') >= 0 &&
    seriesWxml.indexOf('{{seriesNameCount}} / {{seriesNameMax}}') < 0
);
assert(
  '队内/队际计数仍 x/14 quota',
  internalWxml.indexOf('{{roundNameCount}} / {{roundNameQuota}}') >= 0 &&
    interWxml.indexOf('{{roundNameCount}} / {{roundNameQuota}}') >= 0
);

assert(
  '新建 data quota 为 18/12、计数 0',
  capturedPage.data.seriesNameCount === 0 &&
    capturedPage.data.seriesSubtitleCount === 0 &&
    capturedPage.data.seriesNameQuota === 18 &&
    capturedPage.data.seriesSubtitleQuota === 12 &&
    basicInfoDraft.SERIES_NAME_MAX === 18 &&
    basicInfoDraft.SERIES_SUBTITLE_MAX === 12
);

function makeReadyDraft(over) {
  var d = seriesModel.createEmptySeriesDraft({});
  d.hostMode = 'organization';
  d.templateId = 'inter_team_series';
  d.organization = {
    organizationId: 'org1',
    organizationName: '机构',
    organizationLogo: ''
  };
  d.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙'
    })
  ];
  d.seriesName = '测试系列赛';
  d.seriesSubtitle = '';
  d.visibility = 'public';
  d.accessCode = '';
  d.rounds = roundDraft.resizeRounds([], 2).rounds;
  return Object.assign(d, over || {});
}

var page = { data: clone(capturedPage.data) };
Object.keys(capturedPage).forEach(function (key) {
  if (key === 'data') return;
  if (typeof capturedPage[key] === 'function') page[key] = capturedPage[key];
});
page.setData = function (patch) {
  Object.assign(this.data, patch);
};

var NAME20 = Array(20).fill('名').join('');
var SUB20 = Array(20).fill('副').join('');
var historic = seriesModel.normalizeSeries(
  makeReadyDraft({ seriesName: NAME20, seriesSubtitle: SUB20 })
);
var ui = page._uiPayloadFromDraft(historic, 5);
assert(
  '历史20字显示20/18、20/12 且投影不截断',
  ui.seriesNameInput === NAME20 &&
    ui.seriesSubtitleInput === SUB20 &&
    ui.seriesNameCount === 20 &&
    ui.seriesNameQuota === 18 &&
    ui.seriesSubtitleCount === 20 &&
    ui.seriesSubtitleQuota === 12 &&
    historic.seriesName === NAME20 &&
    historic.seriesSubtitle === SUB20
);

assert(
  'constrainTyping 输入不 trim、清换行',
  policy.constrainTyping('  甲\n乙  ', { max: 14 }) === '  甲乙  '
);
assert(
  'normalize 才 trim',
  policy.normalizeTitleInput('  甲乙  ', { required: true }).value === '甲乙'
);
assert(
  '历史未改超长仍放行',
  policy.normalizeTitleInput(NAME20, { required: true, previous: NAME20 }).ok === true &&
    policy.normalizeSubtitleInput(SUB20, { previous: SUB20 }).ok === true
);
assert(
  '历史改成另一条超长拒绝',
  policy.normalizeSeriesNameInput(Array(20).fill('改').join(''), {
    required: true,
    previous: NAME20
  }).ok === false
);

var eighteen = repeatEmoji(18);
var nineteen = repeatEmoji(19);
var twelve = repeatEmoji(12);
var thirteen = repeatEmoji(13);
assert(
  '18 emoji 名称通过、19 拒绝',
  policy.normalizeSeriesNameInput(eighteen).ok === true &&
    policy.normalizeSeriesNameInput(nineteen).ok === false &&
    policy.constrainTyping(nineteen, { max: policy.SERIES_NAME_MAX }) === eighteen
);
assert(
  '12 emoji 副标题通过、13 拒绝',
  policy.normalizeSeriesSubtitleInput(twelve).ok === true &&
    policy.normalizeSeriesSubtitleInput(thirteen).ok === false &&
    policy.constrainTyping(thirteen, { max: policy.SERIES_SUBTITLE_MAX }) === twelve
);

var autoInternal = policy.buildAutoInternalRoundName('非常非常长的主办球队名称');
var autoInter = policy.buildAutoInterRoundName([
  { name: '前海国际' },
  { name: '深圳湾' }
]);
assert(
  '自动标题≤14',
  policy.countTitleChars(autoInternal) <= 14 && policy.countTitleChars(autoInter) <= 14
);

var internalJs = fs.readFileSync(path.join(internalDir, 'index.js'), 'utf8');
var interJs = fs.readFileSync(path.join(interDir, 'index.js'), 'utf8');
assert(
  '手工标题规则仍在',
  internalJs.indexOf('if (!this._roundNameManual)') >= 0 &&
    interJs.indexOf('if (!this._roundNameManual)') >= 0
);

console.log('');
console.log('titleUnicodeInput.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
