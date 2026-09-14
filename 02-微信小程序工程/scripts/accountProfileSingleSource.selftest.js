/**
 * Phase 1：当前登录用户账号资料单一事实源。
 * 运行：node scripts/accountProfileSingleSource.selftest.js
 */
var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

var store = Object.create(null);
global.wx = {
  getStorageSync: function (key) {
    return store[key];
  },
  setStorageSync: function (key, val) {
    store[key] = val;
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

var userProfileStore = require('../miniprogram/utils/userProfileStore.js');
var live = require('../miniprogram/utils/playerLiveDisplay.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');

function writeProfile(patch) {
  var base = {
    userId: 'acct-self',
    nickname: 'LiveNick',
    avatar: 'https://example.com/live-avatar.png',
    gender: '男',
    signature: 'old-sign',
    displayName: 'DefaultMatchName',
    competitionName: 'DefaultMatchName',
    handicap: 11.6,
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  store['gb_user_profile_v1'] = Object.assign({}, base, patch || {});
}

function selfSlot(extra) {
  return Object.assign(
    {
      playerId: 'acct-self',
      userId: 'acct-self',
      playerUserId: 'acct-self',
      name: 'SnapName',
      nickname: 'SnapNick',
      matchNickname: '比赛名A',
      displayName: 'SnapDisplay',
      avatar: 'https://example.com/old-avatar.png',
      gender: '男',
      handicap: 18.2
    },
    extra || {}
  );
}

writeProfile({ nickname: '新昵称', avatar: 'https://example.com/new-avatar.png', gender: '女', signature: 'hello-sign' });

var acc = userProfileStore.resolveCurrentAccountProfile();
assert('resolver nickname 来自账号 nickname 不是 displayName', acc.nickname === '新昵称');
assert('resolver 不把 displayName 当成 nickname', acc.defaultCompetitionName === 'DefaultMatchName');
assert('resolver avatar', acc.avatar === 'https://example.com/new-avatar.png');
assert('resolver gender', acc.gender === '女');
assert('CASE 6 signature', acc.signature === 'hello-sign');
assert('resolver handicap 是账号默认差点', acc.handicap === 11.6);

var over1 = live.overlayScorePlayerDisplay(selfSlot({ nickname: '旧', name: '旧' }));
assert('CASE 1 self nickname live', over1.applied === true && over1.name === '新昵称');
assert('CASE 2 self avatar live', over1.avatar === 'https://example.com/new-avatar.png');
assert('CASE 3 普通身份 gender live', over1.gender === 'female');

var view1 = live.applyLiveDisplayToView(selfSlot({ nickname: '旧', name: '旧' }));
assert('applyLiveDisplayToView 本人 nickname', view1.name === '新昵称');
assert('applyLiveDisplayToView 本人 gender', view1.gender === 'female');
assert('applyLiveDisplayToView signature', view1.signature === 'hello-sign');

var teeKeep = live.resolveDisplayTeePosition(
  selfSlot({ tPosition: 'BLUE_T', gender: '男' })
);
assert('CASE 4 显式 tPosition 不被性别覆盖', teeKeep === 'BLUE_T');

var teeDefault = live.resolveDisplayTeePosition(selfSlot({ tPosition: '', tee: '', gender: '男' }));
assert('CASE 5 无 tPosition 按账号女 → RED_T', teeDefault === 'RED_T');

assert(
  'CASE 7 普通身份不用 matchNickname',
  live.pickPresentationName(selfSlot(), 'identity') === '新昵称'
);
assert(
  'CASE 8 明确比赛名 policy',
  live.pickPresentationName(selfSlot(), 'match') === '比赛名A'
);

var gameSnap = {
  source: 'gameStore',
  matchId: 'g-live-1',
  groupId: 'g-1',
  scope: 'group',
  currentUserId: 'acct-self',
  groups: [
    {
      groupId: 'g-1',
      playersSlots: [
        selfSlot({
          name: '旧槽位名',
          nickname: '旧槽位昵称',
          matchNickname: '比赛名A',
          avatar: 'https://example.com/old-avatar.png'
        }),
        {
          playerId: 'acct-other',
          userId: 'acct-other',
          name: 'OtherSnap',
          nickname: 'OtherSnap',
          matchNickname: '他人比赛名',
          avatar: 'https://example.com/other.png',
          gender: '男'
        },
        {
          playerId: 'm_guest1',
          userId: 'guest_m_guest1',
          userType: 'guest',
          source: 'manual',
          name: '嘉宾甲',
          matchNickname: '嘉宾比赛名',
          avatar: 'https://cdn.example.com/guest.jpg'
        }
      ]
    }
  ]
};
var ctx = hostMod.buildFromHostSnapshot(gameSnap);
var byId = ctx.playerPresentationById || {};
var hostSelfRow = (ctx.players || []).filter(function (p) {
  return p && p.playerId === 'acct-self';
})[0];
var lockSlot = selfSlot({
  name: 'OLD',
  nickname: 'OLD',
  matchNickname: 'MATCH_NAME',
  avatar: 'https://example.com/old-avatar.png'
});
assert(
  'GAME self nickname live 不被 resolveMatchNickname 覆盖',
  byId['acct-self'] && byId['acct-self'].displayName === '新昵称'
);
assert(
  'HOST lock: snapshot OLD + profile NEW → GAME identity NEW',
  hostSelfRow && hostSelfRow.displayName === '新昵称' && byId['acct-self'].displayName === '新昵称'
);
assert(
  'HOST lock: identity policy 用账号 nickname 不是 MATCH_NAME',
  live.pickPresentationName(lockSlot, 'identity') === '新昵称'
);
assert(
  'HOST lock: 显式 match policy 仍显示 MATCH_NAME',
  live.pickPresentationName(lockSlot, 'match') === 'MATCH_NAME'
);
assert(
  'GAME self avatar live',
  byId['acct-self'] && byId['acct-self'].displayAvatar === 'https://example.com/new-avatar.png'
);

var guestOver = live.overlayScorePlayerDisplay({
  playerId: 'm_guest1',
  userId: 'guest_m_guest1',
  userType: 'guest',
  source: 'manual',
  name: '嘉宾甲',
  avatar: 'https://cdn.example.com/guest.jpg'
});
assert(
  'CASE 9 guest 保持 snapshot',
  guestOver.applied === false && guestOver.name === '嘉宾甲'
);
assert(
  'GAME guest 不套 self profile',
  byId['m_guest1'] && byId['m_guest1'].displayName !== '新昵称'
);

var otherOver = live.overlayScorePlayerDisplay({
  userId: 'acct-other',
  playerId: 'acct-other',
  name: 'OtherSnap',
  avatar: 'https://example.com/other.png',
  gender: '男'
});
assert(
  'CASE 10 非本人 registered 不套 self profile',
  otherOver.applied === false &&
    otherOver.name === 'OtherSnap' &&
    otherOver.avatar === 'https://example.com/other.png' &&
    otherOver.gender === 'male'
);
assert(
  'GAME 非本人 nickname 不套 self',
  byId['acct-other'] && byId['acct-other'].displayName !== '新昵称'
);

writeProfile({ nickname: '', avatar: 'https://example.com/new-avatar.png', gender: '女' });
var emptyNick = live.overlayScorePlayerDisplay(
  selfSlot({ name: 'SnapName', nickname: 'SnapNick' })
);
assert(
  'CASE 11 nickname 空则 fallback snapshot 不空名',
  emptyNick.name === 'SnapNick' && emptyNick.name !== ''
);

writeProfile({ nickname: '新昵称', handicap: 7.5 });
var frozenGame = { handicap: 18.2, hcap: 18.2 };
var overHcap = live.overlayScorePlayerDisplay(selfSlot({ handicap: 18.2 }));
assert('CASE 12 overlay 不返回 handicap 覆盖', overHcap.handicap == null);
assert(
  'CASE 12 修改账号差点不改比赛 snapshot',
  frozenGame.handicap === 18.2 && frozenGame.hcap === 18.2
);
assert(
  'resolver 账号差点已更新但比赛 snapshot 独立',
  userProfileStore.resolveCurrentAccountProfile().handicap === 7.5 && frozenGame.handicap === 18.2
);

assert(
  'displayName 不是账号昵称权威',
  userProfileStore.resolveCurrentAccountProfile().nickname !==
    userProfileStore.resolveCurrentAccountProfile().defaultCompetitionName
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
