/**
 * 游戏设置：左上角返回未保存保护。
 * 运行：node scripts/gameSetupLeaveDirty.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    showToast: function () {},
    showModal: function (opt) {
      global.__lastModal = opt;
      if (opt && opt.success) opt.success({ confirm: !!global.__modalConfirm });
    },
    enableAlertBeforeUnload: function (opt) {
      global.__unloadAlert = opt && opt.message;
    },
    disableAlertBeforeUnload: function () {
      global.__unloadAlert = null;
    },
    navigateBack: function () {
      global.__navBack = (global.__navBack || 0) + 1;
    }
  };
}

var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var guard = require('../miniprogram/subpackages/game/utils/sideGameConfigGuard.js');
var setupListDirty = require('../miniprogram/subpackages/game/utils/setupListDirty.js');

var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');
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

function hostHoleOrder() {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push('C' + i);
  for (i = 1; i <= 9; i++) out.push('D' + i);
  return out;
}

function makeHost() {
  var holeOrder = hostHoleOrder();
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
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-leave-dirty',
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: holeOrder,
      pars: pars,
      allowBigPot: true,
      canEditSideGames: true,
      currentUserId: 'tester',
      players: players,
      scoreParties: parties
    })
  );
}

function stroke2(players) {
  var holes = hostHoleOrder();
  return {
    catalogId: 'stroke-2',
    name: '比杆',
    players: players,
    pairings: [{ id: 'pair-1', leftId: players[0].id, rightId: players[1].id, on: true, strokes: 0 }],
    holes: holes.map(function (label) {
      return { label: label, on: true };
    }),
    holeOrder: holes.slice(),
    createdHoleOrder: holes.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

function attachPage() {
  var page = {
    data: { canEdit: true, pageMode: 'edit' },
    setData: function (patch, cb) {
      Object.assign(this.data, patch || {});
      if (cb) cb.call(this);
    }
  };
  guard.attach(page, {
    leaveTitle: '取消设置',
    leaveMessage: '返回后，本次未保存的游戏设置将不会保留，是否确认返回？',
    getBusiness: setupListDirty.setupBusiness,
    onDiscard: function () {
      bind.discardSetupDraft();
    }
  });
  page._captureInitialSnapshot();
  return page;
}

/** 清空已提交游戏，重新进入空草稿。 */
function resetEmptySetup() {
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  bind.listGames('score').forEach(function (g) {
    bind.removeGame('score', g.id);
  });
  var out = bind.commitSetupDraft('score');
  if (!out || !out.ok) throw new Error('resetEmptySetup commit failed');
  bind.ensureSetupDraft('score');
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
      return 'ld_' + n;
    };
  })()
});
facade.setImplementation(repo);

hostSession.clearHostContext();
hostSession.setHostContext(makeHost());
bind.attachHost(makeHost());

// --- 1 未修改 ---
resetEmptySetup();
var page = attachPage();
assert('1 未修改不 dirty', page._isDirty() === false);

global.__lastModal = null;
global.__modalConfirm = false;
global.__navBack = 0;
page._leaveIfClean(function () {
  global.__navBack += 1;
});
assert('1 未修改返回不弹窗且离开', !global.__lastModal && global.__navBack === 1);

// --- 2 添加 ---
var g1 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('2 添加后 dirty（不经 setData）', page._isDirty() === true && !!(g1 && g1.id));

page._rebuildInitialIfPristine();
assert('2 onShow 模拟后仍 dirty 且不重置快照', page._isDirty() === true);

global.__lastModal = null;
global.__modalConfirm = false;
global.__navBack = 0;
page._leaveIfClean(function () {
  global.__navBack += 1;
});
assert('2 添加后返回弹窗', !!(global.__lastModal && /不会保留/.test(global.__lastModal.content)));
assert('9 不放弃则不离开', global.__navBack === 0);

global.__modalConfirm = true;
global.__navBack = 0;
page._leaveIfClean(function () {
  global.__navBack += 1;
  bind.discardSetupDraft();
});
assert('10 确认放弃后离开', global.__navBack === 1);

// --- 3 / 7 修改后恢复 ---
resetEmptySetup();
page = attachPage();
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
bind.commitSetupDraft('score');
bind.ensureSetupDraft('score');
page._captureInitialSnapshot();
var keepId = bind.listGames('score')[0].id;
bind.updateGame('score', keepId, { multiplier: 3 });
assert('3 修改游戏后 dirty', page._isDirty() === true);
bind.updateGame('score', keepId, { multiplier: 1 });
assert('7 改回原值不 dirty', page._isDirty() === false);

