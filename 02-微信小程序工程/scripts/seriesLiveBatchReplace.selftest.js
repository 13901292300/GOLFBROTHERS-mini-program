/**
 * Series LIVE 原子批量替换
 * 运行：node scripts/seriesLiveBatchReplace.selftest.js
 */

var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var cls = require(seriesTestPaths.util('seriesLiveSingleReplaceClassifier.js'));
var flow = require(seriesTestPaths.util('seriesLiveSingleReplaceFlow.js'));
var batch = require(seriesTestPaths.util('seriesLiveBatchReplace.js'));
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var draft = require(seriesTestPaths.util('tournamentGroupDraft.js'));

var classify = cls.classifySeriesLiveSingleReplace;
var KIND = cls.KIND;
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

function asString(v) {
  return v == null ? '' : String(v).trim();
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
      seriesParticipantId: extra && extra.part ? extra.part : 'part-red',
      holes: extra && extra.holes ? extra.holes : [{ hole: 1, score: id === 'A' ? 4 : id === 'C' ? 5 : 6 }]
    },
    extra || {}
  );
}

function rosterRow(id, part) {
  return {
    rosterEntryId: 're-' + id,
    playerId: id,
    seriesParticipantId: part || 'part-red',
    registrationStatus: 'registered'
  };
}

function seriesOf(extra) {
  return Object.assign(
    {
      seriesId: 'ser-1',
      publishToken: 'tok-1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      registrationRevision: 3,
      rounds: [
        { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
        { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
      ],
      roster: [rosterRow('B'), rosterRow('D'), rosterRow('F'), rosterRow('G')]
    },
    extra || {}
  );
}

function matchOf() {
  return {
    matchId: 'm1',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    updatedAt: 1,
    scoreData: { r1keep: true },
    groups: [
      { groupId: 'g1', groupName: '第1组', players: [player('A', 1), player('C', 2), player('E', 3)] },
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

function setSeat(groups, groupId, pos, id) {
  groups.forEach(function (g) {
    if (g.groupId !== groupId) return;
    g.players = g.players.map(function (p) {
      if (Number(p.position) !== pos) return p;
      return Object.assign({}, p, { userId: id, playerId: id, id: id, displayName: '球员' + id, scorePlayerId: id || '' });
    });
  });
}

function otherRound() {
  return {
    matchId: 'm2',
    status: 'ongoing',
    groups: [{ groupId: 'g9', players: [player('Z', 1)] }],
    scoreData: { other: true }
  };
}

function makeWorld(opts) {
  var o = opts || {};
  var before = o.before || matchOf();
  var after = o.after || clone(before);
  var series = o.series || seriesOf();
  var m2 = o.other || otherRound();
  var box = { m1: clone(before), m2: clone(m2), series: clone(series) };
  var stats = { match: 0, series: 0, journal: 0, journalFail: false, seriesFail: false, matchFail: false };
  var mem = { data: null };
  var journalApi = journalMod.createSeriesLiveMutationJournal({
    getItem: function () {
      return { ok: true, value: mem.data };
    },
    setItem: function (_key, value) {
      mem.data = value;
      return { ok: true };
    }
  });
  return {
    before: before,
    after: after,
    series: series,
    box: box,
    stats: stats,
    journalApi: journalApi,
    journalMem: mem,
    persistMatch: function (next, prev) {
      stats.match += 1;
      if (stats.matchFail) return { ok: false, reason: 'save_failed' };
      box[next.matchId] = clone(next);
      return { ok: true, match: clone(box[next.matchId]) };
    },
    persistSeries: function (next, rev) {
      stats.series += 1;
      if (stats.seriesFail) return { ok: false, reason: 'storage_write_failed' };
      if (rev != null && Number(rev) !== Number(box.series.registrationRevision)) {
        return { ok: false, reason: 'registration_conflict' };
      }
      box.series = clone(next);
      return { ok: true, series: clone(next) };
    },
    writeBatchJournal: function (payload) {
      stats.journal += 1;
      if (stats.journalFail) return { ok: false, reason: 'journal_write_failed' };
      if (stats.journalTooLarge) return { ok: false, reason: 'journal_too_large' };
      return journalApi.writePreparedBatchJournal(payload);
    },
    getMatchById: function (id) {
      return box[id] || null;
    },
    getSeriesById: function (id) {
      if (asString(id) === asString(box.series.seriesId)) return box.series;
      return null;
    },
    run: function () {
      var w = this;
      return flow.executeSeriesLiveSingleReplaceFlow({
        currentDraft: after.groups,
        editedGroupId: o.editedGroupId != null ? o.editedGroupId : 'g1',
        __crashAfter: w.__crashAfter,
        journalApi: journalApi,
        getSeriesById: function (id) {
          if (asString(id) === asString(box.series.seriesId)) return box.series;
          return null;
        },
        reloadContext: function () {
          return {
            series: box.series,
            match: box.m1,
            latestMatch: box.m1,
            stationIndex: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok-1' },
            currentUser: { userId: 'host' }
          };
        },
        buildCandidateFromLatestMatch: function () {
          return after;
        },
        validateCandidate: o.validateCandidate || function () {
          return { ok: true };
        },
        hasManagePermission: o.hasManagePermission != null ? o.hasManagePermission : function () {
          return true;
        },
        persistMatch: o.persistMatch || w.persistMatch,
        persistSeries: o.persistSeries || w.persistSeries,
        writeBatchJournal: o.writeBatchJournal || w.writeBatchJournal,
        writePreparedBatchJournal: o.writePreparedBatchJournal,
        getMatchById: o.getMatchById || w.getMatchById,
        prepareJournal: function () {
          return { ok: false };
        },
        executeForward: function () {
          stats.forward = (stats.forward || 0) + 1;
          return { ok: false };
        }
      });
    }
  };
}

(function two_replace() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w = makeWorld({ before: b, after: a });
  var out = w.run();
  assert(
    '1 两名真实替换成功',
    out.ok &&
      out.status === 'completed' &&
      out.replacementCount === 2 &&
      w.box.m1.groups[0].players[0].userId === 'B' &&
      w.box.m1.groups[0].players[1].userId === 'D' &&
      !w.stats.forward
  );
})();

(function three_replace() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  setSeat(a.groups, 'g1', 3, 'F');
  var w = makeWorld({ before: b, after: a });
  var out = w.run();
  assert('2 三名真实替换成功', out.ok && out.status === 'completed' && out.replacementCount === 3);
})();

(function rearrange_plus_two() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  a.groups[0].players[2] = Object.assign({}, a.groups[0].players[2], {
    userId: 'X',
    playerId: 'X',
    id: 'X'
  });
  a.groups[1].players[0] = Object.assign({}, a.groups[1].players[0], {
    userId: 'E',
    playerId: 'E',
    id: 'E'
  });
  var outc = classify({ beforeMatch: b, candidateMatch: a, editedGroupId: 'g1' });
  var w = makeWorld({ before: b, after: a });
  var out = w.run();
  assert(
    '3 重排+两名真实替换',
    outc.kind === KIND.batch_replacement &&
      outc.replacementCount === 2 &&
      out.ok &&
      out.status === 'completed'
  );
})();

(function cross_group_batch() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g2', 1, 'D');
  var w = makeWorld({ before: b, after: a, editedGroupId: '' });
  var out = w.run();
  assert(
    '4 跨组批量替换',
    out.ok && out.status === 'completed' && w.box.m1.groups[1].players[0].userId === 'D'
  );
})();

(function ineligible() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'NOPE');
  var w = makeWorld({ before: b, after: a });
  var snap = clone(w.box.m1);
  var out = w.run();
  assert(
    '5 incoming 无资格整批失败 0 写入',
    out.ok === false &&
      out.code === 'player_not_on_roster' &&
      w.stats.match === 0 &&
      w.stats.journal === 0 &&
      JSON.stringify(w.box.m1.groups) === JSON.stringify(snap.groups)
  );
})();

