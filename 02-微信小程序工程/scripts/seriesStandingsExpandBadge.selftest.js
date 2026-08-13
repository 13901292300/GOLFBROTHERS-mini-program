/**
 * Series R 轮展开角标：数据契约与归属隔离自测
 * 运行：node scripts/seriesStandingsExpandBadge.selftest.js
 */

var path = require('path');
var fs = require('fs');

var expandId = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'seriesStandingsExpandIdentity.js'
));
var seriesStationMatch = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'seriesStationMatch.js'
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
var pageWxss = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'index.wxss'
  ),
  'utf8'
);
var identityJs = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'components',
    'leaderboard-player-identity',
    'index.js'
  ),
  'utf8'
);
var identityWxml = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'components',
    'leaderboard-player-identity',
    'index.wxml'
  ),
  'utf8'
);
var detailJs = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'detail',
    'index.js'
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

/** 模拟组件 _syncAvatarBadge 渲染条件（真机可见） */
function simulateBadgeRender(player, logoMap, mode) {
  var badgeTeamId = String((player && player.badgeTeamId) || '').trim();
  var teamLogo =
    badgeTeamId && logoMap && logoMap[badgeTeamId]
      ? String(logoMap[badgeTeamId]).trim()
      : '';
  var badgeText = String((player && player.badgeText) || '').trim();
  var badgeColor = String((player && player.badgeColor) || '').trim();
  if (mode === 'none') return { show: false };
  if (mode === 'team') {
    if (teamLogo) {
      return {
        show: true,
        kind: 'logo',
        src: teamLogo,
        classOk: true,
        wxmlCond: !!(mode !== 'none' && teamLogo)
      };
    }
    if (badgeText) {
      return {
        show: true,
        kind: 'text',
        text: badgeText.length > 2 ? badgeText.slice(0, 2) : badgeText,
        color: badgeColor,
        wxmlCond: true
      };
    }
  }
  return { show: false, wxmlCond: false };
}

