/**
 * 多轮莱德杯同时 LIVE：出发表短内容须能滚到 TAB / Rx dock 吸顶阈值
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesScheduleMultiLiveSticky.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

if (typeof global.Page !== 'function') {
  global.Page = function () {};
}
if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return null;
  };
}

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var page = require(path.join(pageDir, 'index.js'));
var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));

var computeStickyFiller = page.computeStickyFiller;
var computeFillerCorrection = page.computeFillerCorrection;
var computeScrollHeightWithoutFiller = page.computeScrollHeightWithoutFiller;
var resolveFillerTargetStickyOffset = page.resolveFillerTargetStickyOffset;
var computeSecondaryStickyThreshold = page.computeSecondaryStickyThreshold;
var calcIsStickyRoundSelector = page.calcIsStickyRoundSelector;
var calcIsStickyTab = function (scrollTop, tabOffsetTop) {
  var top = Number(scrollTop);
  var th = Number(tabOffsetTop);
  if (!Number.isFinite(top)) top = 0;
  if (!Number.isFinite(th) || th <= 0) return false;
  return top >= th;
};
var TOL = page.SCROLL_FILLER_TOLERANCE_PX;

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

function extractFn(src, name) {
  var re = new RegExp(name + ':\\s*function\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\},');
  var m = String(src || '').match(re);
  return m ? m[0] : '';
}

function maxScrollTop(scrollHeight, viewportHeight) {
  return Math.max(0, Number(scrollHeight) - Number(viewportHeight));
}

var LAYOUT = {
  viewportHeight: 667,
  tabOffsetTop: 320,
  roundSelectorOffsetTop: 400,
  stickyRoundSelectorTop: 136,
  scrollRectTop: 88
};

var secondary = computeSecondaryStickyThreshold(
  LAYOUT.roundSelectorOffsetTop,
  LAYOUT.stickyRoundSelectorTop,
  LAYOUT.scrollRectTop
);
var target = resolveFillerTargetStickyOffset(
  'schedule',
  false,
  LAYOUT.tabOffsetTop,
  secondary,
  true
);

function layoutForBase(baseScrollHeight, currentFiller) {
  var filler = computeStickyFiller({
    viewportHeight: LAYOUT.viewportHeight,
    scrollHeightWithoutFiller: baseScrollHeight,
    targetStickyOffset: target,
    tolerance: TOL
  });
  var actualSh = baseScrollHeight + filler;
  var maxTop = maxScrollTop(actualSh, LAYOUT.viewportHeight);
  var correction = computeFillerCorrection({
    viewportHeight: LAYOUT.viewportHeight,
    actualScrollHeight: actualSh,
    targetStickyOffset: target,
    currentFillerHeight: filler,
    tolerance: TOL
  });
  var stickyTab = calcIsStickyTab(maxTop, LAYOUT.tabOffsetTop);
  var stickyDock = calcIsStickyRoundSelector({
    activeTab: 'schedule',
    scheduleAvailable: true,
    isStickyTab: stickyTab,
    roundSelectorOffsetTop: LAYOUT.roundSelectorOffsetTop,
    stickyRoundSelectorTop: LAYOUT.stickyRoundSelectorTop,
    scrollRectTop: LAYOUT.scrollRectTop,
    scrollTop: maxTop
  });
  void currentFiller;
  return {
    filler: filler,
    actualSh: actualSh,
    maxTop: maxTop,
    correction: correction,
    stickyTab: stickyTab,
    stickyDock: stickyDock
  };
}

var SHORT_R2 = 520;
var LONG_R1 = 1800;

assert(
  'A 两轮 LIVE、当前短内容：maxScrollTop >= secondary + tolerance',
  (function () {
    var without = maxScrollTop(SHORT_R2, LAYOUT.viewportHeight);
    var laid = layoutForBase(SHORT_R2, 0);
    return (
      without + 1e-6 < target + TOL &&
      laid.maxTop + 1e-6 >= target + TOL &&
      laid.correction.satisfies === true &&
      laid.stickyTab === true &&
      laid.stickyDock === true
    );
  })(),
  'secondary=' + secondary + ' target=' + target
);

assert(
  'B 两轮都有长成绩：filler 可缩小/归零且仍能吸顶',
  (function () {
    var laid = layoutForBase(LONG_R1, 0);
    return (
      laid.filler === 0 &&
      laid.maxTop + 1e-6 >= target + TOL &&
      laid.stickyTab === true &&
      laid.stickyDock === true
    );
  })()
);

function makeRyder(matches) {
  return {
    seriesId: 's-ryder-ml',
    publishToken: 'pt-ml',
    lifecycleStatus: 'published',
    templateId: 'ryder',
    seriesType: 'ryder',
    hostMode: 'organization',
    rounds: [
      { roundId: 'r1', index: 1, name: 'R1', matchId: 'm1', gameMode: '四人四球赛' },
      { roundId: 'r2', index: 2, name: 'R2', matchId: 'm2', gameMode: '四人四球赛' }
    ]
  };
}

function liveMatch(mid, rid, groups) {
  return {
    matchId: mid,
    status: 'ongoing',
    gameMode: '四人四球赛',
    seriesContext: {
      managed: true,
      seriesId: 's-ryder-ml',
      roundId: rid,
      publishToken: 'pt-ml'
    },
    groups: groups || [],
    pairings: {},
    registerInfo: { totalCount: 0, users: [] }
  };
}

var store = {
  m1: liveMatch('m1', 'r1', [
    {
      groupId: 'g1',
      groupName: '第1组',
      teeTime: '08:00',
      startHole: 1,
      players: [
        { position: 1, userId: 'a1', name: '甲' },
        { position: 2, userId: 'b1', name: '乙' }
      ]
    }
  ]),
  m2: liveMatch('m2', 'r2', [
    {
      groupId: 'g9',
      groupName: '第1组',
      players: [
        { position: 1, userId: 'c1', name: '丙' },
        { position: 2, userId: 'd1', name: '丁' }
      ]
    }
  ])
};
var indexBag = {
  m1: { seriesId: 's-ryder-ml', roundId: 'r1', matchId: 'm1' },
  m2: { seriesId: 's-ryder-ml', roundId: 'r2', matchId: 'm2' }
};

function buildSched(selected) {
  return scheduleVm.buildSeriesScheduleViewModel({
    series: makeRyder(),
    selectedRoundId: selected,
    lifecycleAccess: { lifecycleStatus: 'published' },
    canManageGroups: true,
    canStartMatch: true,
    getMatchById: function (id) {
      return store[String(id)] || null;
    },
    getIndexByMatchId: function (id) {
      return indexBag[String(id)] || null;
    }
  });
}

var schedR1 = buildSched('r1');
var schedR2 = buildSched('r2');

assert(
  'C 切轮 selectedKey/matchId/group 不串轮，投影不写 scrollTop',
  schedR1.selectedKey === 'r1' &&
    schedR2.selectedKey === 'r2' &&
    schedR1.matchId === 'm1' &&
    schedR2.matchId === 'm2' &&
    (schedR1.teeGroups[0] && schedR1.teeGroups[0].groupId) !==
      (schedR2.groupCards[0] && schedR2.groupCards[0].groupId
        ? schedR2.groupCards[0].groupId
        : (schedR2.teeGroups[0] && schedR2.teeGroups[0].groupId)) &&
    extractFn(pageJs, '_rebuildScheduleProjection').indexOf('scrollTop:') < 0 &&
    extractFn(pageJs, 'onScheduleRoundTap').indexOf('scrollTop:') < 0
);

assert(
  'C 长→短 / 短→长 filler 按新内容重算且不累加旧 filler',
  (function () {
    var longLaid = layoutForBase(LONG_R1, 0);
    var shortFromLongCache = layoutForBase(
      SHORT_R2,
      longLaid.filler
    );
    var longFromShort = layoutForBase(LONG_R1, shortFromLongCache.filler);
    var derivedShort = computeScrollHeightWithoutFiller(
      SHORT_R2 + shortFromLongCache.filler,
      shortFromLongCache.filler
    );
    return (
      shortFromLongCache.maxTop + 1e-6 >= target + TOL &&
      longFromShort.filler === 0 &&
      derivedShort === SHORT_R2 &&
      shortFromLongCache.filler + longLaid.filler !== shortFromLongCache.filler * 2
    );
  })()
);

assert(
  'D 已吸顶切短内容：filler 后仍能维持阈值，恢复最多一次',
  (function () {
    var beforeTop = target;
    var withoutFillerMax = maxScrollTop(SHORT_R2, LAYOUT.viewportHeight);
    var laid = layoutForBase(SHORT_R2, 0);
    var restored = false;
    function restoreOnce(current, wasSecondarySticky) {
      if (restored) return current;
      var want = beforeTop;
      if (wasSecondarySticky && target > 0) want = Math.max(want, target);
      var stickyLost = wasSecondarySticky && current < target;
      var clampedDown = current + 0.5 < beforeTop;
      if (!stickyLost && !clampedDown) return current;
      restored = true;
      return want;
    }
    var afterClamp = Math.min(beforeTop, withoutFillerMax);
    var once = restoreOnce(afterClamp, true);
    var twice = restoreOnce(once, true);
    return (
      withoutFillerMax + 1e-6 < target &&
      laid.maxTop + 1e-6 >= target + TOL &&
      once >= target &&
      twice === once &&
      restored === true &&
      pageJs.indexOf('_captureScrollLayoutAnchor') >= 0 &&
      extractFn(pageJs, '_rebuildScheduleProjection').indexOf(
        '_captureScrollLayoutAnchor'
      ) >= 0 &&
      extractFn(pageJs, '_restoreScrollLayoutAnchorIfNeeded').indexOf(
        'a.restored'
      ) >= 0
    );
  })()
);

assert(
  'E 快速切轮只让最后一次测量 token 生效',
  (function () {
    var token = 0;
    var applied = [];
    function schedule(key) {
      token += 1;
      var mine = token;
      return function () {
        if (mine !== token) return false;
        applied.push(key);
        return true;
      };
    }
    var first = schedule('r1');
    var second = schedule('r2');
    first();
    second();
    var helper = extractFn(pageJs, 'scheduleScheduleContentFillerMeasure');
    return (
      applied.join(',') === 'r2' &&
      helper.indexOf('_activeTab !== \'schedule\'') >= 0 &&
      helper.indexOf('_fillerMeasureToken') >= 0 &&
      helper.indexOf('token !== self._fillerMeasureToken') >= 0 &&
      helper.indexOf('updateScrollFillerHeight') >= 0 &&
      helper.indexOf('measureTabTop') < 0 &&
      helper.indexOf('measureRoundSelectorTop') < 0
    );
  })()
);

var rebuildFn = extractFn(pageJs, '_rebuildScheduleProjection');
var standingsRebuild = extractFn(pageJs, '_rebuildStandingsProjection');
var standingsTap = extractFn(pageJs, 'onStandingsRoundTap');

function buildOrdinary(mode) {
  var series = {
    seriesId: 's-' + mode,
    publishToken: 'pt-ord',
    lifecycleStatus: 'published',
    templateId: 'inter_team_series',
    scoringMode: mode,
    hostMode: 'organization',
    rounds: [
      { roundId: 'r1', index: 1, name: 'R1', matchId: 'om1', gameMode: '个人比杆赛' },
      { roundId: 'r2', index: 2, name: 'R2', matchId: 'om2', gameMode: '个人比杆赛' }
    ]
  };
  var bag = {
    om1: { seriesId: series.seriesId, roundId: 'r1', matchId: 'om1' },
    om2: { seriesId: series.seriesId, roundId: 'r2', matchId: 'om2' }
  };
  var matches = {
    om1: {
      matchId: 'om1',
      status: 'registering',
      gameMode: '个人比杆赛',
      seriesContext: {
        managed: true,
        seriesId: series.seriesId,
        roundId: 'r1',
        publishToken: 'pt-ord'
      },
      groups: [],
      pairings: {},
      registerInfo: { totalCount: 0, users: [] }
    },
    om2: {
      matchId: 'om2',
      status: 'registering',
      gameMode: '个人比杆赛',
      seriesContext: {
        managed: true,
        seriesId: series.seriesId,
        roundId: 'r2',
        publishToken: 'pt-ord'
      },
      groups: [],
      pairings: {},
      registerInfo: { totalCount: 0, users: [] }
    }
  };
  return scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: 'r2',
    lifecycleAccess: { lifecycleStatus: 'published' },
    canManageGroups: true,
    canStartMatch: true,
    getMatchById: function (id) {
      return matches[String(id)] || null;
    },
    getIndexByMatchId: function (id) {
      return bag[String(id)] || null;
    }
  });
}

var singleRound = scheduleVm.buildSeriesScheduleViewModel({
  series: {
    seriesId: 's-ryder-1',
    publishToken: 'pt-ml',
    lifecycleStatus: 'published',
    templateId: 'ryder',
    seriesType: 'ryder',
    hostMode: 'organization',
    rounds: [
      { roundId: 'r1', index: 1, name: 'R1', matchId: 'm1', gameMode: '四人四球赛' }
    ]
  },
  selectedRoundId: 'r1',
  lifecycleAccess: { lifecycleStatus: 'published' },
  canManageGroups: true,
  canStartMatch: true,
  getMatchById: function (id) {
    return store[String(id)] || null;
  },
  getIndexByMatchId: function (id) {
    return indexBag[String(id)] || null;
  }
});

var globalM = buildOrdinary('global_m');
var perRoundN = buildOrdinary('per_round_n');
var reloadSlice = pageJs.slice(
  pageJs.indexOf('reloadViewModel: function'),
  pageJs.indexOf('_rebuildScheduleProjection: function')
);

assert(
  'F 单轮/普通 Series 与得分榜切轮不受影响',
  rebuildFn.indexOf('scheduleScheduleContentFillerMeasure') >= 0 &&
    rebuildFn.indexOf('measureTabTop(') < 0 &&
    rebuildFn.indexOf('measureRoundSelectorTop(') < 0 &&
    rebuildFn.indexOf('reloadViewModel') < 0 &&
    standingsRebuild.indexOf('scheduleScheduleContentFillerMeasure') < 0 &&
    standingsTap.indexOf('scheduleScheduleContentFillerMeasure') < 0 &&
    extractFn(pageJs, 'onScheduleRoundTap').indexOf('_rebuildScheduleProjection') >= 0 &&
    pageJs.indexOf("if (this._activeTab !== 'schedule') return") >= 0 &&
    singleRound.selectedKey === 'r1' &&
    singleRound.matchId === 'm1' &&
    globalM.selectedKey === 'r2' &&
    globalM.matchId === 'om2' &&
    perRoundN.selectedKey === 'r2' &&
    perRoundN.matchId === 'om2' &&
    reloadSlice.indexOf('measureTabTop') >= 0 &&
    reloadSlice.indexOf('scheduleScheduleContentFillerMeasure') < 0
);

assert(
  '接线：setData 回调/nextTick 后测量，投影不写 filler',
  rebuildFn.indexOf('_safeSetData(patch') >= 0 &&
    rebuildFn.indexOf('wx.nextTick') >= 0 &&
    rebuildFn.indexOf('delete patch.scrollFillerHeight') >= 0 &&
    rebuildFn.indexOf('delete patch.scrollTop') >= 0 &&
    rebuildFn.indexOf('delete patch.isStickyRoundSelector') >= 0 &&
    /scheduleScheduleContentFillerMeasure:\s*function[\s\S]*?_activeTab !== 'schedule'/.test(
      pageJs
    )
);

console.log('');
console.log('seriesScheduleMultiLiveSticky.selftest: passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
