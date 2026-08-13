/**
 * LEADERBOARD-PLAYER-NAME-CELL-PARITY
 * 普通 detail / Series TOT / Series R 球队展开共用身份格；不抽整条成绩行。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsLeaderboardPlayerNameCell.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram');
var playerManage = require(path.join(root, 'utils', 'playerManage.js'));
var assembler = require(path.join(root, 'utils', 'seriesStandingsAssembler.js'));
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

var cellJs = read('components/leaderboard-player-name-cell/index.js');
var cellWxml = read('components/leaderboard-player-name-cell/index.wxml');
var cellWxss = read('components/leaderboard-player-name-cell/index.wxss');
var cellJson = read('components/leaderboard-player-name-cell/index.json');
var detailWxml = read('subpackages/tournament/pages/detail/index.wxml');
var detailJson = read('subpackages/tournament/pages/detail/index.json');
var seriesWxml = read('subpackages/tournament/pages/series-detail/index.wxml');
var seriesJson = read('subpackages/tournament/pages/series-detail/index.json');
var personalWxml = read('components/personal-leaderboard-board/index.wxml');
var personalJson = read('components/personal-leaderboard-board/index.json');
var assemblerSrc = fs.readFileSync(
  path.join(root, 'utils', 'seriesStandingsAssembler.js'),
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

function sliceBetween(src, beginToken, endToken) {
  var from = src.indexOf(beginToken);
  if (from < 0) return '';
  var end = endToken ? src.indexOf(endToken, from) : -1;
  return end < 0 ? src.slice(from, from + 1800) : src.slice(from, end);
}

var detailRow = sliceBetween(
  detailWxml,
  'catchtap="toggleScorecard"',
  'class="scorecard-row"'
);
var seriesRow = sliceBetween(
  seriesWxml,
  'catchtap="onStandingsPlayerTap"',
  '<!-- TOT/R 球队行展开'
);

assert(
  '组件 properties 仅为身份格字段',
  /name:\s*\{\s*type:\s*String/.test(cellJs) &&
    /genderIcon:/.test(cellJs) &&
    /genderClass:/.test(cellJs) &&
    /roundLabel:/.test(cellJs) &&
    /showRoundTag:/.test(cellJs) &&
    /pendingLabel:/.test(cellJs) &&
    !/\bpos:/.test(cellJs) &&
    !/\bthru:/.test(cellJs) &&
    !/\bscoreStr:/.test(cellJs) &&
    cellJs.indexOf('catchtap') < 0
);

assert(
  '组件 DOM：昵称 → 性别 → 轮次标签 → pending',
  cellWxml.indexOf('class="lr-player"') >= 0 &&
    cellWxml.indexOf('class="player-name"') < cellWxml.indexOf('gender-icon') &&
    cellWxml.indexOf('gender-icon') < cellWxml.indexOf('series-standings-round-tag') &&
    cellWxml.indexOf('series-standings-round-tag') <
      cellWxml.indexOf('series-standings-pending-tag') &&
    cellWxml.indexOf('wx:if="{{genderIcon}}"') >= 0 &&
    cellWxml.indexOf('lr-pos') < 0 &&
    cellWxml.indexOf('lr-thru') < 0 &&
    cellWxml.indexOf('lr-total') < 0
);

assert(
  '长昵称省略、性别紧跟昵称（禁止 flex:1 撑满）',
  /flex:\s*0 1 auto/.test(cellWxss) &&
    cellWxss.indexOf('text-overflow: ellipsis') >= 0 &&
    cellWxss.indexOf('flex: none') >= 0 &&
    cellWxss.indexOf('margin-left: 6rpx') >= 0 &&
    !/\.player-name\s*\{[^}]*flex:\s*1/.test(cellWxss) &&
    cellWxss.indexOf('margin-left: auto') < 0 &&
    cellWxss.indexOf('gender-male') < 0 &&
    cellWxss.indexOf('gender-female') < 0 &&
    cellJson.indexOf('apply-shared') >= 0 &&
    cellJson.indexOf('"virtualHost": true') >= 0
);

assert(
  '普通 detail 球队展开改用共享组件，点击/成绩列签名不变',
  detailJson.indexOf('leaderboard-player-name-cell') >= 0 &&
    detailRow.indexOf('<leaderboard-player-name-cell') >= 0 &&
    detailRow.indexOf('catchtap="toggleScorecard"') >= 0 &&
    detailRow.indexOf('data-mode="team"') >= 0 &&
    detailRow.indexOf('class="lr-thru"') >= 0 &&
    detailRow.indexOf('class="lr-total') >= 0 &&
    detailRow.indexOf('class="lr-pos') >= 0 &&
    /<view class="lr-player">/.test(detailRow) === false
);

assert(
  'TOT/R 球队展开共用同一身份格，无 TOT 内联身份 DOM',
  seriesJson.indexOf('leaderboard-player-name-cell') >= 0 &&
    seriesRow.indexOf('<leaderboard-player-name-cell') >= 0 &&
    seriesRow.indexOf("standings.selectedKey !== 'cumulative'") < 0 &&
    seriesRow.indexOf('wx:else') < 0 &&
    seriesRow.indexOf('catchtap="onStandingsPlayerTap"') >= 0 &&
    seriesRow.indexOf('class="lr-thru"') >= 0 &&
    seriesRow.indexOf('class="lr-total') >= 0 &&
    /<view class="lr-player">/.test(seriesRow) === false &&
    seriesRow.indexOf('series-standings-round-tag') < 0 &&
    seriesRow.indexOf('show-round-tag="{{player.showRoundTag}}"') >= 0
);

assert(
  '个人榜组件未接入 name-cell',
  personalWxml.indexOf('leaderboard-player-name-cell') < 0 &&
    personalJson.indexOf('leaderboard-player-name-cell') < 0
);

assert(
  '装配层走 getGenderDisplay，不再手写 ♀/♂ 映射',
  assemblerSrc.indexOf("require('./playerManage.js')") >= 0 &&
    assemblerSrc.indexOf('getGenderDisplay') >= 0 &&
    assemblerSrc.indexOf("gender === 'F'") < 0 &&
    assemblerSrc.indexOf("genderIcon === '♀'") < 0
);

(function () {
  var male = playerManage.getGenderDisplay({ gender: 'male' });
  var female = playerManage.getGenderDisplay({ gender: '女' });
  var unknown = playerManage.getGenderDisplay({ name: '小红', nickname: '小红' });
  var empty = standingsVm.resolveRowGenderDisplay({});
  assert(
    'getGenderDisplay：男/女符号与颜色；未知/按姓名不推断',
    male.icon === '♂' &&
      male.className === 'gender-male' &&
      female.icon === '♀' &&
      female.className === 'gender-female' &&
      unknown.icon === '' &&
      unknown.className === '' &&
      empty.genderIcon === '' &&
      empty.genderClass === ''
  );
})();

(function () {
  var series = {
    seriesId: 's-name-cell',
    publishToken: 'pub-nc',
    participants: [
      {
        seriesParticipantId: 'team:red',
        kind: 'team',
        sourceTeamId: 'red',
        nameSnapshot: '红队'
      }
    ],
    roster: [
      { playerId: 'u-seat', gender: 'male', nickname: '席位优先' },
      { playerId: 'u-roster', gender: 'female', nickname: '名单补齐' },
      { playerId: 'u-unknown', nickname: '小红' }
    ],
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }]
  };
  var match = {
    matchId: 'm1',
    gameMode: '个人比杆赛',
    status: 'ongoing',
    seriesContext: {
      managed: true,
      seriesId: 's-name-cell',
      roundId: 'r1',
      publishToken: 'pub-nc'
    },
    teamGroups: [{ id: 'red', name: '红队' }],
    registerInfo: { users: [] },
    groups: [
      {
        groupId: 'g1',
        players: [
          {
            userId: 'u-seat',
            nickname: '席位优先',
            gender: 'female',
            matchTeamId: 'red'
          },
          {
            userId: 'u-roster',
            nickname: '名单补齐',
            matchTeamId: 'red'
          },
          {
            userId: 'u-unknown',
            nickname: '小红',
            matchTeamId: 'red'
          }
        ]
      }
    ]
  };
  var extracted = assembler.extractRoundLineupFromStation({
    series: series,
    round: { roundId: 'r1', index: 1, matchId: 'm1' },
    match: match,
    stationStarted: true
  });
  function seatOf(id) {
    return (extracted.seats || []).find(function (s) {
      return s.playerId === id;
    });
  }
  var seatWin = seatOf('u-seat');
  var rosterFill = seatOf('u-roster');
  var unknown = seatOf('u-unknown');
  assert(
    '席位 gender 优先于 roster',
    seatWin &&
      seatWin.gender === 'female' &&
      seatWin.genderIcon === '♀' &&
      seatWin.genderClass === 'gender-female'
  );
  assert(
    '席位缺失时 roster 只读补齐',
    rosterFill &&
      rosterFill.gender === 'female' &&
      rosterFill.genderIcon === '♀' &&
      rosterFill.genderClass === 'gender-female'
  );
  assert(
    '未知性别无符号、不占位字段',
    unknown && unknown.gender === '' && unknown.genderIcon === '' && unknown.genderClass === ''
  );
})();

(function () {
  var scored = [
    {
      entryId: 'e-scored',
      roundId: 'r1',
      resultUnitType: 'player',
      unitId: 'u1',
      memberUserIds: ['u1'],
      unitName: '甲',
      grossTotalValue: 72,
      toParValue: 0,
      counting: 'counted',
      resultStatus: 'OK',
      thruLabel: 'F'
    }
  ];
  var lineups = [
    {
      roundId: 'r1',
      playerId: 'u1',
      userId: 'u1',
      seriesParticipantId: 'team:red',
      resultUnitType: 'player',
      unitId: 'u1',
      unitName: '甲',
      gender: 'female',
      matchGender: 'female',
      genderIcon: '♀',
      genderClass: 'gender-female',
      fromLineup: true,
      counting: 'pending'
    }
  ];
  var merged = standingsVm.mergeTotTeamExpandSource(
    scored,
    lineups,
    {},
    'team:red',
    {},
    []
  );
  var row = merged[0];
  var pack = standingsVm.resolveRowGenderDisplay(row);
  assert(
    '有成绩 entry 缺性别时从同轮 lineup 按 playerId 补齐',
    merged.length === 1 &&
      row &&
      row.gender === 'female' &&
      pack.genderIcon === '♀' &&
      pack.genderClass === 'gender-female'
  );
})();

(function () {
  var merged = assembler.mergeLineupWithScores(
    [
      {
        roundId: 'r1',
        unitId: 'u1',
        playerId: 'u1',
        gender: 'male',
        genderIcon: '♂',
        genderClass: 'gender-male',
        unitName: '乙',
        resultUnitType: 'player',
        memberUserIds: ['u1']
      }
    ],
    [
      {
        roundId: 'r1',
        unitId: 'u1',
        entryId: 'e1',
        grossTotalValue: 71,
        toParValue: -1,
        resultStatus: 'OK',
        thruLabel: 'F',
        counting: 'counted',
        resultUnitType: 'player',
        memberUserIds: ['u1']
      }
    ]
  );
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: {
      seriesId: 's-r',
      scoringRule: { mode: 'global_m', globalM: 1, allowRepeat: false },
      participants: [{ seriesParticipantId: 'team:red', kind: 'team', nameSnapshot: '红队' }]
    },
    selectedKey: 'r1',
    roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true }],
    standingsResult: {
      roundMeta: { r1: { stationStarted: true, hasFormalGroups: true } },
      participantRows: [
        {
          seriesParticipantId: 'team:red',
          rank: 1,
          grossTotalValue: 71,
          toParValue: -1,
          allEntries: [],
          roundLineups: merged
        }
      ]
    }
  });
  var player = (((vm.teamRows || [])[0] || {}).players || [])[0];
  assert(
    'Series R 展开投影与 getGenderDisplay 同构',
    player &&
      player.genderIcon === '♂' &&
      player.genderClass === 'gender-male' &&
      player.thru === 'F' &&
      player.scoreStr === '-1'
  );
})();

(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: {
      seriesId: 's-r-fill',
      scoringRule: { mode: 'global_m', globalM: 1, allowRepeat: false },
      participants: [{ seriesParticipantId: 'team:red', kind: 'team', nameSnapshot: '红队' }]
    },
    selectedKey: 'r1',
    roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true }],
    standingsResult: {
      roundMeta: { r1: { stationStarted: true, hasFormalGroups: true } },
      participantRows: [
        {
          seriesParticipantId: 'team:red',
          rank: 1,
          grossTotalValue: 72,
          toParValue: 0,
          allEntries: [],
          roundLineups: [
            {
              entryId: 'scored-no-gender',
              roundId: 'r1',
              resultUnitType: 'player',
              unitId: 'u-fill',
              playerId: 'u-fill',
              memberUserIds: ['u-fill'],
              unitName: '丙',
              counting: 'counted',
              grossTotalValue: 72,
              toParValue: 0,
              resultStatus: 'OK',
              thruLabel: 'F'
            },
            {
              entryId: 'lineup-donor',
              roundId: 'r1',
              resultUnitType: 'player',
              unitId: 'u-fill',
              playerId: 'u-fill',
              memberUserIds: ['u-fill'],
              unitName: '丙',
              gender: 'male',
              matchGender: 'male',
              fromLineup: true,
              counting: 'pending'
            }
          ]
        }
      ]
    }
  });
  var players = ((vm.teamRows || [])[0] || {}).players || [];
  var scored = players.find(function (p) {
    return p.entryId === 'scored-no-gender';
  });
  assert(
    'R 有成绩缺性别行从同轮 lineup 补齐后生成符号',
    scored && scored.genderIcon === '♂' && scored.genderClass === 'gender-male'
  );
})();

console.log('');
console.log('--- seriesStandingsLeaderboardPlayerNameCell.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
process.exit(failed ? 1 : 0);
