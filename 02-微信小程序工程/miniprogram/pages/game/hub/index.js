/**
 * 兼容旧路径 / 扫码页 pages/game/hub。
 * 实际页面已迁到记分分包，避免主包继续打入完整 Hub。
 */
function queryString(options) {
  const o = options || {};
  const parts = [];
  Object.keys(o).forEach(function (key) {
    const val = o[key];
    if (val == null || val === '') return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(val)));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

Page({
  onLoad(options) {
    const url =
      '/subpackages/scoring/pages/hub/index' + queryString(options);
    wx.redirectTo({
      url,
      fail() {
        wx.reLaunch({ url });
      }
    });
  }
});