function makeOrgSeries() {
  return {
    seriesId: 's-org',
    hostMode: 'organization',
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
    seriesId: 's-team',
    hostMode: 'team',
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

function makeMatch(series, seats) {
  var teamGroups = seriesStationMatch.buildTeamGroupsFromSeries(series);
  return {
    matchId: 'm1',
    matchType: 'series',
    teamGroups: teamGroups,
    groups: [
      {
        groupId: 'g1',
        players: seats
      }
    ],
    registerInfo: {
      users: seats.map(function (s) {
        return {
          userId: s.userId,
          matchTeamId: 'ROSTER_SHOULD_NOT_WIN',
          groupId: 'ROSTER_SHOULD_NOT_WIN'
        };
      })
    }
  };
}

// —— 权威字段链（detail 源码）——
assert(
  '权威：badgeTeamId + teamGroupLogoById + avatarBadge=team',
  detailJs.indexOf('_resolveInterTeamBadgeLogoForPlayer') >= 0 &&
    detailJs.indexOf('_buildTeamGroupLogoMap') >= 0 &&
    detailJs.indexOf('sourceTeamLogo') >= 0 &&
    identityJs.indexOf('badgeTeamId') >= 0 &&
    identityWxml.indexOf('showAvatarBadge') >= 0 &&
    identityWxml.indexOf('sc-flag') >= 0
);
assert(
  '权威：队内赛 avatarBadge=none（无角标）',
  detailJs.indexOf("isTeamInternalMatch(match)) return 'none'") >= 0 ||
    /_resolveLeaderboardAvatarBadge[\s\S]{0,200}return 'none'/.test(detailJs)
);
assert(
  '组件契约字段：player.badgeTeamId / teamGroupLogoById / badgeText',
  identityJs.indexOf('player.badgeTeamId') >= 0 &&
    identityJs.indexOf('teamGroupLogoById') >= 0 &&
    identityJs.indexOf('badgeText') >= 0
);

// 1 organization LOGO
(function () {
  var series = makeOrgSeries();
  var match = makeMatch(series, [
    {
      userId: 'u-red',
      seriesParticipantId: 'team:red',
      matchTeamId: 'red',
      nickname: '红一'
    }
  ]);
  var aff = expandId.resolveExpandAffiliationBadge(match, series, 'u-red');
  var logoMap = expandId.buildStandingsTeamGroupLogoById(match, series);
  var player = {
    badgeTeamId: aff.badgeTeamId,
    badgeText: aff.badgeText,
    badgeColor: aff.badgeColor
  };
  var rend = simulateBadgeRender(player, logoMap, aff.avatarBadge);
  assert('1 org 角标 badgeTeamId=red', aff.badgeTeamId === 'red');
  assert('1 org LOGO 非空', !!logoMap.red && logoMap.red.indexOf('red.png') >= 0);
  assert('1 org 渲染显示 LOGO', rend.show && rend.kind === 'logo' && rend.wxmlCond);
  assert('15 VM 字段非空', !!(player.badgeTeamId && logoMap[player.badgeTeamId]));
})();

// 2 两支球队不同角标
(function () {
  var series = makeOrgSeries();
  var match = makeMatch(series, [
    { userId: 'u-red', seriesParticipantId: 'team:red', matchTeamId: 'red' },
    { userId: 'u-blue', seriesParticipantId: 'team:blue', matchTeamId: 'blue' }
  ]);
  var a = expandId.resolveExpandAffiliationBadge(match, series, 'u-red');
  var b = expandId.resolveExpandAffiliationBadge(match, series, 'u-blue');
  var logoMap = expandId.buildStandingsTeamGroupLogoById(match, series);
  assert('2 不同 badgeTeamId', a.badgeTeamId === 'red' && b.badgeTeamId === 'blue');
  assert('2 不同 LOGO URL', logoMap.red !== logoMap.blue);
})();

// 3 team Series 分队文字角标
(function () {
  var series = makeTeamSeries();
  var match = makeMatch(series, [
    {
      userId: 'u1',
      seriesParticipantId: 'division:d1',
      matchTeamId: 'd1',
      nickname: '甲'
    }
  ]);
  var aff = expandId.resolveExpandAffiliationBadge(match, series, 'u1');
  var logoMap = expandId.buildStandingsTeamGroupLogoById(match, series);
  var player = {
    badgeTeamId: aff.badgeTeamId,
    badgeText: aff.badgeText,
    badgeColor: aff.badgeColor
  };
  var rend = simulateBadgeRender(player, logoMap, aff.avatarBadge);
  assert('3 分队 badgeTeamId=d1', aff.badgeTeamId === 'd1');
  assert('3 分队 badgeText/color', aff.badgeText.indexOf('一') >= 0 && aff.badgeColor === '#ef4444');
  assert('3 无 LOGO 走文字渲染', rend.show && rend.kind === 'text' && !logoMap.d1);
})();

// 4 无 LOGO organization → DEFAULT
(function () {
  var series = {
    seriesId: 's',
    hostMode: 'organization',
    participants: [
      {
        kind: 'team',
        seriesParticipantId: 'team:x',
        sourceTeamId: 'x',
        nameSnapshot: 'X',
        logoSnapshot: ''
      }
    ]
  };
  var match = makeMatch(series, [
    { userId: 'u', seriesParticipantId: 'team:x', matchTeamId: 'x' }
  ]);
  var logoMap = expandId.buildStandingsTeamGroupLogoById(match, series);
  assert(
    '4 无 logoSnapshot → DEFAULT_ORG_LOGO',
    logoMap.x === expandId.DEFAULT_ORG_LOGO
  );
})();

// 5 图片失败 fallback 接线
assert(
  '5 组件 onAvatarBadgeError → DEFAULT_ORG_LOGO',
  identityJs.indexOf('onAvatarBadgeError') >= 0 &&
    identityJs.indexOf('DEFAULT_ORG_LOGO') >= 0 &&
    identityWxml.indexOf('binderror="onAvatarBadgeError"') >= 0
);

// 6 无归属不默认第一队
(function () {
  var series = makeOrgSeries();
  var match = makeMatch(series, [{ userId: 'u-orphan', nickname: '孤' }]);
  // 清掉 register 干扰：无 matchTeamId
  match.registerInfo = { users: [] };
  var aff = expandId.resolveExpandAffiliationBadge(match, series, 'u-orphan');
  assert('6 无归属 badge 空', !aff.badgeTeamId && aff.avatarBadge === 'none');
})();

// 7 roster 与席位冲突：席位为准
(function () {
  var series = makeOrgSeries();
  var match = makeMatch(series, [
    {
      userId: 'u1',
      seriesParticipantId: 'team:red',
      matchTeamId: 'red'
    }
  ]);
  // registerInfo 已写成 ROSTER_SHOULD_NOT_WIN
  var aff = expandId.resolveExpandAffiliationBadge(match, series, 'u1');
  assert('7 席位优先于 roster', aff.badgeTeamId === 'red' && aff.badgeTeamId !== 'ROSTER_SHOULD_NOT_WIN');
})();

// 8 G2/G3/G4 同组不同归属
(function () {
  var series = makeOrgSeries();
  var match = {
    matchId: 'm1',
    teamGroups: seriesStationMatch.buildTeamGroupsFromSeries(series),
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'u-a', seriesParticipantId: 'team:red', matchTeamId: 'red' },
          { userId: 'u-b', seriesParticipantId: 'team:blue', matchTeamId: 'blue' }
        ]
      }
    ],
    registerInfo: { users: [] }
  };
  var a = expandId.resolveExpandAffiliationBadge(match, series, 'u-a');
  var b = expandId.resolveExpandAffiliationBadge(match, series, 'u-b');
  assert('8 同组各自归属', a.badgeTeamId === 'red' && b.badgeTeamId === 'blue');
})();

