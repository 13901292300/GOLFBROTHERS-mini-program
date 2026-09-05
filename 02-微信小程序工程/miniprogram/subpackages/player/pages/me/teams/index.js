/**
 * 我的球队 — 当前用户已加入球队列表
 * 数据来自 teamClub/service（统一球队仓储）
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
    teams: []
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    bootstrap.ensureCloudIdentity().then(() => this.loadTeams());
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this.data.pageState !== 'loading') this.loadTeams();
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  loadTeams() {
    this.setData({ pageState: 'loading' });
    teamClub
      .listMyTeams()
      .then((res) => {
        if (!res || !res.ok) {
          const err = pageErrors.fromResult(res);
          this.setData({
            pageState: err.pageState,
            errorTitle: err.errorTitle,
            errorDesc: err.errorDesc,
            teams: []
          });
          return;
        }
        const teams = res.list || [];
        this.setData({
          teams: teams,
          pageState: teams.length ? 'ready' : 'empty'
        });
      })
      .catch(() => {
        this.setData({ pageState: 'error', teams: [] });
      });
  },

  onRetry() {
    this.loadTeams();
  },

  onTapTeam(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    if (!id) return;
    wx.navigateTo({
      url: teamClub.buildTeamDetailUrl(id),
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  },

  onCreateTeam() {
    wx.navigateTo({
      url: teamClub.buildCreateTeamUrl(),
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  }
});
