/**
 * 本机「我的规则库」。仅此文件读写 gb_side_game_rules_v1。
 * 默认项复制为可编辑个人实例；sourceTemplateId 只用于初始化去重与来源追踪。
 */
var rec = require('./sideGameRecord.js');
var catalog = require('./catalog.js');
var ruleDefaults = require('./sideGameRuleDefaults.js');

var STORAGE_KEY = 'gb_side_game_rules_v1';
var RULE_LIBRARY_SCHEMA_VERSION = 4;

var LEGACY_SEEDED_TEMPLATE_IDS = [
  'stroke-2',
  'match-2',
  '8421-2',
  'landlord-mid',
  '8421-3',
  '8421-4',
  'lasuo-4',
  'three-vs-one',
  'lasuo-n',
  'horn'
];

var DEFAULT_LIBRARY_RULE_IDS = LEGACY_SEEDED_TEMPLATE_IDS.slice();

var DEFAULT_TEMPLATE_SET = {};
DEFAULT_LIBRARY_RULE_IDS.forEach(function (id) {
  DEFAULT_TEMPLATE_SET[id] = true;
});

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

function uniqIds(list) {
  var seen = {};
  var out = [];
  (list || []).forEach(function (id) {
    var key = rec.asString(id);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(key);
  });
  return out;
}

function applyCapability(row, cap) {
  var players =
    cap.playerMode === 'exact'
      ? cap.playerCount
      : Number(row.players) || cap.minPlayers || 0;
  var multi = cap.playerMode === 'range' || cap.minPlayers >= 5;
  return Object.assign({}, row, {
    playerMode: cap.playerMode,
    playerCount: cap.playerCount,
    minPlayers: cap.minPlayers,
    maxPlayers: cap.maxPlayers,
    players: players,
    requiredEntityCount: multi ? 0 : cap.playerCount || cap.minPlayers || 0,
    playerKind: multi ? 'multiplayer' : 'exact'
  });
}

function capabilityIncomplete(row) {
  var mode = rec.asString(row && row.playerMode);
  if (mode !== 'exact' && mode !== 'range') return true;
  if (mode === 'exact') return !(Number(row.playerCount) > 0);
  return !(Number(row.minPlayers) > 0);
}

function normalizeRule(raw) {
  var r = raw && typeof raw === 'object' ? raw : {};
  var rev = Number(r.revision);
  if (!isFinite(rev) || rev < 1) rev = 1;
  var play = rec.stripLibraryMeta(rec.unwrapGameplaySnapshot(r));
  if (!play.catalogId) play.catalogId = rec.asString(r.catalogId || r.ruleId);
  if (!play.ruleId) play.ruleId = rec.asString(r.ruleId || r.catalogId || play.catalogId);
  var mode = rec.normalizeRewardMode(play.reward);
  if (mode) play.reward = mode;
  var sourceTemplateId = rec.asString(r.sourceTemplateId || play.sourceTemplateId);
  var row = {
    id: rec.asString(r.id),
    name: rec.asString(r.name),
    ruleId: rec.asString(r.ruleId || r.catalogId || play.ruleId),
    catalogId: rec.asString(r.catalogId || r.ruleId || play.catalogId),
    sourceTemplateId: sourceTemplateId,
    players: Number(r.players) || Number(play.players) || 0,
    playerMode: rec.asString(r.playerMode || play.playerMode),
    playerCount: Number(r.playerCount) || Number(play.playerCount) || 0,
    minPlayers: Number(r.minPlayers) || Number(play.minPlayers) || 0,
    maxPlayers: r.maxPlayers == null || r.maxPlayers === '' ? null : Number(r.maxPlayers) || 0,
    noSettings: !!r.noSettings,
    matchPlay: !!r.matchPlay,
    ruleSnapshot: play,
    updatedAt: r.updatedAt != null ? Number(r.updatedAt) || 0 : 0,
    revision: rev
  };
  return applyCapability(row, catalog.rulePlayerCapability(row));
}

function templateIdOf(row) {
  if (!row) return '';
  var fromField = rec.asString(row.sourceTemplateId);
  if (fromField && DEFAULT_TEMPLATE_SET[fromField]) return fromField;
  if (DEFAULT_TEMPLATE_SET[rec.asString(row.id)]) return rec.asString(row.id);
  var catalogId = rec.asString(row.catalogId);
  if (DEFAULT_TEMPLATE_SET[catalogId]) return catalogId;
  return '';
}

function hasTemplateInstance(items, templateId) {
  var tid = rec.asString(templateId);
  if (!tid) return false;
  return (items || []).some(function (row) {
    return templateIdOf(row) === tid;
  });
}

