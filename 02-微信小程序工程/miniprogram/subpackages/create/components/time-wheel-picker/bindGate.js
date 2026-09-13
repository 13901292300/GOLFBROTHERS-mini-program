/**
 * time-wheel-picker 挂载门闩：先写入绑定下标，再创建 picker-view。
 * 用「控件是否已按绑定值挂载」区分初始化与用户选择，不根据全零事件猜测。
 */

function toIndex4(raw) {
  var src = Array.isArray(raw) ? raw : [];
  function one(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return [one(src[0]), one(src[1]), one(src[2]), one(src[3])];
}

function sameIndex4(a, b) {
  var x = toIndex4(a);
  var y = toIndex4(b);
  return x[0] === y[0] && x[1] === y[1] && x[2] === y[2] && x[3] === y[3];
}

function mountPatch(boundValue) {
  return {
    innerValue: toIndex4(boundValue),
    pickerReady: true
  };
}

function closePatch() {
  return { pickerReady: false };
}

function shouldForwardPickerChange(pickerReady) {
  return pickerReady === true;
}

module.exports = {
  toIndex4: toIndex4,
  sameIndex4: sameIndex4,
  mountPatch: mountPatch,
  closePatch: closePatch,
  shouldForwardPickerChange: shouldForwardPickerChange
};
