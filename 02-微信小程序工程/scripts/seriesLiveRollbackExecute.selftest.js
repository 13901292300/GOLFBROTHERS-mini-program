/**
 * Series LIVE mutation 回滚执行器
 * 运行：node scripts/seriesLiveRollbackExecute.selftest.js
 */

var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var executeMod = require(seriesTestPaths.util('seriesLiveRollbackExecute.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var PHASE = journalMod.PHASE;
var execute = executeMod.executeSeriesLiveRollback;
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
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function allowPerm() {
  return function () {
    return true;
  };
}

function stationSnap(person, extra) {
  var e = extra || {};
  return {
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
    group: {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: person,
          playerId: person,
          id: person,
          scorePlayerId: e.scorePlayerId != null ? e.scorePlayerId : 'A',
          entityId: e.entityId || 'ent-a',
          pairingId: 'p1'
        },
        { position: 2, userId: 'C', playerId: 'C', id: 'C', scorePlayerId: 'C', entityId: 'ent-c' }
      ]
    },
    pairings: e.pairings || [
      { pairingId: 'p1', entityId: 'pe1', playerIds: [person === 'B' ? 'B' : 'A', 'C'] }
    ],
    scoreEntities: e.scoreEntities || [{ entityId: 'ent-a', memberIds: [person === 'B' ? 'B' : 'A'] }],
    scoreIdentitySummary: {
      scorePlayerId: e.scorePlayerId != null ? e.scorePlayerId : 'A',
      entityId: e.entityId || 'ent-a',
      pairingId: 'p1'
    }
  };
}

function rosterSnap(spid, extra) {
  var e = extra || {};
  return {
    rosterEntryId: e.rosterEntryId || 're-B',
    playerId: e.playerId || 'B',
    registrationStatus: 'registered',
    seriesParticipantId: spid,
    registrationRevision: e.registrationRevision != null ? e.registrationRevision : 3
  };
}

function matchFrom(station, extra) {
  var e = extra || {};
  return {
    matchId: station.matchId,
    status: station.status,
    gameMode: '个人比杆赛',
    scoreData: e.scoreData || { keepMe: true, holes: [4, 5] },
    teamScores: e.teamScores || { keepTeam: 1 },
    groups: [clone(station.group)].concat(
      e.extraGroups || [
        {
          groupId: 'g2',
          groupName: '第2组',
          players: [{ position: 1, userId: 'X', playerId: 'X', id: 'X' }]
        }
      ]
    ),
    pairings: {
      g1: clone(station.pairings),
      g2: e.g2Pairings || [{ pairingId: 'p2', playerIds: ['X'] }]
    },
    scoreEntities: {
      g1: clone(station.scoreEntities),
      g2: e.g2Entities || [{ entityId: 'ent-x', memberIds: ['X'] }]
    },
    seriesContext: clone(station.seriesContext)
  };
}

function seriesOf(rosterRows, extra) {
  var e = extra || {};
  return Object.assign(
    {
      seriesId: 'ser-1',
      publishToken: 'tok-1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      registrationRevision: e.registrationRevision != null ? e.registrationRevision : 7,
      rounds: [{ roundId: 'r1', matchId: 'm1', roundStatus: 'live' }],
      participants: [
        { seriesParticipantId: 'part-red', kind: 'team', sourceTeamId: 'red' },
        { seriesParticipantId: 'part-blue', kind: 'team', sourceTeamId: 'blue' }
      ],
      roster: rosterRows ? clone(rosterRows) : []
    },
    e
  );
}

function memoryAdapter(box) {
  return {
    getItem: function () {
      return { ok: true, value: box.data };
    },
    setItem: function (_key, value) {
      if (box.failWrite) return { ok: false, reason: 'journal_write_failed' };
      box.writes = (box.writes || 0) + 1;
      box.data = value;
      return { ok: true };
    }
  };
}

