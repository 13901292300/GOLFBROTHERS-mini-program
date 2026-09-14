/**
 * 球队赛本人账号资料展示（detail 出发表 + score hydration）。
 * 运行：node scripts/teamMatchSelfLiveDisplay.selftest.js
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
var teeSheetManage = require('../miniprogram/utils/teeSheetManage.js');

function writeProfile(patch) {
  var base = {
    userId: 'acct-self',
    nickname: 'NEW',
    avatar: 'https://example.com/new-avatar.png',
    gender: '女',
    signature: 'sig',
    displayName: 'DefaultMatchName',
    competitionName: 'DefaultMatchName',
    handicap: 11.6,
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  store['gb_user_profile_v1'] = Object.assign({}, base, patch || {});
}

writeProfile();

var match = {
  matchId: 'tm-1',
  registerInfo: {
    users: [
      {
        userId: 'acct-self',
        nickname: 'OLD',
        matchNickname: 'MATCH_NAME',
        competitionName: 'MATCH_NAME',
        name: 'OLD',
        avatar: 'https://example.com/old-avatar.png',
        gender: '男'
      },
      {
        userId: 'acct-other',
        nickname: 'OtherSnap',
        matchNickname: 'OTHER_MATCH',
        avatar: 'https://example.com/other.png',
        gender: '男'
      }
    ]
  },
  groups: [
    {
      groupId: 'g-1',
      players: [
        {
          userId: 'acct-self',
          position: 1,
          nickname: 'OLD',
          matchNickname: 'MATCH_NAME',
          name: 'OLD',
          avatar: 'https://example.com/old-avatar.png',
          tPosition: 'BLUE_T',
          handicap: 18.2
        },
        {
          userId: 'acct-other',
          position: 2,
          nickname: 'OtherSnap',
          matchNickname: 'OTHER_MATCH',
          avatar: 'https://example.com/other.png'
        },
        {
          userId: 'guest_m_g1',
          playerId: 'm_g1',
          userType: 'guest',
          source: 'manual',
          name: '嘉宾甲',
          avatar: 'https://cdn.example.com/guest.jpg'
        }
      ]
    }
  ]
};
var frozenUsers = JSON.stringify(match.registerInfo.users);
var frozenGroups = JSON.stringify(match.groups);

var lookup = {
  'acct-self': match.registerInfo.users[0],
  'acct-other': match.registerInfo.users[1]
};
var cards = teeSheetManage.buildTeeSheetTabView(match, { playerLookup: lookup, source: 'match' });
var selfCard = (cards[0].players || []).filter(function (p) {
  return p.userId === 'acct-self';
})[0];
var otherCard = (cards[0].players || []).filter(function (p) {
  return p.userId === 'acct-other';
})[0];

assert('CASE 1 出发表 self displayName=NEW', selfCard && selfCard.displayName === 'NEW');
assert(
  'CASE 2 出发表 self displayAvatar=NEW',
  selfCard && selfCard.displayAvatar === 'https://example.com/new-avatar.png'
);

var wxml = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/tournament/pages/detail/index.wxml'),
  'utf8'
);
assert(
  'CASE 3 出发表 WXML 优先 displayAvatar',
  wxml.indexOf('src="{{pl.displayAvatar || pl.avatar}}"') >= 0 &&
    wxml.indexOf('src="{{pl.avatar}}"') < 0
);

assert('CASE 4 普通身份卡片用账号 nickname 不是 MATCH_NAME', selfCard.displayName === 'NEW');
assert(
  'CASE 4 显式 match-name policy 仍 MATCH_NAME',
  live.pickPresentationName(
    {
      userId: 'acct-self',
      playerUserId: 'acct-self',
      matchNickname: 'MATCH_NAME',
      nickname: 'OLD',
      name: 'OLD'
    },
    'match'
  ) === 'MATCH_NAME'
);

assert('CASE 5 groups.players 保留 userId', match.groups[0].players[0].userId === 'acct-self');

var onlyPlayerId = { playerId: 'local-p1', name: 'OLD', avatar: 'https://example.com/old-avatar.png' };
var bound = live.copyAccountBindFields(
  { userId: 'acct-self', playerUserId: 'acct-self' },
  Object.assign({}, onlyPlayerId)
);
var restored = live.restoreAccountBindFromReliableSources(
  { playerId: 'acct-self', name: 'OLD' },
  { registerUsers: [{ userId: 'acct-self', playerId: 'acct-self', nickname: 'OLD' }] }
);
assert(
  'CASE 6 slot 仅 playerId 时补齐稳定 userId',
  bound.userId === 'acct-self' &&
    bound.playerUserId === 'acct-self' &&
    bound.playerId === 'local-p1' &&
    restored.userId === 'acct-self'
);

var g1 = live.applyLiveDisplayToView({
  userId: 'acct-self',
  playerUserId: 'acct-self',
  playerId: 'acct-self',
  name: 'OLD',
  nickname: 'OLD',
  avatar: 'https://example.com/old-avatar.png'
});
assert('CASE 7 G1 self name/avatar live', g1.name === 'NEW' && g1.displayAvatar === 'https://example.com/new-avatar.png');

var g2member = live.applyLiveDisplayToView({
  userId: 'acct-self',
  playerUserId: 'acct-self',
  playerId: 'acct-self',
  name: 'OLD',
  avatar: 'https://example.com/old-avatar.png'
});
assert(
  'CASE 8 G2/G3/G4 member self live',
  g2member.name === 'NEW' && g2member.displayAvatar === 'https://example.com/new-avatar.png'
);

var g5member = live.applyLiveDisplayToView({
  userId: 'acct-self',
  playerUserId: 'acct-self',
  playerId: 'acct-self',
  name: 'OLD',
  avatar: 'https://example.com/old-avatar.png'
});
assert(
  'CASE 9 G5-G8 member self live',
  g5member.name === 'NEW' && g5member.displayAvatar === 'https://example.com/new-avatar.png'
);

var entityOver = live.overlayScorePlayerDisplay({
  playerId: 'entity_combo_1',
  id: 'entity_combo_1',
  name: '组合A',
  avatar: 'https://example.com/combo.png'
});
assert(
  'CASE 10 entity row 不套 self profile',
  entityOver.applied === false && entityOver.name === '组合A'
);

assert(
  'CASE 11 显式 BLUE_T 不被女账号覆盖',
  live.resolveDisplayTeePosition({
    userId: 'acct-self',
    playerUserId: 'acct-self',
    tPosition: 'BLUE_T',
    gender: '男'
  }) === 'BLUE_T'
);
assert(
  'CASE 12 无显式 T 按账号女 → RED_T',
  live.resolveDisplayTeePosition({
    userId: 'acct-self',
    playerUserId: 'acct-self',
    tPosition: '',
    tee: '',
    gender: '男'
  }) === 'RED_T'
);

var guestCard = (cards[0].players || []).filter(function (p) {
  return String(p.userId || '').indexOf('guest') === 0 || String(p.playerId || '').indexOf('m_') === 0;
})[0];
var guestOver = live.overlayScorePlayerDisplay({
  userId: 'guest_m_g1',
  playerId: 'm_g1',
  userType: 'guest',
  source: 'manual',
  name: '嘉宾甲',
  avatar: 'https://cdn.example.com/guest.jpg'
});
assert('CASE 13 guest overlay 不套 self', guestOver.applied === false && guestOver.name === '嘉宾甲');
assert(
  'CASE 13 guest 出发表不是 NEW',
  !guestCard || guestCard.displayName !== 'NEW'
);

assert(
  'CASE 14 非本人 registered 仍 snapshot',
  otherCard && otherCard.displayName !== 'NEW' && otherCard.displayName === 'OtherSnap'
);

assert(
  'CASE 15 不改 match.groups/registerInfo 原文',
  JSON.stringify(match.registerInfo.users) === frozenUsers && JSON.stringify(match.groups) === frozenGroups
);

assert(
  '复用 playerLiveDisplay 而非第二套 profile resolver',
  typeof teeSheetManage.presentGroupPlayerIdentity === 'function' &&
    typeof userProfileStore.resolveCurrentAccountProfile === 'function'
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
