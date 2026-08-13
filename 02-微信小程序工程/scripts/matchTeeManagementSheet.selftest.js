/**
 * T1：match-tee-management-sheet 抽取回归
 * 运行：node scripts/matchTeeManagementSheet.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var compDir = path.join(mini, 'components', 'match-tee-management-sheet');
var detailDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'detail'
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

var compJs = read(path.join(compDir, 'index.js'));
var compWxml = read(path.join(compDir, 'index.wxml'));
var detailJs = read(path.join(detailDir, 'index.js'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var detailJson = read(path.join(detailDir, 'index.json'));

assert('component exists', !!(compJs && compWxml));
assert('title 出发管理', compWxml.indexOf('出发管理') >= 0);
assert('empty copy', compWxml.indexOf('请先完成分组后再设置出发表') >= 0);
assert('roundSubtitle optional', compWxml.indexOf('wx:if="{{roundSubtitle}}"') >= 0);
assert('freeze targetMatchId', compJs.indexOf('this._targetMatchId = matchId') >= 0);
assert('success toast', compJs.indexOf("title: '出发安排已保存'") >= 0);
assert('uses buildTeeSheetDraft', /buildTeeSheetDraft/.test(compJs));
assert('uses commitTeeSheetDraft', /commitTeeSheetDraft/.test(compJs));
assert(
  'detail registers component',
  detailJson.indexOf('match-tee-management-sheet') >= 0
);
assert(
  'detail uses shared sheet once',
  (detailWxml.match(/<match-tee-management-sheet/g) || []).length === 1
);
assert(
  'detail no inline tee sheet',
  detailWxml.indexOf('class="bottom-sheet register-sheet tee-sheet-manage-sheet"') < 0 &&
    detailWxml.indexOf('bindtap="saveTeeSheetManageSheet"') < 0 &&
    detailWxml.indexOf('bindtap="cancelTeeSheetManageSheet"') < 0
);
assert(
  'detail thin open',
  /openTeeSheetManageSheet\(\)\s*\{[\s\S]*?teeSheetManageSheetVisible:\s*true/.test(
    detailJs
  ) && detailJs.indexOf('buildTeeSheetDraft') < 0
);
assert(
  'detail handles close/saved',
  detailJs.indexOf('onTeeSheetManageSheetClose') >= 0 &&
    detailJs.indexOf('onTeeSheetManageSheetSaved') >= 0 &&
    detailJs.indexOf('_refreshTeeSheetDisplayFromMatch') >= 0
);

var memory = {};
global.wx = {
  showToast: function (opt) {
    global.__toasts = (global.__toasts || []).concat([opt || {}]);
  },
  showModal: function () {},
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

var componentDef = null;
global.Component = function (def) {
  componentDef = def;
};
delete require.cache[path.join(compDir, 'index.js')];
require(path.join(compDir, 'index.js'));
assert('Component captured', !!(componentDef && componentDef.methods));

var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var teeSheetManage = require(path.join(utilsDir, 'teeSheetManage.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));

var storeBag = {};
var origGet = teamMatchStore.getMatchById;
var origSave = teamMatchStore.saveMatch;
var origUser = gameStore.getCurrentUser;
teamMatchStore.getMatchById = function (id) {
  return storeBag[String(id)] || null;
};
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = match;
  return match;
};
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1' };
};

function makeMatch(groups) {
  return {
    matchId: 'm1',
    matchType: 'inter-team',
    status: 'registering',
    createdBy: 'creator-1',
    organizationId: 'org-1',
    gameMode: '个人比杆赛',
    teamGroups: [
      { id: 't1', name: '红队' },
      { id: 't2', name: '蓝队' }
    ],
    registerInfo: {
      totalCount: 2,
      users: [
        {
          userId: 'u1',
          matchNickname: '甲',
          matchGender: 'male',
          matchTeamId: 't1',
          matchTeamName: '红队'
        },
        {
          userId: 'u2',
          matchNickname: '乙',
          matchGender: 'female',
          matchTeamId: 't2',
          matchTeamName: '蓝队'
        }
      ]
    },
    groups: groups || [],
    pairings: {}
  };
}

function makeGroupedMatch() {
  return makeMatch([
    {
      groupId: 'g1',
      groupName: '第1组',
      teeTime: '08:00',
      startHole: 1,
      players: [
        { userId: 'u1', nickname: '甲' },
        { userId: 'u2', nickname: '乙' }
      ]
    },
    {
      groupId: 'g2',
      groupName: '第2组',
      teeTime: '08:00',
      startHole: 1,
      players: [{ userId: 'u1', nickname: '甲' }]
    }
  ]);
}

function makeHost() {
  var host = {
    _alive: true,
    _targetMatchId: '',
    _teeSheetDraft: null,
    _saving: false,
    _openSeq: 0,
    properties: {
      visible: false,
      matchId: 'm1',
      roundSubtitle: '',
      themeClass: ''
    },
    data: Object.assign({}, componentDef.data),
    setData: function (patch) {
      Object.assign(this.data, patch || {});
    },
    triggerEvent: function (name, detail) {
      this.__events = (this.__events || []).concat([
        { name: name, detail: detail || {} }
      ]);
    }
  };
  Object.keys(componentDef.methods).forEach(function (k) {
    host[k] = componentDef.methods[k];
  });
  return host;
}

// 空分组仍打开空态
storeBag = { m1: makeMatch([]) };
var host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
assert('empty open freezes m1', host._targetMatchId === 'm1');
assert('empty open ready', !!host.data.sheetReady);
assert('empty hasGroups false', host.data.hasGroups === false);

// 取消不写
storeBag = { m1: makeGroupedMatch() };
host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
var before = JSON.stringify(storeBag.m1.groups);
host.__events = [];
host.onCancel();
assert(
  'cancel close event',
  (host.__events || []).some(function (e) {
    return e.name === 'close';
  })
);
assert('cancel no write', JSON.stringify(storeBag.m1.groups) === before);

// 统一时间保存落盘
storeBag = { m1: makeGroupedMatch() };
host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
host._teeSheetDraft = teeSheetManage.setTimeMode(host._teeSheetDraft, 'uniform');
host._teeSheetDraft = teeSheetManage.setUnifiedTime(host._teeSheetDraft, '09:30');
host.properties.matchId = 'm-other';
host.__events = [];
global.__toasts = [];
host.onSave();
assert(
  'save triggers saved with frozen id',
  (host.__events || []).some(function (e) {
    return e.name === 'saved' && e.detail.matchId === 'm1';
  })
);
assert(
  'toast 出发安排已保存',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '出发安排已保存';
  })
);
assert(
  'writes teeTime',
  storeBag.m1.groups.every(function (g) {
    return g.teeTime === '09:30';
  })
);
assert(
  'does not wipe players',
  Array.isArray(storeBag.m1.groups[0].players) &&
    storeBag.m1.groups[0].players.length === 2
);

// 间隔模式链式
storeBag = { m1: makeGroupedMatch() };
host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
host._teeSheetDraft = teeSheetManage.setTimeMode(host._teeSheetDraft, 'interval');
host._teeSheetDraft = teeSheetManage.setIntervalMinutes(host._teeSheetDraft, 20);
host.onSave();
assert(
  'interval cascade second group',
  storeBag.m1.groups[1] && storeBag.m1.groups[1].teeTime === '08:20'
);

// 双边洞
storeBag = { m1: makeGroupedMatch() };
host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
host._teeSheetDraft = teeSheetManage.setHoleMode(host._teeSheetDraft, 'bilateral');
host.onSave();
assert('bilateral g1 hole 1', storeBag.m1.groups[0].startHole === 1);
assert('bilateral g2 hole 10', storeBag.m1.groups[1].startHole === 10);

// 无分组保存：关弹窗、不成功 toast、不 saved
storeBag = { m1: makeMatch([]) };
host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
host.__events = [];
global.__toasts = [];
host.onSave();
assert(
  'empty save close only',
  (host.__events || []).some(function (e) {
    return e.name === 'close';
  }) &&
    !(host.__events || []).some(function (e) {
      return e.name === 'saved';
    })
);
assert(
  'empty save no success toast',
  !(global.__toasts || []).some(function (t) {
    return t && t.title === '出发安排已保存';
  })
);

// 写失败不 saved
storeBag = { m1: makeGroupedMatch() };
host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
host.__events = [];
teamMatchStore.saveMatch = function () {
  throw new Error('fail');
};
host.onSave();
assert(
  'save fail no saved',
  !(host.__events || []).some(function (e) {
    return e.name === 'saved';
  })
);
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = match;
  return match;
};

// 权限不足
storeBag = {
  m1: Object.assign(makeGroupedMatch(), { createdBy: 'x', organizationId: 'y' })
};
gameStore.getCurrentUser = function () {
  return { userId: 'stranger' };
};
host = makeHost();
host.properties.matchId = 'm1';
host.__events = [];
host._openSheet();
assert(
  'denied close',
  (host.__events || []).some(function (e) {
    return e.name === 'close';
  })
);
assert('denied not ready', !host.data.sheetReady);

teamMatchStore.getMatchById = origGet;
teamMatchStore.saveMatch = origSave;
gameStore.getCurrentUser = origUser;

console.log('\n--- matchTeeManagementSheet.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
