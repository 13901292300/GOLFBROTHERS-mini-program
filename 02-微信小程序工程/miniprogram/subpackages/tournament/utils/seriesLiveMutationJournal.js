/**
 * Series LIVE 换人专用 mutation journal
 * - 只记录 / 读取 / 推进 phase
 * - 不修改 Match / Series 业务对象
 * - 不复用发布 journal
 */

var seriesStationMatch = require('../../../utils/seriesStationMatch.js');

var STORAGE_KEY = 'gb_series_live_mutation_journal_v1';
var JOURNAL_VERSION = 1;

var PHASE = {
  prepared: 'prepared',
  station_writing: 'station_writing',
  station_written: 'station_written',
  station_verified: 'station_verified',
  roster_writing: 'roster_writing',
  roster_written: 'roster_written',
  roster_verified: 'roster_verified',
  committing: 'committing',
  committed: 'committed',
  rollback_pending: 'rollback_pending',
  rolling_back: 'rolling_back',
  rolled_back: 'rolled_back',
  manual_review: 'manual_review'
};

var TERMINAL = {};
TERMINAL[PHASE.committed] = true;
TERMINAL[PHASE.rolled_back] = true;

var IMMUTABLE_KEYS = [
  'journalVersion',
  'planKey',
  'seriesId',
  'roundId',
  'matchId',
  'groupId',
  'position',
  'publishToken',
  'action',
  'incomingUserId',
  'outgoingUserId',
  'targetAffiliationId',
  'requiresConfirmation',
  'confirmationFingerprint',
  'confirmationAcceptedFingerprint',
  'operationKinds',
  'requiresRosterMutation',
  'before',
  'expectedAfter',
  'fingerprints',
  'attemptNumber',
  'journalAttemptKey'
];

var RECOVERY_IDEMPOTENT_ROLLED_BACK = 'idempotent_rolled_back';

var ROSTER_FREEZE_KEYS = [
  'rosterEntryId',
  'playerId',
  'registrationStatus',
  'seriesParticipantId',
  'registrationRevision',
  'lifecycleStatus'
];

var SEAT_LEAK_KEYS = [
  'groupName',
  'fromSeriesRoster',
  'matchTeamId',
  'affiliationId',
  'teamId',
  'divisionId'
];

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function fingerprintOf(value) {
  return seriesStationMatch.fingerprintOf(value);
}

function unwrapGet(res) {
  if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'ok')) {
    return res;
  }
  return { ok: true, value: res };
}

function unwrapSet(res) {
  if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'ok')) {
    return res;
  }
  return { ok: true };
}

function createWxStorageAdapter() {
  return {
    getItem: function (key) {
      var wxRef = typeof wx !== 'undefined' ? wx : null;
      if (!wxRef || typeof wxRef.getStorageSync !== 'function') {
        return { ok: true, value: null };
      }
      try {
        return { ok: true, value: wxRef.getStorageSync(key) };
      } catch (e) {
        return { ok: false, reason: 'journal_read_failed' };
      }
    },
    setItem: function (key, value) {
      var wxRef = typeof wx !== 'undefined' ? wx : null;
      if (!wxRef || typeof wxRef.setStorageSync !== 'function') {
        return { ok: false, reason: 'journal_write_failed' };
      }
      try {
        wxRef.setStorageSync(key, value);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'journal_write_failed' };
      }
    }
  };
}

function nowIso() {
  return new Date().toISOString();
}

function freezeStation(raw) {
  var src = raw && typeof raw === 'object' ? raw : {};
  var ctx = src.seriesContext && typeof src.seriesContext === 'object' ? src.seriesContext : {};
  var out = {
    matchId: asString(src.matchId),
    seriesContext: {
      managed: ctx.managed === true,
      seriesId: asString(ctx.seriesId),
      roundId: asString(ctx.roundId),
      matchId: asString(ctx.matchId) || asString(src.matchId),
      publishToken: asString(ctx.publishToken)
    },
    status: asString(src.status),
    groupId: asString(src.groupId),
    position: Number(src.position) || 0,
    group: src.group != null ? deepClone(src.group) : null,
    pairings: Array.isArray(src.pairings) ? deepClone(src.pairings) : src.pairings != null ? deepClone(src.pairings) : [],
    scoreEntities: src.scoreEntities != null ? deepClone(src.scoreEntities) : [],
    scoreIdentitySummary: src.scoreIdentitySummary != null ? deepClone(src.scoreIdentitySummary) : {}
  };
  return out;
}

