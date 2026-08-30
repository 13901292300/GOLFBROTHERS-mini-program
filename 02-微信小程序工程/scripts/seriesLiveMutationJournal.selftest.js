/**
 * Series LIVE mutation journal（只记录，不改业务对象）
 * 运行：node scripts/seriesLiveMutationJournal.selftest.js
 */

var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var PHASE = journalMod.PHASE;
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

function memoryAdapter(box) {
  return {
    getItem: function () {
      if (box.failRead) return { ok: false, reason: 'journal_read_failed' };
      return { ok: true, value: box.data };
    },
    setItem: function (_key, value) {
      if (box.failWrite) return { ok: false, reason: 'journal_write_failed' };
      box.data = value;
      return { ok: true };
    }
  };
}

function makeJournal(box) {
  return journalMod.createSeriesLiveMutationJournal(memoryAdapter(box || (box = { data: {} })));
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
          entityId: e.entityId || 'ent-a'
        },
        { position: 2, userId: 'C', playerId: 'C', id: 'C' }
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

function rosterSnap(spid) {
  return {
    rosterEntryId: 're-B',
    playerId: 'B',
    registrationStatus: 'registered',
    seriesParticipantId: spid,
    registrationRevision: 3,
    lifecycleStatus: 'published'
  };
}

function fakePlan(extra) {
  var o = extra || {};
  var action = o.action || 'direct_replace';
  var confirm = action === 'confirm_reaffiliate';
  var fp = confirm ? 'fp-confirm-1' : null;
  var ops = [{ type: 'replace_station_seat' }];
  if (o.withRoster) ops.push({ type: 'repair_series_roster_affiliation' });
  return Object.assign(
    {
      planKey: o.planKey || ['ser-1', 'r1', 'm1', 'g1', '1', 'A', 'B', 'tok-1'].join('\u001f'),
      planStatus: confirm ? 'awaiting_confirmation' : 'ready',
      requiresConfirmation: confirm,
      confirmationFingerprint: fp,
      decisionAction: action,
      needsRosterRepair: !!o.withRoster,
      identity: {
        seriesId: 'ser-1',
        roundId: 'r1',
        matchId: 'm1',
        groupId: 'g1',
        position: 1,
        publishToken: 'tok-1',
        decisionAction: action,
        incomingUserId: 'B',
        outgoingUserId: 'A',
        targetAffiliationId: o.targetAffiliationId || 'part-red'
      },
      operations: ops
    },
    o.plan || {}
  );
}

function prepareArgs(plan, opts) {
  var o = opts || {};
  var withRoster = !!(plan.needsRosterRepair || o.withRoster);
  var args = {
    plan: plan,
    before: { station: stationSnap('A', o.beforeStation) },
    expectedAfter: { station: stationSnap('B', o.afterStation) },
    confirmation: o.confirmation
  };
  if (withRoster) {
    args.before.roster = o.beforeRoster || rosterSnap('part-red');
    args.expectedAfter.roster = o.afterRoster || rosterSnap('part-blue');
  }
  return args;
}

function walk(j, key, chain) {
  var last = { ok: true };
  for (var i = 0; i < chain.length - 1; i++) {
    last = j.transitionJournal(key, chain[i], chain[i + 1]);
    if (!last.ok) return last;
  }
  return last;
}

var box = { data: {} };
var j = makeJournal(box);

(function create_prepared() {
  var plan = fakePlan({ planKey: 'k-new' });
  var out = j.prepareJournal(prepareArgs(plan));
  assert('1 新 plan 创建 prepared', out.ok && out.journal.phase === PHASE.prepared && out.idempotent !== true);
})();

(function prepare_idempotent() {
  var plan = fakePlan({ planKey: 'k-idemp' });
  var a = j.prepareJournal(prepareArgs(plan));
  var b = j.prepareJournal(prepareArgs(plan));
  assert('2 相同 plan 重复 prepare 幂等', a.ok && b.ok && b.idempotent === true && b.journal.phase === PHASE.prepared);
})();

(function prepare_conflict() {
  var plan = fakePlan({ planKey: 'k-conflict' });
  j.prepareJournal(prepareArgs(plan));
  var other = fakePlan({ planKey: 'k-conflict', targetAffiliationId: 'part-blue' });
  var out = j.prepareJournal(prepareArgs(other));
  assert('3 同 planKey 不同内容冲突', out.ok === false && out.reason === 'journal_plan_conflict');
})();

