/**
 * 球队通知列表。点击进入对应申请或球队详情。
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
    pageState: 'loading',
    errorTitle: '',
    errorDesc: '',
    notices: []
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    bootstrap.ensureCloudIdentity().then(() => this.load());
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this.data.pageState === 'ready' || this.data.pageState === 'empty') this.load();
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
    this.setData({ pageState: 'loading' });
    teamClub.listTeamNotices().then((res) => {
      if (!res || !res.ok) {
        const err = pageErrors.fromResult(res);
        this.setData({ pageState: err.pageState, errorTitle: err.errorTitle, errorDesc: err.errorDesc, notices: [] });
        return;
      }
      const list = (res.list || []).slice().sort(function (a, b) {
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
      });
      this.setData({ notices: list, pageState: list.length ? 'ready' : 'empty' });
    });
  },

  onRetry() {
    this.load();
  },

  onTapNotice(e) {
    const idx = Number((e.currentTarget.dataset && e.currentTarget.dataset.index) || -1);
    const row = this.data.notices[idx];
    const url = teamClub.noticeOpenUrl(row);
    if (!url) {
      wx.showToast({ title: '该通知已失效', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: url,
      fail: () => wx.showToast({ title: '无法打开对应页面', icon: 'none' })
    });
  }
});