function freezeRoster(raw) {
  if (raw == null) return null;
  var src = typeof raw === 'object' ? raw : {};
  var out = {};
  for (var i = 0; i < ROSTER_FREEZE_KEYS.length; i++) {
    var k = ROSTER_FREEZE_KEYS[i];
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    out[k] = src[k];
  }
  return out;
}

function rosterHasSeatLeak(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (var i = 0; i < SEAT_LEAK_KEYS.length; i++) {
    if (Object.prototype.hasOwnProperty.call(obj, SEAT_LEAK_KEYS[i])) return true;
  }
  return false;
}

function pickIdentity(plan) {
  var p = plan && typeof plan === 'object' ? plan : {};
  var id = p.identity && typeof p.identity === 'object' ? p.identity : {};
  return {
    planKey: asString(p.planKey),
    seriesId: asString(id.seriesId),
    roundId: asString(id.roundId),
    matchId: asString(id.matchId),
    groupId: asString(id.groupId),
    position: Number(id.position) || 0,
    publishToken: asString(id.publishToken),
    action: asString(id.decisionAction || p.decisionAction),
    incomingUserId: asString(id.incomingUserId),
    outgoingUserId: asString(id.outgoingUserId),
    targetAffiliationId: asString(id.targetAffiliationId),
    requiresConfirmation: p.requiresConfirmation === true,
    confirmationFingerprint: p.confirmationFingerprint == null ? null : asString(p.confirmationFingerprint)
  };
}

function operationKindsOf(plan) {
  var ops = plan && Array.isArray(plan.operations) ? plan.operations : [];
  var kinds = [];
  var seen = Object.create(null);
  for (var i = 0; i < ops.length; i++) {
    var t = asString(ops[i] && ops[i].type);
    if (!t || seen[t]) continue;
    seen[t] = true;
    kinds.push(t);
  }
  return kinds;
}

function requiresRosterOf(plan, kinds) {
  if (plan && plan.needsRosterRepair === true) return true;
  var list = kinds || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] === 'repair_series_roster_affiliation') return true;
  }
  return false;
}

function planFingerprintSource(identity, kinds, requiresRoster, confirmationAccepted) {
  return {
    journalVersion: JOURNAL_VERSION,
    planKey: identity.planKey,
    seriesId: identity.seriesId,
    roundId: identity.roundId,
    matchId: identity.matchId,
    groupId: identity.groupId,
    position: identity.position,
    publishToken: identity.publishToken,
    action: identity.action,
    incomingUserId: identity.incomingUserId,
    outgoingUserId: identity.outgoingUserId,
    targetAffiliationId: identity.targetAffiliationId,
    requiresConfirmation: identity.requiresConfirmation,
    confirmationFingerprint: identity.confirmationFingerprint,
    confirmationAcceptedFingerprint: confirmationAccepted == null ? null : asString(confirmationAccepted),
    operationKinds: kinds,
    requiresRosterMutation: !!requiresRoster
  };
}

function immutableFingerprint(record) {
  var slice = {};
  for (var i = 0; i < IMMUTABLE_KEYS.length; i++) {
    var k = IMMUTABLE_KEYS[i];
    slice[k] = record[k];
  }
  return fingerprintOf(slice);
}

function isValidJournal(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (Number(row.journalVersion) !== JOURNAL_VERSION) return false;
  if (!asString(row.planKey)) return false;
  if (!asString(row.phase)) return false;
  if (!row.fingerprints || typeof row.fingerprints !== 'object') return false;
  return true;
}

function attemptKeyOf(planKey, attemptNumber) {
  return asString(planKey) + '::attempt:' + String(attemptNumber);
}

