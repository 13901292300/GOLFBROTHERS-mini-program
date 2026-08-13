/**
 * TOT-OCCURRENCE-LABEL-CONTEXT
 * 昵称后 R 标识仅 allowRepeat=true 展示；有成绩逐洞标题用该 occurrence 的轮次/开球时间。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsTotOccurrenceLabel.selftest.js
 */

var path = require('path');
var fs = require('fs');

var standingsVm = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesStandingsViewModel.js'
));
var pageJs = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'index.js'
  ),
  'utf8'
);
var pageWxml = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'index.wxml'
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

function makeSeries(allowRepeat) {
  return {
    seriesId: 's-occ-label',
    scoringRule: {
      mode: 'global_m',
      globalM: 2,
      allowRepeat: allowRepeat === true,
      scoreBasis: 'gross'
    },
    participants: [
      {
        seriesParticipantId: 'team:red',
        kind: 'team',
        nameSnapshot: '红队'
      }
    ],
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1', dateTime: '2026-08-13 08:30', courseName: '北京雁栖湖高尔夫俱乐部' },
      { roundId: 'r2', index: 2, matchId: 'm2', dateTime: '2026-08-20', courseName: '上海林克司' },
      { roundId: 'r3', index: 3, matchId: 'm3', dateTime: '09:00' }
    ]
  };
}

function makeResult() {
  return {
    participantRows: [
      {
        seriesParticipantId: 'team:red',
        grossTotalValue: 150,
        toParValue: 6,
        allEntries: [
          {
            entryId: 'e1',
            roundId: 'r1',
            matchId: 'm1',
            roundIndex: 1,
            playerId: 'u-1',
            userId: 'u-1',
            unitName: '甲',
            resultUnitType: 'player',
            memberUserIds: ['u-1'],
            counting: 'counted',
            toParValue: 2,
            thruLabel: 'F',
            resultStatus: 'COMPLETE'
          },
          {
            entryId: 'e2',
            roundId: 'r2',
            matchId: 'm2',
            roundIndex: 2,
            playerId: 'u-1',
            userId: 'u-1',
            unitName: '甲',
            resultUnitType: 'player',
            memberUserIds: ['u-1'],
            counting: 'counted',
            toParValue: 4,
            thruLabel: 'F',
            resultStatus: 'COMPLETE'
          }
        ]
      }
    ]
  };
}

var roundStates = [
  { roundId: 'r1', index: 1, label: 'R1', dateTime: '2026-08-13 08:30' },
  { roundId: 'r2', index: 2, label: 'R2', dateTime: '2026-08-20' },
  { roundId: 'r3', index: 3, label: 'R3', dateTime: '09:00' }
];

(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries(false),
    selectedKey: 'cumulative',
    roundStates: roundStates,
    standingsResult: makeResult()
  });
  var players = vm.teamRows[0].players.filter(function (p) {
    return p.playerId === 'u-1';
  });
  assert(
    '1 allowRepeat=false 昵称后无 R 标识、无占位',
    players.length === 2 &&
      players.every(function (p) {
        return p.showRoundTag !== true;
      }) &&
      /show-round-tag="\{\{player\.showRoundTag\}\}"/.test(pageWxml)
  );
  assert(
    '1 行数据 roundId / occurrenceKey 仍按轮次保留',
    players.some(function (p) {
      return p.roundId === 'r1' && p.occurrenceKey === 'r1:u-1';
    }) &&
      players.some(function (p) {
        return p.roundId === 'r2' && p.occurrenceKey === 'r2:u-1';
      })
  );
})();

(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries(true),
    selectedKey: 'cumulative',
    roundStates: roundStates,
    standingsResult: makeResult()
  });
  var players = vm.teamRows[0].players.filter(function (p) {
    return p.playerId === 'u-1';
  });
  var labels = players
    .map(function (p) {
      return p.roundLabel;
    })
    .sort()
    .join(',');
  assert(
    '2 allowRepeat=true 同一球员不同轮显示 R1/R2',
    players.length === 2 &&
      players.every(function (p) {
        return p.showRoundTag === true;
      }) &&
      labels === 'R1,R2'
  );
})();

