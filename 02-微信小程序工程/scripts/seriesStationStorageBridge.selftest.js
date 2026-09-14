/**
 * Series station canonical storage + 安全 legacy 恢复
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStationStorageBridge.selftest.js
 */

var path = require('path');
var fs = require('fs');

var bags = {};
global.__TEAM_CLUB_REPO_MODE = 'cloud';
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
identity.setTestSession({ userId: 'u-bridge-test', displayName: 'bridge' });

var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var gate = require(path.join(utilsDir, 'seriesStationManageGate.js'));
var serviceSrc = fs.readFileSync(path.join(utilsDir, 'teamClub', 'service.js'), 'utf8');
var storeSrc = fs.readFileSync(path.join(utilsDir, 'teamMatchStore.js'), 'utf8');
var gateSrc = fs.readFileSync(path.join(utilsDir, 'seriesStationManageGate.js'), 'utf8');

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

function resetBags() {
  bags = {};
}

function freeze(o) {
  return JSON.parse(JSON.stringify(o));
}

var LEGACY_KEY = teamMatchStore.STORAGE_KEY;
var CANON_KEY = LEGACY_KEY + '__u-bridge-test';

function listOf(key) {
  var raw = bags[key];
  return Array.isArray(raw) ? raw : [];
}

function hasMatch(key, matchId) {
  var list = listOf(key);
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].matchId) === String(matchId)) return true;
  }
  return false;
}

function putLegacy(match) {
  var list = listOf(LEGACY_KEY).filter(function (item) {
    return !(item && item.matchId === match.matchId);
  });
  bags[LEGACY_KEY] = [freeze(match)].concat(list);
}

function ctx(over) {
  return Object.assign(
    {
      managed: true,
      seriesId: 'series-bridge',
      roundId: 'round-bridge-1',
      publishToken: 'tok-bridge',
      seriesParticipantMode: 'individual',
      registrationAuthority: 'series',
      seriesNameSnapshot: 'Bridge Series',
      seriesSubtitleSnapshot: ''
    },
    over || {}
  );
}

function makeStation(over) {
  return Object.assign(
    {
      matchId: 'team-match-bridge-1',
      matchType: 'team-internal',
      roundName: '第一轮',
      gameMode: '个人比杆赛',
      status: 'registering',
      groups: [{ groupId: 'g-old', players: [{ userId: 'p1' }] }],
      scoreData: {},
      seriesContext: ctx()
    },
    over || {}
  );
}

function expectedFrom(match) {
  var c = match.seriesContext || {};
  return {
    matchId: match.matchId,
    seriesId: c.seriesId,
    roundId: c.roundId,
    publishToken: c.publishToken
  };
}

function makeSeriesFor(match) {
  var c = match.seriesContext || {};
  return {
    seriesId: c.seriesId,
    publishToken: c.publishToken,
    rounds: [{ roundId: c.roundId, matchId: match.matchId }]
  };
}

function indexGetter(match) {
  var c = match.seriesContext || {};
  return function () {
    return {
      matchId: match.matchId,
      seriesId: c.seriesId,
      roundId: c.roundId
    };
  };
}

resetBags();

assert(
  'saveMatchChecked 不再写固定 STORAGE_KEY',
  storeSrc.indexOf('wx.setStorageSync(STORAGE_KEY') < 0 &&
    /function saveMatchChecked[\s\S]*_writeAll\(next\)/.test(storeSrc)
);
assert(
  'cloud pull 调用 preserveLocalSeriesContextOnCloudPull',
  serviceSrc.indexOf('preserveLocalSeriesContextOnCloudPull') >= 0
);
assert(
  'manage gate 仍 not_managed',
  gateSrc.indexOf("failGate('not_managed'") >= 0 && gateSrc.indexOf('ctx.managed !== true') >= 0
);

// ---------- CASE 1 + 2 publish → canonical ----------
resetBags();
var published = makeStation({ matchId: 'team-match-pub-1' });
var saveRes = teamMatchStore.saveMatchChecked(published);
var got1 = teamMatchStore.getMatchById('team-match-pub-1');
assert(
  'CASE1 saveMatchChecked ok + getMatchById HIT managed',
  saveRes.ok === true &&
    !!got1 &&
    got1.seriesContext &&
    got1.seriesContext.managed === true,
  saveRes.reason
);
assert(
  'CASE1 写入 cacheKey canonical',
  hasMatch(CANON_KEY, 'team-match-pub-1') === true
);
assert(
  'CASE2 固定桶不再新增该 match',
  hasMatch(LEGACY_KEY, 'team-match-pub-1') === false
);