function makePlan(withRoster) {
  var ops = [{ type: 'replace_station_seat' }];
  if (withRoster) ops.push({ type: 'repair_series_roster_affiliation' });
  return {
    planKey: 'k1',
    planStatus: 'ready',
    decisionAction: 'direct_replace',
    identity: {
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      groupId: 'g1',
      position: 1,
      publishToken: 'tok-1',
      incomingUserId: 'B',
      outgoingUserId: 'A',
      targetAffiliationId: 'part-blue',
      decisionAction: 'direct_replace'
    },
    operations: ops,
    needsRosterRepair: !!withRoster
  };
}

function seedJournal(api, opts) {
  var o = opts || {};
  var withRoster = o.withRoster === true;
  var beforeSt = o.beforeStation || stationSnap('A');
  var afterSt = o.afterStation || stationSnap('B');
  var payload = {
    plan: makePlan(withRoster),
    before: { station: beforeSt },
    expectedAfter: { station: afterSt }
  };
  if (withRoster) {
    payload.before.roster = o.beforeRoster || rosterSnap('part-red');
    payload.expectedAfter.roster = o.afterRoster || rosterSnap('part-blue');
  }
  var prepared = api.prepareJournal(payload);
  if (!prepared.ok) throw new Error('prepare failed ' + prepared.reason);
  var phase = o.phase || PHASE.rollback_pending;
  if (phase === PHASE.prepared) return prepared.journal;
  var t = api.transitionJournal('k1', PHASE.prepared, phase === PHASE.committed ? PHASE.station_writing : PHASE.rollback_pending);
  if (!t.ok) throw new Error('to pending failed ' + t.reason);
  if (phase === PHASE.rollback_pending) return t.journal;
  if (phase === PHASE.rolling_back) {
    return api.transitionJournal('k1', PHASE.rollback_pending, PHASE.rolling_back).journal;
  }
  if (phase === PHASE.rolled_back) {
    api.transitionJournal('k1', PHASE.rollback_pending, PHASE.rolling_back);
    return api.transitionJournal('k1', PHASE.rolling_back, PHASE.rolled_back).journal;
  }
  if (phase === PHASE.committed) {
    api.transitionJournal('k1', PHASE.station_writing, PHASE.station_written);
    api.transitionJournal('k1', PHASE.station_written, PHASE.station_verified);
    api.transitionJournal('k1', PHASE.station_verified, PHASE.committing);
    return api.transitionJournal('k1', PHASE.committing, PHASE.committed).journal;
  }
  return t.journal;
}

function harness(opts) {
  var o = opts || {};
  var box = { data: {}, writes: 0 };
  var api = journalMod.createSeriesLiveMutationJournal(memoryAdapter(box));
  var withRoster = o.withRoster === true;
  seedJournal(api, o);
  var store = {
    series: o.series || seriesOf(withRoster ? [rosterSnap('part-blue'), { rosterEntryId: 're-C', playerId: 'C', seriesParticipantId: 'part-blue', registrationStatus: 'registered' }] : null),
    match: o.match || matchFrom(stationSnap('B')),
    seriesWrites: 0,
    matchWrites: 0,
    reads: { series: 0, match: 0 },
    preflights: 0,
    writeOrder: []
  };
  if (o.series) store.series = o.series;
  if (o.match) store.match = o.match;
  var perm = o.hasManagePermission || allowPerm();
  var runPf =
    o.runRollbackPreflight ||
    function (input) {
      store.preflights += 1;
      return require(seriesTestPaths.util('seriesLiveRollbackPreflight.js')).runSeriesLiveRollbackPreflight(input);
    };
  var deps = {
    planKey: 'k1',
    currentUser: { userId: 'admin' },
    hasManagePermission: perm,
    getSeriesById: function () {
      store.reads.series += 1;
      return clone(store.series);
    },
    getMatchById: function () {
      store.reads.match += 1;
      return clone(store.match);
    },
    saveMatch: function (match) {
      store.matchWrites += 1;
      store.writeOrder.push('station');
      if (o.throwSave && !o.saveActuallyApplies) {
        throw new Error('save_failed');
      }
      if (o.saveMutatesUnknown) {
        store.match = clone(match);
        store.match.groups[0].players[0].userId = 'Z';
        store.match.groups[0].players[0].playerId = 'Z';
        if (o.throwSave) throw new Error('save_failed');
        return { ok: true };
      }
      store.match = clone(match);
      if (o.throwSave) throw new Error('save_failed');
      return { ok: true };
    },
    upsertSeriesChecked: function (series, expectedRev) {
      store.seriesWrites += 1;
      store.writeOrder.push('roster');
      store.lastExpectedRev = expectedRev;
      if (o.throwUpsert && !o.upsertActuallyApplies) {
        throw new Error('upsert_failed');
      }
      if (o.upsertMutatesUnknown) {
        store.series = clone(series);
        store.series.roster[0].playerId = 'Z';
        if (o.throwUpsert) throw new Error('upsert_failed');
        return { ok: true };
      }
      store.series = clone(series);
      if (o.throwUpsert) throw new Error('upsert_failed');
      return { ok: true };
    },
    getJournal: function (key) {
      return api.getJournal(key);
    },
    transitionJournal: function (key, from, to, patch) {
      if (o.failToRolledBack && to === PHASE.rolled_back) {
        return { ok: false, reason: 'journal_write_failed' };
      }
      return api.transitionJournal(key, from, to, patch);
    },
    runRollbackPreflight: runPf
  };
  if (o.force != null) deps.force = o.force;
  if (o.undoCommitted != null) deps.undoCommitted = o.undoCommitted;
  if (o.confirmed != null) deps.confirmed = o.confirmed;
  return { box: box, api: api, store: store, deps: deps };
}

