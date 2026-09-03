/**
 * 游戏设置页 dirty 快照：只比较真实配置终态（不含账本 / UI 折叠态）。
 */
var draftMod = require('./sideGameDraft.js');
var rec = require('./sideGameRecord.js');

function asIdList(arr) {
  return (arr || []).map(function (x) {
    return String(x);
  });
}

function asLabelList(arr) {
  return (arr || []).map(function (x) {
    return String(x);
  });
}

/**
 * 标准化业务快照：globalSettings + games。
 * pot/wind 选中项仅保留仍存在的游戏 id，避免删游后残留假 dirty。
 */
function setupBusiness() {
  var raw = draftMod.getSetupDraftRaw() || {};
  var games = rec.jsonClone(raw.games || []);
  var liveIds = {};
  games.forEach(function (g) {
    if (g && g.id != null) liveIds[String(g.id)] = true;
  });
  var g = raw.globalSettings || {};
  return {
    globalSettings: {
      privacy: g.privacy || 'public',
      wind: g.wind || 'off',
      potMode: g.potMode || 'none',
      potN: g.potN == null || g.potN === '' ? '1' : String(g.potN),
      potM: g.potM == null ? '' : String(g.potM),
      potAllM: g.potAllM == null ? '' : String(g.potAllM),
      potS: g.potS == null ? '' : String(g.potS),
      potGameIds: asIdList(g.potGameIds).filter(function (id) {
        return !!liveIds[id];
      }),
      windGameIds: asIdList(g.windGameIds).filter(function (id) {
        return !!liveIds[id];
      }),
      holeOrder: asLabelList(g.holeOrder || g.fullHoleOrder),
      fullHoleOrder: asLabelList(g.fullHoleOrder || g.holeOrder),
      createdHoleOrder: asLabelList(g.createdHoleOrder)
    },
    games: games
  };
}

function hasActualChanges(initialCapture, currentBusiness, deepEqual) {
  if (typeof deepEqual !== 'function') return false;
  return !deepEqual(initialCapture, currentBusiness);
}

module.exports = {
  setupBusiness: setupBusiness,
  hasActualChanges: hasActualChanges
};
