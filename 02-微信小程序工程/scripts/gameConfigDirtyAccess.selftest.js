/**
 * 游戏配置：脏检查快照 + 只读权限。
 * 运行：node scripts/gameConfigDirtyAccess.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () { return null; },
    setStorageSync: function () {},
    showToast: function (opt) { global.__lastToast = opt && opt.title; },
    showModal: function (opt) {
      global.__lastModal = opt;
      if (opt && opt.success) opt.success({ confirm: !!global.__modalConfirm });
    },
    enableAlertBeforeUnload: function (opt) { global.__unloadAlert = opt && opt.message; },
    disableAlertBeforeUnload: function () { global.__unloadAlert = null; },
    navigateBack: function () {}
  };
}

var snap = require('../miniprogram/subpackages/game/utils/sideGameConfigSnapshot.js');
var access = require('../miniprogram/utils/sideGameEditAccess.js');
var entitlement = require('../miniprogram/subpackages/game/utils/sideGameEntitlementProvider.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var guard = require('../miniprogram/subpackages/game/utils/sideGameConfigGuard.js');

var passed = 0;
var failed = 0;
var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () { return 'tester'; }
});

function memStorage() {
  var bag = {};
  return {
    getItem: function (key) { return bag[key]; },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  };
}

var repo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'cfg_' + n;
    };
  })()
});
facade.setImplementation(repo);

function makeHost(flag) {
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-cfg',
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: catalog.HOLES.slice(),
      pars: catalog.defaultHolePars(),
      allowBigPot: true,
      canEditSideGames: flag,
      currentUserId: 'tester',
      players: [
        { playerId: 'pA', displayName: '甲', groupId: 'g1' },
        { playerId: 'pB', displayName: '乙', groupId: 'g1' }
      ]
    })
  );
}

assert('1 标准化 "5" 与 5 等价', snap.deepEqual({ m2: '5' }, { m2: 5 }));
assert('折叠字段不参与比较', snap.deepEqual({ reward: 'mul', pairFold: true }, { reward: 'mul', pairFold: false }));
assert('权限字段不参与比较', snap.deepEqual({ reward: 'mul', pageMode: 'edit' }, { reward: 'mul', pageMode: 'readonly' }));
assert('改倍率则不同', !snap.deepEqual({ reward: 'mul', m2: 5 }, { reward: 'mul', m2: 4 }));
assert('对阵数组顺序有意义', !snap.deepEqual({ pairings: [{ id: 'a' }, { id: 'b' }] }, { pairings: [{ id: 'b' }, { id: 'a' }] }));
assert('空串与 undefined 等价', snap.deepEqual({ note: '' }, { note: undefined }));

var page = {
  data: { reward: 'mul', m2: '5', pairFold: false, canEdit: true, pageMode: 'edit' },
  setData: function (patch, cb) {
    Object.assign(this.data, patch || {});
    if (cb) cb.call(this);
  }
};
hostSession.clearHostContext();
hostSession.setHostContext(makeHost(true));
bind.attachHost(makeHost(true));
guard.attach(page, {
  getBusiness: function (p) { return { reward: p.data.reward, m2: p.data.m2 }; }
});
page._captureInitialSnapshot();
assert('1 有权限进入后不操作不 dirty', page._isDirty() === false);

page.setData({ m2: '6' });
assert('2 修改后 dirty', page._isDirty() === true);

page.setData({ m2: '5' });
assert('3 改回原值不 dirty', page._isDirty() === false);

page.setData({ pairFold: true });
assert('5 折叠不 dirty', page._isDirty() === false);

page.setData({ m2: '9' });
page._markSaved();
assert('6 保存成功后不 dirty', page._isDirty() === false);

page.setData({ m2: '8' });
assert('7 再改仍 dirty（保存失败应保持）', page._isDirty() === true);

var roHost = makeHost(false);
hostSession.setHostContext(roHost);
bind.attachHost(roHost);
var writes = 0;
var origCreate = repo.create;
repo.create = function () {
  writes += 1;
  return origCreate.apply(this, arguments);
};
assert('8 无编辑权仍可查看', entitlement.canView({ hostContext: roHost }).ok === true);
assert('8 无编辑权不可编辑', entitlement.canEdit({ hostContext: roHost }).ok === false);

bind.discardSetupDraft();
bind.ensureSetupDraft('score');
var added = bind.addGame('score', {
  catalogId: 'match-2',
  name: '比洞',
  players: [{ id: 'pA' }, { id: 'pB' }]
});
assert('11 无权限 addGame 被拒绝', !!(added && added.__fail && added.reason === 'no_entitlement') && writes === 0);

var upsert = bind.upsertMyRule({ name: 'x', catalogId: 'stroke-2', players: 2, reward: 'mul' });
assert('13 无权限 upsertMyRule 拒绝', upsert == null && writes === 0);

var commit = bind.commitSetupDraft('score');
assert('11 无权限 commit 拒绝', commit && commit.ok === false && writes === 0);

var roPage = {
  data: { reward: 'mul', m2: '5', pairFold: false },
  setData: function (patch, cb) {
    Object.assign(this.data, patch || {});
    if (cb) cb.call(this);
  }
};
guard.attach(roPage, {
  host: roHost,
  getBusiness: function (p) { return { reward: p.data.reward, m2: p.data.m2 }; }
});
roPage._captureInitialSnapshot();
roPage.setData({ m2: '99' });
assert('10 只读 setData 不改业务值', String(roPage.data.m2) === '5');
assert('12 只读永不 dirty', roPage._isDirty() === false);
roPage.setData({ pairFold: true });
assert('10 只读仍可折叠', roPage.data.pairFold === true);

hostSession.setHostContext(makeHost(true));
bind.attachHost(makeHost(true));
repo.create = origCreate;

var srcList = fs.readFileSync(path.join(gameRoot, 'pages', 'list', 'index.js'), 'utf8');
var srcCfg = fs.readFileSync(path.join(gameRoot, 'pages', 'config', 'index.js'), 'utf8');
var srcRule = fs.readFileSync(path.join(gameRoot, 'pages', 'edit-rule', 'index.js'), 'utf8');
var srcScore = fs.readFileSync(path.join(gameRoot, 'pages', 'score-config', 'index.js'), 'utf8');
var srcPick = fs.readFileSync(path.join(gameRoot, 'pages', 'pick-players', 'index.js'), 'utf8');
assert('14 list 接入 guard', /sideGameConfigGuard/.test(srcList) && /_captureInitialSnapshot/.test(srcList));
assert('14 config 接入 guard', /sideGameConfigGuard/.test(srcCfg) && /_assertCanEdit/.test(srcCfg));
assert('14 edit-rule 接入 guard', /sideGameConfigGuard/.test(srcRule) && /_assertCanEdit/.test(srcRule));
assert('14 score-config 接入 guard', /sideGameConfigGuard/.test(srcScore));
assert('14 pick-players 接入 guard', /sideGameConfigGuard/.test(srcPick));
assert('14 比洞/比杆共用同一权限模块', /sideGameEditAccess/.test(fs.readFileSync(path.join(gameRoot, 'utils', 'sideGameConfigGuard.js'), 'utf8')));

var cfgWxml = fs.readFileSync(path.join(gameRoot, 'pages', 'config', 'index.wxml'), 'utf8');
var listWxml = fs.readFileSync(path.join(gameRoot, 'components', 'game-list', 'index.wxml'), 'utf8');
assert('9 配置页只读仍渲染内容', /游戏实例配置/.test(cfgWxml) && /readonlyHint/.test(cfgWxml));
assert('8 列表查看不隐藏游戏卡', /game-card/.test(listWxml) && /查看/.test(listWxml));
assert('入口配置不因 canCreate 关闭', /board-toolbar__cfg/.test(fs.readFileSync(path.join(gameRoot, 'components', 'game-tab', 'index.wxml'), 'utf8')));

var creator = access.canEditSideGames({ createdBy: 'owner' }, 'owner');
var guest = access.canEditSideGames({ createdBy: 'owner' }, 'guest');
assert('编辑权来自创建者/管理/记分临管', creator === true && guest === false);

entitlement.bindHostContext(null);

console.log('\ngameConfigDirtyAccess.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