// ---------- CASE 3 canonical MISS + ownership PASS ----------
resetBags();
var legacyOk = makeStation({
  matchId: 'team-match-legacy-ok',
  groups: [{ groupId: 'g-legacy', players: [{ userId: 'lp' }] }]
});
putLegacy(legacyOk);
assert('CASE3 准备：canonical MISS', teamMatchStore.getMatchById(legacyOk.matchId) == null);
var adopt3 = teamMatchStore.adoptLegacySeriesStationIfSafe(expectedFrom(legacyOk));
var got3 = teamMatchStore.getMatchById(legacyOk.matchId);
assert(
  'CASE3 单 match 恢复到 canonical',
  adopt3.ok === true &&
    adopt3.adopted === true &&
    adopt3.reason === 'copied_legacy_match' &&
    !!got3 &&
    got3.seriesContext.managed === true &&
    got3.groups[0].groupId === 'g-legacy'
);
assert('CASE3 getMatchById HIT', !!got3 && got3.matchId === legacyOk.matchId);

var gate3 = gate.verifyManagedStationForManage({
  series: makeSeriesFor(legacyOk),
  roundId: legacyOk.seriesContext.roundId,
  getMatchById: teamMatchStore.getMatchById,
  getIndexByMatchId: indexGetter(legacyOk)
});
assert('CASE3 manage gate PASS（未放宽，真实 HIT）', gate3.ok === true);

// ---------- CASE 4–7 ownership fail ----------
function expectNoAdopt(name, match) {
  resetBags();
  putLegacy(match);
  var res = teamMatchStore.adoptLegacySeriesStationIfSafe({
    matchId: 'team-match-deny',
    seriesId: 'series-bridge',
    roundId: 'round-bridge-1',
    publishToken: 'tok-bridge'
  });
  var again = teamMatchStore.getMatchById('team-match-deny');
  assert(name + ' 不恢复', res.adopted !== true && again == null, res.reason);
}

expectNoAdopt(
  'CASE4 seriesId 不符',
  makeStation({
    matchId: 'team-match-deny',
    seriesContext: ctx({ seriesId: 'series-other' })
  })
);
expectNoAdopt(
  'CASE5 roundId 不符',
  makeStation({
    matchId: 'team-match-deny',
    seriesContext: ctx({ roundId: 'round-other' })
  })
);
expectNoAdopt(
  'CASE6 token 不符',
  makeStation({
    matchId: 'team-match-deny',
    seriesContext: ctx({ publishToken: 'tok-other' })
  })
);
expectNoAdopt(
  'CASE7 managed!==true',
  makeStation({
    matchId: 'team-match-deny',
    seriesContext: ctx({ managed: false })
  })
);

var unmanagedGateMatch = makeStation({
  matchId: 'team-match-unmanaged-gate',
  seriesContext: { seriesId: 'series-bridge', roundId: 'round-bridge-1', publishToken: 'tok-bridge' }
});
var manageFail = gate.verifyManagedStationForManage({
  series: {
    seriesId: 'series-bridge',
    publishToken: 'tok-bridge',
    rounds: [{ roundId: 'round-bridge-1', matchId: unmanagedGateMatch.matchId }]
  },
  roundId: 'round-bridge-1',
  getMatchById: function () {
    return unmanagedGateMatch;
  },
  getIndexByMatchId: function () {
    return {
      matchId: unmanagedGateMatch.matchId,
      seriesId: 'series-bridge',
      roundId: 'round-bridge-1'
    };
  }
});
assert(
  'verifyManagedStationForManage managed!==true 仍 FAIL',
  manageFail.ok === false && manageFail.reason === 'not_managed'
);

// ---------- CASE 8 canonical complete wins ----------
resetBags();
var canonComplete = makeStation({
  matchId: 'team-match-keep',
  groups: [{ groupId: 'g-canon', players: [{ userId: 'newer' }] }],
  status: 'ongoing'
});
teamMatchStore.saveMatch(canonComplete, { cacheOnly: true });
putLegacy(
  makeStation({
    matchId: 'team-match-keep',
    groups: [{ groupId: 'g-legacy-stale', players: [] }],
    status: 'registering',
    seriesContext: ctx({ seriesNameSnapshot: 'STALE' })
  })
);
var adopt8 = teamMatchStore.adoptLegacySeriesStationIfSafe(expectedFrom(canonComplete));
var got8 = teamMatchStore.getMatchById('team-match-keep');
assert(
  'CASE8 canonical 完整 context 不碰 legacy',
  adopt8.adopted === false &&
    adopt8.reason === 'canonical_complete' &&
    got8.groups[0].groupId === 'g-canon' &&
    got8.status === 'ongoing' &&
    got8.seriesContext.seriesNameSnapshot === 'Bridge Series'
);

