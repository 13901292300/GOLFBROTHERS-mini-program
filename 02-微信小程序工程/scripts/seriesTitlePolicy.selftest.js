/**
 * Series 标题常量 / 规范化 / 校验（纯函数，不接页面）
 * 运行：node scripts/seriesTitlePolicy.selftest.js
 */

global.__TEAM_CLUB_REPO_MODE = 'local';

var path = require('path');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var policy = require(path.join(utilsDir, 'matchTitlePolicy.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var teamDirectory = require(path.join(utilsDir, 'teamDirectory.js'));

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

assert('SERIES_NAME_MAX=18', policy.SERIES_NAME_MAX === 18);
assert('SERIES_SUBTITLE_MAX=12', policy.SERIES_SUBTITLE_MAX === 12);

assert(
  '计数与 teamDirectory.charLength 同源',
  policy.countTitleChars('你好👍') === teamDirectory.charLength('你好👍') &&
    policy.countTitleChars('你好👍') === 3
);

assert(
  '规范化删除 CR/LF/LS/PS 并 trim',
  policy.sanitizeTitleText('  春\n季\r对\u2028决\u2029  ') === '春季对决'
);

var name18 = Array(18).fill('名').join('');
var name19 = Array(19).fill('名').join('');
assert('seriesName 18 字通过', policy.normalizeSeriesNameInput(name18).ok === true);
assert(
  'seriesName 19 字拒绝',
  policy.normalizeSeriesNameInput(name19).ok === false &&
    policy.normalizeSeriesNameInput(name19).reason === 'length'
);
assert(
  'seriesName 必填',
  policy.normalizeSeriesNameInput('').ok === false &&
    policy.normalizeSeriesNameInput('   ').ok === false &&
    policy.normalizeSeriesNameInput('   ').reason === 'empty'
);
assert(
  'seriesName 换行规范化',
  policy.normalizeSeriesNameInput('春\n季\r对决\u2028尾\u2029').ok === true &&
    policy.normalizeSeriesNameInput('春\n季\r对决\u2028尾\u2029').value === '春季对决尾'
);

var sub12 = Array(12).fill('副').join('');
var sub13 = Array(13).fill('副').join('');
assert('seriesSubtitle 可空', policy.normalizeSeriesSubtitleInput('').ok === true);
assert(
  'seriesSubtitle 空白视为空',
  policy.normalizeSeriesSubtitleInput('   ').ok === true &&
    policy.normalizeSeriesSubtitleInput('   ').value === ''
);
assert('seriesSubtitle 12 字通过', policy.normalizeSeriesSubtitleInput(sub12).ok === true);
assert(
  'seriesSubtitle 13 字拒绝',
  policy.normalizeSeriesSubtitleInput(sub13).ok === false &&
    policy.normalizeSeriesSubtitleInput(sub13).reason === 'length'
);

var withRx = policy.normalizeSeriesSubtitleInput('春季对决 · R1');
assert(
  '系统 · Rx 不写入 seriesSubtitle',
  withRx.ok === true && withRx.value === '春季对决'
);
assert(
  '系统 · Rx 不计入副标题额度',
  policy.normalizeSeriesSubtitleInput(sub12 + ' · R2').ok === true &&
    policy.normalizeSeriesSubtitleInput(sub12 + ' · R2').value === sub12 &&
    policy.normalizeSeriesSubtitleInput(sub13 + ' · R2').ok === false
);

var historic = seriesModel.normalizeSeries({
  seriesId: 's-hist-series-title',
  seriesName: name19,
  seriesSubtitle: sub13
});
assert(
  'normalizeSeries 不截断、不写回历史超长',
  historic.seriesName === name19 && historic.seriesSubtitle === sub13
);
assert(
  'sanitizeSeriesSubtitle 走唯一规范化入口',
  seriesModel.sanitizeSeriesSubtitle('  A\nB\rC\u2028D\u2029  ') ===
    policy.sanitizeTitleText('  A\nB\rC\u2028D\u2029  ')
);

function restoreTeamClubTestIsolation() {
  try {
    var identity = require(path.join(utilsDir, 'teamClub', 'identity.js'));
    identity.setTestSession(null);
  } catch (e) { /* ignore */ }
  try {
    var repo = require(path.join(utilsDir, 'teamClub', 'repository.js'));
    repo.resetForTests();
  } catch (e2) { /* ignore */ }
  delete global.__TEAM_CLUB_REPO_MODE;
  Object.keys(require.cache).forEach(function (k) {
    var n = String(k).replace(/\\/g, '/');
    if (n.indexOf('/teamClub/') >= 0 || /\/teamDirectory\.js$/.test(n)) delete require.cache[k];
  });
}

console.log('');
console.log('seriesTitlePolicy.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  restoreTeamClubTestIsolation();
  process.exit(1);
}
restoreTeamClubTestIsolation();
process.exit(0);
