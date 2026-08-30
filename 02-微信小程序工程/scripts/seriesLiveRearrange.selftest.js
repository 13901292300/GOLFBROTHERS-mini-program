/**
 * Series LIVE 重排：按 playerId 集合分类，不允许把换位当成多次换人。
 * 运行：node scripts/seriesLiveRearrange.selftest.js
 */

var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var cls = require(seriesTestPaths.util('seriesLiveSingleReplaceClassifier.js'));
var flow = require(seriesTestPaths.util('seriesLiveSingleReplaceFlow.js'));
var draft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));

var classify = cls.classifySeriesLiveSingleReplace;
var KIND = cls.KIND;
var ROUTE = cls.ROUTE;

var passed = 0;
var failed = [];

function assert(name, cond) {
  if (cond) {
    passed += 1;
    return;
  }
  failed.push(name);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function player(id, pos, extra) {
  return Object.assign(
    {
      position: pos,
      userId: id,
      playerId: id,
      id: id,
      displayName: '球员' + id,
      scorePlayerId: extra && extra.scorePlayerId != null ? extra.scorePlayerId : id,
      holes: extra && extra.holes ? extra.holes : [{ hole: 1, score: id === 'A' ? 4 : 5 }]
    },
    extra || {}
  );
}

function seriesOf(extra) {
  return Object.assign(
    {
      seriesId: 'ser-1',
      publishToken: 'tok-1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      rounds: [
        { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
        { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
      ],
      roster: []
    },
    extra || {}
  );
}

function matchOf() {
  return {
    matchId: 'm1',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    scoreData: { r1keep: true },
    groups: [
      { groupId: 'g1', groupName: '第1组', players: [player('A', 1), player('C', 2)] },
      { groupId: 'g2', groupName: '第2组', players: [player('X', 1, { scorePlayerId: 'X' })] }
    ],
    seriesContext: {
      managed: true,
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      publishToken: 'tok-1'
    }
  };
}

function swapIds(p, id) {
  return Object.assign({}, p, {
    userId: id,
    playerId: id,
    id: id,
    displayName: '球员' + id,
    scorePlayerId: id || ''
  });
}

function sameGroupSwap(before) {
  var a = clone(before);
  a.groups[0].players[0] = swapIds(a.groups[0].players[0], 'C');
  a.groups[0].players[1] = swapIds(a.groups[0].players[1], 'A');
  return a;
}

function crossGroupSwap(before) {
  var a = clone(before);
  a.groups[0].players[0] = swapIds(a.groups[0].players[0], 'X');
  a.groups[1].players[0] = swapIds(a.groups[1].players[0], 'A');
  return a;
}

function moveToEmpty(before) {
  var b = clone(before);
  b.groups[0].players[1] = swapIds(b.groups[0].players[1], '');
  b.groups[0].players[1].userId = '';
  b.groups[0].players[1].playerId = '';
  b.groups[0].players[1].id = '';
  var a = clone(b);
  a.groups[0].players[0] = swapIds(a.groups[0].players[0], '');
  a.groups[0].players[0].userId = '';
  a.groups[0].players[0].playerId = '';
  a.groups[0].players[0].id = '';
  a.groups[0].players[1] = swapIds(a.groups[0].players[1], 'A');
  return { before: b, after: a };
}

function runClassify(before, after) {
  return classify({ beforeMatch: before, candidateMatch: after, editedGroupId: 'g1' });
}

(function same_group() {
  var b = matchOf();
  var out = runClassify(b, sameGroupSwap(b));
  assert(
    '同组交换：重排 replacementCount=0',
    out.ok && out.kind === KIND.rearrangement && out.replacementCount === 0 && out.recommendedRoute === ROUTE.rearrangement_persist
  );
})();

(function cross_group() {
  var b = matchOf();
  var out = runClassify(b, crossGroupSwap(b));
  assert(
    '跨组交换：重排 replacementCount=0',
    out.ok && out.kind === KIND.rearrangement && out.replacementCount === 0
  );
})();

(function move_empty() {
  var pair = moveToEmpty(matchOf());
  var out = runClassify(pair.before, pair.after);
  assert(
    '移动到空位：重排 replacementCount=0',
    out.ok && out.kind === KIND.rearrangement && out.replacementCount === 0
  );
})();

(function single_replace() {
  var b = matchOf();
  var a = clone(b);
  a.groups[0].players[0] = swapIds(a.groups[0].players[0], 'B');
  var out = runClassify(b, a);
  assert(
    '单人真实替换只计一次',
    out.ok &&
      out.kind === KIND.single_replacement &&
      out.replacementCount === 1 &&
      out.replacement.outgoingUserId === 'A' &&
      out.replacement.incomingUserId === 'B'
  );
})();

(function two_replace_limit() {
  var b = matchOf();
  var a = clone(b);
  a.groups[0].players[0] = swapIds(a.groups[0].players[0], 'B');
  a.groups[0].players[1] = swapIds(a.groups[0].players[1], 'D');
  var out = runClassify(b, a);
  assert(
    '多人身份替换分类为 batch',
    out.ok === true && out.kind === KIND.batch_replacement && out.replacementCount === 2
  );
})();

(function remap_scores() {
  var oldGroups = matchOf().groups;
  var next = sameGroupSwap(matchOf()).groups;
  var remapped = draft.remapLiveScoreIdentityByPlayerId(oldGroups, next);
  var g1 = remapped[0].players;
  assert(
    '同组换位：身份交换，座位成绩原地不动',
    g1[0].userId === 'C' &&
      g1[0].scorePlayerId === 'C' &&
      JSON.stringify(g1[0].holes) === JSON.stringify(oldGroups[0].players[0].holes) &&
      g1[1].userId === 'A' &&
      g1[1].scorePlayerId === 'A' &&
      JSON.stringify(g1[1].holes) === JSON.stringify(oldGroups[0].players[1].holes)
  );
})();

(function empty_no_fake_score() {
  var pair = moveToEmpty(matchOf());
  var remapped = draft.remapLiveScoreIdentityByPlayerId(pair.before.groups, pair.after.groups);
  var empty = remapped[0].players[0];
  var moved = remapped[0].players[1];
  assert(
    '移出座位保留原成绩；空位绑定不带走原座位成绩',
    !empty.userId &&
      empty.scorePlayerId === '' &&
      moved.userId === 'A' &&
      moved.scorePlayerId === 'A'
  );
})();

function makeStore(matches) {
  var box = { data: clone(matches), journal: 0, persist: 0, restore: 0 };
  return {
    box: box,
    persistMatch: function (next, prev) {
      box.persist += 1;
      if (!next || !next.matchId) return { ok: false, reason: 'save_failed' };
      box.data[next.matchId] = clone(next);
      return { ok: true, match: clone(box.data[next.matchId]) };
    },
    restore: function (prev) {
      box.restore += 1;
      box.data[prev.matchId] = clone(prev);
    }
  };
}

function executeRearrange(before, after, extras) {
  var store = extras && extras.store ? extras.store : makeStore({ m1: before, m2: extras && extras.other });
  var journalCalls = { prepare: 0, forward: 0, rollback: 0 };
  var series = (extras && extras.series) || seriesOf();
  var other = (extras && extras.other) || {
    matchId: 'm2',
    status: 'ongoing',
    groups: [{ groupId: 'g9', players: [player('Z', 1)] }],
    scoreData: { other: true }
  };
  if (!store.box.data.m2) store.box.data.m2 = clone(other);
  var persistImpl = extras && extras.persistMatch ? extras.persistMatch : store.persistMatch;
  var out = flow.executeSeriesLiveSingleReplaceFlow({
    currentDraft: after.groups,
    editedGroupId: extras && extras.editedGroupId != null ? extras.editedGroupId : 'g1',
    reloadContext: function () {
      return {
        series: series,
        match: store.box.data.m1,
        latestMatch: store.box.data.m1,
        stationIndex: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1' },
        currentUser: { userId: 'host' }
      };
    },
    buildCandidateFromLatestMatch: function () {
      return after;
    },
    validateCandidate: extras && extras.validateCandidate
      ? extras.validateCandidate
      : function () {
          return { ok: true };
        },
    hasManagePermission: extras && extras.hasManagePermission != null
      ? extras.hasManagePermission
      : function () {
          return true;
        },
    persistMatch: persistImpl,
    prepareJournal: function () {
      journalCalls.prepare += 1;
      return { ok: false };
    },
    executeForward: function () {
      journalCalls.forward += 1;
      return { ok: false };
    },
    executeRollback: function () {
      journalCalls.rollback += 1;
      return { ok: false };
    },
    getJournal: function () {
      return null;
    }
  });
  return { out: out, store: store, journalCalls: journalCalls, other: other, series: series };
}

(function persist_same() {
  var b = matchOf();
  var a = sameGroupSwap(b);
  var r = executeRearrange(b, a);
  assert(
    '同组交换走 persist 不写 journal',
    r.out.ok &&
      r.out.status === 'completed' &&
      r.journalCalls.prepare === 0 &&
      r.journalCalls.forward === 0 &&
      r.journalCalls.rollback === 0
  );
  var saved = r.store.box.data.m1.groups[0].players;
  assert(
    '保存后当前轮座位已交换',
    saved[0].userId === 'C' && saved[1].userId === 'A'
  );
  assert(
    '其他轮不变',
    r.store.box.data.m2.groups[0].players[0].userId === 'Z' && r.store.box.data.m2.scoreData.other === true
  );
})();

(function persist_cross() {
  var b = matchOf();
  var r = executeRearrange(b, crossGroupSwap(b), { editedGroupId: '' });
  assert(
    '跨组交换 persist 成功',
    r.out.ok && r.out.status === 'completed' && r.store.box.data.m1.groups[1].players[0].userId === 'A'
  );
})();

(function persist_empty() {
  var pair = moveToEmpty(matchOf());
  var r = executeRearrange(pair.before, pair.after);
  assert('移动到空位 persist 成功', r.out.ok && r.out.status === 'completed');
})();

(function no_journal_ops() {
  var b = matchOf();
  var preview = flow.previewSeriesLiveSingleReplace({
    beforeMatch: b,
    candidateMatch: sameGroupSwap(b),
    editedGroupId: 'g1'
  });
  assert(
    '重排 preview 不进 journal 计划',
    preview.status === 'rearrangement_ready' && !preview.plan
  );
})();

(function fail_rollback() {
  var b = matchOf();
  var a = sameGroupSwap(b);
  var box = { m1: clone(b), m2: { matchId: 'm2', groups: [{ groupId: 'g9', players: [player('Z', 1)] }] } };
  var r = executeRearrange(b, a, {
    persistMatch: function (next, prev) {
      if (next && next.groups && next.groups[0].players[0].userId === 'C') {
        try {
          box.m1 = clone(next);
        } catch (e1) {
          /* ignore */
        }
        throw new Error('boom');
      }
      box[prev.matchId] = clone(prev);
      return { ok: true, match: clone(prev) };
    }
  });
  assert(
    '失败整体回滚',
    r.out.ok === false &&
      r.out.status === 'failed_rolled_back' &&
      r.journalCalls.forward === 0
  );
})();

(function permission() {
  var b = matchOf();
  var r = executeRearrange(b, sameGroupSwap(b), {
    hasManagePermission: function () {
      return false;
    }
  });
  assert('无权限仍拒绝', r.out.status === 'rejected' && r.out.code === 'permission_denied' && r.journalCalls.forward === 0);
})();

(function finished() {
  var b = matchOf();
  b.status = 'finished';
  var r = executeRearrange(b, sameGroupSwap(b));
  assert('已结束仍拒绝', r.out.status === 'rejected' && (r.out.code === 'match_completed' || r.out.code === 'station_not_live'));
})();

(function duplicate() {
  var b = matchOf();
  var a = clone(b);
  a.groups[0].players[1] = swapIds(a.groups[0].players[1], 'A');
  var out = runClassify(b, a);
  assert('重复球员仍拒绝', out.ok === false && out.code === 'incoming_already_in_round');
})();

(function editor_persist_hook() {
  var editor = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'group-editor', 'index.js'),
    'utf8'
  );
  var detail = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js'),
    'utf8'
  );
  assert(
    'group-editor 重排走 persistMatch 且成绩按座位保留',
    editor.indexOf('persistMatch:') >= 0 &&
      editor.indexOf('remapLiveScoreIdentityByPlayerId') < 0 &&
      editor.indexOf('bindLiveScoreIdentityToSeats') < 0 &&
      editor.indexOf('rematerializeLivePlayersAfterNormalize') >= 0 &&
      editor.indexOf('_openSeriesGroupEditorForRound') < 0
  );
  assert(
    'M 面板修改分组入口仍打开 group-editor',
    detail.indexOf('_openSeriesGroupEditorForRound') >= 0 &&
      detail.indexOf("permission === 'edit_groups'") >= 0
  );
})();

void journalMod;

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveRearrange.selftest');
