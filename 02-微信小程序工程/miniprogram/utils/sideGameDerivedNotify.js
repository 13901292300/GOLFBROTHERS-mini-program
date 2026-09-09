/**
 * 主包 ↔ 游戏分包：公共 host 结构保存成功后通知 ALL_GAMES replay。
 * 页面不要直接调 replay。
 */
var listeners = [];

function onAllGamesReplay(fn) {
  if (typeof fn === "function") listeners.push(fn);
}

function notifyAllGamesReplay(reason) {
  var why = reason == null ? "" : String(reason);
  listeners.forEach(function (fn) {
    try {
      fn(why);
    } catch (e) {}
  });
}

function swapListeners(next) {
  var prev = listeners.slice();
  listeners = Array.isArray(next) ? next.slice() : [];
  return prev;
}

module.exports = {
  onAllGamesReplay: onAllGamesReplay,
  notifyAllGamesReplay: notifyAllGamesReplay,
  swapListeners: swapListeners
};