(function duplicate() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'B');
  var out = classify({ beforeMatch: b, candidateMatch: a, editedGroupId: 'g1' });
  assert('6 重复 playerId 拒绝', out.ok === false && out.code === 'incoming_already_in_round');
})();

(function over_capacity() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w = makeWorld({
    before: b,
    after: a,
    validateCandidate: function () {
      return { ok: false, reason: 'player_count' };
    }
  });
  var out = w.run();
  assert(
    '7 一组超员整批失败',
    out.ok === false && (out.code === 'player_count' || out.code === 'group_over_capacity') && w.stats.match === 0
  );
})();

(function revision_conflict() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var drifted = clone(b);
  drifted.updatedAt = 99;
  var w = makeWorld({
    before: b,
    after: a,
    getMatchById: function () {
      return drifted;
    }
  });
  var out = w.run();
  assert('8 revision 冲突整批失败', out.ok === false && out.code === 'revision_conflict' && w.stats.match === 0);
})();

(function match_fail() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w = makeWorld({ before: b, after: a });
  w.stats.matchFail = true;
  var seriesSnap = clone(w.box.series);
  var out = w.run();
  var j9 = w.journalApi.getJournal(out.planKey || '');
  assert(
    '9 match 保存失败主数据回滚',
    out.ok === false &&
      w.box.m1.groups[0].players[0].userId === 'A' &&
      JSON.stringify(w.box.series) === JSON.stringify(seriesSnap)
  );
})();

(function roster_fail() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  a.groups[0].players[0].seriesParticipantId = 'part-blue';
  var w = makeWorld({ before: b, after: a });
  w.stats.seriesFail = true;
  var out = w.run();
  assert(
    '10 series roster 失败则 match 回滚',
    out.ok === false &&
      out.status === 'failed_rolled_back' &&
      w.box.m1.groups[0].players[0].userId === 'A'
  );
})();

(function journal_fail() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w = makeWorld({ before: b, after: a });
  w.stats.journalFail = true;
  var snap = clone(w.box.m1);
  var out = w.run();
  assert(
    '11 prepared journal 失败主数据 0 写入',
    out.ok === false &&
      (out.code === 'journal_write_failed' || out.cannotSafelyPersist) &&
      w.stats.match === 0 &&
      JSON.stringify(w.box.m1.groups) === JSON.stringify(snap.groups)
  );
})();