(function direct_no_confirm() {
  var plan = fakePlan({ planKey: 'k-direct', action: 'direct_replace' });
  var out = j.prepareJournal(prepareArgs(plan));
  assert('4 direct plan 无确认可 prepare', out.ok && out.journal.requiresConfirmation === false);
})();

(function confirm_fp() {
  var plan = fakePlan({ planKey: 'k-confirm', action: 'confirm_reaffiliate' });
  var bad = j.prepareJournal(prepareArgs(plan, { confirmation: {} }));
  var good = j.prepareJournal(
    prepareArgs(plan, { confirmation: { confirmationAcceptedFingerprint: plan.confirmationFingerprint } })
  );
  assert(
    '5 confirm fingerprint 正确才可 prepare',
    bad.reason === 'confirmation_required' && good.ok && good.journal.confirmationAcceptedFingerprint === plan.confirmationFingerprint
  );
})();

(function confirmed_true_rejected() {
  var plan = fakePlan({ planKey: 'k-bool', action: 'confirm_reaffiliate' });
  var out = j.prepareJournal(prepareArgs(plan, { confirmation: { confirmed: true } }));
  assert('6 confirmed:true 不能代替 fingerprint', out.ok === false && out.reason === 'confirmation_required');
})();

(function station_only_chain() {
  var plan = fakePlan({ planKey: 'k-station' });
  j.prepareJournal(prepareArgs(plan));
  var chain = [
    PHASE.prepared,
    PHASE.station_writing,
    PHASE.station_written,
    PHASE.station_verified,
    PHASE.committing,
    PHASE.committed
  ];
  var out = walk(j, 'k-station', chain);
  assert('7 station-only 合法 phase 链', out.ok && out.journal.phase === PHASE.committed && out.journal.committedAt);
})();

(function roster_chain() {
  var plan = fakePlan({ planKey: 'k-roster', withRoster: true });
  j.prepareJournal(prepareArgs(plan, { withRoster: true }));
  var chain = [
    PHASE.prepared,
    PHASE.station_writing,
    PHASE.station_written,
    PHASE.station_verified,
    PHASE.roster_writing,
    PHASE.roster_written,
    PHASE.roster_verified,
    PHASE.committing,
    PHASE.committed
  ];
  var out = walk(j, 'k-roster', chain);
  assert('8 station+roster 合法 phase 链', out.ok && out.journal.phase === PHASE.committed);
})();

(function no_skip() {
  var plan = fakePlan({ planKey: 'k-skip' });
  j.prepareJournal(prepareArgs(plan));
  var out = j.transitionJournal('k-skip', PHASE.prepared, PHASE.station_written);
  assert('9 禁止跳阶段', out.ok === false && out.reason === 'journal_illegal_transition');
})();

(function expected_phase_conflict() {
  var plan = fakePlan({ planKey: 'k-exp' });
  j.prepareJournal(prepareArgs(plan));
  var out = j.transitionJournal('k-exp', PHASE.station_writing, PHASE.station_written);
  assert('10 expectedPhase 冲突', out.ok === false && out.reason === 'journal_phase_conflict');
})();

(function same_phase_idempotent() {
  var plan = fakePlan({ planKey: 'k-same' });
  j.prepareJournal(prepareArgs(plan));
  j.transitionJournal('k-same', PHASE.prepared, PHASE.station_writing);
  var a = j.transitionJournal('k-same', PHASE.station_writing, PHASE.station_writing);
  var b = j.transitionJournal('k-same', PHASE.station_writing, PHASE.station_writing);
  assert('11 同 phase 同 payload 幂等', a.ok && a.idempotent && b.ok && b.idempotent);
})();

(function same_phase_payload_conflict() {
  var plan = fakePlan({ planKey: 'k-pay' });
  j.prepareJournal(prepareArgs(plan));
  j.transitionJournal('k-pay', PHASE.prepared, PHASE.station_writing, { failure: { code: 'x' } });
  var out = j.transitionJournal('k-pay', PHASE.station_writing, PHASE.station_writing, {
    failure: { code: 'y' }
  });
  assert('12 同 phase 不同 payload 冲突', out.ok === false && out.reason === 'journal_payload_conflict');
})();

