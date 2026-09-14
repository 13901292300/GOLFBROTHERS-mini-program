/**
 * 单场赛事本人取消报名：canonical userId（matched registerInfo.users row）
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamMatchCancelRegistrationIdentity.selftest.js
 */
var fs = require('fs');
var path = require('path');

var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    var msg = name + (detail ? ' :: ' + detail : '');
    failures.push(msg);
    console.log('FAIL  ' + msg);
  }
}

global.__TEAM_CLUB_REPO_MODE = 'local';

var store = Object.create(null);
global.wx = {
  getStorageSync: function (key) {
    return store[key];
  },
  setStorageSync: function (key, val) {
    store[key] = val;
  },
  removeStorageSync: function (key) {
    delete store[key];
  },
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getFileSystemManager: function () {
    return {
      accessSync: function () {
        throw new Error('missing');
      }
    };
  }
};

var root = path.join(__dirname, '..');
var detailJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'detail', 'index.js'),
  'utf8'
);
var storeJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'utils', 'teamMatchStore.js'),
  'utf8'
);
var seriesDetailJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js'),
  'utf8'
);

var userProfileStore = require('../miniprogram/utils/userProfileStore.js');
var gameStore = require('../miniprogram/utils/gameStore.js');
var live = require('../miniprogram/utils/playerLiveDisplay.js');
var paymentManage = require('../miniprogram/utils/paymentManage.js');
var teamMatchStore = require('../miniprogram/utils/teamMatchStore.js');

