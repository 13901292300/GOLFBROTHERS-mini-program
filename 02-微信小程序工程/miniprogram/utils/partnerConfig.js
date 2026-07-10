/**
 * PARTNER 配置 — 创建页编辑 + 详情 TAB 底部展示
 */

const STORAGE_KEY = 'gb_match_partner_config_v1';
const MAX_PARTNER_LOGOS = 8;

/** COS 默认 PARTNER 图（HTTPS） */
const COS_PARTNER_BASE =
  'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com';

/**
 * COS 同名覆盖换图时，只改此版本号即可强制刷新缓存。
 * 例：20260710 → 20260711
 */
const PARTNER_ASSET_VERSION = '20260710';

/** 旧本地资源，加载失败时回退（暂不删除磁盘文件） */
const LOCAL_PARTNER_ASSETS = [
  '/assets/partners/partner-g-one-golf.png',
  '/assets/partners/partner-bentley.png',
  '/assets/partners/partner-vivata-1872.png',
  '/assets/partners/partner-ailiai-golf.png'
];

/**
 * 仅为 COS HTTPS 地址追加 ?v= / &v= 版本参数；本地路径原样返回。
 */
function withPartnerAssetVersion(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (s.indexOf('/assets/') === 0 || s.indexOf('assets/') === 0) return s;
  if (s.indexOf('https://') !== 0 && s.indexOf('http://') !== 0) return s;
  const sep = s.indexOf('?') >= 0 ? '&' : '?';
  return s + sep + 'v=' + PARTNER_ASSET_VERSION;
}

function createDualLogo(bright, dark) {
  return {
    bright: String(bright || '').trim(),
    dark: String(dark || '').trim()
  };
}

const DEFAULT_PARTNER_LOGOS = [
  createDualLogo(
    withPartnerAssetVersion(COS_PARTNER_BASE + '/partner-01-bright.jpg'),
    withPartnerAssetVersion(COS_PARTNER_BASE + '/partner-01-dark.jpg')
  ),
  createDualLogo(
    withPartnerAssetVersion(COS_PARTNER_BASE + '/partner-02-bright.jpg'),
    withPartnerAssetVersion(COS_PARTNER_BASE + '/partner-02-dark.jpg')
  ),
  createDualLogo(
    withPartnerAssetVersion(COS_PARTNER_BASE + '/partner-03-bright.jpg'),
    withPartnerAssetVersion(COS_PARTNER_BASE + '/partner-03-dark.jpg')
  ),
  createDualLogo(
    withPartnerAssetVersion(COS_PARTNER_BASE + '/partner-04-bright.jpg'),
    withPartnerAssetVersion(COS_PARTNER_BASE + '/partner-04-dark.jpg')
  )
];

/** COS URL → 对应本地 fallback（bright/dark 同槽位共用一张旧本地图） */
const PARTNER_LOGO_FALLBACK_BY_URL = (function buildFallbackMap() {
  const map = {};
  DEFAULT_PARTNER_LOGOS.forEach((logo, i) => {
    const local = LOCAL_PARTNER_ASSETS[i] || '';
    if (!local) return;
    if (logo.bright) map[logo.bright] = local;
    if (logo.dark) map[logo.dark] = local;
    // 无版本号的裸 COS URL 也可命中（兼容旧缓存）
    const baseBright = String(logo.bright || '').split('?')[0];
    const baseDark = String(logo.dark || '').split('?')[0];
    if (baseBright) map[baseBright] = local;
    if (baseDark) map[baseDark] = local;
  });
  return map;
})();

/**
 * 云图加载失败时，回退到旧本地路径；已是本地路径则原样返回。
 */
function getPartnerLogoLocalFallback(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  if (s.indexOf('/assets/partners/') === 0 || s.indexOf('assets/partners/') === 0) {
    return s.charAt(0) === '/' ? s : '/' + s;
  }
  if (PARTNER_LOGO_FALLBACK_BY_URL[s]) return PARTNER_LOGO_FALLBACK_BY_URL[s];
  const base = s.split('?')[0];
  return PARTNER_LOGO_FALLBACK_BY_URL[base] || '';
}

function buildPartnerTitle(teamName) {
  const name = String(teamName || '').trim();
  // 未选球队：占位默认；已选：【球队名】 Partners
  return name ? name + ' Partners' : '球队 Partners';
}

