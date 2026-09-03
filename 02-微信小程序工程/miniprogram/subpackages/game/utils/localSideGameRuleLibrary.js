/**
 * 本机「我的规则库」。仅此文件读写 gb_side_game_rules_v1。
 * 内置 catalog 17 条不会自动写入。
 */
var rec = require('./sideGameRecord.js');
var catalog = require('./catalog.js');

var STORAGE_KEY = 'gb_side_game_rules_v1';

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

function normalizeRule(raw) {
  var r = raw && typeof raw === 'object' ? raw : {};
  var rev = Number(r.revision);
  if (!isFinite(rev) || rev < 1) rev = 1;
  var play = rec.stripLibraryMeta(rec.unwrapGameplaySnapshot(r));
  if (!play.catalogId) play.catalogId = rec.asString(r.catalogId || r.ruleId);
  if (!play.ruleId) play.ruleId = rec.asString(r.ruleId || r.catalogId || play.catalogId);
  var mode = rec.normalizeRewardMode(play.reward);
  if (mode) play.reward = mode;
  return {
    id: rec.asString(r.id),
    name: rec.asString(r.name),
    ruleId: rec.asString(r.ruleId || r.catalogId || play.ruleId),
    catalogId: rec.asString(r.catalogId || r.ruleId || play.catalogId),
    players: Number(r.players) || Number(play.players) || 0,
    noSettings: !!r.noSettings,
    matchPlay: !!r.matchPlay,
    ruleSnapshot: play,
    updatedAt: r.updatedAt != null ? Number(r.updatedAt) || 0 : 0,
    revision: rev
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

  function readAll() {
    var raw = storage.getItem(STORAGE_KEY);
    if (raw && raw.__fail) return { ok: false, reason: 'storage_read_failed', list: [] };
    var list = Array.isArray(raw) ? raw : [];
    return { ok: true, reason: '', list: list.map(normalizeRule) };
  }

  function writeAll(list) {
    return !!storage.setItem(STORAGE_KEY, rec.jsonClone(list || []));
  }

  function list(maxPlayers) {
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, { items: [] }, 0);
    var cap = Number(maxPlayers);
    var items = loaded.list.filter(function (rule) {
      if (!(cap > 0)) return false;
      var n = Number(rule.players);
      return n > 0 && n <= cap;
    });
    return envelope(true, '', { items: items }, 0);
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

  function upsert(input) {
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var next = normalizeRule(input || {});
    if (!next.name) return envelope(false, 'missing_name', null, 0);
    if (!next.catalogId && !next.ruleId) return envelope(false, 'unknown_rule', null, 0);
    next.ruleId = next.ruleId || next.catalogId;
    next.catalogId = next.catalogId || next.ruleId;
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
    if (idx < 0) {
      for (i = 0; i < loaded.list.length; i++) {
        if (loaded.list[i].name === next.name) {
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
          updatedAt: next.updatedAt
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
    if (!writeAll(loaded.list)) return envelope(false, 'storage_write_failed', null, 0);
    return envelope(true, '', rec.jsonClone(row), row.revision);
  }

  function remove(id) {
    var loaded = readAll();
    if (!loaded.ok) return envelope(false, loaded.reason, null, 0);
    var key = rec.asString(id);
    var next = loaded.list.filter(function (item) {
      return item.id !== key;
    });
    if (next.length === loaded.list.length) return envelope(false, 'not_found', null, 0);
    if (!writeAll(next)) return envelope(false, 'storage_write_failed', null, 0);
    return envelope(true, '', { deleted: true, id: key }, 0);
  }

  return {
    implementation: 'local',
    STORAGE_KEY: STORAGE_KEY,
    list: list,
    getById: getById,
    findByName: findByName,
    upsert: upsert,
    remove: remove
  };
}

var defaultLib = createLocalSideGameRuleLibrary();

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  createLocalSideGameRuleLibrary: createLocalSideGameRuleLibrary,
  getDefault: function () {
    return defaultLib;
  }
};