function stampAttemptFields(record, planKey, attemptNumber) {
  var rec = record && typeof record === 'object' ? record : {};
  var n = Number(rec.attemptNumber);
  if (!isFinite(n) || n < 1) n = Number(attemptNumber);
  if (!isFinite(n) || n < 1) n = 1;
  rec.attemptNumber = n;
  if (!asString(rec.journalAttemptKey)) rec.journalAttemptKey = attemptKeyOf(rec.planKey || planKey, n);
  return rec;
}

function isBucket(row) {
  return !!(
    row &&
    typeof row === 'object' &&
    !Array.isArray(row) &&
    row.current &&
    typeof row.current === 'object' &&
    !Array.isArray(row.current) &&
    (row.history == null || Array.isArray(row.history))
  );
}

function maxAttemptNumber(bucket) {
  var n = 0;
  if (bucket && bucket.current) {
    var cur = Number(bucket.current.attemptNumber);
    if (isFinite(cur) && cur > n) n = cur;
  }
  var hist = bucket && Array.isArray(bucket.history) ? bucket.history : [];
  for (var i = 0; i < hist.length; i++) {
    var h = Number(hist[i] && hist[i].attemptNumber);
    if (isFinite(h) && h > n) n = h;
  }
  return n;
}

function normalizeBucket(raw, planKey) {
  if (isBucket(raw)) {
    var history = Array.isArray(raw.history)
      ? raw.history.map(function (row) {
          return stampAttemptFields(deepClone(row), planKey, row && row.attemptNumber);
        })
      : [];
    return {
      current: stampAttemptFields(deepClone(raw.current), planKey, raw.current && raw.current.attemptNumber),
      history: history
    };
  }
  if (isValidJournal(raw)) {
    return {
      current: stampAttemptFields(deepClone(raw), planKey, 1),
      history: []
    };
  }
  return null;
}

function recoveryClassificationOf(src) {
  if (!src || typeof src !== 'object') return '';
  if (typeof src.recoveryClassification === 'string') return asString(src.recoveryClassification);
  if (typeof src.recovery === 'string') return asString(src.recovery);
  if (src.recovery && typeof src.recovery === 'object') {
    return asString(src.recovery.recommendedAction || src.recovery.action);
  }
  return '';
}

function allowedNextPhases(phase, requiresRoster) {
  var next = [];
  if (phase === PHASE.prepared) next.push(PHASE.station_writing);
  if (phase === PHASE.station_writing) next.push(PHASE.station_written);
  if (phase === PHASE.station_written) next.push(PHASE.station_verified);
  if (phase === PHASE.station_verified) {
    next.push(requiresRoster ? PHASE.roster_writing : PHASE.committing);
  }
  if (phase === PHASE.roster_writing) next.push(PHASE.roster_written);
  if (phase === PHASE.roster_written) next.push(PHASE.roster_verified);
  if (phase === PHASE.roster_verified) next.push(PHASE.committing);
  if (phase === PHASE.committing) next.push(PHASE.committed);

  if (
    phase !== PHASE.committed &&
    phase !== PHASE.rolled_back &&
    phase !== PHASE.manual_review
  ) {
    next.push(PHASE.rollback_pending);
    next.push(PHASE.manual_review);
  }
  if (phase === PHASE.rollback_pending) {
    next.push(PHASE.rolling_back);
    next.push(PHASE.manual_review);
  }
  if (phase === PHASE.rolling_back) {
    next.push(PHASE.rolled_back);
    next.push(PHASE.manual_review);
  }
  return next;
}

function canTransition(from, to, requiresRoster) {
  if (from === to) return true;
  var allowed = allowedNextPhases(from, requiresRoster);
  for (var i = 0; i < allowed.length; i++) {
    if (allowed[i] === to) return true;
  }
  return false;
}

function patchPayloadFingerprint(patch) {
  var src = patch && typeof patch === 'object' ? patch : {};
  return fingerprintOf({
    failure: src.failure == null ? null : src.failure,
    recovery: src.recovery == null ? null : src.recovery
  });
}

function assertNoImmutablePatch(patch) {
  if (!patch || typeof patch !== 'object') return { ok: true };
  for (var i = 0; i < IMMUTABLE_KEYS.length; i++) {
    if (Object.prototype.hasOwnProperty.call(patch, IMMUTABLE_KEYS[i])) {
      return { ok: false, reason: 'journal_immutable_patch' };
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'phase')) {
    return { ok: false, reason: 'journal_immutable_patch' };
  }
  return { ok: true };
}

