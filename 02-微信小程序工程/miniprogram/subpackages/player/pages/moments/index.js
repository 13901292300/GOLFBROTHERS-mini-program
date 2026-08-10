/**
 * 公共球友圈入口：强制 feedType=all。
 * 忽略 URL 上的 feed / feedType（不可覆盖为 mine / featured / friends）。
 */
const {
  createMomentFeedPage,
  FEED_TYPES
} = require('../_shared/createMomentFeedPage.js');

Page(
  createMomentFeedPage({
    feedType: FEED_TYPES.ALL,
    pageTitle: '球友圈',
    emptyHint: '还没有公开动态',
    allowAnonymousView: true
  })
);
