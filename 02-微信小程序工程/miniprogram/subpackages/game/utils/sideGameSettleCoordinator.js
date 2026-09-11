/**
 * 记分页官方成绩变化后的唯一 side-game settlement 入口。
 * 只编排已有 settleGame，不改各游戏算法。
 */
var proj = require('./rankMarkProjection.js');
var repository = require('./sideGameRepository.js');

var settleCalls = 0;
var inFlight = false;

function asString(v) {
  return v == null ? '' : String(v);
}

function settleSideGamesForScoreMutation(official) {
  if (inFlight) {
    return { ok: true, skipped: 'reentrant', settleCalls: settleCalls };
  }
  var query = {
    matchId: asString(official && official.matchId),
    groupId: asString(official && official.groupId)
  };
  if (!query.matchId) {
    return { ok: false, skipped: 'no-match', keptOfficialScores: true, settleCalls: settleCalls };
  }
  inFlight = true;
  try {
    var listed = repository.listByMatchId({
      matchId: query.matchId,
      groupId: query.groupId,
      includeDeleted: false
    });
    var matched =
      listed && listed.ok && listed.data && Array.isArray(listed.data.items) ? listed.data.items : [];
    if (!matched.length) {
      return { ok: true, skipped: 'no-games', settleCalls: settleCalls, gameCount: 0 };
    }
    for (var i = 0; i < matched.length; i++) {
      var row = matched[i];
      var expected = Number(row && row.revision) || 0;
      proj.refreshGameResults(row, official || {});
      var saved = repository.update(row.sideGameId, expected, {
        resultSnapshot: row.resultSnapshot,
        resultRevision: row.resultRevision
      });
      if (!saved || !saved.ok) {
        return {
          ok: false,
          error: (saved && saved.reason) || 'storage_write_failed',
          keptOfficialScores: true,
          settleCalls: settleCalls
        };
      }
    }
    settleCalls += 1;
    return {
      ok: true,
      settleCalls: settleCalls,
      gameCount: matched.length
    };
  } catch (e) {
    try {
      console.log('[side-game-settle] failed', String((e && e.message) || e));
    } catch (logErr) {}
    return {
      ok: false,
      error: String((e && e.message) || e || 'settle-failed'),
      keptOfficialScores: true,
      settleCalls: settleCalls
    };
  } finally {
    inFlight = false;
  }
}

function getSettleCallCount() {
  return settleCalls;
}

function resetSettleCallCount() {
  settleCalls = 0;
}

module.exports = {
  settleSideGamesForScoreMutation: settleSideGamesForScoreMutation,
  getSettleCallCount: getSettleCallCount,
  resetSettleCallCount: resetSettleCallCount
};
