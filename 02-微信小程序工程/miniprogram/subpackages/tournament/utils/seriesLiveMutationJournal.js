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
  manual_review: 'manual_review',
  match_written: 'match_written',
  series_written: 'series_written',
  rollback_failed: 'rollback_failed',
  recovery_conflict: 'recovery_conflict',
  recovered: 'recovered',
  conflict_resolved: 'conflict_resolved',
  corrupted_discarded: 'corrupted_discarded'
};

var JOURNAL_MAX_BYTES = 900 * 1024;

var TERMINAL = {};
TERMINAL[PHASE.committed] = true;
TERMINAL[PHASE.rolled_back] = true;
TERMINAL[PHASE.recovered] = true;
TERMINAL[PHASE.conflict_resolved] = true;
TERMINAL[PHASE.corrupted_discarded] = true;

var BATCH_PRUNABLE_PHASE = {};
BATCH_PRUNABLE_PHASE[PHASE.committed] = true;
BATCH_PRUNABLE_PHASE[PHASE.rolled_back] = true;
BATCH_PRUNABLE_PHASE[PHASE.recovered] = true;
BATCH_PRUNABLE_PHASE[PHASE.conflict_resolved] = true;

var BATCH_BLOCKING_PHASE = {};
BATCH_BLOCKING_PHASE[PHASE.prepared] = true;
BATCH_BLOCKING_PHASE[PHASE.match_written] = true;
BATCH_BLOCKING_PHASE[PHASE.series_written] = true;
BATCH_BLOCKING_PHASE[PHASE.rollback_failed] = true;
BATCH_BLOCKING_PHASE[PHASE.recovery_conflict] = true;

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
var RESOLUTION_CURRENT_PERSISTED_STATE_WINS = 'current_persisted_state_wins';
var QUARANTINE_MAP_KEY = '__gb_journal_quarantine__';

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

function isReservedMapKey(k) {
  return asString(k) === QUARANTINE_MAP_KEY;
}

function diagnoseRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'current_not_object';
  if (Number(row.journalVersion) !== JOURNAL_VERSION) return 'journal_version_invalid';
  if (!asString(row.planKey)) return 'plan_key_missing';
  if (!asString(row.phase)) return 'phase_missing';
  if (!row.fingerprints || typeof row.fingerprints !== 'object') return 'fingerprints_missing';
  return '';
}

function diagnoseCorruption(raw) {
  if (raw == null) return 'record_null';
  if (Array.isArray(raw)) return 'record_is_array';
  if (typeof raw !== 'object') return 'record_not_object';
  if (isBucket(raw)) {
    return diagnoseRow(raw.current) || 'bucket_current_invalid';
  }
  return diagnoseRow(raw) || 'unrecognized_shape';
}

function isCorruptedDiscarded(row) {
  return !!(row && asString(row.phase) === PHASE.corrupted_discarded);
}

