/**
 * 分组草稿：确定前只改内存；完整合法性校验只在「确定」。
 * 运行：node scripts/groupEditorDraftDeferValidation.selftest.js
 */
var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var editorPath = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-editor',
  'index.js'
);
var pickPath = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-pick',
  'index.js'
);

var modalCalls = [];
var toastCalls = [];
var navCalls = 0;
var pickCaptured = null;
var editorCaptured = null;

var appSingleton = { getTheme: function () { return 'bright'; }, globalData: {} };
if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return appSingleton;
  };
} else {
  global.getApp = function () {
    return appSingleton;
  };
}
global.Page = function (def) {
  if (!editorCaptured) editorCaptured = def;
  else pickCaptured = def;
  return def;
};
global.wx = {
  getStorageSync: function () {
    return null;
  },
  setStorageSync: function () {},
  showToast: function (opts) {
    toastCalls.push(opts || {});
  },
  showModal: function (opts) {
    modalCalls.push(opts || {});
  },
  navigateBack: function () {
    navCalls += 1;
  },
  navigateTo: function () {},
  getWindowInfo: function () {
    return { windowWidth: 375, windowHeight: 667 };
  },
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667 };
  }
};
var _origSetTimeout = global.setTimeout;
global.setTimeout = function (fn) {
  if (typeof fn === 'function') fn();
  return 0;
};

require(editorPath);
global.Page = function (def) {
  pickCaptured = def;
  return def;
};
require(pickPath);

var teamMatchStore = require(path.join(root, 'miniprogram', 'utils', 'teamMatchStore.js'));
var matchManageAccess = require(path.join(root, 'miniprogram', 'utils', 'matchManageAccess.js'));
var gameStore = require(path.join(root, 'miniprogram', 'utils', 'gameStore.js'));
var identityMod = require(seriesTestPaths.util('seriesLiveIdentityCorrection.js'));

var saveCount = 0;
var seriesWriteCount = 0;
var identityExecCount = 0;
var matches = {};
var origSave = teamMatchStore.saveMatch;
var origGet = teamMatchStore.getMatchById;
var origPerm = matchManageAccess.hasMatchManagePermission;
var origUser = gameStore.getCurrentUser;
var origIdentity = identityMod.executeSeriesLiveIdentityCorrection;

teamMatchStore.saveMatch = function (next) {
  saveCount += 1;
  var id = next && next.matchId != null ? String(next.matchId) : '';
  if (id) matches[id] = JSON.parse(JSON.stringify(next));
  return next;
};
teamMatchStore.getMatchById = function (id) {
  return matches[String(id || '')] || null;
};
matchManageAccess.hasMatchManagePermission = function () {
  return true;
};
gameStore.getCurrentUser = function () {
  return { userId: 'admin', role: 'admin' };
};
identityMod.executeSeriesLiveIdentityCorrection = function (input) {
  identityExecCount += 1;
  return origIdentity.apply(this, arguments);
};

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

function resetUi() {
  modalCalls = [];
  toastCalls = [];
  navCalls = 0;
}

function seat(id, pos, team) {
  return {
    position: pos,
    userId: id,
    playerId: id,
    id: id,
    displayName: '球员' + id,
    matchTeamId: team || '',
    groupId: team || '',
    scorePlayerId: id
  };
}

function fourSlots(ids, teamById) {
  var out = [];
  for (var i = 0; i < 4; i++) {
    var id = ids[i] || '';
    out.push(id ? seat(id, i + 1, teamById && teamById[id]) : { position: i + 1, userId: '' });
  }
  return out;
}

function bindPage(captured, opts) {
  var o = opts || {};
  var ed = {
    data: Object.assign(
      {
        matchId: o.matchId || 'm-defer',
        mode: o.mode || 'edit',
        gameMode: o.gameMode || '个人比杆赛',
        groupDraft: o.groupDraft || [],
        pairingDraft: o.pairingDraft || {},
        showPairingSection: false,
        showCompositionMode: !!o.showCompositionMode,
        showCompositionPreview: !!o.showCompositionPreview,
        strokeCompositionMode: o.strokeCompositionMode || '2+2',
        saving: false,
        groupId: o.groupId || 'g1',
        editingGroupIndex: 0,
        slots: o.slots || [],
        activeSubTabId: o.activeSubTabId || 't1'
      },
      o.data || {}
    ),
    _fromSeries: o._fromSeries === true,
    _registerInfo: o._registerInfo || { users: [] },
    _seriesReturnMeta: o._seriesReturnMeta || { seriesId: 'ser-1', roundId: 'r1' },
    _matchSnapshot: o._matchSnapshot || null,
    _pageAlive: true,
    setData: function (patch) {
      Object.assign(this.data, patch || {});
    }
  };
  Object.keys(captured || {}).forEach(function (k) {
    if (typeof captured[k] === 'function') ed[k] = captured[k].bind(ed);
  });
  return ed;
}

