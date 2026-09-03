/**
 * 本机 SideGameRepository。仅此文件读写 gb_side_games_v1。
 */
var rec = require('./sideGameRecord.js');
var catalog = require('./catalog.js');
var identity = require('./sideGameIdentityProvider.js');
var entitlement = require('./sideGameEntitlementProvider.js');
var engine = require('./sideGameEngine.js');
var hostMod = require('./gameHostContext.js');
var settleCore = require('./settleCore.js');
var settleMatch2 = require('./settleMatch2.js');
var settleStroke2 = require('./settleStroke2.js');

var STORAGE_KEY = 'gb_side_games_v1';

function envelope(ok, reason, data, revision) {
  return {
    ok: !!ok,
    reason: rec.asString(reason),
    data: data == null ? null : data,
    revision: revision == null ? 0 : Number(revision) || 0
  };
}

function wxStorageAdapter() {
  return {
    getItem: function (key) {
      try {
        return wx.getStorageSync(key);
      } catch (e) {
        return { __fail: true };
      }
    },
    setItem: function (key, value) {
      try {
        wx.setStorageSync(key, value);
        return true;
      } catch (e) {
        return false;
      }
    }
  };
}

function newSideGameId() {
  return 'sg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function createLocalSideGameRepository(deps) {
  var d = deps || {};
  var storage = d.storage || wxStorageAdapter();
  var idGen = d.idGen || newSideGameId;
  var clock = d.clock || rec.nowMs;
  var listeners = [];

  function readAll() {
    var raw = storage.getItem(STORAGE_KEY);
    if (raw && raw.__fail) return { ok: false, reason: 'storage_read_failed', list: [] };
    var list = Array.isArray(raw) ? raw : [];
    return { ok: true, reason: '', list: list.map(rec.normalizeRecord) };
  }

  function writeAll(list) {
    var payload = rec.jsonClone(list || []);
    var ok = storage.setItem(STORAGE_KEY, payload);
    if (!ok) return false;
    return true;
  }

  function notify(event) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(event);
      } catch (e) {
        /* ignore */
      }
    });
  }

  function publicRecord(row) {
    return rec.jsonClone(rec.normalizeRecord(row));
  }

  function listVisible(query) {
    var q = query || {};
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, { items: [] }, 0);
    var viewer = rec.asString(q.viewerUserId) || identity.getCurrentUserId();
    var host = q.hostContext || null;
    var items = loaded.list.filter(function (row) {
      return rec.viewerCanSee(row, q, host, viewer);
    });
    return envelope(true, '', { items: items.map(publicRecord) }, 0);
  }

  function getById(sideGameId) {
    var id = rec.asString(sideGameId);
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var i;
    for (i = 0; i < loaded.list.length; i++) {
      if (loaded.list[i].sideGameId === id && loaded.list[i].status !== 'deleted') {
        return envelope(true, '', publicRecord(loaded.list[i]), loaded.list[i].revision);
      }
    }
    return envelope(false, 'not_found', null, 0);
  }

  function findByIdempotency(list, key) {
    var k = rec.asString(key);
    if (!k) return null;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].idempotencyKey === k && list[i].status !== 'deleted') return list[i];
    }
    return null;
  }

  function create(input) {
    var host = (input && input.hostContext) || null;
    var userId = identity.getCurrentUserId();
    var gate = entitlement.canCreate({ userId: userId, hostContext: host, input: input });
    if (!gate.ok) return envelope(false, gate.reason || 'no_entitlement', null, 0);
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var key = rec.asString(input && input.idempotencyKey);
    var existing = findByIdempotency(loaded.list, key);
    if (existing) {
      return envelope(true, '', publicRecord(existing), existing.revision);
    }
    var snapshot = rec.buildRuleSnapshot(input && input.ruleId);
    var merged = Object.assign({}, input || {}, {
      sideGameId: rec.asString(input && input.sideGameId) || idGen(),
      ruleSnapshot: rec.mergeRuleSnapshot(snapshot, input && input.ruleSnapshot),
      createdBy: userId,
      updatedBy: userId,
      createdAt: clock(),
      updatedAt: clock(),
      revision: 1,
      status: 'active',
      resultSnapshot: null,
      resultRevision: 0,
      hostRevisionAtSettle: ''
    });
    if (!merged.ruleSnapshot && !snapshot) {
      return envelope(false, 'unknown_rule', null, 0);
    }
    var checked = rec.validateCreateInput(merged, host);
    if (!checked.ok) return envelope(false, checked.reason, null, 0);
    var row = checked.record;
    row.sideGameId = rec.asString(merged.sideGameId);
    row.createdBy = userId;
    row.updatedBy = userId;
    row.createdAt = merged.createdAt;
    row.updatedAt = merged.updatedAt;
    row.revision = 1;
    row.idempotencyKey = key;
    var next = loaded.list.concat([row]);
    if (!writeAll(next)) return envelope(false, 'storage_write_failed', null, 0);
    notify({ type: 'create', sideGameId: row.sideGameId });
    return envelope(true, '', publicRecord(row), 1);
  }

  function update(sideGameId, expectedRevision, patch) {
    var id = rec.asString(sideGameId);
    var userId = identity.getCurrentUserId();
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var idx = -1;
    var i;
    for (i = 0; i < loaded.list.length; i++) {
      if (loaded.list[i].sideGameId === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0 || loaded.list[idx].status === 'deleted') {
      return envelope(false, 'not_found', null, 0);
    }
    var current = loaded.list[idx];
    var gate = entitlement.canUpdate({ userId: userId, record: current });
    if (!gate.ok) return envelope(false, gate.reason || 'no_entitlement', null, current.revision);
    var expect = Number(expectedRevision);
    if (expect !== current.revision) {
      return envelope(false, 'revision_conflict', publicRecord(current), current.revision);
    }
    var patchKey = rec.asString(patch && patch.idempotencyKey);
    if (patchKey && patchKey === current.idempotencyKey) {
      return envelope(true, '', publicRecord(current), current.revision);
    }
    var nextRuleId = rec.asString((patch && patch.ruleId) || current.ruleId);
    var nextSnap = rec.mergeRuleSnapshot(
      rec.buildRuleSnapshot(nextRuleId),
      (patch && patch.ruleSnapshot) || current.ruleSnapshot || {}
    );
    if (
      catalog.isUnavailableRule(nextRuleId) ||
      catalog.isUnavailableRule(nextSnap.catalogId) ||
      catalog.isUnavailableRule(current.ruleId)
    ) {
      return envelope(false, 'rule_unavailable', publicRecord(current), current.revision);
    }
    var nextRow = rec.normalizeRecord(Object.assign({}, current, patch || {}, {
      sideGameId: current.sideGameId,
      createdBy: current.createdBy,
      createdAt: current.createdAt,
      updatedBy: userId,
      updatedAt: clock(),
      revision: current.revision + 1,
      idempotencyKey: patchKey || current.idempotencyKey,
      ruleSnapshot: nextSnap
    }));
    if (nextRow.scope === 'match' && nextRow.visibility === 'group') {
      return envelope(false, 'invalid_visibility', publicRecord(current), current.revision);
    }
    var copy = loaded.list.slice();
    copy[idx] = nextRow;
    if (!writeAll(copy)) return envelope(false, 'storage_write_failed', publicRecord(current), current.revision);
    notify({ type: 'update', sideGameId: id });
    return envelope(true, '', publicRecord(nextRow), nextRow.revision);
  }

  function remove(sideGameId, expectedRevision) {
    var id = rec.asString(sideGameId);
    var userId = identity.getCurrentUserId();
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var idx = -1;
    var i;
    for (i = 0; i < loaded.list.length; i++) {
      if (loaded.list[i].sideGameId === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0 || loaded.list[idx].status === 'deleted') {
      return envelope(false, 'not_found', null, 0);
    }
    var current = loaded.list[idx];
    var gate = entitlement.canRemove({ userId: userId, record: current });
    if (!gate.ok) return envelope(false, gate.reason || 'no_entitlement', null, current.revision);
    if (Number(expectedRevision) !== current.revision) {
      return envelope(false, 'revision_conflict', publicRecord(current), current.revision);
    }
    var nextRow = rec.normalizeRecord(
      Object.assign({}, current, {
        status: 'deleted',
        deletedAt: clock(),
        updatedBy: userId,
        updatedAt: clock(),
        revision: current.revision + 1
      })
    );
    var copy = loaded.list.slice();
    copy[idx] = nextRow;
    if (!writeAll(copy)) return envelope(false, 'storage_write_failed', publicRecord(current), current.revision);
    notify({ type: 'remove', sideGameId: id });
    return envelope(true, '', { deleted: true, sideGameId: id }, nextRow.revision);
  }

  function settleRecord(row, host) {
    if (!host || !host.holeContextReady) {
      return { ok: false, reason: 'score_context_unavailable' };
    }
    var ids = (row.participantParties || []).map(function (p) {
      return p.partyId;
    });
    var absScores = hostMod.scoresToEngineFormat(host.officialScoresByPartyId, host.holeOrder);
    var scores = settleCore.scoresToRelative(absScores, host.pars, host.holeOrder);
    var inst = row.config && row.config.instance;
    var sideGame = inst && typeof inst === 'object'
      ? rec.jsonClone(inst)
      : {
          catalogId: row.ruleId,
          ruleId: row.ruleId,
          ruleSnapshot: row.ruleSnapshot || {},
          players: ids.map(function (id) {
            return { id: id };
          }),
          playerOrder: ids.slice(),
          pairings: [],
          multiplier: 1
        };
    sideGame.catalogId = row.ruleId;
    sideGame.ruleId = row.ruleId;
    sideGame.ruleSnapshot = rec.mergeRuleSnapshot(row.ruleSnapshot, sideGame.ruleSnapshot);
    if (String(row.ruleId) === 'match-2') {
      var resolved = settleMatch2.resolveMatch2RuleSnapshot(sideGame, null);
      sideGame.ruleSnapshot = resolved.ruleSnapshot;
      if (resolved.mulState === 'missing') {
        return {
          ok: true,
          result: {
            byHole: {},
            initial: settleCore.emptyLedger(
              (sideGame.players || []).map(function (p) {
                return p && p.id;
              }).filter(Boolean)
            ),
            catalogId: 'match-2',
            settleVersion: settleMatch2.MATCH2_SETTLE_VERSION,
            mulMissing: true,
            mulState: 'missing',
            resultSource: 'mul_config_missing'
          }
        };
      }
    }
    if (String(row.ruleId) === 'stroke-2') {
      var strokeResolved = settleStroke2.resolveStroke2RuleSnapshot(sideGame, null);
      sideGame.ruleSnapshot = strokeResolved.ruleSnapshot;
      if (strokeResolved.rewardState === 'missing') {
        return {
          ok: true,
          result: {
            byHole: {},
            initial: settleCore.emptyLedger(
              (sideGame.players || []).map(function (p) {
                return p && p.id;
              }).filter(Boolean)
            ),
            catalogId: 'stroke-2',
            settleVersion: settleStroke2.STROKE2_SETTLE_VERSION,
            rewardMissing: true,
            rewardState: 'missing',
            resultSource: 'reward_config_missing'
          }
        };
      }
    }
    var settled = engine.settle({
      matchId: row.matchId,
      sideGameId: row.sideGameId,
      ruleId: row.ruleId,
      holeOrder: (sideGame.fullHoleOrder && sideGame.fullHoleOrder.length)
        ? sideGame.fullHoleOrder
        : (sideGame.holeOrder && sideGame.holeOrder.length)
          ? sideGame.holeOrder
          : host.holeOrder,
      pars: host.pars,
      windOn: !!(row.config && row.config.windOn),
      scores: scores,
      sideGame: sideGame
    });
    if (!settled.ok) return { ok: false, reason: settled.reason || 'settle_failed' };
    return { ok: true, result: rec.jsonClone(settled.result) };
  }

  function refreshResult(sideGameId, hostContext) {
    var got = getById(sideGameId);
    if (!got.ok) return got;
    var row = rec.normalizeRecord(got.data);
    var userId = identity.getCurrentUserId();
    var gate = entitlement.canUpdate({ userId: userId, record: row });
    if (!gate.ok) return envelope(false, gate.reason || 'no_entitlement', got.data, row.revision);
    if (catalog.isUnavailableRule(row.ruleId) || catalog.isUnavailableRule(row.ruleSnapshot && row.ruleSnapshot.catalogId)) {
      return envelope(false, 'rule_unavailable', publicRecord(row), row.revision);
    }
    var settled = settleRecord(row, hostContext);
    if (!settled.ok) return envelope(false, settled.reason, publicRecord(row), row.revision);
    if (settled.result && (settled.result.mulMissing || settled.result.rewardMissing)) {
      return envelope(true, '', publicRecord(row), row.revision);
    }
    return update(row.sideGameId, row.revision, {
      resultSnapshot: settled.result,
      resultRevision: (row.resultRevision || 0) + 1,
      hostRevisionAtSettle: rec.asString(hostContext && hostContext.revision),
      status: 'settled'
    });
  }

  function inspectPlayerIdsRemap(matchId, idMap) {
    var mid = rec.asString(matchId);
    var map = {};
    Object.keys(idMap || {}).forEach(function (key) {
      var from = rec.asString(key);
      var to = rec.asString(idMap[key]);
      if (from && to && from !== to) map[from] = to;
    });
    if (!mid || !Object.keys(map).length) {
      return envelope(true, '', { conflictSideGameIds: [] }, 0);
    }
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, { conflictSideGameIds: [] }, 0);
    var fromIds = Object.keys(map);
    var conflicts = [];
    loaded.list.forEach(function (row) {
      if (row.matchId !== mid || row.status === 'deleted') return;
      var touched = fromIds.some(function (fromId) {
        return rec.recordTouchesPlayerId(row, fromId);
      });
      if (!touched) return;
      var mapped = rec.remapRecordPlayerIds(row, map, {});
      if (rec.recordHasDuplicatePlayerIds(mapped)) conflicts.push(row.sideGameId);
    });
    if (conflicts.length) {
      return envelope(false, 'identity_conflict', { conflictSideGameIds: conflicts }, 0);
    }
    return envelope(true, '', { conflictSideGameIds: [] }, 0);
  }

  function inspectPlayerIdRemap(matchId, fromId, toId) {
    var map = {};
    map[rec.asString(fromId)] = rec.asString(toId);
    return inspectPlayerIdsRemap(matchId, map);
  }

  function remapPlayerIds(matchId, idMap, profiles) {
    var mid = rec.asString(matchId);
    var map = {};
    Object.keys(idMap || {}).forEach(function (key) {
      var from = rec.asString(key);
      var to = rec.asString(idMap[key]);
      if (from && to && from !== to) map[from] = to;
    });
    if (!mid || !Object.keys(map).length) {
      return envelope(true, '', { updatedSideGameIds: [] }, 0);
    }
    var inspected = inspectPlayerIdsRemap(mid, map);
    if (!inspected.ok) return inspected;
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, { updatedSideGameIds: [] }, 0);
    var fromIds = Object.keys(map);
    var updated = [];
    var next = loaded.list.map(function (row) {
      if (row.matchId !== mid || row.status === 'deleted') return row;
      var touched = fromIds.some(function (fromId) {
        return rec.recordTouchesPlayerId(row, fromId);
      });
      if (!touched) return row;
      var mapped = rec.remapRecordPlayerIds(row, map, profiles || {});
      mapped.scope = row.scope;
      mapped.groupId = row.groupId;
      mapped.updatedAt = clock();
      mapped.updatedBy = identity.getCurrentUserId();
      mapped.revision = row.revision + 1;
      updated.push(row.sideGameId);
      return mapped;
    });
    if (!updated.length) return envelope(true, '', { updatedSideGameIds: [] }, 0);
    if (!writeAll(next)) return envelope(false, 'storage_write_failed', { updatedSideGameIds: [] }, 0);
    notify({ type: 'remap', matchId: mid, idMap: map });
    return envelope(true, '', { updatedSideGameIds: updated }, 0);
  }

  function remapPlayerId(matchId, fromId, toId, profile) {
    var map = {};
    map[rec.asString(fromId)] = rec.asString(toId);
    var profiles = {};
    var to = rec.asString(toId);
    if (to) profiles[to] = profile || null;
    return remapPlayerIds(matchId, map, profiles);
  }

  function removeGamesTouchingPlayer(matchId, playerId) {
    var mid = rec.asString(matchId);
    var pid = rec.asString(playerId);
    if (!mid || !pid) return envelope(false, 'invalid_args', { removedSideGameIds: [] }, 0);
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, { removedSideGameIds: [] }, 0);
    var userId = identity.getCurrentUserId();
    var removed = [];
    var next = loaded.list.map(function (row) {
      if (row.matchId !== mid || row.status === 'deleted') return row;
      if (!rec.recordTouchesPlayerId(row, pid)) return row;
      var copy = rec.normalizeRecord(row);
      copy.status = 'deleted';
      copy.updatedAt = clock();
      copy.updatedBy = userId;
      copy.revision = row.revision + 1;
      removed.push(row.sideGameId);
      return copy;
    });
    if (!removed.length) return envelope(true, '', { removedSideGameIds: [] }, 0);
    if (!writeAll(next)) return envelope(false, 'storage_write_failed', { removedSideGameIds: [] }, 0);
    notify({ type: 'remove-by-player', matchId: mid, playerId: pid });
    return envelope(true, '', { removedSideGameIds: removed }, 0);
  }

  function commitSetupDraft(input) {
    var bag = input || {};
    var userId = identity.getCurrentUserId();
    var host = bag.hostContext || null;
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var list = loaded.list.slice();
    var expected = bag.expectedRevisions || {};
    var removes = bag.removes || [];
    var updates = bag.updates || [];
    var creates = bag.creates || [];
    var i;
    var idx;
    var cur;
    var expect;
    var gate;

    function findIdx(id) {
      var sid = rec.asString(id);
      var k;
      for (k = 0; k < list.length; k++) {
        if (list[k].sideGameId === sid) return k;
      }
      return -1;
    }

    for (i = 0; i < removes.length; i++) {
      idx = findIdx(removes[i].sideGameId || removes[i].id);
      if (idx < 0 || list[idx].status === 'deleted') {
        return envelope(false, 'not_found', null, 0);
      }
      cur = list[idx];
      expect = Number(
        removes[i].revision != null ? removes[i].revision : expected[cur.sideGameId]
      );
      if (expect !== cur.revision) {
        return envelope(false, 'revision_conflict', publicRecord(cur), cur.revision);
      }
      gate = entitlement.canRemove({ userId: userId, record: cur });
      if (!gate.ok) return envelope(false, gate.reason || 'no_entitlement', null, cur.revision);
      list[idx] = rec.normalizeRecord(
        Object.assign({}, cur, {
          status: 'deleted',
          deletedAt: clock(),
          updatedBy: userId,
          updatedAt: clock(),
          revision: cur.revision + 1
        })
      );
    }

    for (i = 0; i < updates.length; i++) {
      var u = updates[i];
      idx = findIdx(u.sideGameId || u.id);
      if (idx < 0 || list[idx].status === 'deleted') {
        return envelope(false, 'not_found', null, 0);
      }
      cur = list[idx];
      expect = Number(u.revision != null ? u.revision : expected[cur.sideGameId]);
      if (expect !== cur.revision) {
        return envelope(false, 'revision_conflict', publicRecord(cur), cur.revision);
      }
      gate = entitlement.canUpdate({ userId: userId, record: cur });
      if (!gate.ok) return envelope(false, gate.reason || 'no_entitlement', null, cur.revision);
      if (
        catalog.isUnavailableRule((u.patch && u.patch.ruleId) || cur.ruleId) ||
        catalog.isUnavailableRule(cur.ruleId)
      ) {
        return envelope(false, 'rule_unavailable', publicRecord(cur), cur.revision);
      }
      var nextRow = rec.normalizeRecord(
        Object.assign({}, cur, u.patch || {}, {
          sideGameId: cur.sideGameId,
          createdBy: cur.createdBy,
          createdAt: cur.createdAt,
          updatedBy: userId,
          updatedAt: clock(),
          revision: cur.revision + 1
        })
      );
      if (nextRow.scope === 'match' && nextRow.visibility === 'group') {
        return envelope(false, 'invalid_visibility', publicRecord(cur), cur.revision);
      }
      list[idx] = nextRow;
    }

    for (i = 0; i < creates.length; i++) {
      var merged = Object.assign({}, creates[i] || {});
      gate = entitlement.canCreate({ userId: userId, hostContext: host, input: merged });
      if (!gate.ok) return envelope(false, gate.reason || 'no_entitlement', null, 0);
      merged.sideGameId = rec.asString(merged.sideGameId) || idGen();
      merged.createdBy = userId;
      merged.updatedBy = userId;
      merged.createdAt = clock();
      merged.updatedAt = clock();
      merged.revision = 1;
      merged.status = 'active';
      var checked = rec.validateCreateInput(merged, host);
      if (!checked.ok) return envelope(false, checked.reason, null, 0);
      var row = checked.record;
      row.sideGameId = rec.asString(merged.sideGameId);
      row.createdBy = userId;
      row.updatedBy = userId;
      row.createdAt = merged.createdAt;
      row.updatedAt = merged.updatedAt;
      row.revision = 1;
      row.idempotencyKey = rec.asString(merged.idempotencyKey);
      row.resultSnapshot = null;
      row.resultRevision = 0;
      row.hostRevisionAtSettle = '';
      list.push(row);
    }

    if (!writeAll(list)) return envelope(false, 'storage_write_failed', null, 0);

    if (bag.settings != null) {
      var settingsOk = true;
      try {
        var settingsApi = d.settingsApi || require('./localSideGameSettings.js').getDefault();
        if (typeof settingsApi.replace === 'function') {
          settingsOk = !!settingsApi.replace(bag.matchId, bag.entry || 'score', bag.settings);
        } else {
          settingsApi.set(bag.matchId, bag.entry || 'score', bag.settings);
        }
      } catch (e) {
        settingsOk = false;
      }
      if (!settingsOk) {
        writeAll(loaded.list);
        return envelope(false, 'settings_write_failed', null, 0);
      }
    }

    var settledIds = [];
    var settleIds = bag.settleIds || [];
    for (i = 0; i < settleIds.length; i++) {
      var sid = rec.asString(settleIds[i]);
      if (!sid) continue;
      try {
        var refreshed = refreshResult(sid, host);
        if (refreshed && refreshed.ok) settledIds.push(sid);
      } catch (e2) {}
    }

    notify({ type: 'commitSetup', matchId: rec.asString(bag.matchId) });
    return envelope(true, '', { settledIds: settledIds }, 0);
  }

  function subscribe(query, callback) {
    if (typeof callback !== 'function') return null;
    listeners.push(callback);
    return { query: query || {}, callback: callback };
  }

  function unsubscribe(handle) {
    if (!handle || typeof handle.callback !== 'function') return;
    listeners = listeners.filter(function (fn) {
      return fn !== handle.callback;
    });
  }

  return {
    implementation: 'local',
    STORAGE_KEY: STORAGE_KEY,
    listVisible: listVisible,
    getById: getById,
    create: create,
    update: update,
    remove: remove,
    refreshResult: refreshResult,
    inspectPlayerIdRemap: inspectPlayerIdRemap,
    inspectPlayerIdsRemap: inspectPlayerIdsRemap,
    remapPlayerId: remapPlayerId,
    remapPlayerIds: remapPlayerIds,
    removeGamesTouchingPlayer: removeGamesTouchingPlayer,
    commitSetupDraft: commitSetupDraft,
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };
}

var defaultRepo = createLocalSideGameRepository();

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  createLocalSideGameRepository: createLocalSideGameRepository,
  getDefault: function () {
    return defaultRepo;
  }
};
