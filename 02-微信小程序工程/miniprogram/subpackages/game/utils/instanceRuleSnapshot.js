/**
 * 游戏实例 ruleSnapshot 所有权。
 * 新建：可用规则库模板初始化。
 * 已有实例：以自身 snapshot 为准，不因规则库后来变化而静默覆盖。
 */
var rec = require("./sideGameRecord.js");

function clonePlay(raw) {
  return rec.jsonClone(rec.unwrapGameplaySnapshot(raw || {}));
}

function snapshotForConfigLoad(input) {
  input = input || {};
  if (input.existingGame) {
    return clonePlay(input.existingGame.ruleSnapshot);
  }
  return clonePlay(input.libraryRule || input.nameFallbackRule || {});
}

function libraryRevisionChanged(prev, next) {
  if (prev == null || prev === "") return false;
  if (next == null || next === "") return false;
  return Number(prev) !== Number(next);
}

function shouldApplyLibrarySnapshotOnShow(input) {
  input = input || {};
  if (input.pageDirty) return false;
  if (!input.libraryRule) return false;
  if (!input.hasExistingInstance) return true;
  return input.libraryRevisionChanged === true;
}

function nextEditorSnapshotOnShow(input) {
  input = input || {};
  if (!shouldApplyLibrarySnapshotOnShow(input)) {
    return clonePlay(input.currentSnapshot);
  }
  return clonePlay(input.libraryRule);
}

function ownedHistoricPlay(instanceSnap, rowSnap) {
  var inst = rec.unwrapGameplaySnapshot(instanceSnap || {});
  if (inst && typeof inst === "object" && Object.keys(inst).length) return inst;
  return rec.unwrapGameplaySnapshot(rowSnap || {});
}

module.exports = {
  snapshotForConfigLoad: snapshotForConfigLoad,
  libraryRevisionChanged: libraryRevisionChanged,
  shouldApplyLibrarySnapshotOnShow: shouldApplyLibrarySnapshotOnShow,
  nextEditorSnapshotOnShow: nextEditorSnapshotOnShow,
  ownedHistoricPlay: ownedHistoricPlay
};
