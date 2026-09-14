/**
 * Series 创建者身份：与 isCreatorOfMatch 同一套 actor aliases
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCreatorAccess.selftest.js
 */

var path = require('path');
var fs = require('fs');

var bags = {};
global.wx = {
  getStorageSync: function (key) {
    if (!Object.prototype.hasOwnProperty.call(bags, key)) return null;
    return bags[key];
  },
  setStorageSync: function (key, value) {
    bags[key] = value;
  },
  removeStorageSync: function (key) {
    delete bags[key];
  }
};

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var identity = require(path.join(utilsDir, 'teamClub', 'identity.js'));
identity.setTestSession({ userId: 'u_x', displayName: 'tester' });

var seriesManageAccess = require(path.join(utilsDir, 'seriesManageAccess.js'));
var matchManageAccess = require(path.join(utilsDir, 'matchManageAccess.js'));
var teamDirectory = require(path.join(utilsDir, 'teamDirectory.js'));
var playerLiveDisplay = require(path.join(utilsDir, 'playerLiveDisplay.js'));
var createPageSrc = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'create', 'pages', 'series', 'index.js'),
  'utf8'
);
var accessSrc = fs.readFileSync(path.join(utilsDir, 'seriesManageAccess.js'), 'utf8');

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

var userMeAndAccount = { userId: 'me', name: 'legacy' };
var userUx = { userId: 'u_x', name: 'stable' };
var userOther = { userId: 'u_other', name: 'other' };

assert(
  'creator 复用 isCreatorOfMatch',
  accessSrc.indexOf('isCreatorOfMatch') >= 0
);

var seriesMe = { createdBy: 'me', hostMode: 'organization', organization: {} };
assert(
  'CASE1 createdBy=me + actor 含 me + account u_x → creator',
  seriesManageAccess.isSeriesCreator(seriesMe, userMeAndAccount) === true &&
    seriesManageAccess.isSeriesHostPrivileged(seriesMe, userMeAndAccount) === true
);
assert(
  'CASE1 与 isCreatorOfMatch 同语义',
  matchManageAccess.isCreatorOfMatch({ createdBy: 'me' }, userMeAndAccount) === true
);

var seriesUx = { createdBy: 'u_x', hostMode: 'organization', organization: {} };
assert(
  'CASE2 createdBy=u_x + current u_x → true',
  seriesManageAccess.isSeriesCreator(seriesUx, userUx) === true &&
    seriesManageAccess.isSeriesHostPrivileged(seriesUx, userUx) === true
);

var seriesOther = {
  createdBy: 'u_other',
  hostMode: 'organization',
  organization: { organizationId: 'org-none' }
};
assert(
  'CASE3 他人 createdBy → false',
  seriesManageAccess.isSeriesCreator(seriesOther, userUx) === false &&
    seriesManageAccess.isSeriesHostPrivileged(seriesOther, userUx) === false
);

var seriesManagedOnly = {
  createdBy: 'u_other',
  hostMode: '',
  seriesContext: { managed: true }
};
assert(
  'CASE4 managed 不授予用户权限',
  seriesManageAccess.isSeriesHostPrivileged(seriesManagedOnly, userUx) === false &&
    seriesManageAccess.isSeriesCreator(seriesManagedOnly, userUx) === false
);

var origClub = teamDirectory.isClubTeamAdminUser;
var origOrg = teamDirectory.isOrganizationAdmin;
teamDirectory.isClubTeamAdminUser = function (teamId, userId) {
  return String(teamId) === 'team-host' && String(userId) === 'u_x';
};
var seriesTeam = {
  createdBy: 'u_other',
  hostMode: 'team',
  hostTeam: { teamId: 'team-host' }
};
assert(
  'CASE5 team admin 保持 true',
  seriesManageAccess.isSeriesCreator(seriesTeam, userUx) === false &&
    seriesManageAccess.isSeriesHostPrivileged(seriesTeam, userUx) === true
);
teamDirectory.isClubTeamAdminUser = origClub;

teamDirectory.isOrganizationAdmin = function (orgId, userId) {
  return String(orgId) === 'org-host' && String(userId) === 'u_x';
};
var seriesOrg = {
  createdBy: 'u_other',
  hostMode: 'organization',
  organization: { organizationId: 'org-host' }
};
assert(
  'CASE6 organization admin 保持 true',
  seriesManageAccess.isSeriesCreator(seriesOrg, userUx) === false &&
    seriesManageAccess.isSeriesHostPrivileged(seriesOrg, userUx) === true
);
teamDirectory.isOrganizationAdmin = origOrg;

var origAcc = playerLiveDisplay.currentAccountUserId;
playerLiveDisplay.currentAccountUserId = function () {
  return 'u_stable_new';
};
var written = seriesManageAccess.resolveNewSeriesCreatedBy();
assert(
  'CASE7 新建 createdBy 优先稳定 u_... 且不为 me',
  written === 'u_stable_new' && written !== 'me'
);
playerLiveDisplay.currentAccountUserId = function () {
  return 'me';
};
identity.setTestSession({ userId: 'u_from_session', displayName: 's' });
assert(
  'CASE7 account 占位时回落云会话，仍不写 me',
  seriesManageAccess.resolveNewSeriesCreatedBy() === 'u_from_session'
);
playerLiveDisplay.currentAccountUserId = origAcc;
identity.setTestSession({ userId: 'u_x', displayName: 'tester' });

assert(
  '创建页走 resolveNewSeriesCreatedBy，不再读 gameStore.userId 当 createdBy',
  createPageSrc.indexOf('resolveNewSeriesCreatedBy') >= 0 &&
    !/_resolveCurrentCreatorId:[\s\S]*getCurrentUser\(\)\.userId/.test(createPageSrc)
);

assert(
  'CASE8 历史 createdBy=me 不迁移、runtime 可管理',
  accessSrc.indexOf('createEmptySeriesDraft') < 0 &&
    seriesManageAccess.isSeriesHostPrivileged({ createdBy: 'me' }, { userId: 'me' }) === true
);

console.log('');
console.log('seriesCreatorAccess  ' + passed + '/' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
