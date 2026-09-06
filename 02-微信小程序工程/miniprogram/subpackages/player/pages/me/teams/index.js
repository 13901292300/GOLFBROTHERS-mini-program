/**
 * 我的球队 — 当前用户已加入球队列表
 * 数据来自 teamClub/service（统一球队仓储）
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const teamClub = require('../../../../../utils/teamClub/service.js');

const bootstrap = require('../../../../../utils/teamClub/bootstrap.js');
const pageErrors = require('../../../../../utils/teamClub/pageErrors.js');
const profileOnboard = require('../../../../../utils/teamClub/profileOnboard.js');

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    pageState: 'loading',
    errorTitle: '',
    errorDesc: '',
    actionKind: '',
    actionLabel: '',
    showCreate: false,
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
            actionKind: err.actionKind || '',
            actionLabel: err.actionLabel || '',
            showCreate: false,
            teams: []
          });
          return;
        }
        const teams = res.list || [];
        this.setData({
          teams: teams,
          pageState: teams.length ? 'ready' : 'empty',
          actionKind: '',
          actionLabel: '',
          showCreate: true
        });
      })
      .catch(() => {
        this.setData({
          pageState: 'error',
          errorTitle: '加载失败',
          errorDesc: '请检查网络后重试。',
          actionKind: 'retry',
          actionLabel: '重试',
          showCreate: false,
          teams: []
        });
      })
      .then(() => {
        profileOnboard.endLock();
      });
  },

  onRetry() {
    this.loadTeams();
  },

  onLogoError(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim();
    const teams = (this.data.teams || []).map((t) => {
      if (String(t.id) !== id || t.logoBroken) return t;
      return Object.assign({}, t, { logoBroken: true });
    });
    this.setData({ teams: teams });
  },

  onCompleteProfile() {
    if (profileOnboard.isBusy()) {
      wx.showToast({ title: '正在处理，请稍候', icon: 'none' });
      return;
    }
    if (!profileOnboard.beginLock()) {
      wx.showToast({ title: '正在处理，请稍候', icon: 'none' });
      return;
    }
    if (profileOnboard.hasCompleteLocalProfile()) {
      const draft = profileOnboard.readLocalDraft();
      wx.showModal({
        title: '使用当前资料？',
        content: '将使用昵称「' + draft.displayName + '」和已保存头像完成建档。',
        confirmText: '确认使用',
        cancelText: '去修改',
        success: (res) => {
          if (res.confirm) {
            this._submitExistingProfile();
            return;
          }
          profileOnboard.endLock();
          wx.navigateTo({
            url: profileOnboard.editProfileUrl(),
            fail: () => wx.showToast({ title: '无法打开资料页', icon: 'none' })
          });
        },
        fail: () => profileOnboard.endLock()
      });
      return;
    }
    profileOnboard.endLock();
    wx.navigateTo({
      url: profileOnboard.editProfileUrl(),
      fail: () => wx.showToast({ title: '无法打开资料页', icon: 'none' })
    });
  },

  _submitExistingProfile() {
    wx.showLoading({ title: '建档中…', mask: true });
    profileOnboard
      .submitFromLocal({ alreadyLocked: true, keepLockOnSuccess: true })
      .then((res) => {
        wx.hideLoading();
        if (!res || !res.ok) {
          profileOnboard.endLock();
          wx.showToast({ title: (res && res.message) || '建档失败', icon: 'none' });
          return;
        }
        return this.loadTeams();
      })
      .then(function () {
        profileOnboard.endLock();
      })
      .catch(() => {
        profileOnboard.endLock();
        wx.hideLoading();
        wx.showToast({ title: '建档失败，请稍后重试', icon: 'none' });
      });
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
    if (!this.data.showCreate) return;
    wx.navigateTo({
      url: teamClub.buildCreateTeamUrl(),
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  }
});
