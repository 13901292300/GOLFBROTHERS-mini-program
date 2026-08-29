/**
 * Series LIVE 换人正向执行器
 * 运行：node scripts/seriesLiveReplaceExecute.selftest.js
 */

var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var evidenceMod = require(seriesTestPaths.util('seriesLiveAffiliationEvidence.js'));
var decisionMod = require(seriesTestPaths.util('seriesLiveReplaceDecision.js'));
var planMod = require(seriesTestPaths.util('seriesLiveReplacePlan.js'));
var executeMod = require(seriesTestPaths.util('seriesLiveReplaceExecute.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var PHASE = journalMod.PHASE;
var execute = executeMod.executeSeriesLiveReplace;

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

function red() {
  return {
    seriesParticipantId: 'part-red',
    kind: 'team',
    sourceTeamId: 'red',
    shortNameSnapshot: '红队',
    nameSnapshot: '红队',
    colorSnapshot: '#c00'
  };
}
function blue() {
  return {
    seriesParticipantId: 'part-blue',
    kind: 'team',
    sourceTeamId: 'blue',
    shortNameSnapshot: '蓝队',
    nameSnapshot: '蓝队',
    colorSnapshot: '#00c'
  };
}

function seat(id, pos, partId, extra) {
  return Object.assign(
    {
      position: pos,
      userId: id,
      playerId: id,
      id: id,
      displayName: '球员' + id,
      seriesParticipantId: partId,
      matchTeamId: partId === 'part-blue' ? 'blue' : 'red',
      affiliationId: partId === 'part-blue' ? 'blue' : 'red',
      scorePlayerId: extra && extra.scorePlayerId != null ? extra.scorePlayerId : 'A',
      entityId: extra && extra.entityId ? extra.entityId : 'ent-a',
      pairingId: 'p1'
    },
    extra || {}
  );
}

function incomingB() {
  return { userId: 'B', playerId: 'B', id: 'B', displayName: '球员B' };
}

function g5Validate() {
  return function () {
    return { ok: true };
  };
}

function allowPerm() {
  return function () {
    return true;
  };
}

function denyPerm() {
  return function () {
    return false;
  };
}

function seriesBase(extra) {
  return Object.assign(
    {
      seriesId: 'ser-1',
      hostMode: 'organization',
      publishToken: 'tok-1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      registrationRevision: 3,
      participants: [red(), blue()],
      roster: [
        {
          rosterEntryId: 're-B',
          playerId: 'B',
          seriesParticipantId: 'part-red',
          registrationStatus: 'registered'
        },
        {
          rosterEntryId: 're-C',
          playerId: 'C',
          seriesParticipantId: 'part-blue',
          registrationStatus: 'registered'
        }
      ],
      rounds: [{ roundId: 'r1', matchId: 'm1', roundStatus: 'live' }]
    },
    extra || {}
  );
}

function matchBase(extra) {
  return Object.assign(
    {
      matchId: 'm1',
      status: 'ongoing',
      gameMode: '个人比杆赛',
      scoreData: { keepMe: true, holes: [4, 5] },
      groups: [
        {
          groupId: 'g1',
          groupName: '第1组',
          players: [
            seat('A', 1, 'part-red'),
            seat('C', 2, 'part-blue', { scorePlayerId: 'C', entityId: 'ent-c' })
          ]
        },
        {
          groupId: 'g2',
          groupName: '第2组',
          players: [seat('X', 1, 'part-red', { scorePlayerId: 'X', entityId: 'ent-x' })]
        }
      ],
      pairings: {
        g1: [{ pairingId: 'p1', entityId: 'pe1', playerIds: ['A', 'C'] }],
        g2: [{ pairingId: 'p2', entityId: 'pe2', playerIds: ['X'] }]
      },
      scoreEntities: {
        g1: [{ entityId: 'ent-a', memberIds: ['A'] }],
        g2: [{ entityId: 'ent-x', memberIds: ['X'] }]
      },
      seriesContext: {
        managed: true,
        seriesId: 'ser-1',
        roundId: 'r1',
        matchId: 'm1',
        publishToken: 'tok-1'
      }
    },
    extra || {}
  );
}

function freezeFromMatch(match, ident) {
  var group = (match.groups || []).filter(function (g) {
    return String(g.groupId) === String(ident.groupId);
  })[0];
  var player = ((group && group.players) || []).filter(function (p) {
    return Number(p.position) === Number(ident.position);
  })[0];
  return journalMod.freezeStation({
    matchId: match.matchId,
    seriesContext: match.seriesContext,
    status: match.status,
    groupId: ident.groupId,
    position: ident.position,
    group: group,
    pairings: match.pairings && match.pairings[ident.groupId],
    scoreEntities: match.scoreEntities && match.scoreEntities[ident.groupId],
    scoreIdentitySummary: {
      scorePlayerId: player && player.scorePlayerId,
      entityId: player && player.entityId,
      pairingId: player && player.pairingId
    }
  });
}

function applyIncoming(match) {
  var next = clone(match);
  var g = next.groups[0];
  g.players[0].userId = 'B';
  g.players[0].playerId = 'B';
  g.players[0].id = 'B';
  g.players[0].displayName = '球员B';
  next.pairings.g1[0].playerIds = ['B', 'C'];
  next.scoreEntities.g1[0].memberIds = ['B'];
  return next;
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

function buildBundle(opts) {
  var o = opts || {};
  var series = o.series || seriesBase(o.seriesExtra);
  var match = o.match || matchBase();
  var incoming = incomingB();
  var target = {
    seriesId: 'ser-1',
    roundId: 'r1',
    matchId: 'm1',
    groupId: 'g1',
    position: 1,
    targetAffiliationId: o.targetAffiliationId || 'part-red',
    publishToken: 'tok-1'
  };
  var matches = o.matches || { m1: match };
  var evidence = evidenceMod.collectSeriesLiveAffiliationEvidence({
    series: series,
    playerId: 'B',
    currentTarget: target,
    getMatchById: function (id) {
      return matches[id] || null;
    },
    getIndexByMatchId: function (id) {
      var rounds = series.rounds || [];
      for (var i = 0; i < rounds.length; i++) {
        if (String(rounds[i].matchId) === String(id)) {
          return { seriesId: series.seriesId, roundId: rounds[i].roundId, matchId: id };
        }
      }
      return null;
    }
  });
  var decision = decisionMod.decideSeriesLiveReplace({
    series: series,
    groups: match.groups,
    pairingDraft: match.pairings,
    target: target,
    incomingPlayer: incoming,
    evidenceResult: evidence,
    rosterAffiliationId: o.rosterAffiliationId != null ? o.rosterAffiliationId : 'part-red',
    validateCandidate: g5Validate()
  });
  var plan = planMod.buildSeriesLiveReplacePlan({
    decision: decision,
    series: series,
    groups: match.groups,
    pairingDraft: match.pairings,
    target: target,
    incomingPlayer: incoming,
    rosterAffiliationId: o.rosterAffiliationId != null ? o.rosterAffiliationId : 'part-red',
    stationIndex: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1' }
  });
  var ident = { groupId: 'g1', position: 1 };
  var afterMatch = applyIncoming(match);
  var box = { data: {}, writes: 0 };
  var api = journalMod.createSeriesLiveMutationJournal(memoryAdapter(box));
  var beforeBundle = { station: freezeFromMatch(match, ident) };
  var afterBundle = { station: freezeFromMatch(afterMatch, ident) };
  var rosterOp = (plan.operations || []).filter(function (op) {
    return op.type === 'repair_series_roster_affiliation';
  })[0];
  if (rosterOp) {
    beforeBundle.roster = {
      rosterEntryId: rosterOp.rosterEntryId,
      playerId: rosterOp.playerId,
      registrationStatus: 'registered',
      seriesParticipantId: rosterOp.fromSeriesParticipantId
    };
    afterBundle.roster = {
      rosterEntryId: rosterOp.rosterEntryId,
      playerId: rosterOp.playerId,
      registrationStatus: 'registered',
      seriesParticipantId: rosterOp.toSeriesParticipantId
    };
  }
  var prepared = api.prepareJournal({
    plan: plan,
    before: beforeBundle,
    expectedAfter: afterBundle
  });
  return {
    series: series,
    match: match,
    afterMatch: afterMatch,
    plan: plan,
    journal: prepared.journal,
    prepared: prepared,
    box: box,
    api: api,
    matches: matches
  };
}

function harness(bundle, extra) {
  var e = extra || {};
  var seriesBox = { ser: clone(bundle.series) };
  var matchBox = { m: clone(bundle.match) };
  var stats = {
    getSeries: 0,
    getMatch: 0,
    saveMatch: 0,
    upsert: 0,
    preflight: 0,
    saveStationGroups: 0,
    saveMatchChecked: 0
  };
  if (e.matchAfter) matchBox.m = clone(e.matchAfter);
  var throwSave = e.throwSave || null;
  var throwUpsert = e.throwUpsert || null;
  var failTransAfterWrite = e.failTransAfterWrite || 0;
  var origTrans = bundle.api.transitionJournal.bind(bundle.api);
  function transitionJournal(planKey, from, to, patch) {
    if (failTransAfterWrite > 0 && stats.saveMatch > 0 && from === PHASE.station_writing && to === PHASE.station_written) {
      failTransAfterWrite -= 1;
      return { ok: false, reason: 'journal_write_failed' };
    }
    return origTrans(planKey, from, to, patch);
  }
  return {
    stats: stats,
    seriesBox: seriesBox,
    matchBox: matchBox,
    args: function (more) {
      return Object.assign(
        {
          planKey: bundle.plan.planKey,
          plan: bundle.plan,
          currentUser: { userId: 'admin' },
          validateCandidate: g5Validate(),
          hasManagePermission: allowPerm(),
          getSeriesById: function () {
            stats.getSeries += 1;
            return clone(seriesBox.ser);
          },
          getMatchById: function (id) {
            stats.getMatch += 1;
            if (id && id !== 'm1' && bundle.matches && bundle.matches[id]) return clone(bundle.matches[id]);
            return clone(matchBox.m);
          },
          saveMatch: function (m) {
            stats.saveMatch += 1;
            if (throwSave === 'before') throw new Error('save_fail');
            if (throwSave === 'after') {
              matchBox.m = clone(m);
              throw new Error('save_fail_after');
            }
            if (throwSave === 'unknown') {
              var bad = clone(m);
              bad.pairings.g1[0].playerIds = ['Z', 'Q'];
              matchBox.m = bad;
              return bad;
            }
            if (throwSave === 'noop') {
              return m;
            }
            matchBox.m = clone(m);
            return m;
          },
          upsertSeriesChecked: function (s, rev) {
            stats.upsert += 1;
            if (throwUpsert === 'before') throw new Error('upsert_fail');
            if (throwUpsert === 'after') {
              seriesBox.ser = clone(s);
              throw new Error('upsert_fail_after');
            }
            if (throwUpsert === 'unknown') {
              var badS = clone(s);
              badS.roster[0].seriesParticipantId = 'part-weird';
              seriesBox.ser = badS;
              return { ok: true, series: badS };
            }
            seriesBox.ser = clone(s);
            return { ok: true, series: clone(s), expected: rev };
          },
          getJournal: function (k) {
            return bundle.api.getJournal(k);
          },
          transitionJournal: transitionJournal,
          saveStationGroups: function () {
            stats.saveStationGroups += 1;
          },
          saveMatchChecked: function () {
            stats.saveMatchChecked += 1;
          }
        },
        more || {}
      );
    }
  };
}

function wrapPreflightCount(h, args) {
  var preflightMod = require(seriesTestPaths.util('seriesLiveReplacePreflight.js'));
  var inner = preflightMod.runSeriesLiveReplacePreflight;
  args.runPreflight = function (input) {
    h.stats.preflight += 1;
    return inner(input);
  };
  return args;
}

(function station_only_ok() {
  var b = buildBundle();
  var h = harness(b);
  var args = wrapPreflightCount(h, h.args());
  var out = execute(args);
  assert(
    '1 station-only 完整成功',
    b.prepared.ok &&
      out.ok &&
      out.journalPhase === PHASE.committed &&
      h.matchBox.m.groups[0].players[0].userId === 'B' &&
      h.stats.upsert === 0
  );
})();

(function station_roster_ok() {
  var series = seriesBase({
    roster: [
      {
        rosterEntryId: 're-B',
        playerId: 'B',
        seriesParticipantId: 'part-blue',
        registrationStatus: 'registered'
      },
      {
        rosterEntryId: 're-C',
        playerId: 'C',
        seriesParticipantId: 'part-blue',
        registrationStatus: 'registered'
      }
    ],
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
    ]
  });
  var match = matchBase();
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  m2.pairings = { gx: [{ pairingId: 'px', playerIds: ['B', 'C'] }] };
  var b = buildBundle({
    series: series,
    match: match,
    matches: { m1: match, m2: m2 },
    rosterAffiliationId: 'part-blue',
    targetAffiliationId: 'part-red'
  });
  var h = harness(b);
  var out = execute(wrapPreflightCount(h, h.args()));
  var row = h.seriesBox.ser.roster.filter(function (r) {
    return r.rosterEntryId === 're-B';
  })[0];
  var other = h.seriesBox.ser.roster.filter(function (r) {
    return r.rosterEntryId === 're-C';
  })[0];
  assert('2 station+roster 完整成功', out.ok && out.journalPhase === PHASE.committed && row.seriesParticipantId === 'part-red');
  assert('13 roster 只改唯一 rosterEntryId', other.seriesParticipantId === 'part-blue');
  assert('14 roster 只改 seriesParticipantId', Object.keys(row).indexOf('groupName') < 0);
  assert('15 registrationRevision +1', h.seriesBox.ser.registrationRevision === 4);
  assert('16 roster 不含 seat 字段写入', !row.matchTeamId && !row.affiliationId);
})();

(function patch_preserves() {
  var b = buildBundle();
  var h = harness(b);
  execute(h.args());
  var m = h.matchBox.m;
  assert('3 station patch 保留其它组', m.groups[1].groupId === 'g2' && m.groups[1].players[0].userId === 'X');
  assert(
    '4 保留其它 pairing/entity',
    m.pairings.g2[0].pairingId === 'p2' && m.scoreEntities.g2[0].entityId === 'ent-x'
  );
  assert('5 不覆盖其它 scoreData', m.scoreData.keepMe === true && m.scoreData.holes[0] === 4);
})();

(function no_forbidden_apis() {
  var src = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'seriesLiveReplaceExecute.js'),
    'utf8'
  );
  var h = harness(buildBundle());
  execute(h.args());
  assert(
    '6 不调用 saveStationGroups/saveMatchChecked',
    src.indexOf('saveStationGroups') < 0 &&
      src.indexOf('saveMatchChecked') < 0 &&
      src.indexOf('toFormalGroups') < 0 &&
      h.stats.saveStationGroups === 0 &&
      h.stats.saveMatchChecked === 0
  );
})();

