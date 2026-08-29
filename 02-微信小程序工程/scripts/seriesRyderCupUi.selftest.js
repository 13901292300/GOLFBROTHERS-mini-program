/**
 * 莱德杯 TAB / 得分条 / 无 TOT UI 探测
 * 运行：node scripts/seriesRyderCupUi.selftest.js
 */

var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
var live = require(path.join(
  root,
  'miniprogram/subpackages/tournament/pages/series-detail/seriesLiveSessionProjection.js'
));
var viewModel = require(path.join(
  root,
  'miniprogram/subpackages/tournament/pages/series-detail/seriesDetailViewModel.js'
));
var seriesRyderCup = require(path.join(root, 'miniprogram/utils/seriesRyderCup.js'));
var seriesWxml = fs.readFileSync(
  path.join(root, 'miniprogram/subpackages/tournament/pages/series-detail/index.wxml'),
  'utf8'
);
var createWxml = fs.readFileSync(
  path.join(root, 'miniprogram/subpackages/create/pages/series/index.wxml'),
  'utf8'
);
var detailWxml = fs.readFileSync(
  path.join(root, 'miniprogram/subpackages/tournament/pages/detail/index.wxml'),
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

var tabs = live.buildSeriesDetailTabs(false, { ryderCup: true });
assert('莱德杯 standings 显示得分榜', tabs.filter(function (t) { return t.id === 'standings'; })[0].label === '得分榜');
assert('莱德杯赛前 schedule 显示分组', tabs.filter(function (t) { return t.id === 'schedule'; })[0].label === '分组');
assert('报名 TAB 仍在', tabs.filter(function (t) { return t.id === 'register'; }).length === 1);

var liveTabs = live.buildSeriesDetailTabs(true, { ryderCup: true });
assert(
  '莱德杯 LIVE schedule 显示出发表且 id 不变',
  liveTabs.filter(function (t) { return t.id === 'schedule'; })[0].label === '出发表'
);

var normal = live.buildSeriesDetailTabs(false);
assert('普通 Series 总榜名称不变', normal.filter(function (t) { return t.id === 'standings'; })[0].label === '总榜');
assert('普通 Series 出发表名称不变', normal.filter(function (t) { return t.id === 'schedule'; })[0].label === '出发表');
var normalLive = live.buildSeriesDetailTabs(true);
assert(
  '普通 Series LIVE 仍显示出发表',
  normalLive.filter(function (t) { return t.id === 'schedule'; })[0].label === '出发表'
);

assert('Series 复用 match-play-scoreboard', seriesWxml.indexOf('match-play-scoreboard') >= 0);
assert('单场也复用 match-play-scoreboard', detailWxml.indexOf('match-play-scoreboard') >= 0);
assert('得分条红左 mp-sb-progress__score--a', fs.readFileSync(path.join(root, 'miniprogram/subpackages/tournament/components/match-play-scoreboard/index.wxml'), 'utf8').indexOf('mp-sb-progress__score--a') >= 0);
assert('中线 divider', fs.readFileSync(path.join(root, 'miniprogram/subpackages/tournament/components/match-play-scoreboard/index.wxml'), 'utf8').indexOf('mp-sb-score-divider') >= 0);
assert('莱德杯 standings 无 TOT show-tot 绑定', seriesWxml.indexOf('show-tot="{{standings.showTot}}"') >= 0);
assert('创建页计分步对莱德杯隐藏', createWxml.indexOf('!isRyderCup') >= 0);
assert('得分条全宽壳 series-round-dock__scorebar', seriesWxml.indexOf('series-round-dock__scorebar') >= 0);
assert(
  '摘要-only 去底 padding',
  fs.readFileSync(path.join(root, 'miniprogram/subpackages/tournament/components/match-play-scoreboard/index.wxml'), 'utf8').indexOf('mp-sb-root--summary-only') >= 0 &&
    fs.readFileSync(path.join(root, 'miniprogram/subpackages/tournament/styles/match-play-scoreboard.wxss'), 'utf8').indexOf('.mp-sb-root--summary-only') >= 0
);

var divisions = [
  {
    seriesParticipantId: 'div:red',
    kind: 'division',
    nameSnapshot: '红队',
    colorSnapshot: '#CE9224'
  },
  {
    seriesParticipantId: 'div:blue',
    kind: 'division',
    nameSnapshot: '蓝队',
    colorSnapshot: '#002D62'
  }
];
assert(
  '队内分队比杆 / 队内显式莱德杯走颜色圆；仅 templateId:ryder 不推断',
  viewModel.shouldUseDivisionLogoMarks({
    hostMode: 'team',
    templateId: 'division_series'
  }) === true &&
    viewModel.shouldUseDivisionLogoMarks({
      hostMode: 'team',
      templateId: 'ryder',
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE
    }) === true &&
    viewModel.shouldUseDivisionLogoMarks({
      hostMode: 'team',
      templateId: 'ryder'
    }) === false &&
    viewModel.shouldUseDivisionLogoMarks({
      hostMode: 'organization',
      templateId: 'ryder',
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE
    }) === false &&
    viewModel.shouldUseDivisionLogoMarks({
      hostMode: 'team',
      templateId: 'individual_tour'
    }) === false &&
    viewModel.buildHeroParticipantDisplay({
      hostMode: 'team',
      templateId: 'ryder',
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
      participants: divisions
    }).mode === 'team_logos' &&
    viewModel.buildHeroParticipantDisplay({
      hostMode: 'organization',
      templateId: 'ryder',
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
      participants: [
        { kind: 'team', seriesParticipantId: 'a', nameSnapshot: 'A', logoSnapshot: '/a.png' }
      ]
    }).teamItems[0].logo === '/a.png' &&
    seriesWxml.indexOf('series-division-logo-mark') >= 0 &&
    seriesWxml.indexOf('templateId') < 0
);

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