function buildDiscardedRecord(planKey, raw, corruptionCode) {
  var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  var cur = src.current && typeof src.current === 'object' && !Array.isArray(src.current) ? src.current : src;
  return {
    journalVersion: JOURNAL_VERSION,
    planKey: asString(planKey),
    phase: PHASE.corrupted_discarded,
    resolution: RESOLUTION_CURRENT_PERSISTED_STATE_WINS,
    mutationKind: asString(cur && cur.mutationKind),
    batchId: asString(cur && cur.batchId),
    fingerprints: {},
    corruptionCode: asString(corruptionCode) || 'unrecognized_shape',
    resolvedAt: nowIso(),
    replayForbidden: true,
    attemptNumber: 1,
    journalAttemptKey: attemptKeyOf(planKey, 1)
  };
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

function allowedBatchNextPhases(phase) {
  var next = [];
  if (phase === PHASE.prepared) {
    next.push(
      PHASE.match_written,
      PHASE.rolled_back,
      PHASE.recovered,
      PHASE.rollback_failed,
      PHASE.recovery_conflict
    );
  }
  if (phase === PHASE.match_written) {
    next.push(
      PHASE.series_written,
      PHASE.rolled_back,
      PHASE.recovered,
      PHASE.rollback_failed,
      PHASE.recovery_conflict
    );
  }
  if (phase === PHASE.series_written) {
    next.push(
      PHASE.committed,
      PHASE.rolled_back,
      PHASE.recovered,
      PHASE.rollback_failed,
      PHASE.recovery_conflict
    );
  }
  if (phase === PHASE.rollback_failed) {
    next.push(PHASE.rolled_back, PHASE.recovered, PHASE.rollback_failed, PHASE.recovery_conflict);
  }
  if (phase === PHASE.recovery_conflict) {
    next.push(PHASE.conflict_resolved);
  }
  return next;
}

function canTransition(from, to, requiresRoster, record) {
  if (from === to) return true;
  if (record && asString(record.mutationKind) === 'batch') {
    var batchAllowed = allowedBatchNextPhases(from);
    for (var b = 0; b < batchAllowed.length; b++) {
      if (batchAllowed[b] === to) return true;
    }
    return false;
  }
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
      var rebuilt = {};
      rebuilt[QUARANTINE_MAP_KEY] = {
        current: {
          journalVersion: JOURNAL_VERSION,
          planKey: QUARANTINE_MAP_KEY,
          phase: PHASE.corrupted_discarded,
          resolution: RESOLUTION_CURRENT_PERSISTED_STATE_WINS,
          fingerprints: {},
          corruptionCode: Array.isArray(raw) ? 'bucket_not_object_array' : 'bucket_not_object',
          resolvedAt: nowIso(),
          replayForbidden: true,
          rawType: Array.isArray(raw) ? 'array' : typeof raw
        },
        history: []
      };
      var wrote = writeMap(rebuilt);
      if (!wrote.ok) return { ok: false, reason: wrote.reason || 'journal_write_failed', map: null };
      return { ok: true, map: rebuilt, rebuilt: true };
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

  function isolateCorruptedKey(map, planKey, raw, code) {
    var discarded = buildDiscardedRecord(planKey, raw, code);
    var saved = persistBucket(map, planKey, { current: discarded, history: [] });
    if (saved.ok) {
      var nextMap = {};
      Object.keys(map || {}).forEach(function (k) {
        nextMap[k] = map[k];
      });
      nextMap[planKey] = saved.bucket;
      return {
        ok: true,
        map: nextMap,
        bucket: saved.bucket,
        journal: saved.journal,
        discarded: true
      };
    }
    var next = {};
    Object.keys(map || {}).forEach(function (k) {
      if (k !== planKey) next[k] = map[k];
    });
    var wrote = writeMap(next);
    if (!wrote.ok) {
      return { ok: false, reason: wrote.reason || 'journal_write_failed' };
    }
    return { ok: true, dropped: true, absent: true, map: next, bucket: null, journal: null, discarded: true };
  }

  function loadBucket(planKey) {
    var key = asString(planKey);
    if (!key || isReservedMapKey(key)) return { ok: false, reason: 'plan_key_required' };
    var read = readMap();
    if (!read.ok) return { ok: false, reason: read.reason };
    if (!Object.prototype.hasOwnProperty.call(read.map, key)) {
      return { ok: true, absent: true, map: read.map, bucket: null, journal: null };
    }
    var raw = read.map[key];
    var bucket = normalizeBucket(raw, key);
    if (!bucket || !isValidJournal(bucket.current)) {
      return isolateCorruptedKey(read.map, key, raw, diagnoseCorruption(raw));
    }
    return { ok: true, map: read.map, bucket: bucket, journal: bucket.current, storedRaw: raw };
  }

  function persistBucket(map, planKey, bucket) {
    var next = {};
    Object.keys(map).forEach(function (k) {
      next[k] = map[k];
    });
    try {
      next[planKey] = {
        current: deepClone(bucket.current),
        history: Array.isArray(bucket.history) ? deepClone(bucket.history) : []
      };
    } catch (eClone) {
      return { ok: false, reason: 'journal_serialize_failed' };
    }
    var serialized;
    try {
      serialized = JSON.stringify(next);
    } catch (eSer) {
      return { ok: false, reason: 'journal_serialize_failed' };
    }
    if (typeof serialized !== 'string' || serialized.length > JOURNAL_MAX_BYTES) {
      return { ok: false, reason: 'journal_too_large' };
    }
    var wrote = writeMap(next);
    if (!wrote.ok) return { ok: false, reason: wrote.reason || 'journal_write_failed' };
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
      if (isReservedMapKey(keys[i])) continue;
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

  function discardedBatchIdSet(bucket) {
    var ids = Object.create(null);
    function add(row) {
      var id = asString(row && row.batchId);
      if (id && isCorruptedDiscarded(row)) ids[id] = true;
    }
    if (bucket && bucket.current) add(bucket.current);
    var hist = bucket && Array.isArray(bucket.history) ? bucket.history : [];
    for (var i = 0; i < hist.length; i++) add(hist[i]);
    return ids;
  }

  function listUnfinishedJournals() {
    var read = readMap();
    if (!read.ok) return { ok: false, reason: read.reason, journals: [] };
    var out = [];
    Object.keys(read.map).forEach(function (k) {
      if (isReservedMapKey(k)) return;
      var raw = read.map[k];
      var bucket = normalizeBucket(raw, k);
      if (!bucket || !isValidJournal(bucket.current)) {
        isolateCorruptedKey(read.map, k, raw, diagnoseCorruption(raw));
        return;
      }
      var row = bucket.current;
      if (TERMINAL[row.phase] || row.phase === PHASE.recovery_conflict) return;
      out.push(deepClone(row));
    });
    return { ok: true, journals: out };
  }

  function pruneTerminalBatchFromMap(map) {
    var next = {};
    Object.keys(map || {}).forEach(function (k) {
      if (isReservedMapKey(k)) {
        next[k] = map[k];
        return;
      }
      var bucket = normalizeBucket(map[k], k);
      if (
        bucket &&
        bucket.current &&
        asString(bucket.current.mutationKind) === 'batch' &&
        BATCH_PRUNABLE_PHASE[bucket.current.phase]
      ) {
        return;
      }
      next[k] = map[k];
    });
    return next;
  }

  function listBlockingBatchJournals(matchIdOrOpts) {
    var wantMatch = '';
    var wantSeries = '';
    if (matchIdOrOpts && typeof matchIdOrOpts === 'object') {
      wantMatch = asString(matchIdOrOpts.matchId);
      wantSeries = asString(matchIdOrOpts.seriesId);
    } else {
      wantMatch = asString(matchIdOrOpts);
    }
    var read = readMap();
    if (!read.ok) return { ok: false, reason: read.reason, journals: [] };
    var out = [];
    Object.keys(read.map).forEach(function (k) {
      if (isReservedMapKey(k)) return;
      var bucket = normalizeBucket(read.map[k], k);
      if (!bucket || !isValidJournal(bucket.current)) return;
      var row = bucket.current;
      if (asString(row.mutationKind) !== 'batch') return;
      if (wantMatch && asString(row.matchId) !== wantMatch) return;
      if (wantSeries && asString(row.seriesId) !== wantSeries) return;
      if (!BATCH_BLOCKING_PHASE[row.phase]) return;
      out.push(deepClone(row));
    });
    return { ok: true, journals: out };
  }

  function estimateMapBytes(map) {
    try {
      return JSON.stringify(map || {}).length;
    } catch (e) {
      return -1;
    }
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
      return { ok: false, reason: loaded.reason };
    }

    var built = buildCandidate(parsed.src, parsed.identity, parsed.kinds, parsed.requiresRoster, parsed.conf, 1);
    if (!built.ok) return { ok: false, reason: built.reason };
    var candidate = built.candidate;

    if (!loaded.absent && loaded.journal && isCorruptedDiscarded(loaded.journal)) {
      var discardedHistory = (loaded.bucket && loaded.bucket.history ? loaded.bucket.history : []).slice();
      discardedHistory.push(deepClone(loaded.journal));
      var stampDiscard = nowIso();
      candidate.createdAt = stampDiscard;
      candidate.updatedAt = stampDiscard;
      var savedDiscard = persistBucket(loaded.map, parsed.identity.planKey, {
        current: candidate,
        history: discardedHistory
      });
      if (!savedDiscard.ok) return { ok: false, reason: savedDiscard.reason };
      return { ok: true, idempotent: false, journal: savedDiscard.journal, replacedDiscarded: true };
    }

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
    if (!canTransition(current.phase, next, !!current.requiresRosterMutation, current)) {
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

  function buildBatchJournalCandidate(src, phase, stamp) {
    var planKey = asString(src.planKey);
    var identity = src.identity && typeof src.identity === 'object' ? src.identity : {};
    return {
      journalVersion: JOURNAL_VERSION,
      mutationKind: 'batch',
      batchId: asString(src.batchId) || planKey,
      planKey: planKey,
      attemptNumber: 1,
      journalAttemptKey: attemptKeyOf(planKey, 1),
      identity: {
        seriesId: asString(identity.seriesId) || asString(src.seriesId),
        roundId: asString(identity.roundId) || asString(src.roundId),
        matchId: asString(identity.matchId) || asString(src.matchId),
        publishToken: asString(identity.publishToken) || asString(src.publishToken)
      },
      seriesId: asString(identity.seriesId) || asString(src.seriesId),
      roundId: asString(identity.roundId) || asString(src.roundId),
      matchId: asString(identity.matchId) || asString(src.matchId),
      groupId: '*',
      position: 0,
      publishToken: asString(identity.publishToken) || asString(src.publishToken),
      action: 'batch_replace',
      incomingUserId: asString(src.incomingUserId),
      outgoingUserId: asString(src.outgoingUserId),
      targetAffiliationId: '',
      requiresConfirmation: false,
      confirmationFingerprint: null,
      confirmationAcceptedFingerprint: null,
      phase: phase,
      operationKinds: ['batch_station_persist'],
      requiresRosterMutation: !!src.requiresRosterMutation,
      replacements: Array.isArray(src.replacements) ? deepClone(src.replacements) : [],
      rearrangements: Array.isArray(src.rearrangements) ? deepClone(src.rearrangements) : [],
      rosterAffiliationChanges: Array.isArray(src.rosterAffiliationChanges)
        ? deepClone(src.rosterAffiliationChanges)
        : [],
      before: src.before != null ? deepClone(src.before) : {},
      expectedAfter: src.expectedAfter != null ? deepClone(src.expectedAfter) : {},
      fingerprints: src.fingerprints && typeof src.fingerprints === 'object' ? deepClone(src.fingerprints) : {},
      phasePayloadFingerprint: fingerprintOf({ failure: null, recovery: null }),
      createdAt: stamp,
      updatedAt: stamp
    };
  }

  function writePreparedBatchJournal(input) {
    var src = input && typeof input === 'object' ? input : {};
    var planKey = asString(src.planKey);
    if (!planKey) return { ok: false, reason: 'plan_key_required' };
    var loaded = loadBucket(planKey);
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    if (!loaded.absent && loaded.journal) {
      var existing = loaded.journal;
      var replayIds = discardedBatchIdSet(loaded.bucket);
      if (asString(src.batchId) && replayIds[asString(src.batchId)]) {
        return { ok: false, reason: 'journal_replay_forbidden', journal: deepClone(existing) };
      }
      if (existing.phase === PHASE.manual_review) {
        return { ok: false, reason: 'journal_manual_review', journal: deepClone(existing) };
      }
      if (existing.phase === PHASE.committed) {
        return { ok: true, alreadyCommitted: true, journal: deepClone(existing) };
      }
      if (existing.phase === PHASE.conflict_resolved) {
        return { ok: false, reason: 'batch_superseded', journal: deepClone(existing) };
      }
      if (existing.phase === PHASE.recovery_conflict) {
        return { ok: false, reason: 'recovery_conflict', journal: deepClone(existing) };
      }
      if (existing.phase === PHASE.rollback_failed) {
        return { ok: false, reason: 'journal_incomplete', journal: deepClone(existing) };
      }
      if (isCorruptedDiscarded(existing)) {
        existing = null;
      } else if (
        existing.phase !== PHASE.rolled_back &&
        existing.phase !== PHASE.recovered &&
        asString(existing.mutationKind) === 'batch'
      ) {
        return { ok: false, reason: 'journal_incomplete', journal: deepClone(existing) };
      }
    }
    var matchId = asString(src.matchId) || asString(src.identity && src.identity.matchId);
    if (matchId) {
      var blocking = listBlockingBatchJournals(matchId);
      if (blocking.ok) {
        for (var bi = 0; bi < blocking.journals.length; bi++) {
          if (asString(blocking.journals[bi].planKey) === planKey) continue;
          return {
            ok: false,
            reason:
              blocking.journals[bi].phase === PHASE.recovery_conflict
                ? 'recovery_conflict'
                : 'incomplete_batch_exists',
            journal: blocking.journals[bi]
          };
        }
      }
    }
    var stamp = nowIso();
    var candidate;
    try {
      candidate = buildBatchJournalCandidate(src, PHASE.prepared, stamp);
    } catch (eBuild) {
      return { ok: false, reason: 'journal_serialize_failed' };
    }
    var history = [];
    if (!loaded.absent) {
      history = (loaded.bucket.history || []).slice();
      if (loaded.journal) history.push(deepClone(loaded.journal));
    }
    var map = pruneTerminalBatchFromMap(loaded.map);
    var saved = persistBucket(map, planKey, { current: candidate, history: history });
    if (!saved.ok && (saved.reason === 'journal_too_large' || saved.reason === 'journal_serialize_failed')) {
      return { ok: false, reason: saved.reason };
    }
    if (!saved.ok) return { ok: false, reason: saved.reason };
    return { ok: true, journal: saved.journal, prunedTerminal: Object.keys(loaded.map).length !== Object.keys(map).length };
  }

  function writeCommittedBatchJournal(input) {
    var prepared = writePreparedBatchJournal(input);
    if (!prepared.ok) return prepared;
    if (prepared.alreadyCommitted) return prepared;
    var stepped = transitionJournal(prepared.journal.planKey, PHASE.prepared, PHASE.match_written, null);
    if (!stepped.ok) return stepped;
    stepped = transitionJournal(planKeyOf(prepared), PHASE.match_written, PHASE.series_written, null);
    if (!stepped.ok) return stepped;
    stepped = transitionJournal(planKeyOf(prepared), PHASE.series_written, PHASE.committed, null);
    if (!stepped.ok) return stepped;
    return { ok: true, journal: stepped.journal };
  }

  function planKeyOf(res) {
    return res && res.journal && res.journal.planKey;
  }

  function markBatchRolledBack(planKey, terminalPhase) {
    var loaded = loadBucket(planKey);
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    if (loaded.absent) return { ok: false, reason: 'journal_missing' };
    var current = deepClone(loaded.journal);
    if (asString(current.mutationKind) !== 'batch') {
      return { ok: false, reason: 'not_batch_journal', journal: current };
    }
    var next = asString(terminalPhase) || PHASE.rolled_back;
    if (next !== PHASE.rolled_back && next !== PHASE.recovered) next = PHASE.rolled_back;
    current.phase = next;
    current.updatedAt = nowIso();
    current.rolledBackAt = current.updatedAt;
    var saved = persistBucket(loaded.map, current.planKey, {
      current: current,
      history: loaded.bucket.history || []
    });
    if (!saved.ok) return { ok: false, reason: saved.reason };
    return { ok: true, journal: saved.journal };
  }

  function markBatchConflictResolved(planKey, resolution) {
    var loaded = loadBucket(planKey);
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    if (loaded.absent) return { ok: false, reason: 'journal_missing' };
    var current = deepClone(loaded.journal);
    if (asString(current.mutationKind) !== 'batch') {
      return { ok: false, reason: 'not_batch_journal', journal: current };
    }
    if (current.phase === PHASE.conflict_resolved) {
      return { ok: true, idempotent: true, journal: current };
    }
    if (current.phase !== PHASE.recovery_conflict) {
      return { ok: false, reason: 'journal_phase_conflict', journal: current };
    }
    current.phase = PHASE.conflict_resolved;
    current.updatedAt = nowIso();
    current.resolvedAt = current.updatedAt;
    current.resolvedBy = asString(resolution && resolution.resolvedBy);
    current.resolution = asString(resolution && (resolution.kind || resolution.resolution)) || 'latest_persisted_state_wins';
    current.resolutionMeta = resolution && typeof resolution === 'object' ? deepClone(resolution) : {};
    var saved = persistBucket(loaded.map, current.planKey, {
      current: current,
      history: loaded.bucket.history || []
    });
    if (!saved.ok) return { ok: false, reason: saved.reason };
    return { ok: true, journal: saved.journal };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    prepareJournal: prepareJournal,
    prepareNextAttemptAfterRollback: prepareNextAttemptAfterRollback,
    transitionJournal: transitionJournal,
    writePreparedBatchJournal: writePreparedBatchJournal,
    writeCommittedBatchJournal: writeCommittedBatchJournal,
    markBatchRolledBack: markBatchRolledBack,
    markBatchConflictResolved: markBatchConflictResolved,
    getJournal: getJournal,
    getJournalByAttemptKey: getJournalByAttemptKey,
    listUnfinishedJournals: listUnfinishedJournals,
    listBlockingBatchJournals: listBlockingBatchJournals,
    pruneTerminalBatchFromMap: pruneTerminalBatchFromMap,
    estimateMapBytes: estimateMapBytes
  };
}

var defaultJournal = createSeriesLiveMutationJournal(createWxStorageAdapter());

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  JOURNAL_VERSION: JOURNAL_VERSION,
  JOURNAL_MAX_BYTES: JOURNAL_MAX_BYTES,
  PHASE: PHASE,
  RESOLUTION_CURRENT_PERSISTED_STATE_WINS: RESOLUTION_CURRENT_PERSISTED_STATE_WINS,
  QUARANTINE_MAP_KEY: QUARANTINE_MAP_KEY,
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
  writePreparedBatchJournal: function (input) {
    return defaultJournal.writePreparedBatchJournal(input);
  },
  writeCommittedBatchJournal: function (input) {
    return defaultJournal.writeCommittedBatchJournal(input);
  },
  markBatchRolledBack: function (planKey, terminalPhase) {
    return defaultJournal.markBatchRolledBack(planKey, terminalPhase);
  },
  markBatchConflictResolved: function (planKey, resolution) {
    return defaultJournal.markBatchConflictResolved(planKey, resolution);
  },
  listUnfinishedJournals: function () {
    return defaultJournal.listUnfinishedJournals();
  },
  listBlockingBatchJournals: function (matchId) {
    return defaultJournal.listBlockingBatchJournals(matchId);
  },
  JOURNAL_MAX_BYTES: JOURNAL_MAX_BYTES
};
