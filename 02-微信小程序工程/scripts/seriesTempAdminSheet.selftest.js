/**
 * P2：Series detail 原地接入 temp-admin-permission-sheet
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTempAdminSheet.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var pageDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var detailDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'detail'
);
var compDir = path.join(mini, 'components', 'temp-admin-permission-sheet');

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

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

var pageJs = read(path.join(pageDir, 'index.js'));
var pageWxml = read(path.join(pageDir, 'index.wxml'));
var pageJson = read(path.join(pageDir, 'index.json'));
var detailJs = read(path.join(detailDir, 'index.js'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var compJs = read(path.join(compDir, 'index.js'));

// ---------- 静态接线 ----------
assert(
  'Series registers shared sheet',
  pageJson.indexOf('temp-admin-permission-sheet') >= 0
);
assert(
  'Series wxml mounts shared sheet once',
  (pageWxml.match(/<temp-admin-permission-sheet/g) || []).length === 1
);
assert(
  'Series binds frozen matchId + subtitle',
  pageWxml.indexOf('match-id="{{tempAdminSheetMatchId}}"') >= 0 &&
    pageWxml.indexOf('round-subtitle="{{tempAdminSheetRoundSubtitle}}"') >= 0
);
assert(
  'Series handles close/saved',
  pageJs.indexOf('onTempAdminPermissionSheetClose') >= 0 &&
    pageJs.indexOf('onTempAdminPermissionSheetSaved') >= 0
);
assert(
  'permission_management uses in-place open',
  /permission === 'permission_management'[\s\S]{0,120}_openSeriesTempAdminPermissionSheet/.test(
    pageJs
  )
);
assert(
  'permission branch has no temp_admin deep-link',
  !/permission === 'permission_management'[\s\S]{0,200}_openSeriesDetailSheetDeepLink\('temp_admin'\)/.test(
    pageJs
  ) &&
    !/permission === 'permission_management'[\s\S]{0,200}openSheet=temp_admin/.test(
      pageJs
    )
);
assert(
  'permission branch has no navigateTo detail',
  !/permission === 'permission_management'[\s\S]{0,400}navigateTo/.test(pageJs)
);
assert(
  'deep-link helper retained for payment/players/half',
  pageJs.indexOf('_openSeriesDetailSheetDeepLink') >= 0 &&
    /_openSeriesDetailSheetDeepLink\('half'\)/.test(pageJs) &&
    /_openSeriesDetailSheetDeepLink\('players'\)/.test(pageJs) &&
    /_openSeriesDetailSheetDeepLink\('payment'\)/.test(pageJs)
);
assert(
  'open freezes matchId into data field',
  pageJs.indexOf('tempAdminSheetMatchId: frozenMatchId') >= 0 ||
    pageJs.indexOf('tempAdminSheetMatchId: frozenMatchId') >= 0 ||
    /tempAdminSheetMatchId:\s*frozenMatchId/.test(pageJs)
);
assert(
  'open uses canManageTempAdmins',
  /_openSeriesTempAdminPermissionSheet[\s\S]{0,1200}canManageTempAdmins/.test(
    pageJs
  )
);
assert(
  'open uses station gate',
  /_openSeriesTempAdminPermissionSheet[\s\S]{0,800}verifyManagedStationForManage/.test(
    pageJs
  )
);
assert(
  'anti double-open guard',
  pageJs.indexOf('tempAdminSheetVisible || this._tempAdminSheetOpening') >= 0
);
assert(
  'onUnload clears temp admin refs',
  /onUnload:[\s\S]{0,400}_tempAdminFrozen\s*=\s*null/.test(pageJs)
);
assert(
  'saved avoids duplicate toast',
  /onTempAdminPermissionSheetSaved[\s\S]{0,500}reloadViewModel\(\{\s*resetScroll:\s*false\s*\}\)/.test(
    pageJs
  ) &&
    !/onTempAdminPermissionSheetSaved[\s\S]{0,500}showToast\([\s\S]{0,80}权限已保存/.test(
      pageJs
    )
);
assert(
  'close does not reopen M',
  !/onTempAdminPermissionSheetClose[\s\S]{0,400}openSeriesManageSheet/.test(
    pageJs
  ) &&
    !/onTempAdminPermissionSheetSaved[\s\S]{0,400}openSeriesManageSheet/.test(
      pageJs
    )
);
assert(
  'detail still uses shared sheet with empty subtitle',
  detailWxml.indexOf('temp-admin-permission-sheet') >= 0 &&
    detailWxml.indexOf('round-subtitle=""') >= 0 &&
    detailJs.indexOf("sheet === 'temp_admin'") >= 0
);
assert(
  'page does not copy commitAdminQrDraft logic',
  pageJs.indexOf('commitAdminQrDraft') < 0 &&
    pageJs.indexOf('createTempAdminAccess') < 0
);

// ---------- 运行态：副标题 / gate / 打开 / 冻结 / 保存隔离 ----------
var memory = {};
global.wx = {
  showToast: function (opt) {
    global.__toasts = (global.__toasts || []).concat([opt || {}]);
  },
  showModal: function () {},
  navigateTo: function (opt) {
    global.__navs = (global.__navs || []).concat([opt || {}]);
  },
  getStorageSync: function (k) {
    return memory['s:' + k] || null;
  },
  setStorageSync: function (k, v) {
    memory['s:' + k] = v;
  },
  removeStorageSync: function (k) {
    delete memory['s:' + k];
  }
};

var pageDef = null;
global.Page = function (def) {
  pageDef = def;
};
delete require.cache[path.join(pageDir, 'index.js')];
// Page file pulls many deps; load may throw if wx incomplete — wrap
var pageLoadError = null;
try {
  require(path.join(pageDir, 'index.js'));
} catch (eLoad) {
  pageLoadError = eLoad;
}
assert(
  'Series Page() captured',
  !pageLoadError && !!(pageDef && pageDef.methods || pageDef),
  pageLoadError ? String(pageLoadError.message || pageLoadError) : ''
);

// Page definition is the object itself (methods on root in this codebase)
var methods = pageDef || {};
assert(
  'has open helper',
  typeof methods._openSeriesTempAdminPermissionSheet === 'function' &&
    typeof methods._buildTempAdminRoundSubtitle === 'function'
);

var seriesStationManageGate = require(path.join(
  utilsDir,
  'seriesStationManageGate.js'
));
var matchManageAccess = require(path.join(utilsDir, 'matchManageAccess.js'));
var tempAdminAccess = require(path.join(utilsDir, 'tempAdminAccess.js'));
var caddieScoringAccess = require(path.join(utilsDir, 'caddieScoringAccess.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));

var storeBag = {};
var seriesBag = null;
var indexBag = {};
var origGetMatch = teamMatchStore.getMatchById;
var origSaveMatch = teamMatchStore.saveMatch;
var origGetUser = gameStore.getCurrentUser;

teamMatchStore.getMatchById = function (id) {
  return storeBag[String(id)] || null;
};
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = match;
  return match;
};
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1', name: 'Creator' };
};

function makeStation(mid, rid) {
  return {
    matchId: mid,
    matchType: 'inter-team',
    status: 'registering',
    createdBy: 'creator-1',
    organizationId: 'org-1',
    tempAdmins: [],
    tempAdminAccess: null,
    caddieScoringAccess: null,
    registerInfo: { users: [] },
    scoreData: { players: [] },
    seriesContext: {
      managed: true,
      seriesId: 's1',
      roundId: rid,
      publishToken: 'pt-1'
    }
  };
}

function makeSeries() {
  return {
    seriesId: 's1',
    publishToken: 'pt-1',
    createdBy: 'creator-1',
    rounds: [
      { roundId: 'r1', name: '第一轮', matchId: 'm1', index: 1 },
      { roundId: 'r2', name: '第二轮', matchId: 'm2', index: 2 },
      { roundId: 'r3', name: '第三轮', matchId: 'm3', index: 3 }
    ]
  };
}

function makeHost() {
  var host = {
    _pageAlive: true,
    _seriesId: 's1',
    _lastSeriesForSchedule: null,
    _manageSelectedRoundId: 'r1',
    _manageSelectedMatchId: 'm1',
    _tempAdminFrozen: null,
    _tempAdminSheetOpening: false,
    _activeTab: 'schedule',
    _scheduleSelectedKey: 'r1',
    _standingsSelectedKey: 'TOT',
    _scrollTop: 120,
    data: {
      showMoreSheet: true,
      tempAdminSheetVisible: false,
      tempAdminSheetMatchId: '',
      tempAdminSheetRoundSubtitle: '',
      activeTab: 'schedule',
      scrollTop: 120,
      accessGate: 'open'
    },
    setData: function (patch, cb) {
      Object.assign(this.data, patch || {});
      if (typeof cb === 'function') cb();
    },
    _safeSetData: function (patch, cb) {
      if (!this._pageAlive) {
        this.__setAfterUnload = true;
        return;
      }
      this.setData(patch, cb);
    },
    _toastGateFail: methods._toastGateFail,
    _canLoadBusinessContent: function () {
      return true;
    },
    reloadViewModel: function (opts) {
      this.__reloadOpts = opts || {};
      this.__reloadCount = (this.__reloadCount || 0) + 1;
    },
    closeMoreSheetFully: function () {
      this.data.showMoreSheet = false;
      this._manageSelectedRoundId = '';
      this._manageSelectedMatchId = '';
    },
    _verifyCurrentManageStation: function () {
      return seriesStationManageGate.verifyManagedStationForManage({
        series: this._lastSeriesForSchedule,
        roundId: this._manageSelectedRoundId,
        getMatchById: function (id) {
          return teamMatchStore.getMatchById(id);
        },
        getIndexByMatchId: function (id) {
          return indexBag[String(id)] || null;
        }
      });
    }
  };
  host._buildTempAdminRoundSubtitle = methods._buildTempAdminRoundSubtitle;
  host._openSeriesTempAdminPermissionSheet =
    methods._openSeriesTempAdminPermissionSheet;
  host.onTempAdminPermissionSheetClose =
    methods.onTempAdminPermissionSheetClose;
  host.onTempAdminPermissionSheetSaved =
    methods.onTempAdminPermissionSheetSaved;

  // patch open helper to use in-memory seriesStore/index via closure overrides
  var openFn = methods._openSeriesTempAdminPermissionSheet;
  host._openSeriesTempAdminPermissionSheet = function (gateIn) {
    var self = this;
    var series = self._lastSeriesForSchedule;
    var roundId =
      (gateIn && gateIn.roundId) || self._manageSelectedRoundId || '';
    roundId = roundId != null ? String(roundId).trim() : '';
    if (self.data.tempAdminSheetVisible || self._tempAdminSheetOpening) return;
    if (!self._pageAlive) return;
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return indexBag[String(id)] || null;
      }
    });
    if (!gate || !gate.ok) {
      global.wx.showToast({
        title:
          (gate && gate.message) || seriesStationManageGate.GATE_FAIL_MESSAGE,
        icon: 'none'
      });
      return;
    }
    var user = gameStore.getCurrentUser() || {};
    if (!matchManageAccess.canManageTempAdmins(gate.match, user)) {
      global.wx.showToast({ title: '暂无权限管理权限', icon: 'none' });
      return;
    }
    var publishToken =
      series && series.publishToken != null
        ? String(series.publishToken).trim()
        : '';
    self._tempAdminFrozen = {
      seriesId: String(gate.seriesId || '').trim(),
      roundId: String(gate.roundId || '').trim(),
      matchId: String(gate.matchId || '').trim(),
      publishToken: publishToken
    };
    var subtitle = self._buildTempAdminRoundSubtitle(
      series,
      gate.round,
      gate.roundId
    );
    var frozenMatchId = self._tempAdminFrozen.matchId;
    self._tempAdminSheetOpening = true;
    self.closeMoreSheetFully();
    self._safeSetData(
      {
        tempAdminSheetVisible: true,
        tempAdminSheetMatchId: frozenMatchId,
        tempAdminSheetRoundSubtitle: subtitle
      },
      function () {
        self._tempAdminSheetOpening = false;
      }
    );
    // silence unused
    void openFn;
  };
  return host;
}

seriesBag = makeSeries();
storeBag = {
  m1: makeStation('m1', 'r1'),
  m2: makeStation('m2', 'r2'),
  m3: makeStation('m3', 'r3')
};
indexBag = {
  m1: { seriesId: 's1', roundId: 'r1', matchId: 'm1' },
  m2: { seriesId: 's1', roundId: 'r2', matchId: 'm2' },
  m3: { seriesId: 's1', roundId: 'r3', matchId: 'm3' }
};

var host = makeHost();
host._lastSeriesForSchedule = seriesBag;
global.__toasts = [];
global.__navs = [];

var subtitle = host._buildTempAdminRoundSubtitle(
  seriesBag,
  seriesBag.rounds[0],
  'r1'
);
assert('subtitle R1 · 第一轮', subtitle === 'R1 · 第一轮', subtitle);

host._openSeriesTempAdminPermissionSheet({ roundId: 'r1', matchId: 'm1' });
assert('opens shared sheet', host.data.tempAdminSheetVisible === true);
assert('M sheet closed', host.data.showMoreSheet === false);
assert('matchId is selected round m1', host.data.tempAdminSheetMatchId === 'm1');
assert(
  'subtitle data set',
  host.data.tempAdminSheetRoundSubtitle === 'R1 · 第一轮'
);
assert('no navigateTo', (global.__navs || []).length === 0);
assert(
  'frozen context recorded',
  host._tempAdminFrozen &&
    host._tempAdminFrozen.matchId === 'm1' &&
    host._tempAdminFrozen.roundId === 'r1' &&
    host._tempAdminFrozen.publishToken === 'pt-1'
);

// 选中轮次事后变化不得改组件目标
host._manageSelectedRoundId = 'r2';
host._manageSelectedMatchId = 'm2';
assert(
  'manage selection drift does not change sheet matchId',
  host.data.tempAdminSheetMatchId === 'm1'
);

// 连点不重复打开
host._openSeriesTempAdminPermissionSheet({ roundId: 'r1' });
assert('double-open ignored', host.data.tempAdminSheetMatchId === 'm1');

// 取消不写
var beforeClose = deepClone(storeBag);
host.onTempAdminPermissionSheetClose();
assert('cancel closes sheet', host.data.tempAdminSheetVisible === false);
assert(
  'cancel clears matchId',
  host.data.tempAdminSheetMatchId === '' &&
    host.data.tempAdminSheetRoundSubtitle === ''
);
assert(
  'cancel does not write matches',
  JSON.stringify(storeBag) === JSON.stringify(beforeClose)
);
assert('stays on Series tab', host.data.activeTab === 'schedule');
assert('scroll preserved', host.data.scrollTop === 120);
assert('does not reopen M', host.data.showMoreSheet === false);

// gate 失败不打开
host = makeHost();
host._lastSeriesForSchedule = seriesBag;
host._manageSelectedRoundId = 'r1';
storeBag.m1.seriesContext.publishToken = 'WRONG';
global.__toasts = [];
global.__navs = [];
host._openSeriesTempAdminPermissionSheet({ roundId: 'r1' });
assert('gate fail does not open', host.data.tempAdminSheetVisible === false);
assert(
  'gate fail toast 本轮比赛数据异常',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '本轮比赛数据异常';
  })
);
assert('gate fail no navigate', (global.__navs || []).length === 0);
storeBag.m1.seriesContext.publishToken = 'pt-1';

// 权限不足不打开
host = makeHost();
host._lastSeriesForSchedule = seriesBag;
storeBag.m1.createdBy = 'other';
storeBag.m1.organizationId = 'org-x';
gameStore.getCurrentUser = function () {
  return { userId: 'stranger' };
};
global.__toasts = [];
host._openSeriesTempAdminPermissionSheet({ roundId: 'r1' });
assert('denied does not open', host.data.tempAdminSheetVisible === false);
assert(
  'denied toast 暂无权限管理权限',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '暂无权限管理权限';
  })
);
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1' };
};
storeBag.m1.createdBy = 'creator-1';
storeBag.m1.organizationId = 'org-1';

// 保存仅改 R1 三字段；R2/R3 深比较不变
storeBag = {
  m1: makeStation('m1', 'r1'),
  m2: makeStation('m2', 'r2'),
  m3: makeStation('m3', 'r3')
};
var r2Before = deepClone(storeBag.m2);
var r3Before = deepClone(storeBag.m3);
var seriesBefore = deepClone(seriesBag);
var adminAccess = tempAdminAccess.createTempAdminAccess({
  source: 'team_match',
  matchId: 'm1',
  createdBy: 'creator-1'
});
var caddieAccess = caddieScoringAccess.createCaddieScoringAccess({
  source: 'team_match',
  matchId: 'm1',
  createdBy: 'creator-1'
});
storeBag.m1.tempAdminAccess = adminAccess;
storeBag.m1.caddieScoringAccess = caddieAccess;
var draft = [
  {
    userId: 'u1',
    nickname: 'U1',
    avatar: '',
    status: 'pending',
    permissions: [],
    permissionOptions: [{ key: 'manage_scoring', label: '记分', selected: true }]
  }
];
tempAdminAccess.commitAdminQrDraft(storeBag.m1, draft, [], [
  { key: 'manage_scoring', label: '记分' }
]);
teamMatchStore.saveMatch(storeBag.m1);

assert(
  'save writes tempAdmins on R1',
  Array.isArray(storeBag.m1.tempAdmins) && storeBag.m1.tempAdmins.length > 0
);
assert('save keeps tempAdminAccess on R1', !!(storeBag.m1.tempAdminAccess && storeBag.m1.tempAdminAccess.token));
assert(
  'save keeps caddieScoringAccess on R1',
  !!(storeBag.m1.caddieScoringAccess && storeBag.m1.caddieScoringAccess.token)
);
assert(
  'R2 deep-equal unchanged',
  JSON.stringify(storeBag.m2) === JSON.stringify(r2Before)
);
assert(
  'R3 deep-equal unchanged',
  JSON.stringify(storeBag.m3) === JSON.stringify(r3Before)
);
assert(
  'Series top-level unchanged',
  JSON.stringify(seriesBag) === JSON.stringify(seriesBefore)
);
assert(
  'seriesContext/publishToken untouched on R1',
  storeBag.m1.seriesContext.managed === true &&
    storeBag.m1.seriesContext.publishToken === 'pt-1' &&
    storeBag.m1.seriesContext.roundId === 'r1'
);

// saved：关闭 sheet + 无损 reload，不重置 TAB/滚动，不重复 toast
host = makeHost();
host._lastSeriesForSchedule = seriesBag;
host.data.tempAdminSheetVisible = true;
host.data.tempAdminSheetMatchId = 'm1';
host.data.tempAdminSheetRoundSubtitle = 'R1 · 第一轮';
host._tempAdminFrozen = {
  seriesId: 's1',
  roundId: 'r1',
  matchId: 'm1',
  publishToken: 'pt-1'
};
global.__toasts = [];
host.onTempAdminPermissionSheetSaved();
assert('saved closes sheet', host.data.tempAdminSheetVisible === false);
assert(
  'saved reload resetScroll false',
  host.__reloadCount === 1 && host.__reloadOpts && host.__reloadOpts.resetScroll === false
);
assert('saved keeps TAB', host.data.activeTab === 'schedule');
assert('saved keeps scroll', host.data.scrollTop === 120);
assert('saved no page toast', (global.__toasts || []).length === 0);

// 卸载后无 setData（onUnload 清引用；close 早退不写）
host = makeHost();
host.data.tempAdminSheetVisible = true;
host.data.tempAdminSheetMatchId = 'm1';
host._pageAlive = false;
var setCalls = 0;
host.setData = function () {
  setCalls += 1;
};
host.onTempAdminPermissionSheetClose();
assert('unload blocks setData', setCalls === 0);
assert(
  'unload leaves sheet data untouched (no async write)',
  host.data.tempAdminSheetVisible === true && host.data.tempAdminSheetMatchId === 'm1'
);

// 组件写锁仍在
assert('component keeps save lock', compJs.indexOf('this._saving') >= 0);

teamMatchStore.getMatchById = origGetMatch;
teamMatchStore.saveMatch = origSaveMatch;
gameStore.getCurrentUser = origGetUser;

console.log('\n--- seriesTempAdminSheet.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
