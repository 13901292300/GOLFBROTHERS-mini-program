/**
 * 游戏设置：轻量添加按钮位置与确定按钮 canConfirmSetup。
 * 运行：node scripts/gameSetupAddConfirm.selftest.js
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
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var ui = require('../miniprogram/subpackages/game/utils/setupListUi.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');

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

function read(rel) {
  return fs.readFileSync(path.join(gameRoot, rel), 'utf8');
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
      matchId: 'm-add-confirm',
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
      return 'addc_' + n;
    };
  })()
});
facade.setImplementation(repo);
hostSession.clearHostContext();
hostSession.setHostContext(makeHost());
bind.attachHost(makeHost());
bind.discardSetupDraft();
bind.ensureSetupDraft('score');

var wxml = read('components/game-list/index.wxml');
var wxss = read('components/game-list/index.wxss');
var listJs = read('pages/list/index.js');
var listComp = read('components/game-list/index.js');
var uiCss = read('styles/game-ui.wxss');
var empty = ui.fromDisplayedGames(bind.listGames('score'));

assert(
  '1 0张卡：添加按钮在全局配置下',
  /setting-head[\s\S]*wx:if="\{\{!hasDraftGames && canEdit\}\}"[\s\S]*class="add-game-btn"[\s\S]*wx:for="\{\{games\}\}"/.test(wxml) &&
    empty.draftGameCount === 0 &&
    !empty.hasDraftGames
);

assert(
  '2 0张卡：空列表合法，确定可点（未加载才禁用）',
  /cta-gold--disabled/.test(wxml) &&
    /canConfirmSetup \? '' : 'cta-gold--disabled'/.test(wxml) &&
    /if \(!this\.data\.canConfirmSetup\) return/.test(listComp) &&
    /if \(list && list\.data && !list\.data\.canConfirmSetup\) return/.test(listJs) &&
    listJs.indexOf('if (list && list.data && !list.data.canConfirmSetup) return') <
      listJs.indexOf('commitSetupDraft') &&
    /pointer-events:\s*none/.test(uiCss.match(/\.cta-gold--disabled\s*\{[^}]+\}/)[0]) &&
    /background:\s*#9ca3af/.test(uiCss.match(/\.cta-gold--disabled\s*\{[^}]+\}/)[0]) &&
    empty.canConfirmSetup === true &&
    ui.fromDisplayedGames(null).canConfirmSetup === false &&
    ui.fromDisplayedGames(undefined).canConfirmSetup === false
);

var first = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var one = ui.fromDisplayedGames(bind.listGames('score'));
assert(
  '3 添加第1张：按钮移动到卡片左下',
  /wx:for="\{\{games\}\}"[\s\S]*wx:if="\{\{hasDraftGames && canEdit\}\}"[\s\S]*class="add-game-btn"/.test(wxml) &&
    /margin-left:\s*32rpx/.test(wxss) &&
    /display:\s*inline-flex/.test(wxss) &&
    one.hasDraftGames &&
    one.draftGameCount === 1 &&
    !!(first && first.id)
);

assert('4 添加第1张：确定启用', one.canConfirmSetup === true);

var second = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var two = ui.fromDisplayedGames(bind.listGames('score'));
assert(
  '5 多张卡：按钮位于最后一张后',
  two.draftGameCount === 2 &&
    wxml.lastIndexOf('add-game-btn') > wxml.indexOf('wx:for="{{games}}"') &&
    wxml.lastIndexOf('add-game-btn') < wxml.indexOf('bottom-bar')
);

bind.removeGame('score', second.id);
var left1 = ui.fromDisplayedGames(bind.listGames('score'));
assert('6 删除剩1张：仍在卡片后', left1.draftGameCount === 1 && left1.hasDraftGames && left1.canConfirmSetup);

bind.removeGame('score', first.id);
var zero = ui.fromDisplayedGames(bind.listGames('score'));
assert('7 删除到0张：按钮回到全局配置下', zero.draftGameCount === 0 && !zero.hasDraftGames && /!hasDraftGames/.test(wxml));
assert('8 删除到0张：确定仍可点', zero.canConfirmSetup === true);

assert(
  '9 取消删除/取消设置时状态恢复正确',
  /if \(!res\.confirm\) return/.test(listComp) &&
    /确定删除该游戏/.test(listComp) &&
    /discardSetupDraft/.test(listJs) &&
    /取消设置/.test(listJs)
);

bind.ensureSetupDraft('score');
var published = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
bind.commitSetupDraft('score');
bind.ensureSetupDraft('score');
var keepId = bind.listGames('score')[0].id;
var extra = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
bind.removeGame('score', keepId);
var afterRemove = ui.fromDisplayedGames(bind.listGames('score'));
var setupRaw = require('../miniprogram/subpackages/game/utils/sideGameDraft.js').getSetupDraftRaw();
var removedN = (setupRaw.removed || []).length;
assert(
  '10 removed卡不计数',
  afterRemove.draftGameCount === 1 &&
    removedN >= 1 &&
    bind.listGames('score').every(function (g) {
      return g.id !== keepId;
    }) &&
    afterRemove.draftGameCount === (setupRaw.games || []).length
);
assert(
  '11 新增未提交卡计数',
  afterRemove.draftGameCount === 1 && extra && extra.id && bind.listGames('score')[0].id === extra.id
);

assert(
  '12 确定loading防重复不回归',
  /_setupSaving/.test(listJs) &&
    /setupSaving/.test(listComp) &&
    /cta-gold--saving/.test(wxml) &&
    /if \(this\.data\.setupSaving\) return/.test(listComp) &&
    /\.cta-gold--saving/.test(uiCss) &&
    /canConfirmSetup/.test(wxml) &&
    /setupSaving/.test(wxml)
);

assert(
  '13 长列表可滚到添加按钮',
  /scroll-view class="gb-body" scroll-y/.test(read('pages/list/index.wxml')) &&
    /padding-bottom:\s*220rpx/.test(wxss) &&
    /hasDraftGames[\s\S]*add-game-btn/.test(wxml)
);

assert(
  '14 底部CTA不遮挡',
  /padding-bottom:\s*220rpx/.test(wxss) &&
    /env\(safe-area-inset-bottom\)/.test(uiCss.match(/\.bottom-bar\s*\{[^}]+\}/)[0]) &&
    /position:\s*fixed/.test(uiCss.match(/\.bottom-bar\s*\{[^}]+\}/)[0])
);

assert(
  '派生字段不读 TAB 正式列表',
  !/listRepoGames|listPublishedBoard/.test(listComp) &&
    /fromDisplayedGames\(mapped\)/.test(listComp) &&
    /setupListUi/.test(listComp)
);

assert(
  'WXML 不重复复杂判断',
  !/games\.length === 0/.test(wxml) &&
    /hasDraftGames/.test(wxml) &&
    /canConfirmSetup/.test(wxml)
);

assert('不可用历史卡若仍展示则计入', ui.fromDisplayedGames([{ id: 'u', unavailable: true }]).canConfirmSetup);

assert(
  '添加游戏使用信息蓝 token',
  /color:\s*var\(--data-blue\)/.test(wxss) &&
    /\.add-game-icon\s*\{[\s\S]*border:\s*1px solid var\(--data-blue\)/.test(wxss) &&
    /hover-class="add-game-btn--pressed"/.test(wxml) &&
    !/\.add-game-btn\s*\{[^}]*color:\s*var\(--text-muted\)/.test(wxss)
);

bind.discardSetupDraft();
var emptyHost = makeHost();
emptyHost.matchId = 'm-empty-save';
hostSession.clearHostContext();
hostSession.setHostContext(emptyHost);
bind.attachHost(emptyHost);
bind.ensureSetupDraft('score');
var a = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var b = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var commitTwo = bind.commitSetupDraft('score');
assert(
  '空列表保存前置：两场已提交',
  !!(commitTwo && commitTwo.ok) &&
    !!(a && a.id) &&
    !!(b && b.id) &&
    bind.listRepoGames('score').length === 2,
  'repo=' + bind.listRepoGames('score').length + ' reason=' + (commitTwo && commitTwo.reason)
);
bind.ensureSetupDraft('score');
var ids = bind.listGames('score').map(function (g) {
  return g.id;
});
ids.forEach(function (id) {
  bind.removeGame('score', id);
});
var emptied = ui.fromDisplayedGames(bind.listGames('score'));
var draftEmpty = require('../miniprogram/subpackages/game/utils/sideGameDraft.js').getSetupDraftRaw();
assert(
  '删除全部后 dirty 草稿为空且可确定',
  emptied.canConfirmSetup === true &&
    emptied.draftGameCount === 0 &&
    (draftEmpty.games || []).length === 0 &&
    (draftEmpty.removed || []).length === 2,
  'games=' +
    ((draftEmpty && draftEmpty.games) || []).length +
    ' removed=' +
    ((draftEmpty && draftEmpty.removed) || []).length
);
var saveEmpty = bind.commitSetupDraft('score');
assert('空列表保存成功', !!(saveEmpty && saveEmpty.ok), saveEmpty && saveEmpty.reason);
bind.ensureSetupDraft('score');
assert('保存后重新进入仍为空', bind.listGames('score').length === 0 && bind.listRepoGames('score').length === 0);
var otherHost = makeHost();
otherHost.matchId = 'm-other-match';
hostSession.setHostContext(otherHost);
bind.attachHost(otherHost);
bind.ensureSetupDraft('score');
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
bind.commitSetupDraft('score');
assert('其他比赛游戏不受影响', bind.listRepoGames('score').length === 1);
hostSession.setHostContext(emptyHost);
bind.attachHost(emptyHost);
assert('原比赛仍为空', bind.listRepoGames('score').length === 0);

bind.discardSetupDraft();

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