// ---------- CASE 9 context-only merge ----------
resetBags();
var canonBare = makeStation({
  matchId: 'team-match-merge',
  groups: [{ groupId: 'g-newer', players: [{ userId: 'live' }] }],
  scoreData: { H1: 4 },
  status: 'ongoing',
  finishedAt: 0,
  updatedAt: 999
});
delete canonBare.seriesContext;
teamMatchStore.saveMatch(canonBare, { cacheOnly: true });
putLegacy(
  makeStation({
    matchId: 'team-match-merge',
    groups: [{ groupId: 'g-old-legacy', players: [] }],
    scoreData: { H1: 1 },
    status: 'registering',
    seriesContext: ctx()
  })
);
var adopt9 = teamMatchStore.adoptLegacySeriesStationIfSafe({
  matchId: 'team-match-merge',
  seriesId: 'series-bridge',
  roundId: 'round-bridge-1',
  publishToken: 'tok-bridge'
});
var got9 = teamMatchStore.getMatchById('team-match-merge');
assert(
  'CASE9 只 merge seriesContext',
  adopt9.ok === true &&
    adopt9.reason === 'merged_series_context' &&
    got9.seriesContext &&
    got9.seriesContext.managed === true &&
    got9.groups[0].groupId === 'g-newer' &&
    got9.scoreData.H1 === 4 &&
    got9.status === 'ongoing'
);

// ---------- CASE 10 / 11 cloud pull ----------
resetBags();
var localManaged = makeStation({
  matchId: 'team-match-pull',
  groups: [{ groupId: 'g-local' }]
});
teamMatchStore.saveMatch(localManaged, { cacheOnly: true });
var cloudNoCtx = {
  matchId: 'team-match-pull',
  matchType: 'team-internal',
  status: 'ongoing',
  groups: [{ groupId: 'g-cloud' }]
};
var merged10 = teamMatchStore.preserveLocalSeriesContextOnCloudPull(
  cloudNoCtx,
  teamMatchStore.getMatchById('team-match-pull')
);
teamMatchStore.saveMatch(merged10, { cacheOnly: true });
var after10 = teamMatchStore.getMatchById('team-match-pull');
assert(
  'CASE10 cloud 无 context → 保留本地 managed context',
  after10.seriesContext &&
    after10.seriesContext.managed === true &&
    after10.seriesContext.seriesId === 'series-bridge' &&
    after10.groups[0].groupId === 'g-cloud'
);

resetBags();
var localOld = makeStation({
  matchId: 'team-match-pull2',
  seriesContext: ctx({ publishToken: 'tok-local-old' })
});
teamMatchStore.saveMatch(localOld, { cacheOnly: true });
var cloudHasCtx = makeStation({
  matchId: 'team-match-pull2',
  seriesContext: ctx({ publishToken: 'tok-cloud-new', seriesNameSnapshot: 'Cloud Name' })
});
var merged11 = teamMatchStore.preserveLocalSeriesContextOnCloudPull(
  cloudHasCtx,
  teamMatchStore.getMatchById('team-match-pull2')
);
teamMatchStore.saveMatch(merged11, { cacheOnly: true });
var after11 = teamMatchStore.getMatchById('team-match-pull2');
assert(
  'CASE11 cloud 有 context → 使用 cloud',
  after11.seriesContext.publishToken === 'tok-cloud-new' &&
    after11.seriesContext.seriesNameSnapshot === 'Cloud Name'
);

// ---------- CASE 12 ordinary team match ----------
resetBags();
var ordinary = {
  matchId: 'team-match-ordinary',
  matchType: 'team-internal',
  status: 'registering',
  teamName: '普通队内赛',
  groups: []
};
teamMatchStore.saveMatch(ordinary, { cacheOnly: true });
var got12 = teamMatchStore.getMatchById('team-match-ordinary');
var adopt12 = teamMatchStore.adoptLegacySeriesStationIfSafe({
  matchId: 'team-match-ordinary',
  seriesId: 'series-bridge',
  roundId: 'round-bridge-1',
  publishToken: 'tok-bridge'
});
assert(
  'CASE12 普通非 series match 行为不变',
  !!got12 &&
    !got12.seriesContext &&
    adopt12.adopted !== true &&
    teamMatchStore.listMatches().some(function (m) {
      return m.matchId === 'team-match-ordinary';
    })
);

console.log('');
console.log('seriesStationStorageBridge  ' + passed + '/' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