(function () {
  var player = { roundId: 'r2', matchId: 'm2' };
  assert(
    '3 点击仍按 occurrence roundId 打开，不吃选择器',
    standingsVm.resolveStandingsScorecardRoundId(player, 'cumulative') === 'r2' &&
      standingsVm.resolveStandingsScorecardRoundId(player, 'r1') === '' &&
      standingsVm.resolveStandingsScorecardRoundId(player, 'r2') === 'r2'
  );
})();

(function () {
  var series = makeSeries(true);
  var full = standingsVm.buildTotOccurrenceScorecardTitle({
    series: series,
    roundId: 'r1',
    round: series.rounds[0],
    match: {
      matchId: 'm1',
      teeTime: '2026-08-13 08:30',
      courseName: '北京雁栖湖高尔夫俱乐部'
    },
    courseTitle: '北京雁栖湖高尔夫俱乐部'
  });
  var dateOnly = standingsVm.buildTotOccurrenceScorecardTitle({
    series: series,
    roundId: 'r2',
    round: series.rounds[1],
    match: { matchId: 'm2', teeTime: '2026-08-20', courseName: '上海林克司' },
    courseTitle: '上海林克司'
  });
  var timeOnly = standingsVm.buildTotOccurrenceScorecardTitle({
    series: series,
    roundId: 'r3',
    round: series.rounds[2],
    match: { matchId: 'm3', teeTime: '09:00' },
    courseTitle: ''
  });
  var noTime = standingsVm.buildTotOccurrenceScorecardTitle({
    series: series,
    roundId: 'r2',
    round: { roundId: 'r2', index: 2, dateTime: '2026-08-20' },
    match: { matchId: 'm2', teeTime: '', courseName: '上海林克司' },
    courseTitle: '上海林克司'
  });
  assert(
    '4 有成绩标题顺序为轮次 → 日期时间 → 球场',
    full === 'R1 · AUG 13 08:30 · 北京雁栖湖高尔夫俱乐部'
  );
  assert(
    '5 缺时间/球场无多余分隔符',
    dateOnly === 'R2 · AUG 20 · 上海林克司' &&
      timeOnly === 'R3 · 09:00' &&
      noTime === 'R2 · AUG 20 · 上海林克司' &&
      full.indexOf(' ·  · ') < 0
  );
  var otherRound = standingsVm.buildTotOccurrenceScorecardTitle({
    series: series,
    roundId: 'r1',
    round: series.rounds[0],
    match: { matchId: 'm1', teeTime: '2026-08-13 08:30', courseName: '北京雁栖湖高尔夫俱乐部' },
    courseTitle: '北京雁栖湖高尔夫俱乐部'
  });
  assert(
    '4 标题不读其它轮次',
    otherRound.indexOf('R2') < 0 && otherRound.indexOf('AUG 20') < 0
  );
})();

(function () {
  var openBody = pageJs.slice(
    pageJs.indexOf('_openStandingsPlayerScorecard: function'),
    pageJs.indexOf('onStandingsScorecardAdError: function')
  );
  assert(
    '6 未开赛/等待成绩不写逐洞标题；仅 scorecard 态拼 occurrence 标题',
    openBody.indexOf("panel.state === 'scorecard'") >= 0 &&
      openBody.indexOf('buildTotOccurrenceScorecardTitle') >= 0 &&
      openBody.indexOf('CUMULATIVE_KEY') >= 0 &&
      /if \(panel\.state === 'scorecard'\) \{[\s\S]*buildTotOccurrenceScorecardTitle/.test(openBody)
  );
  assert(
    '6 空态仍走 emptyLabel，标题默认空串',
    /var courseTitle = '';/.test(openBody) &&
      openBody.indexOf('standingsScorecardEmptyLabel: panel.emptyLabel') >= 0
  );
  assert(
    'R 单轮榜不走 TOT 标题前缀',
    openBody.indexOf('selectorKey === standingsViewModel.CUMULATIVE_KEY') >= 0
  );
})();

console.log('');
console.log('--- seriesStandingsTotOccurrenceLabel.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
process.exit(failed ? 1 : 0);
