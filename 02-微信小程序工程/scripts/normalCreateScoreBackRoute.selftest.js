/**
 * NORMAL-CREATE-SCORE-BACK-ROUTE-FIX / FIX-B
 * 普通创建成功后返回干净首页（不恢复“+”弹窗）。
 * 运行：node scripts/normalCreateScoreBackRoute.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var createJs = path.join(
  root,
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'normal',
  'index.js'
);
var scoreJs = path.join(
  root,
  'miniprogram',
  'subpackages',
  'scoring',
  'pages',
  'score',
  'index.js'
);
var hubJs = path.join(
  root,
  'miniprogram',
  'subpackages',
  'scoring',
  'pages',
  'hub',
  'index.js'
);
var hubCompatJs = path.join(root, 'miniprogram', 'pages', 'game', 'hub', 'index.js');
var homeJs = path.join(root, 'miniprogram', 'pages', 'home', 'index.js');
var appJson = path.join(root, 'miniprogram', 'app.json');
var seriesDetailJs = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'index.js'
);
var tournamentDetailJs = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail',
  'index.js'
);

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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

var matchState = require(path.join(utilsDir, 'matchState.js'));

(function testCleanHomeUrl() {
  var app = JSON.parse(read(appJson));
  assert(
    'CLEAN_HOME_URL 使用已注册首页路径',
    matchState.CLEAN_HOME_URL === '/pages/home/index?tab=my' &&
      Array.isArray(app.pages) &&
      app.pages.indexOf('pages/home/index') >= 0
  );
})();

(function testNavPlan() {
  var single = matchState.planNormalCreateSuccessNav({ isMulti: false, creatorInGame: true });
  assert(
    '单组 Score 返回使用干净首页计划',
    single.kind === 'replace_score' &&
      single.scoreReplace === true &&
      single.fromFlow === 'normalCreate' &&
      single.fromPage === 'home' &&
      single.scoreBack === 'relaunch_clean_home'
  );
  var multiIn = matchState.planNormalCreateSuccessNav({ isMulti: true, creatorInGame: true });
  assert(
    '多组 Score 返回 Hub',
    multiIn.kind === 'replace_hub_then_score' &&
      multiIn.scoreReplace === false &&
      multiIn.fromPage === 'gameHub' &&
      multiIn.scoreBack === 'hub' &&
      multiIn.hubBack === 'relaunch_clean_home'
  );
  var multiOut = matchState.planNormalCreateSuccessNav({ isMulti: true, creatorInGame: false });
  assert(
    '创建来源 Hub 返回使用干净首页计划',
    multiOut.fromFlow === 'normalCreate' &&
      multiOut.hubBack === 'relaunch_clean_home' &&
      multiOut.enterScore === false
  );
  assert(
    'shouldRelaunchCleanHomeFromScore 只认 fromFlow+fromPage，不认栈长度',
    matchState.shouldRelaunchCleanHomeFromScore({
      fromFlow: 'normalCreate',
      fromPage: 'home'
    }) === true &&
      matchState.shouldRelaunchCleanHomeFromScore({
        fromFlow: 'normalCreate',
        fromPage: 'gameHub'
      }) === false &&
      matchState.shouldRelaunchCleanHomeFromScore({
        fromFlow: 'quickCreate',
        fromPage: 'home'
      }) === false
  );
  var hubUrl = matchState.buildNormalCreateHubUrl('g-1', 2, true);
  assert(
    'Hub URL 明确传递 fromFlow=normalCreate',
    hubUrl.indexOf('/subpackages/scoring/pages/hub/index?gameId=g-1') === 0 &&
      hubUrl.indexOf('fromFlow=normalCreate') >= 0 &&
      hubUrl.indexOf('currentGroup=2') >= 0
  );
  assert(
    'isHubOpenedFromNormalCreate 认 query.fromFlow',
    matchState.isHubOpenedFromNormalCreate({ fromFlow: 'normalCreate' }) === true &&
      matchState.isHubOpenedFromNormalCreate({ from: 'score' }) === false &&
      matchState.isHubOpenedFromNormalCreate({}) === false
  );
})();

(function testEnterScoreReplace() {
  var src = read(path.join(utilsDir, 'matchState.js'));
  assert(
    'enterScorePage 支持 replace→redirectTo',
    /opts\.replace === true[\s\S]{0,200}wx\.redirectTo\(navOpts\)/.test(src)
  );
  assert(
    'enterScorePage 默认仍 navigateTo',
    /else \{\s*wx\.navigateTo\(navOpts\);/.test(src)
  );
  assert(
    '无 matchState/formatType 不跳转',
    /if \(!ms \|\| !ms\.formatType\)[\s\S]{0,300}return false;/.test(src)
  );
})();

(function testCreatePageWiring() {
  var src = read(createJs);
  var doStart = src.slice(src.indexOf('_doStart()'), src.indexOf('_doStart()') + 9000);
  assert(
    '校验失败先 return 且不加锁',
    /_validateBeforeSubmit[\s\S]*wx\.showToast[\s\S]*return;[\s\S]*_startNavLock/.test(doStart)
  );
  assert(
    '防连点逻辑保持',
    src.indexOf('this._startNavLock') >= 0 &&
      /if \(this\._startNavLock\) return;/.test(src)
  );
  assert(
    '单组创建成功 redirect 记分页',
    /enterScorePage\(\s*\{\s*replace:\s*true/.test(src)
  );
  assert(
    '多组参赛 redirect Hub 再 enterScorePage',
    /replace_hub_then_score[\s\S]*wx\.redirectTo[\s\S]*enterScorePage\(\)/.test(src)
  );
  assert(
    '不回创建页：成功路径不用 navigateTo Hub',
    !/_doStart[\s\S]*wx\.navigateTo\(\s*\{[\s\S]*game\/hub/.test(src)
  );
  assert(
    '创建页 onUnload 不 setData 改上一页',
    !/onUnload[\s\S]{0,800}getCurrentPages[\s\S]{0,400}setData/.test(src)
  );
})();

(function testScoreBack() {
  var src = read(scoreJs);
  assert(
    '单组 Score 返回走 shouldRelaunchCleanHomeFromScore',
    src.indexOf('shouldRelaunchCleanHomeFromScore') >= 0 &&
      src.indexOf('relaunch_clean_home') >= 0 &&
      src.indexOf('CLEAN_HOME_URL') >= 0
  );
  assert(
    '多组 Score 仍优先返回已有 Hub',
    /_returnToExistingGameHub[\s\S]*shouldRelaunchCleanHomeFromScore/.test(src)
  );
  assert(
    '不回创建页',
    src.indexOf('_isOrdinaryCreatePrevPage') >= 0 &&
      src.indexOf('subpackages/create/pages/normal/index') >= 0
  );
})();

(function testHubBack() {
  var src = read(hubJs);
  var onBack = src.slice(src.indexOf('onBack()'), src.indexOf('onBack()') + 1600);
  var stub = read(hubCompatJs);
  assert(
    '创建来源 Hub 返回干净首页，不看 pages.length',
    /_fromNormalCreateSuccess[\s\S]*reLaunch[\s\S]*CLEAN_HOME_URL/.test(onBack) &&
      onBack.indexOf('_fromNormalCreateSuccess') < onBack.indexOf('getCurrentPages')
  );
  assert(
    '非创建来源 Hub 返回行为不变',
    /if \(pages && pages\.length > 1\)[\s\S]*wx\.navigateBack/.test(onBack)
  );
  assert(
    'Hub 来源标记来自 fromFlow 而非栈猜测',
    src.indexOf('isHubOpenedFromNormalCreate') >= 0 &&
      src.indexOf('_fromNormalCreateSuccess') >= 0 &&
      src.indexOf('getCurrentPages().length') < 0
  );
  assert(
    '中间页进记分仍默认 navigateTo（不 replace）',
    src.indexOf("nav: 'enterScorePage/navigateTo'") >= 0 &&
      src.indexOf('enterScorePage({ replace') < 0 &&
      /enterScorePage\(\s*\)/.test(src)
  );
  assert(
    '旧主包 Hub 仅转发 query（含 fromFlow）到记分分包',
    stub.indexOf('/subpackages/scoring/pages/hub/index') >= 0 &&
      stub.indexOf('queryString(options)') >= 0
  );
})();

(function testHomeOverlayState() {
  var src = read(homeJs);
  assert(
    '首页 + 弹窗状态字段仍为 createOverlayVisible/Open',
    src.indexOf('createOverlayVisible: false') >= 0 &&
      src.indexOf('createOverlayOpen: false') >= 0 &&
      src.indexOf('moreCreateVisible: false') >= 0
  );
  assert(
    '普通创建入口先关弹窗再 navigateTo 创建页',
    /openNormalCreate\(\)[\s\S]{0,280}createOverlayVisible:\s*false[\s\S]{0,200}wx\.navigateTo[\s\S]{0,120}create\/pages\/normal/.test(
      src
    ) && src.indexOf('homeCreateOverlay') < 0
  );
})();

(function testSeriesUnchanged() {
  var seriesSrc = read(seriesDetailJs);
  var detailSrc = read(tournamentDetailJs);
  var enterMod = require(path.join(
    root,
    'miniprogram',
    'subpackages',
    'tournament',
    'utils',
    'teamMatchEnterGroupScore.js'
  ));
  var enterCalls = [];
  var match = {
    matchId: 'm-route',
    gameMode: '个人比杆赛',
    groups: [
      {
        groupId: 'g1',
        players: [{ userId: 'u1', playerId: 'u1', name: '甲' }]
      }
    ]
  };
  enterMod.enterViewerGroupScore(match, 'u1', {
    groupsStore: {
      ensureInitialized: function () {},
      getGroups: function () {
        return [];
      }
    },
    setMatchState: function () {},
    emptyScores: function () {
      return [];
    },
    enterScorePage: function (opts) {
      enterCalls.push(opts);
    }
  });
  assert(
    'Series 进记分仍走 enterViewerGroupScore → enterScorePage() 不 replace',
    seriesSrc.indexOf('teamMatchEnterGroupScore.enterViewerGroupScore') >= 0 &&
      seriesSrc.indexOf('enterScorePage({ replace') < 0 &&
      seriesSrc.indexOf('fromFlow=normalCreate') < 0
  );
  assert(
    '普通赛事详情进记分仍走同一入口且不 replace',
    detailSrc.indexOf('teamMatchEnterGroupScore.enterViewerGroupScore') >= 0 &&
      detailSrc.indexOf('enterScorePage({ replace') < 0 &&
      enterCalls.length === 1 &&
      enterCalls[0] == null
  );
})();

console.log('');
console.log('---- normalCreateScoreBackRoute.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