(function reread_preflight() {
  var b = buildBundle();
  var h = harness(b);
  var args = wrapPreflightCount(h, h.args());
  execute(args);
  assert('7 每次写前重新读取', h.stats.getMatch >= 3 && h.stats.getSeries >= 3);
  assert('8 每次写前重新 preflight', h.stats.preflight >= 3);
})();

(function save_throw_before() {
  var b = buildBundle();
  var h = harness(b, { throwSave: 'before' });
  var out = execute(h.args());
  assert(
    '9 station save 抛错但实际 before',
    out.ok === false &&
      out.code === 'station_write_failed_before' &&
      out.requiresRollback === false &&
      h.matchBox.m.groups[0].players[0].userId === 'A'
  );
})();

(function save_throw_after() {
  var b = buildBundle();
  var h = harness(b, { throwSave: 'after' });
  var out = execute(h.args());
  assert(
    '10 station save 抛错但实际 after',
    out.ok && out.journalPhase === PHASE.committed && h.matchBox.m.groups[0].players[0].userId === 'B'
  );
})();

(function save_unknown() {
  var b = buildBundle();
  var h = harness(b, { throwSave: 'unknown' });
  var out = execute(h.args());
  var j = b.api.getJournal(b.plan.planKey);
  assert(
    '11 station save 后 unknown → manual_review',
    out.requiresManualReview === true && j.journal.phase === PHASE.manual_review
  );
})();

