/**
 * Phase B.1 game 分包契约。
 * 运行：node scripts/gameSubpackage.selftest.js
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var gameRoot = path.join(mini, 'subpackages', 'game');
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
  return fs.readFileSync(path.join(mini, rel), 'utf8');
}

function walk(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir).forEach(function (name) {
    var abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walk(abs, acc);
    else acc.push(abs);
  });
  return acc;
}

var pages = [
  'list',
  'catalog',
  'rules',
  'config',
  'edit-rule',
  'pick-players',
  'score-config',
  'detail'
];
var components = ['game-list', 'game-tab', 'rank-mark-engine', 'party-face'];
var exts = ['js', 'json', 'wxml', 'wxss'];

pages.forEach(function (name) {
  assert(
    'page 四件套 ' + name,
    exts.every(function (ext) {
      return fs.existsSync(path.join(gameRoot, 'pages', name, 'index.' + ext));
    })
  );
});
components.forEach(function (name) {
  assert(
    'component 四件套 ' + name,
    exts.every(function (ext) {
      return fs.existsSync(path.join(gameRoot, 'components', name, 'index.' + ext));
    })
  );
});

assert(
  '未迁入宿主模拟页',
  !fs.existsSync(path.join(gameRoot, 'pages', 'score-tab')) &&
    !fs.existsSync(path.join(gameRoot, 'pages', 'hub')) &&
    !fs.existsSync(path.join(gameRoot, 'pages', 'match-detail')) &&
    !fs.existsSync(path.join(gameRoot, 'pages', 'setup'))
);
assert(
  '未迁入 score-pad / host-frame / session',
  !fs.existsSync(path.join(gameRoot, 'components', 'score-pad')) &&
    !fs.existsSync(path.join(gameRoot, 'components', 'host-frame')) &&
    !fs.existsSync(path.join(gameRoot, 'utils', 'session.js'))
);

var appJson = JSON.parse(read('app.json'));
var gamePkg = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/game';
});
assert('app.json 注册 root subpackages/game', !!gamePkg);
assert('app.json name 为 game', gamePkg && gamePkg.name === 'game');
assert(
  'app.json pages 与正式页一致',
  gamePkg &&
    JSON.stringify(gamePkg.pages) ===
      JSON.stringify([
        'pages/list/index',
        'pages/catalog/index',
        'pages/rules/index',
        'pages/config/index',
        'pages/edit-rule/index',
        'pages/pick-players/index',
        'pages/score-config/index',
        'pages/detail/index'
      ])
);

var files = walk(gameRoot);
var reqHits = [];
var wxStore = [];
var sessionHits = [];
var fakeHits = [];
var absHits = [];
var otherPkg = [];
var settleDirect = [];
var gameIdHits = [];
var emptyHits = 0;
var bannedEmpty = [];
var cloudHits = [];

files.forEach(function (abs) {
  if (!/\.(js|json|wxml|wxss)$/.test(abs)) return;
  var text = fs.readFileSync(abs, 'utf8');
  var rel = path.relative(gameRoot, abs).replace(/\\/g, '/');
  if (/session\.js|gb-game-/.test(text)) sessionHits.push(rel);
  if (
    /\bwx\.(get|set)StorageSync\b/.test(text) &&
    !/^utils\/localSideGame(Repository|RuleLibrary|Settings)\.js$/.test(rel) &&
    rel !== 'utils/rankMarkProjection.js'
  )
    wxStore.push(rel);
  if (/阿凯|李雷|韩梅梅|sandbox-round|sandbox-match/.test(text) && rel !== 'utils/letter.js') fakeHits.push(rel);
  if (/04-游戏沙盒|C:\\Users/.test(text)) absHits.push(rel);
  if (/emptyHint|还没有游戏|本组未开游戏|本场未开游戏/.test(text)) emptyHits += 1;
  if (text.indexOf('游戏数据尚未接入') >= 0) bannedEmpty.push(rel);
  if (/wx\.cloud|cloudfunctions|db\.collection|database\(\)/.test(text)) cloudHits.push(rel);
  var re = /require\((['"])([^'"]+)\1\)/g;
  var m;
  var isPageOrComp = rel.indexOf('pages/') === 0 || rel.indexOf('components/') === 0;
  while ((m = re.exec(text))) {
    var spec = m[2].replace(/\\/g, '/');
    if (
      isPageOrComp &&
      (/settleStroke2|settleMatch2|settle8421|settleLasuo|settleHorn|settleVegas|settlePot|settleLandlord|settleDizhubo|settleThreeVsOne/.test(
        spec
      ) ||
        /\/settle\.js$/.test(spec) ||
        spec === './settle.js')
    ) {
      settleDirect.push(rel + ':' + spec);
    }
    if (spec.charAt(0) !== '.') {
      reqHits.push(rel + ':' + spec);
    } else {
      var resolved = path.normalize(path.join(path.dirname(abs), spec));
      if (!/\.js$/i.test(resolved) && fs.existsSync(resolved + '.js')) resolved += '.js';
      var fromMini = path.relative(mini, resolved).replace(/\\/g, '/');
      if (fromMini.indexOf('subpackages/') === 0 && fromMini.indexOf('subpackages/game/') !== 0) {
        otherPkg.push(rel + ':' + spec);
      }
    }
  }
  if (/\.js$/.test(abs) && /gameId/.test(text) && rel.indexOf('utils/settle') !== 0 && rel.indexOf('utils/catalog') !== 0) {
    if (
      rel.indexOf('utils/sideGameEngine') !== 0 &&
      rel.indexOf('utils/gameHostContext') !== 0 &&
      rel.indexOf('utils/sideGameBind') !== 0 &&
      rel.indexOf('utils/sideGameRecord') !== 0 &&
      rel.indexOf('utils/sideGameConfigSnapshot') !== 0 &&
      rel.indexOf('pages/config/') !== 0 &&
      rel.indexOf('pages/edit-rule/') !== 0 &&
      rel.indexOf('components/game-list/') !== 0 &&
      rel.indexOf('components/game-tab/') !== 0
    ) {
      gameIdHits.push(rel);
    }
  }
});

assert('require 无裸模块名', reqHits.length === 0, reqHits.join(','));
assert('不 require 其它业务分包', otherPkg.length === 0, otherPkg.join(','));
assert('页面不直接 require 各结算器', settleDirect.length === 0, settleDirect.join(','));
assert('无 session / gb-game- key', sessionHits.length === 0, sessionHits.join(','));
assert('无 wx Storage（除 localSideGameRepository）', wxStore.length === 0, wxStore.join(','));
assert('无假数据/沙盒 round', fakeHits.length === 0, fakeHits.join(','));
assert('无沙盒绝对路径', absHits.length === 0, absHits.join(','));
assert('空态文案存在', emptyHits >= 3);
assert('不再显示游戏数据尚未接入', bannedEmpty.length === 0, bannedEmpty.join(','));
assert('无云函数或数据库依赖', cloudHits.length === 0, cloudHits.join(','));
assert(
  '正式页未使用混合 gameId',
  gameIdHits.length === 0,
  gameIdHits.join(',')
);

pages.forEach(function (name) {
  var js = fs.readFileSync(path.join(gameRoot, 'pages', name, 'index.js'), 'utf8');
  var json = JSON.parse(fs.readFileSync(path.join(gameRoot, 'pages', name, 'index.json'), 'utf8'));
  assert(name + ' json 可解析', !!json.navigationStyle);
  var wxml = fs.readFileSync(path.join(gameRoot, 'pages', name, 'index.wxml'), 'utf8');
  (wxml.match(/<([a-z0-9-]+)/g) || []).forEach(function () {});
  var using = json.usingComponents || {};
  Object.keys(using).forEach(function (key) {
    var spec = using[key];
    var target = path.normalize(path.join(gameRoot, 'pages', name, spec));
    var ok =
      fs.existsSync(target + '.js') ||
      fs.existsSync(target + '.json') ||
      fs.existsSync(path.join(target, 'index.js')) ||
      fs.existsSync(target);
    assert(name + ' usingComponents 可解析 ' + key, ok);
  });
  var wxss = fs.readFileSync(path.join(gameRoot, 'pages', name, 'index.wxss'), 'utf8');
  var imports = wxss.match(/@import\s+['"]([^'"]+)['"]/g) || [];
  imports.forEach(function (imp) {
    var spec = imp.replace(/@import\s+['"]/, '').replace(/['"]$/, '');
    var target = path.normalize(path.join(gameRoot, 'pages', name, spec));
    assert(name + ' wxss import 存在 ' + spec, fs.existsSync(target));
  });
});

['game-list', 'game-tab', 'party-face'].forEach(function (name) {
  var json = JSON.parse(fs.readFileSync(path.join(gameRoot, 'components', name, 'index.json'), 'utf8'));
  var using = json.usingComponents || {};
  Object.keys(using).forEach(function (key) {
    var spec = using[key];
    var target = path.normalize(path.join(gameRoot, 'components', name, spec));
    var ok =
      fs.existsSync(target + '.js') ||
      fs.existsSync(target + '.json') ||
      fs.existsSync(path.join(target, 'index.js')) ||
      fs.existsSync(target);
    assert(name + ' usingComponents 可解析 ' + key, ok);
  });
});

['game-list', 'game-tab'].forEach(function (name) {
  var js = fs.readFileSync(path.join(gameRoot, 'components', name, 'index.js'), 'utf8');
  assert(name + ' 使用 matchId props', /matchId/.test(js) && /scope/.test(js));
  assert(name + ' 不 require session.js', js.indexOf('session.js') < 0);
});

var listJs = fs.readFileSync(path.join(gameRoot, 'components', 'game-list', 'index.js'), 'utf8');
assert('公开范围仍为 public/event/group', /public/.test(listJs) && /event/.test(listJs) && /group/.test(listJs));

var engineJs = fs.readFileSync(path.join(gameRoot, 'utils', 'sideGameEngine.js'), 'utf8');
assert('sideGameEngine 仍为结算入口', /settleGame|settleSideGame/.test(engineJs) || /settle:/.test(engineJs));

var otherRoots = ['create', 'player', 'scoring', 'tournament', 'tournament-manage', 'tournament-tools', 'reaction', 'poster'];
var leak = [];
otherRoots.forEach(function (name) {
  var dir = path.join(mini, 'subpackages', name);
  if (!fs.existsSync(dir)) return;
  walk(dir).forEach(function (abs) {
    if (!/\.(js|wxss|json|wxml)$/.test(abs)) return;
    var text = fs.readFileSync(abs, 'utf8');
    if (/subpackages\/game\//.test(text) && abs.indexOf(path.join('subpackages', 'game')) < 0) {
      if (/\.json$/i.test(abs) && /usingComponents|componentPlaceholder/.test(text)) return;
      leak.push(path.relative(mini, abs));
    }
  });
});
assert('其它分包不引用 game JS/WXSS', leak.length === 0, leak.join(','));

var scoreWxml = read('subpackages/scoring/pages/score/index.wxml');
var hubWxml = read('subpackages/scoring/pages/hub/index.wxml');
var detailWxml = read('subpackages/tournament/pages/detail/index.wxml');
var seriesWxml = read('subpackages/tournament/pages/series-detail/index.wxml');
assert(
  '记分页 inactive 才实例化 game-tab',
  /wx:if="\{\{activeTab === 'game'\}\}"/.test(scoreWxml) && /host-snapshot="\{\{hostSnapshot\}\}"/.test(scoreWxml)
);
assert(
  '记分页按需实例化 rank-mark-engine',
  /wx:if="\{\{rankMarkEngineOn\}\}"/.test(scoreWxml) && /bind:rankmarkchange/.test(scoreWxml)
);
assert(
  'Hub inactive 才实例化 game-tab',
  /wx:if="\{\{activeTab === 'game'\}\}"/.test(hubWxml) &&
    /host-snapshot="\{\{hostSnapshot\}\}"/.test(hubWxml) &&
    /entry="hub"/.test(hubWxml)
);
assert(
  '赛事详情 inactive 才实例化 game-tab',
  /wx:if="\{\{activeTab === 'game'\}\}"/.test(detailWxml) &&
    /host-snapshot="\{\{hostSnapshot\}\}"/.test(detailWxml) &&
    /entry="match"/.test(detailWxml) &&
    /layout-mode="flow"/.test(detailWxml)
);
assert('series-detail 不加游戏 TAB', seriesWxml.indexOf('game-tab') < 0);

var scoreJs = read('subpackages/scoring/pages/score/index.js');
var hubJs = read('subpackages/scoring/pages/hub/index.js');
var detailJs = read('subpackages/tournament/pages/detail/index.js');
assert(
  '宿主不 require game 分包 JS',
  scoreJs.indexOf('subpackages/game/') < 0 &&
    hubJs.indexOf('subpackages/game/') < 0 &&
    detailJs.indexOf('subpackages/game/') < 0
);

var tabJs = fs.readFileSync(path.join(gameRoot, 'components', 'game-tab', 'index.js'), 'utf8');
assert('game-tab 观察 hostSnapshot', /hostSnapshot/.test(tabJs) && /buildFromHostSnapshot/.test(tabJs));
assert('game-tab 看板空态', /本组未开游戏|emptyTitle/.test(tabJs));
assert('game-tab 进入设置页 list', /pages\/list\/index/.test(tabJs) && tabJs.indexOf('pages/detail') < 0);
assert(
  'config 保存回 list 不进 detail',
  fs.readFileSync(path.join(gameRoot, 'pages', 'config', 'index.js'), 'utf8').indexOf('pages/list/index') >= 0 &&
    fs.readFileSync(path.join(gameRoot, 'pages', 'config', 'index.js'), 'utf8').indexOf('pages/detail') < 0
);
assert(
  '规则库门面可替换',
  /setImplementation/.test(fs.readFileSync(path.join(gameRoot, 'utils', 'sideGameRuleLibrary.js'), 'utf8')) &&
    /gb_side_game_rules_v1/.test(fs.readFileSync(path.join(gameRoot, 'utils', 'localSideGameRuleLibrary.js'), 'utf8'))
);
assert('无角色切换开关', fs.readFileSync(path.join(gameRoot, 'components', 'game-tab', 'index.wxml'), 'utf8').indexOf('onToggleRole') < 0);
assert(
  'localSideGameRepository 独占实例 storage key',
  /gb_side_games_v1/.test(fs.readFileSync(path.join(gameRoot, 'utils', 'localSideGameRepository.js'), 'utf8'))
);

var pageLocalRepo = [];
var pageHardMe = [];
walk(path.join(gameRoot, 'pages')).concat(walk(path.join(gameRoot, 'components'))).forEach(function (abs) {
  if (!/\.js$/.test(abs)) return;
  var text = fs.readFileSync(abs, 'utf8');
  var rel = path.relative(gameRoot, abs).replace(/\\/g, '/');
  if (/localSideGameRepository/.test(text)) pageLocalRepo.push(rel);
  if (/['"]me['"]/.test(text)) pageHardMe.push(rel);
});
assert('页面不直接 require local repository', pageLocalRepo.length === 0, pageLocalRepo.join(','));
assert('页面不写死 me', pageHardMe.length === 0, pageHardMe.join(','));
assert(
  '门面可替换',
  /setImplementation/.test(fs.readFileSync(path.join(gameRoot, 'utils', 'sideGameRepository.js'), 'utf8')) &&
    /setImplementation/.test(fs.readFileSync(path.join(gameRoot, 'utils', 'sideGameIdentityProvider.js'), 'utf8')) &&
    /local-preview/.test(fs.readFileSync(path.join(gameRoot, 'utils', 'sideGameEntitlementProvider.js'), 'utf8'))
);
assert(
  '记分页切游戏 TAB 重建 hostSnapshot',
  /tab === 'game'/.test(scoreJs) && /buildForScorePage/.test(scoreJs)
);
assert(
  'Hub 切游戏 TAB 重建 hostSnapshot',
  /tab === 'game'/.test(hubJs) && /buildForHub/.test(hubJs)
);
assert(
  '赛事详情切游戏 TAB 重建 hostSnapshot',
  /tab === 'game'/.test(detailJs) && /buildFromMatch/.test(detailJs)
);

console.log('\ngameSubpackage.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
