/**
 * 微信运行时识别（叶子模块，无业务 require）。
 * 优先新 API getDeviceInfo / getAppBaseInfo，再回退 getSystemInfoSync。
 * 不读 userAgent。
 */

function _platformOf(info) {
  if (!info || typeof info !== 'object') return '';
  return String(info.platform || '').trim().toLowerCase();
}

function isWxDevtoolsRuntime() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getDeviceInfo === 'function') {
      const platform = _platformOf(wx.getDeviceInfo());
      if (platform) return platform === 'devtools';
    }
  } catch (e) {
    /* ignore */
  }
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAppBaseInfo === 'function') {
      const platform = _platformOf(wx.getAppBaseInfo());
      if (platform) return platform === 'devtools';
    }
  } catch (e2) {
    /* ignore */
  }
  try {
    if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
      const platform = _platformOf(wx.getSystemInfoSync());
      if (platform) return platform === 'devtools';
    }
  } catch (e3) {
    /* ignore */
  }
  return false;
}

function resolveImageRuntime(explicit) {
  const raw = explicit == null ? '' : String(explicit).trim().toLowerCase();
  if (raw === 'devtools' || raw === 'device') return raw;
  return isWxDevtoolsRuntime() ? 'devtools' : 'device';
}

module.exports = {
  isWxDevtoolsRuntime,
  resolveImageRuntime
};