(function readback_not_after() {
  var b = buildBundle();
  var h = harness(b, { throwSave: 'noop' });
  var out = execute(h.args());
  var j = b.api.getJournal(b.plan.planKey);
  assert(
    '12 station readback 不是 after → 不推进 verified',
    out.ok === false &&
      j.journal.phase !== PHASE.station_verified &&
      j.journal.phase !== PHASE.committed
  );
})();

(function roster_throw_before() {
  var series = seriesBase({
    roster: [
      {
        rosterEntryId: 're-B',
        playerId: 'B',
        seriesParticipantId: 'part-blue',
        registrationStatus: 'registered'
      }
    ],
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
    ]
  });
  var match = matchBase();
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  var b = buildBundle({
    series: series,
    match: match,
    matches: { m1: match, m2: m2 },
    rosterAffiliationId: 'part-blue',
    targetAffiliationId: 'part-red'
  });
  var h = harness(b, { throwUpsert: 'before' });
  var out = execute(h.args());
  var j = b.api.getJournal(b.plan.planKey);
  assert(
    '17 roster save 抛错且仍 before → rollback_pending',
    out.code === 'roster_write_failed_before' &&
      out.requiresRollback === true &&
      j.journal.phase === PHASE.rollback_pending &&
      h.seriesBox.ser.roster[0].seriesParticipantId === 'part-blue'
  );
  assert('35 不实现 rollback', h.matchBox.m.groups[0].players[0].userId === 'B' && out.requiresRollback === true);
})();

