/**
 * 长按后微信会补发一次 tap。只消费这一次合成点击，随后立即复位。
 */
var SKIP_TAP_MS = 280;

function createSkipTapGuard(clock, windowMs) {
  var armedUntil = 0;
  var now =
    typeof clock === 'function'
      ? clock
      : function () {
          return Date.now();
        };
  var win = windowMs == null ? SKIP_TAP_MS : Number(windowMs) || SKIP_TAP_MS;
  return {
    arm: function () {
      armedUntil = now() + win;
    },
    consume: function () {
      var t = now();
      if (!(armedUntil > t)) {
        armedUntil = 0;
        return false;
      }
      armedUntil = 0;
      return true;
    }
  };
}

module.exports = {
  SKIP_TAP_MS: SKIP_TAP_MS,
  createSkipTapGuard: createSkipTapGuard
};
