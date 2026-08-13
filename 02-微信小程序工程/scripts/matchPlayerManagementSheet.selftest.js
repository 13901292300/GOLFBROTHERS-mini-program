/**
 * S1：match-player-management-sheet 抽取回归
 * 运行：node scripts/matchPlayerManagementSheet.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var compDir = path.join(mini, 'components', 'match-player-management-sheet');
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
assert('title 选手管理', compWxml.indexOf('选手管理') >= 0);
assert('roundSubtitle optional', compWxml.indexOf('wx:if="{{roundSubtitle}}"') >= 0);
assert('freeze targetMatchId', compJs.indexOf('this._targetMatchId = matchId') >= 0);
assert('success toast', compJs.indexOf("title: '选手信息已保存'") >= 0);
assert('ordinary uses buildPlayerManageDraft', /buildPlayerManageDraft/.test(compJs));
assert('ordinary remove 移除报名表', /移除报名表/.test(compWxml));
assert(
  'detail registers component',
  detailJson.indexOf('match-player-management-sheet') >= 0
);
assert(
  'detail uses shared sheet once',
  (detailWxml.match(/<match-player-management-sheet/g) || []).length === 1
);
assert(
  'detail no inline player-manage sheet',
  detailWxml.indexOf('class="bottom-sheet register-sheet player-manage-sheet"') < 0 &&
    detailWxml.indexOf('bindtap="savePlayerManageSheet"') < 0
);
assert(
  'detail thin open',
  /openPlayerManageSheet\(\)\s*\{[\s\S]*?playerManageSheetVisible:\s*true/.test(
    detailJs
  ) && detailJs.indexOf('buildPlayerManageDraft') < 0
);
assert(
  'detail keeps openSheet=players',
  detailJs.indexOf("sheet === 'players'") >= 0 &&
    detailJs.indexOf("openSheetRaw === 'players'") >= 0
);
assert(
  'detail handles close/saved',
  detailJs.indexOf('onPlayerManageSheetClose') >= 0 &&
    detailJs.indexOf('onPlayerManageSheetSaved') >= 0
);

var memory = {};
global.wx = {
  showToast: function (opt) {
    global.__toasts = (global.__toasts || []).concat([opt || {}]);
  },
  showModal: function (opt) {
    if (opt && typeof opt.success === 'function') {
      opt.success({ confirm: true });
    }
  },
  makePhoneCall: function () {},
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
var playerManage = require(path.join(utilsDir, 'playerManage.js'));
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

function makeMatch() {
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
          matchTeamName: '红队',
          phone: '13800000001'
        },
        {
          userId: 'u2',
          matchNickname: '乙',
          matchGender: 'female',
          matchTeamId: 't2',
          matchTeamName: '蓝队',
          phone: ''
        }
      ]
    },
    groups: [],
    pairings: {}
  };
}

function makeHost() {
  var host = {
    _alive: true,
    _targetMatchId: '',
    _draft: null,
    _seriesMode: false,
    _rosterSnapshot: [],
    _saving: false,
    _openSeq: 0,
    _searchTimer: null,
    properties: {
      visible: false,
      matchId: 'm1',
      roundSubtitle: '',
      themeClass: '',
      seriesMode: false,
      rosterSnapshot: []
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

storeBag = { m1: makeMatch() };
var host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
assert('open freezes m1', host._targetMatchId === 'm1');
assert('open ready', !!host.data.sheetReady);
assert('list from registerInfo', (host._draft.players || []).length === 2);

var before = JSON.stringify(storeBag.m1.registerInfo);
host.__events = [];
host.onCancel();
assert('cancel close event', (host.__events || []).some(function (e) {
  return e.name === 'close';
}));
assert('cancel no write', JSON.stringify(storeBag.m1.registerInfo) === before);

storeBag = { m1: makeMatch() };
host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
host._draft.players = playerManage.updatePlayerField(
  host._draft.players,
  'u1',
  { matchNickname: '甲改' },
  host._draft.teamOptions
);
host.properties.matchId = 'm-other';
host.__events = [];
global.__toasts = [];
host.onSave();
assert(
  'save triggers saved',
  (host.__events || []).some(function (e) {
    return e.name === 'saved' && e.detail.matchId === 'm1';
  })
);
assert(
  'toast 选手信息已保存',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '选手信息已保存';
  })
);
assert(
  'writes register nickname',
  storeBag.m1.registerInfo.users.some(function (u) {
    return u.userId === 'u1' && u.matchNickname === '甲改';
  })
);

// 写失败不 saved
storeBag = { m1: makeMatch() };
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
  m1: Object.assign(makeMatch(), { createdBy: 'x', organizationId: 'y' })
};
gameStore.getCurrentUser = function () {
  return { userId: 'stranger' };
};
host = makeHost();
host.properties.matchId = 'm1';
host.__events = [];
host._openSheet();
assert('denied close', (host.__events || []).some(function (e) {
  return e.name === 'close';
}));
assert('denied not ready', !host.data.sheetReady);

teamMatchStore.getMatchById = origGet;
teamMatchStore.saveMatch = origSave;
gameStore.getCurrentUser = origUser;

console.log('\n--- matchPlayerManagementSheet.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