(function roster_throw_after() {
  var series = seriesBase({
    roster: [
      {
        rosterEntryId: 're-B',
        playerId: 'B',
        seriesParticipantId: 'part-blue',
        registrationStatus: 'registered'
      }
    ],
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
    ]
  });
  var match = matchBase();
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  var b = buildBundle({
    series: series,
    match: match,
    matches: { m1: match, m2: m2 },
    rosterAffiliationId: 'part-blue',
    targetAffiliationId: 'part-red'
  });
  var h = harness(b, { throwUpsert: 'after' });
  var out = execute(h.args());
  assert('18 roster save 抛错但已 after → 继续', out.ok && out.journalPhase === PHASE.committed);
})();

(function roster_unknown() {
  var series = seriesBase({
    roster: [
      {
        rosterEntryId: 're-B',
        playerId: 'B',
        seriesParticipantId: 'part-blue',
        registrationStatus: 'registered'
      }
    ],
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
    ]
  });
  var match = matchBase();
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  var b = buildBundle({
    series: series,
    match: match,
    matches: { m1: match, m2: m2 },
    rosterAffiliationId: 'part-blue',
    targetAffiliationId: 'part-red'
  });
  var h = harness(b, { throwUpsert: 'unknown' });
  var out = execute(h.args());
  var j = b.api.getJournal(b.plan.planKey);
  assert('19 roster unknown → manual_review', out.requiresManualReview === true && j.journal.phase === PHASE.manual_review);
})();