(function immutable_identity() {
  var plan = fakePlan({ planKey: 'k-imm' });
  j.prepareJournal(prepareArgs(plan));
  var out = j.transitionJournal('k-imm', PHASE.prepared, PHASE.station_writing, { incomingUserId: 'Z' });
  assert('13 immutable 身份不能 patch', out.ok === false && out.reason === 'journal_immutable_patch');
})();

(function before_after_locked() {
  var plan = fakePlan({ planKey: 'k-ba' });
  j.prepareJournal(prepareArgs(plan));
  var a = j.transitionJournal('k-ba', PHASE.prepared, PHASE.station_writing, { before: { station: {} } });
  var b = j.transitionJournal('k-ba', PHASE.prepared, PHASE.station_writing, {
    expectedAfter: { station: {} }
  });
  var c = j.transitionJournal('k-ba', PHASE.prepared, PHASE.station_writing, {
    fingerprints: { plan: 'hack' }
  });
  assert(
    '14 before/after 不能被 transition 改写',
    a.reason === 'journal_immutable_patch' &&
      b.reason === 'journal_immutable_patch' &&
      c.reason === 'journal_immutable_patch'
  );
})();

(function committed_terminal() {
  var got = j.getJournal('k-station');
  var again = j.transitionJournal('k-station', PHASE.committed, PHASE.station_writing);
  assert(
    '15 committed 终态',
    got.journal.phase === PHASE.committed && again.ok === false && again.reason === 'journal_terminal'
  );
})();

(function rolled_back_terminal() {
  var plan = fakePlan({ planKey: 'k-rb' });
  j.prepareJournal(prepareArgs(plan));
  walk(j, 'k-rb', [PHASE.prepared, PHASE.rollback_pending, PHASE.rolling_back, PHASE.rolled_back]);
  var again = j.transitionJournal('k-rb', PHASE.rolled_back, PHASE.prepared);
  var reuse = j.prepareJournal(prepareArgs(plan));
  assert(
    '16 rolled_back 终态',
    again.ok === false &&
      again.reason === 'journal_terminal' &&
      reuse.ok === false &&
      reuse.reason === 'journal_already_rolled_back'
  );
})();

(function manual_review_no_auto() {
  var plan = fakePlan({ planKey: 'k-mr' });
  j.prepareJournal(prepareArgs(plan));
  j.transitionJournal('k-mr', PHASE.prepared, PHASE.manual_review);
  var next = j.transitionJournal('k-mr', PHASE.manual_review, PHASE.station_writing);
  var prep = j.prepareJournal(prepareArgs(plan));
  assert(
    '17 manual_review 不自动继续',
    next.ok === false &&
      next.reason === 'journal_manual_review' &&
      prep.ok === false &&
      prep.reason === 'journal_manual_review'
  );
})();

(function unfinished_lists() {
  var list = j.listUnfinishedJournals();
  var keys = list.journals.map(function (row) {
    return row.planKey || '';
  });
  var phases = list.journals.map(function (row) {
    return row.phase;
  });
  assert('18 manual_review 出现在 unfinished', keys.indexOf('k-mr') >= 0 && phases.indexOf(PHASE.manual_review) >= 0);
  assert(
    '19 committed/rolled_back 不在 unfinished',
    keys.indexOf('k-station') < 0 && keys.indexOf('k-rb') < 0 && keys.indexOf('k-roster') < 0
  );
})();

(function deep_copy() {
  var got = j.getJournal('k-new');
  got.journal.phase = 'hacked';
  got.journal.incomingUserId = 'ZZ';
  var again = j.getJournal('k-new');
  assert(
    '20 返回值深拷贝',
    again.journal.phase === PHASE.prepared && again.journal.incomingUserId === 'B'
  );
})();

(function fp_key_order() {
  var a = journalMod.fingerprintOf({ z: 1, a: { y: 2, x: 3 } });
  var b = journalMod.fingerprintOf({ a: { x: 3, y: 2 }, z: 1 });
  assert('21 对象键顺序不影响 fingerprint', a === b);
})();

(function fp_array_order() {
  var a = journalMod.fingerprintOf({ pairings: [{ playerIds: ['A', 'C'] }] });
  var b = journalMod.fingerprintOf({ pairings: [{ playerIds: ['C', 'A'] }] });
  assert('22 pairing 数组顺序影响 fingerprint', a !== b);
})();

