function currentPages() {
  try {
    return getCurrentPages() || [];
  } catch (e) {
    return [];
  }
}

function navigateBackSafe(delta) {
  var pages = currentPages();
  var maxDelta = Math.max(1, pages.length - 1);
  var next = Math.min(Math.max(1, Number(delta) || 1), maxDelta);
  wx.navigateBack({
    delta: next,
    fail: function () {
      wx.navigateBack({ delta: 1 });
    }
  });
}

module.exports = {
  navigateBackSafe: navigateBackSafe
};