(function no_roster_mutation() {
  var b = buildBundle();
  var h = harness(b);
  execute(h.args());
  assert('20 无 roster 时不读写 roster mutation', h.stats.upsert === 0 && b.journal.requiresRosterMutation !== true);
})();

(function committed_idemp() {
  var b = buildBundle();
  var h = harness(b);
  var first = execute(h.args());
  var saves = h.stats.saveMatch;
  var second = execute(h.args());
  assert('21 committed 重复调用幂等', first.ok && second.ok && second.idempotent === true && h.stats.saveMatch === saves);
})();

(function committed_drift() {
  var b = buildBundle();
  var h = harness(b);
  execute(h.args());
  h.matchBox.m = clone(b.match);
  var out = execute(h.args());
  assert('22 committed drift → manual_review', out.ok === false && out.requiresManualReview === true);
})();

(function writing_retry() {
  var b = buildBundle();
  b.api.transitionJournal(b.plan.planKey, PHASE.prepared, PHASE.station_writing);
  var h = harness(b);
  var out = execute(h.args());
  assert('23 station_writing + before 安全重试', out.ok && h.stats.saveMatch === 1);
})();

(function writing_after_advance() {
  var b = buildBundle();
  b.api.transitionJournal(b.plan.planKey, PHASE.prepared, PHASE.station_writing);
  var h = harness(b, { matchAfter: b.afterMatch });
  var out = execute(h.args());
  assert('24 station_writing + after 只推进日志', out.ok && h.stats.saveMatch === 0 && out.journalPhase === PHASE.committed);
})();

