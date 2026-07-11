/**
 * 赛事广告位默认图 — 与 PARTNERS 配置独立
 */

const COS_SPONSOR_BASE =
  'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com';

/**
 * COS 同名覆盖换图时，只改此版本号即可强制刷新缓存。
 * 例：20260710 → 20260711
 */
const EVENT_SPONSOR_ASSET_VERSION = '20260710';

/**
 * 仅为 COS HTTPS 地址追加 ?v= / &v=；本地路径原样返回。
 */
function withEventSponsorAssetVersion(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (s.indexOf('/assets/') === 0 || s.indexOf('assets/') === 0) return s;
  if (s.indexOf('https://') !== 0 && s.indexOf('http://') !== 0) return s;
  const sep = s.indexOf('?') >= 0 ? '&' : '?';
  return s + sep + 'v=' + EVENT_SPONSOR_ASSET_VERSION;
}

/**
 * 默认 2 个广告位；bright/dark 为 COS HTTPS（带版本号）；
 * fallback* 为旧本地 partners 图，不加版本号。
 */
const DEFAULT_EVENT_SPONSOR_IMAGES = [
  {
    bright: withEventSponsorAssetVersion(COS_SPONSOR_BASE + '/sponsor-01-bright.jpg'),
    dark: withEventSponsorAssetVersion(COS_SPONSOR_BASE + '/sponsor-01-dark.jpg'),
    fallbackBright: '/assets/partners/partner-g-one-golf.png',
    fallbackDark: '/assets/partners/partner-g-one-golf.png'
  },
  {
    bright: withEventSponsorAssetVersion(COS_SPONSOR_BASE + '/sponsor-02-bright.jpg'),
    dark: withEventSponsorAssetVersion(COS_SPONSOR_BASE + '/sponsor-02-dark.jpg'),
    fallbackBright: '/assets/partners/partner-vivata-1872.png',
    fallbackDark: '/assets/partners/partner-vivata-1872.png'
  }
];

/** COS URL（含/不含版本号）→ 本地 fallback */
const EVENT_SPONSOR_FALLBACK_BY_URL = (function buildMap() {
  const map = {};
  DEFAULT_EVENT_SPONSOR_IMAGES.forEach((item) => {
    const fbBright = item.fallbackBright || '';
    const fbDark = item.fallbackDark || item.fallbackBright || '';
    if (item.bright && fbBright) {
      map[item.bright] = fbBright;
      map[String(item.bright).split('?')[0]] = fbBright;
    }
    if (item.dark && fbDark) {
      map[item.dark] = fbDark;
      map[String(item.dark).split('?')[0]] = fbDark;
    }
  });
  return map;
})();

function getEventSponsorLocalFallback(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  if (s.indexOf('/assets/') === 0 || s.indexOf('assets/') === 0) {
    return s.charAt(0) === '/' ? s : '/' + s;
  }
  if (EVENT_SPONSOR_FALLBACK_BY_URL[s]) return EVENT_SPONSOR_FALLBACK_BY_URL[s];
  return EVENT_SPONSOR_FALLBACK_BY_URL[s.split('?')[0]] || '';
}

/** 取第 n 个默认广告位（0-based），供创建页写入 brightImage/darkImage */
function getDefaultEventSponsorSlot(index) {
  const item = DEFAULT_EVENT_SPONSOR_IMAGES[index];
  if (!item) {
    return { bright: '', dark: '', fallbackBright: '', fallbackDark: '' };
  }
  return {
    bright: item.bright,
    dark: item.dark,
    fallbackBright: item.fallbackBright || '',
    fallbackDark: item.fallbackDark || item.fallbackBright || ''
  };
}

module.exports = {
  COS_SPONSOR_BASE,
  EVENT_SPONSOR_ASSET_VERSION,
  DEFAULT_EVENT_SPONSOR_IMAGES,
  withEventSponsorAssetVersion,
  getEventSponsorLocalFallback,
  getDefaultEventSponsorSlot,
  /** 领先榜逐洞面板下方广告：广告图片1，按主题取 BRIGHT / DARK */
  resolveScorecardAdImageByTheme: function resolveScorecardAdImageByTheme(theme) {
    const slot = getDefaultEventSponsorSlot(0);
    const dark = theme === 'dark';
    return dark ? (slot.dark || slot.bright || '') : (slot.bright || slot.dark || '');
  }
};