function writeProfile(patch) {
  var base = {
    userId: 'u_123',
    nickname: 'Self',
    avatar: 'https://example.com/self.png',
    gender: '男',
    displayName: 'SelfMatch',
    competitionName: 'SelfMatch',
    handicap: 10,
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  store['gb_user_profile_v1'] = Object.assign({}, base, patch || {});
}

function EMPTY_STATUS() {
  return { isRegistered: false, userId: '', groupId: '', groupName: '' };
}

function resolveCurrentUserRegisterStatus(registerInfo) {
  var currentUserId = String(live.currentAccountUserId() || '').trim();
  if (!currentUserId) return EMPTY_STATUS();
  var users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
  var matched = users.find(function (user) {
    return String((user && user.userId) || '') === currentUserId;
  });
  if (!matched) return EMPTY_STATUS();
  return {
    isRegistered: true,
    userId: String(matched.userId),
    groupId: matched.groupId != null ? String(matched.groupId) : '',
    groupName: matched.groupName ? String(matched.groupName) : ''
  };
}

function resolveSelfCancelTargetUserId(registerInfo, pageStatus) {
  var status = resolveCurrentUserRegisterStatus(registerInfo);
  var fromRow = status && status.userId != null ? String(status.userId).trim() : '';
  if (fromRow) return fromRow;
  var fromPage =
    pageStatus && pageStatus.userId != null ? String(pageStatus.userId).trim() : '';
  if (fromPage) return fromPage;
  return String(live.currentAccountUserId() || '').trim();
}

function findRegisterUserForPayment(users, targetUserId) {
  var uid = String(targetUserId || '');
  var list = Array.isArray(users) ? users : [];
  return list.find(function (item) {
    return String((item && item.userId) || '') === uid;
  });
}

writeProfile();

var gameUid = String((gameStore.getCurrentUser() || {}).userId || '');
assert(
  'CASE 1 前置：gameStore 仍为 me（与 profile 分裂）',
  gameUid === 'me',
  'gameStore.userId=' + gameUid
);
assert(
  'CASE 1 前置：currentAccountUserId = u_123',
  live.currentAccountUserId() === 'u_123',
  live.currentAccountUserId()
);

var registerInfoSplit = {
  totalCount: 1,
  users: [{ userId: 'u_123', groupId: 'tg-a', matchTeamId: 'tg-a', paymentConfirmed: true }]
};
var status1 = resolveCurrentUserRegisterStatus(registerInfoSplit);
assert('CASE 1 UI isRegistered', status1.isRegistered === true);
assert(
  'CASE 1 canonical row.userId = u_123',
  status1.userId === 'u_123',
  status1.userId
);
var target1 = resolveSelfCancelTargetUserId(registerInfoSplit, null);
assert('CASE 1 targetUserId = u_123 而非 me', target1 === 'u_123' && target1 !== gameUid);

var paidRow = findRegisterUserForPayment(registerInfoSplit.users, target1);
assert(
  'CASE 2 付款检查读 u_123 行',
  paidRow && paidRow.userId === 'u_123' && paymentManage.isUserPaymentConfirmed(paidRow) === true
);
assert(
  'CASE 2 不拿 me 去查付款',
  !findRegisterUserForPayment(registerInfoSplit.users, 'me')
);

store[teamMatchStore.STORAGE_KEY] = [
  {
    matchId: 'itm-cancel-id',
    matchType: 'inter-team',
    registerInfo: {
      totalCount: 2,
      users: [
        {
          userId: 'u_123',
          groupId: 'tg-a',
          groupName: 'A队',
          matchTeamId: 'tg-a',
          matchTeamName: 'A队'
        },
        {
          userId: 'u_456',
          groupId: 'tg-b',
          groupName: 'B队',
          matchTeamId: 'tg-b',
          matchTeamName: 'B队'
        }
      ]
    }
  }
];

var cancel3 = teamMatchStore.cancelRegistration('itm-cancel-id', target1);
assert('CASE 3 取消 ok', cancel3 && cancel3.ok === true);
assert(
  'CASE 3 只删 u_123 保留 u_456',
  cancel3.match &&
    cancel3.match.registerInfo.users.length === 1 &&
    cancel3.match.registerInfo.users[0].userId === 'u_456' &&
    cancel3.match.registerInfo.totalCount === 1
);
assert(
  'CASE 8 队际 groupId/matchTeamId 不作为取消主键仍成功',
  cancel3.ok === true &&
    cancel3.match.registerInfo.users[0].matchTeamId === 'tg-b'
);

store[teamMatchStore.STORAGE_KEY] = [
  {
    matchId: 'itm-cancel-id',
    matchType: 'inter-team',
    registerInfo: {
      totalCount: 1,
      users: [{ userId: 'u_123', groupId: 'tg-a', matchTeamId: 'tg-a' }]
    }
  }
];
var miss = teamMatchStore.cancelRegistration('itm-cancel-id', 'u_999');
assert(
  'CASE 4 未命中禁止假成功',
  miss && miss.ok === false && miss.reason === 'not_registered',
  JSON.stringify(miss)
);
var stillThere = teamMatchStore.getMatchById('itm-cancel-id');
assert(
  'CASE 4 未命中不写盘删除',
  stillThere &&
    stillThere.registerInfo.users.length === 1 &&
    stillThere.registerInfo.users[0].userId === 'u_123'
);

var noMatch = teamMatchStore.cancelRegistration('missing-match', 'u_123');
assert(
  'CASE 5 match 不存在 not_found',
  noMatch && noMatch.ok === false && noMatch.reason === 'not_found'
);

var noUser = teamMatchStore.cancelRegistration('itm-cancel-id', '');
assert(
  'CASE 6 空 targetUserId 拒绝',
  noUser && noUser.ok === false && (noUser.reason === 'no_user' || noUser.reason === 'not_registered')
);

store[teamMatchStore.STORAGE_KEY] = [
  {
    matchId: 'itm-cancel-refresh',
    matchType: 'inter-team',
    registerInfo: {
      totalCount: 2,
      users: [
        { userId: 'u_123', groupId: 'tg-a', matchTeamId: 'tg-a' },
        { userId: 'u_456', groupId: 'tg-b', matchTeamId: 'tg-b' }
      ]
    }
  }
];
var cancel7 = teamMatchStore.cancelRegistration('itm-cancel-refresh', 'u_123');
var afterInfo = cancel7.match && cancel7.match.registerInfo;
var afterStatus = resolveCurrentUserRegisterStatus(afterInfo);
assert(
  'CASE 7 totalCount/users 来自更新后 match',
  cancel7.ok &&
    afterInfo.totalCount === 1 &&
    afterInfo.users.length === 1 &&
    afterInfo.users[0].userId === 'u_456'
);
assert(
  'CASE 7 currentUserRegisterStatus 重算为未报名',
  afterStatus.isRegistered === false && afterStatus.userId === ''
);

assert(
  '页面：status 返回命中行 userId',
  detailJs.indexOf('userId: String(matched.userId)') >= 0 &&
    detailJs.indexOf('_resolveSelfCancelTargetUserId') >= 0
);
assert(
  '页面：取消用 matched row 而非 gameStore CURRENT_USER',
  /confirmCancelRegister\(\)[\s\S]*_resolveSelfCancelTargetUserId/.test(detailJs) &&
    /openCancelRegisterModal\(\)[\s\S]*_resolveSelfCancelTargetUserId/.test(detailJs)
);

var confirmStart = detailJs.indexOf('confirmCancelRegister()');
var confirmEnd = detailJs.indexOf('_performCancelRegistration(matchId, userId)', confirmStart);
var confirmSlice =
  confirmStart >= 0 && confirmEnd > confirmStart
    ? detailJs.slice(confirmStart, confirmEnd)
    : '';
assert(
  '本人取消块不再以 gameStore.userId 为权威源',
  confirmSlice.indexOf('gameStore.getCurrentUser()') < 0 &&
    confirmSlice.indexOf('_pendingProxyCommitAfterConfirm') >= 0
);
assert(
  'CASE 9 代报名 plan 仍优先独立路径',
  confirmSlice.indexOf('_applyProxyCommitPlan()') >= 0 &&
    confirmSlice.indexOf('_pendingProxyCommitAfterConfirm') <
      confirmSlice.indexOf('_resolveSelfCancelTargetUserId')
);
assert(
  'CASE 2 页面付款查找与取消同一 userId',
  confirmSlice.indexOf('isUserPaymentConfirmed(registerUser)') >= 0 &&
    /String\(\(item && item.userId\) \|\| ''\) === userId/.test(confirmSlice)
);
assert(
  '成功取消走 _buildRegisterStatePatch(updatedMatch)',
  /_performCancelRegistration\(matchId, userId\)[\s\S]{0,900}_buildRegisterStatePatch\(match/.test(
    detailJs
  )
);
assert(
  'not_registered toast 非赛事数据缺失',
  detailJs.indexOf("reason === 'not_registered'") >= 0 &&
    detailJs.indexOf('未找到报名记录，请刷新后重试') >= 0
);
assert(
  'store 未命中返回 not_registered',
  storeJs.indexOf("reason: 'not_registered'") >= 0 &&
    storeJs.indexOf('beforeCount === afterCount') >= 0
);
assert(
  '不引入 teamId/sideId 作为取消主键',
  /_resolveSelfCancelTargetUserId[\s\S]{0,500}sideId/.test(detailJs) === false &&
    /cancelRegistration\(matchId, targetUserId\)[\s\S]{0,400}sideId/.test(storeJs) === false
);
assert(
  'CASE 10 取消身份不读 Phase 2A directory',
  /_resolveSelfCancelTargetUserId[\s\S]{0,800}accountProfileDirectory/.test(detailJs) === false &&
    /confirmCancelRegister\(\)[\s\S]{0,2500}getProfiles/.test(detailJs) === false
);
assert(
  '不改 series-detail 取消链',
  seriesDetailJs.indexOf('_resolveSelfCancelTargetUserId') < 0
);

var profileFrozen = JSON.stringify(userProfileStore.loadProfile() || {});
assert('CASE 10 本测不依赖 directory 写 profile', profileFrozen.indexOf('u_123') >= 0);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