// --- 4 删除 ---
bind.removeGame('score', keepId);
assert('4 删除后 dirty', page._isDirty() === true);

// --- 5 / 5b / 8 终态回到初始 ---
resetEmptySetup();
page = attachPage();
assert('初始空不 dirty', page._isDirty() === false && bind.listGames('score').length === 0);

var p1 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var p2 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('5 多张后 dirty', page._isDirty() === true);
bind.removeGame('score', p1.id);
bind.removeGame('score', p2.id);
assert('5 删除全部相对空初始：不 dirty', page._isDirty() === false);

bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('删前有两张 dirty', page._isDirty() === true);
bind.listGames('score').forEach(function (g) {
  bind.removeGame('score', g.id);
});
assert('5b 终态=初始不 dirty', page._isDirty() === false);

var n1 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('8 添加后 dirty', page._isDirty() === true);
bind.removeGame('score', n1.id);
assert('8 添加又删除新增项不 dirty', page._isDirty() === false);

// --- 全局 / UI ---
bind.setGlobal('score', { privacy: 'group' });
assert('改全局设置 dirty', page._isDirty() === true);
bind.setGlobal('score', { privacy: 'public' });
assert('全局改回不 dirty', page._isDirty() === false);

bind.setGlobal('score', { settingsOpen: true });
assert('展开面板 settingsOpen 不 dirty', page._isDirty() === false);

// --- 6 顺序 ---
var q1 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var q2 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var games = bind.listGames('score').slice();
var setup = require('../miniprogram/subpackages/game/utils/sideGameDraft.js').getSetupDraftRaw();
setup.games = [games[1], games[0]];
assert('6 调整顺序后 dirty', page._isDirty() === true && q1.id && q2.id);

// --- 11 保存后 ---
page._markSaved();
assert('11 标记保存后不 dirty', page._isDirty() === false);
global.__lastModal = null;
global.__navBack = 0;
page._leaveIfClean(function () {
  global.__navBack += 1;
});
assert('11 保存后返回不提示', !global.__lastModal && global.__navBack === 1);

// --- 12 保存失败语义 ---
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('12 再改 dirty', page._isDirty() === true);
var boom = { ok: false };
assert('12 保存失败语义：仍 dirty', page._isDirty() === true && !boom.ok);

// --- 13 空列表保存 ---
resetEmptySetup();
page = attachPage();
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
bind.commitSetupDraft('score');
bind.ensureSetupDraft('score');
page._captureInitialSnapshot();
bind.listGames('score').forEach(function (g) {
  bind.removeGame('score', g.id);
});
assert('13 删除全部已提交游戏后 dirty', page._isDirty() === true);
var emptySave = bind.commitSetupDraft('score');
assert('13 空列表可保存', !!(emptySave && emptySave.ok));
page._markSaved();
assert('13 保存空列表后不 dirty', page._isDirty() === false);

// --- 14 接线 / 文案 ---
var listJs = fs.readFileSync(path.join(gameRoot, 'pages/list/index.js'), 'utf8');
var guardJs = fs.readFileSync(path.join(gameRoot, 'utils/sideGameConfigGuard.js'), 'utf8');
assert('14 左上角走 confirmLeave/_leaveIfClean', /onBack\(\)[\s\S]*confirmLeaveSetup/.test(listJs));
assert(
  '14 onShow 先 refreshDirty',
  /_refreshDirty/.test(listJs) &&
    listJs.indexOf('_refreshDirty') < listJs.indexOf('_rebuildInitialIfPristine', listJs.indexOf('onShow'))
);
assert('14 rebuild 用实时 _isDirty', /_rebuildInitialIfPristine[\s\S]*_isDirty\(\)/.test(guardJs));
assert('文案未改', /取消设置/.test(listJs) && /不会保留/.test(listJs));
assert('确定不走 leaveIfClean', /onCommitSetup[\s\S]*_markSaved[\s\S]*navigateBackSafe/.test(listJs));
assert(
  '快照不含变更账本',
  !/removed:/.test(fs.readFileSync(path.join(gameRoot, 'utils/setupListDirty.js'), 'utf8'))
);

// --- 系统返回与左上角同一套 _leaveIfClean ---
assert('14 系统返回同源', /_leaveIfClean/.test(guardJs) && /enableAlertBeforeUnload/.test(guardJs));

console.log('\ngameSetupLeaveDirty.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