function backfillSourceTemplateId(row) {
  if (!row || rec.asString(row.sourceTemplateId)) return { row: row, dirty: false };
  var tid = '';
  if (DEFAULT_TEMPLATE_SET[rec.asString(row.id)]) tid = rec.asString(row.id);
  else if (rec.asString(row.source) === 'default' && DEFAULT_TEMPLATE_SET[rec.asString(row.catalogId)]) {
    tid = rec.asString(row.catalogId);
  }
  if (!tid) return { row: row, dirty: false };
  return { row: Object.assign({}, row, { sourceTemplateId: tid }), dirty: true };
}

function fillMissingCapability(row) {
  if (!capabilityIncomplete(row)) return { row: row, dirty: false };
  var next = applyCapability(row, catalog.rulePlayerCapability(row));
  return { row: next, dirty: true };
}

function buildDefaultRule(templateId, clock, idGen) {
  var item = catalog.findRule(templateId);
  if (!item || catalog.isUnavailableRule(item)) return null;
  var cap = catalog.rulePlayerCapability(item);
  var snapshot = {
    catalogId: item.id,
    ruleId: item.id,
    name: item.name,
    players: cap.playerMode === 'exact' ? cap.playerCount : cap.minPlayers
  };
  if (catalog.is8421(templateId)) snapshot.scoreCode = '8421';
  snapshot = ruleDefaults.defaultGameplaySnapshot(templateId, snapshot);
  var name = templateId === 'lasuo-4' ? catalog.lasuoDefaultName(snapshot) : item.name;
  snapshot.name = name;
  return normalizeRule({
    id: idGen(),
    name: name,
    ruleId: item.id,
    catalogId: item.id,
    sourceTemplateId: item.id,
    players: snapshot.players,
    playerMode: cap.playerMode,
    playerCount: cap.playerCount,
    minPlayers: cap.minPlayers,
    maxPlayers: cap.maxPlayers,
    noSettings: !!item.noSettings,
    matchPlay: !!item.matchPlay,
    ruleSnapshot: snapshot,
    updatedAt: clock(),
    revision: 1
  });
}

function templatesKnownAtSchema(schemaVersion) {
  var ver = Number(schemaVersion) || 0;
  if (ver >= 2) return LEGACY_SEEDED_TEMPLATE_IDS.slice();
  return [];
}

function migrateEnvelope(schemaVersion, items, dismissed, processed, clock, idGen) {
  var dirty = false;
  var next = (items || []).map(function (row) {
    var filled = fillMissingCapability(row);
    if (filled.dirty) dirty = true;
    var tagged = backfillSourceTemplateId(filled.row);
    if (tagged.dirty) dirty = true;
    return tagged.row;
  });
  var dismissedIds = uniqIds(dismissed);
  var processedIds = uniqIds(processed);
  templatesKnownAtSchema(schemaVersion).forEach(function (tid) {
    if (processedIds.indexOf(tid) < 0) processedIds.push(tid);
  });
  dismissedIds.forEach(function (tid) {
    if (processedIds.indexOf(tid) < 0) processedIds.push(tid);
  });
  next.forEach(function (row) {
    var tid = templateIdOf(row);
    if (tid && processedIds.indexOf(tid) < 0) processedIds.push(tid);
  });
  var uninitialized =
    !(Number(schemaVersion) > 0) &&
    !next.length &&
    !processedIds.length &&
    !dismissedIds.length;
  if (uninitialized) {
    DEFAULT_LIBRARY_RULE_IDS.forEach(function (tid) {
      if (processedIds.indexOf(tid) >= 0) return;
      processedIds.push(tid);
      dirty = true;
      if (dismissedIds.indexOf(tid) >= 0) return;
      if (hasTemplateInstance(next, tid)) return;
      var seeded = buildDefaultRule(tid, clock, idGen);
      if (!seeded) return;
      next.push(seeded);
    });
  }
  processedIds = uniqIds(processedIds);
  if (schemaVersion !== RULE_LIBRARY_SCHEMA_VERSION) {
    schemaVersion = RULE_LIBRARY_SCHEMA_VERSION;
    dirty = true;
  }
  return {
    schemaVersion: schemaVersion,
    items: next,
    dismissedDefaultRuleIds: dismissedIds,
    processedSourceTemplateIds: processedIds,
    dirty: dirty
  };
}

