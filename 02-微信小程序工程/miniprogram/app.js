// app.js
const THEME_KEY = 'gb-theme';
const { envList } = require('./envList.js');

function normalizeTheme(theme) {
  return theme === 'dark' ? 'dark' : 'bright';
}

/** 解析云环境 ID：globalData.env → envList[0]；空串不传给 init（避免 INVALID_ENV） */
function resolveCloudEnvId(configuredEnv) {
  const fromApp = configuredEnv != null ? String(configuredEnv).trim() : '';
  if (fromApp) return fromApp;
  const list = Array.isArray(envList) ? envList : [];
  if (!list.length) return '';
  const first = list[0];
  if (typeof first === 'string') return String(first).trim();
  if (first && typeof first === 'object') {
    return String(first.envId || first.env || first.id || '').trim();
  }
  return '';
}

App({
  globalData: {
    // env 参数说明：
    // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
    // 此处请填入环境 ID, 环境 ID 可在微信开发者工具右上顶部工具栏点击云开发按钮打开获取
    // 也可写入 envList.js（与云开发 quickstart 一致）；勿传空字符串给 wx.cloud.init
    env: "cloud1-d5gluh1ode0ef8738",
    // 全局唯一主题状态：'bright' | 'dark'（仅首页可写）
    theme: 'bright'
  },

  onLaunch: function () {
    this.globalData.theme = this.getTheme();

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      const envId = resolveCloudEnvId(this.globalData.env) || "cloud1-d5gluh1ode0ef8738";
      this.globalData.env = envId;
      wx.cloud.init({
        env: envId,
        traceUser: true
      });
      try {
        const bootstrap = require('./utils/teamClub/bootstrap.js');
        bootstrap.ensureCloudIdentity().then(function (ident) {
          if (!ident || !ident.ok) return;
          try {
            require('./utils/teamClub/matchSync.js').flush();
            require('./utils/teamClub/scoreSync.js').flush();
          } catch (eSync) {
            /* ignore */
          }
          try {
            require('./utils/teamClub/matchRefSync.js').flush();
          } catch (e2) {
            /* ignore */
          }
        });
      } catch (e) {
        /* 云身份失败由球队页展示，不在启动时静默回落本地仓储 */
      }
    }
  },

  // 读取全局主题（带持久化兜底）
  getTheme: function () {
    try {
      return normalizeTheme(wx.getStorageSync(THEME_KEY));
    } catch (e) {
      return 'bright';
    }
  },

  // 写入全局主题（唯一写入口，仅首页调用）
  setTheme: function (theme) {
    theme = normalizeTheme(theme);
    this.globalData.theme = theme;
    try {
      wx.setStorageSync(THEME_KEY, theme);
    } catch (e) {}
    return theme;
  }
});
