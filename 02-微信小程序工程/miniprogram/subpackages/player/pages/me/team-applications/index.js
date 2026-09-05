/**
 * 入队申请列表（管理员）。
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../utils/teamClub/service.js');
const bootstrap = require('../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../utils/teamClub/pageErrors.js');

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    teamId: '',
    pageState: 'loading',
    errorTitle: '',
    errorDesc: '',
    list: []
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this.setData({ teamId: options && options.teamId ? String(options.teamId).trim() : '' });
    bootstrap.ensureCloudIdentity().then(() => this.load());
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this.data.teamId && this.data.pageState !== 'loading') this.load();
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({ headerRootStyle: header.headerRootStyle, headerBarStyle: header.headerBarStyle });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  load() {
    const teamId = this.data.teamId;
    if (!teamId) {
      this.setData({ pageState: 'error', errorTitle: '缺少球队', errorDesc: '链接无效' });
      return;
    }
    this.setData({ pageState: 'loading' });
    teamClub.listJoinApplications(teamId, { status: 'pending' }).then((res) => {
      if (!res || !res.ok) {
        const err = pageErrors.fromResult(res);
        this.setData({ pageState: err.pageState, errorTitle: err.errorTitle, errorDesc: err.errorDesc, list: [] });
        return;
      }
      const list = res.list || [];
      this.setData({ list: list, pageState: list.length ? 'ready' : 'empty' });
    });
  },

  onRetry() {
    this.load();
  },

  onTap(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    if (!id) return;
    wx.navigateTo({
      url: teamClub.buildApplicationDetailUrl(id),
      fail: () => wx.showToast({ title: '无法打开申请', icon: 'none' })
    });
  }
});
