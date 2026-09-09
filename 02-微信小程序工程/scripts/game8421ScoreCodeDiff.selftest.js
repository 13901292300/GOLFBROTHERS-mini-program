/**
 * 8421 vs 8431 唯一变量差分。
 * 运行：node scripts/game8421ScoreCodeDiff.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
var wxStore = {};
global.wx.getStorageSync = function (key) {
  return wxStore[key];
};
global.wx.setStorageSync = function (key, value) {
  wxStore[key] = value == null ? value : JSON.parse(JSON.stringify(value));
};
global.wx.showToast = function () {};

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var scoreMapUtil = require('../miniprogram/subpackages/game/utils/sideGameScoreMap.js');
var s8421 = require('../miniprogram/subpackages/game/utils/settle8421.js');
var settle4 = require('../miniprogram/subpackages/game/utils/settle8421Four.js');
var playerScoreCfg = require('../miniprogram/subpackages/game/utils/sideGame8421PlayerConfig.js');
var fs = require('fs');
var path = require('path');

var passed = 0;
var failed = 0;
var IDS = ['A', 'B', 'C', 'D'];
var MATCH = 'm-scdiff';
var staleRows = [
  { id: 'hio', value: 32 },
  { id: 'm2', value: 16 },
  { id: 'm1', value: 8 },
  { id: 'par', value: 4 },
  { id: 'p1', value: 2 },
  { id: 'p2', value: 1 },
  { id: 'p3', value: 2 }
];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function memStorage() {
  var bag = {};
  return {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  };
}

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});
var repo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'gsc_' + n;
    };
  })()
});
facade.setImplementation(repo);

function makeHost(relByPlayer) {
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var players = IDS.map(function (id) {
    return { playerId: id, displayName: id, groupId: 'g1' };
  });
  var parties = players.map(function (p) {
    return {
      partyId: p.playerId,
      partyType: 'player',
      displayName: p.displayName,
      memberPlayerIds: [p.playerId],
      groupId: 'g1'
    };
  });
  var official = {};
  players.forEach(function (p) {
    var holes = {};
    holeOrder.forEach(function (label, i) {
      var rel = 0;
      if (typeof relByPlayer === 'function') rel = relByPlayer(p.playerId, label, i);
      holes[label] = { score: 4 + rel };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: MATCH,
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: holeOrder,
      pars: pars,
      allowBigPot: true,
      players: players,
      scoreParties: parties,
      officialScoresByPartyId: official
    })
  );
}

function boot(relByPlayer) {
  var host = makeHost(relByPlayer);
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host, { skipDerivedRecover: true });
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  return host;
}

function holesOn(n) {
  return catalog.HOLES.map(function (label, i) {
    return { label: label, on: i < n };
  });
}

function basePlayers(aCode, extraA) {
  return [
    Object.assign(
      { id: 'A', scoreCode: aCode, scoreRows: null },
      extraA || {}
    ),
    { id: 'B', scoreCode: '8421', scoreRows: null },
    { id: 'C', scoreCode: '8421', scoreRows: null },
    { id: 'D', scoreCode: '8421', scoreRows: null }
  ];
}

function publishWithA(aCode, extraA) {
  boot(function () {
    return 0;
  });
  bind.ensureSetupDraft('score');
  var created = bind.addGame('score', {
    catalogId: '8421-4',
    name: 'diff',
    players: basePlayers(aCode, extraA),
    playerOrder: IDS.slice(),
    groupMode: 'fixed',
    holes: holesOn(5),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-4'), {
      catalogId: '8421-4',
      scoreCode: '8421',
      pushRule: 'tie',
      baoNeg: 'none',
      reward: 'none',
      meatEatMode: 'piece',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: 4
    })
  });
  var committed = bind.commitSetupDraft('score');
  return { id: created && created.id, ok: !!(committed && committed.ok) };
}

function saveA(id, aPlayer) {
  var row = repo.getById(id).data;
  var players = [
    Object.assign({ id: 'A' }, aPlayer),
    { id: 'B', scoreCode: '8421', scoreRows: null },
    { id: 'C', scoreCode: '8421', scoreRows: null },
    { id: 'D', scoreCode: '8421', scoreRows: null }
  ];
  return bind.persistLivePlayerScores('score', id, players, { expectedRevision: row.revision });
}

function playerAFromRepo(id) {
  var row = repo.getById(id).data;
  var inst = row.config.instance;
  var p = (inst.players || []).filter(function (x) {
    return String(x.id) === 'A';
  })[0];
  return rec.jsonClone(p);
}

function pickCfg(p) {
  if (!p) return {};
  return {
    id: p.id,
    playerId: p.playerId,
    partyId: p.partyId,
    subjectId: p.subjectId,
    scoreCode: p.scoreCode,
    scoreRows: p.scoreRows,
    scoreOverrides: p.scoreOverrides,
    deductMode: p.deductMode,
    deductWay: p.deductWay,
    deductPlusN: p.deductPlusN,
    deductDoubleN: p.deductDoubleN,
    deductCap: p.deductCap,
    deductCapN: p.deductCapN,
    teamId: p.teamId,
    sideId: p.sideId,
    selected: p.selected,
    multiplier: p.multiplier,
    meat: p.meat,
    bao: p.bao
  };
}

function diffKeys(a, b) {
  var keys = {};
  Object.keys(a || {}).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(b || {}).forEach(function (k) {
    keys[k] = true;
  });
  var out = [];
  Object.keys(keys).forEach(function (k) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  });
  return out;
}

function settleCase(id, relFn) {
  var host = makeHost(relFn);
  hostSession.setHostContext(host);
  bind.attachHost(host, { skipDerivedRecover: true });
  var game = bind.runPublished(function () {
    return bind.getGame('score', id);
  });
  game = rec.jsonClone(game);
  var scores = {};
  catalog.HOLES.slice(0, 5).forEach(function (label, i) {
    scores[label] = {};
    IDS.forEach(function (pid) {
      scores[label][pid] = relFn(pid, label, i);
    });
  });
  var pars = {};
  catalog.HOLES.forEach(function (h) {
    pars[h] = 4;
  });
  return settle4.settle(game, {
    holeOrder: catalog.HOLES.slice(),
    pars: pars,
    windOn: false,
    scores: scores
  });
}

function holeFinal(result, i) {
  var label = catalog.HOLES[i];
  var led = result.byHole[label] || {};
  return {
    A: Number(led.A) || 0,
    B: Number(led.B) || 0,
    C: Number(led.C) || 0,
    D: Number(led.D) || 0
  };
}

function allZero(h) {
  return h.A === 0 && h.B === 0 && h.C === 0 && h.D === 0;
}

function parRel() {
  return 0;
}
function plusBag(pid) {
  return { A: 3, B: 1, C: 3, D: 1 }[pid];
}

var dirty8431 = {
  scoreCode: '8431',
  scoreRows: staleRows,
  scoreOverrides: {
    deductMode: 'on',
    deductWay: 'plus-n',
    deductPlusN: '3',
    deductCap: 'none'
  },
  deductMode: 'on',
  deductWay: 'plus-n',
  deductPlusN: '3'
};

console.log('\n=== persist BASE vs CUSTOM ===');
var pub = publishWithA('8421');
assert('publish', pub.ok && pub.id);
var saveBase = saveA(pub.id, { scoreCode: '8421', scoreRows: null });
assert('BASE save', saveBase && !saveBase.__fail);
var aBasePersisted = playerAFromRepo(pub.id);
var pre = rec.jsonClone(aBasePersisted);
var prepared = rec.jsonClone(aBasePersisted);
bind.runPublished(function () {
  return bind.getGame('score', pub.id);
});
var hydBase = scoreMapUtil.hydratePlayerScore(aBasePersisted);
var mapBase = scoreMapUtil.resolveScoreMap({}, aBasePersisted, { scoreCode: '8421' });

var saveCustom = saveA(pub.id, { scoreCode: '8431', scoreRows: null });
assert('CUSTOM save', saveCustom && !saveCustom.__fail);
var aCustomPersisted = playerAFromRepo(pub.id);
var hydCustom = scoreMapUtil.hydratePlayerScore(aCustomPersisted);
var mapCustom = scoreMapUtil.resolveScoreMap({}, aCustomPersisted, { scoreCode: '8421' });

var cfgBase = pickCfg(aBasePersisted);
var cfgCustom = pickCfg(aCustomPersisted);
var changed = diffKeys(cfgBase, cfgCustom);
console.log('CHANGED_FIELDS', JSON.stringify(changed));
console.log('BASE', JSON.stringify(cfgBase));
console.log('CUSTOM', JSON.stringify(cfgCustom));
assert('除 scoreCode/scoreRows 外无 deduct override', changed.every(function (k) {
  return k === 'scoreCode' || k === 'scoreRows';
}), JSON.stringify(changed));
assert('CUSTOM scoreCode 仍 8431', aCustomPersisted.scoreCode === '8431');
assert('CUSTOM scoreRows 为 null', aCustomPersisted.scoreRows == null);
assert('hydrate 不丢 8431', hydCustom.scoreCode === '8431');
assert('runtime par 8421=4', mapBase.par === 4);
assert('runtime par 8431=4', mapCustom.par === 4);
var settleFourSrc = fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'settle8421Four.js'), 'utf8');
assert('settle8421Four 无 scoreCode===8421 硬分支', !/scoreCode\s*===\s*["']8421["']/.test(settleFourSrc));
assert('settle8421Four 走 personalScore', /personalScore/.test(settleFourSrc));

function runMatrix(name, relFn) {
  var m1 = publishWithA('8421');
  saveA(m1.id, { scoreCode: '8421', scoreRows: null });
  var r1 = settleCase(m1.id, relFn);
  var m2 = publishWithA('8431');
  saveA(m2.id, { scoreCode: '8431', scoreRows: null });
  var r2 = settleCase(m2.id, relFn);
  var m3 = publishWithA('8421');
  saveA(m3.id, Object.assign({}, dirty8431, { scoreCode: '8421' }));
  var r3 = settleCase(m3.id, relFn);
  var m4 = publishWithA('8431');
  saveA(m4.id, rec.jsonClone(dirty8431));
  var r4 = settleCase(m4.id, relFn);
  return { r1: r1, r2: r2, r3: r3, r4: r4 };
}

console.log('\n=== M1-M4 全PAR ===');
var parM = runMatrix('par', parRel);
var i;
for (i = 0; i < 5; i++) {
  assert('I1 M1 hole' + i + ' 全0', allZero(holeFinal(parM.r1, i)), JSON.stringify(holeFinal(parM.r1, i)));
  assert('I1 M2 hole' + i + ' 全0', allZero(holeFinal(parM.r2, i)), JSON.stringify(holeFinal(parM.r2, i)));
}
assert('I2 PAR mapped 相等则 winner 同', JSON.stringify(holeFinal(parM.r1, 0)) === JSON.stringify(holeFinal(parM.r2, 0)));

console.log('\n=== M1-M4 +3/+1/+3/+1 ===');
var bagM = runMatrix('bag', plusBag);
function firstDiffHole(a, b) {
  var h;
  for (h = 0; h < 5; h++) {
    var la = catalog.HOLES[h];
    if (JSON.stringify(a.byHole[la]) !== JSON.stringify(b.byHole[la])) return la;
  }
  return null;
}
console.log('firstDiff M1/M2', firstDiffHole(bagM.r1, bagM.r2));
console.log('M1 h0', JSON.stringify(holeFinal(bagM.r1, 0)));
console.log('M2 h0', JSON.stringify(holeFinal(bagM.r2, 0)));
console.log('M3 h0', JSON.stringify(holeFinal(bagM.r3, 0)));
console.log('M4 h0', JSON.stringify(holeFinal(bagM.r4, 0)));
assert('M1 +3/+1 顶洞', allZero(holeFinal(bagM.r1, 0)));
assert('M2 干净8431 +3/+1 顶洞', allZero(holeFinal(bagM.r2, 0)));
assert('M4 8431+脏deduct 仍按码表p3=0 顶洞', allZero(holeFinal(bagM.r4, 0)), JSON.stringify(holeFinal(bagM.r4, 0)));

var map8431 = scoreMapUtil.expandScoreCode('8431');
var map8421 = scoreMapUtil.expandScoreCode('8421');
console.log('expand 8421', JSON.stringify(map8421));
console.log('expand 8431', JSON.stringify(map8431));
var pScorePar8421 = s8421.personalScore(0, map8421, s8421.deductCfg({}, { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }), 4);
var pScorePar8431 = s8421.personalScore(0, map8431, s8421.deductCfg({}, { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }), 4);
assert('PAR personalScore 8421=4', pScorePar8421 === 4);
assert('PAR personalScore 8431=4', pScorePar8431 === 4);
var p3_8421 = s8421.personalScoreDebug(3, map8421, s8421.deductCfg({}, { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }), 4);
var p3_8431 = s8421.personalScoreDebug(3, map8431, s8421.deductCfg({}, { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }), 4);
console.log('plus3 debug 8421', JSON.stringify(p3_8421));
console.log('plus3 debug 8431', JSON.stringify(p3_8431));
assert('usedDeduct 8421 +3 为 false（码表p3=0）', p3_8421.usedDeduct === false);
assert('usedDeduct 8431 +3 为 false', p3_8431.usedDeduct === false);

var p1_8421 = s8421.personalScore(1, map8421, s8421.deductCfg({}, { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }), 4);
var p1_8431 = s8421.personalScore(1, map8431, s8421.deductCfg({}, { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }), 4);
console.log('plus1 mapped 8421', p1_8421, '8431', p1_8431);

assert(
  'I3 PAR 状态机相同',
  JSON.stringify(parM.r1.topHoleStates) === JSON.stringify(parM.r2.topHoleStates)
);

var applySrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'config', 'index.js'),
  'utf8'
);
assert(
  'applyScoreConfig 不再用 || 吞掉空 override',
  applySrc.indexOf('hasOwnProperty.call(hit, "scoreOverrides")') >= 0
);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