function putMatch(extra) {
  var m = Object.assign(
    {
      matchId: 'm-defer',
      updatedAt: 1000,
      status: 'ongoing',
      gameMode: '个人比杆赛',
      groups: [],
      pairings: {},
      registerInfo: { users: [] },
      createdBy: 'admin',
      ownerId: 'admin'
    },
    extra || {}
  );
  matches[m.matchId] = JSON.parse(JSON.stringify(m));
  return matches[m.matchId];
}

function usersOf(ids, team) {
  return ids.map(function (id) {
    return {
      userId: id,
      displayName: '球员' + id,
      matchTeamId: team || 't1',
      groupId: team || 't1'
    };
  });
}

var editorSrc = fs.readFileSync(editorPath, 'utf8');
var pickSrc = fs.readFileSync(pickPath, 'utf8');

var saveMatchCount = (editorSrc.match(/teamMatchStore\.saveMatch/g) || []).length;
var persistIdx = editorSrc.indexOf('_persistLiveMatchWithReadback');
var confirmIdx = editorSrc.indexOf('\n  onConfirm()');
var firstSaveIdx = editorSrc.indexOf('teamMatchStore.saveMatch');
assert(
  '静态：editor saveMatch 仅 persist/onConfirm',
  saveMatchCount === 3 && persistIdx >= 0 && confirmIdx > persistIdx && firstSaveIdx > persistIdx
);
assert(
  '静态：pick 无 saveMatch / identity execute',
  pickSrc.indexOf('teamMatchStore.saveMatch') < 0 &&
    pickSrc.indexOf('executeSeriesLiveIdentityCorrection') < 0
);
assert(
  '静态：validateStrokeEntities 不在 onToggle/onShow/_setGroupDraft',
  !/_setGroupDraft\([\s\S]{0,400}validateStrokeEntities/.test(editorSrc) &&
    !/onShow\(\) \{[\s\S]{0,500}validateStrokeEntities/.test(editorSrc) &&
    pickSrc.indexOf('validateStrokeEntities') < 0
);
assert(
  '静态：pick 确定始终放行草稿',
  /_validateBeforeCommit\(\) \{\s*return true;/.test(pickSrc)
);

resetUi();
saveCount = 0;
identityExecCount = 0;
var registerUsers = usersOf(['A', 'B', 'C', 'D']);
var matchReg = putMatch({
  matchId: 'm-reg',
  registerInfo: { users: registerUsers },
  groups: [{ groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B', 'C', 'D']) }]
});
var edReg = bindPage(editorCaptured, {
  matchId: 'm-reg',
  mode: 'edit',
  gameMode: '个人比杆赛',
  _registerInfo: { users: registerUsers },
  _matchSnapshot: matchReg,
  groupDraft: [
    { groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B', 'C']) }
  ]
});
edReg._setGroupDraft(edReg.data.groupDraft);
assert(
  '1 草稿 3 人可继续编辑，无 toast、无写盘',
  saveCount === 0 && toastCalls.length === 0 && modalCalls.length === 0 && navCalls === 0
);

resetUi();
saveCount = 0;
var g2Users = [
  { userId: 'A', matchTeamId: 'red', groupId: 'red', displayName: '球员A' },
  { userId: 'B', matchTeamId: 'red', groupId: 'red', displayName: '球员B' },
  { userId: 'C', matchTeamId: 'blue', groupId: 'blue', displayName: '球员C' },
  { userId: 'D', matchTeamId: 'blue', groupId: 'blue', displayName: '球员D' },
  { userId: 'E', matchTeamId: 'red', groupId: 'red', displayName: '球员E' }
];
putMatch({
  matchId: 'm-g2',
  gameMode: '四人四球比杆赛',
  strokeCompositionMode: '2+2',
  registerInfo: { users: g2Users }
});
var edG2 = bindPage(editorCaptured, {
  matchId: 'm-g2',
  mode: 'edit',
  gameMode: '四人四球比杆赛',
  showCompositionMode: true,
  strokeCompositionMode: '2+2',
  _registerInfo: { users: g2Users },
  groupDraft: [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: fourSlots(['A', 'B', 'C'], { A: 'red', B: 'red', C: 'blue' })
    }
  ]
});
var broken = JSON.parse(JSON.stringify(edG2.data.groupDraft));
broken[0].players[3] = seat('D', 4, 'blue');
broken[0].players[2] = seat('B', 3, 'red');
broken[0].players[1] = seat('C', 2, 'blue');
edG2._setGroupDraft(broken);
assert(
  '2 草稿暂时破坏 2+2 仍可换位',
  saveCount === 0 && toastCalls.length === 0 && modalCalls.length === 0
);

resetUi();
saveCount = 0;
var edSwap = bindPage(editorCaptured, {
  matchId: 'm-reg',
  _registerInfo: { users: registerUsers },
  groupDraft: [
    { groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B', 'C', 'D']) }
  ]
});
var d1 = JSON.parse(JSON.stringify(edSwap.data.groupDraft));
d1[0].players[0] = { position: 1, userId: '' };
edSwap._setGroupDraft(d1);
d1 = JSON.parse(JSON.stringify(edSwap.data.groupDraft));
d1[0].players[0] = seat('C', 1);
edSwap._setGroupDraft(d1);
assert(
  '3 先删 A 再加入 C 中间不校验',
  saveCount === 0 && toastCalls.length === 0 && modalCalls.length === 0
);

resetUi();
saveCount = 0;
var edCross = bindPage(editorCaptured, {
  matchId: 'm-reg',
  _registerInfo: { users: registerUsers },
  groupDraft: [
    { groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B']) },
    { groupId: 'g2', groupName: '第2组', players: fourSlots(['C', 'D']) }
  ]
});
var cross = JSON.parse(JSON.stringify(edCross.data.groupDraft));
var tmp = cross[0].players[0];
cross[0].players[0] = cross[1].players[0];
cross[1].players[0] = tmp;
edCross._setGroupDraft(cross);
cross = JSON.parse(JSON.stringify(edCross.data.groupDraft));
tmp = cross[0].players[1];
cross[0].players[1] = cross[1].players[1];
cross[1].players[1] = tmp;
edCross._setGroupDraft(cross);
assert(
  '4 连续跨组调整不触发保存校验',
  saveCount === 0 && toastCalls.length === 0 && modalCalls.length === 0
);

resetUi();
saveCount = 0;
appSingleton.globalData = {};
var pickSlots = fourSlots(['A']);
var pick = bindPage(pickCaptured, {
  groupId: 'g1',
  slots: pickSlots,
  activeSubTabId: 't1'
});
pick.data.slots = pickSlots;
pick.data.groupId = 'g1';
pick.data.editingGroupIndex = 0;
pick._registerInfo = {
  users: registerUsers.map(function (u) {
    return Object.assign({}, u, { groupId: 't1' });
  })
};
pick._match = matches['m-reg'];
pick._registerLookup = {};
pick._allGroups = [{ groupId: 'g1', players: fourSlots(['A']) }];
pick.onTogglePlayer({
  currentTarget: {
    dataset: {
      user: { userId: 'B', displayName: '球员B', groupId: 't1', matchTeamId: 't1' }
    }
  }
});
var pickedB = (pick.data.slots || []).some(function (s) {
  return String(s && s.userId) === 'B';
});
pick.onConfirm();
var pickPayload = appSingleton.globalData.tournamentGroupPickResult;
assert(
  '5 group-pick 选人返回只更新草稿',
  saveCount === 0 &&
    identityExecCount === 0 &&
    pickedB &&
    pickPayload &&
    Array.isArray(pickPayload.players) &&
    pickPayload.players.some(function (p) {
      return String(p && p.userId) === 'B';
    }),
  'pickedB=' + pickedB + ' payload=' + JSON.stringify(pickPayload)
);

var edPickBack = bindPage(editorCaptured, {
  matchId: 'm-reg',
  _registerInfo: { users: registerUsers },
  groupDraft: [{ groupId: 'g1', groupName: '第1组', players: fourSlots(['A']) }]
});
resetUi();
saveCount = 0;
edPickBack._applyGroupPickResultIfAny();
assert(
  '5b editor 接收 pick 结果不写盘',
  saveCount === 0 && toastCalls.length === 0 && modalCalls.length === 0
);

assert('6 草稿阶段 Match 写入次数为 0', saveCount === 0 && seriesWriteCount === 0);

resetUi();
saveCount = 0;
identityExecCount = 0;
putMatch({
  matchId: 'm-ok',
  gameMode: '个人比杆赛',
  registerInfo: { users: registerUsers },
  groups: [{ groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B', 'C', 'D']) }]
});
var edOk = bindPage(editorCaptured, {
  matchId: 'm-ok',
  mode: 'edit',
  gameMode: '个人比杆赛',
  _registerInfo: { users: registerUsers },
  _matchSnapshot: matches['m-ok'],
  groupDraft: [{ groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B', 'C', 'D']) }]
});
edOk.onConfirm();
assert(
  '7 确定且最终合法 → 保存成功',
  saveCount >= 1 &&
    toastCalls.some(function (t) {
      return t.title === '分组已保存';
    }) &&
    modalCalls.length === 0
);

resetUi();
saveCount = 0;
var draftKeep = [{ groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B', 'C', 'X']) }];
var edBad = bindPage(editorCaptured, {
  matchId: 'm-ok',
  mode: 'edit',
  _registerInfo: { users: registerUsers },
  _matchSnapshot: matches['m-ok'],
  groupDraft: JSON.parse(JSON.stringify(draftKeep))
});
edBad.onConfirm();
assert(
  '8 确定且未报名 → 明确弹窗，草稿保留，写入 0',
  saveCount === 0 &&
    navCalls === 0 &&
    JSON.stringify(edBad.data.groupDraft[0].players[3].userId) === JSON.stringify('X') &&
    modalCalls.some(function (t) {
      return t.title === '分组无法保存' && String(t.content).indexOf('有球员未报名') >= 0;
    })
);

resetUi();
saveCount = 0;
var edDup = bindPage(editorCaptured, {
  matchId: 'm-ok',
  mode: 'edit',
  _registerInfo: { users: registerUsers },
  _matchSnapshot: matches['m-ok'],
  groupDraft: [
    { groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B']) },
    { groupId: 'g2', groupName: '第2组', players: fourSlots(['A', 'C']) }
  ]
});
edDup.onConfirm();
assert(
  '9 确定且重复球员 → 明确提示，草稿保留',
  saveCount === 0 &&
    navCalls === 0 &&
    edDup.data.groupDraft.length === 2 &&
    modalCalls.some(function (t) {
      return t.title === '分组无法保存' && String(t.content).indexOf('同一球员重复出现在多个位置') >= 0;
    })
);

resetUi();
saveCount = 0;
putMatch({
  matchId: 'm-g2b',
  gameMode: '四人四球比杆赛',
  strokeCompositionMode: '2+2',
  registerInfo: { users: g2Users },
  groups: []
});
var ed22 = bindPage(editorCaptured, {
  matchId: 'm-g2b',
  mode: 'edit',
  gameMode: '四人四球比杆赛',
  showCompositionMode: true,
  strokeCompositionMode: '2+2',
  _registerInfo: { users: g2Users },
  _matchSnapshot: matches['m-g2b'],
  groupDraft: [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: fourSlots(['A', 'B', 'E', 'C'], { A: 'red', B: 'red', E: 'red', C: 'blue' })
    }
  ]
});
ed22.onConfirm();
assert(
  '10 确定且 2+2/人数非法 → 明确提示，草稿保留',
  saveCount === 0 &&
    navCalls === 0 &&
    ed22.data.groupDraft[0].players.filter(function (p) { return p.userId; }).length === 4 &&
    modalCalls.some(function (t) {
      return (
        t.title === '分组无法保存' &&
        (String(t.content).indexOf('2+2') >= 0 || String(t.content).indexOf('人数') >= 0 || String(t.content).indexOf('组合') >= 0)
      );
    })
);

resetUi();
saveCount = 0;
ed22.data.groupDraft = [
  {
    groupId: 'g1',
    groupName: '第1组',
    players: fourSlots(['A', 'B', 'C', 'D'], { A: 'red', B: 'red', C: 'blue', D: 'blue' })
  }
];
ed22.onConfirm();
assert(
  '11 修正草稿后再次确定 → 可成功保存',
  saveCount >= 1 &&
    toastCalls.some(function (t) {
      return t.title === '分组已保存';
    })
);

resetUi();
saveCount = 0;
identityExecCount = 0;
var liveUsers = g2Users.concat([{ userId: 'P', matchTeamId: 'red', groupId: 'red' }]);
var livePlayers = [
  Object.assign(seat('A', 1, 'red'), { holes: [4, 5, 4], entityId: 'e1', slotId: 's1' }),
  Object.assign(seat('B', 2, 'red'), { holes: [3, 4, 5], entityId: 'e2', slotId: 's2' }),
  Object.assign(seat('C', 3, 'blue'), { holes: [5, 4, 4], entityId: 'e3', slotId: 's3' }),
  Object.assign(seat('D', 4, 'blue'), { holes: [4, 4, 5], entityId: 'e4', slotId: 's4' })
];
putMatch({
  matchId: 'm-live',
  status: 'ongoing',
  gameMode: '四人四球比杆赛',
  strokeCompositionMode: '2+2',
  seriesContext: { managed: true, seriesId: 'ser-1', roundId: 'r1', matchId: 'm-live', publishToken: 'tok' },
  registerInfo: { users: liveUsers },
  groups: [{ groupId: 'g1', groupName: '第1组', status: 'LIVE', players: livePlayers }],
  scoreData: {
    g1: {
      scoresByPlayer: {
        A: { scores: [4, 5, 4] },
        B: { scores: [3, 4, 5] },
        C: { scores: [5, 4, 4] },
        D: { scores: [4, 4, 5] }
      }
    }
  }
});
var liveDraft = [
  {
    groupId: 'g1',
    groupName: '第1组',
    players: [
      Object.assign(seat('P', 1, 'red'), { holes: [4, 5, 4] }),
      livePlayers[1],
      livePlayers[2],
      livePlayers[3]
    ]
  }
];
var edLive = bindPage(editorCaptured, {
  matchId: 'm-live',
  mode: 'live',
  _fromSeries: true,
  gameMode: '四人四球比杆赛',
  showCompositionMode: true,
  strokeCompositionMode: '2+2',
  _registerInfo: { users: liveUsers },
  _matchSnapshot: matches['m-live'],
  groupDraft: liveDraft
});
var beforeHoles = JSON.stringify(matches['m-live'].groups[0].players[0].holes);
var liveCand = edLive._buildLiveCandidateBase(matches['m-live'], liveDraft, {});
var afterHoles = JSON.stringify(liveCand.groups[0].players[0].holes);
var beforeSaveLive = saveCount;
edLive._collectGroupSaveRejectIssues = function () {
  return [];
};
edLive._finalizeLiveCandidate = function (c) {
  return { ok: true, candidate: c };
};
edLive._executeSeriesLiveIdentityCorrection = function () {
  identityExecCount += 1;
  return { ok: true, status: 'completed', candidate: liveCand };
};
edLive.onConfirm();
assert(
  '12 LIVE 身份纠正位置成绩不动',
  afterHoles === beforeHoles && identityExecCount >= 1 && saveCount === beforeSaveLive
);

resetUi();
saveCount = 0;
identityExecCount = 0;
['edit', 'create', 'live'].forEach(function (mode, idx) {
  var mid = 'm-mode-' + mode;
  putMatch({
    matchId: mid,
    gameMode: '个人比杆赛',
    registerInfo: { users: registerUsers }
  });
  var ed = bindPage(editorCaptured, {
    matchId: mid,
    mode: mode,
    _fromSeries: mode === 'live',
    _registerInfo: { users: registerUsers },
    _matchSnapshot: matches[mid],
    groupDraft: [{ groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B']) }]
  });
  var beforeSave = saveCount;
  ed._setGroupDraft(ed.data.groupDraft);
  assert(
    '13 模式 ' + mode + ' 草稿不写盘',
    saveCount === beforeSave && toastCalls.length === 0
  );
});

resetUi();
saveCount = 0;
putMatch({
  matchId: 'm-perm',
  gameMode: '个人比杆赛',
  registerInfo: { users: registerUsers },
  updatedAt: 1
});
var edPerm = bindPage(editorCaptured, {
  matchId: 'm-perm',
  mode: 'edit',
  _registerInfo: { users: registerUsers },
  _matchSnapshot: { matchId: 'm-perm', updatedAt: 1 },
  groupDraft: [{ groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B', 'C', 'D']) }]
});
matchManageAccess.hasMatchManagePermission = function () {
  return false;
};
edPerm.onConfirm();
assert(
  '14 权限变化确定时拒绝并明示',
  saveCount === 0 &&
    navCalls === 0 &&
    modalCalls.some(function (t) {
      return t.title === '分组无法保存' && String(t.content).indexOf('无管理权限') >= 0;
    })
);
matchManageAccess.hasMatchManagePermission = origPerm;
matchManageAccess.hasMatchManagePermission = function () {
  return true;
};

resetUi();
saveCount = 0;
putMatch({
  matchId: 'm-end',
  status: 'finished',
  completedAt: Date.now(),
  gameMode: '个人比杆赛',
  registerInfo: { users: registerUsers },
  updatedAt: 9
});
var edEnd = bindPage(editorCaptured, {
  matchId: 'm-end',
  mode: 'edit',
  _registerInfo: { users: registerUsers },
  _matchSnapshot: { matchId: 'm-end', updatedAt: 9, status: 'ongoing' },
  groupDraft: [{ groupId: 'g1', groupName: '第1组', players: fourSlots(['A', 'B', 'C', 'D']) }]
});
edEnd.onConfirm();
assert(
  '14b 结束态确定时拒绝不覆盖',
  saveCount === 0 &&
    navCalls === 0 &&
    modalCalls.some(function (t) {
      return t.title === '分组无法保存' && String(t.content).indexOf('已结束') >= 0;
    })
);

var mapper = bindPage(editorCaptured, {});
assert(
  '弹窗映射：未报名',
  mapper._normalizeGroupSaveRejectMessage('player_not_on_roster') === '有球员未报名'
);
assert(
  '弹窗映射：重复',
  mapper._normalizeGroupSaveRejectMessage('duplicate') === '同一球员重复出现在多个位置'
);
assert(
  '弹窗映射：人数',
  mapper._normalizeGroupSaveRejectMessage('player_count') === '分组人数不符合当前赛制'
);
assert(
  '弹窗映射：2+2',
  mapper._normalizeGroupSaveRejectMessage('affiliation_mismatch') === '2+2 队伍组合不合法'
);
assert(
  '弹窗映射：4+0',
  mapper._normalizeGroupSaveRejectMessage('4_0_multi_team') === '4+0 组合不合法'
);
assert(
  '弹窗映射：空位',
  mapper._normalizeGroupSaveRejectMessage('empty_group') === '存在未填的必要位置'
);
assert(
  '弹窗映射：已结束',
  mapper._normalizeGroupSaveRejectMessage('match_completed') === '场次或系列赛已结束'
);
assert(
  '弹窗映射：revision',
  mapper._normalizeGroupSaveRejectMessage('revision_conflict') === '数据已被其他管理员更新，请重新确认'
);
assert(
  '弹窗映射：位置成绩',
  mapper._normalizeGroupSaveRejectMessage('seat_score_moved') === '位置成绩数据异常，无法安全保存'
);
assert(
  '弹窗映射：权限',
  mapper._normalizeGroupSaveRejectMessage('permission_denied') === '无管理权限'
);

teamMatchStore.saveMatch = origSave;
teamMatchStore.getMatchById = origGet;
matchManageAccess.hasMatchManagePermission = origPerm;
gameStore.getCurrentUser = origUser;
identityMod.executeSeriesLiveIdentityCorrection = origIdentity;
global.setTimeout = _origSetTimeout;

console.log('');
console.log('---- groupEditorDraftDeferValidation.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