(function batch_rollback() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w = makeWorld({ before: b, after: a });
  var out = w.run();
  var rb = batch.rollbackBatchReplace({
    planKey: out.planKey,
    persistMatch: w.persistMatch,
    persistSeries: w.persistSeries,
    getJournal: w.journalApi.getJournal,
    journalApi: w.journalApi,
    markBatchRolledBack: w.journalApi.markBatchRolledBack
  });
  assert(
    '12 committed 后显式 rollback 拒绝',
    out.ok && rb.ok === false && rb.code === 'journal_committed' && w.box.m1.groups[0].players[0].userId === 'B'
  );
})();

(function scores() {
  var oldGroups = matchOf().groups;
  var next = clone(oldGroups);
  setSeat(next, 'g1', 1, 'B');
  setSeat(next, 'g1', 2, 'D');
  var remapped = draft.remapLiveScoreIdentityByPlayerId(oldGroups, next);
  var p1 = remapped[0].players[0];
  var p2 = remapped[0].players[1];
  var e = remapped[0].players[2];
  var x = remapped[1].players[0];
  assert(
    '13 outgoing 成绩不按 playerId 转给 incoming',
    p1.userId === 'B' && p1.scorePlayerId === 'B' && JSON.stringify(p1.holes) === JSON.stringify(oldGroups[0].players[0].holes)
  );
  assert('14 未变球员成绩保持', e.userId === 'E' && e.scorePlayerId === 'E' && x.scorePlayerId === 'X');
})();

(function rearrange_no_batch_journal() {
  var b = matchOf();
  var a = clone(b);
  a.groups[0].players[0] = Object.assign({}, a.groups[0].players[0], {
    userId: 'C',
    playerId: 'C',
    id: 'C',
    displayName: '球员C',
    scorePlayerId: 'C'
  });
  a.groups[0].players[1] = Object.assign({}, a.groups[0].players[1], {
    userId: 'A',
    playerId: 'A',
    id: 'A',
    displayName: '球员A',
    scorePlayerId: 'A'
  });
  var w = makeWorld({ before: b, after: a });
  var out = w.run();
  assert(
    '15 纯重排不写 replacement journal',
    out.ok && out.status === 'completed' && w.stats.journal === 0 && (out.replacementCount === 0 || out.replacementCount == null)
  );
})();

(function single_keeps() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  var out = classify({ beforeMatch: b, candidateMatch: a, editedGroupId: 'g1' });
  assert(
    '16 单人替换保持原 kind',
    out.ok && out.kind === KIND.single_replacement && out.recommendedRoute === cls.ROUTE.single_replace_journal
  );
})();

(function locks() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w1 = makeWorld({
    before: b,
    after: a,
    hasManagePermission: function () {
      return false;
    }
  });
  var finished = clone(b);
  finished.status = 'finished';
  var a2 = clone(a);
  a2.status = 'finished';
  var w2 = makeWorld({ before: finished, after: a2 });
  var o1 = w1.run();
  var o2 = w2.run();
  assert('17a 无权限仍拒绝', o1.code === 'permission_denied' && w1.stats.match === 0);
  assert(
    '17b 已结束仍拒绝',
    o2.ok === false && (o2.code === 'match_completed' || o2.code === 'station_not_live' || o2.code === 'group_finished')
  );
})();

(function other_round() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w = makeWorld({ before: b, after: a });
  w.run();
  assert('18 只改当前轮', w.box.m2.groups[0].players[0].userId === 'Z' && w.box.m2.scoreData.other === true);
})();

(function m_panel_and_unique() {
  var detail = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js'),
    'utf8'
  );
  var editor = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'group-editor', 'index.js'),
    'utf8'
  );
  var batchSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'seriesLiveBatchReplace.js'),
    'utf8'
  );
  assert(
    '19 M 面板入口仍打开 group-editor',
    detail.indexOf('_openSeriesGroupEditorForRound') >= 0 && editor.indexOf('每次只能更换一名') < 0
  );
  assert(
    '20 不循环单人 execute',
    batchSrc.indexOf('executeSeriesLiveReplace') < 0 && batchSrc.indexOf('for (') >= 0
  );
  assert(
    '20b group-editor 正式保存不走换人 journal，进页仍可消化历史记录',
    editor.indexOf('executeSeriesLiveIdentityCorrection') >= 0 &&
      editor.indexOf('writePreparedBatchJournal') < 0 &&
      editor.indexOf('_recoverIncompleteLiveBatchMutations') >= 0
  );
})();

function twoSeatWorld() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  return makeWorld({ before: b, after: a });
}

function recoverW(w, extra) {
  return batch.recoverIncompleteLiveBatchMutations(
    Object.assign(
      {
        matchId: 'm1',
        seriesId: 'ser-1',
        roundId: 'r1',
        persistMatch: w.persistMatch,
        persistSeries: w.persistSeries,
        getMatchById: w.getMatchById,
        getSeriesById: w.getSeriesById,
        journalApi: w.journalApi
      },
      extra || {}
    )
  );
}

function crashRun(point) {
  var w = twoSeatWorld();
  w.__crashAfter = point;
  var crashed = false;
  try {
    w.run();
  } catch (e) {
    crashed = !!(e && e.processCrash);
  }
  return { w: w, crashed: crashed };
}