(function verified_only_roster() {
  var series = seriesBase({
    roster: [
      {
        rosterEntryId: 're-B',
        playerId: 'B',
        seriesParticipantId: 'part-blue',
        registrationStatus: 'registered'
      }
    ],
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
    ]
  });
  var match = matchBase();
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  var b = buildBundle({
    series: series,
    match: match,
    matches: { m1: match, m2: m2 },
    rosterAffiliationId: 'part-blue',
    targetAffiliationId: 'part-red'
  });
  b.api.transitionJournal(b.plan.planKey, PHASE.prepared, PHASE.station_writing);
  b.api.transitionJournal(b.plan.planKey, PHASE.station_writing, PHASE.station_written);
  b.api.transitionJournal(b.plan.planKey, PHASE.station_written, PHASE.station_verified);
  var h = harness(b, { matchAfter: b.afterMatch });
  var out = execute(h.args());
  assert('25 station_verified + roster before 只写 roster', out.ok && h.stats.saveMatch === 0 && h.stats.upsert === 1);
})();

(function all_after_commit() {
  var b = buildBundle();
  var h = harness(b, { matchAfter: b.afterMatch });
  b.api.transitionJournal(b.plan.planKey, PHASE.prepared, PHASE.station_writing);
  b.api.transitionJournal(b.plan.planKey, PHASE.station_writing, PHASE.station_written);
  b.api.transitionJournal(b.plan.planKey, PHASE.station_written, PHASE.station_verified);
  var out = execute(h.args());
  assert('26 all_after 只 commit', out.ok && h.stats.saveMatch === 0 && h.stats.upsert === 0);
})();

(function committing_reentry() {
  var b = buildBundle();
  var h = harness(b, { matchAfter: b.afterMatch });
  b.api.transitionJournal(b.plan.planKey, PHASE.prepared, PHASE.station_writing);
  b.api.transitionJournal(b.plan.planKey, PHASE.station_writing, PHASE.station_written);
  b.api.transitionJournal(b.plan.planKey, PHASE.station_written, PHASE.station_verified);
  b.api.transitionJournal(b.plan.planKey, PHASE.station_verified, PHASE.committing);
  var out = execute(h.args());
  assert('27 committing 重入不重写业务', out.ok && h.stats.saveMatch === 0 && h.stats.upsert === 0);
})();