function assertConfirmation(identity, confirmation) {
  if (!identity.requiresConfirmation) return { ok: true, accepted: null };
  var conf = confirmation && typeof confirmation === 'object' ? confirmation : {};
  var accepted = asString(conf.confirmationAcceptedFingerprint);
  if (!accepted) {
    return { ok: false, reason: 'confirmation_required' };
  }
  if (accepted !== asString(identity.confirmationFingerprint)) {
    return { ok: false, reason: 'confirmation_fingerprint_conflict' };
  }
  return { ok: true, accepted: accepted };
}

function createSeriesLiveMutationJournal(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.getItem !== 'function' || typeof storageAdapter.setItem !== 'function') {
    throw new Error('series_live_mutation_journal_adapter_required');
  }

  function readMap() {
    var res = unwrapGet(storageAdapter.getItem(STORAGE_KEY));
    if (!res.ok) {
      return { ok: false, reason: res.reason || 'journal_read_failed', map: null };
    }
    var raw = res.value;
    if (raw == null) return { ok: true, map: {} };
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, reason: 'journal_corrupted', map: null };
    }
    return { ok: true, map: raw };
  }

  function writeMap(map) {
    var res = unwrapSet(storageAdapter.setItem(STORAGE_KEY, map && typeof map === 'object' ? map : {}));
    if (!res.ok) {
      return { ok: false, reason: res.reason || 'journal_write_failed' };
    }
    return { ok: true };
  }

  function loadBucket(planKey) {
    var key = asString(planKey);
    if (!key) return { ok: false, reason: 'plan_key_required' };
    var read = readMap();
    if (!read.ok) return { ok: false, reason: read.reason };
    if (!Object.prototype.hasOwnProperty.call(read.map, key)) {
      return { ok: true, absent: true, map: read.map, bucket: null, journal: null };
    }
    var raw = read.map[key];
    var bucket = normalizeBucket(raw, key);
    if (!bucket || !isValidJournal(bucket.current)) {
      return { ok: false, reason: 'journal_corrupted', map: read.map, raw: raw };
    }
    return { ok: true, map: read.map, bucket: bucket, journal: bucket.current, storedRaw: raw };
  }

  function persistBucket(map, planKey, bucket) {
    var next = {};
    Object.keys(map).forEach(function (k) {
      next[k] = map[k];
    });
    next[planKey] = {
      current: deepClone(bucket.current),
      history: Array.isArray(bucket.history) ? deepClone(bucket.history) : []
    };
    var wrote = writeMap(next);
    if (!wrote.ok) return { ok: false, reason: wrote.reason };
    return { ok: true, journal: deepClone(bucket.current), bucket: next[planKey] };
  }

  function getJournal(planKey) {
    var loaded = loadBucket(planKey);
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    if (loaded.absent) return { ok: true, reason: 'absent', journal: null };
    return { ok: true, journal: deepClone(loaded.journal) };
  }

  function getJournalByAttemptKey(journalAttemptKey) {
    var want = asString(journalAttemptKey);
    if (!want) return { ok: false, reason: 'journal_attempt_key_required', journal: null };
    var read = readMap();
    if (!read.ok) return { ok: false, reason: read.reason, journal: null };
    var keys = Object.keys(read.map);
    for (var i = 0; i < keys.length; i++) {
      var bucket = normalizeBucket(read.map[keys[i]], keys[i]);
      if (!bucket) continue;
      if (bucket.current && asString(bucket.current.journalAttemptKey) === want) {
        return { ok: true, journal: deepClone(bucket.current) };
      }
      var hist = bucket.history || [];
      for (var h = 0; h < hist.length; h++) {
        if (hist[h] && asString(hist[h].journalAttemptKey) === want) {
          return { ok: true, journal: deepClone(hist[h]), historical: true };
        }
      }
    }
    return { ok: true, reason: 'absent', journal: null };
  }

  function listUnfinishedJournals() {
    var read = readMap();
    if (!read.ok) return { ok: false, reason: read.reason, journals: [] };
    var out = [];
    Object.keys(read.map).forEach(function (k) {
      var raw = read.map[k];
      var bucket = normalizeBucket(raw, k);
      if (!bucket || !isValidJournal(bucket.current)) {
        out.push({
          planKey: k,
          phase: PHASE.manual_review,
          corrupted: true
        });
        return;
      }
      var row = bucket.current;
      if (row.phase === PHASE.committed || row.phase === PHASE.rolled_back) return;
      out.push(deepClone(row));
    });
    return { ok: true, journals: out };
  }

  function buildCandidate(src, identity, kinds, requiresRoster, conf, attemptNumber) {
    var beforeStation = freezeStation(src.before && src.before.station);
    var afterStation = freezeStation(src.expectedAfter && src.expectedAfter.station);
    var beforeRoster = requiresRoster ? freezeRoster(src.before && src.before.roster) : undefined;
    var afterRoster = requiresRoster ? freezeRoster(src.expectedAfter && src.expectedAfter.roster) : undefined;
    if (requiresRoster && (beforeRoster == null || afterRoster == null)) {
      return { ok: false, reason: 'roster_snapshot_required' };
    }
    if (requiresRoster && (!asString(beforeRoster.rosterEntryId) || !asString(afterRoster.rosterEntryId))) {
      return { ok: false, reason: 'roster_entry_id_required' };
    }
    var fps = {
      plan: fingerprintOf(planFingerprintSource(identity, kinds, requiresRoster, conf.accepted)),
      stationBefore: fingerprintOf(beforeStation),
      stationAfter: fingerprintOf(afterStation)
    };
    if (requiresRoster) {
      fps.rosterBefore = fingerprintOf(beforeRoster);
      fps.rosterAfter = fingerprintOf(afterRoster);
    }
    var beforeBundle = { station: beforeStation };
    var afterBundle = { station: afterStation };
    if (requiresRoster) {
      beforeBundle.roster = beforeRoster;
      afterBundle.roster = afterRoster;
    }
    var n = Number(attemptNumber);
    if (!isFinite(n) || n < 1) n = 1;
    var candidate = {
      journalVersion: JOURNAL_VERSION,
      planKey: identity.planKey,
      attemptNumber: n,
      journalAttemptKey: attemptKeyOf(identity.planKey, n),
      seriesId: identity.seriesId,
      roundId: identity.roundId,
      matchId: identity.matchId,
      groupId: identity.groupId,
      position: identity.position,
      publishToken: identity.publishToken,
      action: identity.action,
      incomingUserId: identity.incomingUserId,
      outgoingUserId: identity.outgoingUserId,
      targetAffiliationId: identity.targetAffiliationId,
      requiresConfirmation: identity.requiresConfirmation,
      confirmationFingerprint: identity.confirmationFingerprint,
      confirmationAcceptedFingerprint: conf.accepted,
      phase: PHASE.prepared,
      operationKinds: kinds,
      requiresRosterMutation: requiresRoster,
      before: beforeBundle,
      expectedAfter: afterBundle,
      fingerprints: fps,
      phasePayloadFingerprint: fingerprintOf({ failure: null, recovery: null })
    };
    return { ok: true, candidate: candidate };
  }

  function parsePrepareSource(input) {
    var src = input && typeof input === 'object' ? input : {};
    var plan = src.plan && typeof src.plan === 'object' ? src.plan : {};
    var identity = pickIdentity(plan);
    if (!identity.planKey) {
      return { ok: false, reason: 'plan_key_required' };
    }
    var kinds = operationKindsOf(plan);
    var requiresRoster = requiresRosterOf(plan, kinds);
    var conf = assertConfirmation(identity, src.confirmation);
    if (!conf.ok) return { ok: false, reason: conf.reason };
    return { ok: true, src: src, identity: identity, kinds: kinds, requiresRoster: requiresRoster, conf: conf };
  }

  function prepareJournal(input) {
    var parsed = parsePrepareSource(input);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };

    var loaded = loadBucket(parsed.identity.planKey);
    if (!loaded.ok) {
      if (loaded.reason === 'journal_corrupted') {
        return { ok: false, reason: 'journal_corrupted' };
      }
      return { ok: false, reason: loaded.reason };
    }

    var built = buildCandidate(parsed.src, parsed.identity, parsed.kinds, parsed.requiresRoster, parsed.conf, 1);
    if (!built.ok) return { ok: false, reason: built.reason };
    var candidate = built.candidate;

    if (!loaded.absent) {
      var existing = loaded.journal;
      if (existing.phase === PHASE.manual_review) {
        return { ok: false, reason: 'journal_manual_review', journal: deepClone(existing) };
      }
      if (existing.phase === PHASE.rolled_back) {
        return { ok: false, reason: 'journal_already_rolled_back', journal: deepClone(existing) };
      }
      candidate.attemptNumber = existing.attemptNumber;
      candidate.journalAttemptKey = existing.journalAttemptKey;
      var sameImmutable = immutableFingerprint(existing) === immutableFingerprint(candidate);
      if (!sameImmutable) {
        return { ok: false, reason: 'journal_plan_conflict', journal: deepClone(existing) };
      }
      if (existing.phase === PHASE.committed) {
        if (existing.fingerprints.stationAfter === candidate.fingerprints.stationAfter) {
          return { ok: true, idempotent: true, alreadyCommitted: true, journal: deepClone(existing) };
        }
        return { ok: false, reason: 'journal_plan_conflict', journal: deepClone(existing) };
      }
      return { ok: true, idempotent: true, journal: deepClone(existing) };
    }

    var stamp = nowIso();
    candidate.createdAt = stamp;
    candidate.updatedAt = stamp;
    var saved = persistBucket(loaded.map, parsed.identity.planKey, { current: candidate, history: [] });
    if (!saved.ok) return { ok: false, reason: saved.reason };
    return { ok: true, idempotent: false, journal: saved.journal };
  }

  function prepareNextAttemptAfterRollback(input) {
    var parsed = parsePrepareSource(input);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    var src = parsed.src;
    if (recoveryClassificationOf(src) !== RECOVERY_IDEMPOTENT_ROLLED_BACK) {
      return { ok: false, reason: 'new_attempt_requires_all_before' };
    }

    var loaded = loadBucket(parsed.identity.planKey);
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    if (loaded.absent) return { ok: false, reason: 'journal_missing' };
    var existing = loaded.journal;
    if (existing.phase === PHASE.committed) {
      return { ok: false, reason: 'journal_committed', journal: deepClone(existing) };
    }
    if (existing.phase === PHASE.manual_review) {
      return { ok: false, reason: 'journal_manual_review', journal: deepClone(existing) };
    }
    if (existing.phase !== PHASE.rolled_back) {
      return { ok: false, reason: 'journal_not_rolled_back', journal: deepClone(existing) };
    }

    var nextNo = maxAttemptNumber(loaded.bucket) + 1;
    var built = buildCandidate(
      src,
      parsed.identity,
      parsed.kinds,
      parsed.requiresRoster,
      parsed.conf,
      nextNo
    );
    if (!built.ok) return { ok: false, reason: built.reason };
    var candidate = built.candidate;
    if (asString(existing.fingerprints && existing.fingerprints.plan) !== asString(candidate.fingerprints.plan)) {
      return { ok: false, reason: 'journal_plan_conflict', journal: deepClone(existing) };
    }
    if (
      asString(candidate.matchId) !== asString(candidate.before.station.matchId) ||
      asString(candidate.groupId) !== asString(candidate.before.station.groupId) ||
      Number(candidate.position) !== Number(candidate.before.station.position)
    ) {
      return { ok: false, reason: 'journal_plan_conflict', journal: deepClone(existing) };
    }

    var history = Array.isArray(loaded.bucket.history) ? loaded.bucket.history.slice() : [];
    history.push(deepClone(existing));
    var stamp = nowIso();
    candidate.createdAt = stamp;
    candidate.updatedAt = stamp;
    var saved = persistBucket(loaded.map, parsed.identity.planKey, { current: candidate, history: history });
    if (!saved.ok) return { ok: false, reason: saved.reason };
    return { ok: true, idempotent: false, journal: saved.journal };
  }

  function transitionJournal(planKey, expectedPhase, nextPhase, patch, journalAttemptKey) {
    var loaded = loadBucket(planKey);
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    if (loaded.absent) return { ok: false, reason: 'journal_missing' };
    var current = loaded.journal;
    var expect = asString(expectedPhase);
    var next = asString(nextPhase);
    var guard = assertNoImmutablePatch(patch);
    if (!guard.ok) return { ok: false, reason: guard.reason, journal: deepClone(current) };

    var wantAttempt = asString(journalAttemptKey);
    if (wantAttempt && wantAttempt !== asString(current.journalAttemptKey)) {
      return { ok: false, reason: 'journal_historical_attempt', journal: deepClone(current) };
    }

    if (current.phase !== expect) {
      return { ok: false, reason: 'journal_phase_conflict', journal: deepClone(current) };
    }

    var payloadFp = patchPayloadFingerprint(patch);
    if (next === current.phase) {
      if (payloadFp === asString(current.phasePayloadFingerprint)) {
        return { ok: true, idempotent: true, journal: deepClone(current) };
      }
      return { ok: false, reason: 'journal_payload_conflict', journal: deepClone(current) };
    }

    if (TERMINAL[current.phase]) {
      return { ok: false, reason: 'journal_terminal', journal: deepClone(current) };
    }
    if (current.phase === PHASE.manual_review) {
      return { ok: false, reason: 'journal_manual_review', journal: deepClone(current) };
    }
    if (!canTransition(current.phase, next, !!current.requiresRosterMutation)) {
      return { ok: false, reason: 'journal_illegal_transition', journal: deepClone(current) };
    }

    var updated = deepClone(current);
    updated.phase = next;
    updated.updatedAt = nowIso();
    updated.phasePayloadFingerprint = payloadFp;
    if (patch && patch.failure != null) updated.failure = deepClone(patch.failure);
    if (patch && patch.recovery != null) updated.recovery = deepClone(patch.recovery);
    if (next === PHASE.committed) updated.committedAt = updated.updatedAt;
    if (next === PHASE.rolled_back) updated.rolledBackAt = updated.updatedAt;

    var saved = persistBucket(loaded.map, current.planKey, {
      current: updated,
      history: loaded.bucket.history || []
    });
    if (!saved.ok) return { ok: false, reason: saved.reason };
    return { ok: true, idempotent: false, journal: saved.journal };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    prepareJournal: prepareJournal,
    prepareNextAttemptAfterRollback: prepareNextAttemptAfterRollback,
    transitionJournal: transitionJournal,
    getJournal: getJournal,
    getJournalByAttemptKey: getJournalByAttemptKey,
    listUnfinishedJournals: listUnfinishedJournals
  };
}

