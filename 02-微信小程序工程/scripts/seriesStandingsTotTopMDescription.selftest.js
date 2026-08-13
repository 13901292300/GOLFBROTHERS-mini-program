/**
 * TOT-TOP-M-DESCRIPTION：TOT 榜说明改为动态中文 Top M
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsTotTopMDescription.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var adapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));

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

function seriesWithM(m, extraRule) {
  return {
    seriesId: 's-tot-m',
    scoringRule: Object.assign(
      { mode: 'global_m', allowRepeat: false, scoreBasis: 'gross', ruleVersion: 1 },
      extraRule || {},
      m === undefined ? {} : { globalM: m }
    ),
    participants: [
      { seriesParticipantId: 'team:a', nameSnapshot: '甲队' },
      { seriesParticipantId: 'team:b', nameSnapshot: '乙队' }
    ]
  };
}

function totVm(series) {
  return standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live' }],
    standingsResult: standingsVm.emptyStandingsResult()
  });
}

assert(
  'TOT M=6',
  standingsVm.buildTotTopMDescription(seriesWithM(6)) ===
    '本榜取全队前 6 名最好成绩进行排行' &&
    totVm(seriesWithM(6)).leaderboardViewLabel ===
      '本榜取全队前 6 名最好成绩进行排行'
);

assert(
  'TOT M=10 数字同步',
  standingsVm.buildTotTopMDescription(seriesWithM(10)) ===
    '本榜取全队前 10 名最好成绩进行排行'
);

assert(
  '非法 M 降级',
  standingsVm.buildTotTopMDescription(seriesWithM('abc')) ===
    '本榜按全队最好成绩进行排行' &&
    standingsVm.buildTotTopMDescription(seriesWithM(0)) ===
      '本榜按全队最好成绩进行排行' &&
    standingsVm.buildTotTopMDescription(seriesWithM(-3)) ===
      '本榜按全队最好成绩进行排行' &&
    standingsVm.buildTotTopMDescription(seriesWithM(null)) ===
      '本榜按全队最好成绩进行排行' &&
    standingsVm.buildTotTopMDescription(seriesWithM(undefined, { globalM: undefined })) ===
      '本榜按全队最好成绩进行排行' &&
    standingsVm.buildTotTopMDescription({ scoringRule: { mode: 'global_m' } }) ===
      '本榜按全队最好成绩进行排行'
);

assert(
  '非法 M 不出现错误数字',
  standingsVm.buildTotTopMDescription(seriesWithM(NaN)).indexOf('NaN') < 0 &&
    standingsVm.buildTotTopMDescription(seriesWithM(0)).indexOf(' 0 ') < 0 &&
    standingsVm.buildTotTopMDescription(seriesWithM(-1)).indexOf('-1') < 0
);

var rOverlay = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'r1',
  series: Object.assign(seriesWithM(6), { publishToken: 'tok' }),
  round: { roundId: 'r1', matchId: 'm-g1' },
  match: {
    matchId: 'm-g1',
    matchType: 'inter-team',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    teamGroups: [
      { id: 'red', name: '红队' },
      { id: 'blue', name: '蓝队' }
    ],
    seriesContext: {
      managed: true,
      seriesId: 's-tot-m',
      roundId: 'r1',
      publishToken: 'tok'
    }
  },
  indexLink: { seriesId: 's-tot-m', roundId: 'r1', matchId: 'm-g1' }
});
assert(
  'R 不出现 TOT 说明',
  rOverlay &&
    rOverlay.overlay &&
    rOverlay.overlay.leaderboardViewLabel === '总杆 · 球队' &&
    rOverlay.overlay.leaderboardViewLabel.indexOf('本榜取全队前') < 0 &&
    rOverlay.overlay.leaderboardViewLabel.indexOf('最好成绩进行排行') < 0
);

var rVm = standingsVm.buildSeriesStandingsViewModel({
  series: seriesWithM(6),
  selectedKey: 'r1',
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live' }],
  standingsResult: standingsVm.emptyStandingsResult()
});
assert(
  'VM R 不写 TOT 说明',
  rVm.leaderboardViewLabel !== totVm(seriesWithM(6)).leaderboardViewLabel &&
    String(rVm.leaderboardViewLabel).indexOf('本榜取全队前') < 0
);

var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var seriesWxss = fs.existsSync(path.join(seriesDir, 'index.wxss'))
  ? fs.readFileSync(path.join(seriesDir, 'index.wxss'), 'utf8')
  : '';
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');
var optSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewOptions.js'), 'utf8');
var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');

var prodSrc = seriesJs + seriesWxml + seriesWxss + vmSrc + optSrc + adapterSrc;
assert('源码无 PLAYER STANDINGS', prodSrc.indexOf('PLAYER STANDINGS') < 0);
assert(
  '沿用现有 leaderboard-view-label',
  seriesWxml.indexOf('class="leaderboard-view-label"') >= 0 &&
    seriesWxml.indexOf('{{standings.leaderboardViewLabel}}') >= 0 &&
    (seriesWxml.split('leaderboard-view-label').length - 1) === 1
);
assert(
  'overlay TOT 写入动态说明',
  /CUMULATIVE_KEY\) \{[\s\S]{0,600}buildTotTopMDescription/.test(seriesJs)
);
assert(
  '不改 ST-JUMP-4 字段',
  seriesJs.indexOf('scheduleStandingsBoardSwitchMeasure') < 0 &&
    /delete patch.scrollTop/.test(seriesJs) &&
    /delete patch.scrollFillerHeight/.test(seriesJs)
);
assert(
  '不改普通 detail 标签区',
  detailWxml.indexOf('{{leaderboardViewLabel}}') >= 0 &&
    detailJs.indexOf('buildTotTopMDescription') < 0 &&
    detailJs.indexOf('本榜取全队前') < 0
);
assert(
  'helper 不写死 6/10',
  /resolveTotDisplayGlobalM[\s\S]{0,500}globalM/.test(vmSrc) &&
    vmSrc.indexOf('本榜取全队前 6 名') < 0 &&
    vmSrc.indexOf('本榜取全队前 10 名') < 0
);

if (failures.length) {
  console.log('');
  failures.slice(0, 12).forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('TOT-TOP-M-DESCRIPTION selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
