/**
 * 比赛球场/半场变更后重建全程洞序（主包写入点）。
 * 存储键与游戏分包一致：gb_side_game_settings_v1 / gb_side_games_v1。
 * 运行期消费者仍只读 settings.fullHoleOrder / fullHoleOrderRevision。
 */
var SETTINGS_KEY = 'gb_side_game_settings_v1';
var GAMES_KEY = 'gb_side_games_v1';

var SETTINGS_EMPTY = {
  privacy: 'public',
  wind: 'off',
  settingsOpen: false,
  holeOrder: null,
  potMode: 'none',
  potN: '1',
  potM: '',
  potAllM: '',
  potS: '',
  potGameIds: [],
  windGameIds: []
};

var ENTRY_KEYS = ['score', 'hub', 'match'];

function asStr(v) {
  return v == null ? '' : String(v);
}

function cloneJson(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function uniqueLabels(raw) {
  var seen = {};
  var out = [];
  (Array.isArray(raw) ? raw : []).forEach(function (label) {
    var s = asHoleId(label);
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}

function asHoleId(item) {
  if (item == null) return '';
  if (typeof item === 'object') {
    var id =
      item.holeId != null
        ? item.holeId
        : item.id != null
          ? item.id
          : item.label != null
            ? item.label
            : item.displayHoleNo;
    return String(id == null ? '' : id).trim();
  }
  return String(item).trim();
}

function buildHoleLabelsFromHalves(front9, back9) {
  var out = [];
  var i;
  var front = asStr(front9);
  var back = asStr(back9);
  if (front) {
    for (i = 1; i <= 9; i++) out.push(front + i);
  }
  if (back) {
    for (i = 1; i <= 9; i++) out.push(back + i);
  }
  return out;
}

function signatureOf(input) {
  var src = input || {};
  var front = asStr(src.front9Course || src.frontHalfId);
  var back = asStr(src.back9Course || src.backHalfId);
  return {
    courseId: asStr(src.courseId),
    front9Course: front,
    back9Course: back,
    labels: buildHoleLabelsFromHalves(front, back)
  };
}

function needsHoleOrderRebuild(before, after) {
  var a = signatureOf(before);
  var b = signatureOf(after);
  if (a.courseId !== b.courseId) return true;
  if (a.front9Course !== b.front9Course) return true;
  if (a.back9Course !== b.back9Course) return true;
  if (a.labels.join('\0') !== b.labels.join('\0')) return true;
  return false;
}

function buildHoleIdMap(oldCreated, newCreated) {
  var oldIds = uniqueLabels(oldCreated);
  var newIds = uniqueLabels(newCreated);
  var newSet = {};
  newIds.forEach(function (id) {
    newSet[id] = true;
  });
  var map = {};
  var i;
  for (i = 0; i < oldIds.length; i++) {
    var oldId = oldIds[i];
    if (newSet[oldId]) {
      map[oldId] = oldId;
      continue;
    }
    if (oldIds.length === newIds.length && newIds[i]) {
      map[oldId] = newIds[i];
    } else {
      map[oldId] = null;
    }
  }
  return { map: map, newSet: newSet, oldIds: oldIds, newIds: newIds };
}

function mapHoleId(id, mapping) {
  var key = asStr(id);
  if (!key) return null;
  if (mapping.newSet[key]) return key;
  if (Object.prototype.hasOwnProperty.call(mapping.map, key)) return mapping.map[key];
  return null;
}

function alignHolesToFullOrder(holes, fullIds) {
  var ids = uniqueLabels(fullIds);
  var list = holes || [];
  var byId = {};
  list.forEach(function (item) {
    var key = asHoleId(item);
    if (key) byId[key] = item && typeof item === 'object' ? item : { label: key, on: true };
  });
  var overlap = ids.some(function (id) {
    return !!byId[id];
  });
  return ids.map(function (id, i) {
    if (byId[id]) {
      return Object.assign({}, byId[id], { label: id, holeId: byId[id].holeId || id });
    }
    if (!overlap && list[i]) {
      var prev = list[i];
      var obj = prev && typeof prev === 'object' ? prev : { on: true };
      return Object.assign({}, obj, { label: id, holeId: id, on: obj.on !== false });
    }
    return { label: id, holeId: id, on: true };
  });
}

function migrateHolesArray(holes, newIds, mapping) {
  return alignHolesToFullOrder(holes || [], newIds).map(function (row, i) {
    var id = newIds[i];
    var prevById = null;
    (holes || []).forEach(function (h) {
      var hid = asHoleId(h);
      if (hid && mapHoleId(hid, mapping) === id) prevById = h;
    });
    if (prevById && typeof prevById === 'object') {
      return Object.assign({}, row, {
        label: id,
        holeId: id,
        on: prevById.on !== false
      });
    }
    return row;
  });
}

function migrateKicks(kicks, mapping, newIds) {
  var out = [];
  (kicks || []).forEach(function (kick) {
    if (!kick) return;
    var fromHole = kick.fromHole != null ? mapHoleId(kick.fromHole, mapping) : null;
    if (fromHole == null && mapping.oldIds.length === mapping.newIds.length) {
      var fromIndex = Number(kick.fromIndex);
      if (fromIndex >= 0 && fromIndex < newIds.length) fromHole = newIds[fromIndex];
    }
    if (fromHole == null) return;
    var idx = newIds.indexOf(fromHole);
    if (idx < 0) return;
    out.push(
      Object.assign({}, kick, {
        fromHole: fromHole,
        fromIndex: idx,
        toIndex: kick.toIndex == null ? newIds.length : Number(kick.toIndex)
      })
    );
  });
  return out;
}

function migrateByHole(byHole, mapping) {
  var src = byHole && typeof byHole === 'object' ? byHole : {};
  var next = {};
  var stale = {};
  Object.keys(src).forEach(function (key) {
    var mapped = mapHoleId(key, mapping);
    if (mapped) {
      next[mapped] = cloneJson(src[key]);
    } else {
      stale[key] = cloneJson(src[key]);
    }
  });
  return { byHole: next, staleByHole: stale };
}

function migrateGameInstance(inst, oldCreated, newCreated) {
  var mapping = buildHoleIdMap(oldCreated, newCreated);
  var next = cloneJson(inst || {});
  next.createdHoleOrder = newCreated.slice();
  next.fullHoleOrder = newCreated.slice();
  next.holeOrder = newCreated.slice();
  next.holes = migrateHolesArray(next.holes, newCreated, mapping);
  next.kicks = migrateKicks(next.kicks, mapping, newCreated);
  if (next.holeResults && next.holeResults.byHole) {
    var migrated = migrateByHole(next.holeResults.byHole, mapping);
    next.holeResults = Object.assign({}, next.holeResults, {
      byHole: migrated.byHole,
      staleByHole: Object.assign({}, next.holeResults.staleByHole || {}, migrated.staleByHole),
      holeOrderRevisionInvalidated: true
    });
  }
  return next;
}

function readStorage(key) {
  try {
    return wx.getStorageSync(key);
  } catch (e) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function settingsKeyOf(matchId, entry) {
  return asStr(matchId) + '::' + asStr(entry || 'score');
}

function getSettings(matchId, entry) {
  var map = readStorage(SETTINGS_KEY);
  if (!map || typeof map !== 'object') map = {};
  var hit = map[settingsKeyOf(matchId, entry)] || {};
  return Object.assign({}, SETTINGS_EMPTY, hit);
}

function setSettings(matchId, entry, patch) {
  var map = readStorage(SETTINGS_KEY);
  if (!map || typeof map !== 'object') map = {};
  var k = settingsKeyOf(matchId, entry);
  map[k] = Object.assign({}, getSettings(matchId, entry), patch || {});
  return writeStorage(SETTINGS_KEY, map);
}

function replaceSettings(matchId, entry, value) {
  var map = readStorage(SETTINGS_KEY);
  if (!map || typeof map !== 'object') map = {};
  var prev = cloneJson(map);
  var k = settingsKeyOf(matchId, entry);
  map[k] = Object.assign({}, SETTINGS_EMPTY, value || {});
  if (!writeStorage(SETTINGS_KEY, map)) {
    writeStorage(SETTINGS_KEY, prev);
    return false;
  }
  return true;
}

function readAllGames() {
  var raw = readStorage(GAMES_KEY);
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.list)) return raw.list;
  return [];
}

function writeAllGames(list) {
  var raw = readStorage(GAMES_KEY);
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    var next = Object.assign({}, raw, { list: list });
    return writeStorage(GAMES_KEY, next);
  }
  return writeStorage(GAMES_KEY, list);
}

function listRowsForMatch(matchId) {
  var mid = asStr(matchId);
  return readAllGames().filter(function (row) {
    return row && asStr(row.matchId) === mid && asStr(row.status) !== 'deleted';
  });
}

function rebuildMatchHoleOrder(opts) {
  var o = opts || {};
  var matchId = asStr(o.matchId);
  var entry = asStr(o.entry || 'score') || 'score';
  var newCreated = uniqueLabels(o.createdHoleOrder || o.labels || []);
  if (!matchId) return { ok: false, reason: 'missing_match_id' };
  if (!newCreated.length) return { ok: false, reason: 'empty_hole_order' };

  var prevSettings = cloneJson(getSettings(matchId, entry));
  var oldCreated = uniqueLabels(
    prevSettings.createdHoleOrder || prevSettings.fullHoleOrder || prevSettings.holeOrder || []
  );
  var prevRev = Number(prevSettings.fullHoleOrderRevision) || 0;
  var nextRev = prevRev + 1;

  var allGames = readAllGames();
  var prevGames = cloneJson(allGames);
  var mapping = buildHoleIdMap(oldCreated.length ? oldCreated : newCreated, newCreated);

  try {
    if (
      !setSettings(matchId, entry, {
        createdHoleOrder: newCreated.slice(),
        fullHoleOrder: newCreated.slice(),
        holeOrder: newCreated.slice(),
        fullHoleOrderRevision: nextRev,
        fullHoleOrderMigrated: false
      })
    ) {
      throw new Error('settings_write_failed');
    }

    var nextGames = allGames.map(function (row) {
      if (!row || asStr(row.matchId) !== matchId || asStr(row.status) === 'deleted') return row;
      var nextRow = cloneJson(row);
      if (!nextRow.config) nextRow.config = {};
      nextRow.config.instance = migrateGameInstance(
        nextRow.config.instance || {},
        oldCreated.length ? oldCreated : newCreated,
        newCreated
      );
      nextRow.resultRevision = (Number(nextRow.resultRevision) || 0) + 1;
      var snap = nextRow.resultSnapshot || nextRow.result;
      if (snap && snap.byHole) {
        var rm = migrateByHole(snap.byHole, mapping);
        var nextSnap = Object.assign({}, snap, {
          byHole: rm.byHole,
          staleByHole: Object.assign({}, snap.staleByHole || {}, rm.staleByHole),
          holeOrderRevisionInvalidated: true
        });
        if (nextRow.resultSnapshot) nextRow.resultSnapshot = nextSnap;
        if (nextRow.result) nextRow.result = nextSnap;
      }
      nextRow.revision = (Number(nextRow.revision) || 0) + 1;
      nextRow.updatedAt = Date.now();
      return nextRow;
    });

    if (!writeAllGames(nextGames)) throw new Error('games_write_failed');

    return {
      ok: true,
      rebuilt: true,
      matchId: matchId,
      entry: entry,
      createdHoleOrder: newCreated.slice(),
      fullHoleOrder: newCreated.slice(),
      fullHoleOrderRevision: nextRev,
      previousRevision: prevRev
    };
  } catch (err) {
    try {
      replaceSettings(matchId, entry, prevSettings);
    } catch (e1) {}
    try {
      writeAllGames(prevGames);
    } catch (e2) {}
    return {
      ok: false,
      rebuilt: false,
      reason: 'rebuild_failed',
      message: '洞序同步失败',
      error: err && err.message ? err.message : String(err || '')
    };
  }
}

/**
 * 对 match 下常见 entry（score/hub/match）同步重建；游戏实例只迁移一次。
 */
function rebuildAllEntriesForMatch(opts) {
  var o = opts || {};
  var matchId = asStr(o.matchId);
  var labels = uniqueLabels(o.createdHoleOrder || o.labels || []);
  if (!matchId || !labels.length) {
    return { ok: false, reason: 'invalid_args', message: '洞序同步失败' };
  }

  var settingsSnaps = {};
  var entriesToWrite = [];
  ENTRY_KEYS.forEach(function (entry) {
    var cur = cloneJson(getSettings(matchId, entry));
    settingsSnaps[entry] = cur;
    var hasSettings =
      uniqueLabels(cur.createdHoleOrder || cur.fullHoleOrder || cur.holeOrder || []).length > 0;
    if (entry === 'score' || hasSettings) entriesToWrite.push(entry);
  });
  if (entriesToWrite.indexOf('score') < 0) entriesToWrite.unshift('score');

  var prevGames = cloneJson(readAllGames());
  var primaryOld = uniqueLabels(
    settingsSnaps.score.createdHoleOrder ||
      settingsSnaps.score.fullHoleOrder ||
      settingsSnaps.score.holeOrder ||
      []
  );
  var prevRev = Number(settingsSnaps.score.fullHoleOrderRevision) || 0;
  var nextRev = prevRev + 1;
  var mapping = buildHoleIdMap(primaryOld.length ? primaryOld : labels, labels);

  try {
    var i;
    for (i = 0; i < entriesToWrite.length; i++) {
      var entry = entriesToWrite[i];
      var baseRev = Number(settingsSnaps[entry].fullHoleOrderRevision) || 0;
      var rev = entry === 'score' ? nextRev : baseRev + 1;
      if (
        !setSettings(matchId, entry, {
          createdHoleOrder: labels.slice(),
          fullHoleOrder: labels.slice(),
          holeOrder: labels.slice(),
          fullHoleOrderRevision: rev,
          fullHoleOrderMigrated: false
        })
      ) {
        throw new Error('settings_write_failed');
      }
    }

    var nextGames = readAllGames().map(function (row) {
      if (!row || asStr(row.matchId) !== matchId || asStr(row.status) === 'deleted') return row;
      var nextRow = cloneJson(row);
      if (!nextRow.config) nextRow.config = {};
      nextRow.config.instance = migrateGameInstance(
        nextRow.config.instance || {},
        primaryOld.length ? primaryOld : labels,
        labels
      );
      nextRow.resultRevision = (Number(nextRow.resultRevision) || 0) + 1;
      var snap = nextRow.resultSnapshot || nextRow.result;
      if (snap && snap.byHole) {
        var rm = migrateByHole(snap.byHole, mapping);
        var nextSnap = Object.assign({}, snap, {
          byHole: rm.byHole,
          staleByHole: Object.assign({}, snap.staleByHole || {}, rm.staleByHole),
          holeOrderRevisionInvalidated: true
        });
        if (nextRow.resultSnapshot) nextRow.resultSnapshot = nextSnap;
        if (nextRow.result) nextRow.result = nextSnap;
      }
      nextRow.revision = (Number(nextRow.revision) || 0) + 1;
      nextRow.updatedAt = Date.now();
      return nextRow;
    });
    if (!writeAllGames(nextGames)) throw new Error('games_write_failed');

    return {
      ok: true,
      rebuilt: true,
      matchId: matchId,
      entry: 'score',
      createdHoleOrder: labels.slice(),
      fullHoleOrder: labels.slice(),
      fullHoleOrderRevision: nextRev,
      previousRevision: prevRev,
      entries: entriesToWrite.slice()
    };
  } catch (err) {
    Object.keys(settingsSnaps).forEach(function (entry) {
      replaceSettings(matchId, entry, settingsSnaps[entry]);
    });
    writeAllGames(prevGames);
    return {
      ok: false,
      rebuilt: false,
      reason: 'rebuild_failed',
      message: '洞序同步失败',
      error: err && err.message ? err.message : String(err || '')
    };
  }
}

function syncAfterCourseHalfChange(opts) {
  var o = opts || {};
  if (!needsHoleOrderRebuild(o.before, o.after)) {
    return { ok: true, rebuilt: false, skipped: true };
  }
  var after = o.after || {};
  var labels = uniqueLabels(
    o.createdHoleOrder || buildHoleLabelsFromHalves(after.front9Course, after.back9Course)
  );
  if (!labels.length) {
    return { ok: false, reason: 'empty_hole_order', message: '洞序同步失败' };
  }
  return rebuildAllEntriesForMatch(
    Object.assign({}, o, {
      createdHoleOrder: labels
    })
  );
}

function resolveMatchId(ctx) {
  var c = ctx || {};
  return asStr(c.matchId || c.gameId || '');
}

module.exports = {
  SETTINGS_KEY: SETTINGS_KEY,
  GAMES_KEY: GAMES_KEY,
  buildHoleLabelsFromHalves: buildHoleLabelsFromHalves,
  signatureOf: signatureOf,
  needsHoleOrderRebuild: needsHoleOrderRebuild,
  buildHoleIdMap: buildHoleIdMap,
  mapHoleId: mapHoleId,
  migrateGameInstance: migrateGameInstance,
  rebuildMatchHoleOrder: rebuildMatchHoleOrder,
  rebuildAllEntriesForMatch: rebuildAllEntriesForMatch,
  syncAfterCourseHalfChange: syncAfterCourseHalfChange,
  resolveMatchId: resolveMatchId,
  getSettings: getSettings
};
