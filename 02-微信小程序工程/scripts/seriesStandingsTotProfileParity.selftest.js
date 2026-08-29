/**
 * TOT-PROFILE-PARITY：Series 总榜 TOT 球队展开资料栏与 R1 个人榜 identity 同构
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsTotProfileParity.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..', 'miniprogram');
var expandId = require(seriesTestPaths.util('seriesStandingsExpandIdentity.js'));
var personalBoard = require(path.join(root, 'utils', 'personalLeaderboardBoard.js'));
var seriesStationMatch = require(path.join(root, 'utils', 'seriesStationMatch.js'));
var openPlayerProfileUtil = require(path.join(root, 'utils', 'openPlayerProfile.js'));
var playerManage = require(path.join(root, 'utils', 'playerManage.js'));

var pageJs = fs.readFileSync(
  path.join(root, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js'),
  'utf8'
);
var pageWxml = fs.readFileSync(
  path.join(root, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.wxml'),
  'utf8'
);
var identityWxml = fs.readFileSync(
  path.join(root, 'components', 'leaderboard-player-identity', 'index.wxml'),
  'utf8'
);
var identityJs = fs.readFileSync(
  path.join(root, 'components', 'leaderboard-player-identity', 'index.js'),
  'utf8'
);
var personalWxml = fs.readFileSync(
  path.join(root, 'components', 'personal-leaderboard-board', 'index.wxml'),
  'utf8'
);
var personalJson = fs.readFileSync(
  path.join(root, 'components', 'personal-leaderboard-board', 'index.json'),
  'utf8'
);
var panelDir = path.join(root, 'components', 'leaderboard-player-profile-panel');
var panelWxml = fs.readFileSync(path.join(panelDir, 'index.wxml'), 'utf8');
var panelJson = fs.readFileSync(path.join(panelDir, 'index.json'), 'utf8');
var panelJs = fs.readFileSync(path.join(panelDir, 'index.js'), 'utf8');
var pageJson = fs.readFileSync(
  path.join(root, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.json'),
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

function sliceMethod(src, name, nextName) {
  var start = src.indexOf(name + ': function');
  var end = nextName ? src.indexOf(nextName + ': function', start + 1) : src.length;
  if (start < 0 || end < 0 || end <= start) return '';
  return src.slice(start, end);
}

function makeOrgSeries() {
  return {
    seriesId: 's-org-parity',
    hostMode: 'organization',
    roster: [
      {
        userId: 'u-r1',
        nickname: '名册红一',
        avatar: 'https://cdn.example/roster-r1.png',
        seriesParticipantId: 'team:blue'
      }
    ],
    participants: [
      {
        kind: 'team',
        seriesParticipantId: 'team:red',
        sourceTeamId: 'red',
        nameSnapshot: '红队高尔夫',
        shortNameSnapshot: '红队',
        logoSnapshot: 'https://cdn.example/red.png'
      },
      {
        kind: 'team',
        seriesParticipantId: 'team:blue',
        sourceTeamId: 'blue',
        nameSnapshot: '蓝队高尔夫',
        shortNameSnapshot: '蓝队',
        logoSnapshot: 'https://cdn.example/blue.png'
      }
    ]
  };
}

function makeTeamSeries() {
  return {
    seriesId: 's-team-parity',
    hostMode: 'team',
    templateId: 'division_series',
    roster: [],
    participants: [
      {
        kind: 'division',
        seriesParticipantId: 'division:d1',
        divisionId: 'd1',
        nameSnapshot: '一队',
        shortNameSnapshot: '一队',
        colorSnapshot: '#ef4444',
        logoSnapshot: ''
      },
      {
        kind: 'division',
        seriesParticipantId: 'division:d2',
        divisionId: 'd2',
        nameSnapshot: '二队',
        shortNameSnapshot: '二队',
        colorSnapshot: '#3b82f6',
        logoSnapshot: ''
      }
    ]
  };
}

function makeStationMatch(series, seats, extra) {
  var hostMode = String((series && series.hostMode) || '');
  var matchType = hostMode === 'team' ? 'team-internal' : 'inter-team';
  var teamGroups = seriesStationMatch.buildTeamGroupsFromSeries(series);
  return Object.assign(
    {
      matchId: 'm-r1',
      matchType: matchType,
      gameMode: '个人比杆赛',
      teamGroups: teamGroups,
      groups: [{ groupId: 'g1', players: seats }],
      registerInfo: {
        users: seats.map(function (s) {
          return {
            userId: s.userId,
            nickname: s.nickname,
            gender: s.gender,
            avatar: s.avatar,
            handicap: s.handicap,
            floatCoef: s.floatCoef,
            matchTeamId: s.matchTeamId
          };
        })
      }
    },
    extra || {}
  );
}

var teamWrapStart = pageWxml.indexOf('team-leaderboard-players-wrap');
var teamWrap = teamWrapStart >= 0 ? pageWxml.slice(teamWrapStart) : '';
var totIdentity = '';
if (teamWrap) {
  var idStart = teamWrap.indexOf('<leaderboard-player-profile-panel');
  var idEnd = teamWrap.indexOf('/>', idStart);
  if (idEnd < 0) idEnd = teamWrap.indexOf('</leaderboard-player-profile-panel>', idStart);
  totIdentity = idStart >= 0 && idEnd > idStart ? teamWrap.slice(idStart, idEnd + 2) : '';
}

var entityIdentity = '';
(function () {
  var start = personalWxml.indexOf('<leaderboard-player-profile-panel');
  var end = personalWxml.indexOf('/>', start);
  if (end < 0) end = personalWxml.indexOf('</leaderboard-player-profile-panel>', start);
  entityIdentity = start >= 0 && end > start ? personalWxml.slice(start, end + 2) : '';
})();

var followBody = sliceMethod(pageJs, 'onStandingsScorecardFollow', 'onScroll');
var profileBody = sliceMethod(pageJs, 'onStandingsScorecardProfileTap', 'onStandingsScorecardFollow');
var openBody = sliceMethod(pageJs, '_openStandingsPlayerScorecard', 'onStandingsScorecardAdError');

assert(
  'R1 与 TOT 资料区只来自同一共享组件',
  fs.existsSync(path.join(panelDir, 'index.js')) &&
    /leaderboard-player-identity/.test(panelJson) &&
    /<leaderboard-player-identity/.test(panelWxml) &&
    /leaderboard-player-profile-panel/.test(pageJson) &&
    /leaderboard-player-profile-panel/.test(personalJson) &&
    totIdentity.indexOf('<leaderboard-player-profile-panel') >= 0 &&
    personalWxml.indexOf('<leaderboard-player-profile-panel') >= 0 &&
    /sc-team-stack-wrap[\s\S]*<leaderboard-player-profile-panel/.test(teamWrap) &&
    totIdentity.indexOf('<leaderboard-player-identity') < 0 &&
    personalWxml.indexOf('<leaderboard-player-identity') < 0 &&
    personalWxml.indexOf('class="scorecard-profile"') < 0 &&
    teamWrap.indexOf('class="scorecard-profile"') < 0
);

assert(
  'TOT 展开条件只看 occurrence/scorecardKey，不被 openStandingsScorecard 挡住',
  /wx:if="\{\{openStandingsScorecardKey === player\.scorecardKey\}\}"/.test(teamWrap) &&
    teamWrap.indexOf(
      'openStandingsScorecardKey === player.scorecardKey && (openStandingsScorecard || standingsScorecardEmptyLabel)'
    ) < 0 &&
    totIdentity.indexOf('wx:if="{{standingsScorecardPlayer}}"') < 0
);

assert(
  'TOT 资料栏在状态/逐洞卡之前',
  (function () {
    var idAt = teamWrap.indexOf('<leaderboard-player-profile-panel');
    var emptyAt = teamWrap.indexOf('standingsScorecardEmptyLabel');
    var cardAt = teamWrap.indexOf('openStandingsScorecard.frontHead');
    return idAt >= 0 && emptyAt > idAt && cardAt > idAt;
  })()
);

assert(
  'TOT 三态不跳过资料栏（empty/scorecard 只包成绩区）',
  totIdentity.indexOf('openStandingsScorecard') < 0 &&
    totIdentity.indexOf('standingsScorecardEmptyLabel') < 0
);

assert(
  'TOT 与 R1 entity 同一套属性契约',
  [
    'team-group-logo-by-id',
    'avatar-badge',
    'meta-mode',
    'show-name-gender',
    'gender-symbol',
    'gender-class',
    'followed',
    'relation-status',
    'relationship-label',
    'can-follow',
    'follow-loading',
    'is-self',
    'bind:follow',
    'bind:profiletap'
  ].every(function (attr) {
    return totIdentity.indexOf(attr) >= 0 && entityIdentity.indexOf(attr) >= 0;
  })
);

assert(
  'TOT 不再写死隐藏关注',
  totIdentity.indexOf('can-follow="{{false}}"') < 0 &&
    totIdentity.indexOf('is-self="{{true}}"') < 0 &&
    totIdentity.indexOf('bind:follow="onStandingsScorecardFollow"') >= 0
);

assert(
  'TOT 与 R 榜绑定同一个 handler',
  /bind:follow="onStandingsScorecardFollow"/.test(pageWxml) &&
    (pageWxml.split('bind:follow="onStandingsScorecardFollow"').length - 1) >= 2 &&
    pageWxml.indexOf('onStandingsScorecardFollowNoop') < 0 &&
    pageJs.indexOf('onStandingsScorecardFollowNoop') < 0
);

assert(
  '关注成功只刷新现有关注 map，不 reload',
  followBody.indexOf('standings.personalFollowMap') >= 0 &&
    followBody.indexOf('reloadViewModel') < 0 &&
    followBody.indexOf('_rebuildStandingsProjection') < 0
);

assert(
  '性别符号 class 与 R1 组件一致；未知性别不占位',
  identityWxml.indexOf('gender-icon sc-name-gender') >= 0 &&
    identityWxml.indexOf('wx:if="{{showNameGender && displayGenderSymbol}}"') >= 0
);

assert(
  '头像/昵称/箭头均走 onProfileTap',
  /sc-profile-left[^>]*catchtap="onProfileTap"/.test(identityWxml) &&
    /sc-chevron[\s\S]{0,180}catchtap="onProfileTap"/.test(identityWxml)
);

assert(
  '角标无独立点击',
  !/sc-flag[\s\S]{0,200}bindtap=/.test(identityWxml) &&
    !/sc-flag[\s\S]{0,200}catchtap=/.test(identityWxml)
);

assert(
  '主页链路 resolveOpenableUserId → openPlayerProfile',
  profileBody.indexOf('resolveOpenableUserId') >= 0 &&
    profileBody.indexOf('openPlayerProfile') >= 0 &&
    profileBody.indexOf('该球员暂无主页') >= 0
);

assert(
  '禁止 occurrenceKey/entityId/seriesParticipantId/rosterEntryId 冒充',
  profileBody.indexOf('occurrenceKey') >= 0 &&
    profileBody.indexOf('entityId') >= 0 &&
    profileBody.indexOf('seriesParticipantId') >= 0 &&
    profileBody.indexOf('rosterEntryId') >= 0
);

assert(
  '关注失败不得伪造成功',
  followBody.indexOf('contactFollowAction.followUser') >= 0 &&
    followBody.indexOf('关注失败') >= 0 &&
    followBody.indexOf("if (!status)") >= 0 &&
    followBody.indexOf('openStandingsScorecardKey') < 0 &&
    followBody.indexOf('_rebuildStandingsProjection') < 0
);

assert(
  '打开面板不改 TOT 选择/吸顶',
  openBody.indexOf('_standingsSelectedKey') < 0 &&
    openBody.indexOf('expandedStandingsTeamId') < 0 &&
    openBody.indexOf('_syncStickyByScroll') < 0
);

assert(
  '投影走共享 projectStandingsScorecardIdentity',
  pageJs.indexOf('projectStandingsScorecardIdentity') >= 0 &&
    typeof expandId.projectStandingsScorecardIdentity === 'function'
);

(function () {
  var series = makeOrgSeries();
  var match = makeStationMatch(series, [
    {
      userId: 'u-r1',
      nickname: '红一',
      gender: 'male',
      avatar: 'https://cdn.example/r1.png',
      handicap: 12,
      floatCoef: 0.8,
      matchTeamId: 'red',
      seriesParticipantId: 'team:red'
    }
  ]);
  var tot = expandId.projectStandingsScorecardIdentity(match, series, {
    playerId: 'u-r1',
    occurrenceKey: 'r1:u-r1',
    entityId: 'ent-should-not-win',
    seriesParticipantId: 'team:red'
  });
  var r1 = personalBoard.buildPersonalLeaderboardBoard(match, { view: 'all', scoreType: 'gross' });
  var row = (r1.leaderboard || []).find(function (x) {
    return x && x.playerId === 'u-r1';
  });
  var p = tot.player || {};
  var gd = playerManage.getGenderDisplay({ gender: 'male' });
  assert(
    'TOT vs R1：昵称/性别/头像一致',
    row &&
      p.name === row.name &&
      p.displayName === row.displayName &&
      p.gender === row.gender &&
      p.genderIcon === row.genderIcon &&
      p.genderClass === row.genderClass &&
      p.avatar === row.avatar
  );
  assert(
    'TOT 完整投影 playerId/userId/profileUserId',
    p.playerId === 'u-r1' &&
      p.userId === 'u-r1' &&
      p.profileUserId === 'u-r1' &&
      p.avatarUrl === p.avatar
  );
  assert(
    '差点 0 合法；本席 handicap 投影',
    p.handicapText === '12' && p.floatCoefText === '0.8' && tot.metaMode === r1.metaMode
  );
  assert(
    '性别符号与 getGenderDisplay 一致',
    p.genderIcon === gd.icon && p.genderClass === gd.className && tot.showNameGender === true
  );
  assert(
    'organization 角标用该轮席位红队，不默认第一队/名册蓝队',
    p.badgeTeamId === 'red' && tot.avatarBadge === 'team'
  );
  assert(
    '主页 ID 不吃 occurrenceKey/entityId',
    p.profileUserId !== 'r1:u-r1' &&
      p.profileUserId !== 'ent-should-not-win' &&
      openPlayerProfileUtil.resolveOpenableUserId({ userId: p.profileUserId }) === 'u-r1'
  );
  assert('chrome 与 R1 同构', tot.metaMode === r1.metaMode && tot.showNameGender === r1.showExpandGender);
})();

(function () {
  var series = makeTeamSeries();
  var match = makeStationMatch(series, [
    {
      userId: 'u-d1',
      nickname: '分队甲',
      gender: 'female',
      matchTeamId: 'd1',
      seriesParticipantId: 'division:d1',
      handicap: 0
    }
  ]);
  var tot = expandId.projectStandingsScorecardIdentity(match, series, { playerId: 'u-d1' });
  assert(
    'team 分队文字角标，差点 0 显示 0',
    tot.player.badgeText === '一' &&
      tot.player.badgeColor === '#ef4444' &&
      tot.avatarBadge === 'team' &&
      tot.player.handicapText === '0'
  );
})();

(function () {
  var series = makeOrgSeries();
  var match = makeStationMatch(series, [
    {
      userId: 'u-unknown',
      nickname: '无名氏',
      matchTeamId: 'red',
      seriesParticipantId: 'team:red'
    }
  ]);
  var tot = expandId.projectStandingsScorecardIdentity(match, series, { playerId: 'u-unknown' });
  assert(
    '未知性别不显示、不占位',
    tot.player.gender === '' &&
      tot.player.genderIcon === '' &&
      tot.player.genderClass === '' &&
      tot.player.genderSymbol === ''
  );
})();

(function () {
  var series = makeOrgSeries();
  var m1 = makeStationMatch(series, [
    {
      userId: 'u-r1',
      nickname: '红一',
      gender: 'male',
      matchTeamId: 'red',
      seriesParticipantId: 'team:red'
    }
  ]);
  var m2 = makeStationMatch(
    series,
    [
      {
        userId: 'u-r1',
        nickname: '红一',
        gender: 'male',
        matchTeamId: 'blue',
        seriesParticipantId: 'team:blue'
      }
    ],
    { matchId: 'm-r2' }
  );
  var a = expandId.projectStandingsScorecardIdentity(m1, series, {
    playerId: 'u-r1',
    occurrenceKey: 'r1:u-r1',
    roundId: 'r1'
  });
  var b = expandId.projectStandingsScorecardIdentity(m2, series, {
    playerId: 'u-r1',
    occurrenceKey: 'r2:u-r1',
    roundId: 'r2'
  });
  assert(
    '跨轮主页身份相同，角标随该轮席位',
    a.profileUserId === b.profileUserId &&
      a.profileUserId === 'u-r1' &&
      a.player.badgeTeamId === 'red' &&
      b.player.badgeTeamId === 'blue'
  );
  var followA = expandId.resolveStandingsFollowDisplay({
    profileUserId: a.profileUserId,
    currentUserId: 'me-viewer',
    relationStatus: 'following'
  });
  var followB = expandId.resolveStandingsFollowDisplay({
    profileUserId: b.profileUserId,
    currentUserId: 'me-viewer',
    relationStatus: 'following'
  });
  assert(
    '跨轮关注状态相同',
    followA.relationLabel === '已关注' &&
      followB.relationLabel === followA.relationLabel &&
      followA.followed === followB.followed &&
      followA.isSelf === false
  );
})();

(function () {
  var series = makeOrgSeries();
  var match = makeStationMatch(series, [
    {
      userId: 'u-r1',
      nickname: '红一',
      gender: 'male',
      matchTeamId: 'red',
      seriesParticipantId: 'team:red'
    },
    {
      userId: 'u-r2',
      nickname: '红二',
      gender: 'female',
      matchTeamId: 'red',
      seriesParticipantId: 'team:red'
    }
  ]);
  var tot = expandId.projectStandingsScorecardIdentity(match, series, {
    playerId: 'u-r1',
    entityId: 'pair-1',
    occurrenceKey: 'r1:u-r1',
    memberUserIds: ['u-r1', 'u-r2'],
    isEntity: true,
    resultUnitType: 'pair'
  });
  assert(
    'G2–G4 资料栏仍是被点击的真实球员',
    tot.player.playerId === 'u-r1' &&
      tot.player.profileUserId === 'u-r1' &&
      tot.player.playerId !== 'pair-1' &&
      expandId.resolveClickedPlayerId({
        entityId: 'pair-1',
        playerId: 'u-r1',
        memberUserIds: ['u-r1', 'u-r2']
      }) === 'u-r1'
  );
})();

(function () {
  var selfView = expandId.resolveStandingsFollowDisplay({
    profileUserId: 'u-me',
    currentUserId: 'u-me',
    relationStatus: 'none'
  });
  var noneView = expandId.resolveStandingsFollowDisplay({
    profileUserId: 'u-r1',
    currentUserId: 'u-me',
    relationStatus: 'none'
  });
  var friendView = expandId.resolveStandingsFollowDisplay({
    profileUserId: 'u-r1',
    currentUserId: 'u-me',
    relationStatus: 'friend'
  });
  var noId = expandId.resolveStandingsFollowDisplay({
    profileUserId: '',
    currentUserId: 'u-me',
    relationStatus: 'none'
  });
  assert(
    '本人不显示关注；未关注可点；好友回显；无 ID 不显示',
    selfView.isSelf === true &&
      selfView.canFollow === false &&
      noneView.canFollow === true &&
      noneView.relationLabel === '' &&
      friendView.relationLabel === '好友' &&
      friendView.followed === true &&
      friendView.isSelf === false &&
      noId.canFollow === false
  );
})();

(function () {
  assert(
    '无稳定用户 ID 时主页解析为空',
    openPlayerProfileUtil.resolveOpenableUserId({ userId: 'r1:u-r1' }) === '' &&
      openPlayerProfileUtil.resolveOpenableUserId({ userId: 'guest_1' }) === ''
  );
})();

assert(
  '组件主页主键可读 profileUserId',
  identityJs.indexOf('player.profileUserId') >= 0
);

console.log('');
console.log('--- seriesStandingsTotProfileParity.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
process.exit(failed ? 1 : 0);
