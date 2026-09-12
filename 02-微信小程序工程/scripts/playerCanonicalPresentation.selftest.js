/**
 * 局内 canonical presentation 契约（identity / shuffle / seeded fallback）。
 * 运行：node scripts/playerCanonicalPresentation.selftest.js
 */
var fs = require('fs');
var path = require('path');
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
  env: { USER_DATA_PATH: 'wxfile://usr' }
};

var canon = require('../miniprogram/utils/playerCanonicalDisplay.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var mockAvatars = require('../miniprogram/utils/mockAvatars.js');

store['gb_user_profile_v1'] = {
  userId: 'acct-self',
  nickname: 'SelfNick',
  avatar: 'cloud://env/self-avatar.png',
  avatarLocalPath: 'wxfile://usr/gb_avatar_self.jpg',
  gender: '男',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

assert(
  'manual: playerId=m_* 且 guest userId → roster 主键 m_*',
  canon.resolveRosterPlayerId({
    playerId: 'm_abc1',
    userId: 'guest_m_abc1',
    userType: 'guest',
    source: 'manual',
    name: '甲'
  }) === 'm_abc1'
);

var manualPres = canon.resolvePlayerPresentation({
  playerId: 'm_abc1',
  userId: 'guest_m_abc1',
  userType: 'guest',
  source: 'manual',
  name: '甲',
  avatar: 'https://cdn.example.com/guest/golf-swing-01.jpg'
});
assert('manual accountUserId 为 null', manualPres.accountUserId == null);
assert('manual identityType=manual', manualPres.identityType === 'manual');
assert('manual presentation.playerId=m_*', manualPres.playerId === 'm_abc1');
assert(
  'manual 使用 snapshot https',
  manualPres.displayAvatar === 'https://cdn.example.com/guest/golf-swing-01.jpg'
);

var friendPres = canon.resolvePlayerPresentation({
  playerId: 'fr-1001',
  name: 'Jordan',
  source: 'friend',
  avatar: mockAvatars.avatarByIndex(0)
});
assert('friend roster id=fr-*', friendPres.playerId === 'fr-1001');
assert('friend 不冒充 account user', friendPres.accountUserId == null);
assert('friend identityType=friend', friendPres.identityType === 'friend');

var comboPres = canon.resolvePlayerPresentation({
  playerId: 'fr-1003',
  name: '阿杰',
  source: 'combo',
  avatar: mockAvatars.avatarByIndex(2)
});
assert('combo identityType=combo', comboPres.identityType === 'combo');
assert('combo accountUserId 为空', comboPres.accountUserId == null);

var selfSlot = {
  playerId: 'acct-self',
  userId: 'acct-self',
  playerUserId: 'acct-self',
  name: 'OldSnap',
  avatar: 'cloud://env/self-avatar.png'
};
var selfPres = canon.resolvePlayerPresentation(selfSlot, { currentUserId: 'acct-self' });
assert('self playerId 稳定', selfPres.playerId === 'acct-self');
assert('self accountUserId 正确', selfPres.accountUserId === 'acct-self');
assert('self identityType=self', selfPres.identityType === 'self');
assert('self seeded fallback 非空', !!selfPres.displayAvatar);

var snap = {
  source: 'gameStore',
  matchId: 'g-1',
  groupId: 'g-1',
  scope: 'group',
  currentUserId: 'acct-self',
  groups: [
    {
      groupId: 'g-1',
      playersSlots: [
        {
          playerId: 'acct-self',
          userId: 'acct-self',
          name: 'SelfNick',
          avatar: 'cloud://env/self-avatar.png'
        },
        {
          playerId: 'm_aaa',
          userId: 'guest_m_aaa',
          userType: 'guest',
          source: 'manual',
          name: '甲',
          avatar: 'https://cdn.example.com/guest/golf-swing-03.jpg'
        },
        {
          playerId: 'm_bbb',
          userId: 'guest_m_bbb',
          userType: 'guest',
          source: 'manual',
          name: '乙',
          avatar: ''
        },
        {
          playerId: 'm_ccc',
          userId: 'guest_m_ccc',
          userType: 'guest',
          source: 'manual',
          name: '丙',
          avatar: ''
        }
      ]
    }
  ]
};

var ctx = hostMod.buildFromHostSnapshot(snap);
var byId = ctx.playerPresentationById || {};
assert('presentation key 是 m_* 不是 guest_*', !!byId['m_aaa'] && !byId['guest_m_aaa']);
assert('self presentation 按账号 playerId', !!byId['acct-self']);
assert(
  'legacy alias guest→m',
  ctx.legacyAliasToPlayerId && ctx.legacyAliasToPlayerId['guest_m_aaa'] === 'm_aaa'
);
assert(
  'lookup guest 别名落到 m_*',
  canon.lookupPresentation(byId, ctx.legacyAliasToPlayerId, 'guest_m_aaa').playerId === 'm_aaa'
);

var emptyA = byId['m_bbb'].displayAvatar;
var emptyB = byId['m_ccc'].displayAvatar;
assert('无 avatar 的两个 manual fallback 不同', emptyA && emptyB && emptyA !== emptyB);
assert(
  'manual fallback 不是 self display',
  emptyA !== byId['acct-self'].displayAvatar && emptyB !== byId['acct-self'].displayAvatar
);

function shuffleIds(ids) {
  var arr = ids.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function orderedPlayersOf(players, order) {
  var map = {};
  players.forEach(function (item) {
    map[item.id] = item;
  });
  return order.map(function (id) {
    return map[id];
  });
}

var roster = ['acct-self', 'm_aaa', 'm_bbb', 'm_ccc'].map(function (id) {
  var row = byId[id];
  return {
    id: row.playerId,
    playerId: row.playerId,
    name: row.displayName,
    displayAvatar: row.displayAvatar
  };
});
var baseline = {};
roster.forEach(function (p) {
  baseline[p.playerId] = p.displayAvatar;
});
var mixedOk = true;
var i;
for (i = 0; i < 20; i++) {
  var order = shuffleIds(
    roster.map(function (p) {
      return p.id;
    })
  );
  var rows = orderedPlayersOf(roster, order);
  rows.forEach(function (row, idx) {
    if (row.id !== order[idx]) mixedOk = false;
    if (row.displayAvatar !== baseline[row.playerId]) mixedOk = false;
    if (row.playerId !== 'acct-self' && row.displayAvatar === baseline['acct-self']) mixedOk = false;
  });
}
assert('20 次 shuffle playerId→displayAvatar 不变且不串 self', mixedOk);

var mixedSnap = {
  source: 'gameStore',
  matchId: 'g-2',
  groupId: 'g-1',
  scope: 'group',
  currentUserId: 'acct-self',
  groups: [
    {
      groupId: 'g-1',
      playersSlots: [
        selfSlot,
        {
          playerId: 'fr-1001',
          source: 'friend',
          name: 'Jordan',
          avatar: mockAvatars.avatarByIndex(0)
        },
        {
          playerId: 'fr-1003',
          source: 'combo',
          name: '阿杰',
          avatar: mockAvatars.avatarByIndex(2)
        },
        {
          playerId: 'm_mix',
          userId: 'guest_m_mix',
          userType: 'guest',
          source: 'manual',
          name: '手工丁',
          avatar: 'https://cdn.example.com/guest/golf-swing-08.jpg'
        }
      ]
    }
  ]
};
var mixedCtx = hostMod.buildFromHostSnapshot(mixedSnap);
var mixMap = mixedCtx.playerPresentationById;
assert('mixed: friend key=fr-1001', !!mixMap['fr-1001']);
assert('mixed: combo key=fr-1003', !!mixMap['fr-1003']);
assert('mixed: manual key=m_mix', !!mixMap['m_mix'] && !mixMap['guest_m_mix']);
assert(
  'mixed: manual 脸不是 self',
  mixMap['m_mix'].displayAvatar !== (mixMap['acct-self'] && mixMap['acct-self'].displayAvatar)
);
assert(
  'mixed: friend 脸保持 https mock',
  String(mixMap['fr-1001'].displayAvatar).indexOf('https://') === 0
);

var hostSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/gameHostContext.js'),
  'utf8'
);
assert(
  'CASE attachPartyAvatars 不再无 seed DEFAULT_AVATAR',
  /attachPartyAvatars[\s\S]*function buildPresentation/.test(hostSrc) &&
    hostSrc.indexOf(
      'party.avatar = byId[party.partyId] || party.memberAvatars[0] || mockAvatars.DEFAULT_AVATAR'
    ) < 0
);

var orderBoard = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/config/order-board.wxml'),
  'utf8'
);
assert(
  'wx:key 不再使用 index',
  orderBoard.indexOf('wx:key="index"') < 0 &&
    orderBoard.indexOf('wx:for="{{orderedPlayers}}" wx:key="id"') >= 0
);

assert(
  'guest alias 函数 guest_m_x → m_x',
  canon.manualPlayerIdFromGuestUserId('guest_m_abc1') === 'm_abc1'
);
assert(
  'guest 普通 id 不剥成账号',
  canon.manualPlayerIdFromGuestUserId('guest_other') === ''
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
