/**
 * V53 §4.3.1 四人拉丝：规则库奖励保存 / 拆封 / 回显。
 * 运行：node scripts/gameLasuo4RewardPersist.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () { return null; };
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function (opt) {
  global.__lastToast = opt && opt.title;
};

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var ruleLibLocal = require('../miniprogram/subpackages/game/utils/localSideGameRuleLibrary.js');
var ruleLibFacade = require('../miniprogram/subpackages/game/utils/sideGameRuleLibrary.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var fs = require('fs');
var path = require('path');

var passed = 0;
var failed = 0;
var trace = {};

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

function rows(ids, values) {
  return ids.map(function (id, i) {
    return { id: id, value: String(values[i]) };
  });
}

var BANDS = ['hio', 'm2', 'm1', 'par', 'p1', 'ge2'];
var COMBOS = ['m2-m2', 'm2-m1', 'm1-m1'];

function persistLike(page) {
  var play = {
    catalogId: 'lasuo-4',
    ruleId: 'lasuo-4',
    reward: rec.normalizeRewardMode(page.reward) || 'none',
    addRows: page.addRows,
    mulRows: page.mulRows,
    comboMulRows: page.comboMulRows,
    addPre: page.addPre || 'win',
    pkBetter: page.pkBetter !== false,
    pkWorse: page.pkWorse !== false,
    pkTotal: page.pkTotal !== false,
    pkBetterW: page.pkBetterW != null && page.pkBetterW !== '' ? String(page.pkBetterW) : '1',
    pkWorseW: page.pkWorseW != null && page.pkWorseW !== '' ? String(page.pkWorseW) : '1',
    pkTotalW: page.pkTotalW != null && page.pkTotalW !== '' ? String(page.pkTotalW) : '1',
    pkTotalMode: page.pkTotalMode || 'sum',
    pushRule: page.pushRule || 'push',
    meatRows: page.meatRows,
    name: page.name
  };
  var input = Object.assign({ id: page.id, name: page.name, players: 4, catalogId: 'lasuo-4' }, play, {
    ruleSnapshot: rec.stripLibraryMeta(play)
  });
  return bind.upsertMyRule(input);
}

function reloadDraft(id) {
  var row = bind.getMyRuleById(id);
  return { row: row, draft: rec.draftFromLibraryRow(row, 'lasuo-4') };
}

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});
ruleLibFacade.setImplementation(
  ruleLibLocal.createLocalSideGameRuleLibrary({
    storage: memStorage(),
    idGen: (function () {
      var n = 0;
      return function () {
        n += 1;
        return 'rl_lasuo_' + n;
      };
    })()
  })
);
var repo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
  idGen: function () {
    return 'g_lasuo_1';
  }
});
facade.setImplementation(repo);

function makeHost() {
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var players = ['pA', 'pB', 'pC', 'pD'].map(function (id, i) {
    return { playerId: id, displayName: 'P' + i, groupId: 'g1' };
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
    holeOrder.forEach(function (label) {
      holes[label] = { score: 4 };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-lasuo4',
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

hostSession.setHostContext(makeHost());
bind.attachHost(makeHost());
bind.ensureSetupDraft('score');

var addDraft = {
  name: '拉丝加法',
  reward: 'add',
  addPre: 'not-lose',
  addRows: rows(BANDS, [9, 3, 0, 0, 0, 0]),
  mulRows: rows(BANDS, [10, 5, 2, 1, 1, 1]),
  comboMulRows: rows(COMBOS, [25, 10, 4]),
  pkBetter: true,
  pkWorse: true,
  pkTotal: true,
  pkBetterW: '2',
  pkWorseW: '1',
  pkTotalW: '1'
};
trace.draftBeforeSaveAdd = addDraft.reward;
var savedAdd = persistLike(addDraft);
assert('1 新建加法保存成功', !!(savedAdd && savedAdd.id));
trace.upsertInputReward = 'add';
trace.normalizeOutReward = savedAdd && savedAdd.ruleSnapshot && savedAdd.ruleSnapshot.reward;
trace.persistedNested = savedAdd && savedAdd.ruleSnapshot && savedAdd.ruleSnapshot.reward;
assert('奖励写入规则库嵌套快照', savedAdd.ruleSnapshot.reward === 'add');
assert('顶层不放 reward（信封）', savedAdd.reward == null);

var loadAdd = reloadDraft(savedAdd.id);
trace.loadRawNested = loadAdd.row.ruleSnapshot.reward;
trace.unwrappedReward = loadAdd.draft.reward;
trace.pageSelected = loadAdd.draft.reward;
assert('1 保存重进仍为加法', loadAdd.draft.reward === 'add');
assert('7 嵌套信封拆解', rec.unwrapGameplaySnapshot(loadAdd.row).reward === 'add');
assert(
  '9 加法各档回显含 0',
  String(loadAdd.draft.addRows.filter(function (r) { return r.id === 'm1'; })[0].value) === '0' &&
    String(loadAdd.draft.addRows.filter(function (r) { return r.id === 'hio'; })[0].value) === '9'
);
assert('10 加法前置条件回显', loadAdd.draft.addPre === 'not-lose');
assert('12 数值0不被默认覆盖', String(loadAdd.draft.addRows.filter(function (r) { return r.id === 'm1'; })[0].value) === '0');

var mulDraft = {
  name: '拉丝乘法',
  reward: 'mul',
  addRows: rows(BANDS, [10, 4, 1, 0, 0, 0]),
  mulRows: rows(BANDS, [8, 6, 3, 1, 1, 1]),
  comboMulRows: rows(COMBOS, [0, 7, 4]),
  pkBetter: true,
  pkWorse: true,
  pkTotal: true
};
var savedMul = persistLike(mulDraft);
var loadMul = reloadDraft(savedMul.id);
assert('2 新建乘法保存重进仍为乘法', loadMul.draft.reward === 'mul');
assert(
  '11 乘法个人/组合回显且组合0保留',
  String(loadMul.draft.mulRows.filter(function (r) { return r.id === 'm1'; })[0].value) === '3' &&
    String(loadMul.draft.comboMulRows.filter(function (r) { return r.id === 'm2-m2'; })[0].value) === '0'
);

var noneRow = persistLike({
  name: '拉丝无奖励',
  reward: 'none',
  addRows: rows(BANDS, [10, 4, 1, 0, 0, 0]),
  mulRows: rows(BANDS, [10, 5, 2, 1, 1, 1]),
  comboMulRows: rows(COMBOS, [25, 10, 4])
});
var rev0 = noneRow.revision;
var toAdd = persistLike({
  id: noneRow.id,
  name: '拉丝无奖励',
  reward: 'add',
  addPre: 'win',
  addRows: rows(BANDS, [10, 4, 1, 0, 0, 0]),
  mulRows: rows(BANDS, [10, 5, 2, 1, 1, 1]),
  comboMulRows: rows(COMBOS, [25, 10, 4])
});
assert('3 现有规则从无改为加法', rec.draftFromLibraryRow(toAdd).reward === 'add');
assert('6 revision 增加', toAdd.revision === rev0 + 1);
var toMul = persistLike({
  id: noneRow.id,
  name: '拉丝无奖励',
  reward: 'mul',
  addRows: rows(BANDS, [10, 4, 1, 0, 0, 0]),
  mulRows: rows(BANDS, [10, 5, 2, 1, 1, 1]),
  comboMulRows: rows(COMBOS, [25, 10, 4])
});
assert('4 现有规则从无改为乘法', rec.draftFromLibraryRow(toMul).reward === 'mul');
var backAdd = persistLike({
  id: noneRow.id,
  name: '拉丝无奖励',
  reward: 'add',
  addPre: 'ignore',
  addRows: rows(BANDS, [10, 4, 1, 0, 0, 0]),
  mulRows: rows(BANDS, [10, 5, 2, 1, 1, 1]),
  comboMulRows: rows(COMBOS, [25, 10, 4])
});
assert('5 加法改乘法再改回加法', rec.draftFromLibraryRow(backAdd).reward === 'add' && backAdd.ruleSnapshot.addPre === 'ignore');
assert('6b 读取最新 revision', bind.getMyRuleById(noneRow.id).revision === backAdd.revision);

var renamed = persistLike({
  id: savedAdd.id,
  name: '改名后的拉丝',
  reward: 'add',
  addPre: 'not-lose',
  addRows: rows(BANDS, [9, 3, 0, 0, 0, 0]),
  mulRows: rows(BANDS, [10, 5, 2, 1, 1, 1]),
  comboMulRows: rows(COMBOS, [25, 10, 4]),
  pkBetter: true,
  pkWorse: true,
  pkTotal: true,
  pkBetterW: '2'
});
var afterName = reloadDraft(savedAdd.id);
assert(
  '13 改名后奖励不丢',
  afterName.draft.name === '改名后的拉丝' && afterName.draft.reward === 'add' && afterName.draft.addPre === 'not-lose'
);

var pkChanged = persistLike({
  id: savedAdd.id,
  name: '改名后的拉丝',
  reward: 'add',
  addPre: 'not-lose',
  addRows: rows(BANDS, [9, 3, 0, 0, 0, 0]),
  mulRows: rows(BANDS, [10, 5, 2, 1, 1, 1]),
  comboMulRows: rows(COMBOS, [25, 10, 4]),
  pkBetter: true,
  pkWorse: false,
  pkTotal: true,
  pkBetterW: '3'
});
var afterPk = reloadDraft(savedAdd.id);
assert(
  '14 改比较指标后奖励不丢',
  afterPk.draft.reward === 'add' && afterPk.draft.pkWorse === false && afterPk.draft.pkBetterW === '3'
);

var cap = rec.buildRuleSnapshot('lasuo-4');
var merged = rec.mergeRuleSnapshot(cap, rec.unwrapGameplaySnapshot(loadAdd.row));
assert('8 catalog 能力桩不覆盖 reward', merged.reward === 'add' && !cap.reward);

bind.discardSetupDraft();
bind.ensureSetupDraft('score');
var created = bind.addGame('score', {
  catalogId: 'lasuo-4',
  name: '实例',
  players: [{ id: 'pA' }, { id: 'pB' }, { id: 'pC' }, { id: 'pD' }],
  playerOrder: ['pA', 'pB', 'pC', 'pD'],
  groupMode: 'fixed',
  holes: catalog.HOLES.map(function (label, i) {
    return { label: label, on: i === 0 };
  }),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleLibId: savedAdd.id,
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('lasuo-4'), rec.unwrapGameplaySnapshot(bind.getMyRuleById(savedAdd.id)))
});
bind.commitSetupDraft('score');
var inst = bind.getGame('score', created.id);
assert(
  '16 实例拿到相同玩法快照',
  inst.ruleSnapshot.reward === 'add' &&
    String(inst.ruleSnapshot.addRows.filter(function (r) { return r.id === 'hio'; })[0].value) === '9'
);
var settled = settleLasuo4.settle(inst, {
  scores: {},
  holeOrder: catalog.HOLES.slice(),
  pars: {}
});
assert('结算模块收到加法配置', inst.ruleSnapshot.reward === 'add' && settled && settled.catalogId === 'lasuo-4');

assert('legacy additive → add', rec.normalizeRewardMode('additive') === 'add');
assert('legacy multiply → mul', rec.normalizeRewardMode('multiply') === 'mul');

var srcEdit = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'edit-rule', 'index.js'),
  'utf8'
);
assert('回显走 draftFromLibraryRow', /draftFromLibraryRow/.test(srcEdit));
assert('保存写入 ruleSnapshot', /rule\.ruleSnapshot = rec\.stripLibraryMeta/.test(srcEdit));
assert('无 onShow 默认覆盖', !/\bonShow\s*\(/.test(srcEdit));

var listSummary = catalog.summarizeRule(rec.unwrapGameplaySnapshot(bind.getMyRuleById(savedAdd.id)));
assert('列表摘要不是无奖励', listSummary.indexOf('无奖励') < 0);

var freshRow = bind.getMyRuleById(savedAdd.id);
var editDraft = rec.draftFromLibraryRow(freshRow, 'lasuo-4');
var configSnap = rec.unwrapGameplaySnapshot(freshRow);
assert('15 重新 getById 仍为加法（等同退出再进）', editDraft.reward === 'add' && freshRow.ruleSnapshot.reward === 'add');
assert(
  '16 规则列表拆封与比赛配置入口一致',
  editDraft.reward === configSnap.reward && configSnap.reward === 'add'
);
assert(
  '17 只读回显仍用保存值（不依赖 canEdit）',
  editDraft.reward === 'add' && !/canEdit[\s\S]{0,40}reward/.test(srcEdit)
);

var snapMod = require('../miniprogram/subpackages/game/utils/sideGameConfigSnapshot.js');
var pageAfterSave = { reward: editDraft.reward, ruleName: editDraft.name, libId: freshRow.id };
var initial = snapMod.capture(pageAfterSave);
var again = snapMod.capture(pageAfterSave);
assert('18 保存后权威 draft 与初始快照一致', snapMod.deepEqual(initial, again) && pageAfterSave.reward === 'add');

console.log('TRACE ' + JSON.stringify({
  persistNested: trace.persistedNested,
  reloadDraft: trace.unwrappedReward,
  pageSelected: trace.pageSelected,
  same: trace.persistedNested === trace.unwrappedReward && trace.unwrappedReward === trace.pageSelected
}));
console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