function createLocalSideGameRuleLibrary(deps) {
  var d = deps || {};
  var storage = d.storage || wxStorageAdapter();
  var clock = d.clock || rec.nowMs;
  var idGen =
    d.idGen ||
    function () {
      return 'rl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    };

  function writeStore(schemaVersion, list, dismissed, processed) {
    return !!storage.setItem(STORAGE_KEY, {
      schemaVersion: schemaVersion,
      items: rec.jsonClone(list || []),
      dismissedDefaultRuleIds: uniqIds(dismissed),
      processedSourceTemplateIds: uniqIds(processed)
    });
  }

  function readAll() {
    var raw = storage.getItem(STORAGE_KEY);
    if (raw && raw.__fail) {
      return {
        ok: false,
        reason: 'storage_read_failed',
        list: [],
        schemaVersion: 0,
        dismissedDefaultRuleIds: [],
        processedSourceTemplateIds: []
      };
    }
    var schemaVersion = 0;
    var list = [];
    var dismissed = [];
    var processed = [];
    if (Array.isArray(raw)) {
      list = raw.map(normalizeRule);
    } else if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
      schemaVersion = Number(raw.schemaVersion) || 0;
      list = raw.items.map(normalizeRule);
      dismissed = uniqIds(raw.dismissedDefaultRuleIds);
      processed = uniqIds(raw.processedSourceTemplateIds);
    }
    var migrated = migrateEnvelope(schemaVersion, list, dismissed, processed, clock, idGen);
    if (migrated.dirty) {
      if (
        !writeStore(
          migrated.schemaVersion,
          migrated.items,
          migrated.dismissedDefaultRuleIds,
          migrated.processedSourceTemplateIds
        )
      ) {
        return {
          ok: false,
          reason: 'storage_write_failed',
          list: migrated.items,
          schemaVersion: migrated.schemaVersion,
          dismissedDefaultRuleIds: migrated.dismissedDefaultRuleIds,
          processedSourceTemplateIds: migrated.processedSourceTemplateIds
        };
      }
    }
    return {
      ok: true,
      reason: '',
      list: migrated.items,
      schemaVersion: migrated.schemaVersion,
      dismissedDefaultRuleIds: migrated.dismissedDefaultRuleIds,
      processedSourceTemplateIds: migrated.processedSourceTemplateIds
    };
  }

  function writeAll(list, schemaVersion, dismissed, processed) {
    var ver = schemaVersion == null ? RULE_LIBRARY_SCHEMA_VERSION : schemaVersion;
    return writeStore(ver, list, dismissed, processed);
  }

  function filterByParticipantCount(items, participantCount) {
    var n = Number(participantCount);
    if (!(n >= 2)) return [];
    return (items || []).filter(function (rule) {
      return catalog.isRuleAvailableForGroupCapacity(rule, n);
    });
  }

  function list(participantCount) {
    var loaded = readAll();
    if (!loaded.ok) {
      return envelope(false, loaded.reason, {
        items: [],
        schemaVersion: loaded.schemaVersion,
        dismissedDefaultRuleIds: loaded.dismissedDefaultRuleIds || [],
        processedSourceTemplateIds: loaded.processedSourceTemplateIds || []
      }, 0);
    }
    var items = loaded.list;
    if (participantCount != null && participantCount !== '' && typeof participantCount !== 'object') {
      items = filterByParticipantCount(items, participantCount);
    } else if (participantCount && typeof participantCount === 'object') {
      if (participantCount.all) items = loaded.list;
      else items = filterByParticipantCount(items, participantCount.participantCount);
    }
    return envelope(true, '', {
      items: items,
      schemaVersion: loaded.schemaVersion,
      dismissedDefaultRuleIds: loaded.dismissedDefaultRuleIds || [],
      processedSourceTemplateIds: loaded.processedSourceTemplateIds || []
    }, 0);
  }

  function listAll() {
    return list({ all: true });
  }

  function listCompatible(participantCount) {
    return list(participantCount);
  }

  function getById(id) {
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var key = rec.asString(id);
    var i;
    for (i = 0; i < loaded.list.length; i++) {
      if (loaded.list[i].id === key) {
        return envelope(true, '', rec.jsonClone(loaded.list[i]), loaded.list[i].revision);
      }
    }
    return envelope(false, 'not_found', null, 0);
  }

  function findByName(name) {
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var key = rec.asString(name);
    var i;
    for (i = 0; i < loaded.list.length; i++) {
      if (rec.asString(loaded.list[i].name) === key) {
        return envelope(true, '', rec.jsonClone(loaded.list[i]), loaded.list[i].revision);
      }
    }
    return envelope(false, 'not_found', null, 0);
  }

  function findBySourceTemplateId(templateId) {
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var key = rec.asString(templateId);
    var i;
    for (i = 0; i < loaded.list.length; i++) {
      if (templateIdOf(loaded.list[i]) === key) {
        return envelope(true, '', rec.jsonClone(loaded.list[i]), loaded.list[i].revision);
      }
    }
    return envelope(false, 'not_found', null, 0);
  }

  function upsert(input) {
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var next = normalizeRule(input || {});
    if (!next.name) return envelope(false, 'missing_name', null, 0);
    if (!next.catalogId && !next.ruleId) return envelope(false, 'unknown_rule', null, 0);
    next.ruleId = next.ruleId || next.catalogId;
    next.catalogId = next.catalogId || next.ruleId;
    if (!next.sourceTemplateId && DEFAULT_TEMPLATE_SET[next.catalogId]) {
      next.sourceTemplateId = next.catalogId;
    }
    if (catalog.isUnavailableRule(next.ruleId) || catalog.isUnavailableRule(next.catalogId)) {
      return envelope(false, 'rule_unavailable', null, 0);
    }
    next.updatedAt = clock();
    var idx = -1;
    var i;
    if (next.id) {
      for (i = 0; i < loaded.list.length; i++) {
        if (loaded.list[i].id === next.id) {
          idx = i;
          break;
        }
      }
    }
    var row;
    if (idx >= 0) {
      var prev = loaded.list[idx];
      var incoming = Object.assign({}, next);
      if (!incoming.ruleSnapshot) {
        incoming.ruleSnapshot = rec.stripLibraryMeta(
          Object.assign({}, rec.unwrapGameplaySnapshot(prev), rec.unwrapGameplaySnapshot(next))
        );
      }
      row = normalizeRule(
        Object.assign({}, prev, incoming, {
          id: prev.id,
          revision: prev.revision + 1,
          updatedAt: next.updatedAt,
          sourceTemplateId: incoming.sourceTemplateId || prev.sourceTemplateId
        })
      );
      loaded.list[idx] = row;
    } else {
      row = normalizeRule(
        Object.assign({}, next, {
          id: next.id || idGen(),
          revision: 1
        })
      );
      loaded.list.unshift(row);
    }
    var processed = uniqIds(loaded.processedSourceTemplateIds);
    var tidNew = templateIdOf(row);
    if (tidNew && processed.indexOf(tidNew) < 0) processed.push(tidNew);
    if (!writeAll(loaded.list, loaded.schemaVersion || RULE_LIBRARY_SCHEMA_VERSION, loaded.dismissedDefaultRuleIds, processed)) {
      return envelope(false, 'storage_write_failed', null, 0);
    }
    return envelope(true, '', rec.jsonClone(row), row.revision);
  }

  function remove(id) {
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var key = rec.asString(id);
    var removed = null;
    var next = [];
    loaded.list.forEach(function (item) {
      if (item.id === key) removed = item;
      else next.push(item);
    });
    if (!removed) return envelope(false, 'not_found', null, 0);
    var dismissed = uniqIds(loaded.dismissedDefaultRuleIds);
    var processed = uniqIds(loaded.processedSourceTemplateIds);
    var tid = templateIdOf(removed);
    if (tid && dismissed.indexOf(tid) < 0) dismissed.push(tid);
    if (tid && processed.indexOf(tid) < 0) processed.push(tid);
    if (!writeAll(next, loaded.schemaVersion || RULE_LIBRARY_SCHEMA_VERSION, dismissed, processed)) {
      return envelope(false, 'storage_write_failed', null, 0);
    }
    return envelope(true, '', { deleted: true, id: key, sourceTemplateId: tid }, 0);
  }

  return {
    implementation: 'local',
    STORAGE_KEY: STORAGE_KEY,
    RULE_LIBRARY_SCHEMA_VERSION: RULE_LIBRARY_SCHEMA_VERSION,
    DEFAULT_LIBRARY_RULE_IDS: DEFAULT_LIBRARY_RULE_IDS.slice(),
    list: list,
    listAll: listAll,
    listCompatible: listCompatible,
    getById: getById,
    findByName: findByName,
    findBySourceTemplateId: findBySourceTemplateId,
    upsert: upsert,
    remove: remove
  };
}

var defaultLib = createLocalSideGameRuleLibrary();

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  RULE_LIBRARY_SCHEMA_VERSION: RULE_LIBRARY_SCHEMA_VERSION,
  DEFAULT_LIBRARY_RULE_IDS: DEFAULT_LIBRARY_RULE_IDS,
  LEGACY_SEEDED_TEMPLATE_IDS: LEGACY_SEEDED_TEMPLATE_IDS,
  createLocalSideGameRuleLibrary: createLocalSideGameRuleLibrary,
  getDefault: function () {
    return defaultLib;
  }
};
