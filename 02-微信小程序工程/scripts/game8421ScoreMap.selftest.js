/**
 * 单挂8421（catalogId=8421-2）：选手级快捷码，不含实例完整对应表。
 * 运行：node scripts/game8421ScoreMap.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () { return null; };
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function (opt) {
  global.__lastToast = opt && opt.title;
};

var fs = require('fs');
var path = require('path');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settle8421 = require('../miniprogram/subpackages/game/utils/settle8421.js');
var scoreMapUtil = require('../miniprogram/subpackages/game/utils/sideGameScoreMap.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var rankMod = require('../miniprogram/subpackages/game/utils/rankMarkProjection.js');

var passed = 0;
var failed = 0;
var root = path.join(__dirname, '..');

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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
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
      return 'g8421_' + n;
    };
  })()
});
facade.setImplementation(repo);

function makeHost(scoreA, scoreB) {
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var players = [
    { playerId: 'pA', displayName: '甲', groupId: 'g1' },
    { playerId: 'pB', displayName: '乙', groupId: 'g1' }
  ];
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
  players.forEach(function (p, idx) {
    var holes = {};
    holeOrder.forEach(function (label) {
      holes[label] = { score: idx === 0 ? scoreA : scoreB };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-8421page',
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

function installGame(scoreA, scoreB, extra) {
  extra = extra || {};
  var host = makeHost(scoreA, scoreB);
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  var players = extra.players || [
    { id: 'pA', scoreCode: extra.codeA || '8421' },
    { id: 'pB', scoreCode: extra.codeB || '8421' }
  ];
  var pairings = extra.pairings || [{ id: 'pA|pB', leftId: 'pA', rightId: 'pB', on: true }];
  var payload = {
    catalogId: '8421-2',
    name: extra.name || '单挂8421',
    players: players,
    pairings: pairings,
    holes: catalog.HOLES.map(function (label, i) {
      return { label: label, on: extra.onlyFirst ? i === 0 : true };
    }),
    holeOrder: catalog.HOLES.slice(),
    multiplier: extra.k == null ? 1 : extra.k,
    defaultScoreCode: '8421',
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-2'), {
      catalogId: '8421-2',
      scoreCode: '8421',
      pushRule: 'none',
      deductMode: extra.deductMode || 'on'
    })
  };
  var created = bind.addGame('score', payload);
  var committed = bind.commitSetupDraft('score');
  return { created: created, committed: committed, host: host };
}

function cell(board, hi, pi) {
  var holeRow = board.holes && board.holes[hi];
  return holeRow && holeRow.cells && holeRow.cells[pi];
}

function playerOf(game, id) {
  return ((game && game.players) || []).find(function (p) {
    return String(p.id) === String(id);
  });
}

var configWxml = read('miniprogram/subpackages/game/pages/config/index.wxml');
var scoreWxml = read('miniprogram/subpackages/game/pages/score-config/index.wxml');
var configJs = read('miniprogram/subpackages/game/pages/config/index.js');
var scoreJs = read('miniprogram/subpackages/game/pages/score-config/index.js');

assert(
  '1 点击头像可见原快捷选项',
  configWxml.indexOf('wx:for="{{scorePresets}}"') >= 0 &&
    scoreWxml.indexOf('wx:for="{{scorePresets}}"') >= 0 &&
    catalog.SCORE_PRESETS.indexOf('6421') >= 0 &&
    catalog.SCORE_PRESETS.indexOf('8431') >= 0 &&
    catalog.SCORE_PRESETS.indexOf('8532') >= 0 &&
    configJs.indexOf('openScore') >= 0
);
assert(
  '2 实例页不再展示完整对应表',
  configWxml.indexOf('wx:for="{{scoreRows}}"') < 0 &&
    scoreWxml.indexOf('wx:for="{{scoreRows}}"') < 0 &&
    configWxml.indexOf('完整成绩') < 0 &&
    scoreWxml.indexOf('完整成绩') < 0
);
assert(
  '3 实例页不再展示老鹰/HIO 配置',
  configWxml.indexOf('信天翁') < 0 &&
    scoreWxml.indexOf('信天翁') < 0 &&
    !/data-id="\{\{item.id\}\}"[^]*onScoreRow/.test(configWxml) &&
    configJs.indexOf('onScoreRow') < 0 &&
    scoreJs.indexOf('onScoreRow') < 0
);

function parseEq(code, expect) {
  var m = scoreMapUtil.expandScoreCode(code);
  return (
    m &&
    m.m1 === expect.m1 &&
    m.par === expect.par &&
    m.p1 === expect.p1 &&
    m.p2 === expect.p2 &&
    (expect.p3 == null || m.p3 === expect.p3)
  );
}

assert('4 6421 → 小鸟6 PAR4 +1=2 +2=1', parseEq('6421', { m1: 6, par: 4, p1: 2, p2: 1, p3: 0 }));
assert('5 8431 → 8/4/3/1', parseEq('8431', { m1: 8, par: 4, p1: 3, p2: 1, p3: 0 }));
assert('6 8532 → 8/5/3/2', parseEq('8532', { m1: 8, par: 5, p1: 3, p2: 2, p3: 0 }));

var five = scoreMapUtil.expandScoreCode('84321');
assert('7 五位第5位映射 p3', five && five.p3 === 1 && five.m1 === 8 && five.par === 4 && five.p1 === 3 && five.p2 === 2);
assert('8 五位第5位绝不映射老鹰', five && five.m2 === 16 && five.hio === 32 && five.p3 === 1);

var g = installGame(5, 5, { codeA: '8431', codeB: '6421', k: 1, onlyFirst: true });
assert('commit ok', g.created && !g.created.__fail && g.committed && g.committed.ok);
assert('身份 catalogId=8421-2', g.created.catalogId === '8421-2');

var loaded = bind.getGame('score', g.created.id);
assert(
  '9 两位选手不同快捷码',
  playerOf(loaded, 'pA').scoreCode === '8431' && playerOf(loaded, 'pB').scoreCode === '6421'
);

var mapA = settle8421.scoreMapFor(playerOf(loaded, 'pA'), loaded.ruleSnapshot, loaded);
var mapB = settle8421.scoreMapFor(playerOf(loaded, 'pB'), loaded.ruleSnapshot, loaded);
assert(
  '15 结算按选手级配置：A+1=3 B+1=2',
  mapA.p1 === 3 && mapB.p1 === 2 && mapA.m1 === 8 && mapB.m1 === 6
);

var board = bind.listBoard('score', g.created.id);
assert(
  '两人 +1 分差 3-2=1',
  cell(board, 0, 0) && cell(board, 0, 0).raw === 1 && cell(board, 0, 1).raw === -1
);

var swapped = installGame(5, 5, {
  name: '交换左右',
  codeA: '8431',
  codeB: '6421',
  onlyFirst: true,
  pairings: [{ id: 'pB|pA', leftId: 'pB', rightId: 'pA', on: true }]
});
var swappedGame = bind.getGame('score', swapped.created.id);
assert(
  '10 交换左右后快捷码跟随 playerId',
  playerOf(swappedGame, 'pA').scoreCode === '8431' && playerOf(swappedGame, 'pB').scoreCode === '6421'
);
var swapBoard = bind.listBoard('score', swapped.created.id);
assert(
  '10b 交换后仍按人计分（A=8431 仍用 +1=3）',
  cell(swapBoard, 0, 0) && cell(swapBoard, 0, 0).raw === 1 && cell(swapBoard, 0, 1).raw === -1
);

hostSession.setHostContext(g.host);
bind.attachHost(g.host);
bind.discardSetupDraft();
var reloaded = bind.getGame('score', g.created.id);
assert(
  '11 保存退出重进快捷码保持',
  playerOf(reloaded, 'pA').scoreCode === '8431' && playerOf(reloaded, 'pB').scoreCode === '6421'
);

var four = scoreMapUtil.expandScoreCode('8421');
assert('12 四位旧数据 p3=0 且不发明第5位', four && four.p3 === 0 && four.m2 === 16 && four.hio === 32);

var zeroMap = scoreMapUtil.expandScoreCode('8021');
assert('13 值0不被默认覆盖', zeroMap && zeroMap.par === 0 && zeroMap.m1 === 8);

var row = repo.getById(g.created.id).data;
var beforeCodes = JSON.stringify(
  (row.config.instance.players || []).map(function (p) {
    return p.id + ':' + p.scoreCode;
  })
);
rankMod.refreshGameResults(row, {
  pars: g.host.pars,
  holeOrder: g.host.holeOrder,
  officialScoresByPartyId: g.host.officialScoresByPartyId
});
assert(
  'rankMark 传递选手快捷码且不串改',
  JSON.stringify(
    (row.config.instance.players || []).map(function (p) {
      return p.id + ':' + p.scoreCode;
    })
  ) === beforeCodes
);

var live = installGame(4, 4, { codeA: '8431', codeB: '6421', k: 1, onlyFirst: true, name: '改码重算' });
var liveBoard = bind.listBoard('score', live.created.id);
assert('改码前 PAR 4-4=0', cell(liveBoard, 0, 0) && cell(liveBoard, 0, 0).raw === 0);
var liveRow = repo.getById(live.created.id);
liveRow.data.config.instance.players[0].scoreCode = '8532';
repo.update(live.created.id, liveRow.data.revision, {
  config: liveRow.data.config,
  resultSnapshot: { byHole: { A1: { __pot__: 0, pA: 9, pB: -9 } }, catalogId: '8421-2' }
});
bind.discardSetupDraft();
hostSession.setHostContext(live.host);
bind.attachHost(live.host);
var afterChange = bind.getGame('score', live.created.id);
var boardHist = bind.listPublishedBoard('score', live.created.id);
assert('14a 修改后 A 为 8532', playerOf(afterChange, 'pA').scoreCode === '8532');
assert(
  '14 修改快捷码后快照失效并重算（PAR A5 vs B4 → ±1）',
  cell(boardHist, 0, 0) && cell(boardHist, 0, 0).raw === 1 && cell(boardHist, 0, 1).raw === -1
);

var leftoverRows = [
  { id: 'hio', value: '50' },
  { id: 'm2', value: '20' },
  { id: 'm1', value: '9' },
  { id: 'par', value: '5' },
  { id: 'p1', value: '3' },
  { id: 'p2', value: '2' },
  { id: 'p3', value: '1' }
];
var convFail = scoreMapUtil.scoreCodeFromRows(leftoverRows);
assert('无法无损还原完整表（老鹰≠m1×2）', convFail.ok === false);

var hydKeep = scoreMapUtil.hydratePlayerScore({ scoreRows: leftoverRows });
assert('无法还原时不发明快捷码', hydKeep.lossless === false && !hydKeep.usedCode);

var hydWin = scoreMapUtil.hydratePlayerScore({ scoreCode: '6421', scoreRows: leftoverRows });
assert('完整表不得覆盖已有 scoreCode', hydWin.scoreCode === '6421' && hydWin.usedCode === true);
assert(
  'scoreCode 优先于完整表',
  scoreMapUtil.resolveScoreMap({}, { scoreCode: '6421', scoreRows: leftoverRows }, {}).m1 === 6
);

var losslessRows = [
  { id: 'hio', value: '24' },
  { id: 'm2', value: '12' },
  { id: 'm1', value: '6' },
  { id: 'par', value: '4' },
  { id: 'p1', value: '2' },
  { id: 'p2', value: '1' },
  { id: 'p3', value: '0' }
];
assert('无损还原 6421', scoreMapUtil.scoreCodeFromRows(losslessRows).code === '6421');

var fiveRows = [
  { id: 'm1', value: '8' },
  { id: 'par', value: '4' },
  { id: 'p1', value: '3' },
  { id: 'p2', value: '2' },
  { id: 'p3', value: '1' },
  { id: 'm2', value: '16' },
  { id: 'hio', value: '32' }
];
assert('无损还原 84321', scoreMapUtil.scoreCodeFromRows(fiveRows).code === '84321');

assert('只接受4/5位', !scoreMapUtil.isValidScoreCode('842') && !scoreMapUtil.isValidScoreCode('843210'));
assert('expand 拒绝非4/5位', scoreMapUtil.expandScoreCode('842') == null);

var presetsOk = ['6321', '6421', '8421', '8431', '8432', '8532', '85321'].every(function (c) {
  return catalog.SCORE_PRESETS.indexOf(c) >= 0;
});
assert('原快捷选项集合保持', presetsOk);

console.log('PARSE ' + JSON.stringify({
  '6421': scoreMapUtil.expandScoreCode('6421'),
  '8431': scoreMapUtil.expandScoreCode('8431'),
  '8532': scoreMapUtil.expandScoreCode('8532'),
  '84321': scoreMapUtil.expandScoreCode('84321'),
  '8421': scoreMapUtil.expandScoreCode('8421')
}));
console.log('IDENTITY ' + JSON.stringify({
  page: 'pages/config + score-config',
  catalogId: '8421-2',
  gameType: '单挂8421',
  instanceType: 'players[].scoreCode',
  settle: 'settle8421.js'
}));
console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
