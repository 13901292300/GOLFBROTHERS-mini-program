// app.js
const THEME_KEY = 'gb-theme';
const { envList } = require('./envList.js');
const networkStatus = require('./utils/networkStatus.js');
const offlineScoringRecovery = require('./utils/offlineScoringRecovery.js');

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
    theme: 'bright',
    networkConnected: true,
    networkType: 'unknown',
    networkStatusKnown: false
  },
  _networkEpoch: 0,

  onLaunch: function () {
    var self = this;
    this.globalData.theme = this.getTheme();
    this._bindScoreSyncNetworkListener();
    this._probeInitialNetworkType();

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
            self._tryFlushScoreSync();
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
      self._scheduleAvatarLocalCopy();
    }
  },


  onShow: function () {
    this._tryFlushScoreSync();
  },

  _scheduleAvatarLocalCopy: function () {
    var run = function () {
      try {
        require('./utils/userProfileStore.js').ensureAvatarLocalCopy();
      } catch (eCopy) {
        /* ignore */
      }
    };
    try {
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(run);
        return;
      }
    } catch (eTick) {
      /* ignore */
    }
    setTimeout(run, 0);
  },

  _applyNetworkState: function (state) {
    networkStatus.applyToGlobalAndPublish(this.globalData, state);
    try {
      offlineScoringRecovery.handleNetworkState(networkStatus.readFromGlobal(this.globalData));
    } catch (eOff) {
      /* ignore */
    }
  },

  _probeInitialNetworkType: function () {
    if (typeof wx === 'undefined' || typeof wx.getNetworkType !== 'function') return;
    var self = this;
    var probeEpoch = self._networkEpoch || 0;
    try {
      wx.getNetworkType({
        success: function (res) {
          try {
            if ((self._networkEpoch || 0) !== probeEpoch) return;
            self._applyNetworkState(networkStatus.fromGetNetworkType(res));
          } catch (eApply) {
            /* ignore */
          }
        },
        fail: function () {
          /* 保持默认 connected / unknown，不挡启动 */
        }
      });
    } catch (e) {
      /* ignore */
    }
  },

  _bindScoreSyncNetworkListener: function () {
    if (this._scoreSyncNetworkBound) return;
    if (typeof wx === 'undefined' || typeof wx.onNetworkStatusChange !== 'function') return;
    var self = this;
    wx.onNetworkStatusChange(function (res) {
      self._networkEpoch = (self._networkEpoch || 0) + 1;
      var state = networkStatus.fromStatusChange(res);
      self._applyNetworkState(state);
      if (res && res.isConnected === true) {
        self._tryFlushScoreSync();
      }
    });
    this._scoreSyncNetworkBound = true;
  },

  _tryFlushScoreSync: function () {
    try {
      var p = require('./utils/teamClub/scoreSync.js').flush();
      if (this.globalData && this.globalData.networkConnected !== false) {
        try {
          offlineScoringRecovery.followFlush(p);
        } catch (eFollow) {
          /* ignore */
        }
      }
      if (p && typeof p.then === 'function') {
        p.then(
          function () {},
          function (err) {
            console.warn('score sync retry failed', err);
          }
        );
      }
    } catch (e) {
      try {
        console.warn('score sync retry failed', e);
      } catch (e2) {
        /* ignore */
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