(function wal_prepared_crash() {
  var r = crashRun('prepared');
  assert('21 prepared 后崩溃主数据未写', r.crashed && r.w.box.m1.groups[0].players[0].userId === 'A');
  var rec = recoverW(r.w);
  var journal = rec.results[0] && rec.results[0].journal;
  assert(
    '21b prepared 崩溃可恢复',
    rec.ok &&
      rec.results[0] &&
      rec.results[0].status === journalMod.PHASE.recovered &&
      r.w.box.m1.groups[0].players[0].userId === 'A' &&
      journal &&
      journal.phase === journalMod.PHASE.recovered &&
      journal.recovery &&
      journal.recovery.reason === 'crash_recovery'
  );
})();

(function wal_match_persist_crash() {
  var r = crashRun('match_persist');
  assert('22 match 写后 phase 前崩溃留下 after', r.crashed && r.w.box.m1.groups[0].players[0].userId === 'B');
  recoverW(r.w);
  assert('22b 恢复 match+series 到 before', r.w.box.m1.groups[0].players[0].userId === 'A');
})();

(function wal_match_written_crash() {
  var r = crashRun('match_written');
  assert('23 match_written 后崩溃', r.crashed && r.w.box.m1.groups[0].players[0].userId === 'B');
  recoverW(r.w);
  assert('23b 恢复', r.w.box.m1.groups[0].players[0].userId === 'A');
})();

(function wal_series_persist_crash() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  a.groups[0].players[0].seriesParticipantId = 'part-blue';
  var w = makeWorld({ before: b, after: a });
  w.__crashAfter = 'series_persist';
  var crashed = false;
  try {
    w.run();
  } catch (e) {
    crashed = !!(e && e.processCrash);
  }
  assert('24 series 写后 phase 前崩溃', crashed);
  recoverW(w);
  assert(
    '24b 恢复 match 与 series',
    w.box.m1.groups[0].players[0].userId === 'A' &&
      w.box.series.roster[0].seriesParticipantId === 'part-red'
  );
})();

(function wal_series_written_crash() {
  var r = crashRun('series_written');
  assert('25 series_written 后崩溃仍回滚', r.crashed && r.w.box.m1.groups[0].players[0].userId === 'B');
  recoverW(r.w);
  assert('25b 未 committed 则整批恢复', r.w.box.m1.groups[0].players[0].userId === 'A');
})();

(function wal_committed_no_rollback() {
  var w = twoSeatWorld();
  var out = w.run();
  var rec = recoverW(w);
  assert(
    '26 committed 重启不回滚',
    out.ok &&
      w.box.m1.groups[0].players[0].userId === 'B' &&
      rec.results.length === 0
  );
})();

(function wal_rollback_failed_retry() {
  var r = crashRun('match_written');
  r.w.stats.matchFail = true;
  var first = recoverW(r.w);
  assert(
    '27 rollback_failed 保留',
    first.results[0] && first.results[0].status === 'rollback_failed' && r.w.box.m1.groups[0].players[0].userId === 'B'
  );
  r.w.stats.matchFail = false;
  var second = recoverW(r.w);
  assert(
    '27b 下次启动重试成功',
    second.results[0] &&
      second.results[0].status === journalMod.PHASE.recovered &&
      r.w.box.m1.groups[0].players[0].userId === 'A'
  );
})();

(function wal_recover_idempotent() {
  var r = crashRun('match_written');
  recoverW(r.w);
  var snap = JSON.stringify(r.w.box.m1);
  recoverW(r.w);
  recoverW(r.w);
  assert('28 连续恢复结果相同', JSON.stringify(r.w.box.m1) === snap && r.w.box.m1.groups[0].players[0].userId === 'A');
})();

(function wal_journal_too_large() {
  var w = twoSeatWorld();
  w.stats.journalTooLarge = true;
  var snap = clone(w.box.m1);
  var out = w.run();
  assert(
    '29 journal 容量失败 0 写入',
    out.ok === false && out.cannotSafelyPersist && w.stats.match === 0 && w.box.m1.groups[0].players[0].userId === 'A'
  );
})();

(function wal_serialize_fail() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w = makeWorld({ before: b, after: a });
  w.box.series.cycle = w.box.series;
  w.series.cycle = w.series;
  var out = w.run();
  assert(
    '30 journal 序列化失败 0 写入',
    out.ok === false &&
      (out.code === 'journal_serialize_failed' || out.cannotSafelyPersist) &&
      w.stats.match === 0
  );
})();

(function wal_recovery_revision_conflict() {
  var r = crashRun('match_written');
  var foreign = clone(r.w.box.m1);
  foreign.updatedAt = 999;
  foreign.groups[0].players[0].userId = 'FOREIGN';
  r.w.box.m1 = foreign;
  var rec = recoverW(r.w);
  assert(
    '31 recovery revision 冲突保留当前数据并自动关闭',
    rec.results[0] &&
      rec.results[0].autoResolved &&
      rec.results[0].status === journalMod.PHASE.conflict_resolved &&
      rec.results[0].journal &&
      rec.results[0].journal.resolution === batch.RESOLUTION_LATEST_PERSISTED_STATE_WINS &&
      r.w.box.m1.groups[0].players[0].userId === 'FOREIGN'
  );
})();

