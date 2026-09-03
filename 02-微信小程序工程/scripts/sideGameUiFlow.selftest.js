/**
 * 沙盒 UI 跳转链与规则库/实例分层。
 * 运行：node scripts/sideGameUiFlow.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');
var ruleLib = require('../miniprogram/subpackages/game/utils/sideGameRuleLibrary.js');
var localLib = require('../miniprogram/subpackages/game/utils/localSideGameRuleLibrary.js');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');

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

assert('TAB 添加游戏进 list', /pages\/list\/index/.test(read('components/game-tab/index.js')));
assert('list 使用 game-list', /game-list/.test(read('pages/list/index.wxml')));
assert('game-list 添加游戏进 rules', /pages\/rules\/index/.test(read('components/game-list/index.js')));
assert('底部主按钮确定', /bindtap="onCommitSetup"/.test(read('components/game-list/index.wxml')) && />确定</.test(read('components/game-list/index.wxml')));
assert(
  '轻量添加游戏在全局设置下',
  /setting-head[\s\S]*wx:if="\{\{!hasDraftGames && canEdit\}\}"[\s\S]*class="add-game-btn"[\s\S]*添加游戏[\s\S]*wx:for="\{\{games\}\}"/.test(
    read('components/game-list/index.wxml')
  ) &&
    /wx:for="\{\{games\}\}"[\s\S]*wx:if="\{\{hasDraftGames && canEdit\}\}"[\s\S]*class="add-game-btn"[\s\S]*添加游戏/.test(
      read('components/game-list/index.wxml')
    )
);
var addCss = read('components/game-list/index.wxss');
var groupCss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'create', 'pages', 'normal', 'index.wxss'),
  'utf8'
);
assert(
  '轻量按钮复用添加组尺寸',
  /height:\s*72rpx/.test(addCss) &&
    /font-size:\s*28rpx/.test(addCss) &&
    /width:\s*56rpx/.test(addCss) &&
    /border-radius:\s*50%/.test(addCss) &&
    groupCss.indexOf('height: 72rpx') >= 0
);
var listPage = read('pages/list/index.js');
assert('进入设置建立草稿', /ensureSetupDraft/.test(listPage));
assert('左上角取消设置弹窗', /取消设置/.test(listPage) && /确认返回/.test(listPage) && /configGuard/.test(listPage));
assert('系统返回 enableAlertBeforeUnload', /enableAlertBeforeUnload/.test(listPage) || /configGuard/.test(listPage) || /sideGameConfigGuard/.test(listPage));
assert('确定成功关闭离开拦截', /disableAlertBeforeUnload/.test(listPage) || /_markSaved/.test(listPage));
assert('确认返回丢弃草稿', /discardSetupDraft/.test(listPage));
assert('config 返回不是取消设置', !/取消设置/.test(read('pages/config/index.js')));
assert('nested 页要求 setup 草稿', /requireSetupDraft/.test(read('pages/rules/index.js')) && /requireSetupDraft/.test(read('pages/config/index.js')) && /requireSetupDraft/.test(read('pages/catalog/index.js')) && /requireSetupDraft/.test(read('pages/edit-rule/index.js')) && /requireSetupDraft/.test(read('pages/pick-players/index.js')) && /requireSetupDraft/.test(read('pages/score-config/index.js')));
assert('草稿仅内存', !/setStorageSync/.test(read('utils/sideGameDraft.js')));
assert('TAB 读取正式列表', /listRepoGames|runPublished|listPublishedBoard/.test(read('components/game-tab/index.js')));
assert('TAB 不要求 setup 草稿', !/requireSetupDraft/.test(read('components/game-tab/index.js')));
assert('rules 添加规则进 catalog', /pages\/catalog\/index/.test(read('pages/rules/index.js')));
assert('catalog 进 edit-rule', /pages\/edit-rule\/index/.test(read('pages/catalog/index.js')));
assert('rules 选用进 config', /configUrl/.test(read('pages/rules/index.js')));
assert('config 选人进 pick-players', /pages\/pick-players\/index/.test(read('pages/config/index.js')));
assert('config 成绩配置进 score-config', /pages\/score-config\/index/.test(read('pages/config/index.js')));
assert('config 确认添加文案', /确认添加/.test(read('pages/config/index.wxml')));
assert('删除确认弹窗', /确定删除该游戏/.test(read('components/game-list/index.js')));
assert('未完成玩法列表标记', /玩法尚未开放/.test(read('components/game-list/index.wxml')));
assert('选择人员标题', /选择人员/.test(read('pages/pick-players/index.wxml')));
assert('选人候选卡使用组合展示', /party-face/.test(read('pages/pick-players/index.wxml')));
assert('配置已选参与方使用组合展示', /party-face/.test(read('pages/config/player-pick-block.wxml')));
assert('对决两侧使用组合展示', /item\.leftFace/.test(read('pages/config/index.wxml')) && /item\.rightFace/.test(read('pages/config/index.wxml')));
assert('排序编组使用组合展示', /party-face/.test(read('pages/config/order-board.wxml')));
assert('8421 分值使用组合展示', /party-face/.test(read('pages/config/index.wxml')) && /party-face/.test(read('pages/score-config/index.wxml')));
assert('让杆使用组合展示', /party-face/.test(read('pages/config/hcap-recv.wxml')) && /party-face/.test(read('pages/config/hcap-lasuo.wxml')));
assert('游戏设置卡片使用组合展示', /party-face/.test(read('components/game-list/index.wxml')));
assert('选人仍按 partyId 点选', /data-id="\{\{person.id\}\}"/.test(read('pages/pick-players/index.wxml')));
assert('看板 toolbar 配置', /配置/.test(read('components/game-tab/index.wxml')));
assert('正式链无 detail 跳转', !/pages\/detail/.test(read('components/game-tab/index.js')) && !/pages\/detail/.test(read('pages/config/index.js')) && !/pages\/detail/.test(read('components/game-list/index.js')));
assert('无 session.js require', read('pages/config/index.js').indexOf('session.js') < 0);
assert('letter.js 已迁入', fs.existsSync(path.join(gameRoot, 'utils', 'letter.js')));
assert('config includes 存在', fs.existsSync(path.join(gameRoot, 'pages', 'config', 'player-pick-block.wxml')));
assert('无 host-frame', !fs.existsSync(path.join(gameRoot, 'components', 'host-frame')));
assert('无 score-pad', !fs.existsSync(path.join(gameRoot, 'components', 'score-pad')));

var mem = {
  bag: {},
  getItem: function (key) {
    return this.bag[key];
  },
  setItem: function (key, value) {
    this.bag[key] = JSON.parse(JSON.stringify(value));
    return true;
  }
};
var lib = localLib.createLocalSideGameRuleLibrary({ storage: mem, clock: function () { return 1; }, idGen: function () { return 'rl_1'; } });
var created = lib.upsert({ name: '我的比杆', catalogId: 'stroke-2', ruleId: 'stroke-2', players: 2, ruleSnapshot: { catalogId: 'stroke-2', k: 2 } });
assert('规则库 upsert', created.ok && created.data.id === 'rl_1');
var blockedRule = lib.upsert({ name: '三局', catalogId: 'three-set', ruleId: 'three-set', players: 2, noSettings: true });
assert('规则库可保存三局空模板', !!(blockedRule && blockedRule.ok));
var youcaiRule = lib.upsert({ name: '油菜', catalogId: 'youcai', ruleId: 'youcai', players: 2, noSettings: true });
assert('规则库可保存油菜空模板', !!(youcaiRule && youcaiRule.ok));
['skins'].forEach(function (id) {
  var blocked = lib.upsert({ name: id, catalogId: id, ruleId: id, players: 2 });
  assert('规则库不可新增 ' + id, !blocked.ok && blocked.reason === 'rule_unavailable');
});
var smallRule = lib.upsert({ name: '斗小地主', catalogId: 'landlord-small', ruleId: 'landlord-small', players: 3, ruleSnapshot: { catalogId: 'landlord-small', reward: 'none' } });
assert('规则库可保存斗小地主', !!(smallRule && smallRule.ok));
var listed = lib.list(4);
assert('规则库 list 过滤 cap', listed.ok && listed.data.items.length === 4, String(listed.data.items.length));
var named = lib.findByName('我的比杆');
assert('规则库 findByName', named.ok);
lib.upsert({ id: 'rl_1', name: '我的比杆', catalogId: 'stroke-2', ruleId: 'stroke-2', players: 2, ruleSnapshot: { catalogId: 'stroke-2', k: 9 } });
var after = lib.getById('rl_1').data;
assert('模板 revision 递增', after.revision === 2 && after.ruleSnapshot.k === 9);
assert('实例 ruleSnapshot 独立字段', rec.buildRuleSnapshot('stroke-2').catalogId === 'stroke-2');

var combo = rec.normalizeParty({
  partyId: 'combo-1',
  partyType: 'combination',
  displayName: '红队组合',
  memberPlayerIds: ['A', 'B']
});
assert('组合一张卡仍一方', combo.partyType === 'combination' && combo.memberPlayerIds.length === 2);

var vis = rec.normalizeRecord({ visibility: 'event', scope: 'match', matchId: 'm1', ruleId: 'stroke-2' });
assert('visibility event 保留', vis.visibility === 'event');

var bindSrc = read('utils/sideGameBind.js');
assert(
  'listBoard 对当前 listGames 现场结算',
  /function listBoard[\s\S]{0,180}const allGames = listGames\(entry\)/.test(bindSrc) &&
    /allGames\.forEach\(function \(game\) \{[\s\S]{0,400}refreshGameResults\(entry, game/.test(bindSrc)
);
assert(
  'listBoard 不再丢弃现场结算',
  !/function listBoard[\s\S]{0,120}refreshActiveGames\(entry\);\s*const allGames = listGames/.test(bindSrc)
);
assert('正式成绩按洞序下标对齐', /function remapEngineByHoleIndex/.test(bindSrc));
assert('选人按 partyId 补正式头像', /function hydratePersonFromHost/.test(bindSrc));
assert('bind 批量提交', /function commitSetupDraft/.test(bindSrc) && /repository\.commitSetupDraft/.test(bindSrc));
assert(
  'persistToSetup 不 create',
  /function persistToSetup/.test(bindSrc) &&
    /setup\.added\.push/.test(bindSrc) &&
    !/function persistToSetup[\s\S]{0,500}repository\.create/.test(bindSrc)
);

console.log('\nsideGameUiFlow.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
