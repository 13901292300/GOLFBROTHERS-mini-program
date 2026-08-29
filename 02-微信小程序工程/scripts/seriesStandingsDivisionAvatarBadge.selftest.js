/**
 * 队内多分队系列赛总榜展开：头像右下角分队色块 LOGO
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsDivisionAvatarBadge.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var expandId = require(seriesTestPaths.util('seriesStandingsExpandIdentity.js'));
var seriesColorMark = require(seriesTestPaths.util('seriesColorMark.js'));
var seriesStationMatch = require(path.join(mini, 'utils', 'seriesStationMatch.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
var teamAdapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));

var identityJs = fs.readFileSync(
  path.join(mini, 'components', 'leaderboard-player-identity', 'index.js'),
  'utf8'
);
var identityWxml = fs.readFileSync(
  path.join(mini, 'components', 'leaderboard-player-identity', 'index.wxml'),
  'utf8'
);
var liveWxml = fs.readFileSync(
  path.join(mini, 'components', 'live-leaderboard-board', 'index.wxml'),
  'utf8'
);
var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var teamViewSrc = fs.readFileSync(seriesTestPaths.util('teamLeaderboardView.js'), 'utf8');
var detailJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'tournament', 'pages', 'detail', 'index.js'),
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

function seriesOf(overrides) {
  var s = {
    seriesId: 's-div-badge',
    hostMode: 'team',
    templateId: 'division_series',
    scoringRule: { mode: 'global_m', globalM: 2, allowRepeat: true },
    participants: [
      {
        kind: 'division',
        seriesParticipantId: 'division:d1',
        divisionId: 'd1',
        nameSnapshot: '先锋队',
        colorSnapshot: '#112233'
      },
      {
        kind: 'division',
        seriesParticipantId: 'division:d2',
        divisionId: 'd2',
        nameSnapshot: 'alpha',
        colorSnapshot: '#aabbcc'
      }
    ],
    roster: [
      { userId: 'u1', seriesParticipantId: 'division:d1' },
      { userId: 'u2', seriesParticipantId: 'division:d2' }
    ],
    rounds: [{ roundId: 'r1', index: 1 }]
  };
  Object.keys(overrides || {}).forEach(function (k) {
    s[k] = overrides[k];
  });
  return s;
}

function makeMatch(series, seats) {
  return {
    matchId: 'm1',
    matchType: 'team-internal',
    teamGroups: seriesStationMatch.buildTeamGroupsFromSeries(series),
    groups: [{ groupId: 'g1', players: seats || [] }],
    seriesContext: { managed: true, seriesId: series.seriesId, roundId: 'r1' }
  };
}

var series = seriesOf();
var match = makeMatch(series, [
  { userId: 'u1', seriesParticipantId: 'division:d1', matchTeamId: 'd1', nickname: '甲' },
  { userId: 'u2', seriesParticipantId: 'division:d2', matchTeamId: 'd2', nickname: '乙' }
]);

var a = expandId.resolveExpandAffiliationBadge(match, series, 'u1');
var b = expandId.resolveExpandAffiliationBadge(match, series, 'u2');
var markA = seriesColorMark.buildColorMark({
  name: '先锋队',
  color: '#112233',
  emptyNamePlaceholder: '未命名分队'
});
assert(
  '正确读取创建时的分队颜色和名称首字符',
  a.badgeColor === '#112233' &&
    a.badgeText === '先' &&
    a.badgeText === markA.fallbackText &&
    b.badgeColor === '#aabbcc' &&
    b.badgeText === 'A' &&
    a.avatarBadge === 'team'
);

var g1Board = [
  {
    teamId: 'd1',
    players: [{ playerId: 'u1', userId: 'u1', name: '甲', avatar: 'a.png' }]
  },
  {
    teamId: 'd2',
    players: [{ playerId: 'u2', userId: 'u2', name: '乙', avatar: 'b.png' }]
  }
];
var stampedG1 = expandId.stampTeamBoardDivisionAvatarMarks(g1Board, match, series);
assert(
  '同一展开面板中不同分队球员显示不同 LOGO',
  stampedG1[0].players[0].badgeText === '先' &&
    stampedG1[0].players[0].badgeColor === '#112233' &&
    stampedG1[1].players[0].badgeText === 'A' &&
    stampedG1[1].players[0].badgeColor === '#aabbcc'
);

var combo = {
  teamId: 'd1',
  players: [
    {
      isEntity: true,
      entityId: 'ent1',
      name: '组合',
      badgeTeamId: 'd1',
      members: [
        { playerId: 'u1', userId: 'u1', name: '甲', badgeTeamId: 'd1' },
        { playerId: 'u2', userId: 'u2', name: '乙', badgeTeamId: 'd1' }
      ]
    }
  ]
};
var stampedCombo = expandId.stampTeamBoardDivisionAvatarMarks([combo], match, series);
var mems = stampedCombo[0].players[0].members;
assert(
  'G1 与 G2–G4 组合成员各自归属，不套第一人分队',
  stampedCombo[0].players[0].badgeText === '' &&
    mems[0].badgeText === '先' &&
    mems[0].badgeColor === '#112233' &&
    mems[1].badgeText === 'A' &&
    mems[1].badgeColor === '#aabbcc'
);

var hydrated = expandId.stampPlayerDivisionAvatarMark(
  {
    isEntity: true,
    entityId: 'ent2',
    memberUserIds: ['u1', 'u2']
  },
  match,
  series
);
assert(
  'G2–G4 无 members 时按 memberUserIds 各自投影分队 LOGO',
  hydrated.badgeText === '' &&
    hydrated.members[0].badgeText === '先' &&
    hydrated.members[1].badgeText === 'A'
);

var vm = standingsVm.buildSeriesStandingsViewModel({
  series: series,
  selectedKey: 'cumulative',
  match: match,
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1' }],
  standingsResult: {
    participantRows: [
      {
        seriesParticipantId: 'division:d1',
        rank: 1,
        grossTotalValue: 70,
        toParValue: -2,
        allEntries: [
          {
            entryId: 'e1',
            roundId: 'r1',
            resultUnitType: 'player',
            playerId: 'u1',
            userId: 'u1',
            unitName: '甲',
            seriesParticipantId: 'division:d1',
            toParValue: -1,
            counting: 'counted'
          }
        ]
      }
    ]
  }
});
assert(
  'global_m 展开打上分队色块',
  vm.ok &&
    vm.teamRows[0].players[0].badgeText === '先' &&
    vm.teamRows[0].players[0].badgeColor === '#112233'
);

var rnSeries = seriesOf({ scoringRule: { mode: 'per_round_n', allowRepeat: false } });
var live = liveAdapter.projectSeriesRnLiveLeaderboard({
  series: rnSeries,
  selectedKey: 'r1',
  round: rnSeries.rounds[0],
  match: match,
  indexLink: { seriesId: rnSeries.seriesId, roundId: 'r1', matchId: 'm1' }
});
assert(
  'per_round_n LIVE 打开 team 角标模式',
  live.overlay && live.overlay.liveAvatarBadge === 'team'
);

var noSeat = expandId.resolveExpandAffiliationBadge(match, series, 'u-orphan');
var badColorSeries = seriesOf({
  participants: [
    {
      kind: 'division',
      seriesParticipantId: 'division:d9',
      divisionId: 'd9',
      nameSnapshot: '空色',
      colorSnapshot: 'not-a-color'
    }
  ]
});
var badMatch = makeMatch(badColorSeries, [
  { userId: 'u9', seriesParticipantId: 'division:d9', matchTeamId: 'd9' }
]);
var badAff = expandId.resolveExpandAffiliationBadge(badMatch, badColorSeries, 'u9');
assert(
  '无分队、无成员映射及非法数据安全隐藏/降级',
  noSeat.avatarBadge === 'none' &&
    !noSeat.badgeText &&
    badAff.badgeText === '空' &&
    badAff.badgeColor === ''
);

var plain = expandId.resolveExpandAffiliationBadge(
  match,
  seriesOf({ templateId: 'individual_tour' }),
  'u1'
);
assert(
  '普通队内系列赛不显示分队 LOGO',
  plain.avatarBadge === 'none' && !plain.badgeText
);

var orgSeries = {
  hostMode: 'organization',
  templateId: 'inter_team_series',
  participants: [
    {
      kind: 'team',
      seriesParticipantId: 'team:red',
      sourceTeamId: 'red',
      nameSnapshot: '红队',
      logoSnapshot: 'https://cdn/red.png',
      colorSnapshot: '#ff0000'
    }
  ]
};
var orgMatch = {
  matchId: 'om',
  matchType: 'inter-team',
  teamGroups: [{ id: 'red', name: '红队', sourceTeamLogo: 'https://cdn/red.png' }],
  groups: [
    {
      groupId: 'g',
      players: [{ userId: 'ou', seriesParticipantId: 'team:red', matchTeamId: 'red' }]
    }
  ]
};
var orgAff = expandId.resolveExpandAffiliationBadge(orgMatch, orgSeries, 'ou');
assert(
  '队际系列赛不显示分队 LOGO',
  orgAff.avatarBadge === 'team' &&
    !orgAff.badgeText &&
    orgAff.badgeTeamId === 'red'
);

assert(
  '头像布局、姓名、成绩及记分卡行为不受影响',
  identityWxml.indexOf('sc-flag') >= 0 &&
    /position:\s*absolute/.test(
      fs.readFileSync(
        path.join(mini, 'components', 'leaderboard-player-identity', 'index.wxss'),
        'utf8'
      )
    ) &&
    /z-index:\s*1/.test(
      fs.readFileSync(
        path.join(mini, 'components', 'leaderboard-player-identity', 'index.wxss'),
        'utf8'
      )
    ) &&
    pageWxml.indexOf('leaderboard-player-name-cell') >= 0 &&
    pageJs.indexOf('onStandingsPlayerTap') >= 0 &&
    identityJs.indexOf('badgeText.slice(0, 2)') < 0 &&
    liveWxml.indexOf('player.badgeText') >= 0 &&
    teamViewSrc.indexOf('stampTeamBoardDivisionAvatarMarks') < 0
);

assert(
  '普通单场 LIVE 回归不退化',
  detailJs.indexOf('stampTeamBoardDivisionAvatarMarks') < 0 &&
    detailJs.indexOf('_resolveLeaderboardAvatarBadge') >= 0 &&
    /isTeamInternalMatch\(match\)\) return 'none'/.test(detailJs)
);

var emojiSeries = seriesOf({
  participants: [
    {
      kind: 'division',
      seriesParticipantId: 'division:d1',
      divisionId: 'd1',
      nameSnapshot: '😀先锋',
      colorSnapshot: '#10b981'
    }
  ]
});
var emojiMatch = makeMatch(emojiSeries, [
  { userId: 'u1', seriesParticipantId: 'division:d1', matchTeamId: 'd1' }
]);
var emojiAff = expandId.resolveExpandAffiliationBadge(emojiMatch, emojiSeries, 'u1');
assert(
  'emoji 不被拆分且与 Hero 规则一致',
  emojiAff.badgeText === seriesColorMark.firstDisplayGrapheme('😀先锋', '未命名分队') &&
    emojiAff.badgeText === '😀'
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