(function wal_only_target_round() {
  var r = crashRun('match_written');
  r.w.journalApi.writePreparedBatchJournal({
    planKey: 'live-batch:other',
    batchId: 'live-batch:other',
    matchId: 'm2',
    seriesId: 'ser-1',
    roundId: 'r2',
    fingerprints: { matchBefore: 'x' },
    before: { matchSnapshot: clone(r.w.box.m2), seriesSnapshot: clone(r.w.series) }
  });
  r.w.box.m2.groups[0].players[0].userId = 'HACK';
  recoverW(r.w);
  assert(
    '32 只恢复目标 round/match',
    r.w.box.m1.groups[0].players[0].userId === 'A' && r.w.box.m2.groups[0].players[0].userId === 'HACK'
  );
})();

(function wal_single_journal_untouched() {
  var w = twoSeatWorld();
  var station = {
    matchId: 'm1',
    seriesContext: {
      managed: true,
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      publishToken: 'tok-1'
    },
    status: 'ongoing',
    groupId: 'g1',
    position: 1,
    group: w.before.groups[0],
    pairings: [],
    scoreEntities: [],
    scoreIdentitySummary: {}
  };
  var prep = w.journalApi.prepareJournal({
    plan: {
      planKey: 'live-single:m1:g1:1',
      identity: {
        seriesId: 'ser-1',
        roundId: 'r1',
        matchId: 'm1',
        groupId: 'g1',
        position: 1,
        publishToken: 'tok-1',
        incomingUserId: 'B',
        outgoingUserId: 'A'
      },
      operations: [{ type: 'replace_station_seat' }]
    },
    before: { station: station },
    expectedAfter: { station: station }
  });
  var phaseBefore = prep.journal && prep.journal.phase;
  recoverW(w);
  var again = w.journalApi.getJournal('live-single:m1:g1:1');
  assert(
    '33 旧单人 journal 不被 batch recovery 修改',
    prep.ok && phaseBefore === journalMod.PHASE.prepared && again.journal && again.journal.phase === phaseBefore
  );
})();

(function fp_scoredata_conflict() {
  var r = crashRun('match_written');
  r.w.box.m1.scoreData = { r1keep: true, extraHole: 99 };
  var rec = recoverW(r.w);
  assert(
    '34 scoreData 合法更新冲突保留当前并自动关闭',
    rec.results[0] &&
      rec.results[0].autoResolved &&
      r.w.box.m1.scoreData.extraHole === 99 &&
      r.w.box.m1.groups[0].players[0].userId === 'B'
  );
})();

(function fp_status_conflict() {
  var r = crashRun('match_written');
  r.w.box.m1.status = 'finished';
  var rec = recoverW(r.w);
  assert(
    '35 其它 rollback 字段变化冲突保留当前',
    rec.results[0] && rec.results[0].autoResolved && r.w.box.m1.status === 'finished'
  );
})();

(function fp_roster_conflict() {
  var r = crashRun('match_written');
  r.w.box.series.roster[0].seriesParticipantId = 'part-new';
  var rec = recoverW(r.w);
  assert(
    '36 series roster 新变化冲突保留当前',
    rec.results[0] &&
      rec.results[0].autoResolved &&
      r.w.box.series.roster[0].seriesParticipantId === 'part-new'
  );
})();

(function fp_cache_no_conflict() {
  var r = crashRun('match_written');
  r.w.box.m1._uiCache = { open: true };
  r.w.box.series.competitionPhaseCache = 'live-ui';
  var rec = recoverW(r.w);
  assert(
    '37 纯运行时缓存不冲突',
    rec.results[0] &&
      rec.results[0].status === journalMod.PHASE.recovered &&
      r.w.box.m1.groups[0].players[0].userId === 'A'
  );
})();

(function before_read_uses_recovered() {
  var r = crashRun('match_written');
  var recovery = require(seriesTestPaths.util('seriesLiveMutationRecovery.js'));
  var before = recovery.recoverSeriesLiveBatchBeforeRead({
    seriesId: 'ser-1',
    matchId: 'm1',
    persistMatch: r.w.persistMatch,
    persistSeries: r.w.persistSeries,
    getMatchById: r.w.getMatchById,
    getSeriesById: r.w.getSeriesById,
    journalApi: r.w.journalApi
  });
  assert(
    '38 详情首次读取前完成恢复且 VM 用恢复后数据',
    before.recovered &&
      before.match &&
      before.match.groups[0].players[0].userId === 'A' &&
      !before.conflict
  );
})();

(function conflict_reread_latest() {
  var r = crashRun('match_written');
  r.w.box.m1.scoreData = { latest: true };
  var recovery = require(seriesTestPaths.util('seriesLiveMutationRecovery.js'));
  var out = recovery.recoverSeriesLiveBatchBeforeRead({
    seriesId: 'ser-1',
    matchId: 'm1',
    persistMatch: r.w.persistMatch,
    persistSeries: r.w.persistSeries,
    getMatchById: r.w.getMatchById,
    getSeriesById: r.w.getSeriesById,
    journalApi: r.w.journalApi
  });
  assert(
    '39 conflict 使用最新主数据并自动关闭',
    out.conflict !== true &&
      out.conflictResolved &&
      out.match &&
      out.match.scoreData &&
      out.match.scoreData.latest === true
  );
})();

