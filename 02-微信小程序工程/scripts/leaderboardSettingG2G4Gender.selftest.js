/**
 * G2–G4 领先榜查看方式：隐藏男女，旧 male/female 归一为 all。
 * 普通单场与 Series 共用 leaderboardSettingViewModel。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/leaderboardSettingG2G4Gender.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var shared = require(path.join(utilsDir, 'leaderboardSettingViewModel.js'));
var liveLeaderboardBoard = require(path.join(utilsDir, 'liveLeaderboardBoard.js'));
var personalLeaderboardBoard = require(path.join(utilsDir, 'personalLeaderboardBoard.js'));
var seriesOpts = require(path.join(seriesDir, 'seriesStandingsViewOptions.js'));
var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));

var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var seriesOptsSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewOptions.js'), 'utf8');
var liveSrc = fs.readFileSync(path.join(utilsDir, 'liveLeaderboardBoard.js'), 'utf8');
var personalSrc = fs.readFileSync(path.join(utilsDir, 'personalLeaderboardBoard.js'), 'utf8');
var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(utilsDir, 'leaderboardSettingViewModel.js'), 'utf8');

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

function teams() {
  return [{ teamId: 'red' }, { teamId: 'blue' }];
}

function g1() {
  return {
    matchId: 'm-g1',
    gameMode: '个人比杆赛',
    teamGroups: teams(),
    scoringRules: { teamCompetition: { enabled: true, topN: 2 } },
    peoriaResult: { status: 'generated', results: [{ playerId: 'u1', net: 70 }] }
  };
}

function g2() {
  return {
    matchId: 'm-g2',
    gameMode: '四人四球比杆赛',
    teamGroups: teams(),
    scoringRules: { teamCompetition: { enabled: true, topN: 2 } },
    peoriaResult: { status: 'generated', results: [{ playerId: 'u1', net: 70 }] }
  };
}

function g3() {
  return Object.assign({}, g2(), { matchId: 'm-g3', gameMode: '最佳球位比杆赛' });
}

function g4() {
  return Object.assign({}, g2(), { matchId: 'm-g4', gameMode: '四人两球比杆赛' });
}

function keysOfPacked(match) {
  return shared
    .buildLeaderboardSettingViewModel(match, null, { sideLabel: '球队' })
    .sections[1].options.map(function (o) {
      return o.key;
    })
    .join(',');
}

assert(
  'G1 保留男子/女子',
  shared.resolveLeaderboardViewOptions(g1()).join(',') === 'team,all,male,female' &&
    keysOfPacked(g1()) === 'team,all,male,female' &&
    shared.normalizeLeaderboardSelection(g1(), { view: 'male', scoreType: 'gross' }).view ===
      'male' &&
    shared.normalizeLeaderboardSelection(g1(), { view: 'female' }).view === 'female'
);

['G2', 'G3', 'G4'].forEach(function (label, i) {
  var match = [g2, g3, g4][i]();
  var opts = shared.resolveLeaderboardViewOptions(match);
  var packed = shared.buildLeaderboardSettingViewModel(match, { view: 'male' }, { sideLabel: '球队' });
  var seriesPacked = seriesOpts.buildSeriesLeaderboardSettingSections(match, {
    view: 'female',
    scoreType: 'net'
  });
  assert(
    label + ' 均无男女选项',
    opts.join(',') === 'team,all' &&
      keysOfPacked(match) === 'team,all' &&
      packed.viewOptions.indexOf('male') < 0 &&
      packed.viewOptions.indexOf('female') < 0 &&
      seriesPacked.sections[1].options.every(function (o) {
        return o.key !== 'male' && o.key !== 'female';
      })
  );
  assert(
    label + ' 旧 male/female 记忆降级 all',
    shared.normalizeLeaderboardSelection(match, { view: 'male', scoreType: 'gross' }).view ===
      'all' &&
      shared.normalizeLeaderboardSelection(match, 'female').view === 'all' &&
      seriesOpts.normalizeSeriesStandingsSelection(match, { view: 'male' }).view === 'all' &&
      packed.selection.view === 'all' &&
      seriesPacked.selection.view === 'all'
  );
});

assert(
  'G2–G4 不把男女降级成 team',
  shared.normalizeLeaderboardSelection(g2(), { view: 'male' }).view === 'all' &&
    shared.resolveLeaderboardDefaultView(g2()) === 'team'
);

assert(
  '总杆/净杆选项不受影响',
  shared.buildLeaderboardSettingViewModel(g2(), null).sections[0].key === 'scoreType' &&
    shared.buildLeaderboardSettingViewModel(g2(), { scoreType: 'net' }).selection.scoreType ===
      'net' &&
    shared.buildLeaderboardSettingViewModel(g1(), { scoreType: 'net' }).selection.scoreType ===
      'net'
);

var g2Live = liveLeaderboardBoard.buildLiveLeaderboardState(g2(), { view: 'male', scoreType: 'gross' });
var g2Personal = personalLeaderboardBoard.buildPersonalLeaderboardBoard(g2(), {
  view: 'female',
  scoreType: 'gross'
});
var g1Live = liveLeaderboardBoard.buildLiveLeaderboardState(g1(), { view: 'male', scoreType: 'gross' });
assert(
  '运行时 LIVE/个人榜 G2 male→all，G1 male 仍 male',
  g2Live.view === 'all' &&
    g2Personal.viewLabel.indexOf('全部') >= 0 &&
    g1Live.view === 'male'
);

var seriesLive = liveAdapter.projectSeriesRnLiveLeaderboard({
  selectedKey: 'r1',
  selection: { view: 'male', scoreType: 'gross' },
  series: { seriesId: 's', publishToken: 'p' },
  round: { roundId: 'r1', matchId: 'm-g2' },
  match: Object.assign({}, g2(), {
    seriesContext: { managed: true, seriesId: 's', roundId: 'r1', publishToken: 'p' }
  }),
  indexLink: { seriesId: 's', roundId: 'r1', matchId: 'm-g2', publishToken: 'p' }
});
assert(
  'Series Rn 入口同样把 male 归一为 all',
  (seriesLive.overlay && seriesLive.overlay.liveView) === 'all' &&
    (seriesLive.overlay && seriesLive.overlay.selection && seriesLive.overlay.selection.view) ===
      'all'
);

assert(
  '普通单场与 Series 使用同一判断，无分叉赛制条件',
  detailJs.indexOf('leaderboardSettingViewModel.normalizeLeaderboardSelection') >= 0 &&
    seriesOptsSrc.indexOf('normalizeLeaderboardSelection') >= 0 &&
    liveSrc.indexOf('normalizeLeaderboardSelection') >= 0 &&
    personalSrc.indexOf('normalizeLeaderboardSelection') >= 0 &&
    adapterSrc.indexOf('normalizeLeaderboardSelection') >= 0 &&
    vmSrc.indexOf('hidesLeaderboardGenderViews') >= 0 &&
    vmSrc.indexOf('resolveStrokeKind') >= 0 &&
    !/if\s*\(\s*gameMode\s*===\s*'四人四球/.test(vmSrc) &&
    seriesJs.indexOf("view !== 'male'") < 0
);

assert(
  '不影响 TOT 投影入口',
  /selectedKey === standingsViewModel.CUMULATIVE_KEY/.test(
    fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8')
  ) && adapterSrc.indexOf("reason: 'tot'") >= 0
);

console.log('');
console.log('leaderboardSettingG2G4Gender.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
