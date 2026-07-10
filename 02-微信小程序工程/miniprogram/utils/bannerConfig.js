/**
 * 默认 BANNER — 首页 / 赛事详情（与 PARTNERS、广告图独立）
 */

const COS_BANNER_BASE =
  'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com';

/**
 * COS 同名覆盖换图时，只改此版本号即可强制刷新缓存。
 * 例：20260710 → 20260711
 */
const BANNER_ASSET_VERSION = '20260710';

/**
 * 仅为 COS HTTPS 地址追加 ?v= / &v=；本地路径原样返回。
 */
function withBannerAssetVersion(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (s.indexOf('/assets/') === 0 || s.indexOf('assets/') === 0) return s;
  if (s.indexOf('https://') !== 0 && s.indexOf('http://') !== 0) return s;
  const sep = s.indexOf('?') >= 0 ? '&' : '?';
  return s + sep + 'v=' + BANNER_ASSET_VERSION;
}

/** 默认 BANNER（COS HTTPS + 版本号）；无 BRIGHT/DARK 区分 */
const DEFAULT_BANNERS = {
  home: withBannerAssetVersion(COS_BANNER_BASE + '/home-banner.jpg'),
  matchDetail: withBannerAssetVersion(COS_BANNER_BASE + '/match-detail-banner.jpg')
};

/**
 * 远程 fallback：首页沿用旧 CDN；详情页此前无默认图，仅回退空串。
 */
const BANNER_FALLBACKS = {
  home: 'https://cdn.screenshottocode.com/eMlt4raQ2b_sRTivrb5v4.jpg',
  matchDetail: ''
};

function getHomeBanner() {
  return DEFAULT_BANNERS.home;
}

function getMatchDetailBanner() {
  return DEFAULT_BANNERS.matchDetail;
}

/**
 * 赛事详情：自定义 banner 优先，否则默认 matchDetail。
 */
function resolveMatchDetailBanner(customBanner) {
  const custom = String(customBanner || '').trim();
  return custom || DEFAULT_BANNERS.matchDetail;
}

function getBannerLocalFallback(src, which) {
  const s = String(src || '').trim();
  const key = which === 'matchDetail' ? 'matchDetail' : 'home';
  const fallback = BANNER_FALLBACKS[key] || '';
  if (!s) return fallback;
  if (fallback && s === fallback) return fallback;
  // COS 默认图（含版本号）失败时回退
  const baseDefault = String(DEFAULT_BANNERS[key] || '').split('?')[0];
  const baseSrc = s.split('?')[0];
  if (baseSrc === baseDefault || s === DEFAULT_BANNERS[key]) {
    return fallback;
  }
  return '';
}

module.exports = {
  COS_BANNER_BASE,
  BANNER_ASSET_VERSION,
  DEFAULT_BANNERS,
  BANNER_FALLBACKS,
  withBannerAssetVersion,
  getHomeBanner,
  getMatchDetailBanner,
  resolveMatchDetailBanner,
  getBannerLocalFallback
};