var defaultJournal = createSeriesLiveMutationJournal(createWxStorageAdapter());

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  JOURNAL_VERSION: JOURNAL_VERSION,
  PHASE: PHASE,
  IMMUTABLE_KEYS: IMMUTABLE_KEYS,
  RECOVERY_IDEMPOTENT_ROLLED_BACK: RECOVERY_IDEMPOTENT_ROLLED_BACK,
  createSeriesLiveMutationJournal: createSeriesLiveMutationJournal,
  createWxStorageAdapter: createWxStorageAdapter,
  freezeStation: freezeStation,
  freezeRoster: freezeRoster,
  fingerprintOf: fingerprintOf,
  attemptKeyOf: attemptKeyOf,
  prepareJournal: function (input) {
    return defaultJournal.prepareJournal(input);
  },
  prepareNextAttemptAfterRollback: function (input) {
    return defaultJournal.prepareNextAttemptAfterRollback(input);
  },
  transitionJournal: function (planKey, expectedPhase, nextPhase, patch, journalAttemptKey) {
    return defaultJournal.transitionJournal(planKey, expectedPhase, nextPhase, patch, journalAttemptKey);
  },
  getJournal: function (planKey) {
    return defaultJournal.getJournal(planKey);
  },
  getJournalByAttemptKey: function (journalAttemptKey) {
    return defaultJournal.getJournalByAttemptKey(journalAttemptKey);
  },
  listUnfinishedJournals: function () {
    return defaultJournal.listUnfinishedJournals();
  }
};