(function no_roster_full() {
  var h = harness({ withRoster: false });
  var out = execute(h.deps);
  assert(
    '1 无 roster 完整回滚',
    out.ok &&
      out.journalPhase === PHASE.rolled_back &&
      h.store.match.groups[0].players[0].userId === 'A' &&
      h.store.seriesWrites === 0
  );
})();

(function roster_full() {
  var h = harness({ withRoster: true });
  var out = execute(h.deps);
  assert(
    '2 有 roster 完整逆序回滚',
    out.ok &&
      h.store.series.roster[0].seriesParticipantId === 'part-red' &&
      h.store.match.groups[0].players[0].userId === 'A' &&
      h.store.writeOrder[0] === 'roster' &&
      h.store.writeOrder.indexOf('station') > 0
  );
  assert('3 roster 必须先于 station', h.store.writeOrder[0] === 'roster' && h.store.writeOrder[1] === 'station');
  assert(
    '4 roster 只改唯一条目',
    h.store.series.roster[1].seriesParticipantId === 'part-blue' && h.store.series.roster[1].playerId === 'C'
  );
  assert('5 registrationRevision 当前值 +1', h.store.series.registrationRevision === 8 && h.store.lastExpectedRev === 7);
  assert('6 不恢复旧 revision', h.store.series.registrationRevision !== 3 && h.store.series.registrationRevision !== 4);
})();

(function station_slice() {
  var h = harness({ withRoster: false });
  execute(h.deps);
  assert('7 station 只恢复目标 group', h.store.match.groups[0].players[0].userId === 'A' && h.store.match.groups[1].groupId === 'g2');
  assert(
    '8 只恢复目标 pairings/entities',
    h.store.match.pairings.g1[0].playerIds[0] === 'A' && h.store.match.scoreEntities.g1[0].memberIds[0] === 'A'
  );
  assert(
    '9 保留其它 group/pairing/entity',
    h.store.match.groups[1].players[0].userId === 'X' &&
      h.store.match.pairings.g2[0].pairingId === 'p2' &&
      h.store.match.scoreEntities.g2[0].entityId === 'ent-x'
  );
  assert('10 保留其它 scoreData', h.store.match.scoreData.keepMe === true && h.store.match.teamScores.keepTeam === 1);
})();

(function all_before_journal_only() {
  var h = harness({
    withRoster: true,
    series: seriesOf([rosterSnap('part-red'), { rosterEntryId: 're-C', playerId: 'C', seriesParticipantId: 'part-blue', registrationStatus: 'registered' }]),
    match: matchFrom(stationSnap('A'))
  });
  var out = execute(h.deps);
  assert(
    '11 all-before 只完成 journal',
    out.ok && out.journalPhase === PHASE.rolled_back && h.store.seriesWrites === 0 && h.store.matchWrites === 0
  );
})();