(function score_entry_source() {
  var enterSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'teamMatchEnterGroupScore.js'),
    'utf8'
  );
  var detailSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js'),
    'utf8'
  );
  assert(
    '40 记分页入口先恢复',
    enterSrc.indexOf('recoverSeriesLiveBatchBeforeRead') >= 0 &&
      enterSrc.indexOf('enterScorePage()') > enterSrc.indexOf('recoverSeriesLiveBatchBeforeRead')
  );
  assert(
    '41 系列详情 reloadViewModel 先恢复',
    detailSrc.indexOf('_recoverIncompleteLiveBatchesBeforeRead') >= 0 &&
      detailSrc.indexOf('reloadViewModel') >= 0
  );
})();

(function concurrent_incomplete_blocks() {
  var r = crashRun('match_written');
  r.w.stats.matchFail = true;
  recoverW(r.w);
  var second = r.w.run();
  assert(
    '42 同一 match 非终态禁止新 batch',
    second.ok === false &&
      (second.code === 'incomplete_batch_exists' || second.code === 'recovery_conflict') &&
      r.w.box.m1.groups[0].players[0].userId === 'B'
  );
})();

(function latest_persisted_state_wins() {
  var recovery = require(seriesTestPaths.util('seriesLiveMutationRecovery.js'));
  var detailSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js'),
    'utf8'
  );
  var editorSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'group-editor', 'index.js'),
    'utf8'
  );
  var recSrc = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'tournament',
      'utils',
      'seriesLiveMutationRecovery.js'
    ),
    'utf8'
  );
  var batchSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'seriesLiveBatchReplace.js'),
    'utf8'
  );

  function crashThenMutate(mutator) {
    var r = crashRun('match_written');
    mutator(r.w);
    var writesMatch = r.w.stats.match;
    var writesSeries = r.w.stats.series;
    var snapM = JSON.stringify(r.w.box.m1);
    var snapS = JSON.stringify(r.w.box.series);
    var rec = recoverW(r.w);
    return { r: r, rec: rec, writesMatch: writesMatch, writesSeries: writesSeries, snapM: snapM, snapS: snapS };
  }

  var groups = crashThenMutate(function (w) {
    w.box.m1.groups[0].players[0].userId = 'FOREIGN';
    w.box.m1.groups[0].players[0].playerId = 'FOREIGN';
    w.box.m1.updatedAt = 888;
  });
  var scores = crashThenMutate(function (w) {
    w.box.m1.scoreData = { latest: true, extraHole: 99 };
  });
  var roster = crashThenMutate(function (w) {
    w.box.series.roster[0].seriesParticipantId = 'part-new';
  });
  assert(
    '47 分组/scoreData/roster 较新状态均保留',
    groups.r.w.box.m1.groups[0].players[0].userId === 'FOREIGN' &&
      scores.r.w.box.m1.scoreData.extraHole === 99 &&
      roster.r.w.box.series.roster[0].seriesParticipantId === 'part-new' &&
      groups.rec.results[0] &&
      groups.rec.results[0].autoResolved &&
      scores.rec.results[0].autoResolved &&
      roster.rec.results[0].autoResolved
  );
  assert(
    '48 自动解决对 match/series 零写入',
    groups.r.w.stats.match === groups.writesMatch &&
      groups.r.w.stats.series === groups.writesSeries &&
      JSON.stringify(groups.r.w.box.m1) === groups.snapM &&
      JSON.stringify(groups.r.w.box.series) === groups.snapS
  );

  var rebuilt = recovery.recoverSeriesLiveBatchBeforeRead({
    seriesId: 'ser-1',
    matchId: 'm1',
    persistMatch: groups.r.w.persistMatch,
    persistSeries: groups.r.w.persistSeries,
    getMatchById: groups.r.w.getMatchById,
    getSeriesById: groups.r.w.getSeriesById,
    journalApi: groups.r.w.journalApi
  });
  assert(
    '49 页面使用当前数据重新渲染',
    rebuilt.conflict !== true &&
      rebuilt.match.groups[0].players[0].userId === 'FOREIGN' &&
      detailSrc.indexOf('_recoverIncompleteLiveBatchesBeforeRead') >= 0 &&
      editorSrc.indexOf('_recoverIncompleteLiveBatchMutations') >= 0 &&
      editorSrc.indexOf('buildInitialGroupDraft') >= 0
  );

  var resolvedJournal = groups.rec.results[0] && groups.rec.results[0].journal;
  var replay = groups.r.w.journalApi.writePreparedBatchJournal({
    planKey: resolvedJournal.planKey,
    batchId: resolvedJournal.batchId,
    matchId: 'm1',
    seriesId: 'ser-1',
    roundId: 'r1',
    fingerprints: { matchBefore: 'x' },
    before: { matchSnapshot: { matchId: 'm1' } }
  });
  assert('53 原 batch 不可重放', replay.ok === false && replay.reason === 'batch_superseded');

  groups.r.w.__crashAfter = '';
  var nextCand = clone(groups.r.w.box.m1);
  setSeat(nextCand.groups, 'g1', 1, 'B');
  setSeat(nextCand.groups, 'g1', 2, 'F');
  groups.r.w.after.groups = nextCand.groups;
  groups.r.w.after.scoreData = nextCand.scoreData;
  groups.r.w.after.updatedAt = nextCand.updatedAt;
  groups.r.w.after.status = nextCand.status;
  var next = groups.r.w.run();
  assert(
    '50 进行中管理员可开启新 batch',
    next.ok && next.status === 'completed' && groups.r.w.box.m1.groups[0].players[0].userId === 'B'
  );

  var oDeny = makeWorld({
    before: matchOf(),
    after: (function () {
      var a = matchOf();
      setSeat(a.groups, 'g1', 1, 'B');
      setSeat(a.groups, 'g1', 2, 'D');
      return a;
    })(),
    hasManagePermission: function () {
      return false;
    }
  });
  var deniedOut = oDeny.run();
  assert('51 普通用户仍不可编辑', deniedOut.code === 'permission_denied' && oDeny.stats.match === 0);

  var finished = crashThenMutate(function (w) {
    w.box.m1.status = 'finished';
  });
  finished.r.w.__crashAfter = '';
  var finNext = finished.r.w.run();
  assert(
    '52 已结束比赛仍不可编辑',
    finished.rec.results[0].autoResolved &&
      finNext.ok === false &&
      JSON.stringify(finished.r.w.box.m1) === finished.snapM
  );

  var pruned = groups.r.w.journalApi.pruneTerminalBatchFromMap({
    k: { current: resolvedJournal, history: [] }
  });
  assert(
    '56 conflict_resolved 可按终态清理且不立即删除证据',
    resolvedJournal.phase === journalMod.PHASE.conflict_resolved &&
      resolvedJournal.resolvedAt &&
      resolvedJournal.resolutionMeta &&
      resolvedJournal.resolutionMeta.matchFingerprint &&
      !pruned.k
  );
  var pageSrc = detailSrc + editorSrc + recSrc + batchSrc;
  assert(
    '54 不再出现冲突确认弹窗',
    pageSrc.indexOf('presentRecoveryConflictPrompt') < 0 &&
      pageSrc.indexOf('_batchConflictPromptSession') < 0 &&
      pageSrc.indexOf('使用最新数据') < 0 &&
      pageSrc.indexOf('暂不处理') < 0 &&
      pageSrc.indexOf('保留当前数据') < 0 &&
      pageSrc.indexOf('accept_current') < 0
  );

  var rA = crashRun('match_written');
  rA.w.box.m1.scoreData = { round: 'a' };
  rA.w.journalApi.writePreparedBatchJournal({
    planKey: 'live-batch:m2-conflict',
    batchId: 'live-batch:m2-conflict',
    matchId: 'm2',
    seriesId: 'ser-1',
    roundId: 'r2',
    fingerprints: { matchBefore: 'x' },
    before: { matchSnapshot: clone(rA.w.box.m2), seriesSnapshot: clone(rA.w.box.series) }
  });
  rA.w.box.m2.groups[0].players[0].userId = 'HACK2';
  var recBoth = batch.recoverIncompleteLiveBatchMutations({
    seriesId: 'ser-1',
    persistMatch: rA.w.persistMatch,
    persistSeries: rA.w.persistSeries,
    getMatchById: rA.w.getMatchById,
    getSeriesById: rA.w.getSeriesById,
    journalApi: rA.w.journalApi
  });
  var j2 = rA.w.journalApi.getJournal('live-batch:m2-conflict');
  var autoCount = recBoth.results.filter(function (row) {
    return row && row.autoResolved;
  }).length;
  assert(
    '55 多轮 conflict 按 match/round 独立自动关闭',
    autoCount >= 2 &&
      rA.w.box.m1.scoreData.round === 'a' &&
      rA.w.box.m2.groups[0].players[0].userId === 'HACK2' &&
      j2.journal &&
      j2.journal.phase === journalMod.PHASE.conflict_resolved &&
      j2.journal.resolution === batch.RESOLUTION_LATEST_PERSISTED_STATE_WINS
  );

  var enter = require(seriesTestPaths.util('teamMatchEnterGroupScore.js'));
  var captured = null;
  var entered = enter.enterTeamMatchGroupScore(scores.r.w.box.m1, 'g1', {
    persistMatch: scores.r.w.persistMatch,
    persistSeries: scores.r.w.persistSeries,
    getMatchById: scores.r.w.getMatchById,
    getSeriesById: scores.r.w.getSeriesById,
    journalApi: scores.r.w.journalApi,
    setMatchState: function (st) {
      captured = st;
    },
    enterScorePage: function () {},
    emptyScores: function () {
      return [];
    },
    groupsStore: { ensureInitialized: function () {} }
  });
  assert(
    '57 记分入口使用当前最新 match',
    entered.ok && scores.r.w.box.m1.scoreData.extraHole === 99 && captured && captured.matchId === 'm1'
  );
})();