(function fp_score() {
  var a = journalMod.fingerprintOf(stationSnap('A', { scorePlayerId: 'A' }));
  var b = journalMod.fingerprintOf(stationSnap('A', { scorePlayerId: 'X' }));
  assert('23 成绩身份变化影响 fingerprint', a !== b);
})();

(function roster_no_seat_fields() {
  var frozen = journalMod.freezeRoster(
    Object.assign(rosterSnap('part-red'), {
      groupName: '红队',
      fromSeriesRoster: true,
      matchTeamId: 'red',
      affiliationId: 'red',
      teamId: 'red',
      divisionId: 'd1'
    })
  );
  assert(
    '24 roster 快照不含 seat 字段',
    frozen.rosterEntryId === 're-B' &&
      frozen.seriesParticipantId === 'part-red' &&
      frozen.groupName == null &&
      frozen.fromSeriesRoster == null &&
      frozen.matchTeamId == null &&
      frozen.affiliationId == null &&
      frozen.teamId == null &&
      frozen.divisionId == null
  );
})();

(function storage_errors() {
  var failBox = { data: {}, failRead: true };
  var jr = makeJournal(failBox);
  var r = jr.getJournal('x');
  failBox.failRead = false;
  failBox.failWrite = true;
  var w = jr.prepareJournal(prepareArgs(fakePlan({ planKey: 'k-write' })));
  assert(
    '25 storage read/write 失败返回明确错误',
    r.reason === 'journal_read_failed' && w.reason === 'journal_write_failed'
  );
})();

(function corrupted_discarded_current_wins() {
  var cbox = { data: { 'k-bad': { not: 'a journal' } } };
  var jc = makeJournal(cbox);
  var got = jc.getJournal('k-bad');
  var prep = jc.prepareJournal(prepareArgs(fakePlan({ planKey: 'k-bad' })));
  var hist = cbox.data['k-bad'] && cbox.data['k-bad'].history;
  assert(
    '26 损坏 journal 终态化后可继续 prepare',
    got.ok &&
      got.journal.phase === PHASE.corrupted_discarded &&
      got.journal.resolution === journalMod.RESOLUTION_CURRENT_PERSISTED_STATE_WINS &&
      got.journal.corruptionCode &&
      prep.ok &&
      prep.journal.phase === PHASE.prepared &&
      Array.isArray(hist) &&
      hist[0] &&
      hist[0].phase === PHASE.corrupted_discarded &&
      !Object.prototype.hasOwnProperty.call(hist[0], 'before')
  );
})();

(function no_business_writes_in_source() {
  var src = fs.readFileSync(seriesTestPaths.util('seriesLiveMutationJournal.js'), 'utf8');
  assert(
    '27 不调用 saveMatch/upsertSeriesChecked',
    src.indexOf('saveMatch') < 0 && src.indexOf('upsertSeriesChecked') < 0
  );
  assert(
    '28 不 require/修改 publish journal',
    src.indexOf('seriesPublishJournal') < 0 && src.indexOf('gb_series_publish_journal_v1') < 0
  );
})();

(function ryder_schema_same() {
  var ordinary = fakePlan({ planKey: 'k-ord', withRoster: true });
  var ryderPlan = fakePlan({ planKey: 'k-ryder', withRoster: true });
  ryderPlan.identity.seriesCompetitionType = seriesRyderCup.COMPETITION_TYPE;
  var box2 = { data: {} };
  var j2 = makeJournal(box2);
  var a = j2.prepareJournal(prepareArgs(ordinary, { withRoster: true }));
  var b = j2.prepareJournal(prepareArgs(ryderPlan, { withRoster: true }));
  var keysA = Object.keys(a.journal).sort().join(',');
  var keysB = Object.keys(b.journal).sort().join(',');
  assert(
    '29 普通 Series 与显式莱德杯 journal schema 相同',
    a.ok && b.ok && keysA === keysB && a.journal.requiresRosterMutation === b.journal.requiresRosterMutation
  );
})();

(function inputs_frozen() {
  var plan = fakePlan({ planKey: 'k-freeze' });
  var args = prepareArgs(plan);
  var p0 = clone(plan);
  var b0 = clone(args.before);
  var a0 = clone(args.expectedAfter);
  var box3 = { data: {} };
  var j3 = makeJournal(box3);
  j3.prepareJournal(args);
  assert(
    '30 输入对象不变',
    JSON.stringify(plan) === JSON.stringify(p0) &&
      JSON.stringify(args.before) === JSON.stringify(b0) &&
      JSON.stringify(args.expectedAfter) === JSON.stringify(a0)
  );
})();

