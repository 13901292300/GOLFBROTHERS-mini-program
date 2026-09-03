/**
 * 球队赛事详情游戏 TAB：与 Hub 同类高度问题 + 沙盒 match-detail 映射。
 * 运行：node scripts/tournamentDetailGameTab.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    showToast: function () {}
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
var tournamentSnap = require('../miniprogram/subpackages/tournament/utils/sideGameHostSnapshot.js');

var mini = path.join(__dirname, '..', 'miniprogram');
var detailRoot = path.join(mini, 'subpackages/tournament/pages/detail');
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

function filled18(n) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(n);
  return a;
}

function gameHoles() {
  return catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function installRepo() {
  identity.setImplementation({
    implementation: 'local-preview',
    getCurrentUserId: function () {
      return 'me';
    }
  });
  var repo = localMod.createLocalSideGameRepository({
    storage: memStorage(),
    idGen: (function () {
      var n = 0;
      return function () {
        n += 1;
        return 'tdet_' + n;
      };
    })(),
    clock: function () {
      return 4000;
    }
  });
  facade.setImplementation(repo);
  return repo;
}

function teamMatch() {
  return {
    matchId: 'team-live-1',
    gameMode: '个人比杆赛',
    front9Course: 'C',
    back9Course: 'D',
    seriesContext: { seriesId: 'series-a', roundId: 'round-1' },
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'u1', playerId: 'u1', name: '甲' },
          { userId: 'u2', playerId: 'u2', name: '乙' },
          { userId: 'u3', playerId: 'u3', name: '丙' }
        ]
      },
      {
        groupId: 'g2',
        players: [
          { userId: 'u4', playerId: 'u4', name: '丁' },
          { userId: 'u5', playerId: 'u5', name: '戊' }
        ]
      }
    ],
    scoreData: {
      g1: {
        scoresByPlayer: {
          u1: { scores: filled18(4) },
          u2: { scores: filled18(5) },
          u3: { scores: filled18(4) }
        }
      },
      g2: {
        scoresByPlayer: {
          u4: { scores: filled18(6) },
          u5: { scores: filled18(4) }
        }
      }
    }
  };
}

function stroke2Instance(players) {
  return {
    catalogId: 'stroke-2',
    name: '比杆',
    players: players,
    pairings: [
      { id: 'pair-1', leftId: players[0].id, rightId: players[1].id, on: true, strokes: 0 }
    ],
    holes: gameHoles(),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

var wxml = fs.readFileSync(path.join(detailRoot, 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(detailRoot, 'index.wxss'), 'utf8');
var js = fs.readFileSync(path.join(detailRoot, 'index.js'), 'utf8');
var json = fs.readFileSync(path.join(detailRoot, 'index.json'), 'utf8');
var tabJs = fs.readFileSync(
  path.join(mini, 'subpackages/game/components/game-tab/index.js'),
  'utf8'
);
var tabWxss = fs.readFileSync(
  path.join(mini, 'subpackages/game/components/game-tab/index.wxss'),
  'utf8'
);
var tabWxml = fs.readFileSync(
  path.join(mini, 'subpackages/game/components/game-tab/index.wxml'),
  'utf8'
);
var commonWxss = fs.readFileSync(
  path.join(mini, 'styles/tournament-common.wxss'),
  'utf8'
);

var dockVis = require('../miniprogram/subpackages/game/utils/dockFootVisibility.js');
var boardLayout = require('../miniprogram/subpackages/game/utils/boardLayout.js');
var hubWxml = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/hub/index.wxml'), 'utf8');
var scoreWxml = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/score/index.wxml'), 'utf8');
var scoreWxss = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/score/index.wxss'), 'utf8');

assert('1 空态文案本场未开游戏', /本场未开游戏/.test(tabJs));
assert(
  '1 赛事详情游戏TAB不再使用ds-fullscreen',
  wxml.indexOf('detail-game-fullscreen') < 0 &&
    wxml.indexOf('ds-fullscreen') < 0 &&
    wxml.indexOf('detail-game-tab-host') < 0 &&
    wxss.indexOf('z-index: 131') < 0 &&
    wxss.indexOf('z-index:131') < 0
);
assert(
  '2 game-tab 使用 flow 模式',
  /layout-mode="flow"/.test(wxml) &&
    /layoutMode/.test(tabJs) &&
    /game-tab--flow/.test(tabWxss)
);
assert(
  '4 主scroll-view 可上下滚动（游戏在 detail-main 内）',
  wxml.indexOf('<game-tab') > 0 &&
    wxml.indexOf('id="detail-game-panel"') > wxml.indexOf('class="detail-scroll"') &&
    wxml.indexOf('id="detail-game-panel"') < wxml.indexOf('tab-scroll-wrap--fixed') &&
    /entry="match"/.test(wxml) &&
    /id="detail-game-panel"/.test(wxml)
);
assert('game-tab 异步占位仍为 view', /"game-tab": "view"/.test(json));
assert(
  '9 其它 TAB 仍在详情流内',
  /activeTab === 'details'/.test(wxml) &&
    /activeTab === 'register'/.test(wxml) &&
    /activeTab === 'groups'/.test(wxml) &&
    /activeTab === 'leaderboard'/.test(wxml) &&
    /activeTab === 'tee-sheet'/.test(wxml) &&
    /discussion-inline/.test(wxml)
);
assert(
  '10 sticky/锁滚/安全区公式仍在',
  /updateRegisterContentLockMetrics/.test(js) &&
    /computeGroupsPanelMinHeight/.test(js) &&
    /updateTabContentSpacer/.test(js) &&
    /env\(safe-area-inset-bottom\)/.test(commonWxss)
);
assert('详情不 require game JS', js.indexOf('subpackages/game/') < 0);
assert(
  '不复制 game-tab 看板样式',
  wxss.indexOf('board-simple-body') < 0 && /game-tab--fill/.test(tabWxss)
);
assert('5 横向逐洞表仍可横滑', /scroll-x/.test(tabWxml));
assert(
  'flow 不用 height:0 撑满一屏',
  /game-tab--flow[\s\S]*?height:\s*auto/.test(tabWxss) &&
    tabWxss.indexOf('100vh') < 0 &&
    /detail-game-panel/.test(wxss) &&
    wxss.indexOf('detail-game-panel') >= 0 &&
    !/detail-game-panel[\s\S]{0,120}100vh/.test(wxss)
);
assert(
  '11 MORE FAB 游戏TAB仍隐藏',
  /activeTab !== 'discussion' && activeTab !== 'game'/.test(wxml)
);

var snap = tournamentSnap.buildFromMatch(teamMatch(), { scope: 'match', allowBigPot: false });
assert('matchId=当前球队赛事', snap.matchId === 'team-live-1' && snap.scope === 'match');
assert('7 只带当前 roundId', snap.roundId === 'round-1' && snap.seriesId === 'series-a');
assert('6 Hub/详情 allowBigPot=false', snap.allowBigPot === false);
assert('不写某一组 groupId', snap.groupId === '');

var ctx = hostMod.buildFromHostSnapshot(snap);
assert('4 全场多组人员', ctx.scoreParties.length === 5, String(ctx.scoreParties.length));

installRepo();
hostSession.clearHostContext();
hostSession.setHostContext(ctx);
bind.attachHost(ctx);
assert('4 listPlayers(match)=5', bind.listPlayers('match').length === 5);
assert('5 不受 4 人上限', bind.getRuleLibraryCap('match') === 5);

var created = bind.addGame(
  'match',
  stroke2Instance([
    { id: 'u1', name: '甲' },
    { id: 'u4', name: '丁' }
  ])
);
assert('有记录可创建', !!(created && created.id));
assert('有游戏 listGames 非空', bind.listGames('match').length >= 1);
var board = bind.listBoard('match', created.id);
assert(
  '2 有游戏看板非空（非仅空态）',
  (board.players || []).length >= 2 &&
    (board.holes || []).some(function (h) {
      return (h.cells || []).some(function (c) {
        return c && c.text;
      });
    })
);
assert(
  '8 正式成绩进入格子',
  (board.holes || []).some(function (h) {
    return (h.cells || []).some(function (c) {
      return c && String(c.text).length > 0;
    });
  })
);
assert(
  '6 大锅饭不显示',
  bind.listGames('match').every(function (g) {
    return !(g.config && g.config.allowBigPot);
  })
);

var otherRound = hostMod.buildFromHostSnapshot(
  tournamentSnap.buildFromMatch(
    Object.assign({}, teamMatch(), {
      matchId: 'team-live-2',
      seriesContext: { seriesId: 'series-a', roundId: 'round-2' }
    }),
    { scope: 'match', allowBigPot: false }
  )
);
hostSession.setHostContext(otherRound);
bind.attachHost(otherRound);
assert('7 不跨 matchId/round', bind.listGames('match').length === 0);

hostSession.setHostContext(ctx);
bind.attachHost(ctx);
var vmMatch = bind.listBoard('match', created.id);
var vmHub = bind.listBoard('hub', created.id);
assert(
  '11 与沙盒 match/hub 同输入 ViewModel 一致',
  JSON.stringify(vmMatch.holes) === JSON.stringify(vmHub.holes)
);

assert('onShow/切 TAB 重建 snapshot', /_matchHostSnapshot/.test(js) && /onShow/.test(js));
assert('不回退旧 HostSession', /this\._host \|\| hostSession\.getHostContext/.test(tabJs) === false);
assert(
  '10 游戏 TAB 不改报名锁滚方法签名',
  /\n  updateRegisterContentLockMetrics\(/.test(js) &&
    /\n  computeGroupsPanelMinHeight\(/.test(js)
);

var natH = dockVis.estimateFlowBoardMinHeightPx(board, 375);
assert('3 有游戏时自然高度非0', natH > 0 && (board.holes || []).length > 0, String(natH));
assert(
  '3 不依赖 fill 的 height:0',
  /layoutIsFlow/.test(tabWxml) && /game-tab--flow/.test(tabWxss)
);

var vp = { top: 0, bottom: 700 };
var gameIn = { top: 200, bottom: 1400 };
var footBelow = { top: 1320, bottom: 1400 };
var footIn = { top: 620, bottom: 700 };
var gameOut = { top: -900, bottom: -40 };
assert(
  '6 自然汇总未出现时吸附显示',
  dockVis.shouldShowDockFoot({
    layoutIsFlow: true,
    tabIsGame: true,
    hasResults: true,
    gameRect: gameIn,
    footRect: footBelow,
    viewportTop: vp.top,
    viewportBottom: vp.bottom,
    bottomReserve: 34
  }) === true
);
assert(
  '7 自然汇总进入视口时吸附隐藏',
  dockVis.shouldShowDockFoot({
    layoutIsFlow: true,
    tabIsGame: true,
    hasResults: true,
    gameRect: gameIn,
    footRect: footIn,
    viewportTop: vp.top,
    viewportBottom: vp.bottom,
    bottomReserve: 34
  }) === false
);
assert(
  '8 游戏区域滚出视口后隐藏',
  dockVis.shouldShowDockFoot({
    layoutIsFlow: true,
    tabIsGame: true,
    hasResults: true,
    gameRect: gameOut,
    footRect: footBelow,
    viewportTop: vp.top,
    viewportBottom: vp.bottom,
    bottomReserve: 34
  }) === false
);
assert(
  '9 切其它TAB立即隐藏',
  dockVis.shouldShowDockFoot({
    layoutIsFlow: true,
    tabIsGame: false,
    hasResults: true,
    gameRect: gameIn,
    footRect: footBelow,
    viewportTop: vp.top,
    viewportBottom: vp.bottom,
    bottomReserve: 34
  }) === false &&
    /activeTab === 'game'/.test(wxml) &&
    /_syncGameDock/.test(js)
);
assert(
  '10 safeArea 距离正确',
  /env\(safe-area-inset-bottom\)/.test(tabWxss) &&
    /register-cta-bar/.test(tabWxss) &&
    dockVis.resolveBottomReserve({ safeAreaInsets: { bottom: 34 }, tabBarHeight: 0 }) === 34 &&
    dockVis.resolveBottomReserve({
      safeAreaInsets: { bottom: 34 },
      tabBarHeight: 48
    }) === 82
);
assert(
  '12 Hub 的 fill 模式不受影响',
  /ds-fullscreen/.test(hubWxml) &&
    /layout-mode="fill"/.test(hubWxml) &&
    /hub-game-tab-host/.test(hubWxml) &&
    /game-tab--fill/.test(tabWxss) &&
    /height:\s*0/.test(tabWxss)
);
assert(
  '13 其它详情TAB不回归',
  /updateRegisterContentLockMetrics/.test(js) &&
    /computeGroupsPanelMinHeight/.test(js) &&
    /setupTeeObserver/.test(js) &&
    /measureMpSbSummaryTop/.test(js) &&
    /measureWatchersTop/.test(js)
);
assert(
  '切回游戏TAB重新测量',
  /if \(tab === 'game'\) \{/.test(js) &&
    /_syncGameDock/.test(js) &&
    /if \(this\.data\.activeTab === 'game'\) wx\.nextTick/.test(js)
);
assert('吸附行复用 board.totals', /board\.totals/.test(tabWxml) && /register-cta-bar/.test(tabWxml));

var gameUi = fs.readFileSync(
  path.join(mini, 'subpackages/game/styles/game-ui.wxss'),
  'utf8'
);
var two = boardLayout.buildBoardLayout(2, 375);
var four = boardLayout.buildBoardLayout(4, 375);
var five = boardLayout.buildBoardLayout(5, 375);
var eight = boardLayout.buildBoardLayout(8, 375);
assert(
  'V1 记分页与赛事详情同一表格核心 class',
  /board-simple-head/.test(tabWxml) &&
    /board-cell--hole/.test(tabWxml) &&
    /board-cell--hole \{\s*width:\s*168rpx/.test(gameUi) &&
    scoreWxml.indexOf('<game-tab') >= 0 &&
    /host-snapshot/.test(scoreWxml)
);
assert(
  'V2 flow 宿主无双重水平 padding',
  /activeTab === 'discussion' \|\| activeTab === 'game'/.test(wxml) &&
    /detail-main--flush/.test(wxml) &&
    /padding:\s*0/.test(wxss.match(/\.detail-game-panel\s*\{[\s\S]*?\}/)[0]) &&
    !/game-tab--flow[\s\S]{0,180}padding-left/.test(tabWxss)
);
assert('V3 2人时无 scroll-x 溢出', two.needHScroll === false && two.tableWidthPx === 375);
assert(
  'V4 4人时完整适配容器',
  four.needHScroll === false && four.tableWidthPx === 375 && four.colPx > 0
);
assert(
  'V5 5人时内容宽度超过容器并可横滑',
  five.needHScroll === true && five.bodyWidthPx + five.holePx > 375
);
assert(
  'V6 8人时仍从 scrollLeft=0 开始',
  eight.needHScroll === true &&
    /boardHScrollLeft:\s*0/.test(tabJs) &&
    /scroll-left="\{\{boardHScrollLeft\}\}"/.test(tabWxml)
);
assert(
  'V7 左边缘与记分页计算值一致',
  two.holePx === four.holePx &&
    two.holePx === boardLayout.buildBoardLayout(2, 375).holePx &&
    /score-main/.test(scoreWxss) &&
    !/\.score-main\s*\{[^}]*padding-left/.test(scoreWxss)
);
assert(
  'V8 首列不重复占位',
  /board-flow-head/.test(tabWxml) &&
    /wx:if="\{\{!layoutIsFlow\}\}"/.test(tabWxml) &&
    /class="board-frame"/.test(tabWxml)
);
assert(
  'V9 自然汇总和吸附汇总列宽一致',
  /board\.totals/.test(tabWxml) &&
    /colPx/.test(tabWxml) &&
    tabWxml.indexOf('register-cta-bar') > 0 &&
    /style="\{\{item\.fitStyle\}\}"/.test(tabWxml)
);
assert(
  'V10 Hub fill 模式不回归',
  /layout-mode="fill"/.test(hubWxml) && /ds-fullscreen/.test(hubWxml)
);

var chrome = require('../miniprogram/subpackages/game/utils/flowStickyChrome.js');
var tabBottom = 142;
var pinH = 48;
var headH = 60;
var mid = chrome.computeFlowSticky({
  layoutIsFlow: true,
  tabIsGame: true,
  hasResults: true,
  tabBottom: tabBottom,
  pinHeight: pinH,
  headHeight: headH,
  pinSlotRect: { top: 140, bottom: 188 },
  headSlotRect: { top: 188, bottom: 248 },
  gameRect: { top: 100, bottom: 900 }
});
assert('S1 主TAB 第一层吸顶 top 来自 header+tabBar', /isStickyTab/.test(js) && /headerTotalHeight/.test(js) && /setFlowTabBottom/.test(tabJs));
assert('S2 配置行吸附在 TAB 下方', mid.pinStuck === true && mid.pinTop === tabBottom);
assert('S3 表头吸附在配置行下方', mid.headStuck === true && mid.headTop === tabBottom + pinH);
assert(
  'S4 三层 top 连续无重叠',
  chrome.topsAreContinuous(tabBottom, mid.pinTop, pinH, mid.headTop) === true &&
    /z-index:\s*125/.test(tabWxss) &&
    /z-index:\s*130/.test(commonWxss)
);
var topState = chrome.computeFlowSticky({
  layoutIsFlow: true,
  tabIsGame: true,
  hasResults: true,
  tabBottom: 0,
  pinHeight: pinH,
  headHeight: headH,
  pinSlotRect: { top: 400, bottom: 448 },
  headSlotRect: { top: 448, bottom: 508 },
  gameRect: { top: 380, bottom: 1200 }
});
assert('S5 返回顶部恢复自然布局', topState.pinStuck === false && topState.headStuck === false);
assert('S6 resize 后重新测量', /onResize\(/.test(js) && /_syncGameDock/.test(js));
assert(
  'S7 1V1 子菜单高度变化后重新测量',
  /toggleFold/.test(tabJs) && /toggleGameMenu/.test(tabJs) && /syncDockFromLayout/.test(tabJs)
);
assert('S8 4人以内无横滑', four.needHScroll === false);
assert(
  'S9 5/8人表头正文汇总 scrollLeft 同步',
  five.needHScroll === true &&
    eight.needHScroll === true &&
    (tabWxml.match(/scroll-left="\{\{boardHScrollLeft\}\}"/g) || []).length >= 2 &&
    /onBoardHScroll/.test(tabJs)
);
assert(
  'S10 有结果时仍受报名 CTA 阈值约束',
  chrome.shouldAlwaysDockFoot({ layoutIsFlow: true, tabIsGame: true, hasResults: true }) === true &&
    /ctaHidden/.test(tabJs) &&
    /hideRegisterCTA/.test(wxml)
);
assert(
  'S11 自然汇总在 flow 隐藏',
  /wx:if="\{\{!layoutIsFlow\}\}"[\s\S]*board-simple-foot/.test(tabWxml) ||
    /wx:if="\{\{!layoutIsFlow\}\}" class="board-simple-foot/.test(tabWxml)
);
assert('S12 底部 spacer', /board-flow-foot-spacer/.test(tabWxml) && /flowFootSpacerPx/.test(tabJs));
assert(
  'S13 safeArea 正确',
  /env\(safe-area-inset-bottom\)/.test(tabWxss) && /register-cta-bar/.test(tabWxss)
);
assert(
  'S14 切其它 TAB 固定汇总消失',
  chrome.shouldAlwaysDockFoot({ layoutIsFlow: true, tabIsGame: false, hasResults: true }) === false &&
    /activeTab === 'game'/.test(wxml)
);
assert(
  'S15 无结果时不显示',
  chrome.shouldAlwaysDockFoot({ layoutIsFlow: true, tabIsGame: true, hasResults: false }) === false
);
assert(
  'S16 Hub fill 不变',
  /layout-mode="fill"/.test(hubWxml) && /ds-fullscreen/.test(hubWxml) && !/layout-mode="flow"/.test(hubWxml)
);
assert(
  'S17 记分页游戏 TAB 不变',
  scoreWxml.indexOf('layout-mode="flow"') < 0 && /<game-tab/.test(scoreWxml)
);
assert(
  'S18 主 TAB 和配置按钮可点击',
  /catchtap="onManage"/.test(tabWxml) &&
    /bindtap="switchTab"/.test(wxml) &&
    /z-index:\s*125/.test(tabWxss)
);

assert(
  'C1 游戏汇总使用报名 dock 容器/样式',
  /register-cta-bar/.test(tabWxml) &&
    /register-cta-bar/.test(tabWxss) &&
    /z-index:\s*120/.test(tabWxss) &&
    /z-index:\s*120/.test(wxss)
);
assert(
  'C2 阈值函数与报名按钮一致',
  /_calcHideRegisterCTA\(scrollTop, sticky\)/.test(js) &&
    /\(screenH - tabBottom\) <= 100/.test(js) &&
    /activeTab === 'game'/.test(js)
);
assert(
  'C3/C4/C5 跨阈值显隐走 hideRegisterCTA',
  /hideRegisterCTA/.test(js) &&
    /cta-hidden="\{\{hideRegisterCTA\}\}"/.test(wxml) &&
    /!this\.properties\.ctaHidden/.test(tabJs)
);
assert(
  'C6 safeArea 与报名按钮一致',
  /calc\(16rpx \+ env\(safe-area-inset-bottom\)\)/.test(wxss) &&
    /calc\(16rpx \+ env\(safe-area-inset-bottom\)\)/.test(tabWxss)
);
assert('C7 resize 后重新判断', /onResize\(/.test(js) && /_syncGameDock/.test(js) && /_syncStickyByScroll/.test(js));
assert(
  'C8 切其它 TAB 立即隐藏',
  /activeTab === 'game'/.test(wxml) &&
    /tab !== 'register' && tab !== 'groups' && tab !== 'game'/.test(js)
);
assert(
  'C9 无结果隐藏',
  chrome.shouldAlwaysDockFoot({ layoutIsFlow: true, tabIsGame: true, hasResults: false }) === false
);
assert(
  'C10 无 inline 汇总、仅 dock（与报名一致）',
  /wx:if="\{\{!layoutIsFlow\}\}" class="board-simple-foot/.test(tabWxml) &&
    /register-cta-bar game-cta-bar/.test(tabWxml)
);
assert(
  'C11 底部 spacer 不遮挡',
  /board-flow-foot-spacer/.test(tabWxml) && /computeFootSpacerPx/.test(tabJs)
);
assert(
  'C12 ≥5人横滑仍三行同步',
  five.needHScroll === true && (tabWxml.match(/scroll-left="\{\{boardHScrollLeft\}\}"/g) || []).length >= 2
);
assert(
  'C13 顶部三层吸顶不回归',
  /setFlowTabBottom/.test(tabJs) && /board-pin--stuck/.test(tabWxss) && /board-head--stuck/.test(tabWxss)
);
assert(
  'C14 Hub/记分页不变',
  /layout-mode="fill"/.test(hubWxml) && scoreWxml.indexOf('layout-mode="flow"') < 0
);

console.log('\ntournamentDetailGameTab.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