(function prune_terminal_keeps_incomplete() {
  var w = twoSeatWorld();
  var done = w.run();
  var oldKey = done.planKey;
  var listedBefore = w.journalApi.getJournal(oldKey);
  var prep2 = w.journalApi.writePreparedBatchJournal({
    planKey: 'live-batch:next',
    batchId: 'live-batch:next',
    matchId: 'm9',
    seriesId: 'ser-x',
    roundId: 'r9',
    fingerprints: { matchBefore: 'z' },
    before: { matchSnapshot: { matchId: 'm9' } }
  });
  var gone = w.journalApi.getJournal(oldKey);
  assert(
    '43 终态旧记录可清理',
    listedBefore.journal &&
      listedBefore.journal.phase === journalMod.PHASE.committed &&
      prep2.ok &&
      (!gone.journal || gone.reason === 'absent')
  );
  var crash = crashRun('prepared');
  var keep = crash.w.journalApi.listUnfinishedJournals();
  var fake = {};
  keep.journals.forEach(function (row) {
    fake[row.planKey] = { current: row, history: [] };
  });
  var prunedKeep = crash.w.journalApi.pruneTerminalBatchFromMap(fake);
  assert(
    '44 非终态不会被清理',
    keep.journals.length >= 1 && Object.keys(prunedKeep).length >= 1
  );
})();