(function attempt_first_is_one() {
  var got = j.getJournal('k-new');
  assert(
    '31 首次 attempt=1',
    got.ok &&
      got.journal.attemptNumber === 1 &&
      got.journal.journalAttemptKey === 'k-new::attempt:1' &&
      box.data['k-new'].current.attemptNumber === 1 &&
      Array.isArray(box.data['k-new'].history) &&
      box.data['k-new'].history.length === 0
  );
})();

(function rolled_back_plain_prepare_still_rejected() {
  var plan = fakePlan({ planKey: 'k-retry-plain' });
  j.prepareJournal(prepareArgs(plan));
  walk(j, 'k-retry-plain', [PHASE.prepared, PHASE.rollback_pending, PHASE.rolling_back, PHASE.rolled_back]);
  var reuse = j.prepareJournal(prepareArgs(plan));
  assert(
    '32 rolled_back 后普通 prepare 仍拒绝',
    reuse.ok === false && reuse.reason === 'journal_already_rolled_back'
  );
})();

(function next_attempt_all_before() {
  var box2 = { data: {} };
  var j2 = makeJournal(box2);
  var plan = fakePlan({ planKey: 'k-retry-ok' });
  j2.prepareJournal(prepareArgs(plan));
  walk(j2, 'k-retry-ok', [PHASE.prepared, PHASE.rollback_pending, PHASE.rolling_back, PHASE.rolled_back]);
  var first = j2.getJournal('k-retry-ok').journal;
  var out = j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(plan), { recovery: 'idempotent_rolled_back' })
  );
  assert(
    '33 all-before recovery 可创建 attempt=2',
    out.ok &&
      out.journal.attemptNumber === 2 &&
      out.journal.journalAttemptKey === 'k-retry-ok::attempt:2' &&
      out.journal.phase === PHASE.prepared &&
      first.attemptNumber === 1
  );
})();

(function next_attempt_not_all_before() {
  var box2 = { data: {} };
  var j2 = makeJournal(box2);
  var plan = fakePlan({ planKey: 'k-retry-bad' });
  j2.prepareJournal(prepareArgs(plan));
  walk(j2, 'k-retry-bad', [PHASE.prepared, PHASE.rollback_pending, PHASE.rolling_back, PHASE.rolled_back]);
  var noRecovery = j2.prepareNextAttemptAfterRollback(Object.assign(prepareArgs(plan), { retry: true }));
  var wrong = j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(plan), { recovery: 'eligible_to_start_station_after_revalidation', retry: true })
  );
  assert(
    '34 非 all-before 不能创建',
    noRecovery.reason === 'new_attempt_requires_all_before' &&
      wrong.reason === 'new_attempt_requires_all_before' &&
      j2.getJournal('k-retry-bad').journal.attemptNumber === 1
  );
})();

(function next_attempt_confirm_fp() {
  var box2 = { data: {} };
  var j2 = makeJournal(box2);
  var plan = fakePlan({ planKey: 'k-retry-confirm', action: 'confirm_reaffiliate' });
  var conf = { confirmation: { confirmationAcceptedFingerprint: plan.confirmationFingerprint } };
  j2.prepareJournal(prepareArgs(plan, conf));
  walk(j2, 'k-retry-confirm', [PHASE.prepared, PHASE.rollback_pending, PHASE.rolling_back, PHASE.rolled_back]);
  var missing = j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(plan), { recovery: 'idempotent_rolled_back' })
  );
  var bad = j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(plan, { confirmation: { confirmationAcceptedFingerprint: 'nope' } }), {
      recovery: 'idempotent_rolled_back'
    })
  );
  var good = j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(plan, conf), { recovery: 'idempotent_rolled_back' })
  );
  assert(
    '35 confirm 新 attempt 重新校验 fingerprint',
    missing.reason === 'confirmation_required' &&
      bad.reason === 'confirmation_fingerprint_conflict' &&
      good.ok &&
      good.journal.attemptNumber === 2 &&
      good.journal.confirmationAcceptedFingerprint === plan.confirmationFingerprint
  );
})();

