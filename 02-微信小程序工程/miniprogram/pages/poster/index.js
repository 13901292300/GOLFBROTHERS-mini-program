const { createHeaderStyle } = require('../../utils/headerEngine.js');

Page({
  data: {
    roundId: '',
    headerRootStyle: '',
    headerBarStyle: '',
    headerTotalHeight: 0,
    posterContainerStyle: '',
    shareImagePath: ''
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
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight: headerTotalHeight,
      posterContainerStyle: 'padding-top:' + headerTotalHeight + 'px;',
      roundId: fromQuery || fromGlobal || ''
    });
  },

  onHide() {
    this._savePosterDraft();
  },

  onUnload() {
    this._savePosterDraft();
  },

  _posterComponent() {
    return this.selectComponent('#golfPoster');
  },

  _savePosterDraft() {
    const poster = this._posterComponent();
    if (poster && typeof poster.saveDraft === 'function') {
      poster.saveDraft();
    }
  },

  _leavePosterPage() {
    wx.navigateBack({
      fail() {
        wx.reLaunch({ url: '/pages/home/index' });
      }
    });
  },

  onBack() {
    const poster = this._posterComponent();
    const hasEdits = poster && typeof poster.hasEdits === 'function'
      ? poster.hasEdits()
      : false;

    if (!hasEdits) {
      this._leavePosterPage();
      return;
    }

    wx.showModal({
      title: '提示',
      content: '是否保存当前海报草稿？',
      confirmText: '保存',
      cancelText: '不保存',
      success: (res) => {
        if (res.confirm) {
          if (poster && typeof poster.saveDraft === 'function') poster.saveDraft();
        } else if (poster && typeof poster.clearDraft === 'function') {
          poster.clearDraft();
        }
        this._leavePosterPage();
      }
    });
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
        path: '/pages/poster/index?roundId=' + (this.data.roundId || '')
      };
    }
    return {
      title: '高尔夫海报 - GOLFBROTHERS',
      path: '/pages/poster/index'
    };
  }
});