(function still_too_large_zero_write() {
  var w = twoSeatWorld();
  w.stats.journalTooLarge = true;
  var out = w.run();
  assert(
    '45 清理后仍超限 0 写入',
    out.ok === false && out.cannotSafelyPersist && w.stats.match === 0
  );
})();

(function snapshot_size_report() {
  var typical = matchOf();
  var series = seriesOf();
  var typicalBytes = batch.estimatePersistSnapshotBytes(typical, series);
  var large = matchOf();
  large.scoreData = {};
  var holes = [];
  for (var h = 1; h <= 18; h++) holes.push({ hole: h, score: 4, putts: 2 });
  large.groups = [];
  for (var g = 0; g < 8; g++) {
    var players = [];
    for (var p = 0; p < 4; p++) {
      players.push(player('U' + g + p, p + 1, { holes: holes }));
    }
    large.groups.push({ groupId: 'g' + g, groupName: '第' + g + '组', players: players });
  }
  var maxBytes = batch.estimatePersistSnapshotBytes(large, series);
  var cap = journalMod.JOURNAL_MAX_BYTES;
  var fit = typicalBytes > 0 ? Math.floor(cap / typicalBytes) : 0;
  console.log(
    'journal_size typical=' + typicalBytes + ' maxSample=' + maxBytes + ' bucket=' + cap + ' typicalFit=' + fit
  );
  assert('46 典型 snapshot 可测且小于整桶', typicalBytes > 100 && typicalBytes < cap && maxBytes >= typicalBytes);
})();

(function corrupted_journal_current_state_wins() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var w = makeWorld({ before: b, after: a });
  var matchSnap = JSON.stringify(w.box.m1);
  var seriesSnap = JSON.stringify(w.box.series);
  w.journalMem.data = {
    'k-bad': { not: 'a journal', mutationKind: 'batch', batchId: 'dead-batch' },
    'k-keep': {
      journalVersion: 1,
      planKey: 'k-keep',
      phase: journalMod.PHASE.prepared,
      fingerprints: { plan: 'keep' },
      mutationKind: 'batch',
      batchId: 'keep-other',
      matchId: 'm2',
      seriesId: 'ser-1'
    }
  };
  var matchWrites = w.stats.match;
  w.journalApi.getJournal('k-bad');
  var keep = w.journalApi.getJournal('k-keep');
  assert(
    '47 丢弃损坏 journal 时 Match/Series 字节不变',
    w.stats.match === matchWrites &&
      JSON.stringify(w.box.m1) === matchSnap &&
      JSON.stringify(w.box.series) === seriesSnap &&
      keep.ok &&
      keep.journal.phase === journalMod.PHASE.prepared
  );
  var out = w.run();
  var replay = w.journalApi.writePreparedBatchJournal({
    planKey: 'k-bad',
    batchId: 'dead-batch',
    matchId: 'm1',
    fingerprints: { matchBefore: 'x' }
  });
  var keepAfter = w.journalApi.getJournal('k-keep');
  assert(
    '47b 损坏 journal 不阻止合法纠正且不可重放',
    out.ok === true &&
      out.status === 'completed' &&
      w.box.m1.groups[0].players[0].userId === 'B' &&
      replay.ok === false &&
      replay.reason === 'journal_replay_forbidden' &&
      keepAfter.journal.phase === journalMod.PHASE.prepared
  );
})();

(function corrupted_journal_not_a_permission_bypass() {
  var b = matchOf();
  var a = clone(b);
  setSeat(a.groups, 'g1', 1, 'B');
  setSeat(a.groups, 'g1', 2, 'D');
  var noPerm = makeWorld({
    before: b,
    after: a,
    hasManagePermission: function () {
      return false;
    }
  });
  noPerm.journalMem.data = { 'k-bad': { not: 'a journal' } };
  var snap = JSON.stringify(noPerm.box.m1);
  var denied = noPerm.run();
  var endedMatch = clone(b);
  endedMatch.status = 'finished';
  var endedAfter = clone(a);
  endedAfter.status = 'finished';
  var ended = makeWorld({ before: endedMatch, after: endedAfter });
  ended.journalMem.data = { 'k-bad': { not: 'a journal' } };
  var endedOut = ended.run();
  assert(
    '48 损坏 journal 不能绕过权限或结束态',
    denied.ok === false &&
      denied.code === 'permission_denied' &&
      JSON.stringify(noPerm.box.m1) === snap &&
      endedOut.ok === false &&
      (endedOut.code === 'match_completed' || endedOut.code === 'station_not_live')
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveBatchReplace.selftest');