(function history_keeps_rolled_back() {
  var box2 = { data: {} };
  var j2 = makeJournal(box2);
  var plan = fakePlan({ planKey: 'k-hist' });
  j2.prepareJournal(prepareArgs(plan));
  walk(j2, 'k-hist', [PHASE.prepared, PHASE.rollback_pending, PHASE.rolling_back, PHASE.rolled_back]);
  var rolled = clone(j2.getJournal('k-hist').journal);
  j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(plan), { recovery: 'idempotent_rolled_back' })
  );
  var hist = box2.data['k-hist'].history;
  var byKey = j2.getJournalByAttemptKey(rolled.journalAttemptKey);
  assert(
    '36 旧 rolled_back 进入 history 且不变',
    hist.length === 1 &&
      hist[0].phase === PHASE.rolled_back &&
      hist[0].attemptNumber === 1 &&
      JSON.stringify(hist[0]) === JSON.stringify(rolled) &&
      byKey.ok &&
      byKey.historical === true &&
      JSON.stringify(byKey.journal) === JSON.stringify(rolled)
  );
})();

(function attempt2_transition_leaves_attempt1() {
  var box2 = { data: {} };
  var j2 = makeJournal(box2);
  var plan = fakePlan({ planKey: 'k-iso' });
  j2.prepareJournal(prepareArgs(plan));
  walk(j2, 'k-iso', [PHASE.prepared, PHASE.rollback_pending, PHASE.rolling_back, PHASE.rolled_back]);
  var a1 = clone(j2.getJournal('k-iso').journal);
  j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(plan), { recovery: 'idempotent_rolled_back' })
  );
  var blocked = j2.transitionJournal(
    'k-iso',
    PHASE.prepared,
    PHASE.station_writing,
    {},
    a1.journalAttemptKey
  );
  var moved = j2.transitionJournal('k-iso', PHASE.prepared, PHASE.station_writing);
  var hist = j2.getJournalByAttemptKey(a1.journalAttemptKey);
  assert(
    '37 attempt 2 transition 不修改 attempt 1',
    blocked.reason === 'journal_historical_attempt' &&
      moved.ok &&
      moved.journal.attemptNumber === 2 &&
      moved.journal.journalAttemptKey === 'k-iso::attempt:2' &&
      hist.journal.phase === PHASE.rolled_back &&
      JSON.stringify(hist.journal) === JSON.stringify(a1)
  );
})();

(function committed_and_manual_no_next() {
  var box2 = { data: {} };
  var j2 = makeJournal(box2);
  var committedPlan = fakePlan({ planKey: 'k-no-next-c' });
  j2.prepareJournal(prepareArgs(committedPlan));
  walk(j2, 'k-no-next-c', [
    PHASE.prepared,
    PHASE.station_writing,
    PHASE.station_written,
    PHASE.station_verified,
    PHASE.committing,
    PHASE.committed
  ]);
  var c = j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(committedPlan), { recovery: 'idempotent_rolled_back' })
  );
  var mrPlan = fakePlan({ planKey: 'k-no-next-m' });
  j2.prepareJournal(prepareArgs(mrPlan));
  j2.transitionJournal('k-no-next-m', PHASE.prepared, PHASE.manual_review);
  var m = j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(mrPlan), { recovery: 'idempotent_rolled_back' })
  );
  assert(
    '38 committed/manual_review 不能开新 attempt',
    c.reason === 'journal_committed' && m.reason === 'journal_manual_review'
  );
})();

(function unfinished_excludes_history() {
  var box2 = { data: {} };
  var j2 = makeJournal(box2);
  var plan = fakePlan({ planKey: 'k-list' });
  j2.prepareJournal(prepareArgs(plan));
  walk(j2, 'k-list', [PHASE.prepared, PHASE.rollback_pending, PHASE.rolling_back, PHASE.rolled_back]);
  var afterRb = j2.listUnfinishedJournals().journals.some(function (row) {
    return row.planKey === 'k-list';
  });
  j2.prepareNextAttemptAfterRollback(
    Object.assign(prepareArgs(plan), { recovery: 'idempotent_rolled_back' })
  );
  var list = j2.listUnfinishedJournals();
  var rows = list.journals.filter(function (row) {
    return row.planKey === 'k-list';
  });
  assert(
    '39 listUnfinished 不返回 history',
    afterRb === false &&
      rows.length === 1 &&
      rows[0].attemptNumber === 2 &&
      rows[0].phase === PHASE.prepared &&
      rows[0].journalAttemptKey === 'k-list::attempt:2'
  );
})();

