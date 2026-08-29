const TARGET_URL = '/subpackages/player/pages/me/footprints/index';

function appendQuery(url, options) {
  const query = Object.keys(options || {})
    .filter((key) => options[key] !== undefined && options[key] !== null)
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(String(options[key])))
    .join('&');
  return query ? url + '?' + query : url;
}

Page({
  onLoad(options) {
    wx.redirectTo({
      url: appendQuery(TARGET_URL, options),
      fail() {
        wx.redirectTo({ url: '/pages/home/index' });
      }
    });
  }
});
