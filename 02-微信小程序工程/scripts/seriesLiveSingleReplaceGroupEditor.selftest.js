/**
 * 6.2B-2：group-editor 接入 Series LIVE 单座位 Flow
 * 运行：node scripts/seriesLiveSingleReplaceGroupEditor.selftest.js
 */

var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var groupEditorPath = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'group-editor',
  'index.js'
);
var miniDir = path.join(root, 'miniprogram');

var modalCalls = [];
var toastCalls = [];
var navCalls = 0;

if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return { getTheme: function () { return 'bright'; } };
  };
}
var capturedPage = null;
global.Page = function (def) {
  capturedPage = def;
  return def;
};
global.wx = {
  getStorageSync: function () { return null; },
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

require(groupEditorPath);

var editorSrc = fs.readFileSync(groupEditorPath, 'utf8');

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

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function confirmBody() {
  var start = editorSrc.indexOf('  _confirmLiveGroups(match, rawDraft, pairingDraft)');
  var end = editorSrc.indexOf('  /** Series 入口：返回前刷新来源标记');
  if (start < 0) start = editorSrc.indexOf('_confirmLiveGroups(match, rawDraft, pairingDraft)');
  if (end < 0) end = editorSrc.indexOf('onCancel()');
  return editorSrc.slice(start, end);
}

function walkJs(dir, acc) {
  var list = fs.readdirSync(dir);
  for (var i = 0; i < list.length; i++) {
    var p = path.join(dir, list[i]);
    var st = fs.statSync(p);
    if (st.isDirectory()) {
      if (list[i] === 'node_modules') continue;
      walkJs(p, acc);
    } else if (/\.js$/.test(list[i])) {
      acc.push(p);
    }
  }
  return acc;
}

function makeEditor(opts) {
  var o = opts || {};
  var ed = {
    data: Object.assign(
      {
        matchId: o.matchId || 'm1',
        mode: o.mode || 'live',
        gameMode: o.gameMode || '个人比杆赛',
        groupDraft: o.groupDraft || [],
        pairingDraft: o.pairingDraft || {},
        showPairingSection: false,
        showCompositionMode: false,
        strokeCompositionMode: '2+2',
        saving: !!o.saving
      },
      o.data || {}
    ),
    _fromSeries: o._fromSeries === true,
    _registerInfo: o._registerInfo || null,
    _seriesReturnMeta: o._seriesReturnMeta || { seriesId: 'ser-1', roundId: 'r1' },
    setData: function (patch) {
      Object.assign(this.data, patch || {});
    }
  };
  Object.keys(capturedPage || {}).forEach(function (k) {
    if (typeof capturedPage[k] === 'function') ed[k] = capturedPage[k].bind(ed);
  });
  return ed;
}

function seat(id, pos) {
  return {
    position: pos,
    userId: id,
    playerId: id,
    id: id,
    displayName: '球员' + id,
    scorePlayerId: id
  };
}

var body = confirmBody();
assert(
  '1 普通 LIVE 走旧 Match-only',
  body.indexOf('_persistLiveMatchWithReadback') >= 0 &&
    body.indexOf('_fromSeries === true') >= 0 &&
    body.indexOf('_runSeriesLiveSingleReplaceFlow') >= 0 &&
    /if \(this\._fromSeries === true && this\.data\.mode === 'live'\)[\s\S]*_runSeriesLiveSingleReplaceFlow/.test(body)
);

assert(
  '2 普通 LIVE 仍允许多换人（不进 classifier）',
  body.indexOf('classifySeriesLiveSingleReplace') < 0 &&
    editorSrc.indexOf('seriesLiveSingleReplaceClassifier') < 0 &&
    editorSrc.indexOf('applyLiveGroupsFromDraft') >= 0
);

assert(
  '3 Series 非 LIVE 不走 Flow',
  editorSrc.indexOf("if (this.data.mode === 'live')") >= 0 &&
    /onConfirm[\s\S]*if \(this\.data\.mode === 'live'\)[\s\S]*_confirmLiveGroups/.test(editorSrc) &&
    body.indexOf("this.data.mode === 'live'") >= 0
);

var persistCalls = 0;
var flowCalls = [];
modalCalls = [];
toastCalls = [];
navCalls = 0;

var ordinary = makeEditor({ _fromSeries: false, mode: 'live', matchId: 'm-ord' });
ordinary._persistLiveMatchWithReadback = function (next) {
  persistCalls += 1;
  return { ok: true, match: next };
};
ordinary._executeSeriesLiveSingleReplaceFlow = function (input) {
  flowCalls.push(input);
  return { ok: true, status: 'completed' };
};
ordinary._sanitizeGroupDraft = function (d) {
  return Array.isArray(d) ? d : [];
};
ordinary._buildLiveCandidateBase = function (match) {
  return Object.assign({}, match, { groups: match.groups });
};
ordinary._finalizeLiveCandidate = function (c) {
  return { ok: true, candidate: c };
};
ordinary._confirmLiveGroups(
  { matchId: 'm-ord', groups: [{ groupId: 'g1', players: [seat('A', 1), seat('B', 2)] }] },
  [{ groupId: 'g1', players: [seat('X', 1), seat('B', 2), seat('Y', 3)] }],
  {}
);
assert('1b 普通 LIVE 调用 persist 且不调 Flow', persistCalls === 1 && flowCalls.length === 0);
assert(
  '普通 LIVE 成功 UX 仍为分组已保存',
  toastCalls.some(function (t) { return t.title === '分组已保存'; }) && navCalls === 1
);

var seriesEdit = makeEditor({ _fromSeries: true, mode: 'edit' });
seriesEdit._executeSeriesLiveSingleReplaceFlow = function (input) {
  flowCalls.push(input);
  return { status: 'completed' };
};
seriesEdit._confirmLiveGroups = capturedPage._confirmLiveGroups.bind(seriesEdit);
assert(
  '3b Series 非 LIVE 源码不在报名路径调 Flow',
  /onConfirm[\s\S]*mode === 'live'[\s\S]*_confirmLiveGroups[\s\S]*return;[\s\S]*_sanitizeGroupDraft/.test(
    editorSrc.replace(/\s+/g, ' ')
  ) || editorSrc.indexOf('teamMatchStore.saveMatch(next)') >= 0
);

flowCalls = [];
modalCalls = [];
toastCalls = [];
navCalls = 0;
var seriesLive = makeEditor({ _fromSeries: true, mode: 'live' });
seriesLive._executeSeriesLiveSingleReplaceFlow = function (input) {
  flowCalls.push(input);
  return { ok: true, status: 'completed' };
};
seriesLive._sanitizeGroupDraft = function (d) { return d; };
seriesLive._buildLiveCandidateBase = function (m) { return m; };
seriesLive._finalizeLiveCandidate = function (c) { return { ok: true, candidate: c }; };
seriesLive._reloadSeriesLiveReplaceContext = function () {
  return { editedGroupId: 'g1', incomingPlayer: { userId: 'B', displayName: '球员B' }, currentUser: { userId: 'admin' } };
};
seriesLive._persistLiveMatchWithReadback = function () {
  persistCalls += 1;
  return { ok: true };
};
persistCalls = 0;
seriesLive._confirmLiveGroups(
  { matchId: 'm1', groups: [{ groupId: 'g1', players: [seat('A', 1)] }] },
  [{ groupId: 'g1', players: [seat('B', 1)] }],
  {}
);
assert('4 Series LIVE direct 走 Flow', flowCalls.length === 1 && persistCalls === 0);
assert('4b 首次 acceptedConfirmationFingerprint 为空串', flowCalls[0].acceptedConfirmationFingerprint === '');
assert('5 direct 不弹确认', modalCalls.length === 0);
assert('14 completed 才返回', toastCalls.some(function (t) { return t.title === '分组已更新'; }) && navCalls === 1);

flowCalls = [];
modalCalls = [];
toastCalls = [];
navCalls = 0;
var seriesConfirm = makeEditor({ _fromSeries: true, mode: 'live' });
seriesConfirm._sanitizeGroupDraft = function (d) { return d; };
seriesConfirm._buildLiveCandidateBase = function (m) { return m; };
seriesConfirm._finalizeLiveCandidate = function (c) { return { ok: true, candidate: c }; };
seriesConfirm._reloadSeriesLiveReplaceContext = function () {
  return {
    editedGroupId: 'g1',
    incomingPlayer: { userId: 'B', displayName: '球员B' },
    currentUser: { userId: 'admin' }
  };
};
seriesConfirm._executeSeriesLiveSingleReplaceFlow = function (input) {
  flowCalls.push({ fp: input.acceptedConfirmationFingerprint, input: input });
  if (!input.acceptedConfirmationFingerprint) {
    return {
      status: 'confirmation_required',
      confirmationFingerprint: 'fp-1',
      confirmationDisplay: {
        incomingUserId: 'B',
        participant: { name: '红队', shortName: '红队' }
      }
    };
  }
  return { ok: true, status: 'completed' };
};
seriesConfirm._confirmLiveGroups(
  { matchId: 'm1', groups: [{ groupId: 'g1', players: [seat('A', 1)] }] },
  [{ groupId: 'g1', players: [seat('B', 1)] }],
  {}
);
assert('6 confirm 显示一次 modal', modalCalls.length === 1 && navCalls === 0);
assert(
  '6b modal 文案使用 display',
  modalCalls[0].title === '调整参赛归属' &&
    String(modalCalls[0].content).indexOf('球员B') >= 0 &&
    String(modalCalls[0].content).indexOf('红队') >= 0 &&
    modalCalls[0].confirmText === '确认调整并替换'
);

var draftKeep = [{ groupId: 'g1', players: [seat('B', 1)] }];
seriesConfirm.data.groupDraft = draftKeep;
seriesConfirm.data.saving = true;
modalCalls[0].success({ confirm: false });
assert(
  '7 取消零写入且保留 draft',
  seriesConfirm.data.saving === false &&
    seriesConfirm.data.groupDraft === draftKeep &&
    navCalls === 0 &&
    flowCalls.length === 1
);

seriesConfirm.data.saving = true;
modalCalls[0].success({ confirm: true });
assert(
  '8 确认传 fingerprint，不传 boolean',
  flowCalls.length === 2 &&
    flowCalls[1].fp === 'fp-1' &&
    flowCalls[1].fp !== true &&
    typeof flowCalls[1].fp === 'string'
);

flowCalls = [];
modalCalls = [];
toastCalls = [];
navCalls = 0;
var seriesStale = makeEditor({ _fromSeries: true, mode: 'live' });
seriesStale._sanitizeGroupDraft = function (d) { return d; };
seriesStale._buildLiveCandidateBase = function (m) { return m; };
seriesStale._finalizeLiveCandidate = function (c) { return { ok: true, candidate: c }; };
seriesStale._reloadSeriesLiveReplaceContext = function () {
  return { editedGroupId: 'g1', incomingPlayer: { userId: 'B', displayName: '球员B' }, currentUser: {} };
};
var staleN = 0;
seriesStale._executeSeriesLiveSingleReplaceFlow = function (input) {
  flowCalls.push(input.acceptedConfirmationFingerprint);
  staleN += 1;
  if (staleN === 1) {
    return {
      status: 'confirmation_required',
      confirmationFingerprint: 'fp-old',
      confirmationDisplay: { incomingUserId: 'B', participant: { shortName: '红队' } }
    };
  }
  return { status: 'stale_confirmation', code: 'confirmation_fingerprint_conflict' };
};
seriesStale._persistLiveMatchWithReadback = function () {
  persistCalls += 1;
  return { ok: true };
};
persistCalls = 0;
seriesStale._confirmLiveGroups(
  { matchId: 'm1', groups: [{ groupId: 'g1', players: [seat('A', 1)] }] },
  [{ groupId: 'g1', players: [seat('B', 1)] }],
  {}
);
modalCalls[0].success({ confirm: true });
assert('9 stale confirmation 不写 persist', persistCalls === 0 && navCalls === 0);
assert(
  '9b stale 提示状态变化或再展示确认',
  toastCalls.some(function (t) { return t.title === '分组状态已变化，请重新操作'; }) ||
    modalCalls.length === 2
);

var mapper = makeEditor({ _fromSeries: true, mode: 'live' });
assert(
  '10 多换人拒绝',
  mapper._mapSeriesLiveRejectMessage('multiple_replacements') ===
    '系列赛 LIVE 每次只能更换一名球员，请分次操作'
);
assert(
  '11 swap/move 拒绝',
  mapper._mapSeriesLiveRejectMessage('seat_swap').indexOf('每次只能更换一名') >= 0 &&
    mapper._mapSeriesLiveRejectMessage('player_move').indexOf('每次只能更换一名') >= 0
);
assert(
  '12 add/remove 拒绝',
  mapper._mapSeriesLiveRejectMessage('player_addition').indexOf('每次只能更换一名') >= 0 &&
    mapper._mapSeriesLiveRejectMessage('player_removal').indexOf('每次只能更换一名') >= 0
);
assert(
  '13 pairing-only/metadata 拒绝',
  mapper._mapSeriesLiveRejectMessage('pairing_only_change') ===
    '系列赛 LIVE 当前仅支持单个座位换人' &&
    mapper._mapSeriesLiveRejectMessage('no_live_group_change') === '未检测到可保存的换人'
);

function runStatus(status, extra) {
  toastCalls = [];
  modalCalls = [];
  navCalls = 0;
  var ed = makeEditor({ _fromSeries: true, mode: 'live' });
  ed.data.groupDraft = [{ keep: true }];
  ed._sanitizeGroupDraft = function (d) { return d; };
  ed._buildLiveCandidateBase = function (m) { return m; };
  ed._finalizeLiveCandidate = function (c) { return { ok: true, candidate: c }; };
  ed._reloadSeriesLiveReplaceContext = function () {
    return { editedGroupId: 'g1', incomingPlayer: { userId: 'B' }, currentUser: {} };
  };
  ed._executeSeriesLiveSingleReplaceFlow = function () {
    return Object.assign({ status: status }, extra || {});
  };
  ed._confirmLiveGroups(
    { matchId: 'm1', groups: [{ groupId: 'g1', players: [seat('A', 1)] }] },
    [{ groupId: 'g1', players: [seat('B', 1)] }],
    {}
  );
  return ed;
}

var failBefore = runStatus('failed_before_write');
assert(
  '15 failed_before 保留页面',
  navCalls === 0 &&
    failBefore.data.groupDraft[0].keep === true &&
    toastCalls.some(function (t) { return t.title === '保存失败，请重试'; }) &&
    failBefore.data.saving === false
);

var rolled = runStatus('failed_rolled_back');
assert(
  '16 failed_rolled_back 保留页面',
  navCalls === 0 &&
    rolled.data.groupDraft[0].keep === true &&
    toastCalls.some(function (t) { return t.title === '保存失败，已恢复原分组'; })
);

var review = runStatus('manual_review');
assert(
  '17 manual_review 不自动重试',
  navCalls === 0 &&
    modalCalls.length === 1 &&
    String(modalCalls[0].content).indexOf('请勿重复操作') >= 0 &&
    review.data.saving === false
);

assert(
  '18 group finished',
  mapper._mapSeriesLiveRejectMessage('group_finished') === '当前分组已结束，无法修改'
);
assert(
  '19 round cancelled',
  mapper._mapSeriesLiveRejectMessage('round_cancelled').indexOf('本轮已取消') >= 0
);
assert(
  '20 权限丢失',
  mapper._mapSeriesLiveRejectMessage('permission_denied') === '暂无分组管理权限'
);

var reloadFn = editorSrc.slice(
  editorSrc.indexOf('_reloadSeriesLiveReplaceContext'),
  editorSrc.indexOf('_buildSeriesLiveCandidateFromLatestMatch')
);
assert(
  '21 reloadContext 使用 Series/Match/index 权威身份',
  reloadFn.indexOf('seriesStore.getSeriesById') >= 0 &&
    reloadFn.indexOf('teamMatchStore.getMatchById') >= 0 &&
    reloadFn.indexOf('seriesStationIndex.getByMatchId') >= 0 &&
    reloadFn.indexOf('seriesContext') >= 0 &&
    reloadFn.indexOf('publishToken') >= 0 &&
    reloadFn.indexOf('gameStore.getCurrentUser') >= 0
);

var candFn = editorSrc.slice(
  editorSrc.indexOf('_buildSeriesLiveCandidateFromLatestMatch'),
  editorSrc.indexOf('_validateSeriesLiveCandidate')
);
assert(
  '22 candidate callback 复用 B-1 方法',
  candFn.indexOf('_buildLiveCandidateBase') >= 0 && candFn.indexOf('_finalizeLiveCandidate') >= 0
);

var valFn = editorSrc.slice(
  editorSrc.indexOf('_validateSeriesLiveCandidate'),
  editorSrc.indexOf('_mapSeriesLiveRejectMessage')
);
assert(
  '23 validator 不是恒 true',
  valFn.indexOf('validateStrokeEntities') >= 0 &&
    valFn.indexOf('validateGroupForTargetGameMode') >= 0 &&
    valFn.indexOf('return { ok: true, valid: true };') > valFn.indexOf('validateStrokeEntities') &&
    valFn.indexOf('ok: false') >= 0
);

assert(
  '24 页面不直接写 roster',
  editorSrc.indexOf('applyRosterAffiliationPatch') < 0 &&
    body.indexOf('upsertSeriesChecked') < 0 &&
    body.indexOf('saveMatch') < 0
);

assert(
  '25 页面无遗留 confirmed flag',
  editorSrc.indexOf('_seriesLiveReplaceConfirmed') < 0 &&
    editorSrc.indexOf('_applySeriesLiveReplaceBeforeValidate') < 0 &&
    editorSrc.indexOf('_writeSeriesLiveReplaceRoster') < 0
);

var prodHits = [];
walkJs(miniDir, []).forEach(function (file) {
  if (path.basename(file) === 'seriesLiveReplace.js') return;
  var src = fs.readFileSync(file, 'utf8');
  if (/require\([^)]*seriesLiveReplace\.js/.test(src)) prodHits.push(path.relative(root, file));
});
assert('26 生产不再 require 遗留模块', prodHits.length === 0, prodHits.join(', '));

var g8ed = makeEditor({ _fromSeries: true, mode: 'live', gameMode: '四人两球比洞赛' });
toastCalls = [];
navCalls = 0;
g8ed._sanitizeGroupDraft = function (d) { return d; };
g8ed._buildLiveCandidateBase = function (m) { return m; };
g8ed._finalizeLiveCandidate = function (c) { return { ok: true, candidate: c }; };
g8ed._reloadSeriesLiveReplaceContext = function () {
  return { editedGroupId: 'g1', incomingPlayer: { userId: 'X' }, currentUser: {} };
};
g8ed._executeSeriesLiveSingleReplaceFlow = function () {
  return { ok: true, status: 'completed' };
};
g8ed._confirmLiveGroups(
  {
    matchId: 'm-g8',
    gameMode: '四人两球比洞赛',
    groups: [
      {
        groupId: 'g1',
        players: [seat('A', 1), seat('B', 2), seat('C', 3), seat('D', 4)]
      }
    ],
    pairings: {
      g1: [
        { id: 'pair-keep-1', playerIds: ['A', 'B'] },
        { id: 'pair-keep-2', playerIds: ['C', 'D'] }
      ]
    },
    registerInfo: {
      users: [
        { userId: 'A', matchTeamId: 'red' },
        { userId: 'B', matchTeamId: 'red' },
        { userId: 'C', matchTeamId: 'blue' },
        { userId: 'D', matchTeamId: 'blue' },
        { userId: 'X', matchTeamId: 'red' }
      ]
    }
  },
  [
    {
      groupId: 'g1',
      players: [seat('X', 1), seat('B', 2), seat('C', 3), seat('D', 4)]
    }
  ],
  {
    g1: [
      { id: 'pair-keep-1', playerIds: ['A', 'B'] },
      { id: 'pair-keep-2', playerIds: ['C', 'D'] }
    ]
  }
);
assert(
  '27 G8 derived pairing 可成功',
  toastCalls.some(function (t) { return t.title === '分组已更新'; }) && navCalls === 1
);

var clickEd = makeEditor({ _fromSeries: false, mode: 'live', saving: true });
var confirmHits = 0;
clickEd._confirmLiveGroups = function () {
  confirmHits += 1;
};
clickEd.onConfirm();
assert('28 快速重复点击被 saving 拦截', confirmHits === 0);

assert(
  '页面 require Flow/journal/executor 而非遗留 seriesLiveReplace.js',
  editorSrc.indexOf("require('../../utils/seriesLiveSingleReplaceFlow.js')") >= 0 &&
    editorSrc.indexOf('seriesLiveMutationJournal') >= 0 &&
    editorSrc.indexOf("require('../../../../utils/seriesLiveReplace.js')") < 0
);

assert(
  '首次调用 fingerprint 为空串',
  editorSrc.indexOf("_runSeriesLiveSingleReplaceFlow(sanitized, pairingDraft, '')") >= 0
);

console.log('\n--- seriesLiveSingleReplaceGroupEditor.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