(function legacy_v1_read() {
  var legacy = {
    journalVersion: 1,
    planKey: 'k-legacy',
    phase: PHASE.prepared,
    seriesId: 'ser-1',
    roundId: 'r1',
    matchId: 'm1',
    groupId: 'g1',
    position: 1,
    publishToken: 'tok-1',
    incomingUserId: 'B',
    outgoingUserId: 'A',
    fingerprints: { plan: 'legacy-fp' },
    before: { station: stationSnap('A') },
    expectedAfter: { station: stationSnap('B') }
  };
  var cbox = { data: { 'k-legacy': clone(legacy) } };
  var jc = makeJournal(cbox);
  var got = jc.getJournal('k-legacy');
  assert(
    '40 旧 v1 记录兼容读取',
    got.ok &&
      got.journal.attemptNumber === 1 &&
      got.journal.journalAttemptKey === 'k-legacy::attempt:1' &&
      got.journal.phase === PHASE.prepared &&
      cbox.data['k-legacy'].phase === PHASE.prepared &&
      cbox.data['k-legacy'].current == null
  );
})();

(function bucket_rebuild_and_neighbor() {
  var keep = {
    journalVersion: 1,
    planKey: 'k-keep',
    phase: PHASE.prepared,
    fingerprints: { plan: 'keep' },
    mutationKind: 'batch',
    batchId: 'keep-1'
  };
  var boxKeep = { data: { 'k-keep': keep, 'k-bad': { phase: 'prepared' } } };
  var jk = makeJournal(boxKeep);
  var listed = jk.listUnfinishedJournals();
  var keepGot = jk.getJournal('k-keep');
  var badGot = jk.getJournal('k-bad');
  assert(
    '41 损坏记录隔离且不影响正常 journal',
    listed.ok &&
      listed.journals.some(function (j) {
        return j.planKey === 'k-keep' && j.phase === PHASE.prepared;
      }) &&
      !listed.journals.some(function (j) {
        return j.planKey === 'k-bad';
      }) &&
      keepGot.ok &&
      keepGot.journal.phase === PHASE.prepared &&
      badGot.ok &&
      badGot.journal.phase === PHASE.corrupted_discarded
  );
})();

(function whole_bucket_rebuild() {
  var boxArr = { data: ['not-a-map'] };
  var ja = makeJournal(boxArr);
  var listed = ja.listUnfinishedJournals();
  var q = boxArr.data && boxArr.data[journalMod.QUARANTINE_MAP_KEY];
  assert(
    '42 整桶无法解析则重建空桶',
    listed.ok &&
      listed.journals.length === 0 &&
      q &&
      q.current &&
      q.current.phase === PHASE.corrupted_discarded &&
      q.current.corruptionCode.indexOf('bucket_not_object') === 0
  );
})();

(function discarded_replay_forbidden() {
  var planKey = 'k-replay';
  var boxR = { data: {} };
  var jr = makeJournal(boxR);
  var written = jr.writePreparedBatchJournal({
    planKey: planKey,
    batchId: 'batch-old',
    matchId: 'm1',
    seriesId: 'ser-1',
    roundId: 'r1',
    identity: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok' },
    fingerprints: { matchBefore: 'x' }
  });
  boxR.data[planKey] = { not: 'journal', mutationKind: 'batch', batchId: 'batch-old' };
  jr.getJournal(planKey);
  var replay = jr.writePreparedBatchJournal({
    planKey: planKey,
    batchId: 'batch-old',
    matchId: 'm1',
    fingerprints: { matchBefore: 'x' }
  });
  var fresh = jr.writePreparedBatchJournal({
    planKey: planKey,
    batchId: 'batch-new',
    matchId: 'm1',
    fingerprints: { matchBefore: 'y' }
  });
  assert(
    '43 原损坏 batch 不可重放，新 batch 可写',
    written.ok &&
      replay.ok === false &&
      replay.reason === 'journal_replay_forbidden' &&
      fresh.ok &&
      fresh.journal.batchId === 'batch-new'
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveMutationJournal.selftest');
