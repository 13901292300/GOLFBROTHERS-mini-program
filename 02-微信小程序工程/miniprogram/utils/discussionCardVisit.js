/**
 * GAME 卡片成功进入后记录围观访问。
 * 只应由卡片入口在导航已确认成功时 recordVisit。
 * 页面 onShow / 组件刷新 / Hub 内进组记分 不得调用。
 */

var discussionMessageStore = require('./discussionMessageStore.js');
var discussionVisitStore = require('./discussionVisitStore.js');
var playerLiveDisplay = require('./playerLiveDisplay.js');

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function parseQuery(url) {
  var out = {};
  var u = String(url || '');
  var i = u.indexOf('?');
  if (i < 0) return out;
  u.slice(i + 1).split('&').forEach(function (kv) {
    var pair = kv.split('=');
    if (!pair[0]) return;
    var k = pair[0];
    var val = pair[1] || '';
    try {
      k = decodeURIComponent(k);
      val = decodeURIComponent(val);
    } catch (e) {
      /* keep raw */
    }
    out[k] = val;
  });
  return out;
}

function parseScopeFromUrl(url) {
  var u = String(url || '');
  var path = u.split('?')[0];
  var q = parseQuery(u);
  if (path.indexOf('series-detail') >= 0) {
    return { seriesId: q.seriesId || '' };
  }
  if (path.indexOf('tournament/pages/detail') >= 0) {
    return { matchId: q.matchId || '' };
  }
  if (
    path.indexOf('scoring/pages/hub') >= 0 ||
    path.indexOf('pages/game/hub') >= 0
  ) {
    return { gameId: q.gameId || '' };
  }
  if (path.indexOf('scoring/pages/score') >= 0) {
    return { matchId: q.matchId || '', gameId: q.gameId || '' };
  }
  return {};
}

function resolveVisitActor() {
  var uid = '';
  try {
    uid = playerLiveDisplay.currentAccountUserId();
  } catch (e) {
    uid = 'me';
  }
  uid = _trim(uid) || 'me';
  var live = { name: '', avatar: '', gender: '' };
  try {
    live = playerLiveDisplay.applyLiveDisplayToView({
      userId: uid,
      playerUserId: uid
    });
  } catch (e2) {
    /* ignore */
  }
  return playerLiveDisplay.stampCurrentAccountOnWrite({
    userId: uid,
    playerUserId: uid,
    name: live.name || '我',
    nickname: live.name || '我',
    avatar: live.avatar || '',
    gender: live.gender || '',
    identityKind: uid === 'me' ? 'local_me' : 'account'
  });
}

function _toast(title) {
  if (!title) return;
  try {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: String(title), icon: 'none' });
    }
  } catch (e) {
    /* ignore */
  }
}

/**
 * 准备进入：解析 roomKey，不写 storage。
 */
function beginCardEnter(scopeInput) {
  var key = discussionMessageStore.resolveRoomKey(scopeInput || {});
  if (!key) {
    return { key: '', previous: null, recorded: false, result: { ok: true, skipped: true } };
  }
  return {
    key: key,
    previous: null,
    recorded: false,
    result: { ok: true, pending: true }
  };
}

function beginCardEnterFromUrl(url) {
  return beginCardEnter(parseScopeFromUrl(url));
}

function beginCardEnterFromMatchState() {
  var ms = {};
  try {
    ms = require('./matchState.js').getMatchState() || {};
  } catch (e) {
    ms = {};
  }
  return beginCardEnter({
    matchId: ms.matchId || '',
    gameId: ms.gameId || ''
  });
}

/**
 * 显式业务回滚。导航 fail 时 begin 尚未写入，此处为空操作。
 * 不用整房间 previous 快照覆盖，避免并发成功进入被失败路径抹掉。
 */
function rollbackCardEnter(handle) {
  if (!handle) return;
  handle.recorded = false;
}

/**
 * 正式确认进入：此时才 recordVisit。同一 handle 只写一次。
 */
function confirmCardEnter(handle) {
  if (!handle || !handle.key) {
    return (handle && handle.result) || { ok: true, skipped: true };
  }
  if (handle.recorded) {
    return handle.result;
  }
  var result = discussionVisitStore.recordVisit(handle.key, resolveVisitActor());
  handle.result = result;
  handle.recorded = !!(result && result.ok);
  if (result && result.ok === false && result.error) _toast(result.error);
  return result;
}

function listWatchersForDisplay(roomKey) {
  var list = discussionVisitStore.listWatchers(roomKey);
  try {
    return playerLiveDisplay.mergeSelfWatcher(list, {});
  } catch (e) {
    return list;
  }
}

function hydrateWatchersPatch(roomKey, extra) {
  var meta = discussionVisitStore.sharedMeta();
  var patch = {
    watchers: listWatchersForDisplay(roomKey),
    allWatchers: listWatchersForDisplay(roomKey),
    watchersSharedHint: meta.hint,
    watchersSharedReady: false
  };
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function (k) {
      patch[k] = extra[k];
    });
  }
  return patch;
}

function wrapNavigateTo(url, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var handle = beginCardEnterFromUrl(url);
  var prevFail = opts.fail;
  var prevSuccess = opts.success;
  wx.navigateTo({
    url: url,
    success: function (res) {
      confirmCardEnter(handle);
      if (typeof prevSuccess === 'function') prevSuccess(res);
    },
    fail: function (err) {
      if (typeof prevFail === 'function') prevFail(err);
    },
    complete: opts.complete
  });
  return handle;
}

module.exports = {
  parseScopeFromUrl: parseScopeFromUrl,
  resolveVisitActor: resolveVisitActor,
  beginCardEnter: beginCardEnter,
  beginCardEnterFromUrl: beginCardEnterFromUrl,
  beginCardEnterFromMatchState: beginCardEnterFromMatchState,
  rollbackCardEnter: rollbackCardEnter,
  confirmCardEnter: confirmCardEnter,
  listWatchersForDisplay: listWatchersForDisplay,
  hydrateWatchersPatch: hydrateWatchersPatch,
  wrapNavigateTo: wrapNavigateTo,
  SHARED_BLOCKER: discussionVisitStore.SHARED_BLOCKER
};
