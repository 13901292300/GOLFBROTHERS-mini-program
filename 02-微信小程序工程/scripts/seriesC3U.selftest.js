/**
 * Patch C3-U：报名性别行 + Series M 单轮布局
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesC3U.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var moreMenu = require(path.join(utilsDir, 'teamMatchMoreMenu.js'));
var gate = require(path.join(utilsDir, 'seriesStationManageGate.js'));
var sheetVm = require(path.join(pageDir, 'seriesManageSheetViewModel.js'));
var registerVm = require(path.join(pageDir, 'seriesRegisterViewModel.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var sheetVmSrc = fs.readFileSync(
  path.join(pageDir, 'seriesManageSheetViewModel.js'),
  'utf8'
);
var commonWxss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'styles', 'tournament-common.wxss'),
  'utf8'
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

function visiblePermIndex(list, permission) {
  for (var i = 0; i < (list || []).length; i++) {
    var f = list[i];
    if (f && f.permission === permission && !f.placeholder && !f.empty) return i;
  }
  return -1;
}

// 1–3 报名昵称/性别
(function rosterGender() {
  var nameRule = pageWxss.match(/\.roster-name\s*\{[\s\S]*?\}/);
  var nameCss = nameRule ? nameRule[0] : '';
  assert(
    '1 昵称与性别位于同一 inline-flex 容器',
    pageWxml.indexOf('roster-player-name-line') >= 0 &&
      /roster-player-name-line\s*\{[\s\S]*?display:\s*inline-flex/.test(pageWxss) &&
      /roster-name[\s\S]{0,160}roster-gender/.test(pageWxml)
  );
  assert(
    '2 昵称节点不得以 flex:1 推开性别',
    !!nameCss &&
      /flex:\s*0\s+1\s+auto|flex:\s*none|max-width:\s*100%/.test(nameCss) &&
      !/flex:\s*1(?!\s*0)/.test(nameCss)
  );
  var unknown = registerVm.projectDisplayUser(
    { playerNameSnapshot: '无名', genderSnapshot: '' },
    0
  );
  assert(
    '3 未知性别无占位（icon 空且 WXML wx:if）',
    unknown.genderIcon === '' &&
      /wx:if="\{\{item\.genderIcon\}\}"/.test(pageWxml)
  );
})();

// 4–8 M 面板布局
assert('4 M 保留「普通功能」', pageWxml.indexOf('fst-main">普通功能') >= 0);
assert(
  '5 M 不再渲染「本轮管理」标题',
  pageWxml.indexOf('fst-main">本轮管理') < 0 &&
    sheetVmSrc.indexOf("headline = '本轮管理'") < 0 &&
    sheetVmSrc.indexOf("featuresSectionCommonMain: '本轮管理'") < 0
);
assert(
  '6 本轮管理与上方使用同一 grid class',
  (pageWxml.match(/class="series-manage-feature-grid"/g) || []).length >= 3 &&
    pageWxml.indexOf('wx:for="{{seriesManageFeaturesCommon}}"') >= 0 &&
    pageWxml.indexOf('wx:for="{{roundManageSection.featuresPermission}}"') >= 0 &&
    pageWxml.indexOf('series-manage-round-section') >= 0 &&
    /series-manage-feature-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/.test(
      pageWxss
    )
);
assert(
  '7 本轮不存在独立 lifecycle/start 按钮容器',
  pageWxml.indexOf('series-manage-lifecycle-actions') < 0 &&
    pageWxml.indexOf('wx:for="{{roundManageSection.lifecycleActions}}"') < 0 &&
    pageWxss.indexOf('lifecycle-actions') < 0 &&
    sheetVmSrc.indexOf('SERIES_ROUND_TAIL_REGISTERING') >= 0
);

(function startAfterPayment() {
  var series = {
    seriesId: 's1',
    seriesType: 'team',
    hostMode: 'organization',
    hostOrganizationId: 'org-1',
    organizationId: 'org-1',
    createdBy: 'admin-1',
    publishToken: 'tok',
    lifecycleStatus: 'published',
    registrationState: 'open',
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        name: '首轮',
        dateTime: '2026-08-01 07:30',
        matchId: 'm1'
      }
    ]
  };
  var match = {
    matchId: 'm1',
    matchType: 'inter-team',
    status: 'registering',
    createdBy: 'admin-1',
    organizationId: 'org-1',
    registrationStatus: 'closed',
    gameMode: '个人比杆赛',
    seriesContext: {
      managed: true,
      seriesId: 's1',
      roundId: 'r1',
      publishToken: 'tok'
    }
  };
  var r1Gate = gate.verifyManagedStationForManage({
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return match;
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1', matchId: 'm1' };
    }
  });
  var sheet = sheetVm.buildSeriesManageSheetViewModel({
    series: series,
    user: { userId: 'admin-1', name: 'Admin' },
    canManageSeries: true,
    canRegisterForOther: true,
    selectedRoundId: 'r1',
    gate: r1Gate,
    getMatchById: function () {
      return match;
    }
  });
  var list = sheet.roundSection.featuresPermission || [];
  var pay = visiblePermIndex(list, 'manage_payment');
  var start = visiblePermIndex(list, 'start_match');
  var ryderExclusive = list.some(function (f) {
    return f && /ryder/i.test(String(f.permission || '') + String(f.label || ''));
  });
  assert(
    '8 开始按钮紧跟收费管理，位于同一数组和同一网格',
    pay >= 0 &&
      start >= 0 &&
      sheet.roundSection.lifecycleActions.length === 0 &&
      !ryderExclusive &&
      pageJs.indexOf("permission === 'start_match'") >= 0,
    'pay=' + pay + ' start=' + start + ' len=' + list.length + ' gate=' + !!(r1Gate && r1Gate.ok)
  );

  var completedSeries = Object.assign({}, series, {
    competitionPhaseCache: 'completed',
    completedAt: '2026-08-01T12:00:00.000Z'
  });
  var completedMatch = Object.assign({}, match, { status: 'finished' });
  var completedGate = gate.verifyManagedStationForManage({
    series: completedSeries,
    roundId: 'r1',
    getMatchById: function () {
      return completedMatch;
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1', matchId: 'm1' };
    }
  });
  var completedSheet = sheetVm.buildSeriesManageSheetViewModel({
    series: completedSeries,
    user: { userId: 'admin-1', name: 'Admin' },
    canManageSeries: true,
    canRegisterForOther: true,
    selectedRoundId: 'r1',
    gate: completedGate,
    getMatchById: function () {
      return completedMatch;
    }
  });
  var completedList = completedSheet.roundSection.featuresPermission || [];
  assert(
    '8b 已完成轮不投影开始本轮',
    visiblePermIndex(completedList, 'start_match') < 0,
    'start=' + visiblePermIndex(completedList, 'start_match')
  );
})();

// 9–10 权限/写入不变（静态：不改 handler 键与写入入口）
assert(
  '9 普通用户/管理员权限矩阵接线不变',
  pageJs.indexOf('canRegisterForOther') >= 0 &&
    pageJs.indexOf('canManageRegistration') >= 0 &&
    pageJs.indexOf('_isSeriesManageActor') >= 0 &&
    /onSeriesManageFeatureTap:[\s\S]{0,400}_isSeriesManageActor/.test(pageJs) &&
    pageWxml.indexOf('seriesManageCanManage && roundManageSection.hasSelection') >= 0
);
assert(
  '10 事件 permission key 与写入链路入口不变',
  pageJs.indexOf("permission === 'start_match'") >= 0 &&
    pageJs.indexOf("permission === 'manage_payment'") >= 0 &&
    pageJs.indexOf('onSeriesManageFeatureTap') >= 0 &&
    pageJs.indexOf('onSeriesScopeFeatureTap') >= 0 &&
    moreMenu.SERIES_MANAGED_HIDDEN_PERMISSIONS.close_registration === true &&
    moreMenu.SERIES_MANAGED_HIDDEN_PERMISSIONS.cancel_match === true
);

console.log('');
console.log('C3-U selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