(function pending_all_before() {
  var h = harness({
    withRoster: false,
    match: matchFrom(stationSnap('A')),
    phase: PHASE.rollback_pending
  });
  var out = execute(h.deps);
  assert(
    '12 rollback_pending + all-before',
    out.ok && out.journalPhase === PHASE.rolled_back && h.store.matchWrites === 0
  );
})();

(function reenter_rolling() {
  var h = harness({
    withRoster: true,
    phase: PHASE.rolling_back,
    series: seriesOf([rosterSnap('part-red'), { rosterEntryId: 're-C', playerId: 'C', seriesParticipantId: 'part-blue', registrationStatus: 'registered' }]),
    match: matchFrom(stationSnap('B'))
  });
  var out = execute(h.deps);
  assert(
    '13 rolling_back 重入',
    out.ok && h.store.seriesWrites === 0 && h.store.matchWrites === 1 && h.store.match.groups[0].players[0].userId === 'A'
  );
})();

(function roster_fail_after() {
  var h = harness({ withRoster: true, throwUpsert: true });
  var out = execute(h.deps);
  assert(
    '14 roster 写失败且仍 after',
    out.code === 'roster_rollback_failed_after' &&
      h.store.matchWrites === 0 &&
      h.api.getJournal('k1').journal.phase === PHASE.rolling_back
  );
})();

(function roster_throw_but_before() {
  var h = harness({ withRoster: true, throwUpsert: true, upsertActuallyApplies: true });
  var out = execute(h.deps);
  assert(
    '15 roster 写报错但实际 before',
    out.ok && h.store.series.roster[0].seriesParticipantId === 'part-red' && h.store.match.groups[0].players[0].userId === 'A'
  );
})();

(function roster_unknown() {
  var h = harness({ withRoster: true, throwUpsert: true, upsertActuallyApplies: true, upsertMutatesUnknown: true });
  var out = execute(h.deps);
  assert('16 roster 写后 unknown', out.requiresManualReview === true && h.store.matchWrites === 0);
})();

(function station_fail_after() {
  var h = harness({ withRoster: false, throwSave: true });
  var out = execute(h.deps);
  assert(
    '17 station 写失败且仍 after',
    out.code === 'station_rollback_failed_after' && h.api.getJournal('k1').journal.phase === PHASE.rolling_back
  );
})();

(function station_throw_but_before() {
  var h = harness({ withRoster: false, throwSave: true, saveActuallyApplies: true });
  var out = execute(h.deps);
  assert('18 station 写报错但实际 before', out.ok && h.store.match.groups[0].players[0].userId === 'A');
})();

(function station_unknown() {
  var h = harness({ withRoster: false, throwSave: true, saveActuallyApplies: true, saveMutatesUnknown: true });
  var out = execute(h.deps);
  assert('19 station 写后 unknown', out.requiresManualReview === true && out.journalPhase === PHASE.manual_review);
})();

(function no_station_first() {
  var h = harness({ withRoster: true });
  execute(h.deps);
  assert('20 roster 未回滚时禁止先写 station', h.store.writeOrder[0] === 'roster');
})();

(function inverted() {
  var h = harness({
    withRoster: true,
    series: seriesOf([rosterSnap('part-blue')]),
    match: matchFrom(stationSnap('A'))
  });
  var out = execute(h.deps);
  assert(
    '21 station-before/roster-after manual review',
    out.requiresManualReview === true && h.store.seriesWrites === 0 && h.store.matchWrites === 0
  );
})();

(function mid_lock() {
  var h = harness({ withRoster: true });
  var origUpsert = h.deps.upsertSeriesChecked;
  h.deps.upsertSeriesChecked = function (series, rev) {
    var r = origUpsert(series, rev);
    h.store.series.lifecycleStatus = 'archived';
    return r;
  };
  var out = execute(h.deps);
  assert(
    '22 生命周期中途锁定后停止',
    out.requiresManualReview === true &&
      (out.code === 'series_locked' || out.mode === 'manual_review') &&
      h.store.matchWrites === 0
  );
})();

