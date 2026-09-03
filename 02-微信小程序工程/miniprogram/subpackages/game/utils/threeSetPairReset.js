/**
 * 三局参与主体集合比较与 PK 重建策略（纯函数，供 config 与自测共用）。
 * 仅比较稳定 ID，不比较头像/展示昵称。
 */
function stableSubjectId(item) {
  if (!item) return "";
  return String(item.subjectId || item.partyId || item.playerId || item.id || "");
}

function selectedSubjectIds(players) {
  return (players || [])
    .filter(function (item) {
      return item && !!item.selected;
    })
    .map(stableSubjectId)
    .filter(Boolean)
    .sort();
}

function sameSelectedSubjectSet(prevPlayers, nextPlayers) {
  var a = selectedSubjectIds(prevPlayers);
  var b = selectedSubjectIds(nextPlayers);
  if (a.length !== b.length) return false;
  var i;
  for (i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 参与主体集合未变 → 保留原 PK/勾选；集合变化 → 重建全部两两 PK 并默认全选。
 */
function resolveThreeSetPairAction(prevPlayers, nextPlayers) {
  if (sameSelectedSubjectSet(prevPlayers, nextPlayers)) {
    return { keepPairs: true, rebuild: false, forceAllOn: false };
  }
  return { keepPairs: false, rebuild: true, forceAllOn: true };
}

module.exports = {
  stableSubjectId: stableSubjectId,
  selectedSubjectIds: selectedSubjectIds,
  sameSelectedSubjectSet: sameSelectedSubjectSet,
  resolveThreeSetPairAction: resolveThreeSetPairAction
};