/**
 * 判断 PARTNER 标题是否仍为「随球队自动生成」的默认值（含历史默认文案）
 * 用于选队/换队时决定是否自动覆盖；用户手改后返回 false
 */
function isDefaultPartnerTitle(title, teamName) {
  const t = String(title || '').trim();
  if (!t) return true;
  const name = String(teamName || '').trim();
  // 当前规则默认值
  if (t === buildPartnerTitle(name)) return true;
  if (t === buildPartnerTitle('')) return true;
  // 历史默认：GOLFBROTHERS PARTNER(S) / 单数 Partner
  if (t === 'GOLFBROTHERS PARTNER' || t === 'GOLFBROTHERS PARTNERS') return true;
  if (t === '球队 Partner') return true;
  if (name && t === name + ' Partner') return true;
  return false;
}

function normalizePartnerConfig(config, teamName) {
  const c = config || {};
  const title = String(c.partnerTitle != null ? c.partnerTitle : '').trim();
  const logos = Array.isArray(c.partnerLogos)
    ? c.partnerLogos
      .map((item) => {
        if (typeof item === 'string') {
          // 兼容旧数据：字符串 logo 视作 bright/dark 同图
          const url = String(item || '').trim();
          return url ? createDualLogo(url, url) : null;
        }
        if (item && typeof item === 'object') {
          const bright = String(item.bright != null ? item.bright : '').trim();
          const dark = String(item.dark != null ? item.dark : '').trim();
          // 兼容旧结构：对象里只有 logo/image
          const legacy = String(item.logo != null ? item.logo : (item.image != null ? item.image : '')).trim();
          const normalizedBright = bright || legacy;
          const normalizedDark = dark || legacy;
          if (!normalizedBright && !normalizedDark) return null;
          return createDualLogo(normalizedBright, normalizedDark);
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, MAX_PARTNER_LOGOS)
    : DEFAULT_PARTNER_LOGOS.slice();
  return {
    partnerTitle: title || buildPartnerTitle(teamName),
    partnerLogos: logos.length ? logos : DEFAULT_PARTNER_LOGOS.slice()
  };
}

function createDefaultPartnerConfig(teamName) {
  return {
    partnerTitle: buildPartnerTitle(teamName),
    partnerLogos: DEFAULT_PARTNER_LOGOS.slice()
  };
}

function buildPartnerLogoRows(urls) {
  const app = getApp && getApp();
  const theme = app && typeof app.getTheme === 'function' ? app.getTheme() : 'bright';
  const list = (Array.isArray(urls) ? urls : [])
    .map((item) => {
      if (typeof item === 'string') return String(item || '').trim();
      if (!item || typeof item !== 'object') return '';
      const bright = String(item.bright || '').trim();
      const dark = String(item.dark || '').trim();
      // 兼容要求：bright 缺失用 dark；dark 缺失用 bright
      return theme === 'dark' ? (dark || bright) : (bright || dark);
    })
    .filter(Boolean);
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    const left = list[i];
    const right = list[i + 1] || '';
    // 始终两列：右侧无图时留空占位，不做 single 居中
    rows.push({
      left: { url: left },
      right: { url: right }
    });
  }
  return rows;
}

function savePartnerConfig(config, teamName) {
  const normalized = normalizePartnerConfig(config, teamName);
  wx.setStorageSync(STORAGE_KEY, {
    teamName: String(teamName || '').trim(),
    partnerConfig: normalized
  });
  return normalized;
}

function loadPartnerConfig(fallbackTeamName) {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY);
    if (saved && saved.partnerConfig) {
      return normalizePartnerConfig(saved.partnerConfig, saved.teamName || fallbackTeamName);
    }
  } catch (e) {
    /* ignore */
  }
  return normalizePartnerConfig(null, fallbackTeamName);
}

module.exports = {
  STORAGE_KEY,
  MAX_PARTNER_LOGOS,
  COS_PARTNER_BASE,
  PARTNER_ASSET_VERSION,
  LOCAL_PARTNER_ASSETS,
  DEFAULT_PARTNER_LOGOS,
  buildPartnerTitle,
  isDefaultPartnerTitle,
  createDefaultPartnerConfig,
  normalizePartnerConfig,
  buildPartnerLogoRows,
  getPartnerLogoLocalFallback,
  withPartnerAssetVersion,
  savePartnerConfig,
  loadPartnerConfig
};