(function trans_fail_after_write() {
  var b = buildBundle();
  var h = harness(b, { failTransAfterWrite: 2 });
  var out = execute(h.args());
  assert(
    '28 journal transition 写后失败不重复业务写',
    out.ok === false &&
      out.code === 'journal_transition_failed_after_write' &&
      h.stats.saveMatch === 1
  );
})();

(function preflight_reject() {
  var b = buildBundle();
  var h = harness(b);
  var args = h.args({ hasManagePermission: denyPerm() });
  var out = execute(args);
  assert('29 preflight 拒绝时零业务写', out.ok === false && h.stats.saveMatch === 0 && h.stats.upsert === 0);
})();

(function lock_reject() {
  var b = buildBundle();
  var h = harness(b);
  h.matchBox.m.groups[0].status = 'finished';
  var a = execute(h.args());
  var b2 = buildBundle();
  var h2 = harness(b2);
  h2.seriesBox.ser.rounds[0].roundStatus = 'cancelled';
  var c = execute(h2.args());
  var b3 = buildBundle();
  var h3 = harness(b3);
  var d = execute(h3.args({ hasManagePermission: denyPerm() }));
  assert(
    '30 group finished/round cancelled/权限丢失时零业务写',
    h.stats.saveMatch === 0 && h2.stats.saveMatch === 0 && h3.stats.saveMatch === 0 && !a.ok && !c.ok && !d.ok
  );
})();

(function confirm_fp() {
  var b = buildBundle();
  var plan = clone(b.plan);
  plan.requiresConfirmation = true;
  plan.confirmationFingerprint = 'fp-1';
  plan.decisionAction = 'confirm_reaffiliate';
  plan.identity.decisionAction = 'confirm_reaffiliate';
  var journal = clone(b.journal);
  journal.requiresConfirmation = true;
  journal.confirmationFingerprint = 'fp-1';
  journal.confirmationAcceptedFingerprint = 'fp-other';
  journal.action = 'confirm_reaffiliate';
  b.box.data[b.plan.planKey] = journal;
  var h = harness(b);
  var out = execute(h.args({ plan: plan, confirmed: true }));
  assert('31 confirm fingerprint 不一致时零业务写', out.ok === false && h.stats.saveMatch === 0);
})();

(function stale_action() {
  var b = buildBundle();
  var h = harness(b);
  var plan = clone(b.plan);
  plan.decisionAction = 'confirm_reaffiliate';
  plan.identity.decisionAction = 'confirm_reaffiliate';
  var out = execute(h.args({ plan: plan }));
  assert('32 direct/confirm 变化 stale 时零业务写', out.ok === false && h.stats.saveMatch === 0);
})();

(function plan_frozen() {
  var b = buildBundle();
  var h = harness(b);
  var snap = JSON.stringify(b.plan);
  execute(h.args());
  assert('33 输入 plan 不变', JSON.stringify(b.plan) === snap);
})();

(function ryder_same() {
  var ordinary = buildBundle();
  var h1 = harness(ordinary);
  var a = execute(h1.args());
  var ryderSeries = seriesBase({ seriesCompetitionType: 'ryder_cup' });
  var ryder = buildBundle({ series: ryderSeries });
  var h2 = harness(ryder);
  var c = execute(h2.args());
  assert(
    '34 普通 Series 与显式莱德杯执行结构相同',
    seriesRyderCup.isRyderCupSeries(ryderSeries) &&
      a.ok &&
      c.ok &&
      a.journalPhase === c.journalPhase
  );
})();

(function no_ui() {
  var src = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'seriesLiveReplaceExecute.js'),
    'utf8'
  );
  assert(
    '36 不接 UI',
    src.indexOf('group-editor') < 0 && src.indexOf('seriesLiveReplace.js') < 0
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveReplaceExecute.selftest');
