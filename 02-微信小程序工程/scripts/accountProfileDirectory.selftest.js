/**
 * Phase 2A：其他注册用户 nickname/avatar directory。
 * 运行：node scripts/accountProfileDirectory.selftest.js
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

var dir = require('../miniprogram/utils/accountProfileDirectory.js');
var live = require('../miniprogram/utils/playerLiveDisplay.js');
var teeSheetManage = require('../miniprogram/utils/teeSheetManage.js');
var gameLeaderboard = require('../miniprogram/utils/gameLeaderboard.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');

function writeProfile(patch) {
  var base = {
    userId: 'acct-self',
    nickname: 'SelfLocal',
    avatar: 'https://example.com/self-local.png',
    gender: '男',
    signature: 'my-sig',
    displayName: 'DefaultMatchName',
    competitionName: 'DefaultMatchName',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  store['gb_user_profile_v1'] = Object.assign({}, base, patch || {});
}

function cloudMap(rows) {
  var profilesByUserId = {};
  Object.keys(rows).forEach(function (id) {
    profilesByUserId[id] = Object.assign({ userId: id }, rows[id]);
  });
  return {
    ok: true,
    data: {
      profilesByUserId: profilesByUserId,
      missingUserIds: []
    }
  };
}

async function main() {
  writeProfile();
  dir.resetCache();
  dir.resetNow();
  dir.setNowMs(1000);
  dir.setFetchImpl(function () {
    return cloudMap({});
  });
  dir.resetFetchCallCount();

  var ids1 = dir.collectAccountUserIds([
    { userId: 'acct-a' },
    { userId: 'acct-a' },
    { playerUserId: 'acct-b' },
    { userId: 'acct-b' }
  ]);
  assert('CASE 1 去重', ids1.length === 2 && ids1[0] === 'acct-a' && ids1[1] === 'acct-b');

  var fetched2 = [];
  dir.setFetchImpl(function (need) {
    fetched2.push(need.slice());
    return cloudMap({});
  });
  dir.resetFetchCallCount();
  await dir.resolveAccountProfiles([
    'fr-1003',
    'm_guest1',
    'guest_abc',
    'entity_combo_1',
    { playerId: 'fr-9', name: 'Friend' },
    { userId: 'acct-ok' }
  ]);
  assert('CASE 2 伪 id 不进云请求', fetched2.length === 1 && fetched2[0].length === 1 && fetched2[0][0] === 'acct-ok');
  assert(
    'CASE 2 collect 过滤',
    dir.collectAccountUserIds(['fr-1', 'm_x', 'guest_x', 'entity_x', 'host-1']).length === 0
  );

  var batchNeed = [];
  dir.resetCache();
  dir.setFetchImpl(function (need) {
    batchNeed.push(need.slice());
    return cloudMap({
      'acct-1': { nickname: 'N1', avatar: 'https://example.com/1.png' },
      'acct-2': { nickname: 'N2', avatar: 'https://example.com/2.png' },
      'acct-3': { nickname: 'N3', avatar: 'https://example.com/3.png' }
    });
  });
  dir.resetFetchCallCount();
  await dir.resolveAccountProfiles(['acct-1', 'acct-2', 'acct-3']);
  assert('CASE 3 三 id 一次 getProfiles', dir.getFetchCallCount() === 1 && batchNeed[0].length === 3);

  dir.resetCache();
  dir.setFetchImpl(function () {
    return {
      ok: true,
      data: {
        profilesByUserId: {
          'acct-nick': {
            userId: 'acct-nick',
            displayName: 'NEW',
            nickname: 'NEW',
            avatar: 'https://example.com/n.png'
          }
        },
        missingUserIds: []
      }
    };
  });
  var ad = await dir.resolveAccountProfiles(['acct-nick']);
  assert(
    'CASE 4 displayName 归一 nickname',
    ad.profilesByUserId['acct-nick'] && ad.profilesByUserId['acct-nick'].nickname === 'NEW'
  );

  dir.resetCache();
  dir.setFetchImpl(function () {
    return {
      ok: true,
      data: {
        profilesByUserId: {
          'acct-leak': {
            userId: 'acct-leak',
            nickname: 'Safe',
            avatar: 'https://example.com/s.png',
            searchKey: 'secret',
            openid: 'oid',
            openidHash: 'hash',
            phone: '13800138000',
            gender: '女'
          }
        },
        missingUserIds: []
      }
    };
  });
  var leak = await dir.resolveAccountProfiles(['acct-leak']);
  var row = leak.profilesByUserId['acct-leak'] || {};
  var leakJson = JSON.stringify(row);
  assert(
    'CASE 5 不泄漏内部字段',
    row.nickname === 'Safe' &&
      !row.searchKey &&
      !row.openid &&
      !row.openidHash &&
      !row.phone &&
      !row.gender &&
      leakJson.indexOf('searchKey') < 0 &&
      leakJson.indexOf('openid') < 0
  );

  dir.resetCache();
  dir.setNowMs(1000);
  dir.setFetchImpl(function () {
    return cloudMap({
      'acct-cache': { nickname: 'C', avatar: 'https://example.com/c.png' }
    });
  });
  dir.resetFetchCallCount();
  await dir.resolveAccountProfiles(['acct-cache']);
  await dir.resolveAccountProfiles(['acct-cache']);
  assert('CASE 6 fresh cache 不重复请求', dir.getFetchCallCount() === 1);

  dir.setNowMs(1000 + dir.CACHE_TTL_MS + 1);
  await dir.resolveAccountProfiles(['acct-cache']);
  assert('CASE 7 stale cache 会 refresh', dir.getFetchCallCount() === 2);
  assert('CASE 7 TTL 固定 30s', dir.CACHE_TTL_MS === 30000);

  dir.resetCache();
  dir.setNowMs(1000);
  dir.setFetchImpl(function () {
    return {
      ok: true,
      data: {
        profilesByUserId: {
          'acct-hit': { userId: 'acct-hit', nickname: 'HIT', avatar: 'https://example.com/h.png' }
        },
        missingUserIds: ['acct-miss']
      }
    };
  });
  var part = await dir.resolveAccountProfiles(['acct-hit', 'acct-miss']);
  var missLive = live.applyLiveDisplayToView({
    userId: 'acct-miss',
    name: 'SNAP',
    nickname: 'SNAP',
    avatar: 'https://example.com/old.png'
  });
  assert(
    'CASE 8 partial missing fallback snapshot',
    part.missingUserIds.indexOf('acct-miss') >= 0 && missLive.name === 'SNAP'
  );

  dir.resetCache();
  dir.setFetchImpl(function () {
    return { ok: false, code: 'network_error' };
  });
  var failRes = await dir.resolveAccountProfiles(['acct-fail']);
  var failLive = live.applyLiveDisplayToView({
    userId: 'acct-fail',
    name: 'SNAP2',
    nickname: 'SNAP2',
    avatar: 'https://example.com/old2.png'
  });
  assert('CASE 9 cloud fail fallback snapshot', failRes.ok === false && failLive.name === 'SNAP2');

  dir.resetCache();
  dir.setFetchImpl(function () {
    return cloudMap({
      'acct-self': { nickname: 'CloudSelf', avatar: 'https://example.com/cloud-self.png' }
    });
  });
  await dir.resolveAccountProfiles(['acct-self']);
  var selfLive = live.applyLiveDisplayToView({
    userId: 'acct-self',
    name: 'OLD',
    nickname: 'OLD',
    avatar: 'https://example.com/old-self.png'
  });
  assert(
    'CASE 10 self 本地优先',
    selfLive.name === 'SelfLocal' && selfLive.displayAvatar === 'https://example.com/self-local.png'
  );

  dir.resetCache();
  dir.setFetchImpl(function () {
    return cloudMap({
      'acct-other': { nickname: 'NEW', avatar: 'https://example.com/new-avatar.png' }
    });
  });
  await dir.resolveAccountProfiles(['acct-other']);
  var otherNick = live.overlayScorePlayerDisplay({
    userId: 'acct-other',
    name: 'OLD',
    nickname: 'OLD',
    avatar: 'https://example.com/old-avatar.png',
    gender: '男',
    signature: 'snap-sig'
  });
  var otherView = live.applyLiveDisplayToView({
    userId: 'acct-other',
    name: 'OLD',
    nickname: 'OLD',
    avatar: 'https://example.com/old-avatar.png',
    gender: '男',
    signature: 'snap-sig'
  });
  assert('CASE 11 other nickname=NEW', otherNick.applied === true && otherNick.name === 'NEW');
  assert('CASE 12 other avatar=NEW', otherNick.avatar === 'https://example.com/new-avatar.png');
  assert(
    'CASE 14 directory 只 overlay nickname/avatar',
    otherNick.gender === 'male' && otherNick.signature === '' && otherView.signature === ''
  );

  var guestView = live.applyLiveDisplayToView({
    userId: 'guest_abc',
    playerId: 'guest_abc',
    userType: 'guest',
    name: '嘉宾甲',
    avatar: 'https://example.com/guest.png'
  });
  assert('CASE 13 guest snapshot', guestView.name === '嘉宾甲');

  var match = {
    matchId: 'tm-2a',
    registerInfo: {
      users: [
        {
          userId: 'acct-other',
          nickname: 'OLD',
          name: 'OLD',
          avatar: 'https://example.com/old-avatar.png'
        }
      ]
    },
    groups: [
      {
        groupId: 'g-1',
        players: [
          {
            userId: 'acct-other',
            position: 1,
            nickname: 'OLD',
            name: 'OLD',
            avatar: 'https://example.com/old-avatar.png'
          }
        ]
      }
    ]
  };
  var cards = teeSheetManage.buildTeeSheetTabView(match, {
    playerLookup: { 'acct-other': match.registerInfo.users[0] },
    source: 'match'
  });
  var teeOther = (cards[0].players || [])[0];
  assert('C 球队赛出发表 other=NEW', teeOther && teeOther.displayName === 'NEW');

  var g1 = live.applyLiveDisplayToView({
    userId: 'acct-other',
    playerId: 'acct-other',
    name: 'OLD',
    avatar: 'https://example.com/old-avatar.png'
  });
  assert('B 普通 Score other=NEW', g1.name === 'NEW' && g1.displayAvatar === 'https://example.com/new-avatar.png');

  var g2 = live.applyLiveDisplayToView({
    userId: 'acct-other',
    playerUserId: 'acct-other',
    playerId: 'acct-other',
    name: 'OLD',
    avatar: 'https://example.com/old-avatar.png'
  });
  assert('D G2-G4 member=NEW', g2.name === 'NEW');

  var g5 = live.applyLiveDisplayToView({
    userId: 'acct-other',
    playerUserId: 'acct-other',
    name: 'OLD',
    avatar: 'https://example.com/old-avatar.png'
  });
  assert('E G5-G8 member=NEW', g5.name === 'NEW');

  var presented = hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'g-1',
      groupId: 'grp-1',
      scope: 'group',
      players: [
        {
          playerId: 'slot-a',
          accountUserId: 'acct-other',
          identityType: 'registered',
          displayName: 'OLD',
          canonicalAvatar: 'https://example.com/old-avatar.png',
          avatar: 'https://example.com/old-avatar.png'
        }
      ],
      scoreParties: []
    })
  );
  var face = presented.playerPresentationById && presented.playerPresentationById['slot-a'];
  assert('A GAME presentation other=NEW', face && face.displayName === 'NEW');

  var lb = gameLeaderboard.enrichPlayerIdentity(
    {
      playerId: 'acct-other',
      userId: 'acct-other',
      name: 'OLD',
      avatar: 'https://example.com/old-avatar.png'
    },
    { gameId: 'g1' }
  );
  assert('F leaderboard 稳定 userId=NEW', lb.userId === 'acct-other' && lb.name === 'NEW');

  var frRow = gameLeaderboard.enrichPlayerIdentity(
    {
      playerId: 'fr-1003',
      name: 'FriendSnap',
      avatar: 'https://example.com/fr.png'
    },
    { gameId: 'g1' }
  );
  dir.resetFetchCallCount();
  var frNeed = [];
  dir.setFetchImpl(function (need) {
    frNeed.push(need.slice());
    return cloudMap({});
  });
  await dir.resolveAccountProfiles(['fr-1003', { playerId: 'fr-1003', userId: 'fr-1003' }]);
  assert('F playerId=fr-xxx 不查云', dir.getFetchCallCount() === 0 && frNeed.length === 0);
  assert(
    'F leaderboard 不把 fr playerId 当 account userId',
    !frRow.userId || frRow.userId.indexOf('fr-') !== 0
  );

  var hubSrc = fs.readFileSync(
    path.join(__dirname, '../miniprogram/subpackages/scoring/pages/hub/index.js'),
    'utf8'
  );
  var scoreSrc = fs.readFileSync(
    path.join(__dirname, '../miniprogram/subpackages/scoring/pages/score/index.js'),
    'utf8'
  );
  var detailSrc = fs.readFileSync(
    path.join(__dirname, '../miniprogram/subpackages/tournament/pages/detail/index.js'),
    'utf8'
  );
  assert('GAME hub batch hydrate', hubSrc.indexOf('resolveAccountProfiles') >= 0 && hubSrc.indexOf('collectFromGame') >= 0);
  assert(
    'Score 只 hydrate members',
    scoreSrc.indexOf('_collectDirectoryUserIds') >= 0 &&
      scoreSrc.indexOf('ent.members') >= 0 &&
      scoreSrc.indexOf('side.members') >= 0
  );
  assert('球队赛 detail batch hydrate', detailSrc.indexOf('resolveAccountProfiles') >= 0);

  var frozen = JSON.stringify(match.registerInfo.users);
  teeSheetManage.buildTeeSheetTabView(match, {
    playerLookup: { 'acct-other': match.registerInfo.users[0] },
    source: 'match'
  });
  assert('不改历史 snapshot', JSON.stringify(match.registerInfo.users) === frozen);

  console.log('');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
