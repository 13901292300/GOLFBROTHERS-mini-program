/**
 * 游戏设置草稿：添加/修改/删除延迟到确定，取消丢弃，TAB 读正式数据。
 * 运行：node scripts/sideGameSetupDraft.selftest.js
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
    navigateBack: function () {}
  };
}

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');

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

function memStorage() {
  var bag = {};
  return {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    },
    _bag: bag
  };
}

function hostHoleOrder() {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push('C' + i);
  for (i = 1; i <= 9; i++) out.push('D' + i);
  return out;
}

function makeHost(opts) {
  opts = opts || {};
  var holeOrder = hostHoleOrder();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var players = opts.players || [
    { playerId: 'pA', displayName: '甲', groupId: 'g1' },
    { playerId: 'pB', displayName: '乙', groupId: 'g1' }
  ];
  var parties = players.map(function (p) {
    return {
      partyId: p.playerId,
      partyType: 'player',
      displayName: p.displayName,
      memberPlayerIds: [p.playerId],
      groupId: p.groupId || 'g1'
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
  var ctx = hostMod.emptyContext({
    matchId: opts.matchId || 'm-setup',
    groupId: opts.groupId || 'g1',
    scope: opts.scope || 'group',
    revision: opts.revision || 'r1',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: pars,
    allowBigPot: true,
    players: players,
    scoreParties: parties,
    officialScoresByPartyId: official
  });
  return hostMod.buildPresentation(ctx);
}

function stroke2(players) {
  return {
    catalogId: 'stroke-2',
    name: '比杆',
    players: players,
    pairings: [{ id: 'pair-1', leftId: players[0].id, rightId: players[1].id, on: true, strokes: 0 }],
    holes: catalog.HOLES.map(function (label) {
      return { label: label, on: true };
    }),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

var gamesStore = memStorage();
var settingsStore = memStorage();
identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});
var repo = localMod.createLocalSideGameRepository({
  storage: gamesStore,
  settingsApi: settingsMod.createLocalSideGameSettings({ storage: settingsStore }),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'setupg_' + n;
    };
  })(),
  clock: function () {
    return 4000;
  }
});
facade.setImplementation(repo);

function attach(host) {
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
}

function repoCount(matchId) {
  var listed = repo.listVisible({
    matchId: matchId || 'm-setup',
    groupId: 'g1',
    scope: 'group',
    viewerUserId: 'tester',
    hostContext: hostSession.getHostContext()
  });
  return listed.ok ? (listed.data.items || []).length : 0;
}

var host = makeHost();
attach(host);
bind.discardSetupDraft();

var existing = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('4 进入设置前可有正式游戏', !!(existing && existing.id));
var before = repoCount();
assert('4 正式条数=1', before === 1);

bind.ensureSetupDraft('score');
assert('4 草稿已建立', bind.inSetup('score'));

var added = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('4 确认添加进入草稿', !!(added && added.id));
assert('4 添加后草稿可见 2 场', bind.listGames('score').length === 2);
assert('4/5 添加后 Repository 仍 1 条', repoCount() === 1);
var added2 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('5 可连续添加多个', !!(added2 && added2.id) && bind.listGames('score').length === 3);
assert('5 多个仍未写 Repository', repoCount() === 1);

var published = bind.runPublished(function () {
  return bind.listGames('score').length;
});
assert('TAB 仍见进入前状态', published === 1);

var renamed = bind.updateGame('score', existing.id, { name: '草稿改名' });
assert('6 修改只改草稿', renamed && renamed.name === '草稿改名');
assert('6 正式标题未改', repo.getById(existing.id).data.title !== '草稿改名');

bind.removeGame('score', existing.id);
assert('7 删除后草稿列表无原游戏', bind.listGames('score').every(function (g) {
  return g.id !== existing.id;
}));
assert('7 正式游戏仍在', repo.getById(existing.id).ok);

bind.setGlobal('score', { privacy: 'event' });
assert('全局草稿未写设置库', settingsMod.createLocalSideGameSettings({ storage: settingsStore }).get('m-setup', 'score').privacy !== 'event');

var committed = bind.commitSetupDraft('score');
assert('8 确定一次性保存', committed.ok, JSON.stringify(committed));
assert('8 提交后正式 2 场(删1加2)', repoCount() === 2);
assert('8 原游戏已删', !repo.getById(existing.id).ok);
assert('10 提交后草稿清除', !bind.inSetup('score'));

bind.ensureSetupDraft('score');
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('12 再进入可继续改草稿', bind.listGames('score').length === 3 && repoCount() === 2);
bind.discardSetupDraft();
assert('13 取消丢弃草稿', !bind.inSetup('score'));
assert('13 正式数据不变', repoCount() === 2);

var deep = bind.requireSetupDraft('score');
assert('深链无草稿提示', !deep);

var host2 = makeHost({ matchId: 'm-other', groupId: 'g2' });
attach(host);
bind.ensureSetupDraft('score');
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
attach(host2);
bind.ensureSetupDraft('score');
assert('17 换 match 不串草稿', bind.listGames('score').length === 0 && bind.inSetup('score'));
bind.discardSetupDraft();

attach(host);
var finished = makeHost({ matchId: 'm-setup', revision: 'ended-1' });
finished.status = 'finished';
attach(finished);
bind.ensureSetupDraft('score');
var lateAdd = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var lateCommit = bind.commitSetupDraft('score');
assert('18 结束后仍可保存', !!(lateAdd && lateAdd.id) && lateCommit.ok, JSON.stringify(lateCommit));

['hub', 'match', 'score'].forEach(function (entry) {
  var src = fs.readFileSync(path.join(gameRoot, 'pages', 'list', 'index.js'), 'utf8');
  assert('19 list 草稿入口共用 ' + entry, /ensureSetupDraft/.test(src) && /commitSetupDraft/.test(src));
});

var listWxml = fs.readFileSync(path.join(gameRoot, 'components', 'game-list', 'index.wxml'), 'utf8');
assert('1 底部文案确定', /bindtap="onCommitSetup"/.test(listWxml) && />确定</.test(listWxml));
assert('2 全局下轻量添加游戏', /add-game-btn[\s\S]*添加游戏/.test(listWxml));
assert('3 轻量按钮非底部 CTA', /bindtap="onCommitSetup"/.test(listWxml) && />确定</.test(listWxml) && /add-game-btn/.test(listWxml));
assert('11 取消设置文案', /取消设置/.test(fs.readFileSync(path.join(gameRoot, 'pages', 'list', 'index.js'), 'utf8')));
assert('14 系统返回拦截', /enableAlertBeforeUnload/.test(fs.readFileSync(path.join(gameRoot, 'pages', 'list', 'index.js'), 'utf8')) || /configGuard/.test(fs.readFileSync(path.join(gameRoot, 'pages', 'list', 'index.js'), 'utf8')));
assert('15 config 无取消设置', fs.readFileSync(path.join(gameRoot, 'pages', 'config', 'index.js'), 'utf8').indexOf('取消设置') < 0);
assert('16 确定后关闭拦截', /_committed = true/.test(fs.readFileSync(path.join(gameRoot, 'pages', 'list', 'index.js'), 'utf8')));

var failRepo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  idGen: function () {
    return 'fail_new';
  },
  settingsApi: {
    replace: function () {
      return false;
    }
  }
});
facade.setImplementation(failRepo);
attach(host);
bind.discardSetupDraft();
bind.ensureSetupDraft('score');
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var boom = bind.commitSetupDraft('score');
assert('9 保存失败', !boom.ok);
assert('9 失败零部分写入', !failRepo.getById('fail_new').ok && !failRepo.listVisible({
  matchId: 'm-setup',
  groupId: 'g1',
  scope: 'group',
  viewerUserId: 'tester',
  hostContext: host
}).data.items.length);
assert('9 失败草稿仍在', bind.inSetup('score') && bind.listGames('score').length === 1);

console.log('\nsideGameSetupDraft.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
