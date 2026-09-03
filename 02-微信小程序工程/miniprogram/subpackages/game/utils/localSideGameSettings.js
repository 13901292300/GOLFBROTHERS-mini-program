/**
 * 本机全局设置（公开范围/捐锅/洞序/大风吹）。仅此文件读写 gb_side_game_settings_v1。
 */
var rec = require('./sideGameRecord.js');

var STORAGE_KEY = 'gb_side_game_settings_v1';

var EMPTY = {
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

function createLocalSideGameSettings(deps) {
  var storage = (deps && deps.storage) || wxStorageAdapter();

  function readMap() {
    var raw = storage.getItem(STORAGE_KEY);
    if (raw && raw.__fail) return {};
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  function writeMap(map) {
    return !!storage.setItem(STORAGE_KEY, rec.jsonClone(map || {}));
  }

  function keyOf(matchId, entry) {
    return rec.asString(matchId) + '::' + rec.asString(entry || 'score');
  }

  function get(matchId, entry) {
    var map = readMap();
    var hit = map[keyOf(matchId, entry)] || {};
    var vis = rec.asString(hit.privacy);
    if (vis !== 'public' && vis !== 'event' && vis !== 'group') vis = 'public';
    return Object.assign({}, EMPTY, hit, { privacy: vis });
  }

  function set(matchId, entry, patch) {
    var map = readMap();
    var k = keyOf(matchId, entry);
    var next = Object.assign({}, get(matchId, entry), patch || {});
    var vis = rec.asString(next.privacy);
    if (vis !== 'public' && vis !== 'event' && vis !== 'group') next.privacy = 'public';
    map[k] = next;
    writeMap(map);
    return rec.jsonClone(next);
  }

  function replace(matchId, entry, value) {
    var map = readMap();
    var prev = rec.jsonClone(map);
    var k = keyOf(matchId, entry);
    var next = Object.assign({}, EMPTY, value || {});
    var vis = rec.asString(next.privacy);
    if (vis !== 'public' && vis !== 'event' && vis !== 'group') next.privacy = 'public';
    map[k] = next;
    if (!writeMap(map)) {
      writeMap(prev);
      return false;
    }
    return true;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    get: get,
    set: set,
    replace: replace
  };
}

var defaults = createLocalSideGameSettings();

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  EMPTY: EMPTY,
  createLocalSideGameSettings: createLocalSideGameSettings,
  getDefault: function () {
    return defaults;
  }
};
