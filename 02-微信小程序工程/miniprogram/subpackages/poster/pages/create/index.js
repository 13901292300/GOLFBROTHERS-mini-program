const { createHeaderStyle } = require('../../../../utils/headerEngine.js');

Page({
  data: {
    roundId: '',
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    headerTotalHeight: 0,
    posterContainerStyle: '',
    shareImagePath: '',
    showLeaveSheet: false,
    leaveBusy: false
  },

  onLoad(options) {
    const header = createHeaderStyle();
    const fromQuery = options && options.roundId ? String(options.roundId) : '';
    let fromGlobal = '';
    try {
      const app = getApp();
      if (app && app.globalData && app.globalData.currentGameId) {
        fromGlobal = String(app.globalData.currentGameId);
      }
    } catch (e) {
      /* ignore */
    }
    const headerTotalHeight = header.metrics.headerTotalHeight;
    let theme = 'bright';
    try {
      const app = getApp();
      if (app && typeof app.getTheme === 'function') theme = app.getTheme() || 'bright';
    } catch (e) {
      theme = 'bright';
    }
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight: headerTotalHeight,
      posterContainerStyle: 'padding-top:' + headerTotalHeight + 'px;',
      roundId: fromQuery || fromGlobal || '',
      themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode'
    });
  },

  onShow() {
    this.applyTheme();
  },

  applyTheme() {
    let theme = 'bright';
    try {
      const app = getApp();
      if (app && typeof app.getTheme === 'function') theme = app.getTheme() || 'bright';
    } catch (e) {
      theme = 'bright';
    }
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onHide() {},

  onUnload() {},

  onBackPress() {
    this.onBack();
    return true;
  },

  _posterComponent() {
    return this.selectComponent('#golfPoster');
  },

  _sessionPhase() {
    const poster = this._posterComponent();
    if (poster && typeof poster.getSessionPhase === 'function') {
      return poster.getSessionPhase();
    }
    return 'editing';
  },

  _leavePosterPage() {
    const poster = this._posterComponent();
    if (poster && typeof poster.leaveToScorePage === 'function') {
      poster.leaveToScorePage();
      return;
    }
    const roundId = String(this.data.roundId || '').trim();
    wx.navigateBack({
      fail() {
        if (!roundId) {
          wx.showToast({ title: '无法返回记分页', icon: 'none' });
          return;
        }
        const scoreUrl = '/subpackages/scoring/pages/score/index?gameId=' + encodeURIComponent(roundId);
        wx.reLaunch({
          url: scoreUrl,
          fail() {
            wx.redirectTo({
              url: scoreUrl,
              fail() {
                wx.showToast({ title: '无法返回记分页', icon: 'none' });
              }
            });
          }
        });
      }
    });
  },

  onBack() {
    if (this.data.leaveBusy || this.data.showLeaveSheet) return;
    const poster = this._posterComponent();
    const phase = this._sessionPhase();
    if (phase === 'leaving') return;
    if (phase === 'exporting') {
      wx.showToast({ title: '正在保存，请稍候', icon: 'none' });
      return;
    }
    if (phase === 'done_share') {
      if (poster && typeof poster.isAwaitingShareMenu === 'function' && poster.isAwaitingShareMenu()) {
        return;
      }
      if (poster && typeof poster.finishCompletedSession === 'function') {
        poster.finishCompletedSession();
      } else {
        this._leavePosterPage();
      }
      return;
    }

    const hasEdits = poster && typeof poster.hasEdits === 'function'
      ? poster.hasEdits()
      : false;

    if (!hasEdits) {
      this._leavePosterPage();
      return;
    }

    this.setData({ showLeaveSheet: true });
  },

  stopLeaveBubble() {},

  onLeaveContinue() {
    this.setData({ showLeaveSheet: false, leaveBusy: false });
  },

  onLeaveDiscard() {
    if (this.data.leaveBusy) return;
    const poster = this._posterComponent();
    if (poster && typeof poster.skipDraftWrite === 'function') {
      poster.skipDraftWrite();
    }
    this.setData({ showLeaveSheet: false });
    this._leavePosterPage();
  },

  async onLeaveSave() {
    if (this.data.leaveBusy) return;
    const poster = this._posterComponent();
    this.setData({ leaveBusy: true });
    wx.showLoading({ title: '正在保存草稿', mask: true });
    let ok = false;
    try {
      if (poster && typeof poster.saveDraft === 'function') {
        ok = await poster.saveDraft(this.data.roundId);
      }
    } catch (error) {
      ok = false;
    }
    wx.hideLoading();
    if (!ok) {
      this.setData({ leaveBusy: false });
      wx.showToast({ title: '草稿保存失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ showLeaveSheet: false, leaveBusy: false });
    this._leavePosterPage();
  },

  onPosterExport(event) {
    const path = event && event.detail && event.detail.tempFilePath;
    if (path) this.setData({ shareImagePath: path });
  },

  onPosterShare(event) {
    const detail = (event && event.detail) || {};
    const tempFilePath = detail.tempFilePath || '';
    if (tempFilePath) this.setData({ shareImagePath: tempFilePath });
  },

  onShareAppMessage() {
    if (this.data.shareImagePath) {
      return {
        title: '我的高尔夫成绩海报',
        imageUrl: this.data.shareImagePath,
        path: '/subpackages/poster/pages/create/index?roundId=' + (this.data.roundId || '')
      };
    }
    return {
      title: '高尔夫海报 - GOLFBROTHERS',
      path: '/subpackages/poster/pages/create/index'
    };
  }
});
