/**
 * 我的球友圈：强制 feedType=mine。
 * 仅保留旧兼容：?feed=all → 公共入口 moments/index。
 * 其它 feed / feedType 参数一律忽略，不改变内容范围。
 */
const {
  createMomentFeedPage,
  FEED_TYPES
} = require('../_shared/createMomentFeedPage.js');

const pageOptions = createMomentFeedPage({
  feedType: FEED_TYPES.MINE,
  pageTitle: '我的球友圈',
  emptyHint: '请在记分页「更多功能 → 发布到球友圈」发布',
  allowAnonymousView: false
});

const _origOnLoad = pageOptions.onLoad;
pageOptions.onLoad = function (options) {
  const feed = options && options.feed;
  // 仅兼容旧公共入口参数 feed=all；feedType=all 不作为扩展入口
  if (feed === 'all' || feed === FEED_TYPES.ALL) {
    wx.redirectTo({
      url: '/subpackages/player/pages/moments/index',
      fail: function () {
        wx.navigateTo({
          url: '/subpackages/player/pages/moments/index',
          fail: function () {
            wx.showToast({ title: '无法打开球友圈', icon: 'none' });
          }
        });
      }
    });
    return;
  }
  if (typeof _origOnLoad === 'function') {
    _origOnLoad.call(this, options || {});
  }
};

Page(pageOptions);
