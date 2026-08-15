/**
 * TOT-PLAYER-NAME-CELL-PARITY
 * TOT 上场记录行接入 leaderboard-player-name-cell；性别只补显示投影。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsTotPlayerNameCell.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram');
var playerManage = require(path.join(root, 'utils', 'playerManage.js'));
var standingsVm = require(path.join(
  root,
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesStandingsViewModel.js'
));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

var cellWxml = read('components/leaderboard-player-name-cell/index.wxml');
var cellWxss = read('components/leaderboard-player-name-cell/index.wxss');
var detailWxml = read('subpackages/tournament/pages/detail/index.wxml');
var detailJson = read('subpackages/tournament/pages/detail/index.json');
var seriesWxml = read('subpackages/tournament/pages/series-detail/index.wxml');
var seriesJson = read('subpackages/tournament/pages/series-detail/index.json');
var pageJs = read('subpackages/tournament/pages/series-detail/index.js');

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

function sliceBetween(src, beginToken, endToken) {
  var from = src.indexOf(beginToken);
  if (from < 0) return '';
  var end = endToken ? src.indexOf(endToken, from) : -1;
  return end < 0 ? src.slice(from, from + 1800) : src.slice(from, end);
}

var liveWxml = read('components/live-leaderboard-board/index.wxml');
var totRow = sliceBetween(
  seriesWxml,
  'catchtap="onStandingsPlayerTap"',
  '<!-- TOT/R 球队行展开'
);
var detailRow = sliceBetween(
  liveWxml,
  'catchtap="onTeamPlayerTap"',
  'class="scorecard-row"'
);

assert(
  '三处共用同一个 leaderboard-player-name-cell',
  detailJson.indexOf('"leaderboard-player-name-cell": "/components/leaderboard-player-name-cell/index"') >= 0 &&
    seriesJson.indexOf('"leaderboard-player-name-cell": "/components/leaderboard-player-name-cell/index"') >= 0 &&
    detailRow.indexOf('<leaderboard-player-name-cell') >= 0 &&
    totRow.indexOf('<leaderboard-player-name-cell') >= 0 &&
    (seriesWxml.match(/<leaderboard-player-name-cell/g) || []).length === 1
);

assert(
  'TOT 身份区只保留共享组件，无内联重复 DOM',
  totRow.indexOf("standings.selectedKey !== 'cumulative'") < 0 &&
    totRow.indexOf('wx:else') < 0 &&
    /<view class="lr-player">/.test(totRow) === false &&
    totRow.indexOf('class="player-name"') < 0 &&
    totRow.indexOf('series-standings-round-tag') < 0 &&
    totRow.indexOf('series-standings-pending-tag') < 0 &&
    totRow.indexOf('name="{{player.name}}"') >= 0 &&
    totRow.indexOf('gender-icon="{{player.genderIcon}}"') >= 0 &&
    totRow.indexOf('gender-class="{{player.genderClass}}"') >= 0 &&
    totRow.indexOf('show-round-tag="{{player.showRoundTag}}"') >= 0 &&
    totRow.indexOf('round-label="{{player.roundLabel}}"') >= 0 &&
    totRow.indexOf('pending-label="{{player.pendingLabel}}"') >= 0
);

assert(
  '组件：性别条件渲染，轮次/pending 在性别之后；长昵称不挤性别',
  cellWxml.indexOf('wx:if="{{genderIcon}}"') >= 0 &&
    cellWxml.indexOf('class="player-name"') < cellWxml.indexOf('gender-icon') &&
    cellWxml.indexOf('gender-icon') < cellWxml.indexOf('series-standings-round-tag') &&
    cellWxml.indexOf('series-standings-round-tag') <
      cellWxml.indexOf('series-standings-pending-tag') &&
    /flex:\s*0 1 auto/.test(cellWxss) &&
    cellWxss.indexOf('flex: none') >= 0 &&
    !/\.player-name\s*\{[^}]*flex:\s*1/.test(cellWxss) &&
    cellWxss.indexOf('margin-left: auto') < 0
);

assert(
  '点击仍在行上，打开对应 occurrence',
  totRow.indexOf('catchtap="onStandingsPlayerTap"') >= 0 &&
    totRow.indexOf('data-index="{{player.scorecardKey}}"') >= 0 &&
    totRow.indexOf('class="lr-thru"') >= 0 &&
    totRow.indexOf('class="lr-total') >= 0 &&
    pageJs.indexOf('onStandingsPlayerTap') >= 0 &&
    pageJs.indexOf('nextStandingsOpenKey') >= 0
);

function makeSeries(allowRepeat, roster) {
  return {
    seriesId: 's-tot-name-cell',
    scoringRule: {
      mode: 'global_m',
      globalM: 2,
      allowRepeat: allowRepeat === true,
      scoreBasis: 'gross'
    },
    participants: [
      { seriesParticipantId: 'team:red', kind: 'team', nameSnapshot: '红队' }
    ],
    roster: roster || [],
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1' },
      { roundId: 'r2', index: 2, matchId: 'm2' }
    ]
  };
}

function makeResult(extraLineup, extraEntry) {
  var allEntries = [
    {
      entryId: 'e-r1',
      roundId: 'r1',
      roundIndex: 1,
      resultUnitType: 'player',
      unitId: 'u-1',
      memberUserIds: ['u-1'],
      unitName: '甲',
      counting: 'counted',
      grossTotalValue: 72,
      toParValue: 0,
      thruLabel: 'F',
      resultStatus: 'OK'
    }
  ];
  if (extraEntry) allEntries.push(extraEntry);
  var roundLineups = [
    {
      roundId: 'r1',
      playerId: 'u-1',
      userId: 'u-1',
      seriesParticipantId: 'team:red',
      resultUnitType: 'player',
      unitId: 'u-1',
      unitName: '甲',
      gender: 'female',
      matchGender: 'female',
      genderIcon: '♀',
      genderClass: 'gender-female',
      fromLineup: true,
      counting: 'pending'
    }
  ];
  if (extraLineup) roundLineups.push(extraLineup);
  return {
    roundMeta: {
      r1: { stationStarted: true, hasFormalGroups: true },
      r2: { stationStarted: true, hasFormalGroups: true }
    },
    participantRows: [
      {
        seriesParticipantId: 'team:red',
        rank: 1,
        grossTotalValue: 72,
        toParValue: 0,
        allEntries: allEntries,
        roundLineups: roundLineups
      }
    ]
  };
}

var roundStates = [
  { roundId: 'r1', index: 1, label: 'R1', statusToken: 'finished', hasMatchId: true },
  { roundId: 'r2', index: 2, label: 'R2', statusToken: 'finished', hasMatchId: true }
];

(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries(false),
    selectedKey: 'cumulative',
    roundStates: roundStates,
    standingsResult: makeResult()
  });
  var players = ((vm.teamRows || [])[0] || {}).players || [];
  var row = players.find(function (p) {
    return p.playerId === 'u-1' && p.roundId === 'r1';
  });
  var gd = playerManage.getGenderDisplay({ gender: 'female' });
  assert(
    'TOT 展开显示昵称+性别，符号/颜色与 getGenderDisplay 一致',
    row &&
      row.name === '甲' &&
      row.genderIcon === gd.icon &&
      row.genderClass === gd.className &&
      row.genderIcon === '♀' &&
      row.genderClass === 'gender-female'
  );
  assert(
    'allowRepeat=false 无轮次标签、不占位',
    row && row.showRoundTag !== true
  );
  assert(
    '点击仍对应 occurrence',
    row &&
      row.occurrenceKey === 'r1:u-1' &&
      standingsVm.resolveStandingsScorecardRoundId(row, 'cumulative') === 'r1'
  );
})();

(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries(true),
    selectedKey: 'cumulative',
    roundStates: roundStates,
    standingsResult: makeResult({
      roundId: 'r2',
      playerId: 'u-1',
      userId: 'u-1',
      seriesParticipantId: 'team:red',
      resultUnitType: 'player',
      unitId: 'u-1',
      unitName: '甲',
      gender: 'female',
      fromLineup: true,
      counting: 'pending'
    })
  });
  var players = (((vm.teamRows || [])[0] || {}).players || []).filter(function (p) {
    return p.playerId === 'u-1';
  });
  assert(
    'allowRepeat=true 时性别后可显示轮次（showRoundTag）',
    players.length >= 1 &&
      players.every(function (p) {
        return p.showRoundTag === true && p.genderIcon === '♀';
      }) &&
      players.some(function (p) {
        return p.roundLabel === 'R1';
      })
  );
})();

(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries(false),
    selectedKey: 'cumulative',
    roundStates: roundStates,
    standingsResult: makeResult({
      roundId: 'r2',
      playerId: 'u-unk',
      userId: 'u-unk',
      seriesParticipantId: 'team:red',
      resultUnitType: 'player',
      unitId: 'u-unk',
      unitName: '小红',
      fromLineup: true,
      counting: 'pending'
    })
  });
  var unk = (((vm.teamRows || [])[0] || {}).players || []).find(function (p) {
    return p.playerId === 'u-unk';
  });
  var inferred = playerManage.getGenderDisplay({ name: '小红', nickname: '小红' });
  assert(
    '未知性别无符号、不按姓名推断',
    unk &&
      unk.genderIcon === '' &&
      unk.genderClass === '' &&
      inferred.icon === ''
  );
})();

(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries(false, [{ playerId: 'u-2', gender: 'male', nickname: '乙' }]),
    selectedKey: 'cumulative',
    roundStates: roundStates,
    standingsResult: {
      roundMeta: { r1: { stationStarted: true, hasFormalGroups: true } },
      participantRows: [
        {
          seriesParticipantId: 'team:red',
          rank: 1,
          grossTotalValue: 73,
          toParValue: 1,
          allEntries: [
            {
              entryId: 'e-no-seat-gender',
              roundId: 'r1',
              roundIndex: 1,
              resultUnitType: 'player',
              unitId: 'u-2',
              memberUserIds: ['u-2'],
              unitName: '乙',
              counting: 'counted',
              grossTotalValue: 73,
              toParValue: 1,
              thruLabel: 'F',
              resultStatus: 'OK'
            }
          ],
          roundLineups: []
        }
      ]
    }
  });
  var row = (((vm.teamRows || [])[0] || {}).players || [])[0];
  assert(
    'allEntries 无席位时 roster 只读补齐性别',
    row &&
      row.playerId === 'u-2' &&
      row.genderIcon === '♂' &&
      row.genderClass === 'gender-male' &&
      row.thru === 'F' &&
      row.scoreStr === '+1'
  );
})();

(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries(false),
    selectedKey: 'cumulative',
    roundStates: roundStates,
    standingsResult: {
      roundMeta: { r1: { stationStarted: true, hasFormalGroups: true } },
      participantRows: [
        {
          seriesParticipantId: 'team:red',
          rank: 1,
          grossTotalValue: 70,
          toParValue: -2,
          allEntries: [
            {
              entryId: 'e-pending',
              roundId: 'r1',
              roundIndex: 1,
              resultUnitType: 'player',
              unitId: 'u-p',
              memberUserIds: ['u-p'],
              unitName: '丁',
              counting: 'pending',
              grossTotalValue: 70,
              toParValue: -2,
              thruLabel: '12',
              resultStatus: 'OK'
            }
          ],
          roundLineups: [
            {
              roundId: 'r1',
              playerId: 'u-p',
              userId: 'u-p',
              seriesParticipantId: 'team:red',
              resultUnitType: 'player',
              unitId: 'u-p',
              unitName: '丁',
              gender: 'male',
              fromLineup: true,
              counting: 'pending'
            }
          ]
        }
      ]
    }
  });
  var row = (((vm.teamRows || [])[0] || {}).players || [])[0];
  assert(
    'pending 标签有值且不改成绩列',
    row &&
      row.pendingLabel === '计入待定' &&
      row.genderIcon === '♂' &&
      row.scoreStr === '-2' &&
      row.thru === '12'
  );
})();

console.log('');
console.log('--- seriesStandingsTotPlayerNameCell.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
process.exit(failed ? 1 : 0);