// 9 R1/R2 不串轮
(function () {
  var series = makeOrgSeries();
  var m1 = makeMatch(series, [
    { userId: 'u1', seriesParticipantId: 'team:red', matchTeamId: 'red' }
  ]);
  var m2 = makeMatch(series, [
    { userId: 'u1', seriesParticipantId: 'team:blue', matchTeamId: 'blue' }
  ]);
  m2.matchId = 'm2';
  var r1 = expandId.resolveExpandAffiliationBadge(m1, series, 'u1');
  var r2 = expandId.resolveExpandAffiliationBadge(m2, series, 'u1');
  assert('9 R1/R2 归属不串', r1.badgeTeamId === 'red' && r2.badgeTeamId === 'blue');
})();

// 10 角标不影响主页点击
assert(
  '10 角标无独立 bindtap；主页仍 catchtap onProfileTap',
  identityWxml.indexOf('catchtap="onProfileTap"') >= 0 &&
    !/sc-flag[\s\S]{0,200}bindtap=/.test(identityWxml) &&
    !/sc-flag[\s\S]{0,200}catchtap=/.test(identityWxml)
);

// 页面接线
assert(
  'Series 使用 seriesStandingsExpandIdentity',
  pageJs.indexOf('seriesStandingsExpandIdentity') >= 0 &&
    (pageJs.indexOf('resolveExpandAffiliationBadge') >= 0 ||
      pageJs.indexOf('projectStandingsScorecardIdentity') >= 0) &&
    pageJs.indexOf('buildStandingsTeamGroupLogoById') >= 0
);
assert(
  'WXML 仍传 team-group-logo-by-id + avatar-badge',
  pageWxml.indexOf('team-group-logo-by-id="{{standingsTeamGroupLogoById}}"') >= 0 &&
    pageWxml.indexOf('avatar-badge="{{standingsScorecardAvatarBadge}}"') >= 0
);
assert(
  '角标不被 overflow 裁切',
  pageWxss.indexOf('series-standings-expanded-panel') >= 0 &&
    /series-standings-expanded-panel[\s\S]{0,120}overflow:\s*visible/.test(pageWxss)
);
assert(
  '不用 entityId 作为球队身份',
  !/_buildStandingsScorecardIdentityPlayer:[\s\S]{0,800}badgeTeamId:\s*.*entityId/.test(pageJs)
);

console.log('');
console.log('--- seriesStandingsExpandBadge.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
