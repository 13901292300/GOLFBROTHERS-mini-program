/**
 * 队内赛 M 面板管理权：创建者云身份 vs gameStore 'me'
 * 运行：node scripts/matchManageAccess.selftest.js
 */

var fs = require('fs');
var path = require('path');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var matchManageAccess = require(path.join(utilsDir, 'matchManageAccess.js'));
var moreMenu = require(path.join(utilsDir, 'teamMatchMoreMenu.js'));
var teamDirectory = require(path.join(utilsDir, 'teamDirectory.js'));
var identity = require(path.join(utilsDir, 'teamClub', 'identity.js'));

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

function makeInternalMatch(overrides) {
  return Object.assign(
    {
      matchId: 'tm-1',
      matchType: 'team-internal',
      status: 'registering',
      teamId: 'club-jiaobei',
      createdBy: 'cloud-openid-jiaobei',
      gameMode: '个人比杆赛'
    },
    overrides || {}
  );
}

identity.setTestSession({
  userId: 'cloud-openid-jiaobei',
  displayName: '超管'
});

var userMe = { userId: 'me', name: '本地用户' };
var match = makeInternalMatch();
var acc = matchManageAccess.resolveMatchManageAccess(match, userMe);

assert('resolveUserId 优先云会话而非 me', matchManageAccess.resolveUserId(userMe) === 'cloud-openid-jiaobei');
assert('创建者云 ID 与 gameStore me 视为同一人', acc.isCreator === true);
assert('队内赛创建者是全权管理者', acc.isPrivilegedUser === true);

var menu = moreMenu.buildMoreMenuViewModel({ match: match, user: userMe });
assert(
  'M 面板管理功能非空',
  Array.isArray(menu.featuresPermission) && menu.featuresPermission.length > 0,
  'len=' + (menu.featuresPermission && menu.featuresPermission.length)
);
assert(
  '含修改比赛入口',
  (menu.featuresPermission || []).some(function (f) {
    return f && f.permission === 'edit_match';
  })
);

assert('owner 视为管理角色', teamDirectory.isAdminRoleLabel('owner') === true);
assert('超级管理员仍为管理角色', teamDirectory.isAdminRoleLabel('超级管理员') === true);

var otherMatch = makeInternalMatch({ createdBy: 'someone-else' });
var accOther = matchManageAccess.resolveMatchManageAccess(otherMatch, userMe);
assert(
  '非创建者且无球队管理权时不是全权',
  accOther.isPrivilegedUser === false
);

identity.setTestSession(null);

var accLocal = matchManageAccess.resolveMatchManageAccess(
  makeInternalMatch({ createdBy: 'me' }),
  { userId: 'me' }
);
assert('无云会话时 createdBy=me 仍识别创建者', accLocal.isCreator === true && accLocal.isPrivilegedUser);

var matchSrc = fs.readFileSync(path.join(utilsDir, 'matchManageAccess.js'), 'utf8');
var seriesSrc = fs.readFileSync(path.join(utilsDir, 'seriesManageAccess.js'), 'utf8');
var dirSrc = fs.readFileSync(path.join(utilsDir, 'teamDirectory.js'), 'utf8');

assert(
  '主办组织不使用参赛队 sourceTeamId',
  matchSrc.indexOf('绝不使用参赛球队 sourceTeamId') >= 0
);
assert(
  '队内/俱乐部主办走 isClubTeamAdminUser',
  matchSrc.indexOf('teamDirectory.isClubTeamAdminUser') >= 0
);
assert(
  '系列赛俱乐部管理委托 teamDirectory',
  seriesSrc.indexOf('return teamDirectory.isClubTeamAdminUser(teamId, userId)') >= 0
);
assert('teamDirectory 导出 isClubTeamAdminUser', typeof teamDirectory.isClubTeamAdminUser === 'function');
assert(
  'teamDirectory 实现俱乐部管理判定',
  dirSrc.indexOf('function isClubTeamAdminUser') >= 0
);

var interMatch = {
  matchId: 'tm-inter-1',
  matchType: 'inter-team',
  organizationId: 'org-host',
  createdBy: 'cloud-openid-jiaobei',
  sourceTeamId: 'club-jiaobei'
};
identity.setTestSession({
  userId: 'cloud-openid-jiaobei',
  displayName: '超管'
});
var accInter = matchManageAccess.resolveMatchManageAccess(interMatch, { userId: 'me' });
assert('队际赛创建者全权', accInter.isCreator === true && accInter.isPrivilegedUser === true);
assert(
  '队际赛主办 ID 用 organizationId 而非 sourceTeamId',
  accInter.hostingOrgId === 'org-host'
);
identity.setTestSession(null);

if (failed) {
  console.log('\nFAILED ' + failed + '/' + (passed + failed));
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nOK ' + passed + '/' + (passed + failed));
