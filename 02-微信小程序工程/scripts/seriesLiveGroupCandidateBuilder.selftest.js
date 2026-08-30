/**
 * 6.2B-1：group-editor LIVE 候选 base/finalize 抽取 parity
 * 运行：node scripts/seriesLiveGroupCandidateBuilder.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var groupEditorPath = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-editor',
  'index.js'
);

var tournamentGroupDraft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var strokeEntityValidator = require(path.join(utilsDir, 'strokeEntityValidator.js'));
var strokeEntityBuilder = require(path.join(utilsDir, 'strokeEntityBuilder.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var seriesStore = require(path.join(utilsDir, 'seriesStore.js'));

var validateCalls = 0;
var origValidate = strokeEntityValidator.validateStrokeEntities;
strokeEntityValidator.validateStrokeEntities = function () {
  validateCalls += 1;
  return origValidate.apply(this, arguments);
};

var saveMatchCalls = 0;
var origSaveMatch = teamMatchStore.saveMatch;
teamMatchStore.saveMatch = function () {
  saveMatchCalls += 1;
  return origSaveMatch.apply(this, arguments);
};

var upsertCalls = 0;
var origUpsert = seriesStore.upsertSeriesChecked;
if (typeof origUpsert === 'function') {
  seriesStore.upsertSeriesChecked = function () {
    upsertCalls += 1;
    return origUpsert.apply(this, arguments);
  };
}

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
  showToast: function () {},
  showModal: function () {},
  navigateBack: function () {},
  getWindowInfo: function () {
    return { windowWidth: 375, windowHeight: 667 };
  },
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667 };
  }
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

function snapshot(v) {
  return JSON.stringify(v);
}

function stripUpdatedAt(match) {
  var next = clone(match || {});
  delete next.updatedAt;
  return next;
}

function makeEditor(opts) {
  var o = opts || {};
  var ed = {
    data: Object.assign(
      {
        themeClass: 'bright-mode',
        matchId: '',
        mode: 'live',
        gameMode: o.gameMode || '',
        showPairingSection: o.showPairingSection === true,
        showCompositionMode: o.showCompositionMode === true,
        showCompositionPreview: false,
        pairingDraft: o.pairingDraft || {},
        strokeCompositionMode: o.strokeCompositionMode || '2+2',
        saving: false
      },
      o.data || {}
    ),
    _fromSeries: !!o._fromSeries,
    _registerInfo: o._registerInfo || null,
    _seriesLiveReplaceConfirmed: false,
    setData: function (patch) {
      Object.assign(this.data, patch || {});
    }
  };
  Object.keys(capturedPage || {}).forEach(function (k) {
    if (typeof capturedPage[k] === 'function') {
      ed[k] = capturedPage[k].bind(ed);
    }
  });
  return ed;
}

function slot(userId, pos, extra) {
  return Object.assign(
    {
      position: pos,
      userId: userId,
      playerId: userId,
      id: userId,
      displayName: userId,
      scorePlayerId: extra && extra.scorePlayerId != null ? extra.scorePlayerId : userId,
      matchTeamId: extra && extra.team ? extra.team : '',
      groupId: extra && extra.team ? extra.team : '',
      affiliationId: extra && extra.team ? extra.team : ''
    },
    extra || {}
  );
}

function emptySlot(pos) {
  return { position: pos, userId: '', playerId: '', id: '' };
}

function registerUsers(list) {
  return {
    totalCount: list.length,
    users: list.map(function (p) {
      return {
        userId: p.userId,
        matchTeamId: p.team,
        groupId: p.team,
        displayName: p.userId,
        competitionName: p.userId
      };
    })
  };
}

function makeMatch(gameMode, players, extra) {
  var e = extra || {};
  var filled = players.filter(Boolean);
  var slots = [];
  for (var i = 0; i < 4; i++) {
    var p = players[i];
    slots.push(p ? slot(p.userId, i + 1, { team: p.team, scorePlayerId: p.scorePlayerId }) : emptySlot(i + 1));
  }
  return Object.assign(
    {
      matchId: e.matchId || 'm-live-1',
      status: 'LIVE',
      gameMode: gameMode,
      matchType: 'team-inter',
      strokeCompositionMode: e.strokeCompositionMode || '2+2',
      groups: [
        {
          groupId: 'g1',
          groupName: '第1组',
          players: slots
        }
      ],
      pairings: e.pairings || {},
      scoreData: e.scoreData || {
        g1: {
          scoresByPlayer: {}
        }
      },
      scoreEntities: e.scoreEntities || {},
      teamScoresByEntity: e.teamScoresByEntity || {},
      registerInfo: registerUsers(filled),
      teamGroups: [
        { id: 'red', name: '红队' },
        { id: 'blue', name: '蓝队' }
      ]
    },
    e.matchExtra || {}
  );
}

function draftFromPlayers(players) {
  var slots = [];
  for (var i = 0; i < 4; i++) {
    var p = players[i];
    slots.push(
      p
        ? {
            position: i + 1,
            userId: p.userId,
            displayName: p.userId,
            matchTeamId: p.team,
            groupId: p.team
          }
        : { position: i + 1, userId: '' }
    );
  }
  return [{ groupId: 'g1', groupName: '第1组', players: slots }];
}

function expectedOrdinaryPayload(match, sanitized, pageData) {
  var oldGroups = Array.isArray(match.groups) ? match.groups : [];
  var nextGroups = tournamentGroupDraft.rematerializeLivePlayersAfterNormalize(
    tournamentGroupDraft.applyLiveGroupsFromDraft(oldGroups, sanitized),
    oldGroups
  );
  var gameMode = String(match.gameMode || '');
  var isG4Stroke = strokeEntityValidator.isG4FamilyMode(gameMode);
  var shouldPersistPairings = !!(pageData && pageData.showPairingSection) || isG4Stroke;
  var next = Object.assign({}, match, {
    groups: nextGroups,
    pairings: shouldPersistPairings ? match.pairings || {} : {},
    scoreData:
      match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? Object.assign({}, match.scoreData)
        : {}
  });
  if (pageData && pageData.showCompositionMode) {
    next.strokeCompositionMode = pageData.strokeCompositionMode === '2+2' ? '2+2' : '4+0';
  } else if (strokeEntityValidator.isG6G7MatchPlayMode(gameMode)) {
    next.strokeCompositionMode = '2+2';
  }
  if (!shouldPersistPairings) next.pairings = {};
  if (isG4Stroke) {
    var rebuilt = {};
    var matchId = String(match.matchId || '');
    var matchPairings =
      match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
        ? match.pairings
        : {};
    nextGroups.forEach(function (group) {
      var gid = group && group.groupId != null ? String(group.groupId) : '';
      if (!gid) return;
      rebuilt[gid] = tournamentGroupDraft.buildAutoPairingsForGroup(
        group,
        matchId,
        Array.isArray(matchPairings[gid]) ? matchPairings[gid] : []
      );
    });
    next.pairings = teamMatchStore.sanitizePairings(rebuilt);
  }
  next.scoreData = tournamentGroupDraft.rebindLiveScoreDataToSeatPlayers(
    oldGroups,
    nextGroups,
    next.scoreData
  );
  var check = origValidate(next);
  if (!check || check.valid !== true) {
    return { ok: false, reason: (check && check.reason) || 'invalid' };
  }
  next.scoreEntities = strokeEntityBuilder.syncStrokeEntities(next);
  return { ok: true, candidate: next };
}

assert('Page captured group-editor methods', !!(capturedPage && capturedPage._confirmLiveGroups));
assert(
  'extracted _buildLiveCandidateBase / _finalizeLiveCandidate',
  typeof capturedPage._buildLiveCandidateBase === 'function' &&
    typeof capturedPage._finalizeLiveCandidate === 'function'
);

var A = { userId: 'A', team: 'red', scorePlayerId: 'A' };
var B = { userId: 'B', team: 'red', scorePlayerId: 'B' };
var C = { userId: 'C', team: 'blue', scorePlayerId: 'C' };
var D = { userId: 'D', team: 'blue', scorePlayerId: 'D' };
var X = { userId: 'X', team: 'red', scorePlayerId: 'A' };

var ordinaryPlayers = [A, B, C, D];
var ordinaryMatch = makeMatch('四人四球比杆赛', ordinaryPlayers, {
  scoreData: {
    g1: { scoresByPlayer: { A: { scores: [4, 5] } } }
  }
});
ordinaryMatch.scoreData.g1.scoresByPlayer.A = { scores: [4, 5] };
ordinaryMatch.registerInfo.users.push({
  userId: 'X',
  matchTeamId: 'red',
  groupId: 'red',
  displayName: 'X',
  competitionName: 'X'
});
ordinaryMatch.registerInfo.totalCount = ordinaryMatch.registerInfo.users.length;

var ordinaryDraft = draftFromPlayers([
  { userId: 'X', team: 'red' },
  B,
  D,
  C
]);

var editorOrd = makeEditor({
  gameMode: '四人四球比杆赛',
  showCompositionMode: true,
  strokeCompositionMode: '2+2'
});

saveMatchCalls = 0;
upsertCalls = 0;
var matchSnap = clone(ordinaryMatch);
var draftSnap = clone(ordinaryDraft);
var baseOrd = editorOrd._buildLiveCandidateBase(ordinaryMatch, ordinaryDraft, {});

assert('1 base 不写 storage', saveMatchCalls === 0 && upsertCalls === 0);
assert(
  '2 base 不改输入',
  snapshot(ordinaryMatch) === snapshot(matchSnap) && snapshot(ordinaryDraft) === snapshot(draftSnap)
);

var seat0 = baseOrd.groups[0].players.filter(function (p) {
  return String(p.userId) === 'X';
})[0];
assert(
  '3 score identity 保留',
  !!(seat0 && String(seat0.scorePlayerId) === 'X' && String(seat0.userId) === 'X')
);

var g5Match = makeMatch('个人比洞赛', [A, C]);
var g5Draft = draftFromPlayers([{ userId: 'X', team: 'red' }, C]);
var editorG5 = makeEditor({ gameMode: '个人比洞赛' });
var baseG5 = editorG5._buildLiveCandidateBase(g5Match, g5Draft, {});
var g5X = baseG5.groups[0].players.filter(function (p) {
  return String(p.userId) === 'X';
})[0];
assert(
  '4 G5 base',
  String(baseG5.gameMode) === '个人比洞赛' &&
    snapshot(baseG5.pairings) === '{}' &&
    !!(g5X && String(g5X.scorePlayerId) === 'X') &&
    Number(g5X.position) >= 1
);

var g6Match = makeMatch('四人四球比洞赛', ordinaryPlayers);
var g6Draft = draftFromPlayers(ordinaryPlayers);
var editorG6 = makeEditor({ gameMode: '四人四球比洞赛' });
var baseG6 = editorG6._buildLiveCandidateBase(g6Match, g6Draft, {});
assert(
  '5 G6/G7 base',
  String(baseG6.gameMode) === '四人四球比洞赛' &&
    String(baseG6.strokeCompositionMode) === '2+2' &&
    Array.isArray(baseG6.groups) &&
    baseG6.groups[0].players.filter(function (p) {
      return p && String(p.userId || '').trim();
    }).length === 4
);

var stableP1 = 'pair-keep-g1-1';
var stableP2 = 'pair-keep-g1-2';
var g8Match = makeMatch('四人两球比洞赛', ordinaryPlayers, {
  pairings: {
    g1: [
      { id: stableP1, playerIds: ['A', 'B'] },
      { id: stableP2, playerIds: ['C', 'D'] }
    ]
  }
});
var g8Draft = draftFromPlayers([X, B, C, D]);
var editorG8 = makeEditor({ gameMode: '四人两球比洞赛', pairingDraft: g8Match.pairings });
var baseG8 = editorG8._buildLiveCandidateBase(g8Match, g8Draft, g8Match.pairings);
var g8List = (baseG8.pairings && baseG8.pairings.g1) || [];
assert(
  '6 G8 pairing stable ID',
  g8List.length >= 2 &&
    String(g8List[0].id) === stableP1 &&
    String(g8List[1].id) === stableP2
);

validateCalls = 0;
saveMatchCalls = 0;
upsertCalls = 0;
var fin = editorOrd._finalizeLiveCandidate(baseOrd);
assert('7 finalize 调 validator', validateCalls >= 1 && fin.ok === true);
assert(
  '8 finalize sync entities',
  !!(fin.candidate && fin.candidate.scoreEntities && typeof fin.candidate.scoreEntities === 'object')
);

var badG5 = makeMatch('个人比洞赛', [A, B]);
var badDraft = draftFromPlayers([A, B]);
var badBase = editorG5._buildLiveCandidateBase(badG5, badDraft, {});
saveMatchCalls = 0;
upsertCalls = 0;
var badFin = editorG5._finalizeLiveCandidate(badBase);
assert(
  '9 finalize 失败不写 storage',
  badFin.ok === false && saveMatchCalls === 0 && upsertCalls === 0
);

var expected = expectedOrdinaryPayload(clone(ordinaryMatch), clone(ordinaryDraft), editorOrd.data);
assert('ordinary fixture builder ok', expected.ok === true, expected.reason);
assert(
  '10 普通单场最终 payload 与重构前 fixture 相同',
  expected.ok && snapshot(stripUpdatedAt(fin.candidate)) === snapshot(stripUpdatedAt(expected.candidate))
);

var confirmStart = editorSrc.indexOf('_confirmLiveGroups(match, rawDraft, pairingDraft)');
var confirmEnd = editorSrc.indexOf('Series 入口：返回前刷新来源标记');
var confirmBody = editorSrc.slice(confirmStart, confirmEnd < 0 ? editorSrc.length : confirmEnd);
var iBase = confirmBody.indexOf('_buildLiveCandidateBase');
var iFin = confirmBody.indexOf('_finalizeLiveCandidate');
var iFlow = confirmBody.indexOf('_runSeriesLiveIdentityCorrection');
var iPersist = confirmBody.indexOf('_persistLiveMatchWithReadback');
assert(
  '11 LIVE confirm 顺序：base→finalize；Series LIVE 走 identityCorrection，普通走 Match persist',
  iBase >= 0 &&
    iFin > iBase &&
    iFlow > iFin &&
    iPersist > iFin &&
    confirmBody.indexOf('_fromSeries === true') >= 0 &&
    confirmBody.indexOf("_applySeriesLiveReplaceBeforeValidate") < 0 &&
    confirmBody.indexOf('_writeSeriesLiveReplaceRoster') < 0
);

assert(
  '12 候选构造不直接 require classifier',
  editorSrc.indexOf('seriesLiveSingleReplaceClassifier') < 0
);

(function live_c_replace_keeps_group_meta() {
  var persisted = makeMatch('个人比洞赛', [A, { userId: 'P', team: 'red', scorePlayerId: 'P' }], {
    matchExtra: { seriesContext: { managed: true, seriesId: 'ser-1', roundId: 'r1', matchId: 'm-live-1', publishToken: 'tok' } }
  });
  persisted.groups[0].order = 2;
  persisted.groups[0].teeTime = '07:40';
  persisted.groups[0].status = 'LIVE';
  persisted.groups[0].groupName = '第1组';
  var dirty = draftFromPlayers([{ userId: 'C', team: 'blue' }, { userId: 'P', team: 'red' }]);
  dirty[0].groupName = '草稿组名';
  dirty[0].order = 88;
  dirty[0].teeTime = '22:00';
  dirty[0].status = 'draft';
  dirty[0]._pageTmp = 1;
  var editor = makeEditor({ gameMode: '个人比洞赛' });
  var cand = editor._buildLiveCandidateBase(persisted, dirty, {});
  assert(
    '13 C替换A 沿用持久化 group metadata',
    cand.groups[0].groupName === '第1组' &&
      cand.groups[0].order === 2 &&
      cand.groups[0].teeTime === '07:40' &&
      cand.groups[0].status === 'LIVE' &&
      String(cand.groups[0].players[0].userId) === 'C' &&
      String(cand.groups[0].players[0].scorePlayerId) === 'C'
  );
  var newSeries = clone(persisted);
  delete newSeries.seriesContext;
  var candNew = editor._buildLiveCandidateBase(newSeries, dirty, {});
  assert(
    '14 新建系列赛同样沿用 group metadata',
    candNew.groups[0].groupName === persisted.groups[0].groupName &&
      candNew.groups[0].order === 2 &&
      candNew.groups[0].teeTime === '07:40'
  );
})();

assert(
  'base/finalize 自身不 persist / 不弹窗',
  (function () {
    var start = editorSrc.indexOf('_buildLiveCandidateBase');
    var end = editorSrc.indexOf('_seriesLivePlayerId');
    if (end < 0) end = editorSrc.indexOf('_confirmLiveGroups');
    if (start < 0 || end <= start) return false;
    var chunk = editorSrc.slice(start, end);
    return (
      chunk.indexOf('saveMatch') < 0 &&
      chunk.indexOf('upsertSeries') < 0 &&
      chunk.indexOf('wx.showModal') < 0 &&
      chunk.indexOf('wx.showToast') < 0 &&
      chunk.indexOf('navigateBack') < 0 &&
      chunk.indexOf('_seriesLiveReplaceConfirmed') < 0
    );
  })()
);

console.log('\n--- seriesLiveGroupCandidateBuilder.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