(function mid_perm() {
  var allowed = true;
  var h = harness({
    withRoster: true,
    hasManagePermission: function () {
      return allowed;
    }
  });
  var origUpsert = h.deps.upsertSeriesChecked;
  h.deps.upsertSeriesChecked = function (series, rev) {
    var r = origUpsert(series, rev);
    allowed = false;
    return r;
  };
  var out = execute(h.deps);
  assert('23 权限中途丢失后停止', out.code === 'permission_denied' && h.store.matchWrites === 0);
})();

(function trans_fail_no_rewrite() {
  var h = harness({ withRoster: false, failToRolledBack: true });
  var first = execute(h.deps);
  var writes = h.store.matchWrites;
  var second = execute(h.deps);
  assert(
    '24 journal transition 失败不重复业务写',
    first.ok === false &&
      first.code === 'journal_transition_failed_after_rollback' &&
      second.code === 'journal_transition_failed_after_rollback' &&
      second.store === undefined &&
      h.store.matchWrites === writes &&
      writes === 1
  );
})();

(function rolled_ok() {
  var h = harness({
    withRoster: false,
    phase: PHASE.rolled_back,
    match: matchFrom(stationSnap('A'))
  });
  var out = execute(h.deps);
  assert('25 rolled_back 幂等', out.ok && out.idempotent === true && h.store.matchWrites === 0);
})();

(function rolled_drift() {
  var h = harness({
    withRoster: false,
    phase: PHASE.rolled_back,
    match: matchFrom(stationSnap('B'))
  });
  var out = execute(h.deps);
  assert('26 rolled_back drift', out.ok === false && out.requiresManualReview === true && h.store.matchWrites === 0);
})();

(function committed_zero() {
  var h = harness({ withRoster: false, phase: PHASE.committed });
  var out = execute(
    Object.assign({}, h.deps, { force: true, undoCommitted: true, confirmed: true })
  );
  assert(
    '27 committed 零写入',
    out.code === 'journal_committed' && h.store.matchWrites === 0 && h.store.seriesWrites === 0
  );
  assert('28 force/undoCommitted 不能绕过', out.code === 'journal_committed' && h.box.writes >= 1);
})();

(function reread_preflight() {
  var h = harness({ withRoster: true });
  execute(h.deps);
  assert('29 每一步重新读取', h.store.reads.series >= 3 && h.store.reads.match >= 3);
  assert('30 每一步重新 preflight', h.store.preflights >= 3);
})();

(function inputs_frozen() {
  var h = harness({ withRoster: true });
  var s0 = clone(h.store.series);
  execute(h.deps);
  assert('31 输入不变', s0.roster[0].seriesParticipantId === 'part-blue');
})();

(function ryder() {
  var a = harness({ withRoster: true });
  var b = harness({
    withRoster: true,
    series: seriesOf(
      [rosterSnap('part-blue'), { rosterEntryId: 're-C', playerId: 'C', seriesParticipantId: 'part-blue', registrationStatus: 'registered' }],
      { seriesCompetitionType: 'ryder_cup' }
    )
  });
  var oa = execute(a.deps);
  var ob = execute(b.deps);
  assert(
    '32 普通 Series/莱德杯同路径',
    seriesRyderCup.isRyderCupSeries(b.store.series) && oa.ok && ob.ok && oa.journalPhase === ob.journalPhase
  );
})();

(function no_ui() {
  var src = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'seriesLiveRollbackExecute.js'),
    'utf8'
  );
  assert(
    '33 不接 UI',
    src.indexOf('wx.') < 0 && src.indexOf('group-editor') < 0 && src.indexOf('showModal') < 0
  );
  assert(
    '34 不修改 publish journal',
    src.indexOf('seriesPublishJournal') < 0 && src.indexOf('gb_series_publish') < 0
  );
  assert(
    '35 不调用整份 before 覆盖',
    src.indexOf('patchStationMatchBefore') >= 0 && src.indexOf('journal.before.station') >= 0 && src.indexOf('saveMatch(journal.before') < 0
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveRollbackExecute.selftest');
