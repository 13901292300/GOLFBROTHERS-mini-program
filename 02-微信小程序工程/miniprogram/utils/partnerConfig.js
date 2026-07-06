/**
 * PARTNER 配置 — 创建页编辑 + 详情 TAB 底部展示
 */

const STORAGE_KEY = 'gb_match_partner_config_v1';
const MAX_PARTNER_LOGOS = 8;

const DEFAULT_PARTNER_LOGOS = [
  '/assets/partners/partner-g-one-golf.png',
  '/assets/partners/partner-bentley.png',
  '/assets/partners/partner-vivata-1872.png',
  '/assets/partners/partner-ailiai-golf.png'
];

function buildPartnerTitle(teamName) {
  const name = String(teamName || '').trim();
  return name ? name + ' Partner' : 'GOLFBROTHERS PARTNER';
}

function normalizePartnerConfig(config, teamName) {
  const c = config || {};
  const title = String(c.partnerTitle != null ? c.partnerTitle : '').trim();
  const logos = Array.isArray(c.partnerLogos)
    ? c.partnerLogos.map((item) => String(item || '').trim()).filter(Boolean).slice(0, MAX_PARTNER_LOGOS)
    : DEFAULT_PARTNER_LOGOS.slice();
  return {
    partnerTitle: title || buildPartnerTitle(teamName),
    partnerLogos: logos
  };
}

function createDefaultPartnerConfig(teamName) {
  return {
    partnerTitle: buildPartnerTitle(teamName),
    partnerLogos: DEFAULT_PARTNER_LOGOS.slice()
  };
}

function buildPartnerLogoRows(urls) {
  const list = (Array.isArray(urls) ? urls : []).filter(Boolean);
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
