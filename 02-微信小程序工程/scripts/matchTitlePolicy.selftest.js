/**
 * 球队比赛标题规范：普通14 / Series 18/12、输入规范化、卡片 CSS
 * 运行：node scripts/matchTitlePolicy.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var policy = require(path.join(utilsDir, 'matchTitlePolicy.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var plazaSub = require(path.join(utilsDir, 'seriesPlazaLiveSubtitle.js'));
var basicInfoDraft = require(path.join(
  root,
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series',
  'basicInfoDraft.js'
));

var homeWxml = fs.readFileSync(path.join(root, 'miniprogram', 'pages', 'home', 'index.wxml'), 'utf8');
var homeWxss = fs.readFileSync(path.join(root, 'miniprogram', 'pages', 'home', 'index.wxss'), 'utf8');
var internalJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'create', 'pages', 'team-internal', 'index.js'),
  'utf8'
);
var interJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'create', 'pages', 'team-inter', 'index.js'),
  'utf8'
);
var internalWxml = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'create', 'pages', 'team-internal', 'index.wxml'),
  'utf8'
);
var interWxml = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'create', 'pages', 'team-inter', 'index.wxml'),
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

assert(
  '1 主标题14字通过',
  policy.normalizeTitleInput(Array(14).fill('春').join(''), { required: true }).ok === true
);
assert(
  '2 主标题15字拒绝',
  policy.normalizeTitleInput(Array(15).fill('春').join(''), { required: true }).ok === false
);
assert(
  '3 副标题12字通过',
  policy.normalizeSubtitleInput(Array(12).fill('夏').join('')).ok === true
);
assert(
  '4 副标题13字拒绝',
  policy.normalizeSubtitleInput(Array(13).fill('夏').join('')).ok === false
);
assert(
  '5 两字段换行均被清除',
  policy.normalizeTitleInput('甲\n乙\r丙\u2028丁\u2029', { required: true }).value === '甲乙丙丁' &&
    policy.normalizeSubtitleInput('A\nB\rC\u2028D\u2029').value === 'ABCD'
);
assert(
  '6 两字段首尾 trim',
  policy.normalizeTitleInput('  主标题  ', { required: true }).value === '主标题' &&
    policy.normalizeSubtitleInput('  副标题  ').value === '副标题'
);
assert(
  '7 主标题空值拒绝',
  policy.normalizeTitleInput('   ', { required: true }).ok === false &&
    policy.normalizeTitleInput('   ', { required: true }).reason === 'empty'
);
assert(
  '8 副标题空值允许',
  policy.normalizeSubtitleInput('').ok === true &&
    policy.normalizeSubtitleInput('   ').value === ''
);
assert(
  '9 普通队内 roundName 上限14',
  policy.MATCH_TITLE_MAX === 14 &&
    internalWxml.indexOf('maxlength="{{-1}}"') >= 0 &&
    internalJs.indexOf('matchTitlePolicy.MATCH_TITLE_MAX') >= 0
);
assert(
  '10 普通队际 roundName 上限14',
  interWxml.indexOf('maxlength="{{-1}}"') >= 0 &&
    interJs.indexOf('matchTitlePolicy.MATCH_TITLE_MAX') >= 0
);
assert(
  '11 Series 名称上限18',
  policy.SERIES_NAME_MAX === 18 && basicInfoDraft.SERIES_NAME_MAX === 18
);
assert(
  '12 Series 副标题上限12',
  policy.SERIES_SUBTITLE_MAX === 12 && basicInfoDraft.SERIES_SUBTITLE_MAX === 12
);

var autoInternal = policy.buildAutoInternalRoundName('非常非常长的主办球队名称');
var autoInter = policy.buildAutoInterRoundName([
  { name: '前海国际' },
  { name: '深圳湾' },
  { name: '华侨城' },
  { name: '香蜜湖' }
]);
assert(
  '13 自动比赛名≤14',
  policy.countTitleChars(autoInternal) <= 14 &&
    policy.countTitleChars(autoInter) <= 14 &&
    autoInternal.indexOf('月例赛') >= 0
);
assert(
  '14 用户手工标题不被自动覆盖',
  internalJs.indexOf('if (!this._roundNameManual)') >= 0 &&
    interJs.indexOf('if (!this._roundNameManual)') >= 0 &&
    internalJs.indexOf('_roundNameManual = true') >= 0
);

var titleMainRule = homeWxss.match(
  /\.ds-card-club__content\s+\.ds-card-club__title-main[\s\S]*?\{([^}]*)\}/
);
var titleSubRule = homeWxss.match(
  /\.ds-card-club__content\s+\.ds-card-club__title-sub[\s\S]*?\{([^}]*)\}/
);
var wrapTextRule = homeWxss.match(
  /\.ds-card-club__content\s+\.ds-card-club__title-wrap\s+text\s*\{([^}]*)\}/
);
function hasNowrapEllipsis(block) {
  return (
    !!block &&
    /white-space\s*:\s*nowrap/.test(block) &&
    /overflow\s*:\s*hidden/.test(block) &&
    /text-overflow\s*:\s*ellipsis/.test(block) &&
    /min-width\s*:\s*0/.test(block)
  );
}
assert('15 主标题 CSS 单行', hasNowrapEllipsis(titleMainRule && titleMainRule[1]));
assert('16 副标题 CSS 单行', hasNowrapEllipsis(titleSubRule && titleSubRule[1]));
assert(
  '17 title-wrap 不再强制所有 text 换行',
  !wrapTextRule ||
    (!/white-space\s*:\s*normal/.test(wrapTextRule[1]) &&
      !/word-break\s*:\s*break-word/.test(wrapTextRule[1]))
);

var titleSubNodes = homeWxml.match(
  /<text wx:if="\{\{item\.titleSub\}\}"[^>]*>\{\{item\.titleSub\}\}<\/text>/g
);
assert(
  '18 副标题 · R1 在同一节点',
  titleSubNodes &&
    titleSubNodes.length === 3 &&
    homeWxml.indexOf('item.liveRoundLabel') < 0 &&
    homeWxml.indexOf('{{item.titleSub}} ·') < 0
);

var userSub = '春季对决';
var withRx = plazaSub.appendPlazaLiveRoundSubtitle(userSub, 'R1');
assert(
  '19 Rx 不计入输入长度',
  policy.countTitleChars(userSub) === 4 &&
    policy.countTitleChars(userSub) <= policy.SERIES_SUBTITLE_MAX &&
    withRx === '春季对决 · R1' &&
    policy.normalizeSubtitleInput(withRx).value === '春季对决'
);
assert(
  '20 多次投影不叠加 Rx',
  plazaSub.appendPlazaLiveRoundSubtitle(withRx, 'R1') === '春季对决 · R1' &&
    plazaSub.appendPlazaLiveRoundSubtitle('春季对决（R1）', 'R2') === '春季对决 · R2'
);

var historic = seriesModel.normalizeSeries({
  seriesId: 's-hist-title',
  seriesName: Array(20).fill('名').join(''),
  seriesSubtitle: Array(18).fill('副').join('')
});
assert(
  '21 历史超长数据不被修改',
  historic.seriesName === Array(20).fill('名').join('') &&
    historic.seriesSubtitle === Array(18).fill('副').join('') &&
    policy.normalizeTitleInput(historic.seriesName, {
      required: true,
      previous: historic.seriesName
    }).ok === true &&
    policy.normalizeSubtitleInput(historic.seriesSubtitle, {
      previous: historic.seriesSubtitle
    }).ok === true &&
    policy.normalizeSeriesNameInput(Array(19).fill('改').join(''), {
      required: true,
      previous: historic.seriesName
    }).ok === false &&
    policy.normalizeSeriesSubtitleInput(Array(13).fill('改').join(''), {
      previous: historic.seriesSubtitle
    }).ok === false
);

var wrapCss = homeWxss.match(
  /\.ds-card-club__content\s+\.ds-card-club__title-wrap\s*\{([^}]*)\}/
);
assert(
  '22 375px 正常字体两行结构',
  /flex-direction\s*:\s*column/.test(wrapCss && wrapCss[1]) &&
    (homeWxml.match(/ds-card-club__title-main/g) || []).length === 3 &&
    (homeWxml.match(/ds-card-club__title-sub/g) || []).length === 3
);

var fontLargeSm = homeWxss.match(/\.ds-app\.font-large\s+\.text-sm\s*\{([^}]*)\}/);
assert(
  '23 大字体模式每个标题仍仅一行',
  hasNowrapEllipsis(titleMainRule && titleMainRule[1]) &&
    hasNowrapEllipsis(titleSubRule && titleSubRule[1]) &&
    fontLargeSm &&
    !/white-space\s*:\s*normal/.test(fontLargeSm[1])
);
assert(
  '24 无副标题时不保留空白第二行',
  /wx:if="\{\{item\.titleSub\}\}"/.test(homeWxml)
);

var ordinaryCard = teamMatchStore.toTournamentCard({
  matchId: 'ord-1',
  matchType: 'internal',
  roundName: '队内月例赛',
  status: 'registering',
  teeTime: '2026-06-01 08:00',
  organizationSnapshot: { name: '主队' }
});
assert(
  '25 普通单场无副标题字段回归',
  ordinaryCard &&
    ordinaryCard.title === '队内月例赛' &&
    !Object.prototype.hasOwnProperty.call(ordinaryCard, 'titleSub')
);

assert(
  '常量普通14 / Series 18/12',
  policy.SERIES_NAME_MAX === 18 &&
    policy.SERIES_SUBTITLE_MAX === 12 &&
    policy.MATCH_TITLE_MAX === 14
);

console.log('');
console.log('matchTitlePolicy.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
