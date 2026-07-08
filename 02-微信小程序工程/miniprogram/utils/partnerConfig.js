/**
 * PARTNER 配置 — 创建页编辑 + 详情 TAB 底部展示
 */

const STORAGE_KEY = 'gb_match_partner_config_v1';
const MAX_PARTNER_LOGOS = 8;

function createDualLogo(bright, dark) {
  return {
    bright: String(bright || '').trim(),
    dark: String(dark || '').trim()
  };
}

const DEFAULT_PARTNER_LOGOS = [
  createDualLogo('/assets/partners/partner-g-one-golf.png', '/assets/partners/partner-g-one-golf.png'),
  createDualLogo('/assets/partners/partner-bentley.png', '/assets/partners/partner-bentley.png'),
  createDualLogo('/assets/partners/partner-vivata-1872.png', '/assets/partners/partner-vivata-1872.png'),
  createDualLogo('/assets/partners/partner-ailiai-golf.png', '/assets/partners/partner-ailiai-golf.png')
];

function buildPartnerTitle(teamName) {
  const name = String(teamName || '').trim();
  return name ? name + ' Partner' : 'GOLFBROTHERS PARTNER';
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
    const right = list[i + 1];
    if (right) {
      rows.push({ single: false, left: { url: left }, right: { url: right } });
    } else {
      rows.push({ single: true, left: { url: left } });
    }
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
  DEFAULT_PARTNER_LOGOS,
  buildPartnerTitle,
  createDefaultPartnerConfig,
  normalizePartnerConfig,
  buildPartnerLogoRows,
  savePartnerConfig,
  loadPartnerConfig
};
